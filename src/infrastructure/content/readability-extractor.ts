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

type LinkedomDocument = ReturnType<typeof parseHTML>["document"];
type LinkedomElement = ReturnType<LinkedomDocument["createElement"]>;

// Readability's own unlikely-candidate check deletes "comment"-classed nodes
// on its first scoring pass, but if the surviving text is short it reruns
// *without* that filter — un-deleting the very comment thread it just
// removed — and then keeps whichever attempt produced the longest text,
// which is almost always the resurrected comments (this is exactly what
// happened extracting https://news.hada.io/topic pages: the submission body
// is a short <ul> summary, so the retry always fires and the <p>-tagged
// comment thread wins on length). Deleting comment containers from the DOM
// ourselves, before Readability ever sees it, removes them from that retry
// entirely. Some platforms (e.g. Discourse) mark replies via
// itemprop="comment" / itemtype=".../Comment" microdata rather than
// class/id, so both signals are checked.
const COMMENT_MARKER = /comment|disqus|giscus|utterances/i;

function looksLikeCommentContainer(element: LinkedomElement): boolean {
  const classAndId = `${element.getAttribute("class") ?? ""} ${element.getAttribute("id") ?? ""}`;
  if (COMMENT_MARKER.test(classAndId)) return true;
  const itemprop = element.getAttribute("itemprop") ?? "";
  const itemtype = element.getAttribute("itemtype") ?? "";
  return COMMENT_MARKER.test(itemprop) || /\/Comment$/i.test(itemtype);
}

/**
 * Deletes comment-shaped containers from `document` in place. Returns how
 * many were removed, so callers can tell "nothing looked like a comment"
 * apart from "comments were removed."
 */
export function stripCommentContainers(document: LinkedomDocument): number {
  const matches = Array.from<LinkedomElement>(
    document.querySelectorAll("*"),
  ).filter(looksLikeCommentContainer);
  for (const element of matches) {
    element.remove();
  }
  return matches.length;
}

function extractArticleContent(document: LinkedomDocument): string | undefined {
  return new Readability(document).parse()?.content?.trim();
}

// When nothing content-shaped survives stripping, Readability doesn't fail
// cleanly — with no real candidate to score, it falls back to the page
// body itself, so a leftover nav/footer sliver comes back as "the article"
// instead of an empty result. This checks the stripped DOM directly, ahead
// of running Readability at all, for a plausible content candidate — a
// slightly wider net than Readability's own scoring tags (adding `li` for
// pages whose body is a bullet-point summary rather than prose).
const CONTENT_SHAPED_TAGS = new Set([
  "section",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "p",
  "td",
  "pre",
  "li",
  "blockquote",
]);
const MIN_CONTENT_TEXT_LENGTH = 40;

function hasContentShapedText(document: LinkedomDocument): boolean {
  return Array.from<LinkedomElement>(document.querySelectorAll("*")).some(
    (element) =>
      CONTENT_SHAPED_TAGS.has(element.tagName.toLowerCase()) &&
      (element.textContent ?? "").trim().length >= MIN_CONTENT_TEXT_LENGTH,
  );
}

/**
 * Pure HTML-in, article-HTML-out: separated from `extract()` below so the
 * strip/fallback algorithm can be unit tested without real network I/O.
 */
export function extractReadableContent(html: string): string | undefined {
  const { document } = parseHTML(html);
  const stripped = stripCommentContainers(document);

  // A feed item can link straight to one reply/comment post rather than its
  // parent thread (e.g. a Discourse per-post URL), in which case that post
  // is the *only* real content on the page and stripping just removed it.
  // Re-parse the untouched HTML and let Readability's own heuristics do
  // their best with it, rather than settling for whatever chrome is left.
  if (stripped > 0 && !hasContentShapedText(document)) {
    return extractArticleContent(parseHTML(html).document);
  }
  return extractArticleContent(document);
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
        const content = extractReadableContent(html);
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
