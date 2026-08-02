import { describe, expect, it } from "vitest";
import {
  Feed,
  FeedId,
  FeedTitle,
  NO_VALIDATORS,
} from "../../../../src/domain/feed/feed.js";
import { FeedUrl } from "../../../../src/domain/feed/feed-url.js";
import { Handle } from "../../../../src/domain/feed/handle.js";
import { sha256Hex } from "../../../../src/shared/sha256.js";
import { unwrap, unwrapErr } from "../../../helpers/result.js";

const url = unwrap(FeedUrl.create("https://blog.example.com/feed.xml"));
const handle = Handle.fromFeedUrl(url);
const now = new Date("2026-07-26T12:00:00Z");

describe("FeedId", () => {
  it("derives a deterministic 64-hex id from the canonical URL", () => {
    const id = FeedId.fromUrl(url);
    expect(id).toBe(sha256Hex(url));
    expect(id).toMatch(/^[0-9a-f]{64}$/);
    expect(FeedId.fromUrl(url)).toBe(id);
  });

  it("parses stored ids and rejects malformed ones", () => {
    const id = FeedId.fromUrl(url);
    expect(unwrap(FeedId.create(id))).toBe(id);
    expect(unwrapErr(FeedId.create("xyz"))).toMatchObject({
      type: "InvalidFeedId",
    });
    expect(unwrapErr(FeedId.create(id.toUpperCase()))).toMatchObject({
      type: "InvalidFeedId",
    });
  });
});

describe("FeedTitle", () => {
  it("collapses whitespace", () => {
    expect(unwrap(FeedTitle.create("  My \n  Blog  "))).toBe("My Blog");
  });

  it("rejects blank titles", () => {
    expect(unwrapErr(FeedTitle.create("   "))).toEqual({
      type: "EmptyFeedTitle",
    });
  });

  it("bounds overlong titles at 200 chars with an ellipsis", () => {
    const title = unwrap(FeedTitle.create("x".repeat(500)));
    expect(title.length).toBeLessThanOrEqual(200);
    expect(title.endsWith("…")).toBe(true);
  });
});

describe("Feed.register", () => {
  it("creates a feed due for immediate polling with derived identity", () => {
    const feed = Feed.register({
      url,
      handle,
      title: unwrap(FeedTitle.create("Example Blog")),
      description: "A blog about examples",
      now,
    });
    expect(feed.id).toBe(FeedId.fromUrl(url));
    expect(feed.handle).toBe(handle);
    expect(feed.registeredAt).toEqual(now);
    expect(feed.nextPollAt).toEqual(now);
    expect(feed.consecutiveFailures).toBe(0);
    expect(feed.validators).toEqual(NO_VALIDATORS);
  });
});

describe("Feed.withMetadata", () => {
  const base = Feed.register({ url, handle, title: null, description: null, now });

  it("fills in newly discovered metadata", () => {
    const updated = Feed.withMetadata(base, {
      title: unwrap(FeedTitle.create("Found Title")),
      description: "found",
    });
    expect(updated.title).toBe("Found Title");
    expect(updated.description).toBe("found");
  });

  it("keeps existing values when the poll offers none", () => {
    const titled = Feed.withMetadata(base, {
      title: unwrap(FeedTitle.create("Keep Me")),
      description: "keep",
    });
    const updated = Feed.withMetadata(titled, { title: null, description: null });
    expect(updated.title).toBe("Keep Me");
    expect(updated.description).toBe("keep");
  });
});

describe("Feed.displayName", () => {
  it("prefers the title and falls back to the handle", () => {
    const untitled = Feed.register({ url, handle, title: null, description: null, now });
    expect(Feed.displayName(untitled)).toBe(handle);
    const titled = Feed.withMetadata(untitled, {
      title: unwrap(FeedTitle.create("Example Blog")),
      description: null,
    });
    expect(Feed.displayName(titled)).toBe("Example Blog");
  });
});
