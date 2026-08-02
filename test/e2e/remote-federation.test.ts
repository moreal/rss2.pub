import {
  createFederation,
  generateCryptoKeyPair,
  MemoryKvStore,
} from "@fedify/fedify";
import { Accept, Create, Delete, Follow, Note, Person } from "@fedify/vocab";
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
import { rssFixture } from "./helpers/fixtures.js";

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
let remote: ReturnType<typeof createFederation<void>>;

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
    .on(Delete, async () => {
      remoteEvents.push({ kind: "delete" });
    });
  remoteServer = serve({
    fetch: (request) => remote.fetch(request, { contextData: undefined }),
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

  it("registers a feed and publishes its backlog", async () => {
    fixtures.setFixture(
      "/signed/feed.xml",
      rssFixture({
        title: "Signed Blog",
        items: [
          {
            guid: "urn:signed:1",
            title: "First Post",
            description: "<p>hello fediverse</p>",
            pubDate: "Wed, 01 Jul 2026 00:00:00 GMT",
          },
        ],
      }),
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
    expect(home).toContain("1 followers");
  });

  it("delivers new items to the follower's inbox as signed Create activities", async () => {
    fixtures.setFixture(
      "/signed/feed.xml",
      rssFixture({
        title: "Signed Blog",
        items: [
          {
            guid: "urn:signed:2",
            title: "Second Post",
            description: "<p>delivered over http signatures</p>",
            pubDate: "Thu, 02 Jul 2026 00:00:00 GMT",
          },
          {
            guid: "urn:signed:1",
            title: "First Post",
            description: "<p>hello fediverse</p>",
            pubDate: "Wed, 01 Jul 2026 00:00:00 GMT",
          },
        ],
      }),
    );

    await new Promise((resolve) => setTimeout(resolve, 1500));
    await app.scheduler.tick();

    await waitFor(
      () =>
        remoteEvents.some(
          (event) =>
            event.kind === "create" &&
            event.content.includes("delivered over http signatures"),
        ),
      "signed Create(Note) delivery to the follower",
    );
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
