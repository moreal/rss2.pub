import {
  Feed,
  type FeedTitle,
  FeedTitle as FeedTitleFactory,
  NO_VALIDATORS,
} from "../domain/feed/feed.js";
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
  execute(rawUrl: string): Promise<Result<RegisterFeedResult, RegisterFeedError>>;
};

function titleFrom(raw: string | null): FeedTitle | null {
  if (raw === null) return null;
  const result = FeedTitleFactory.create(raw);
  return isOk(result) ? result.value : null;
}

/**
 * Registers a feed as a new actor. The URL is canonicalized, fetched once to
 * prove it is a working RSS/Atom document (and to seed title/description),
 * and the handle is disambiguated if another feed already normalized to it.
 * Item backlog is left to the first poll — one publishing code path.
 */
export function createRegisterFeed(deps: {
  readonly feeds: FeedRepository;
  readonly fetcher: FeedFetcher;
  readonly clock: Clock;
}): RegisterFeed {
  return {
    async execute(rawUrl) {
      const urlResult = FeedUrl.create(rawUrl);
      if (!urlResult.ok) return urlResult;
      const url = urlResult.value;

      const existing = await deps.feeds.findByUrl(url);
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
          : { title: null, description: null };

      let handle = Handle.fromFeedUrl(url);
      if ((await deps.feeds.findByHandle(handle)) !== null) {
        handle = Handle.disambiguated(url);
      }

      const feed = Feed.register({
        url,
        handle,
        title: titleFrom(metadata.title),
        description: metadata.description,
        now: deps.clock.now(),
      });
      await deps.feeds.save(feed);
      return ok({ feed, created: true });
    },
  };
}
