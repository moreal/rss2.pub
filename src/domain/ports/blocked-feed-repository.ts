import type { FeedUrl } from "../feed/feed-url.js";

export type BlockedFeedRepository = {
  isBlocked(url: FeedUrl): Promise<boolean>;
  block(url: FeedUrl, reason: string): Promise<void>;
};
