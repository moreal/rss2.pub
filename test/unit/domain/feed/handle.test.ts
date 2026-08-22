import { describe, expect, it } from "vitest";
import { FeedUrl } from "../../../../src/domain/feed/feed-url.js";
import { Handle } from "../../../../src/domain/feed/handle.js";
import { unwrap, unwrapErr } from "../../../helpers/result.js";

function feedUrl(raw: string) {
  return unwrap(FeedUrl.create(raw));
}

describe("Handle.fromFeedUrl", () => {
  it("normalizes host and path into a lowercase [a-z0-9_] stem, always hash-suffixed", () => {
    expect(Handle.fromFeedUrl(feedUrl("https://a.co/f"))).toMatch(
      /^a_co_f_[a-z0-9]{7}$/,
    );
    expect(
      Handle.fromFeedUrl(feedUrl("https://Blog.Example.com/rss")),
    ).toMatch(/^blog_example_com_rss_[a-z0-9]{7}$/);
  });

  it("hash-suffixes stems of exactly 22 chars too", () => {
    // host+path normalizes to exactly 22 chars: "abcdef_example_com_rss"
    const handle = Handle.fromFeedUrl(feedUrl("https://abcdef.example.com/rss"));
    expect(handle).toMatch(/^abcdef_example_com_rss_[a-z0-9]{7}$/);
    expect(handle).toHaveLength(30);
  });

  it("truncates past 22 chars and appends a 7-char base36 hash", () => {
    const handle = Handle.fromFeedUrl(
      feedUrl("https://blog.example.com/feed.xml"),
    );
    expect(handle).toMatch(/^blog_example_com_feed_[a-z0-9]{7}$/);
    expect(handle.length).toBeLessThanOrEqual(30);
  });

  it("is deterministic for the same canonical URL", () => {
    const url = feedUrl("https://blog.example.com/feed.xml");
    expect(Handle.fromFeedUrl(url)).toBe(Handle.fromFeedUrl(url));
  });

  it("distinguishes feeds that differ only in query", () => {
    const one = Handle.fromFeedUrl(feedUrl("https://a.co/f?id=1"));
    const two = Handle.fromFeedUrl(feedUrl("https://a.co/f?id=2"));
    expect(one).toMatch(/^a_co_f_id_1_[a-z0-9]{7}$/);
    expect(two).toMatch(/^a_co_f_id_2_[a-z0-9]{7}$/);
    expect(one).not.toBe(two);
  });

  it("stays within charset and length for hostile inputs", () => {
    const handle = Handle.fromFeedUrl(
      feedUrl(
        "https://sub.한글도메인.example:8443/카테고리/feed.xml?tag=일상&page=2",
      ),
    );
    expect(handle).toMatch(/^[a-z0-9_]{1,30}$/);
  });

  it("never lets two different URLs collide on the same handle, even when their stems match", () => {
    // Normalization is lossy: both stems are "a_b_com_rss", but each URL's
    // own hash keeps the derived handles apart (ADR-0004).
    const dashed = feedUrl("https://a-b.com/rss");
    const dotted = feedUrl("https://a.b.com/rss");

    const one = Handle.fromFeedUrl(dashed);
    const two = Handle.fromFeedUrl(dotted);
    expect(one).toMatch(/^a_b_com_rss_[a-z0-9]{7}$/);
    expect(two).toMatch(/^a_b_com_rss_[a-z0-9]{7}$/);
    expect(one).not.toBe(two);
    expect(Handle.fromFeedUrl(dashed)).toBe(one);
  });
});

describe("Handle.create", () => {
  it("accepts and lowercases valid external handles", () => {
    expect(unwrap(Handle.create("Feed_123"))).toBe("feed_123");
  });

  it("rejects invalid charsets and lengths", () => {
    expect(unwrapErr(Handle.create(""))).toMatchObject({
      type: "InvalidHandle",
    });
    expect(unwrapErr(Handle.create("a-b"))).toMatchObject({
      type: "InvalidHandle",
    });
    expect(unwrapErr(Handle.create("한글"))).toMatchObject({
      type: "InvalidHandle",
    });
    expect(unwrapErr(Handle.create("a".repeat(31)))).toMatchObject({
      type: "InvalidHandle",
    });
  });
});
