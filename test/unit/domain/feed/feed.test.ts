import { describe, expect, it } from "vitest";
import {
  Feed,
  FeedId,
  FeedTitle,
  NO_VALIDATORS,
} from "../../../../src/domain/feed/feed.js";
import { FeedUrl } from "../../../../src/domain/feed/feed-url.js";
import { Handle } from "../../../../src/domain/feed/handle.js";
import { IconUrl } from "../../../../src/domain/feed/icon-url.js";
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

  it("derives a different id for the full-content variant of the same URL (ADR-0009)", () => {
    const teaserId = FeedId.fromUrl(url);
    const fullId = FeedId.fromUrl(url, true);
    expect(fullId).not.toBe(teaserId);
    expect(FeedId.fromUrl(url, true)).toBe(fullId);
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
    expect(feed.fullContentEnabled).toBe(false);
    expect(feed.registeredAt).toEqual(now);
    expect(feed.nextPollAt).toEqual(now);
    expect(feed.consecutiveFailures).toBe(0);
    expect(feed.validators).toEqual(NO_VALIDATORS);
    // Resolved later, on the first poll (ADR-0010) — registration never
    // fetches the channel link's site.
    expect(feed.iconUrl).toBeNull();
  });

  it("carries the full-content opt-in through to identity (ADR-0009)", () => {
    const fullHandle = Handle.fromFeedUrl(url, true);
    const feed = Feed.register({
      url,
      handle: fullHandle,
      title: null,
      description: null,
      fullContentEnabled: true,
      now,
    });
    expect(feed.fullContentEnabled).toBe(true);
    expect(feed.id).toBe(FeedId.fromUrl(url, true));
    expect(feed.id).not.toBe(FeedId.fromUrl(url));
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

  it("adopts a newly resolved icon (ADR-0010)", () => {
    const iconUrl = unwrap(IconUrl.create("https://example.com/icon.png"));
    const updated = Feed.withMetadata(base, {
      title: null,
      description: null,
      iconUrl,
    });
    expect(updated.iconUrl).toBe(iconUrl);
  });

  it("keeps the existing icon when no new one is offered", () => {
    const iconUrl = unwrap(IconUrl.create("https://example.com/icon.png"));
    const iconed = Feed.withMetadata(base, {
      title: null,
      description: null,
      iconUrl,
    });
    const updated = Feed.withMetadata(iconed, { title: null, description: null });
    expect(updated.iconUrl).toBe(iconUrl);
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
