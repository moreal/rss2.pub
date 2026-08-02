import { err, ok, type Result } from "../../shared/result.js";
import type { FeedItem } from "../feed/feed-item.js";
import { escapeHtml, firstParagraph, stripHtml, truncateText } from "./html.js";

/**
 * What to publish for a feed item (ADR-0005). Short items become a Note so
 * Mastodon shows the full text; long items become an Article whose
 * name/summary drive Mastodon's title + teaser + link rendering while
 * Misskey-family software renders the full content.
 */
export type NotePost = {
  readonly kind: "note";
  readonly title: string | null;
  readonly bodyHtml: string;
  readonly linkUrl: string | null;
};

export type ArticlePost = {
  readonly kind: "article";
  readonly name: string;
  readonly summaryHtml: string;
  readonly contentHtml: string;
  readonly linkUrl: string | null;
};

export type PostContent = NotePost | ArticlePost;

export type ContentPolicy = {
  readonly noteMaxChars: number;
  readonly teaserMaxChars: number;
};

export type InvalidContentPolicy = {
  readonly type: "InvalidContentPolicy";
  readonly reason: "NoteMaxOutOfRange" | "TeaserMaxOutOfRange";
};

/** Misskey truncates remote notes at 8,192 chars (PLAN.md §5). */
const NOTE_MAX_CEILING = 8192;
const TEASER_MAX_CEILING = 1000;
const ARTICLE_NAME_MAX = 80;

const DEFAULT: ContentPolicy = { noteMaxChars: 2000, teaserMaxChars: 200 };

export const ContentPolicy = {
  DEFAULT,
  create(params: {
    readonly noteMaxChars: number;
    readonly teaserMaxChars: number;
  }): Result<ContentPolicy, InvalidContentPolicy> {
    const { noteMaxChars, teaserMaxChars } = params;
    if (
      !Number.isInteger(noteMaxChars) ||
      noteMaxChars < 1 ||
      noteMaxChars > NOTE_MAX_CEILING
    ) {
      return err({ type: "InvalidContentPolicy", reason: "NoteMaxOutOfRange" });
    }
    if (
      !Number.isInteger(teaserMaxChars) ||
      teaserMaxChars < 1 ||
      teaserMaxChars > TEASER_MAX_CEILING
    ) {
      return err({
        type: "InvalidContentPolicy",
        reason: "TeaserMaxOutOfRange",
      });
    }
    return ok({ noteMaxChars, teaserMaxChars });
  },
} as const;

export function decidePostContent(
  item: FeedItem,
  policy: ContentPolicy,
): PostContent {
  const text = stripHtml(item.contentHtml);
  if (text.length <= policy.noteMaxChars) {
    return {
      kind: "note",
      title: item.title,
      bodyHtml: item.contentHtml,
      linkUrl: item.link,
    };
  }

  // Teaser preference: the feed's own summary, else the first paragraph,
  // else truncated plain text ("첫 문단 또는 첫 200자", PLAN.md).
  const teaser =
    item.summaryHtml ??
    firstParagraph(item.contentHtml) ??
    escapeHtml(truncateText(text, policy.teaserMaxChars));

  return {
    kind: "article",
    name: item.title ?? truncateText(text, ARTICLE_NAME_MAX),
    summaryHtml: teaser,
    contentHtml: item.contentHtml,
    linkUrl: item.link,
  };
}
