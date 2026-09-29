import type { RawFeedItem } from "../../domain/feed/feed-item.js";
import type { Rss2ItemDto, Rss2ParseError } from "@rss2pub/rss-feed";

function authorCandidate(raw: string | null): string | null {
  if (raw === null) return null;
  const value = raw.trim();
  return /^https?:\/\//i.test(value) ? value : null;
}

function audioEnclosureLink(entry: Rss2ItemDto): string | null {
  if (!entry.enclosure?.type?.toLowerCase().startsWith("audio/") || !entry.enclosure.url) {
    return null;
  }
  try {
    const url = new URL(entry.enclosure.url);
    return url.protocol === "http:" || url.protocol === "https:" ? url.href : null;
  } catch {
    return null;
  }
}

export function mapRss2Entry(
  entry: Rss2ItemDto,
  channelLanguage: string | null,
): RawFeedItem {
  return {
    guid: entry.guid,
    link: entry.link ?? audioEnclosureLink(entry),
    title: entry.title,
    contentHtml: entry.contentEncoded ?? entry.description,
    summaryHtml: entry.description,
    publishedAt: dateOf(entry.pubDate),
    language: channelLanguage,
    authorUris: [entry.author, entry.dcCreator].flatMap((raw) => {
      const candidate = authorCandidate(raw);
      return candidate === null ? [] : [candidate];
    }),
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
