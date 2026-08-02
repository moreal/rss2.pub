import { describe, expect, it } from "vitest";
import { createFollowerTracker } from "../../../src/application/follower-tracker.js";
import { Feed } from "../../../src/domain/feed/feed.js";
import { FeedUrl } from "../../../src/domain/feed/feed-url.js";
import { Handle } from "../../../src/domain/feed/handle.js";
import { createInMemoryFeedRepository } from "../../../src/infrastructure/persistence/in-memory-feed-repository.js";
import { unwrap, unwrapErr } from "../../helpers/result.js";

const now = new Date("2026-07-26T12:00:00Z");

async function setup() {
  const feeds = createInMemoryFeedRepository();
  const url = unwrap(FeedUrl.create("https://a.co/f"));
  const feed = Feed.register({
    url,
    handle: Handle.fromFeedUrl(url),
    title: null,
    description: null,
    now,
  });
  await feeds.save(feed);
  return { feeds, feed, tracker: createFollowerTracker({ feeds }) };
}

describe("FollowerTracker", () => {
  it("rejects malformed handles", async () => {
    const { tracker } = await setup();
    expect(unwrapErr(await tracker.recordFollow("no dashes!"))).toMatchObject({
      type: "InvalidHandle",
    });
  });

  it("rejects handles that belong to no feed", async () => {
    const { tracker } = await setup();
    expect(unwrapErr(await tracker.recordFollow("ghost_feed"))).toMatchObject({
      type: "UnknownFeed",
    });
  });

  it("counts follows and unfollows, never below zero", async () => {
    const { feeds, feed, tracker } = await setup();
    unwrap(await tracker.recordFollow(feed.handle));
    unwrap(await tracker.recordFollow(feed.handle));
    expect(feeds.followerCountOf(feed.id)).toBe(2);

    unwrap(await tracker.recordUnfollow(feed.handle));
    unwrap(await tracker.recordUnfollow(feed.handle));
    unwrap(await tracker.recordUnfollow(feed.handle));
    expect(feeds.followerCountOf(feed.id)).toBe(0);
  });
});
