import type {
  FederationPage,
  FederationRepository,
  StoredFederationObject,
  StoredFollower,
  StoredKeyAlgorithm,
  StoredKeyPair,
} from "../federation/model.js";

function copyJwk(jwk: StoredKeyPair["publicJwk"]): StoredKeyPair["publicJwk"] {
  return {
    ...jwk,
    ...(jwk.key_ops === undefined ? {} : { key_ops: [...jwk.key_ops] }),
    ...(jwk.oth === undefined
      ? {}
      : { oth: jwk.oth.map((prime) => ({ ...prime })) }),
  };
}

function copyKeyPair(pair: StoredKeyPair): StoredKeyPair {
  return {
    ...pair,
    publicJwk: copyJwk(pair.publicJwk),
    privateJwk: copyJwk(pair.privateJwk),
    createdAt: new Date(pair.createdAt),
  };
}

function copyFollower(follower: StoredFollower): StoredFollower {
  return { ...follower, followedAt: new Date(follower.followedAt) };
}

function copyObject(object: StoredFederationObject): StoredFederationObject {
  return {
    ...object,
    toUris: [...object.toUris],
    ccUris: [...object.ccUris],
    attributedToUris: [...object.attributedToUris],
    mentions: object.mentions.map((mention) => ({ ...mention })),
    publishedAt: new Date(object.publishedAt),
    updatedAt: object.updatedAt === null ? null : new Date(object.updatedAt),
  };
}

function offsetOf(cursor: string | null): number {
  if (cursor === null || !/^\d+$/.test(cursor)) return 0;
  return Number(cursor);
}

function pageOf<T>(
  items: readonly T[],
  cursor: string | null,
  pageSize: number,
): FederationPage<T> {
  const offset = offsetOf(cursor);
  const end = Math.min(items.length, offset + Math.max(1, Math.trunc(pageSize)));
  return {
    items: items.slice(offset, end),
    nextCursor: end < items.length ? String(end) : null,
  };
}

export function createInMemoryFederationRepository(): FederationRepository {
  const keys = new Map<string, Map<StoredKeyAlgorithm, StoredKeyPair>>();
  const followers = new Map<string, Map<string, StoredFollower>>();
  const objects = new Map<string, Map<string, StoredFederationObject>>();

  return {
    async getKeyPairs(localHandle) {
      return [...(keys.get(localHandle)?.values() ?? [])].map(copyKeyPair);
    },

    async saveKeyPairsIfAbsent(keyPairs) {
      const localHandle = keyPairs[0]?.localHandle;
      if (localHandle === undefined || keys.has(localHandle)) return false;

      const stored = new Map<StoredKeyAlgorithm, StoredKeyPair>();
      for (const pair of keyPairs) stored.set(pair.algorithm, copyKeyPair(pair));
      keys.set(localHandle, stored);
      return true;
    },

    async addFollower(follower) {
      let actorFollowers = followers.get(follower.localHandle);
      if (actorFollowers === undefined) {
        actorFollowers = new Map();
        followers.set(follower.localHandle, actorFollowers);
      }
      if (actorFollowers.has(follower.actorUri)) return false;
      actorFollowers.set(follower.actorUri, copyFollower(follower));
      return true;
    },

    async removeFollower(localHandle, actorUri) {
      return followers.get(localHandle)?.delete(actorUri) ?? false;
    },

    async countFollowers(localHandle) {
      return followers.get(localHandle)?.size ?? 0;
    },

    async listFollowers(localHandle, cursor, pageSize) {
      const ordered = [...(followers.get(localHandle)?.values() ?? [])]
        .sort((left, right) =>
          right.followedAt.getTime() - left.followedAt.getTime()
          || left.actorUri.localeCompare(right.actorUri))
        .map(copyFollower);
      return pageOf(ordered, cursor, pageSize);
    },

    async upsertObject(object) {
      let actorObjects = objects.get(object.actorHandle);
      if (actorObjects === undefined) {
        actorObjects = new Map();
        objects.set(object.actorHandle, actorObjects);
      }
      actorObjects.set(object.id, copyObject(object));
    },

    async findObject(actorHandle, id) {
      const object = objects.get(actorHandle)?.get(id);
      return object === undefined ? null : copyObject(object);
    },

    async countObjects(actorHandle) {
      return objects.get(actorHandle)?.size ?? 0;
    },

    async listObjects(actorHandle, cursor, pageSize) {
      const ordered = [...(objects.get(actorHandle)?.values() ?? [])]
        .sort((left, right) =>
          right.publishedAt.getTime() - left.publishedAt.getTime()
          || left.id.localeCompare(right.id))
        .map(copyObject);
      return pageOf(ordered, cursor, pageSize);
    },

    async removeObjectsOfActor(actorHandle) {
      objects.delete(actorHandle);
    },
  };
}
