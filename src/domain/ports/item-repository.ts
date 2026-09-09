import type { FeedId } from "../feed/feed.js";
import type { ItemKey } from "../feed/feed-item.js";
import type { RetryState } from "../feed/retry-policy.js";
import type { MessageUri } from "./federation-gateway.js";

export type PublishedItemRecord = {
  readonly key: ItemKey;
  readonly publishedAt: Date;
  /** Fingerprint of the feed-provided fields as last published/updated. */
  readonly contentFingerprint: string;
  /** The federated object's own URI, used to locate it for an edit. `null`
   * only for rows written before content-change tracking existed. */
  readonly messageUri: MessageUri | null;
  /** True when the published object was built from extracted article content
   * rather than the feed's own teaser (ADR-0009). False for every item of a
   * teaser-mode feed, and for a full-content item whose extraction failed. */
  readonly fullContentUsed: boolean;
  /** Extraction retry budget for this item; only meaningful in full-content
   * mode, where a failed extraction is retried on a later poll and upgrades
   * the published object once it succeeds. */
  readonly extractRetry: RetryState;
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
  /** Records the outcome of a full-content extraction attempt, without
   * touching the fingerprint — an extraction retry is not a content change. */
  markExtraction(
    feedId: FeedId,
    key: ItemKey,
    state: {
      readonly fullContentUsed: boolean;
      readonly extractRetry: RetryState;
    },
  ): Promise<void>;
  removeAllOf(feedId: FeedId): Promise<void>;
};
