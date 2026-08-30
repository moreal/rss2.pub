import {
  Feed,
  type FeedTitle,
  FeedTitle as FeedTitleFactory,
  NO_VALIDATORS,
} from "../domain/feed/feed.js";
import { FeedLanguage } from "../domain/feed/feed-language.js";
import {
  FeedUrl,
  type InvalidFeedUrl,
} from "../domain/feed/feed-url.js";
import { Handle } from "../domain/feed/handle.js";
import type { Clock } from "../domain/ports/clock.js";
import type { FeedFetcher } from "../domain/ports/feed-fetcher.js";
import type { FeedRepository } from "../domain/ports/feed-repository.js";
import { err, isOk, ok, type Result } from "../shared/result.js";

export type RegisterFeedError =
  | InvalidFeedUrl
  | {
      readonly type: "FeedUnreachable";
      readonly url: FeedUrl;
      readonly message: string;
    };

export type RegisterFeedResult = {
  readonly feed: Feed;
  /** false when the URL was already registered — the call is idempotent. */
  readonly created: boolean;
};

export type RegisterFeed = {
  execute(
    rawUrl: string,
    fullContentEnabled?: boolean,
  ): Promise<Result<RegisterFeedResult, RegisterFeedError>>;
};

function titleFrom(raw: string | null): FeedTitle | null {
  if (raw === null) return null;
  const result = FeedTitleFactory.create(raw);
  return isOk(result) ? result.value : null;
}

function languageFrom(raw: string | null): FeedLanguage | null {
  if (raw === null) return null;
  const result = FeedLanguage.create(raw);
  return isOk(result) ? result.value : null;
}

/**
 * Registers a feed as a new actor. The URL is canonicalized, fetched once to
 * prove it is a working Atom document (and to seed title/description),
 * and the handle is derived deterministically from the canonical URL
 * (ADR-0004 — always hash-suffixed, so different URLs never collide). Item
 * backlog is left to the first poll — one publishing code path.
 *
 * `fullContentEnabled` (ADR-0009, default `false`) opts the feed into
 * fetching each item's original page instead of publishing the feed's own
 * teaser. It is part of the feed's identity: registering the same URL again
 * with a different mode creates a second, separate actor rather than
 * mutating the first — each mode gets its own handle and description so
 * followers can tell them apart and choose which to follow.
 */
export function createRegisterFeed(deps: {
  readonly feeds: FeedRepository;
  readonly fetcher: FeedFetcher;
  readonly clock: Clock;
}): RegisterFeed {
  return {
    async execute(rawUrl, fullContentEnabled = false) {
      const urlResult = FeedUrl.create(rawUrl);
      if (!urlResult.ok) return urlResult;
      const url = urlResult.value;

      const existing = await deps.feeds.findByUrl(url, fullContentEnabled);
      if (existing !== null) return ok({ feed: existing, created: false });

      const fetched = await deps.fetcher.fetch(url, NO_VALIDATORS);
      if (!fetched.ok) {
        return err({
          type: "FeedUnreachable",
          url,
          message: fetched.error.message,
        });
      }
      const metadata =
        fetched.value.status === "fetched"
          ? fetched.value.feed
          : { title: null, description: null, language: null };

      const handle = Handle.fromFeedUrl(url, fullContentEnabled);

      const feed = Feed.register({
        url,
        handle,
        title: titleFrom(metadata.title),
        description: metadata.description,
        language: languageFrom(metadata.language),
        fullContentEnabled,
        now: deps.clock.now(),
      });
      await deps.feeds.save(feed);
      return ok({ feed, created: true });
    },
  };
}
