import {
  createFederation,
  generateCryptoKeyPair,
  MemoryKvStore,
} from "@fedify/fedify";
import { Follow, Person } from "@fedify/vocab";
import { serve, type ServerType } from "@hono/node-server";
import { createServer } from "node:net";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { FeedUrl } from "../../src/domain/feed/feed-url.js";
import type { ItemKey } from "../../src/domain/feed/feed-item.js";
import { Handle } from "../../src/domain/feed/handle.js";
import type { MessageUri } from "../../src/domain/ports/federation-gateway.js";
import type {
  StoredFederationObject,
  StoredFollower,
  StoredKeyPair,
} from "../../src/infrastructure/federation/model.js";
import { createDrizzleFederationRepository } from "../../src/infrastructure/persistence/drizzle-federation-repository.js";
import { createDrizzleFeedRepository } from "../../src/infrastructure/persistence/drizzle-feed-repository.js";
import { createDrizzleItemRepository } from "../../src/infrastructure/persistence/drizzle-item-repository.js";
import { createApp, type App } from "../../src/web/app.js";
import type { AppConfig } from "../../src/web/config.js";
import { makeFeed, T0 as now } from "../helpers/fakes.js";
import { unwrap } from "../helpers/result.js";
import { createTestDatabase, type TestDatabase } from "./helpers/database.js";
import {
  startFixtureFeedServer,
  type FixtureFeedServer,
} from "./helpers/fixture-feed-server.js";
import { atomFixture } from "./helpers/fixtures.js";

let database: TestDatabase;

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

async function closeServer(server: ServerType): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    server.close((error) => error === undefined ? resolve() : reject(error));
  });
}

async function fetchAp(url: string): Promise<Record<string, unknown>> {
  const response = await fetch(url, {
    headers: { accept: "application/activity+json" },
  });
  expect(response.status, `GET ${url}`).toBe(200);
  return (await response.json()) as Record<string, unknown>;
}

async function collectionItems(url: string): Promise<unknown[]> {
  const collection = await fetchAp(url);
  if (Array.isArray(collection["orderedItems"])) {
    return collection["orderedItems"];
  }
  const first = collection["first"];
  expect(typeof first).toBe("string");
  const page = await fetchAp(first as string);
  const items = page["orderedItems"] ?? page["items"];
  return Array.isArray(items) ? items : [];
}

async function waitForFollower(url: string): Promise<void> {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    const followers = await fetchAp(url);
    if (followers["totalItems"] === 1) return;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error("timed out waiting for persisted follower");
}

beforeAll(async () => {
  database = await createTestDatabase(inject("databaseUrl"), "repo_contract");
});

afterAll(async () => {
  await database.close();
});

describe("DrizzleFeedRepository", () => {
  it("saves, upserts, and finds by id, url, and handle", async () => {
    const feeds = createDrizzleFeedRepository(database.db);
    const feed = makeFeed({ url: "https://one.example/rss", title: "One" });
    await feeds.save(feed);

    expect(await feeds.findById(feed.id)).toEqual(feed);
    expect(await feeds.findByUrl(feed.url)).toEqual(feed);
    expect(await feeds.findByHandle(feed.handle)).toEqual(feed);
    expect(await feeds.findByUrl(unwrap(FeedUrl.create("https://none.example/x")))).toBeNull();

    const updated = {
      ...feed,
      description: "updated",
      validators: { etag: 'W/"v2"', lastModified: "Sat, 25 Jul 2026 00:00:00 GMT" },
      consecutiveFailures: 3,
      nextPollAt: new Date("2026-07-26T13:00:00.000Z"),
    };
    await feeds.save(updated);
    expect(await feeds.findById(feed.id)).toEqual(updated);
  });

  it("lists due feeds ordered by nextPollAt", async () => {
    const feeds = createDrizzleFeedRepository(database.db);
    const early = makeFeed({ url: "https://due-early.example/rss" });
    const late = makeFeed({ url: "https://due-late.example/rss" });
    const future = makeFeed({ url: "https://future.example/rss" });
    await feeds.save({ ...early, nextPollAt: new Date(now.getTime() - 120_000) });
    await feeds.save({ ...late, nextPollAt: new Date(now.getTime() - 60_000) });
    await feeds.save({ ...future, nextPollAt: new Date(now.getTime() + 60_000) });

    const due = await feeds.listDue(now);
    const ids = due.map((f) => f.id);
    expect(ids).toContain(early.id);
    expect(ids).toContain(late.id);
    expect(ids).not.toContain(future.id);
    expect(ids.indexOf(early.id)).toBeLessThan(ids.indexOf(late.id));
  });

  it("searches case-insensitively and escapes LIKE wildcards", async () => {
    const feeds = createDrizzleFeedRepository(database.db);
    const rust = makeFeed({ url: "https://rust-search.example/rss", title: "Rust Weekly" });
    const percent = makeFeed({ url: "https://percent.example/rss", title: "100% legit" });
    await feeds.save(rust);
    await feeds.save(percent);

    const byTitle = await feeds.search("rUsT wEek", 10);
    expect(byTitle.map((f) => f.id)).toEqual([rust.id]);

    const byUrl = await feeds.search("rust-search.example", 10);
    expect(byUrl.map((f) => f.id)).toEqual([rust.id]);

    // "%" must match literally, not as a wildcard.
    const literalPercent = await feeds.search("100%", 10);
    expect(literalPercent.map((f) => f.id)).toEqual([percent.id]);
    const wildcardAbuse = await feeds.search("100%bogus", 10);
    expect(wildcardAbuse).toEqual([]);
  });

  it("ranks popularity with a floor of zero followers", async () => {
    const feeds = createDrizzleFeedRepository(database.db);
    const a = makeFeed({ url: "https://pop-a.example/rss" });
    const b = makeFeed({ url: "https://pop-b.example/rss" });
    await feeds.save(a);
    await feeds.save(b);

    await feeds.adjustFollowerCount(a.id, 2);
    await feeds.adjustFollowerCount(b.id, 5);
    await feeds.adjustFollowerCount(a.id, -10);

    const popular = await feeds.listPopular(50);
    const entries = popular.filter((p) => [a.id, b.id].includes(p.feed.id));
    expect(entries[0]).toMatchObject({ followerCount: 5 });
    expect(entries.find((p) => p.feed.id === a.id)?.followerCount).toBe(0);
  });

  it("removes feeds and cascades their published items", async () => {
    const feeds = createDrizzleFeedRepository(database.db);
    const items = createDrizzleItemRepository(database.db);
    const doomed = makeFeed({ url: "https://doomed.example/rss" });
    await feeds.save(doomed);
    await items.markPublished(doomed.id, [
      {
        key: "guid:1" as ItemKey,
        publishedAt: now,
        contentFingerprint: "fp",
        messageUri: null,
      },
    ]);

    await feeds.remove(doomed.id);
    expect(await feeds.findById(doomed.id)).toBeNull();
    // Cascade means the key is new again if the feed were re-registered.
    const fresh = await items.findExisting(doomed.id, ["guid:1" as ItemKey]);
    expect(fresh).toEqual([]);
  });
});

describe("DrizzleItemRepository", () => {
  it("finds existing records and treats absent keys as new", async () => {
    const feeds = createDrizzleFeedRepository(database.db);
    const items = createDrizzleItemRepository(database.db);
    const feed = makeFeed({ url: "https://items.example/rss" });
    await feeds.save(feed);

    const keys = ["guid:a", "guid:b", "guid:c"] as ItemKey[];
    expect(await items.findExisting(feed.id, keys)).toEqual([]);

    await items.markPublished(feed.id, [
      {
        key: "guid:a" as ItemKey,
        publishedAt: now,
        contentFingerprint: "fp-a",
        messageUri: "urn:msg:a" as MessageUri,
      },
    ]);
    expect(await items.findExisting(feed.id, keys)).toEqual([
      {
        key: "guid:a",
        publishedAt: now,
        contentFingerprint: "fp-a",
        messageUri: "urn:msg:a",
      },
    ]);
    expect(await items.findExisting(feed.id, [])).toEqual([]);
  });

  it("marks idempotently and forgets a feed on removeAllOf", async () => {
    const feeds = createDrizzleFeedRepository(database.db);
    const items = createDrizzleItemRepository(database.db);
    const feed = makeFeed({ url: "https://items2.example/rss" });
    await feeds.save(feed);

    const record = {
      key: "guid:x" as ItemKey,
      publishedAt: now,
      contentFingerprint: "fp-x",
      messageUri: "urn:msg:x" as MessageUri,
    };
    await items.markPublished(feed.id, [record]);
    await items.markPublished(feed.id, [record]);
    expect(await items.findExisting(feed.id, [record.key])).toEqual([record]);

    await items.removeAllOf(feed.id);
    expect(await items.findExisting(feed.id, [record.key])).toEqual([]);
  });

  it("markUpdated changes only the content fingerprint", async () => {
    const feeds = createDrizzleFeedRepository(database.db);
    const items = createDrizzleItemRepository(database.db);
    const feed = makeFeed({ url: "https://items3.example/rss" });
    await feeds.save(feed);

    const record = {
      key: "guid:y" as ItemKey,
      publishedAt: now,
      contentFingerprint: "fp-old",
      messageUri: "urn:msg:y" as MessageUri,
    };
    await items.markPublished(feed.id, [record]);
    await items.markUpdated(feed.id, record.key, "fp-new");

    expect(await items.findExisting(feed.id, [record.key])).toEqual([
      { ...record, contentFingerprint: "fp-new" },
    ]);
  });
});

describe("DrizzleFederationRepository", () => {
  it("persists keys, followers, and objects across repository instances", async () => {
    const first = createDrizzleFederationRepository(database.db);
    const keyPairs: readonly StoredKeyPair[] = [
      {
        localHandle: "persistent_feed",
        algorithm: "RSASSA-PKCS1-v1_5",
        publicJwk: { kty: "RSA", n: "rsa-public", e: "AQAB" },
        privateJwk: { kty: "RSA", n: "rsa-public", e: "AQAB", d: "rsa-private" },
        createdAt: new Date("2026-08-30T00:00:00Z"),
      },
      {
        localHandle: "persistent_feed",
        algorithm: "Ed25519",
        publicJwk: { kty: "OKP", crv: "Ed25519", x: "ed-public" },
        privateJwk: { kty: "OKP", crv: "Ed25519", x: "ed-public", d: "ed-private" },
        createdAt: new Date("2026-08-30T00:00:00Z"),
      },
    ];
    const storedFollower: StoredFollower = {
      localHandle: "persistent_feed",
      actorUri: "https://remote.example/users/alice",
      inboxUri: "https://remote.example/users/alice/inbox",
      sharedInboxUri: "https://remote.example/inbox",
      followedAt: new Date("2026-08-30T01:00:00Z"),
    };
    const storedObject: StoredFederationObject = {
      id: "stable-object-id",
      actorHandle: "persistent_feed",
      kind: "article",
      contentHtml: "<p>First version</p>",
      name: "Persistent title",
      summaryHtml: "<p>Summary</p>",
      sourceUrl: "https://source.example/posts/1",
      language: "en",
      toUris: ["https://www.w3.org/ns/activitystreams#Public"],
      ccUris: ["https://local.example/ap/actor/persistent_feed/followers"],
      attributedToUris: ["https://local.example/ap/actor/persistent_feed"],
      mentions: [{
        name: "@alice@remote.example",
        href: "https://remote.example/users/alice",
      }],
      publishedAt: new Date("2026-08-30T02:00:00Z"),
      updatedAt: null,
    };

    expect(await first.saveKeyPairsIfAbsent(keyPairs)).toBe(true);
    expect(await first.saveKeyPairsIfAbsent(keyPairs)).toBe(false);
    expect(await first.addFollower(storedFollower)).toBe(true);
    expect(await first.addFollower(storedFollower)).toBe(false);
    await first.upsertObject(storedObject);
    await first.upsertObject({
      ...storedObject,
      contentHtml: "<p>Updated version</p>",
      updatedAt: new Date("2026-08-31T02:00:00Z"),
    });

    const restarted = createDrizzleFederationRepository(database.db);
    expect(await restarted.getKeyPairs("persistent_feed")).toEqual(keyPairs);
    expect(await restarted.countFollowers("persistent_feed")).toBe(1);
    expect((await restarted.listFollowers("persistent_feed", null, 20)).items)
      .toEqual([storedFollower]);
    expect(await restarted.findObject("persistent_feed", "stable-object-id"))
      .toEqual({
        ...storedObject,
        contentHtml: "<p>Updated version</p>",
        updatedAt: new Date("2026-08-31T02:00:00Z"),
      });
    expect(await restarted.countObjects("persistent_feed")).toBe(1);

    expect(await restarted.removeFollower(
      storedFollower.localHandle,
      storedFollower.actorUri,
    )).toBe(true);
    expect(await restarted.removeFollower(
      storedFollower.localHandle,
      storedFollower.actorUri,
    )).toBe(false);
  });
});

describe("application restart", () => {
  it("keeps actor keys, posts, followers, collections, and HTML pages", async () => {
    let fixtures: FixtureFeedServer | undefined;
    let firstApp: App | undefined;
    let secondApp: App | undefined;
    let appServer: ServerType | undefined;
    let remoteServer: ServerType | undefined;

    try {
      fixtures = await startFixtureFeedServer();
      fixtures.setFixture(
        "/restart/feed.xml",
        atomFixture({
          title: "Restart Blog",
          entries: [{
            id: "urn:restart:post",
            title: "Persistent Post",
            summary: "<p>survives a complete application restart</p>",
            published: "2026-08-30T00:00:00Z",
          }],
        }),
      );

      const appPort = await getFreePort();
      const base = `http://127.0.0.1:${appPort}`;
      const config: AppConfig = {
        origin: base,
        host: `127.0.0.1:${appPort}`,
        port: appPort,
        databaseUrl: database.url,
        pollIntervalSeconds: 60,
        pollMaxBackoffSeconds: 86_400,
        schedulerTickMs: 3_600_000,
        noteMaxChars: 2000,
        teaserMaxChars: 200,
        behindProxy: false,
        allowPrivateAddress: true,
        logLevel: "warning",
        logFormat: "console",
      };

      firstApp = await createApp(config);
      appServer = serve({
        fetch: firstApp.fetch,
        port: appPort,
        hostname: "127.0.0.1",
      });

      const feedUrl = fixtures.url("/restart/feed.xml");
      const handle = Handle.fromFeedUrl(unwrap(FeedUrl.create(feedUrl)));
      const registration = await fetch(`${base}/register`, {
        method: "POST",
        body: new URLSearchParams({ url: feedUrl }),
      });
      expect(registration.status).toBe(200);
      await firstApp.scheduler.tick();

      const actorUrl = `${base}/ap/actor/${handle}`;
      const firstActor = await fetchAp(actorUrl);
      const firstPublicKey = firstActor["publicKey"];
      expect(firstPublicKey).toMatchObject({
        id: `${actorUrl}#main-key`,
      });

      const remotePort = await getFreePort();
      const remoteBase = `http://127.0.0.1:${remotePort}`;
      const remoteKey = await generateCryptoKeyPair("RSASSA-PKCS1-v1_5");
      const remote = createFederation<void>({
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
          identifier === "alice" ? [remoteKey] : []
        );
      remote.setInboxListeners("/users/{identifier}/inbox", "/inbox");
      remoteServer = serve({
        fetch: (request) => remote.fetch(request, { contextData: undefined }),
        port: remotePort,
        hostname: "127.0.0.1",
      });

      const remoteContext = remote.createContext(new URL(remoteBase), undefined);
      await remoteContext.sendActivity(
        { identifier: "alice" },
        {
          id: new URL(actorUrl),
          inboxId: new URL(`${actorUrl}/inbox`),
        },
        new Follow({
          id: new URL(`${remoteBase}/follows/restart`),
          actor: remoteContext.getActorUri("alice"),
          object: new URL(actorUrl),
        }),
      );

      const followersUrl = firstActor["followers"];
      const outboxUrl = firstActor["outbox"];
      expect(typeof followersUrl).toBe("string");
      expect(typeof outboxUrl).toBe("string");
      await waitForFollower(followersUrl as string);

      const firstOutbox = await collectionItems(outboxUrl as string);
      expect(firstOutbox).toHaveLength(1);
      const firstActivity = typeof firstOutbox[0] === "string"
        ? await fetchAp(firstOutbox[0])
        : firstOutbox[0] as Record<string, unknown>;
      const firstObject = firstActivity["object"];
      const object = typeof firstObject === "string"
        ? await fetchAp(firstObject)
        : firstObject as Record<string, unknown>;
      expect(typeof object["id"]).toBe("string");
      const objectUrl = object["id"] as string;
      const objectId = objectUrl.slice(objectUrl.lastIndexOf("/") + 1);

      await closeServer(appServer);
      appServer = undefined;
      await firstApp.shutdown();
      firstApp = undefined;

      secondApp = await createApp(config);
      appServer = serve({
        fetch: secondApp.fetch,
        port: appPort,
        hostname: "127.0.0.1",
      });

      const restartedActor = await fetchAp(actorUrl);
      expect(restartedActor["publicKey"]).toEqual(firstPublicKey);
      expect(await fetchAp(objectUrl)).toMatchObject({
        id: objectUrl,
        type: "Note",
      });
      expect(await collectionItems(outboxUrl as string)).toHaveLength(1);
      expect(await fetchAp(followersUrl as string)).toMatchObject({
        totalItems: 1,
      });

      const page = await fetch(`${base}/@${handle}/${objectId}`, {
        headers: { accept: "text/html" },
      });
      expect(page.status).toBe(200);
      expect(await page.text()).toContain("Persistent Post");
    } finally {
      if (appServer !== undefined) await closeServer(appServer);
      if (remoteServer !== undefined) await closeServer(remoteServer);
      await firstApp?.shutdown();
      await secondApp?.shutdown();
      await fixtures?.close();
    }
  }, 60_000);
});
