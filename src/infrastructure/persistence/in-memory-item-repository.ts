import type { FeedId } from "../../domain/feed/feed.js";
import type { ItemKey } from "../../domain/feed/feed-item.js";
import type {
  ItemRepository,
  PublishedItemRecord,
} from "../../domain/ports/item-repository.js";

/** Reference implementation of ItemRepository (unit-test double). */
export function createInMemoryItemRepository(): ItemRepository {
  const seen = new Map<FeedId, Map<ItemKey, PublishedItemRecord>>();

  return {
    async findExisting(
      feedId: FeedId,
      keys: readonly ItemKey[],
    ): Promise<PublishedItemRecord[]> {
      const known = seen.get(feedId) ?? new Map<ItemKey, PublishedItemRecord>();
      const found: PublishedItemRecord[] = [];
      for (const key of keys) {
        const record = known.get(key);
        if (record !== undefined) found.push(record);
      }
      return found;
    },

    async markPublished(
      feedId: FeedId,
      records: readonly PublishedItemRecord[],
    ): Promise<void> {
      const known = seen.get(feedId) ?? new Map<ItemKey, PublishedItemRecord>();
      for (const record of records) {
        if (!known.has(record.key)) known.set(record.key, record);
      }
      seen.set(feedId, known);
    },

    async markUpdated(
      feedId: FeedId,
      key: ItemKey,
      contentFingerprint: string,
    ): Promise<void> {
      const known = seen.get(feedId);
      const record = known?.get(key);
      if (known === undefined || record === undefined) return;
      known.set(key, { ...record, contentFingerprint });
    },

    async removeAllOf(feedId: FeedId): Promise<void> {
      seen.delete(feedId);
    },
  };
}
