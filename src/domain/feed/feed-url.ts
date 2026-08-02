import type { Brand } from "../../shared/brand.js";
import { err, ok, type Result } from "../../shared/result.js";

/**
 * Canonical absolute http(s) URL of a feed. Canonicalization comes from the
 * WHATWG URL parser: lowercased scheme/host, punycoded host, default port
 * stripped, fragment removed, plus an explicit empty-query strip. The
 * canonical string is the feed's natural key — FeedId and Handle derive from it.
 */
export type FeedUrl = Brand<string, "FeedUrl">;

export type InvalidFeedUrl =
  | { readonly type: "NotAUrl"; readonly raw: string }
  | {
      readonly type: "UnsupportedProtocol";
      readonly raw: string;
      readonly protocol: string;
    };

export const FeedUrl = {
  create(raw: string): Result<FeedUrl, InvalidFeedUrl> {
    let parsed: URL;
    try {
      parsed = new URL(raw.trim());
    } catch {
      return err({ type: "NotAUrl", raw });
    }
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return err({
        type: "UnsupportedProtocol",
        raw,
        protocol: parsed.protocol,
      });
    }
    parsed.hash = "";
    const href =
      parsed.search === "" && parsed.href.endsWith("?")
        ? parsed.href.slice(0, -1)
        : parsed.href;
    return ok(href as FeedUrl);
  },
} as const;
