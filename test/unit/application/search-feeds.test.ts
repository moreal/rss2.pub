import { describe, expect, it } from "vitest";
import {
  createListPopularFeeds,
  createSearchFeeds,
} from "../../../src/application/search-feeds.js";
import { Feed, FeedTitle } from "../../../src/domain/feed/feed.js";
import { FeedUrl } from "../../../src/domain/feed/feed-url.js";
import { Handle } from "../../../src/domain/feed/handle.js";
import { createInMemoryFeedRepository } from "../../../src/infrastructure/persistence/in-memory-feed-repository.js";
import { unwrap, unwrapErr } from "../../helpers/result.js";

const now = new Date("2026-07-26T12:00:00Z");

function makeFeed(rawUrl: string, title: string | null, description: string | null) {
  const url = unwrap(FeedUrl.create(rawUrl));
  return Feed.register({
    url,
    handle: Handle.fromFeedUrl(url),
    title: title === null ? null : unwrap(FeedTitle.create(title)),
    description,
    now,
  });
}

async function seed() {
  const feeds = createInMemoryFeedRepository();
  const rust = makeFeed("https://rust.blog/rss", "Rust Blog", "systems programming");
  const cooking = makeFeed("https://cook.example/rss", "Daily Cooking", "recipes and food");
  const untitled = makeFeed("https://misc.example/rss", null, null);
  await feeds.save(rust);
  await feeds.save(cooking);
  await feeds.save(untitled);
  return { feeds, rust, cooking, untitled };
}

describe("SearchFeeds", () => {
  it("rejects blank queries", async () => {
    const { feeds } = await seed();
    const searchFeeds = createSearchFeeds({ feeds });
    expect(unwrapErr(await searchFeeds.execute("   "))).toEqual({
      type: "EmptyQuery",
    });
  });

  it("matches case-insensitively across title, description, handle, and URL", async () => {
    const { feeds, rust, cooking } = await seed();
    const searchFeeds = createSearchFeeds({ feeds });

    expect(unwrap(await searchFeeds.execute("RUST"))).toEqual([rust]);
    expect(unwrap(await searchFeeds.execute("recipes"))).toEqual([cooking]);
    expect(unwrap(await searchFeeds.execute("cook_example"))).toEqual([cooking]);
    expect(unwrap(await searchFeeds.execute("misc.example"))).toHaveLength(1);
    expect(unwrap(await searchFeeds.execute("nothing-matches"))).toEqual([]);
  });
});

describe("ListPopularFeeds", () => {
  it("orders by follower count, breaking ties by handle", async () => {
    const { feeds, rust, cooking, untitled } = await seed();
    await feeds.adjustFollowerCount(cooking.id, 5);
    await feeds.adjustFollowerCount(rust.id, 2);

    const listPopular = createListPopularFeeds({ feeds });
    const popular = await listPopular.execute();
    expect(popular.map((entry) => entry.feed.id)).toEqual([
      cooking.id,
      rust.id,
      untitled.id,
    ]);
    expect(popular[0]?.followerCount).toBe(5);
  });

  it("honors the limit", async () => {
    const { feeds } = await seed();
    const listPopular = createListPopularFeeds({ feeds });
    expect(await listPopular.execute(2)).toHaveLength(2);
  });
});
