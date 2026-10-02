import type { FeedTitle } from "./feed.js";
import type { FeedUrl } from "./feed-url.js";

/** A readable, unblocked feed offered for an explicit registration choice. */
export type FeedCandidate = {
  readonly url: FeedUrl;
  readonly title: FeedTitle | null;
  readonly description: string | null;
  readonly recentTitles: readonly string[];
  readonly registered: boolean;
};
