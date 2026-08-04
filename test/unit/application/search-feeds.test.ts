import { describe, expect, it } from "vitest";
import {
  createListPopularFeeds,
  createSearchFeeds,
} from "../../../src/application/search-feeds.js";
import { createInMemoryFeedRepository } from "../../../src/infrastructure/persistence/in-memory-feed-repository.js";
import { makeFeed } from "../../helpers/fakes.js";
import { unwrap, unwrapErr } from "../../helpers/result.js";

async function seed() {
  const feeds = createInMemoryFeedRepository();
  const rust = makeFeed({
    url: "https://rust.blog/rss",
    title: "Rust Blog",
    description: "systems programming",
  });
  const cooking = makeFeed({
    url: "https://cook.example/rss",
    title: "Daily Cooking",
    description: "recipes and food",
  });
  const untitled = makeFeed({ url: "https://misc.example/rss" });
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
