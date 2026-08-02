import type { FeedId } from "../../domain/feed/feed.js";
import type { ItemKey } from "../../domain/feed/feed-item.js";
import type {
  ItemRepository,
  PublishedItemRecord,
} from "../../domain/ports/item-repository.js";

/** Reference implementation of ItemRepository (unit-test double). */
export function createInMemoryItemRepository(): ItemRepository {
  const seen = new Map<FeedId, Set<ItemKey>>();

  return {
    async filterNew(
      feedId: FeedId,
      keys: readonly ItemKey[],
    ): Promise<ItemKey[]> {
      const known = seen.get(feedId) ?? new Set<ItemKey>();
      const result: ItemKey[] = [];
      const inBatch = new Set<ItemKey>();
      for (const key of keys) {
        if (!known.has(key) && !inBatch.has(key)) {
          result.push(key);
          inBatch.add(key);
        }
      }
      return result;
    },

    async markPublished(
      feedId: FeedId,
      records: readonly PublishedItemRecord[],
    ): Promise<void> {
      const known = seen.get(feedId) ?? new Set<ItemKey>();
      for (const record of records) known.add(record.key);
      seen.set(feedId, known);
    },

    async removeAllOf(feedId: FeedId): Promise<void> {
      seen.delete(feedId);
    },
  };
}
