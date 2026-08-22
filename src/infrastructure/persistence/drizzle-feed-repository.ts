import { and, asc, desc, eq, ilike, lte, or, sql } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import {
  type CacheValidators,
  type Feed,
  FeedId,
  FeedTitle,
} from "../../domain/feed/feed.js";
import { FeedUrl } from "../../domain/feed/feed-url.js";
import { Handle } from "../../domain/feed/handle.js";
import type {
  FeedRepository,
  PopularFeed,
} from "../../domain/ports/feed-repository.js";
import { isOk, type Result } from "../../shared/result.js";
import { feeds } from "./schema.js";

export type Database = PostgresJsDatabase<Record<string, never>>;

type FeedRow = typeof feeds.$inferSelect;

function parseOrCorrupt<T, E>(result: Result<T, E>, column: string): T {
  if (!isOk(result)) {
    throw new Error(
      `corrupt feeds row: ${column} failed domain validation: ${JSON.stringify(result.error)}`,
    );
  }
  return result.value;
}

function rowToFeed(row: FeedRow): Feed {
  const validators: CacheValidators = {
    etag: row.etag,
    lastModified: row.lastModified,
  };
  return {
    id: parseOrCorrupt(FeedId.create(row.id), "id"),
    url: parseOrCorrupt(FeedUrl.create(row.url), "url"),
    handle: parseOrCorrupt(Handle.create(row.handle), "handle"),
    title:
      row.title === null
        ? null
        : parseOrCorrupt(FeedTitle.create(row.title), "title"),
    description: row.description,
    fullContentEnabled: row.fullContentEnabled,
    registeredAt: row.registeredAt,
    validators,
    consecutiveFailures: row.consecutiveFailures,
    nextPollAt: row.nextPollAt,
  };
}

function feedToRow(feed: Feed): Omit<FeedRow, "followerCount"> {
  return {
    id: feed.id,
    url: feed.url,
    handle: feed.handle,
    fullContentEnabled: feed.fullContentEnabled,
    title: feed.title,
    description: feed.description,
    registeredAt: feed.registeredAt,
    etag: feed.validators.etag,
    lastModified: feed.validators.lastModified,
    consecutiveFailures: feed.consecutiveFailures,
    nextPollAt: feed.nextPollAt,
  };
}

function escapeLike(keyword: string): string {
  return keyword.replace(/[\\%_]/g, (ch) => `\\${ch}`);
}

export function createDrizzleFeedRepository(db: Database): FeedRepository {
  async function firstOrNull(rows: FeedRow[]): Promise<Feed | null> {
    const row = rows[0];
    return row === undefined ? null : rowToFeed(row);
  }

  return {
    async save(feed) {
      const row = feedToRow(feed);
      await db
        .insert(feeds)
        .values(row)
        .onConflictDoUpdate({ target: feeds.id, set: row });
    },

    async findById(id) {
      return firstOrNull(
        await db.select().from(feeds).where(eq(feeds.id, id)).limit(1),
      );
    },

    async findByUrl(url, fullContentEnabled = false) {
      return firstOrNull(
        await db
          .select()
          .from(feeds)
          .where(
            and(
              eq(feeds.url, url),
              eq(feeds.fullContentEnabled, fullContentEnabled),
            ),
          )
          .limit(1),
      );
    },

    async findByHandle(handle) {
      return firstOrNull(
        await db.select().from(feeds).where(eq(feeds.handle, handle)).limit(1),
      );
    },

    async listDue(now) {
      const rows = await db
        .select()
        .from(feeds)
        .where(lte(feeds.nextPollAt, now))
        .orderBy(asc(feeds.nextPollAt));
      return rows.map(rowToFeed);
    },

    async search(keyword, limit) {
      const pattern = `%${escapeLike(keyword)}%`;
      const rows = await db
        .select()
        .from(feeds)
        .where(
          or(
            ilike(feeds.handle, pattern),
            ilike(feeds.title, pattern),
            ilike(feeds.description, pattern),
            ilike(feeds.url, pattern),
          ),
        )
        .orderBy(asc(feeds.handle))
        .limit(limit);
      return rows.map(rowToFeed);
    },

    async listPopular(limit) {
      const rows = await db
        .select()
        .from(feeds)
        .orderBy(desc(feeds.followerCount), asc(feeds.handle))
        .limit(limit);
      return rows.map(
        (row): PopularFeed => ({
          feed: rowToFeed(row),
          followerCount: row.followerCount,
        }),
      );
    },

    async adjustFollowerCount(id, delta) {
      await db
        .update(feeds)
        .set({
          followerCount: sql`GREATEST(0, ${feeds.followerCount} + ${delta})`,
        })
        .where(eq(feeds.id, id));
    },

    async remove(id) {
      await db.delete(feeds).where(eq(feeds.id, id));
    },
  };
}

/** Follower count read access for adapters that need it (web UI badges). */
export async function followerCountOf(
  db: Database,
  id: FeedId,
): Promise<number> {
  const row = await db
    .select({ followerCount: feeds.followerCount })
    .from(feeds)
    .where(and(eq(feeds.id, id)))
    .limit(1);
  return row[0]?.followerCount ?? 0;
}
