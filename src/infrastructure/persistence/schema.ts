import {
  boolean,
  index,
  integer,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

/**
 * Domain tables only. Fedify KV/queue and BotKit repository tables live in
 * the same database but are created and owned by those libraries.
 */
export const feeds = pgTable(
  "feeds",
  {
    id: text("id").primaryKey(),
    // Not globally unique on its own — a URL may be registered once per
    // content mode (ADR-0009); see feeds_url_full_content_enabled_idx.
    url: text("url").notNull(),
    handle: text("handle").notNull().unique(),
    fullContentEnabled: boolean("full_content_enabled").notNull().default(false),
    title: text("title"),
    description: text("description"),
    // Actor avatar resolved from the channel link's favicon (ADR-0010).
    iconUrl: text("icon_url"),
    registeredAt: timestamp("registered_at", { withTimezone: true }).notNull(),
    etag: text("etag"),
    lastModified: text("last_modified"),
    consecutiveFailures: integer("consecutive_failures").notNull().default(0),
    nextPollAt: timestamp("next_poll_at", { withTimezone: true }).notNull(),
    followerCount: integer("follower_count").notNull().default(0),
  },
  (table) => [
    index("feeds_next_poll_at_idx").on(table.nextPollAt),
    index("feeds_follower_count_idx").on(table.followerCount),
    uniqueIndex("feeds_url_full_content_enabled_idx").on(
      table.url,
      table.fullContentEnabled,
    ),
  ],
);

export const publishedItems = pgTable(
  "published_items",
  {
    feedId: text("feed_id")
      .notNull()
      .references(() => feeds.id, { onDelete: "cascade" }),
    key: text("key").notNull(),
    publishedAt: timestamp("published_at", { withTimezone: true }).notNull(),
  },
  (table) => [primaryKey({ columns: [table.feedId, table.key] })],
);
