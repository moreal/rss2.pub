import { parseHTML } from "linkedom";
import { FeedUrl } from "../../domain/feed/feed-url.js";
import type { FeedDiscoverer } from "../../domain/ports/feed-discoverer.js";
import { err, ok } from "../../shared/result.js";
import { fetchPublicUrl } from "./public-fetch.js";

const MAX_HTML_BYTES = 1024 * 1024;
const MAX_CANDIDATES = 8;

async function readHtml(body: ReadableStream<Uint8Array> | null): Promise<string> {
  if (body === null) return "";
  const reader = body.getReader();
  const decoder = new TextDecoder("utf-8", { fatal: true });
  let bytes = 0;
  let html = "";
  while (true) {
    const part = await reader.read();
    if (part.done) return html + decoder.decode();
    bytes += part.value.byteLength;
    if (bytes > MAX_HTML_BYTES) {
      await reader.cancel();
      throw new Error("website HTML is too large");
    }
    html += decoder.decode(part.value, { stream: true });
  }
}

export function createHtmlFeedDiscoverer(options?: {
  readonly timeoutMs?: number;
  readonly allowPrivateAddress?: boolean;
  readonly fetchImpl?: typeof fetch;
}): FeedDiscoverer {
  return {
    async discover(url) {
      try {
        const response = await fetchPublicUrl(url, {
          headers: {
            accept: "text/html",
            "user-agent": "Mozilla/5.0 (compatible; rss2.pub/1.0; +https://rss2.pub)",
          },
          signal: AbortSignal.timeout(options?.timeoutMs ?? 15_000),
        }, {
          allowPrivateAddress: options?.allowPrivateAddress === true,
          ...(options?.fetchImpl === undefined ? {} : { fetchImpl: options.fetchImpl }),
        });
        if (!response.ok || !response.headers.get("content-type")?.toLowerCase().includes("text/html")) {
          return ok([]);
        }
        const html = await readHtml(response.body);
        const base = response.url || url;
        const { document } = parseHTML(html);
        const found: FeedUrl[] = [];
        const seen = new Set<string>();
        for (const link of document.querySelectorAll("link")) {
          const rel = link.getAttribute("rel")?.toLowerCase().split(/\s+/) ?? [];
          const type = link.getAttribute("type")?.toLowerCase().split(";", 1)[0]?.trim();
          const href = link.getAttribute("href");
          if (!rel.includes("alternate") || !["application/atom+xml", "application/rss+xml"].includes(type ?? "") || !href) continue;
          let absolute: string;
          try {
            absolute = new URL(href, base).href;
          } catch {
            continue;
          }
          const parsed = FeedUrl.create(absolute);
          if (!parsed.ok || seen.has(parsed.value)) continue;
          seen.add(parsed.value);
          found.push(parsed.value);
          if (found.length === MAX_CANDIDATES) break;
        }
        return ok(found);
      } catch (cause) {
        return err(cause instanceof Error ? cause.message : String(cause));
      }
    },
  };
}
