import type { Brand } from "../../shared/brand.js";
import { err, ok, type Result } from "../../shared/result.js";
import { sha256Hex } from "../../shared/sha256.js";
import type { FeedUrl } from "./feed-url.js";

/**
 * Fediverse username of a feed actor (ADR-0004). Charset `[a-z0-9_]`, max 30
 * chars — the portable intersection across Mastodon/Misskey/Pleroma/Lemmy.
 * Derived deterministically from the canonical feed URL: when the normalized
 * stem exceeds 22 chars (or is degenerate), it is truncated and suffixed with
 * 7 base36 chars of the URL's SHA-256, keeping the total within 22 + 1 + 7 = 30.
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
  /** Primary deterministic handle for a feed URL. */
  fromFeedUrl(url: FeedUrl): Handle {
    const stem = stemOf(url);
    if (stem.length === 0 || stem.length > STEM_MAX) {
      return Handle.disambiguated(url);
    }
    return stem as Handle;
  },

  /**
   * Hash-suffixed form. Used when the stem overflows or is empty, and as the
   * fallback when the primary handle is already taken by a different URL —
   * normalization is lossy (`a-b.com` and `a.b.com` share a stem), so
   * registration must be able to disambiguate deterministically.
   */
  disambiguated(url: FeedUrl): Handle {
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
