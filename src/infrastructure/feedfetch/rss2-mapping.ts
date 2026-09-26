import type { RawFeedItem } from "../../domain/feed/feed-item.js";
import type { Rss2ItemDto, Rss2ParseError } from "@rss2pub/rss-feed";

/** The RSS 2.0 parser exposes author, enclosure, and content:encoded; domain
 * wiring (attribution, podcast link fallback, full-content publication) is a
 * follow-up — attribution stays the local feed actor only for now. */
export function mapRss2Entry(
  entry: Rss2ItemDto,
  channelLanguage: string | null,
): RawFeedItem {
  return {
    guid: entry.guid,
    link: entry.link,
    title: entry.title,
    contentHtml: entry.description,
    summaryHtml: null,
    publishedAt: dateOf(entry.pubDate),
    language: channelLanguage,
    authorUris: [],
  };
}

export function rss2ParseErrorMessage(error: Rss2ParseError): string {
  switch (error.type) {
    case "MalformedXml":
      return error.message;
    case "NotRss2Feed":
      return "document is not an RSS 2.0 feed";
    case "UnsafeXml":
      return `unsafe XML construct: ${error.construct}`;
    case "LimitExceeded":
      return `RSS 2.0 parser ${error.limit} limit exceeded`;
  }
}

function dateOf(raw: string | null): Date | null {
  if (raw === null) return null;
  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? null : date;
}

