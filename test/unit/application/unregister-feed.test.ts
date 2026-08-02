import { describe, expect, it } from "vitest";
import { createUnregisterFeed } from "../../../src/application/unregister-feed.js";
import { Feed } from "../../../src/domain/feed/feed.js";
import { FeedUrl } from "../../../src/domain/feed/feed-url.js";
import { Handle } from "../../../src/domain/feed/handle.js";
import type { ItemKey } from "../../../src/domain/feed/feed-item.js";
import type { FederationGateway } from "../../../src/domain/ports/federation-gateway.js";
import { createInMemoryFeedRepository } from "../../../src/infrastructure/persistence/in-memory-feed-repository.js";
import { createInMemoryItemRepository } from "../../../src/infrastructure/persistence/in-memory-item-repository.js";
import { err } from "../../../src/shared/result.js";
import { capturingFederation } from "../../helpers/fakes.js";
import { unwrap, unwrapErr } from "../../helpers/result.js";

const now = new Date("2026-07-26T12:00:00Z");

async function setup() {
  const feeds = createInMemoryFeedRepository();
  const items = createInMemoryItemRepository();
  const federation = capturingFederation();
  const url = unwrap(FeedUrl.create("https://a.co/f"));
  const feed = Feed.register({
    url,
    handle: Handle.fromFeedUrl(url),
    title: null,
    description: null,
    now,
  });
  await feeds.save(feed);
  await items.markPublished(feed.id, [
    { key: "guid:1" as ItemKey, publishedAt: now },
  ]);
  const unregister = createUnregisterFeed({ feeds, items, federation });
  return { feeds, items, federation, feed, unregister };
}

describe("UnregisterFeed", () => {
  it("rejects malformed handles", async () => {
    const { unregister } = await setup();
    expect(unwrapErr(await unregister.execute("no way!"))).toMatchObject({
      type: "InvalidHandle",
    });
  });

  it("rejects unknown handles", async () => {
    const { unregister } = await setup();
    expect(unwrapErr(await unregister.execute("ghost"))).toMatchObject({
      type: "UnknownFeed",
    });
  });

  it("propagates Delete, then removes feed and item memory", async () => {
    const { feeds, items, federation, feed, unregister } = await setup();
    const result = unwrap(await unregister.execute(feed.handle));

    expect(result.deletionPropagated).toBe(true);
    expect(federation.deletedActors.map((f) => f.id)).toEqual([feed.id]);
    expect(await feeds.findById(feed.id)).toBeNull();
    expect(await items.filterNew(feed.id, ["guid:1" as ItemKey])).toEqual([
      "guid:1",
    ]);
  });

  it("still removes local state when Delete propagation fails", async () => {
    const { feeds, feed, federation } = await setup();
    const failing: FederationGateway = {
      publish: federation.publish,
      deleteActor: async (f) =>
        err({
          type: "FederationDeliveryFailed",
          feedId: f.id,
          message: "boom",
        }),
    };
    const unregisterFailing = createUnregisterFeed({
      feeds,
      items: createInMemoryItemRepository(),
      federation: failing,
    });

    const result = unwrap(await unregisterFailing.execute(feed.handle));
    expect(result.deletionPropagated).toBe(false);
    expect(await feeds.findById(feed.id)).toBeNull();
  });
});
