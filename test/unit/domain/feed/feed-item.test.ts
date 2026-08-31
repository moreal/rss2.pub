import { describe, expect, it } from "vitest";
import { AttributionCandidates } from "../../../../src/domain/feed/author-uri.js";
import {
  contentFingerprint,
  FeedItem,
  type RawFeedItem,
} from "../../../../src/domain/feed/feed-item.js";
import { unwrap, unwrapErr } from "../../../helpers/result.js";

const EMPTY: RawFeedItem = {
  guid: null,
  link: null,
  title: null,
  contentHtml: null,
  summaryHtml: null,
  publishedAt: null,
  language: null,
  authorUris: [],
};

describe("FeedItem.fromRaw identity", () => {
  it("prefers guid over link and content", () => {
    const item = unwrap(
      FeedItem.fromRaw({
        ...EMPTY,
        guid: "  tag:example.com,2026:1  ",
        link: "https://example.com/1",
        title: "One",
      }),
    );
    expect(item.key).toBe("guid:tag:example.com,2026:1");
  });

  it("falls back to link when guid is missing or blank", () => {
    const item = unwrap(
      FeedItem.fromRaw({ ...EMPTY, guid: "  ", link: "https://example.com/1" }),
    );
    expect(item.key).toBe("link:https://example.com/1");
  });

  it("falls back to a content hash when guid and link are missing", () => {
    const a = unwrap(FeedItem.fromRaw({ ...EMPTY, title: "T", contentHtml: "<p>c</p>" }));
    const b = unwrap(FeedItem.fromRaw({ ...EMPTY, title: "T", contentHtml: "<p>c</p>" }));
    const c = unwrap(FeedItem.fromRaw({ ...EMPTY, title: "T", contentHtml: "<p>d</p>" }));
    expect(a.key).toMatch(/^hash:[0-9a-f]{64}$/);
    expect(a.key).toBe(b.key);
    expect(a.key).not.toBe(c.key);
  });

  it("identifies summary-only items", () => {
    const item = unwrap(FeedItem.fromRaw({ ...EMPTY, summaryHtml: "s" }));
    expect(item.key).toMatch(/^hash:/);
  });

  it("rejects items with nothing to identify them by", () => {
    expect(unwrapErr(FeedItem.fromRaw(EMPTY))).toEqual({
      type: "UnidentifiableItem",
    });
    expect(
      unwrapErr(
        FeedItem.fromRaw({ ...EMPTY, title: "  ", contentHtml: "\n" }),
      ),
    ).toEqual({ type: "UnidentifiableItem" });
  });
});

describe("FeedItem.fromRaw normalization", () => {
  it("trims fields and nullifies blanks", () => {
    const item = unwrap(
      FeedItem.fromRaw({
        ...EMPTY,
        guid: "g",
        title: "  Hello  ",
        link: "   ",
      }),
    );
    expect(item.title).toBe("Hello");
    expect(item.link).toBeNull();
  });

  it("uses the summary as content when content is missing", () => {
    const item = unwrap(
      FeedItem.fromRaw({ ...EMPTY, guid: "g", summaryHtml: "<p>s</p>" }),
    );
    expect(item.contentHtml).toBe("<p>s</p>");
    expect(item.summaryHtml).toBe("<p>s</p>");
  });

  it("leaves content empty when the item carries none", () => {
    const item = unwrap(FeedItem.fromRaw({ ...EMPTY, guid: "g" }));
    expect(item.contentHtml).toBe("");
    expect(item.summaryHtml).toBeNull();
  });

  it("passes the published date through", () => {
    const publishedAt = new Date("2026-07-01T00:00:00Z");
    const item = unwrap(FeedItem.fromRaw({ ...EMPTY, guid: "g", publishedAt }));
    expect(item.publishedAt).toEqual(publishedAt);
  });

  it("validates and normalizes the entry's own xml:lang (ADR-0011)", () => {
    const item = unwrap(
      FeedItem.fromRaw({ ...EMPTY, guid: "g", language: "en-us" }),
    );
    expect(item.language).toBe("en-US");
  });

  it("drops a malformed language tag rather than failing the item", () => {
    const item = unwrap(
      FeedItem.fromRaw({ ...EMPTY, guid: "g", language: "not a lang" }),
    );
    expect(item.language).toBeNull();
  });

  it("filters raw author URIs through AttributionCandidates", () => {
    const item = unwrap(
      FeedItem.fromRaw({
        ...EMPTY,
        guid: "g",
        authorUris: [
          "https://actors.test/a",
          "relative",
          "https://actors.test/a",
        ],
      }),
    );

    expect(AttributionCandidates.values(item.authors)).toEqual([
      "https://actors.test/a",
    ]);
  });
});

describe("contentFingerprint", () => {
  const base = { ...EMPTY, guid: "g", title: "T", contentHtml: "<p>c</p>" };

  it("is stable for identical items", () => {
    const a = unwrap(FeedItem.fromRaw(base));
    const b = unwrap(FeedItem.fromRaw(base));
    expect(contentFingerprint(a)).toBe(contentFingerprint(b));
  });

  it("is unaffected by whitespace already collapsed by normalization", () => {
    const a = unwrap(FeedItem.fromRaw(base));
    const b = unwrap(FeedItem.fromRaw({ ...base, title: "  T  " }));
    expect(contentFingerprint(a)).toBe(contentFingerprint(b));
  });

  it.each([
    ["title", { title: "Other" }],
    ["contentHtml", { contentHtml: "<p>other</p>" }],
    ["summaryHtml", { summaryHtml: "<p>summary</p>" }],
    ["link", { link: "https://example.com/other" }],
    ["publishedAt", { publishedAt: new Date("2026-07-01T00:00:00Z") }],
    ["language", { language: "en" }],
  ])("changes when %s changes", (_field, override) => {
    const a = unwrap(FeedItem.fromRaw(base));
    const b = unwrap(FeedItem.fromRaw({ ...base, ...override }));
    expect(contentFingerprint(a)).not.toBe(contentFingerprint(b));
  });

  it("changes for author-only changes and author order", () => {
    const aThenB = unwrap(FeedItem.fromRaw({
      ...base,
      authorUris: ["https://actors.test/a", "https://actors.test/b"],
    }));
    const bThenA = unwrap(FeedItem.fromRaw({
      ...base,
      authorUris: ["https://actors.test/b", "https://actors.test/a"],
    }));
    const onlyA = unwrap(FeedItem.fromRaw({
      ...base,
      authorUris: ["https://actors.test/a"],
    }));

    expect(contentFingerprint(aThenB)).not.toBe(contentFingerprint(bThenA));
    expect(contentFingerprint(aThenB)).not.toBe(contentFingerprint(onlyA));
  });
});
