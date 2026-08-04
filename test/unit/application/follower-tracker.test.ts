import { describe, expect, it } from "vitest";
import { createFollowerTracker } from "../../../src/application/follower-tracker.js";
import { createInMemoryFeedRepository } from "../../../src/infrastructure/persistence/in-memory-feed-repository.js";
import { makeFeed } from "../../helpers/fakes.js";
import { unwrap, unwrapErr } from "../../helpers/result.js";

async function setup() {
  const feeds = createInMemoryFeedRepository();
  const feed = makeFeed();
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
