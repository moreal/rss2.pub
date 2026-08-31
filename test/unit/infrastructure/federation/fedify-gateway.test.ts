import { MemoryKvStore } from "@fedify/fedify";
import { type Activity, Delete, Update } from "@fedify/vocab";
import { describe, expect, it } from "vitest";
import { createFollowerTracker } from "../../../../src/application/follower-tracker.js";
import { FeedItem } from "../../../../src/domain/feed/feed-item.js";
import { createFedifyGateway } from "../../../../src/infrastructure/federation/fedify-gateway.js";
import { createFedifyStack } from "../../../../src/infrastructure/federation/fedify-stack.js";
import { createInMemoryFederationRepository } from "../../../../src/infrastructure/persistence/in-memory-federation-repository.js";
import { createInMemoryFeedRepository } from "../../../../src/infrastructure/persistence/in-memory-feed-repository.js";
import { fixedClock, makeFeed, mutableClock } from "../../../helpers/fakes.js";
import { unwrap } from "../../../helpers/result.js";

describe("createFedifyGateway", () => {
  it("reuses one object and Create identity for repeated publish attempts", async () => {
    const feeds = createInMemoryFeedRepository();
    const repository = createInMemoryFederationRepository();
    const feed = makeFeed({ handle: "feed_a" });
    await feeds.save(feed);
    const stack = createFedifyStack({
      kv: new MemoryKvStore(),
      feeds,
      followerTracker: createFollowerTracker({ feeds }),
      repository,
      softwareVersion: "0.1.0",
      allowPrivateAddress: true,
    });
    const sent: { senderHandle: string; activity: Activity }[] = [];
    const gateway = createFedifyGateway({
      federation: stack.federation,
      repository,
      origin: "https://local.test",
      clock: fixedClock(new Date("2026-08-30T00:00:00Z")),
      sendActivity: async (senderHandle, _recipients, activity) => {
        sent.push({ senderHandle, activity });
      },
    });
    const item = unwrap(FeedItem.fromRaw({
      guid: "stable-item",
      link: "https://source.test/post",
      title: "Post title",
      contentHtml: "<p>Hello</p>",
      summaryHtml: null,
      publishedAt: null,
      language: null,
    }));
    const content = {
      kind: "note" as const,
      title: item.title,
      bodyHtml: item.contentHtml,
      linkUrl: item.link,
      language: item.language,
    };

    const first = unwrap(await gateway.publish(feed, item.key, content));
    const retry = unwrap(await gateway.publish(feed, item.key, content));

    expect(retry.messageUri).toBe(first.messageUri);
    expect(await repository.countObjects(feed.handle)).toBe(1);
    expect(sent).toHaveLength(2);
    expect(sent.map(({ senderHandle }) => senderHandle)).toEqual([
      feed.handle,
      feed.handle,
    ]);
    const firstActivityId = sent[0]?.activity.id?.href;
    expect(firstActivityId).toMatch(
      /^https:\/\/local\.test\/ap\/actor\/feed_a\/create\/[0-9a-f]{64}$/,
    );
    expect(sent[1]?.activity.id?.href).toBe(firstActivityId);
  });

  it("updates content without changing the stored object kind or URI", async () => {
    const feeds = createInMemoryFeedRepository();
    const repository = createInMemoryFederationRepository();
    const feed = makeFeed({ handle: "feed_a" });
    await feeds.save(feed);
    const stack = createFedifyStack({
      kv: new MemoryKvStore(),
      feeds,
      followerTracker: createFollowerTracker({ feeds }),
      repository,
      softwareVersion: "0.1.0",
      allowPrivateAddress: true,
    });
    const sent: Activity[] = [];
    const clock = mutableClock(new Date("2026-08-30T00:00:00Z"));
    const gateway = createFedifyGateway({
      federation: stack.federation,
      repository,
      origin: "https://local.test",
      clock,
      sendActivity: async (_senderHandle, _recipients, activity) => {
        sent.push(activity);
      },
    });
    const item = unwrap(FeedItem.fromRaw({
      guid: "stable-item",
      link: "https://source.test/post",
      title: "Post title",
      contentHtml: "<p>Hello</p>",
      summaryHtml: null,
      publishedAt: null,
      language: null,
    }));
    const published = unwrap(await gateway.publish(feed, item.key, {
      kind: "note",
      title: item.title,
      bodyHtml: item.contentHtml,
      linkUrl: item.link,
      language: item.language,
    }));

    clock.set(new Date("2026-08-31T00:00:00Z"));
    unwrap(await gateway.update(feed, published.messageUri, {
      kind: "article",
      name: "Long article",
      summaryHtml: "<p>Summary</p>",
      contentHtml: "<p>Changed</p>",
      linkUrl: "https://source.test/changed",
      language: null,
    }));

    const objectId = new URL(published.messageUri).pathname.split("/").at(-1);
    const stored = objectId === undefined
      ? null
      : await repository.findObject(feed.handle, objectId);
    expect(stored).toMatchObject({
      kind: "note",
      name: null,
      summaryHtml: null,
      sourceUrl: "https://source.test/changed",
      updatedAt: new Date("2026-08-31T00:00:00Z"),
    });
    expect(stored?.contentHtml).toContain("<h1>Long article</h1>");
    expect(sent[1]).toBeInstanceOf(Update);
    expect((sent[1] instanceof Update ? sent[1].objectId?.href : null))
      .toBe(published.messageUri);
  });

  it("delivers actor Delete before clearing followers and objects but retains keys", async () => {
    const feeds = createInMemoryFeedRepository();
    const repository = createInMemoryFederationRepository();
    const feed = makeFeed({ handle: "feed_a" });
    await feeds.save(feed);
    await repository.addFollower({
      localHandle: feed.handle,
      actorUri: "https://remote.test/users/alice",
      inboxUri: "https://remote.test/users/alice/inbox",
      sharedInboxUri: null,
      followedAt: new Date("2026-08-30T00:00:00Z"),
    });
    await repository.saveKeyPairsIfAbsent([
      {
        localHandle: feed.handle,
        algorithm: "RSASSA-PKCS1-v1_5",
        publicJwk: { kty: "RSA" },
        privateJwk: { kty: "RSA", d: "private" },
        createdAt: new Date("2026-08-30T00:00:00Z"),
      },
      {
        localHandle: feed.handle,
        algorithm: "Ed25519",
        publicJwk: { kty: "OKP", crv: "Ed25519" },
        privateJwk: { kty: "OKP", crv: "Ed25519", d: "private" },
        createdAt: new Date("2026-08-30T00:00:00Z"),
      },
    ]);
    const stack = createFedifyStack({
      kv: new MemoryKvStore(),
      feeds,
      followerTracker: createFollowerTracker({ feeds }),
      repository,
      softwareVersion: "0.1.0",
      allowPrivateAddress: true,
    });
    const sent: Activity[] = [];
    const gateway = createFedifyGateway({
      federation: stack.federation,
      repository,
      origin: "https://local.test",
      clock: fixedClock(new Date("2026-08-30T00:00:00Z")),
      sendActivity: async (_senderHandle, _recipients, activity) => {
        sent.push(activity);
      },
    });
    const item = unwrap(FeedItem.fromRaw({
      guid: "stable-item",
      link: null,
      title: "Post title",
      contentHtml: "<p>Hello</p>",
      summaryHtml: null,
      publishedAt: null,
      language: null,
    }));
    unwrap(await gateway.publish(feed, item.key, {
      kind: "note",
      title: item.title,
      bodyHtml: item.contentHtml,
      linkUrl: item.link,
      language: item.language,
    }));

    unwrap(await gateway.deleteActor(feed));

    expect(sent.at(-1)).toBeInstanceOf(Delete);
    expect(await repository.countObjects(feed.handle)).toBe(0);
    expect(await repository.countFollowers(feed.handle)).toBe(0);
    expect(await repository.getKeyPairs(feed.handle)).toHaveLength(2);
  });
});
