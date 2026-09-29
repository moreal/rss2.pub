import { expect, it } from "vitest";
import { createBlockFeed } from "../../../src/application/block-feed.js";
import { FeedUrl } from "../../../src/domain/feed/feed-url.js";
import { createInMemoryFeedRepository } from "../../../src/infrastructure/persistence/in-memory-feed-repository.js";
import { makeFeed } from "../../helpers/fakes.js";
import { unwrap } from "../../helpers/result.js";

it("blocks a URL and removes its registered actor", async () => {
  const feeds = createInMemoryFeedRepository();
  const feed = makeFeed();
  await feeds.save(feed);
  const blocked: string[] = [];
  const removed: string[] = [];
  const block = createBlockFeed({
    feeds,
    blockedFeeds: {
      isBlocked: async () => false,
      block: async (url) => { blocked.push(url); },
    },
    unregisterFeed: { execute: async (handle) => {
      removed.push(handle);
      return { ok: true, value: { feed, deletionPropagated: true } };
    } },
  });
  const result = unwrap(await block.execute(feed.url, "Spam"));
  expect(result.removed).toBe(true);
  expect(blocked).toEqual([unwrap(FeedUrl.create(feed.url))]);
  expect(removed).toEqual([feed.handle]);
});
