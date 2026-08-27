import type { FeedId } from "../feed/feed.js";
import type { ItemKey } from "../feed/feed-item.js";
import type { MessageUri } from "./federation-gateway.js";

export type PublishedItemRecord = {
  readonly key: ItemKey;
  readonly publishedAt: Date;
  /** Fingerprint of the feed-provided fields as last published/updated. */
  readonly contentFingerprint: string;
  /** The federated object's own URI, used to locate it for an edit. `null`
   * only for rows written before content-change tracking existed. */
  readonly messageUri: MessageUri | null;
};

/**
 * Remembers which item keys of a feed were already published — and what
 * their content looked like — so a poll never announces the same entry
 * twice, and can tell a genuine content change from a re-fetch of the same
 * entry.
 */
export type ItemRepository = {
  /** Returns existing records among `keys` (only the ones found), any order. */
  findExisting(
    feedId: FeedId,
    keys: readonly ItemKey[],
  ): Promise<PublishedItemRecord[]>;
  markPublished(
    feedId: FeedId,
    records: readonly PublishedItemRecord[],
  ): Promise<void>;
  /** Adopts a new fingerprint after a content change was handled (or, for a
   * pre-migration row with no `messageUri`, silently backfilled). */
  markUpdated(
    feedId: FeedId,
    key: ItemKey,
    contentFingerprint: string,
  ): Promise<void>;
  removeAllOf(feedId: FeedId): Promise<void>;
};
