import {
  createFederation,
  generateCryptoKeyPair,
  MemoryKvStore,
} from "@fedify/fedify";
import {
  Accept,
  Create,
  Delete,
  Follow,
  Note,
  Organization,
  Person,
  Update,
} from "@fedify/vocab";
import { serve, type ServerType } from "@hono/node-server";
import { createServer } from "node:net";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { FeedUrl } from "../../src/domain/feed/feed-url.js";
import { Handle } from "../../src/domain/feed/handle.js";
import { createApp, type App } from "../../src/web/app.js";
import type { AppConfig } from "../../src/web/config.js";
import { unwrap } from "../helpers/result.js";
import { createTestDatabase, type TestDatabase } from "./helpers/database.js";
import {
  startFixtureFeedServer,
  type FixtureFeedServer,
} from "./helpers/fixture-feed-server.js";
import { atomFixture } from "./helpers/fixtures.js";

async function getFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const probe = createServer();
    probe.once("error", reject);
    probe.listen(0, "127.0.0.1", () => {
      const { port } = probe.address() as AddressInfo;
      probe.close(() => resolve(port));
    });
  });
}

async function waitFor(
  predicate: () => boolean,
  what: string,
  timeoutMs = 30_000,
): Promise<void> {
  const startedAt = Date.now();
  while (!predicate()) {
    if (Date.now() - startedAt > timeoutMs) {
      throw new Error(`timed out waiting for ${what}`);
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
}

type RemoteEvent =
  | { readonly kind: "accept" }
  | { readonly kind: "create"; readonly content: string }
  | { readonly kind: "update"; readonly objectId: string | null }
  | { readonly kind: "delete" };

let database: TestDatabase;
let fixtures: FixtureFeedServer;
let app: App;
let appServer: ServerType;
let remoteServer: ServerType;
let base: string;
let host: string;
let remoteBase: string;
const remoteEvents: RemoteEvent[] = [];
const remoteDocumentRequests = new Map<string, number>();
let remote: ReturnType<typeof createFederation<void>>;

async function fetchAp(url: string): Promise<Record<string, unknown>> {
  const response = await fetch(url, {
    headers: { accept: "application/activity+json" },
  });
  expect(response.status, `GET ${url}`).toBe(200);
  return (await response.json()) as Record<string, unknown>;
}

async function resolveItem(item: unknown): Promise<Record<string, unknown>> {
  if (typeof item === "string") return fetchAp(item);
  return item as Record<string, unknown>;
}

async function collectOutbox(handle: string): Promise<Record<string, unknown>[]> {
  const actor = await fetchAp(`${base}/ap/actor/${handle}`);
  const outboxUrl = actor["outbox"];
  if (typeof outboxUrl !== "string") throw new Error("actor has no outbox");
  const collection = await fetchAp(outboxUrl);
  const page = Array.isArray(collection["orderedItems"])
    ? collection
    : typeof collection["first"] === "string"
    ? await fetchAp(collection["first"])
    : collection;
  const items = page["orderedItems"] ?? page["items"];
  if (!Array.isArray(items)) return [];
  const activities = await Promise.all(items.map(resolveItem));
  return Promise.all(activities.map((activity) => resolveItem(activity["object"])));
}

function stringValues(value: unknown): string[] {
  if (typeof value === "string") return [value];
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === "string")
    : [];
}

function requestCount(path: string): number {
  return remoteDocumentRequests.get(path) ?? 0;
}

beforeAll(async () => {
  database = await createTestDatabase(inject("databaseUrl"), "remote_fed_e2e");
  fixtures = await startFixtureFeedServer();

  // ---- our application ----
  const appPort = await getFreePort();
  base = `http://127.0.0.1:${appPort}`;
  host = `127.0.0.1:${appPort}`;
  const config: AppConfig = {
    origin: base,
    host,
    port: appPort,
    databaseUrl: database.url,
    pollIntervalSeconds: 1,
    pollMaxBackoffSeconds: 60,
    schedulerTickMs: 3_600_000,
    noteMaxChars: 2000,
    teaserMaxChars: 200,
    behindProxy: false,
    // Both sides talk over 127.0.0.1, so the SSRF guard must stand down for
    // signature key fetches — this is exactly what the flag exists for.
    allowPrivateAddress: true,
    logLevel: "warning",
    logFormat: "console",
  };
  app = await createApp(config);
  appServer = serve({ fetch: app.fetch, port: appPort, hostname: "127.0.0.1" });

  // ---- a remote fediverse user ("alice"), raw Fedify ----
  const remotePort = await getFreePort();
  remoteBase = `http://127.0.0.1:${remotePort}`;
  const keyPair = await generateCryptoKeyPair("RSASSA-PKCS1-v1_5");
  remote = createFederation<void>({
    kv: new MemoryKvStore(),
    allowPrivateAddress: true,
  });
  remote
    .setActorDispatcher("/users/{identifier}", async (ctx, identifier) => {
      if (identifier === "editors") {
        return new Organization({
          id: ctx.getActorUri(identifier),
          preferredUsername: identifier,
        });
      }
      if (identifier !== "alice") return null;
      return new Person({
        id: ctx.getActorUri(identifier),
        preferredUsername: identifier,
        inbox: ctx.getInboxUri(identifier),
        publicKeys: (await ctx.getActorKeyPairs(identifier)).map(
          (pair) => pair.cryptographicKey,
        ),
      });
    })
    .setKeyPairsDispatcher(async (_ctx, identifier) =>
      identifier === "alice" ? [keyPair] : [],
    );
  remote
    .setInboxListeners("/users/{identifier}/inbox", "/inbox")
    .on(Accept, async () => {
      remoteEvents.push({ kind: "accept" });
    })
    .on(Create, async (_ctx, create) => {
      const object = await create.getObject();
      remoteEvents.push({
        kind: "create",
        content: object instanceof Note ? String(object.content ?? "") : "",
      });
    })
    .on(Update, async (_ctx, update) => {
      remoteEvents.push({
        kind: "update",
        objectId: update.objectId?.href ?? null,
      });
    })
    .on(Delete, async () => {
      remoteEvents.push({ kind: "delete" });
    });
  remoteServer = serve({
    fetch: async (request) => {
      const url = new URL(request.url);
      remoteDocumentRequests.set(url.pathname, requestCount(url.pathname) + 1);
      if (url.pathname === "/aliases/alice") {
        const document = await new Person({
          id: new URL(`${remoteBase}/users/alice`),
          preferredUsername: "alice",
        }).toJsonLd();
        return Response.json(document, {
          headers: { "content-type": "application/activity+json" },
        });
      }
      if (url.pathname === "/objects/not-an-actor") {
        const document = await new Note({
          id: new URL(`${remoteBase}/objects/not-an-actor`),
          content: "not an actor",
        }).toJsonLd();
        return Response.json(document, {
          headers: { "content-type": "application/activity+json" },
        });
      }
      if (url.pathname === "/missing") return new Response(null, { status: 404 });
      return remote.fetch(request, { contextData: undefined });
    },
    port: remotePort,
    hostname: "127.0.0.1",
  });
});

afterAll(async () => {
  appServer?.close();
  remoteServer?.close();
  await app?.shutdown();
  await fixtures?.close();
  await database?.close();
});

describe("signed federation round trip", () => {
  let feedHandle: string;
  let authoredObjectUrl: string;
  let authoredContent: unknown;
  let authoredTo: unknown;
  let authoredCc: unknown;

  it("registers a feed and publishes its backlog", async () => {
    fixtures.setFixture(
      "/signed/feed.xml",
      atomFixture({
        title: "Signed Blog",
        entries: [
          {
            id: "urn:signed:1",
            title: "First Post",
            summary: "<p>hello fediverse</p>",
            published: new Date("Wed, 01 Jul 2026 00:00:00 GMT").toISOString(),
          },
        ],
      }),
      { etag: 'W/"signed-v1"' },
    );
    const feedUrl = fixtures.url("/signed/feed.xml");
    feedHandle = Handle.fromFeedUrl(unwrap(FeedUrl.create(feedUrl)));

    const response = await fetch(`${base}/register`, {
      method: "POST",
      body: new URLSearchParams({ url: feedUrl }),
    });
    expect(response.status).toBe(200);
    await app.scheduler.tick();
  });

  it("accepts a signed Follow and the follower count becomes visible", async () => {
    const ctx = remote.createContext(new URL(remoteBase), undefined);
    await ctx.sendActivity(
      { identifier: "alice" },
      {
        id: new URL(`${base}/ap/actor/${feedHandle}`),
        inboxId: new URL(`${base}/ap/actor/${feedHandle}/inbox`),
      },
      new Follow({
        id: new URL(`${remoteBase}/follows/${crypto.randomUUID()}`),
        actor: ctx.getActorUri("alice"),
        object: new URL(`${base}/ap/actor/${feedHandle}`),
      }),
    );

    await waitFor(
      () => remoteEvents.some((event) => event.kind === "accept"),
      "signed Accept(Follow) from the feed actor",
    );

    const home = await fetch(base).then((r) => r.text());
    expect(home).toContain("1 follower");
  });

  it("publishes resolved Atom authors as metadata-only attribution", async () => {
    const candidatePaths = [
      "/users/alice",
      "/users/editors",
      "/objects/not-an-actor",
      "/missing",
      "/aliases/alice",
    ];
    const before = new Map(candidatePaths.map((path) => [path, requestCount(path)]));
    const sharedBody = "<p>same rendered body regardless of author metadata</p>";
    fixtures.setFixture(
      "/signed/feed.xml",
      atomFixture({
        title: "Signed Blog",
        entries: [
          {
            id: "urn:signed:2",
            link: "https://source.test/author-comparison",
            title: "Author Comparison",
            summary: sharedBody,
            authors: [
              { name: "Alice", uri: `${remoteBase}/users/alice` },
              { name: "Editors", uri: `${remoteBase}/users/editors` },
              { name: "Not an actor", uri: `${remoteBase}/objects/not-an-actor` },
              { name: "Missing", uri: `${remoteBase}/missing` },
              { name: "Alice alias", uri: `${remoteBase}/aliases/alice` },
            ],
            published: new Date("Thu, 02 Jul 2026 00:00:00 GMT").toISOString(),
          },
          {
            id: "urn:signed:plain-comparison",
            link: "https://source.test/author-comparison",
            title: "Author Comparison",
            summary: sharedBody,
            published: new Date("Thu, 02 Jul 2026 00:00:00 GMT").toISOString(),
          },
          {
            id: "urn:signed:1",
            title: "First Post",
            summary: "<p>hello fediverse</p>",
            published: new Date("Wed, 01 Jul 2026 00:00:00 GMT").toISOString(),
          },
        ],
      }),
      { etag: 'W/"signed-v2"' },
    );

    await new Promise((resolve) => setTimeout(resolve, 1500));
    await app.scheduler.tick();

    await waitFor(
      () =>
        remoteEvents.some(
          (event) =>
            event.kind === "create" &&
            event.content.includes("same rendered body regardless of author metadata"),
        ),
      "signed Create(Note) delivery to the follower",
    );

    const objects = await collectOutbox(feedHandle);
    const comparisons = objects.filter((object) =>
      typeof object["content"] === "string" &&
      object["content"].includes("same rendered body regardless of author metadata")
    );
    expect(comparisons).toHaveLength(2);
    const authored = comparisons.find((object) =>
      stringValues(object["attributedTo"]).length === 3
    );
    const plain = comparisons.find((object) =>
      stringValues(object["attributedTo"]).length === 1
    );
    expect(authored).toBeDefined();
    expect(plain).toBeDefined();
    if (authored === undefined || plain === undefined) {
      throw new Error("author comparison objects were not published");
    }
    const localActor = `${base}/ap/actor/${feedHandle}`;
    expect(stringValues(authored["attributedTo"])).toEqual([
      localActor,
      `${remoteBase}/users/alice`,
      `${remoteBase}/users/editors`,
    ]);
    expect(authored["content"]).toBe(plain["content"]);
    expect(stringValues(authored["tag"])).toEqual([]);
    expect(stringValues(authored["to"])).toEqual([
      "as:Public",
    ]);
    expect(stringValues(authored["cc"])).toEqual([
      `${localActor}/followers`,
    ]);
    for (const path of candidatePaths) {
      expect(requestCount(path) - (before.get(path) ?? 0), path).toBe(1);
    }

    const id = authored["id"];
    if (typeof id !== "string") throw new Error("authored object has no ID");
    authoredObjectUrl = id;
    authoredContent = authored["content"];
    authoredTo = authored["to"];
    authoredCc = authored["cc"];
  });

  it("sends an author-only Update for the same object", async () => {
    fixtures.setFixture(
      "/signed/feed.xml",
      atomFixture({
        title: "Signed Blog",
        entries: [
          {
            id: "urn:signed:2",
            link: "https://source.test/author-comparison",
            title: "Author Comparison",
            summary: "<p>same rendered body regardless of author metadata</p>",
            authors: [{ name: "Editors", uri: `${remoteBase}/users/editors` }],
            published: new Date("Thu, 02 Jul 2026 00:00:00 GMT").toISOString(),
          },
          {
            id: "urn:signed:plain-comparison",
            link: "https://source.test/author-comparison",
            title: "Author Comparison",
            summary: "<p>same rendered body regardless of author metadata</p>",
            published: new Date("Thu, 02 Jul 2026 00:00:00 GMT").toISOString(),
          },
          {
            id: "urn:signed:1",
            title: "First Post",
            summary: "<p>hello fediverse</p>",
            published: new Date("Wed, 01 Jul 2026 00:00:00 GMT").toISOString(),
          },
        ],
      }),
      { etag: 'W/"signed-v3"' },
    );
    const previousUpdates = remoteEvents.filter((event) => event.kind === "update").length;

    await new Promise((resolve) => setTimeout(resolve, 1500));
    await app.scheduler.tick();
    await waitFor(
      () => remoteEvents.filter((event) => event.kind === "update").length
        > previousUpdates,
      "signed author-only Update",
    );

    const update = remoteEvents.findLast((event) => event.kind === "update");
    expect(update?.kind === "update" ? update.objectId : null)
      .toBe(authoredObjectUrl);
    const object = await fetchAp(authoredObjectUrl);
    expect(stringValues(object["attributedTo"])).toEqual([
      `${base}/ap/actor/${feedHandle}`,
      `${remoteBase}/users/editors`,
    ]);
    expect(object["content"]).toBe(authoredContent);
    expect(object["to"]).toEqual(authoredTo);
    expect(object["cc"]).toEqual(authoredCc);
    expect(stringValues(object["tag"])).toEqual([]);
    // PollFeed invokes the resolver again (pinned by its unit test); Fedify's
    // own KV-backed document loader may satisfy a successful Actor document
    // without another HTTP request.
  });

  it("does not repeat lookup or Update for an unchanged entry", async () => {
    const updatesBefore = remoteEvents.filter((event) => event.kind === "update").length;
    const requestsBefore = new Map(remoteDocumentRequests);
    const current = fixtures.requests.filter((request) =>
      request.path === "/signed/feed.xml"
    ).length;
    // The representation is identical to signed-v3; only the transport ETag
    // changes so the application parses it again and proves the fingerprint is quiet.
    const lastBody = atomFixture({
      title: "Signed Blog",
      entries: [
        {
          id: "urn:signed:2",
          link: "https://source.test/author-comparison",
          title: "Author Comparison",
          summary: "<p>same rendered body regardless of author metadata</p>",
          authors: [{ name: "Editors", uri: `${remoteBase}/users/editors` }],
          published: new Date("Thu, 02 Jul 2026 00:00:00 GMT").toISOString(),
        },
        {
          id: "urn:signed:plain-comparison",
          link: "https://source.test/author-comparison",
          title: "Author Comparison",
          summary: "<p>same rendered body regardless of author metadata</p>",
          published: new Date("Thu, 02 Jul 2026 00:00:00 GMT").toISOString(),
        },
        {
          id: "urn:signed:1",
          title: "First Post",
          summary: "<p>hello fediverse</p>",
          published: new Date("Wed, 01 Jul 2026 00:00:00 GMT").toISOString(),
        },
      ],
    });
    fixtures.setFixture("/signed/feed.xml", lastBody, {
      etag: 'W/"signed-v4"',
    });

    await new Promise((resolve) => setTimeout(resolve, 1500));
    await app.scheduler.tick();

    expect(fixtures.requests.filter((request) =>
      request.path === "/signed/feed.xml"
    ).length).toBe(current + 1);
    expect(remoteEvents.filter((event) => event.kind === "update")).toHaveLength(
      updatesBefore,
    );
    expect(remoteDocumentRequests).toEqual(requestsBefore);
  });

  it("propagates a Delete when the feed is unregistered", async () => {
    const result = await app.unregisterFeed.execute(feedHandle);
    expect(result.ok).toBe(true);

    await waitFor(
      () => remoteEvents.some((event) => event.kind === "delete"),
      "signed Delete(actor) delivery to the follower",
    );

    const webfinger = await fetch(
      `${base}/.well-known/webfinger?resource=acct:${feedHandle}@${host}`,
    );
    expect(webfinger.status).toBe(404);
  });
});
