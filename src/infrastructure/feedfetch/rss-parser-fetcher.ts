import Parser from "rss-parser";
import type { CacheValidators } from "../../domain/feed/feed.js";
import type { RawFeedItem } from "../../domain/feed/feed-item.js";
import type { FeedUrl } from "../../domain/feed/feed-url.js";
import type {
  FeedFetcher,
  FetchFeedError,
  FetchFeedSuccess,
} from "../../domain/ports/feed-fetcher.js";
import { err, ok, type Result } from "../../shared/result.js";

/** Atom `id` and RSS `content:encoded` are not in rss-parser's default Item. */
type CustomItem = {
  readonly id?: string;
  readonly contentEncoded?: string;
  readonly summary?: string | { readonly _?: string };
};

/** RSS channel `<language>` — declared explicitly since rss-parser's default
 * `Output<U>` type doesn't include it even though the runtime populates it. */
type CustomFeed = {
  readonly language?: string;
};

const ACCEPT =
  "application/rss+xml, application/atom+xml, application/xml;q=0.9, text/xml;q=0.8, */*;q=0.5";

const XML_LANG = /\bxml:lang=["']([^"']*)["']/;

function xmlLangOf(openTag: string): string | null {
  return openTag.match(XML_LANG)?.[1] ?? null;
}

/**
 * Atom's `xml:lang` (feed root or per-entry) is an XML attribute, not a named
 * child element, so rss-parser — which only copies named child elements, and
 * never exposes its own raw parse result — cannot see it (ADR-0011). These
 * pull it straight from the source document's opening tags instead. RSS
 * documents have no `<feed>`/`<entry>` tags, so both are natural no-ops there.
 */
export function atomFeedXmlLang(body: string): string | null {
  const tag = body.match(/<feed\b[^>]*>/i)?.[0];
  return tag === undefined ? null : xmlLangOf(tag);
}

/** Ordered per-entry `xml:lang`, `null` where an entry has none of its own
 * (no inheritance applied here — see `RawFeedItem.language`). */
export function atomEntryXmlLangs(body: string): (string | null)[] {
  const tags = body.match(/<entry\b[^>]*>/gi) ?? [];
  return tags.map(xmlLangOf);
}

function messageOf(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}

function dateOf(iso: string | undefined, fallback: string | undefined): Date | null {
  const raw = iso ?? fallback;
  if (raw === undefined) return null;
  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? null : date;
}

function summaryOf(summary: CustomItem["summary"]): string | null {
  if (summary === undefined) return null;
  if (typeof summary === "string") return summary;
  return summary._ ?? null;
}

/**
 * FeedFetcher adapter: fetch() + conditional GET headers + rss-parser for
 * both RSS 2.0 and Atom documents.
 */
export function createRssParserFetcher(options?: {
  readonly timeoutMs?: number;
  readonly userAgent?: string;
}): FeedFetcher {
  const timeoutMs = options?.timeoutMs ?? 30_000;
  // See readability-extractor.ts: a bare "rss2.pub (+url)" UA gets 403'd by
  // WAFs that require a "Mozilla/5.0" prefix; this form clears that while
  // staying honestly self-identified as a bot.
  const userAgent =
    options?.userAgent ??
    "Mozilla/5.0 (compatible; rss2.pub/1.0; +https://rss2.pub)";
  const parser = new Parser<CustomFeed, CustomItem>({
    customFields: {
      feed: ["language"],
      item: ["id", ["content:encoded", "contentEncoded"], "summary"],
    },
  });

  return {
    async fetch(
      url: FeedUrl,
      validators: CacheValidators,
    ): Promise<Result<FetchFeedSuccess, FetchFeedError>> {
      const headers: Record<string, string> = {
        accept: ACCEPT,
        "user-agent": userAgent,
      };
      if (validators.etag !== null) headers["if-none-match"] = validators.etag;
      if (validators.lastModified !== null) {
        headers["if-modified-since"] = validators.lastModified;
      }

      let response: Response;
      let body: string;
      try {
        response = await fetch(url, {
          headers,
          redirect: "follow",
          signal: AbortSignal.timeout(timeoutMs),
        });
        if (response.status === 304) return ok({ status: "not-modified" });
        if (!response.ok) {
          return err({
            type: "RequestFailed",
            url,
            message: `HTTP ${response.status}`,
          });
        }
        body = await response.text();
      } catch (cause) {
        return err({ type: "RequestFailed", url, message: messageOf(cause) });
      }

      let parsed: Awaited<ReturnType<typeof parser.parseString>>;
      try {
        parsed = await parser.parseString(body);
      } catch (cause) {
        return err({
          type: "InvalidFeedFormat",
          url,
          message: messageOf(cause),
        });
      }

      const entryLanguages = atomEntryXmlLangs(body);
      const items: RawFeedItem[] = (parsed.items ?? []).map((item, index) => ({
        guid: item.guid ?? item.id ?? null,
        link: item.link ?? null,
        title: item.title ?? null,
        contentHtml: item.contentEncoded ?? item.content ?? null,
        summaryHtml: summaryOf(item.summary),
        publishedAt: dateOf(item.isoDate, item.pubDate),
        language: entryLanguages[index] ?? null,
      }));

      return ok({
        status: "fetched",
        feed: {
          title: parsed.title ?? null,
          description: parsed.description ?? null,
          link: parsed.link ?? null,
          language: parsed.language ?? atomFeedXmlLang(body),
          items,
        },
        validators: {
          etag: response.headers.get("etag"),
          lastModified: response.headers.get("last-modified"),
        },
      });
    },
  };
}
