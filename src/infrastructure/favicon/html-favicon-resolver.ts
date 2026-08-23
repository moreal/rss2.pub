import { parseHTML } from "linkedom";
import type {
  FaviconResolver,
  ResolveFaviconError,
  ResolvedFavicon,
} from "../../domain/ports/favicon-resolver.js";
import { err, ok, type Result } from "../../shared/result.js";

function messageOf(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}

type ParsedDocument = ReturnType<typeof parseHTML>["document"];

/** Higher-priority rels first — `apple-touch-icon` is typically much higher
 * resolution than a bare `favicon.ico`, which matters for an actor avatar. */
const REL_PRIORITY: readonly { readonly pattern: RegExp; readonly score: number }[] = [
  { pattern: /^apple-touch-icon(-precomposed)?$/i, score: 2 },
  { pattern: /icon/i, score: 1 },
];

function relScore(rel: string): number {
  for (const { pattern, score } of REL_PRIORITY) {
    if (pattern.test(rel.trim())) return score;
  }
  return 0;
}

function sizeScore(sizes: string | null): number {
  const match = sizes === null ? null : /(\d+)x(\d+)/i.exec(sizes);
  return match ? Number(match[1]) * Number(match[2]) : 0;
}

/**
 * FaviconResolver adapter (ADR-0010): fetches a site's homepage HTML and
 * looks for `<link rel="*icon*">` tags, preferring higher-resolution/priority
 * rels; falls back to probing `/favicon.ico` when none are declared.
 */
export function createHtmlFaviconResolver(options?: {
  readonly timeoutMs?: number;
  readonly userAgent?: string;
}): FaviconResolver {
  const timeoutMs = options?.timeoutMs ?? 15_000;
  // See readability-extractor.ts: a bare "rss2.pub (+url)" UA gets 403'd by
  // WAFs that require a "Mozilla/5.0" prefix; this form clears that while
  // staying honestly self-identified as a bot.
  const userAgent =
    options?.userAgent ??
    "Mozilla/5.0 (compatible; rss2.pub/1.0; +https://rss2.pub)";

  async function respondsOk(url: string): Promise<boolean> {
    try {
      const response = await fetch(url, {
        method: "HEAD",
        headers: { "user-agent": userAgent },
        redirect: "follow",
        signal: AbortSignal.timeout(timeoutMs),
      });
      return response.ok;
    } catch {
      return false;
    }
  }

  function bestIconLink(document: ParsedDocument, pageUrl: string): string | null {
    const links = [...document.querySelectorAll("link")];
    let best: { readonly href: string; readonly rel: number; readonly size: number } | null =
      null;
    for (const link of links) {
      const rel = link.getAttribute("rel");
      const href = link.getAttribute("href");
      if (rel === null || href === null || href.trim() === "") continue;
      const score = relScore(rel);
      if (score === 0) continue;
      const size = sizeScore(link.getAttribute("sizes"));
      if (best === null || score > best.rel || (score === best.rel && size > best.size)) {
        best = { href, rel: score, size };
      }
    }
    if (best === null) return null;
    try {
      return new URL(best.href, pageUrl).href;
    } catch {
      return null;
    }
  }

  return {
    async resolve(pageUrl): Promise<Result<ResolvedFavicon, ResolveFaviconError>> {
      let html: string;
      try {
        const response = await fetch(pageUrl, {
          headers: { accept: "text/html", "user-agent": userAgent },
          redirect: "follow",
          signal: AbortSignal.timeout(timeoutMs),
        });
        if (!response.ok) {
          return err({
            type: "RequestFailed",
            url: pageUrl,
            message: `HTTP ${response.status}`,
          });
        }
        html = await response.text();
      } catch (cause) {
        return err({ type: "RequestFailed", url: pageUrl, message: messageOf(cause) });
      }

      const { document } = parseHTML(html);
      const declared = bestIconLink(document, pageUrl);
      if (declared !== null) return ok({ iconUrl: declared });

      const fallback = new URL("/favicon.ico", pageUrl).href;
      if (await respondsOk(fallback)) return ok({ iconUrl: fallback });

      return err({ type: "NotFound", url: pageUrl });
    },
  };
}
