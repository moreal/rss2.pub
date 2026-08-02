import type { Feed } from "../domain/feed/feed.js";
import type {
  FeedRepository,
  PopularFeed,
} from "../domain/ports/feed-repository.js";
import { err, ok, type Result } from "../shared/result.js";

export type SearchFeedsError = { readonly type: "EmptyQuery" };

export type SearchFeeds = {
  execute(rawKeyword: string): Promise<Result<Feed[], SearchFeedsError>>;
};

const SEARCH_LIMIT = 10;

export function createSearchFeeds(deps: {
  readonly feeds: FeedRepository;
}): SearchFeeds {
  return {
    async execute(rawKeyword) {
      const keyword = rawKeyword.trim();
      if (keyword.length === 0) return err({ type: "EmptyQuery" });
      return ok(await deps.feeds.search(keyword, SEARCH_LIMIT));
    },
  };
}

export type ListPopularFeeds = {
  execute(limit?: number): Promise<PopularFeed[]>;
};

const POPULAR_LIMIT = 20;

export function createListPopularFeeds(deps: {
  readonly feeds: FeedRepository;
}): ListPopularFeeds {
  return {
    async execute(limit = POPULAR_LIMIT) {
      return deps.feeds.listPopular(limit);
    },
  };
}
