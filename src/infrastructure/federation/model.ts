import type { webcrypto } from "node:crypto";

export type StoredKeyAlgorithm = "RSASSA-PKCS1-v1_5" | "Ed25519";

export type StoredKeyPair = {
  readonly localHandle: string;
  readonly algorithm: StoredKeyAlgorithm;
  readonly publicJwk: webcrypto.JsonWebKey;
  readonly privateJwk: webcrypto.JsonWebKey;
  readonly createdAt: Date;
};

export type StoredFollower = {
  readonly localHandle: string;
  readonly actorUri: string;
  readonly inboxUri: string;
  readonly sharedInboxUri: string | null;
  readonly followedAt: Date;
};

export type StoredMention = {
  readonly name: string;
  readonly href: string;
};

export type StoredFederationObject = {
  readonly id: string;
  readonly actorHandle: string;
  readonly kind: "note" | "article";
  readonly contentHtml: string;
  readonly name: string | null;
  readonly summaryHtml: string | null;
  readonly sourceUrl: string | null;
  readonly language: string | null;
  readonly toUris: readonly string[];
  readonly ccUris: readonly string[];
  readonly attributedToUris: readonly string[];
  readonly mentions: readonly StoredMention[];
  readonly publishedAt: Date;
  readonly updatedAt: Date | null;
};

export type FederationPage<T> = {
  readonly items: readonly T[];
  readonly nextCursor: string | null;
};

export type FederationRepository = {
  getKeyPairs(localHandle: string): Promise<readonly StoredKeyPair[]>;
  saveKeyPairsIfAbsent(keyPairs: readonly StoredKeyPair[]): Promise<boolean>;
  addFollower(follower: StoredFollower): Promise<boolean>;
  removeFollower(localHandle: string, actorUri: string): Promise<boolean>;
  countFollowers(localHandle: string): Promise<number>;
  listFollowers(
    localHandle: string,
    cursor: string | null,
    pageSize: number,
  ): Promise<FederationPage<StoredFollower>>;
  upsertObject(object: StoredFederationObject): Promise<void>;
  findObject(actorHandle: string, id: string): Promise<StoredFederationObject | null>;
  countObjects(actorHandle: string): Promise<number>;
  listObjects(
    actorHandle: string,
    cursor: string | null,
    pageSize: number,
  ): Promise<FederationPage<StoredFederationObject>>;
  removeObjectsOfActor(actorHandle: string): Promise<void>;
};
