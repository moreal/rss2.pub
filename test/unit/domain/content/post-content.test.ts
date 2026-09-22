import { describe, expect, it } from "vitest";
import { postContentFrom } from "../../../../src/domain/content/post-content.js";
import {
  FeedItem,
  type RawFeedItem,
} from "../../../../src/domain/feed/feed-item.js";
import { unwrap } from "../../../helpers/result.js";

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

function item(overrides: Partial<RawFeedItem>) {
  return unwrap(FeedItem.fromRaw({ ...EMPTY, guid: "g", ...overrides }));
}

describe("postContentFrom", () => {
  it("carries a complete long Atom entry into Note content without a teaser", () => {
    const publishedAt = new Date("2026-07-01T00:00:00Z");
    const longHtml = `<p>intro paragraph</p><p>${"word ".repeat(600)}</p>`;

    expect(postContentFrom(item({
      title: "Long Post",
      link: "https://a.co/2",
      contentHtml: longHtml,
      summaryHtml: "<p>publisher teaser</p>",
      publishedAt,
      language: "ko",
    }))).toEqual({
      title: "Long Post",
      bodyHtml: longHtml,
      linkUrl: "https://a.co/2",
      publishedAt,
      language: "ko",
    });
  });

  it("preserves missing optional metadata", () => {
    expect(postContentFrom(item({ contentHtml: "<p>body</p>" }))).toEqual({
      title: null,
      bodyHtml: "<p>body</p>",
      linkUrl: null,
      publishedAt: null,
      language: null,
    });
  });
});
