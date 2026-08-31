import { and, asc, count, desc, eq } from "drizzle-orm";
import type {
  FederationPage,
  FederationRepository,
  StoredFederationObject,
  StoredFollower,
  StoredKeyAlgorithm,
  StoredKeyPair,
} from "../federation/model.js";
import type { Database } from "./drizzle-feed-repository.js";
import {
  federationActorKeys,
  federationFollowers,
  federationObjects,
} from "./schema.js";

type KeyRow = typeof federationActorKeys.$inferSelect;
type FollowerRow = typeof federationFollowers.$inferSelect;
type ObjectRow = typeof federationObjects.$inferSelect;

function keyAlgorithmOf(raw: string): StoredKeyAlgorithm {
  if (raw === "RSASSA-PKCS1-v1_5" || raw === "Ed25519") return raw;
  throw new Error(`corrupt federation_actor_keys row: unknown algorithm ${raw}`);
}

function objectKindOf(raw: string): StoredFederationObject["kind"] {
  if (raw === "note" || raw === "article") return raw;
  throw new Error(`corrupt federation_objects row: unknown kind ${raw}`);
}

function keyRowToRecord(row: KeyRow): StoredKeyPair {
  return {
    localHandle: row.localHandle,
    algorithm: keyAlgorithmOf(row.algorithm),
    publicJwk: structuredClone(row.publicJwk),
    privateJwk: structuredClone(row.privateJwk),
    createdAt: row.createdAt,
  };
}

function followerRowToRecord(row: FollowerRow): StoredFollower {
  return { ...row };
}

function objectRowToRecord(row: ObjectRow): StoredFederationObject {
  return {
    ...row,
    kind: objectKindOf(row.kind),
    toUris: [...row.toUris],
    ccUris: [...row.ccUris],
    attributedToUris: [...row.attributedToUris],
    mentions: row.mentions.map((mention) => ({ ...mention })),
  };
}

function offsetOf(cursor: string | null): number {
  if (cursor === null || !/^\d+$/.test(cursor)) return 0;
  return Number(cursor);
}

function pageFromRows<T>(
  rows: readonly T[],
  offset: number,
  pageSize: number,
): FederationPage<T> {
  const items = rows.slice(0, pageSize);
  return {
    items,
    nextCursor: rows.length > pageSize ? String(offset + pageSize) : null,
  };
}

function keyOrder(algorithm: StoredKeyAlgorithm): number {
  return algorithm === "RSASSA-PKCS1-v1_5" ? 0 : 1;
}

export function createDrizzleFederationRepository(
  db: Database,
): FederationRepository {
  return {
    async getKeyPairs(localHandle) {
      const rows = await db
        .select()
        .from(federationActorKeys)
        .where(eq(federationActorKeys.localHandle, localHandle));
      return rows
        .map(keyRowToRecord)
        .sort((left, right) => keyOrder(left.algorithm) - keyOrder(right.algorithm));
    },

    async saveKeyPairsIfAbsent(keyPairs) {
      if (keyPairs.length === 0) return false;
      const rows = await db
        .insert(federationActorKeys)
        .values(keyPairs.map((pair) => ({
          localHandle: pair.localHandle,
          algorithm: pair.algorithm,
          publicJwk: structuredClone(pair.publicJwk),
          privateJwk: structuredClone(pair.privateJwk),
          createdAt: pair.createdAt,
        })))
        .onConflictDoNothing()
        .returning({ algorithm: federationActorKeys.algorithm });
      return rows.length === keyPairs.length;
    },

    async addFollower(follower) {
      const rows = await db
        .insert(federationFollowers)
        .values(follower)
        .onConflictDoNothing()
        .returning({ actorUri: federationFollowers.actorUri });
      return rows.length === 1;
    },

    async removeFollower(localHandle, actorUri) {
      const rows = await db
        .delete(federationFollowers)
        .where(and(
          eq(federationFollowers.localHandle, localHandle),
          eq(federationFollowers.actorUri, actorUri),
        ))
        .returning({ actorUri: federationFollowers.actorUri });
      return rows.length === 1;
    },

    async removeFollowersOfActor(localHandle) {
      await db
        .delete(federationFollowers)
        .where(eq(federationFollowers.localHandle, localHandle));
    },

    async countFollowers(localHandle) {
      const rows = await db
        .select({ value: count() })
        .from(federationFollowers)
        .where(eq(federationFollowers.localHandle, localHandle));
      return rows[0]?.value ?? 0;
    },

    async listFollowers(localHandle, cursor, pageSize) {
      const offset = offsetOf(cursor);
      const limit = Math.max(1, Math.trunc(pageSize));
      const rows = await db
        .select()
        .from(federationFollowers)
        .where(eq(federationFollowers.localHandle, localHandle))
        .orderBy(desc(federationFollowers.followedAt), asc(federationFollowers.actorUri))
        .limit(limit + 1)
        .offset(offset);
      return pageFromRows(rows.map(followerRowToRecord), offset, limit);
    },

    async upsertObject(object) {
      const row = {
        ...object,
        toUris: [...object.toUris],
        ccUris: [...object.ccUris],
        attributedToUris: [...object.attributedToUris],
        mentions: object.mentions.map((mention) => ({ ...mention })),
      };
      await db
        .insert(federationObjects)
        .values(row)
        .onConflictDoUpdate({
          target: [federationObjects.actorHandle, federationObjects.id],
          set: row,
        });
    },

    async findObject(actorHandle, id) {
      const rows = await db
        .select()
        .from(federationObjects)
        .where(and(
          eq(federationObjects.actorHandle, actorHandle),
          eq(federationObjects.id, id),
        ))
        .limit(1);
      const row = rows[0];
      return row === undefined ? null : objectRowToRecord(row);
    },

    async countObjects(actorHandle) {
      const rows = await db
        .select({ value: count() })
        .from(federationObjects)
        .where(eq(federationObjects.actorHandle, actorHandle));
      return rows[0]?.value ?? 0;
    },

    async listObjects(actorHandle, cursor, pageSize) {
      const offset = offsetOf(cursor);
      const limit = Math.max(1, Math.trunc(pageSize));
      const rows = await db
        .select()
        .from(federationObjects)
        .where(eq(federationObjects.actorHandle, actorHandle))
        .orderBy(desc(federationObjects.publishedAt), asc(federationObjects.id))
        .limit(limit + 1)
        .offset(offset);
      return pageFromRows(rows.map(objectRowToRecord), offset, limit);
    },

    async removeObjectsOfActor(actorHandle) {
      await db
        .delete(federationObjects)
        .where(eq(federationObjects.actorHandle, actorHandle));
    },
  };
}
