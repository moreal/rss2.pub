import type { webcrypto } from "node:crypto";
import {
  exportJwk,
  generateCryptoKeyPair,
  importJwk,
} from "@fedify/fedify";
import type { FederationRepository, StoredKeyPair } from "./model.js";

const KEY_ALGORITHMS = ["RSASSA-PKCS1-v1_5", "Ed25519"] as const;

const inFlight = new WeakMap<
  FederationRepository,
  Map<string, Promise<readonly webcrypto.CryptoKeyPair[]>>
>();

function assertCompleteKeySet(
  localHandle: string,
  records: readonly StoredKeyPair[],
): void {
  const algorithms = new Set(records.map((record) => record.algorithm));
  if (records.length !== KEY_ALGORITHMS.length
    || !KEY_ALGORITHMS.every((algorithm) => algorithms.has(algorithm))) {
    throw new Error(`incomplete actor key set for ${localHandle}`);
  }
}

async function importKeyPairs(
  records: readonly StoredKeyPair[],
): Promise<readonly webcrypto.CryptoKeyPair[]> {
  return Promise.all(records.map(async (record) => ({
    publicKey: await importJwk(record.publicJwk, "public"),
    privateKey: await importJwk(record.privateJwk, "private"),
  })));
}

async function createKeyRecords(localHandle: string): Promise<readonly StoredKeyPair[]> {
  const createdAt = new Date();
  return Promise.all(KEY_ALGORITHMS.map(async (algorithm) => {
    const pair = await generateCryptoKeyPair(algorithm);
    return {
      localHandle,
      algorithm,
      publicJwk: await exportJwk(pair.publicKey),
      privateJwk: await exportJwk(pair.privateKey),
      createdAt,
    };
  }));
}

async function loadActorKeyPairs(
  localHandle: string,
  repository: FederationRepository,
): Promise<readonly webcrypto.CryptoKeyPair[]> {
  const stored = await repository.getKeyPairs(localHandle);
  if (stored.length > 0) {
    assertCompleteKeySet(localHandle, stored);
    return importKeyPairs(stored);
  }

  await repository.saveKeyPairsIfAbsent(await createKeyRecords(localHandle));
  const winners = await repository.getKeyPairs(localHandle);
  assertCompleteKeySet(localHandle, winners);
  return importKeyPairs(winners);
}

export async function getActorKeyPairs(
  localHandle: string,
  repository: FederationRepository,
): Promise<readonly webcrypto.CryptoKeyPair[]> {
  let repositoryPromises = inFlight.get(repository);
  if (repositoryPromises === undefined) {
    repositoryPromises = new Map();
    inFlight.set(repository, repositoryPromises);
  }

  const existing = repositoryPromises.get(localHandle);
  if (existing !== undefined) return existing;

  const promise = loadActorKeyPairs(localHandle, repository);
  repositoryPromises.set(localHandle, promise);
  try {
    return await promise;
  } finally {
    repositoryPromises.delete(localHandle);
    if (repositoryPromises.size === 0) inFlight.delete(repository);
  }
}
