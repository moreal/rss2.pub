import { describe, expect, it } from "vitest";
import {
  ContentPolicy,
  decidePostContent,
} from "../../../../src/domain/content/content-policy.js";
import {
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
};

function item(overrides: Partial<RawFeedItem>) {
  return unwrap(FeedItem.fromRaw({ ...EMPTY, guid: "g", ...overrides }));
}

describe("ContentPolicy.create", () => {
  it("bounds noteMaxChars to 1..8192 (Misskey ceiling)", () => {
    expect(
      unwrapErr(ContentPolicy.create({ noteMaxChars: 0, teaserMaxChars: 200 })),
    ).toMatchObject({ reason: "NoteMaxOutOfRange" });
    expect(
      unwrapErr(
        ContentPolicy.create({ noteMaxChars: 9000, teaserMaxChars: 200 }),
      ),
    ).toMatchObject({ reason: "NoteMaxOutOfRange" });
  });

  it("bounds teaserMaxChars to 1..1000", () => {
    expect(
      unwrapErr(
        ContentPolicy.create({ noteMaxChars: 2000, teaserMaxChars: 0 }),
      ),
    ).toMatchObject({ reason: "TeaserMaxOutOfRange" });
    expect(
      unwrapErr(
        ContentPolicy.create({ noteMaxChars: 2000, teaserMaxChars: 1001 }),
      ),
    ).toMatchObject({ reason: "TeaserMaxOutOfRange" });
  });

  it("defaults to 2,000 / 200 (ADR-0005)", () => {
    expect(ContentPolicy.DEFAULT).toEqual({
      noteMaxChars: 2000,
      teaserMaxChars: 200,
    });
  });
});

describe("decidePostContent", () => {
  it("publishes short items as a Note carrying the original HTML", () => {
    const short = item({
      title: "Short",
      link: "https://a.co/1",
      contentHtml: "<p>tiny <strong>post</strong></p>",
    });
    expect(decidePostContent(short, ContentPolicy.DEFAULT)).toEqual({
      kind: "note",
      title: "Short",
      bodyHtml: "<p>tiny <strong>post</strong></p>",
      linkUrl: "https://a.co/1",
      language: null,
    });
  });

  it("carries the item's language through to the published content", () => {
    const note = item({
      contentHtml: "<p>short</p>",
      language: "ko",
    });
    expect(decidePostContent(note, ContentPolicy.DEFAULT).language).toBe("ko");

    const article = item({
      contentHtml: `<p>${"word ".repeat(600)}</p>`,
      language: "ko",
    });
    expect(decidePostContent(article, ContentPolicy.DEFAULT).language).toBe(
      "ko",
    );
  });

  it("measures length on stripped text, not raw HTML (boundary inclusive)", () => {
    const policy = unwrap(
      ContentPolicy.create({ noteMaxChars: 5, teaserMaxChars: 200 }),
    );
    const exactly5 = item({ contentHtml: "<p>abcde</p>" });
    expect(decidePostContent(exactly5, policy).kind).toBe("note");

    const six = item({ contentHtml: "<p>abcdef</p>" });
    expect(decidePostContent(six, policy).kind).toBe("article");

    // Tags act as word separators: <em>ab</em>cde strips to "ab cde" (6).
    const separated = item({ contentHtml: "<p><em>ab</em>cde</p>" });
    expect(decidePostContent(separated, policy).kind).toBe("article");
  });

  it("publishes long items as an Article named by the title", () => {
    const long = item({
      title: "Long Post",
      link: "https://a.co/2",
      contentHtml: `<p>intro paragraph</p><p>${"word ".repeat(600)}</p>`,
    });
    const post = decidePostContent(long, ContentPolicy.DEFAULT);
    expect(post).toMatchObject({
      kind: "article",
      name: "Long Post",
      linkUrl: "https://a.co/2",
    });
  });

  it("prefers the feed's own summary as the Article teaser", () => {
    const long = item({
      title: "T",
      summaryHtml: "<p>publisher teaser</p>",
      contentHtml: `<p>${"word ".repeat(600)}</p>`,
    });
    const post = decidePostContent(long, ContentPolicy.DEFAULT);
    expect(post.kind).toBe("article");
    if (post.kind === "article") {
      expect(post.summaryHtml).toBe("<p>publisher teaser</p>");
    }
  });

  it("falls back to the first paragraph as teaser", () => {
    const long = item({
      title: "T",
      contentHtml: `<p>lead paragraph</p><p>${"word ".repeat(600)}</p>`,
    });
    const post = decidePostContent(long, ContentPolicy.DEFAULT);
    if (post.kind === "article") {
      expect(post.summaryHtml).toBe("lead paragraph");
    } else {
      expect.unreachable("expected an article");
    }
  });

  it("falls back to escaped truncated text when no paragraph exists", () => {
    const long = item({ title: "T", contentHtml: `x <& y ${"z".repeat(3000)}` });
    const post = decidePostContent(long, ContentPolicy.DEFAULT);
    if (post.kind === "article") {
      expect(post.summaryHtml.startsWith("x &lt;&amp; y")).toBe(true);
      expect(post.summaryHtml).not.toContain("<&");
    } else {
      expect.unreachable("expected an article");
    }
  });

  it("names an untitled Article from its leading text", () => {
    const long = item({ contentHtml: `<p>${"word ".repeat(600)}</p>` });
    const post = decidePostContent(long, ContentPolicy.DEFAULT);
    if (post.kind === "article") {
      expect(post.name.length).toBeLessThanOrEqual(80);
      expect(post.name.startsWith("word word")).toBe(true);
    } else {
      expect.unreachable("expected an article");
    }
  });
});
