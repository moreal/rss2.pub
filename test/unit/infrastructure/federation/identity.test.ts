import { describe, expect, it } from "vitest";
import { FeedId } from "../../../../src/domain/feed/feed.js";
import { FeedItem } from "../../../../src/domain/feed/feed-item.js";
import { stableObjectId } from "../../../../src/infrastructure/federation/identity.js";
import { unwrap } from "../../../helpers/result.js";

describe("stableObjectId", () => {
  it("derives a deterministic ID from the feed and item identities", () => {
    const feedId = unwrap(FeedId.create("a".repeat(64)));
    const item = unwrap(FeedItem.fromRaw({
      guid: "item-one",
      link: null,
      title: null,
      contentHtml: null,
      summaryHtml: null,
      publishedAt: null,
      language: null,
    }));

    expect(stableObjectId(feedId, item.key)).toBe(
      "3b594142ec7f5607eeb1f1b0fb45257e632444d445f78ef6200b6d1dc7505d6c",
    );
    expect(stableObjectId(feedId, item.key)).toMatch(/^[0-9a-f]{64}$/);
  });

  it("keeps different feed and item identities disjoint", () => {
    const feedA = unwrap(FeedId.create("a".repeat(64)));
    const feedB = unwrap(FeedId.create("b".repeat(64)));
    const itemOne = unwrap(FeedItem.fromRaw({
      guid: "item-one",
      link: null,
      title: null,
      contentHtml: null,
      summaryHtml: null,
      publishedAt: null,
      language: null,
    }));
    const itemTwo = unwrap(FeedItem.fromRaw({
      guid: "item-two",
      link: null,
      title: null,
      contentHtml: null,
      summaryHtml: null,
      publishedAt: null,
      language: null,
    }));

    expect(stableObjectId(feedA, itemOne.key)).not.toBe(
      stableObjectId(feedA, itemTwo.key),
    );
    expect(stableObjectId(feedA, itemOne.key)).not.toBe(
      stableObjectId(feedB, itemOne.key),
    );
  });
});
