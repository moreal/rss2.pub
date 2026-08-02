import type { Feed, FeedId } from "../feed/feed.js";
import type { FeedUrl } from "../feed/feed-url.js";
import type { Handle } from "../feed/handle.js";

export type PopularFeed = {
  readonly feed: Feed;
  readonly followerCount: number;
};

/**
 * Persistence port for the Feed aggregate. Implementations throw only on
 * infrastructure failure (broken connection etc.); absence is `null`, and
 * `save` upserts by feed id.
 */
export type FeedRepository = {
  save(feed: Feed): Promise<void>;
  findById(id: FeedId): Promise<Feed | null>;
  findByUrl(url: FeedUrl): Promise<Feed | null>;
  findByHandle(handle: Handle): Promise<Feed | null>;
  /** Feeds whose nextPollAt is at or before `now`. */
  listDue(now: Date): Promise<Feed[]>;
  /** Case-insensitive match over handle, title, description, and URL. */
  search(keyword: string, limit: number): Promise<Feed[]>;
  listPopular(limit: number): Promise<PopularFeed[]>;
  adjustFollowerCount(id: FeedId, delta: number): Promise<void>;
  remove(id: FeedId): Promise<void>;
};
