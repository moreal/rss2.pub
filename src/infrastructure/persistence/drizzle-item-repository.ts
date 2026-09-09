import { and, eq, inArray } from "drizzle-orm";
import type { ItemKey } from "../../domain/feed/feed-item.js";
import type { MessageUri } from "../../domain/ports/federation-gateway.js";
import type { ItemRepository } from "../../domain/ports/item-repository.js";
import type { Database } from "./drizzle-feed-repository.js";
import { publishedItems } from "./schema.js";

export function createDrizzleItemRepository(db: Database): ItemRepository {
  return {
    async findExisting(feedId, keys) {
      if (keys.length === 0) return [];
      const rows = await db
        .select({
          key: publishedItems.key,
          publishedAt: publishedItems.publishedAt,
          contentFingerprint: publishedItems.contentFingerprint,
          messageUri: publishedItems.messageUri,
          fullContentUsed: publishedItems.fullContentUsed,
          extractFailures: publishedItems.extractFailures,
          extractNextAttemptAt: publishedItems.extractNextAttemptAt,
        })
        .from(publishedItems)
        .where(
          and(
            eq(publishedItems.feedId, feedId),
            inArray(publishedItems.key, [...keys]),
          ),
        );
      return rows.map((row) => ({
        key: row.key as ItemKey,
        publishedAt: row.publishedAt,
        contentFingerprint: row.contentFingerprint ?? "",
        messageUri: row.messageUri as MessageUri | null,
        fullContentUsed: row.fullContentUsed,
        extractRetry: {
          failures: row.extractFailures,
          nextAttemptAt: row.extractNextAttemptAt,
        },
      }));
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
            contentFingerprint: record.contentFingerprint,
            messageUri: record.messageUri,
            fullContentUsed: record.fullContentUsed,
            extractFailures: record.extractRetry.failures,
            extractNextAttemptAt: record.extractRetry.nextAttemptAt,
          })),
        )
        .onConflictDoNothing();
    },

    async markUpdated(feedId, key, contentFingerprint) {
      await db
        .update(publishedItems)
        .set({ contentFingerprint })
        .where(and(eq(publishedItems.feedId, feedId), eq(publishedItems.key, key)));
    },

    async markExtraction(feedId, key, state) {
      await db
        .update(publishedItems)
        .set({
          fullContentUsed: state.fullContentUsed,
          extractFailures: state.extractRetry.failures,
          extractNextAttemptAt: state.extractRetry.nextAttemptAt,
        })
        .where(and(eq(publishedItems.feedId, feedId), eq(publishedItems.key, key)));
    },

    async removeAllOf(feedId) {
      await db.delete(publishedItems).where(eq(publishedItems.feedId, feedId));
    },
  };
}
