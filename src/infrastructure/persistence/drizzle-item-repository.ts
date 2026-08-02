import { and, eq, inArray } from "drizzle-orm";
import type { ItemKey } from "../../domain/feed/feed-item.js";
import type { ItemRepository } from "../../domain/ports/item-repository.js";
import type { Database } from "./drizzle-feed-repository.js";
import { publishedItems } from "./schema.js";

export function createDrizzleItemRepository(db: Database): ItemRepository {
  return {
    async filterNew(feedId, keys) {
      if (keys.length === 0) return [];
      const existing = await db
        .select({ key: publishedItems.key })
        .from(publishedItems)
        .where(
          and(
            eq(publishedItems.feedId, feedId),
            inArray(publishedItems.key, [...keys]),
          ),
        );
      const known = new Set(existing.map((row) => row.key));
      const fresh: ItemKey[] = [];
      const inBatch = new Set<ItemKey>();
      for (const key of keys) {
        if (!known.has(key) && !inBatch.has(key)) {
          fresh.push(key);
          inBatch.add(key);
        }
      }
      return fresh;
    },

    async markPublished(feedId, records) {
      if (records.length === 0) return;
      await db
        .insert(publishedItems)
        .values(
          records.map((record) => ({
            feedId,
            key: record.key,
            publishedAt: record.publishedAt,
          })),
        )
        .onConflictDoNothing();
    },

    async removeAllOf(feedId) {
      await db.delete(publishedItems).where(eq(publishedItems.feedId, feedId));
    },
  };
}
