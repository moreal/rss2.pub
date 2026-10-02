import type { Result } from "../../shared/result.js";
import type { CacheValidators } from "../feed/feed.js";
import type { RawFeedItem } from "../feed/feed-item.js";
import type { FeedUrl } from "../feed/feed-url.js";

export type FetchedFeed = {
  readonly title: string | null;
  readonly description: string | null;
  /** The feed's own homepage link (Atom `alternate`), not the feed document's
   * own URL — the source for ADR-0010 favicon lookup. */
  readonly link: string | null;
  /** Raw BCP-47 tag from Atom `xml:lang` or RSS channel language.
   * Unvalidated — see `FeedLanguage.create`. */
  readonly language: string | null;
  /** RSS 2.0 channel generator, used to avoid duplicating Mastodon actors. */
  readonly generator?: string | null;
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
 * Retrieves and parses an Atom 1.0 or RSS 2.0 document. Passing the previous poll's
 * validators enables conditional GET (`not-modified`).
 */
/** Remaining time budget supplied by an orchestrating use case. */
export type FeedRequestBudget = { readonly timeoutMs: number };

export type FeedFetcher = {
  fetch(
    url: FeedUrl,
    validators: CacheValidators,
    budget?: FeedRequestBudget,
  ): Promise<Result<FetchFeedSuccess, FetchFeedError>>;
};
