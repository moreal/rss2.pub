import type { webcrypto } from "node:crypto";
import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import type { StoredMention } from "../federation/model.js";

/**
 * Domain and first-party federation tables. Fedify KV/queue tables live in
 * the same database but are created and owned by `@fedify/postgres`.
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
    // Last actor metadata version successfully enqueued to followers.
    actorProfileFingerprint: text("actor_profile_fingerprint"),
    // Atom feed-root xml:lang (ADR-0011).
    language: text("language"),
    registeredAt: timestamp("registered_at", { withTimezone: true }).notNull(),
    etag: text("etag"),
    lastModified: text("last_modified"),
    consecutiveFailures: integer("consecutive_failures").notNull().default(0),
    // Consecutive polls that found nothing new; stretches the poll interval
    // so a dormant feed is not fetched as often as an active one.
    unchangedPolls: integer("unchanged_polls").notNull().default(0),
    // Favicon resolution retry state (ADR-0010). Without a give-up counter
    // a site that never serves one is re-fetched on every single poll.
    iconFailures: integer("icon_failures").notNull().default(0),
    iconNextAttemptAt: timestamp("icon_next_attempt_at", { withTimezone: true }),
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
    // Null only for rows written before content-change tracking existed.
    contentFingerprint: text("content_fingerprint"),
    messageUri: text("message_uri"),
    // Retired extraction columns, retained for rolling deployment/rollback
    // compatibility. Application code no longer reads or writes them (ADR-0015).
    fullContentUsed: boolean("full_content_used").notNull().default(false),
    extractFailures: integer("extract_failures").notNull().default(0),
    extractNextAttemptAt: timestamp("extract_next_attempt_at", {
      withTimezone: true,
    }),
  },
  (table) => [primaryKey({ columns: [table.feedId, table.key] })],
);

export const federationActorKeys = pgTable(
  "federation_actor_keys",
  {
    localHandle: text("local_handle").notNull(),
    algorithm: text("algorithm").notNull(),
    publicJwk: jsonb("public_jwk").$type<webcrypto.JsonWebKey>().notNull(),
    privateJwk: jsonb("private_jwk").$type<webcrypto.JsonWebKey>().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.localHandle, table.algorithm] }),
  ],
);

export const federationFollowers = pgTable(
  "federation_followers",
  {
    localHandle: text("local_handle").notNull(),
    actorUri: text("actor_uri").notNull(),
    inboxUri: text("inbox_uri").notNull(),
    sharedInboxUri: text("shared_inbox_uri"),
    followedAt: timestamp("followed_at", { withTimezone: true }).notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.localHandle, table.actorUri] }),
    index("federation_followers_local_handle_idx").on(table.localHandle),
  ],
);

export const federationObjects = pgTable(
  "federation_objects",
  {
    actorHandle: text("actor_handle").notNull(),
    id: text("id").notNull(),
    kind: text("kind").notNull(),
    contentHtml: text("content_html").notNull(),
    name: text("name"),
    summaryHtml: text("summary_html"),
    sourceUrl: text("source_url"),
    language: text("language"),
    toUris: text("to_uris").array().notNull(),
    ccUris: text("cc_uris").array().notNull(),
    attributedToUris: text("attributed_to_uris").array().notNull(),
    mentions: jsonb("mentions").$type<readonly StoredMention[]>().notNull(),
    publishedAt: timestamp("published_at", { withTimezone: true }).notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }),
  },
  (table) => [
    primaryKey({ columns: [table.actorHandle, table.id] }),
    index("federation_objects_actor_published_idx").on(
      table.actorHandle,
      table.publishedAt.desc(),
    ),
  ],
);
