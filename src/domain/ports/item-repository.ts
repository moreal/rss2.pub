import type { FeedId } from "../feed/feed.js";
import type { ItemKey } from "../feed/feed-item.js";

export type PublishedItemRecord = {
  readonly key: ItemKey;
  readonly publishedAt: Date;
};

/**
 * Remembers which item keys of a feed were already published, so a poll
 * never announces the same entry twice.
 */
export type ItemRepository = {
  /** Returns the subset of `keys` not seen before, preserving input order. */
  filterNew(feedId: FeedId, keys: readonly ItemKey[]): Promise<ItemKey[]>;
  markPublished(
    feedId: FeedId,
    records: readonly PublishedItemRecord[],
  ): Promise<void>;
  removeAllOf(feedId: FeedId): Promise<void>;
};
