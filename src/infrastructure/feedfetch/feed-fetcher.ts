import {
  parseAtom,
  type AtomEntryDto,
  type AtomParseError,
  type AtomTextDto,
} from "@rss2pub/atom-feed";
import { parseRss2 } from "@rss2pub/rss-feed";
import { escapeHtml } from "../../domain/content/html.js";
import type { CacheValidators } from "../../domain/feed/feed.js";
import type { RawFeedItem } from "../../domain/feed/feed-item.js";
import type { FeedUrl } from "../../domain/feed/feed-url.js";
import type {
  FeedFetcher,
  FetchedFeed,
  FetchFeedError,
  FetchFeedSuccess,
} from "../../domain/ports/feed-fetcher.js";
import { err, ok, type Result } from "../../shared/result.js";
import { mapRss2Entry, rss2ParseErrorMessage } from "./rss2-mapping.js";
import { fetchPublicUrl } from "./public-fetch.js";

const ACCEPT =
  "application/atom+xml, application/rss+xml, application/xml;q=0.9, text/xml;q=0.8";
const DEFAULT_MAX_RESPONSE_BYTES = 5 * 1024 * 1024;

type ReadBodyResult =
  | { readonly status: "complete"; readonly body: string }
  | { readonly status: "invalid-encoding" }
  | { readonly status: "too-large" };

function messageOf(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}

function atomParseErrorMessage(error: AtomParseError): string {
  switch (error.type) {
    case "MalformedXml":
      return error.message;
    case "NotAtomFeed":
      return "document is not an Atom 1.0 feed";
    case "UnsafeXml":
      return `unsafe XML construct: ${error.construct}`;
    case "LimitExceeded":
      return `Atom parser ${error.limit} limit exceeded`;
  }
}

function displayText(text: AtomTextDto | null): string | null {
  return text?.plainText ?? null;
}

function htmlText(text: AtomTextDto | null): string | null {
  if (text === null) return null;
  return text.type === "text" ? escapeHtml(text.value) : text.value;
}

function dateOf(raw: string | null): Date | null {
  if (raw === null) return null;
  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? null : date;
}

function mapAtomEntry(entry: AtomEntryDto): RawFeedItem {
  return {
    guid: entry.id,
    link: entry.link,
    title: displayText(entry.title),
    contentHtml: htmlText(entry.content ?? entry.summary),
    summaryHtml: htmlText(entry.summary),
    publishedAt: dateOf(entry.published ?? entry.updated),
    language: entry.language,
    authorUris: entry.authors.flatMap((author) =>
      author.uri === null ? [] : [author.uri]
    ),
  };
}

function concatenate(chunks: readonly Uint8Array[], byteLength: number): Uint8Array {
  const bytes = new Uint8Array(byteLength);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

async function readBody(
  body: ReadableStream<Uint8Array> | null,
  maxResponseBytes: number,
): Promise<ReadBodyResult> {
  if (body === null) return { status: "complete", body: "" };

  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let byteLength = 0;
  while (true) {
    const result = await reader.read();
    if (result.done) break;
    byteLength += result.value.byteLength;
    if (byteLength > maxResponseBytes) {
      await reader.cancel().catch(() => undefined);
      return { status: "too-large" };
    }
    chunks.push(result.value);
  }

  try {
    return {
      status: "complete",
      body: new TextDecoder("utf-8", { fatal: true }).decode(
        concatenate(chunks, byteLength),
      ),
    };
  } catch {
    return { status: "invalid-encoding" };
  }
}

function parseFeedBody(body: string): Result<FetchedFeed, string> {
  const atomResult = parseAtom(body);
  if (atomResult.ok) {
    return ok({
      title: displayText(atomResult.value.title),
      description: displayText(atomResult.value.subtitle),
      link: atomResult.value.link,
      language: atomResult.value.language,
      items: atomResult.value.entries.map(mapAtomEntry),
    });
  }

  if (atomResult.error.type !== "NotAtomFeed") {
    return err(atomParseErrorMessage(atomResult.error));
  }

  const rss2Result = parseRss2(body);
  if (rss2Result.ok) {
    const channelLanguage = rss2Result.value.language;
    return ok({
      title: rss2Result.value.title,
      description: rss2Result.value.description,
      link: rss2Result.value.link,
      language: channelLanguage,
      items: rss2Result.value.items.map((item) => mapRss2Entry(item, channelLanguage)),
    });
  }

  if (rss2Result.error.type !== "NotRss2Feed") {
    return err(rss2ParseErrorMessage(rss2Result.error));
  }

  return err("document is not a supported feed format (Atom 1.0 or RSS 2.0)");
}

/** FeedFetcher adapter with conditional HTTP and bounded streaming. Accepts
 * Atom 1.0 first; when the root element is not an Atom feed it falls back to
 * RSS 2.0 (ADR-0016). The two parser packages never reference each other —
 * only this adapter knows about both. */
export function createFeedFetcher(options?: {
  readonly timeoutMs?: number;
  readonly userAgent?: string;
  readonly maxResponseBytes?: number;
  readonly allowPrivateAddress?: boolean;
  readonly fetchImpl?: typeof fetch;
}): FeedFetcher {
  const timeoutMs = options?.timeoutMs ?? 30_000;
  const userAgent =
    options?.userAgent ??
    "Mozilla/5.0 (compatible; rss2.pub/1.0; +https://rss2.pub)";
  const maxResponseBytes =
    options?.maxResponseBytes ?? DEFAULT_MAX_RESPONSE_BYTES;

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
      let bodyResult: ReadBodyResult;
      try {
        response = await fetchPublicUrl(url, {
          headers,
          signal: AbortSignal.timeout(timeoutMs),
        }, {
          allowPrivateAddress: options?.allowPrivateAddress === true,
          ...(options?.fetchImpl === undefined ? {} : { fetchImpl: options.fetchImpl }),
        });
        if (response.status === 304) return ok({ status: "not-modified" });
        if (!response.ok) {
          return err({
            type: "RequestFailed",
            url,
            message: `HTTP ${response.status}`,
          });
        }
        bodyResult = await readBody(response.body, maxResponseBytes);
      } catch (cause) {
        return err({ type: "RequestFailed", url, message: messageOf(cause) });
      }

      if (bodyResult.status === "too-large") {
        return err({
          type: "InvalidFeedFormat",
          url,
          message: `response exceeds ${maxResponseBytes} bytes`,
        });
      }
      if (bodyResult.status === "invalid-encoding") {
        return err({
          type: "InvalidFeedFormat",
          url,
          message: "response is not valid UTF-8",
        });
      }

      const parsed = parseFeedBody(bodyResult.body);
      if (!parsed.ok) {
        return err({ type: "InvalidFeedFormat", url, message: parsed.error });
      }

      return ok({
        status: "fetched",
        feed: parsed.value,
        validators: {
          etag: response.headers.get("etag"),
          lastModified: response.headers.get("last-modified"),
        },
      });
    },
  };
}
