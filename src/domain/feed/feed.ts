import type { Brand } from "../../shared/brand.js";
import { err, ok, type Result } from "../../shared/result.js";
import { sha256Hex } from "../../shared/sha256.js";
import type { FeedUrl } from "./feed-url.js";
import type { Handle } from "./handle.js";

/**
 * Deterministic feed identity: SHA-256 hex of the canonical feed URL and
 * content mode. A URL registered both as teaser and as full-content
 * (ADR-0009) yields two distinct ids — `fullContentEnabled` defaults to
 * `false` so existing callers keep deriving today's id unchanged.
 */
export type FeedId = Brand<string, "FeedId">;

export type InvalidFeedId = {
  readonly type: "InvalidFeedId";
  readonly raw: string;
};

const FEED_ID_PATTERN = /^[0-9a-f]{64}$/;

export const FeedId = {
  fromUrl(url: FeedUrl, fullContentEnabled = false): FeedId {
    return sha256Hex(fullContentEnabled ? `${url}\nfull` : url) as FeedId;
  },
  create(raw: string): Result<FeedId, InvalidFeedId> {
    return FEED_ID_PATTERN.test(raw)
      ? ok(raw as FeedId)
      : err({ type: "InvalidFeedId", raw });
  },
} as const;

/** Display title: whitespace-collapsed, non-empty, at most 200 chars. */
export type FeedTitle = Brand<string, "FeedTitle">;

export type EmptyFeedTitle = { readonly type: "EmptyFeedTitle" };

const TITLE_MAX = 200;

export const FeedTitle = {
  create(raw: string): Result<FeedTitle, EmptyFeedTitle> {
    const normalized = raw.replace(/\s+/g, " ").trim();
    if (normalized.length === 0) return err({ type: "EmptyFeedTitle" });
    const bounded =
      normalized.length > TITLE_MAX
        ? `${normalized.slice(0, TITLE_MAX - 1).trimEnd()}…`
        : normalized;
    return ok(bounded as FeedTitle);
  },
} as const;

/** HTTP cache validators from the last successful poll (conditional GET). */
export type CacheValidators = {
  readonly etag: string | null;
  readonly lastModified: string | null;
};

export const NO_VALIDATORS: CacheValidators = { etag: null, lastModified: null };

export type Feed = {
  readonly id: FeedId;
  readonly url: FeedUrl;
  readonly handle: Handle;
  readonly title: FeedTitle | null;
  readonly description: string | null;
  /** Opt-in per ADR-0009: fetch each item's original page and extract its
   * main content instead of publishing the feed-provided teaser. */
  readonly fullContentEnabled: boolean;
  readonly registeredAt: Date;
  readonly validators: CacheValidators;
  readonly consecutiveFailures: number;
  readonly nextPollAt: Date;
};

export const Feed = {
  register(params: {
    readonly url: FeedUrl;
    readonly handle: Handle;
    readonly title: FeedTitle | null;
    readonly description: string | null;
    readonly fullContentEnabled?: boolean;
    readonly now: Date;
  }): Feed {
    const fullContentEnabled = params.fullContentEnabled ?? false;
    return {
      id: FeedId.fromUrl(params.url, fullContentEnabled),
      url: params.url,
      handle: params.handle,
      title: params.title,
      description: params.description,
      fullContentEnabled,
      registeredAt: params.now,
      validators: NO_VALIDATORS,
      consecutiveFailures: 0,
      nextPollAt: params.now,
    };
  },

  /** Refreshes actor-facing metadata discovered while polling. */
  withMetadata(
    feed: Feed,
    metadata: {
      readonly title: FeedTitle | null;
      readonly description: string | null;
    },
  ): Feed {
    return {
      ...feed,
      title: metadata.title ?? feed.title,
      description: metadata.description ?? feed.description,
    };
  },

  displayName(feed: Feed): string {
    return feed.title ?? feed.handle;
  },
} as const;
