import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { FeedUrl } from "../../src/domain/feed/feed-url.js";
import type { ItemKey } from "../../src/domain/feed/feed-item.js";
import type { MessageUri } from "../../src/domain/ports/federation-gateway.js";
import { createDrizzleFeedRepository } from "../../src/infrastructure/persistence/drizzle-feed-repository.js";
import { createDrizzleItemRepository } from "../../src/infrastructure/persistence/drizzle-item-repository.js";
import { makeFeed, T0 as now } from "../helpers/fakes.js";
import { unwrap } from "../helpers/result.js";
import { createTestDatabase, type TestDatabase } from "./helpers/database.js";

let database: TestDatabase;

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
