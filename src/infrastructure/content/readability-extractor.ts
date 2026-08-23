import { Readability } from "@mozilla/readability";
import { parseHTML } from "linkedom";
import type {
  ContentExtractor,
  ExtractContentError,
  ExtractedContent,
} from "../../domain/ports/content-extractor.js";
import { err, ok, type Result } from "../../shared/result.js";

function messageOf(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}

/**
 * ContentExtractor adapter (ADR-0009): fetches an article's original page
 * and runs Mozilla's Readability algorithm — the same content-scoring
 * technique behind Firefox Reader View and Inoreader's "load full content" —
 * to isolate the main article, stripping navigation/ads/boilerplate.
 */
export function createReadabilityContentExtractor(options?: {
  readonly timeoutMs?: number;
  readonly userAgent?: string;
}): ContentExtractor {
  const timeoutMs = options?.timeoutMs ?? 15_000;
  // Some origin sites' bot filters reject any User-Agent that doesn't start
  // with "Mozilla/5.0" (a common, crude WAF heuristic), 403-ing the plain
  // "rss2.pub (+https://rss2.pub)" identifier and silently degrading every
  // extraction on that site back to the feed's teaser. The Googlebot-style
  // "compatible; ...; +url" form keeps us honestly self-identified as a bot
  // while clearing that filter.
  const userAgent =
    options?.userAgent ??
    "Mozilla/5.0 (compatible; rss2.pub/1.0; +https://rss2.pub)";

  return {
    async extract(
      url: string,
    ): Promise<Result<ExtractedContent, ExtractContentError>> {
      let html: string;
      try {
        const response = await fetch(url, {
          headers: { accept: "text/html", "user-agent": userAgent },
          redirect: "follow",
          signal: AbortSignal.timeout(timeoutMs),
        });
        if (!response.ok) {
          return err({
            type: "RequestFailed",
            url,
            message: `HTTP ${response.status}`,
          });
        }
        html = await response.text();
      } catch (cause) {
        return err({ type: "RequestFailed", url, message: messageOf(cause) });
      }

      try {
        const { document } = parseHTML(html);
        const article = new Readability(document).parse();
        const content = article?.content?.trim();
        if (content === undefined || content.length === 0) {
          return err({
            type: "ExtractionFailed",
            url,
            message: "no article content found",
          });
        }
        return ok({ contentHtml: content });
      } catch (cause) {
        return err({ type: "ExtractionFailed", url, message: messageOf(cause) });
      }
    },
  };
}
