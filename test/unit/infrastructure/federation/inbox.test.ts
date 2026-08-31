import { createFederation, MemoryKvStore } from "@fedify/fedify";
import { Accept, Endpoints, Follow, Person, Undo } from "@fedify/vocab";
import { describe, expect, it } from "vitest";
import { createFollowerTracker } from "../../../../src/application/follower-tracker.js";
import { createInboxHandlers } from "../../../../src/infrastructure/federation/inbox.js";
import { createInMemoryFederationRepository } from "../../../../src/infrastructure/persistence/in-memory-federation-repository.js";
import { createInMemoryFeedRepository } from "../../../../src/infrastructure/persistence/in-memory-feed-repository.js";
import { makeFeed } from "../../../helpers/fakes.js";

function context() {
  const federation = createFederation<void>({ kv: new MemoryKvStore() });
  federation.setActorDispatcher("/ap/actor/{identifier}", () => null);
  return federation.createContext(new URL("https://local.test"), undefined);
}

describe("raw Fedify Follow/Undo handlers", () => {
  it("stores one follower, counts once, and sends Accept for duplicate Follow", async () => {
    const ctx = context();
    const feeds = createInMemoryFeedRepository();
    const feed = makeFeed({ handle: "feed_a" });
    await feeds.save(feed);
    const repository = createInMemoryFederationRepository();
    const accepted: { sender: string; activity: Accept }[] = [];
    const remote = new Person({
      id: new URL("https://remote.test/users/alice"),
      inbox: new URL("https://remote.test/users/alice/inbox"),
      endpoints: new Endpoints({
        sharedInbox: new URL("https://remote.test/inbox"),
      }),
    });
    const handlers = createInboxHandlers({
      feeds,
      repository,
      followerTracker: createFollowerTracker({ feeds }),
      resolveFollowActor: async () => remote,
      sendAccept: async (sender, _recipient, activity) => {
        accepted.push({ sender, activity });
      },
    });
    const follow = new Follow({
      id: new URL("https://remote.test/follows/1"),
      actor: remote.id,
      object: ctx.getActorUri(feed.handle),
    });

    await handlers.follow(ctx, feed.handle, follow);
    await handlers.follow(ctx, feed.handle, follow);

    expect(await repository.countFollowers(feed.handle)).toBe(1);
    expect(feeds.followerCountOf(feed.id)).toBe(1);
    expect(accepted).toHaveLength(2);
    expect(accepted.map(({ sender }) => sender)).toEqual([
      feed.handle,
      feed.handle,
    ]);
    expect(accepted[0]?.activity.objectId?.href).toBe(follow.id?.href);
  });

  it("removes only a matching actor's nested Follow and counts once", async () => {
    const ctx = context();
    const feeds = createInMemoryFeedRepository();
    const feed = makeFeed({ handle: "feed_a" });
    await feeds.save(feed);
    const repository = createInMemoryFederationRepository();
    const remote = new Person({
      id: new URL("https://remote.test/users/alice"),
      inbox: new URL("https://remote.test/users/alice/inbox"),
    });
    const handlers = createInboxHandlers({
      feeds,
      repository,
      followerTracker: createFollowerTracker({ feeds }),
      resolveFollowActor: async () => remote,
      sendAccept: async () => undefined,
    });
    const follow = new Follow({
      id: new URL("https://remote.test/follows/1"),
      actor: remote.id,
      object: ctx.getActorUri(feed.handle),
    });
    await handlers.follow(ctx, feed.handle, follow);

    await handlers.undo(ctx, feed.handle, new Undo({
      actor: new URL("https://remote.test/users/mallory"),
      object: follow,
    }));
    expect(await repository.countFollowers(feed.handle)).toBe(1);
    expect(feeds.followerCountOf(feed.id)).toBe(1);

    const undo = new Undo({ actor: remote.id, object: follow });
    await handlers.undo(ctx, feed.handle, undo);
    await handlers.undo(ctx, feed.handle, undo);
    expect(await repository.countFollowers(feed.handle)).toBe(0);
    expect(feeds.followerCountOf(feed.id)).toBe(0);
  });

  it("ignores unknown local targets", async () => {
    const ctx = context();
    const feeds = createInMemoryFeedRepository();
    const repository = createInMemoryFederationRepository();
    const remote = new Person({
      id: new URL("https://remote.test/users/alice"),
      inbox: new URL("https://remote.test/users/alice/inbox"),
    });
    let accepts = 0;
    const handlers = createInboxHandlers({
      feeds,
      repository,
      followerTracker: createFollowerTracker({ feeds }),
      resolveFollowActor: async () => remote,
      sendAccept: async () => {
        accepts++;
      },
    });

    await handlers.follow(ctx, "unknown", new Follow({
      actor: remote.id,
      object: ctx.getActorUri("unknown"),
    }));

    expect(await repository.countFollowers("unknown")).toBe(0);
    expect(accepts).toBe(0);
  });
});
