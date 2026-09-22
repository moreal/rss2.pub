import type { FeedItem } from "../feed/feed-item.js";
import type { FeedLanguage } from "../feed/feed-language.js";

/** The complete Atom entry projected as an ActivityPub Note. */
export type PostContent = {
  readonly title: string | null;
  readonly bodyHtml: string;
  readonly linkUrl: string | null;
  readonly publishedAt: Date | null;
  readonly language: FeedLanguage | null;
};

export function postContentFrom(item: FeedItem): PostContent {
  return {
    title: item.title,
    bodyHtml: item.contentHtml,
    linkUrl: item.link,
    publishedAt: item.publishedAt,
    language: item.language,
  };
}
