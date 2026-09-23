import { parseHTML } from "linkedom";
import type {
  FaviconResolver,
  ResolveFaviconError,
  ResolvedFavicon,
} from "../../domain/ports/favicon-resolver.js";
import { err, ok, type Result } from "../../shared/result.js";
import { fetchPublicUrl } from "../feedfetch/public-fetch.js";

function messageOf(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}

type ParsedDocument = ReturnType<typeof parseHTML>["document"];
const MAX_HTML_BYTES = 1024 * 1024;

async function readBoundedHtml(body: ReadableStream<Uint8Array> | null): Promise<string> {
  if (body === null) return "";
  const reader = body.getReader();
  const decoder = new TextDecoder("utf-8");
  let html = "";
  let bytes = 0;
  while (true) {
    const chunk = await reader.read();
    if (chunk.done) return html + decoder.decode();
    bytes += chunk.value.byteLength;
    if (bytes > MAX_HTML_BYTES) {
      await reader.cancel().catch(() => undefined);
      throw new Error(`favicon HTML exceeds ${MAX_HTML_BYTES} bytes`);
    }
    html += decoder.decode(chunk.value, { stream: true });
  }
}

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
  readonly allowPrivateAddress?: boolean;
  readonly fetchImpl?: typeof fetch;
}): FaviconResolver {
  const timeoutMs = options?.timeoutMs ?? 15_000;
  // A bare "rss2.pub (+url)" UA gets 403'd by
  // WAFs that require a "Mozilla/5.0" prefix; this form clears that while
  // staying honestly self-identified as a bot.
  const userAgent =
    options?.userAgent ??
    "Mozilla/5.0 (compatible; rss2.pub/1.0; +https://rss2.pub)";

  async function respondsOk(url: string): Promise<boolean> {
    try {
      const response = await fetchPublicUrl(url, {
        method: "HEAD",
        headers: { "user-agent": userAgent },
        signal: AbortSignal.timeout(timeoutMs),
      }, {
        allowPrivateAddress: options?.allowPrivateAddress === true,
        ...(options?.fetchImpl === undefined ? {} : { fetchImpl: options.fetchImpl }),
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
      let finalPageUrl = pageUrl;
      try {
        const response = await fetchPublicUrl(pageUrl, {
          headers: { accept: "text/html", "user-agent": userAgent },
          signal: AbortSignal.timeout(timeoutMs),
        }, {
          allowPrivateAddress: options?.allowPrivateAddress === true,
          ...(options?.fetchImpl === undefined ? {} : { fetchImpl: options.fetchImpl }),
        });
        if (!response.ok) {
          return err({
            type: "RequestFailed",
            url: pageUrl,
            message: `HTTP ${response.status}`,
          });
        }
        html = await readBoundedHtml(response.body);
        finalPageUrl = response.url || pageUrl;
      } catch (cause) {
        return err({ type: "RequestFailed", url: pageUrl, message: messageOf(cause) });
      }

      const { document } = parseHTML(html);
      const declared = bestIconLink(document, finalPageUrl);
      if (declared !== null) return ok({ iconUrl: declared });

      const fallback = new URL("/favicon.ico", finalPageUrl).href;
      if (await respondsOk(fallback)) return ok({ iconUrl: fallback });

      return err({ type: "NotFound", url: pageUrl });
    },
  };
}
