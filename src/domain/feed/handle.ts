import type { Brand } from "../../shared/brand.js";
import { err, ok, type Result } from "../../shared/result.js";
import { sha256Hex } from "../../shared/sha256.js";
import type { FeedUrl } from "./feed-url.js";

/**
 * Fediverse username of a feed actor (ADR-0004). Charset `[a-z0-9_]`, max 30
 * chars — the portable intersection across Mastodon/Misskey/Pleroma/Lemmy.
 * Derived deterministically from the canonical feed URL: the normalized stem
 * is truncated to 22 chars and always suffixed with `_` + 7 base36 chars of
 * the URL's SHA-256, keeping the total within 22 + 1 + 7 = 30.
 */
export type Handle = Brand<string, "Handle">;

export type InvalidHandle = {
  readonly type: "InvalidHandle";
  readonly raw: string;
};

const STEM_MAX = 22;
const HASH_LENGTH = 7;
const HANDLE_PATTERN = /^[a-z0-9_]{1,30}$/;

function hashSuffix(url: FeedUrl): string {
  const base36 = BigInt(`0x${sha256Hex(url)}`).toString(36);
  return base36.slice(0, HASH_LENGTH).padEnd(HASH_LENGTH, "0");
}

function normalizeStem(source: string): string {
  return source
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+/, "")
    .replace(/_+$/, "");
}

function stemOf(url: FeedUrl): string {
  const parsed = new URL(url);
  return normalizeStem(parsed.host + parsed.pathname + parsed.search);
}

export const Handle = {
  /**
   * Deterministic handle for a feed URL: the normalized stem, truncated to
   * 22 chars, always suffixed with a 7-char hash of the URL — normalization
   * is lossy (`a-b.com` and `a.b.com` share a stem), so the hash keeps
   * different URLs from ever landing on the same handle.
   */
  fromFeedUrl(url: FeedUrl): Handle {
    const cut = stemOf(url).slice(0, STEM_MAX).replace(/_+$/, "");
    const prefix = cut.length === 0 ? "feed" : cut;
    return `${prefix}_${hashSuffix(url)}` as Handle;
  },

  /** Parses an externally supplied handle (WebFinger identifier, URL path). */
  create(raw: string): Result<Handle, InvalidHandle> {
    const lowered = raw.trim().toLowerCase();
    return HANDLE_PATTERN.test(lowered)
      ? ok(lowered as Handle)
      : err({ type: "InvalidHandle", raw });
  },
} as const;
