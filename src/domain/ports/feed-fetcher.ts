import type { Result } from "../../shared/result.js";
import type { CacheValidators } from "../feed/feed.js";
import type { RawFeedItem } from "../feed/feed-item.js";
import type { FeedUrl } from "../feed/feed-url.js";

export type FetchedFeed = {
  readonly title: string | null;
  readonly description: string | null;
  /** The channel's own homepage link (RSS `channel.link` / Atom `alternate`),
   * not the feed document's own URL — the source for ADR-0010 favicon lookup. */
  readonly link: string | null;
  readonly items: readonly RawFeedItem[];
};

export type FetchFeedError =
  | {
      readonly type: "RequestFailed";
      readonly url: FeedUrl;
      readonly message: string;
    }
  | {
      readonly type: "InvalidFeedFormat";
      readonly url: FeedUrl;
      readonly message: string;
    };

export type FetchFeedSuccess =
  | { readonly status: "not-modified" }
  | {
      readonly status: "fetched";
      readonly feed: FetchedFeed;
      readonly validators: CacheValidators;
    };

/**
 * Retrieves and parses an RSS 2.0 / Atom document. Passing the previous
 * poll's validators enables conditional GET (`not-modified`).
 */
export type FeedFetcher = {
  fetch(
    url: FeedUrl,
    validators: CacheValidators,
  ): Promise<Result<FetchFeedSuccess, FetchFeedError>>;
};
