import { eq } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import type { BlockedFeedRepository } from "../../domain/ports/blocked-feed-repository.js";
import { blockedFeeds } from "./schema.js";

export function createDrizzleBlockedFeedRepository(db: PostgresJsDatabase): BlockedFeedRepository {
  return {
    async isBlocked(url) {
      const rows = await db.select({ url: blockedFeeds.url }).from(blockedFeeds)
        .where(eq(blockedFeeds.url, url)).limit(1);
      return rows.length > 0;
    },
    async block(url, reason) {
      await db.insert(blockedFeeds).values({ url, reason, blockedAt: new Date() })
        .onConflictDoUpdate({ target: blockedFeeds.url, set: { reason, blockedAt: new Date() } });
    },
  };
}
