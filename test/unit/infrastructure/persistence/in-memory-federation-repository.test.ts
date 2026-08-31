import { describe, expect, it } from "vitest";
import type {
  StoredFederationObject,
  StoredFollower,
  StoredKeyPair,
} from "../../../../src/infrastructure/federation/model.js";
import { createInMemoryFederationRepository } from "../../../../src/infrastructure/persistence/in-memory-federation-repository.js";

function keyPair(
  algorithm: StoredKeyPair["algorithm"],
  publicJwk: StoredKeyPair["publicJwk"],
): StoredKeyPair {
  return {
    localHandle: "feed_a",
    algorithm,
    publicJwk,
    privateJwk: { ...publicJwk, d: "private" },
    createdAt: new Date("2026-08-30T00:00:00Z"),
  };
}

function follower(
  actorUri: string,
  followedAt: string,
): StoredFollower {
  return {
    localHandle: "feed_a",
    actorUri,
    inboxUri: `${actorUri}/inbox`,
    sharedInboxUri: "https://remote.test/inbox",
    followedAt: new Date(followedAt),
  };
}

function objectRecord(
  id: string,
  publishedAt: string,
): StoredFederationObject {
  return {
    id,
    actorHandle: "feed_a",
    kind: "note",
    contentHtml: `<p>${id}</p>`,
    name: null,
    summaryHtml: null,
    sourceUrl: `https://source.test/${id}`,
    language: "en",
    toUris: ["https://www.w3.org/ns/activitystreams#Public"],
    ccUris: ["https://local.test/ap/actor/feed_a/followers"],
    attributedToUris: ["https://local.test/ap/actor/feed_a"],
    mentions: [{ name: "@alice@remote.test", href: "https://remote.test/users/alice" }],
    publishedAt: new Date(publishedAt),
    updatedAt: null,
  };
}

describe("createInMemoryFederationRepository", () => {
  it("stores both actor keys once and returns defensive copies", async () => {
    const repository = createInMemoryFederationRepository();
    const keyOperations = ["verify"];
    const publicJwk: StoredKeyPair["publicJwk"] = {
      kty: "RSA",
      alg: "original",
      key_ops: keyOperations,
    };
    const pairs = [
      keyPair("RSASSA-PKCS1-v1_5", publicJwk),
      keyPair("Ed25519", { kty: "OKP", crv: "Ed25519", alg: "ed-original" }),
    ];

    expect(await repository.saveKeyPairsIfAbsent(pairs)).toBe(true);
    expect(await repository.saveKeyPairsIfAbsent(pairs)).toBe(false);

    publicJwk.alg = "mutated-source";
    keyOperations.push("unexpected");
    const firstRead = await repository.getKeyPairs("feed_a");
    expect(firstRead.map((pair) => pair.algorithm)).toEqual([
      "RSASSA-PKCS1-v1_5",
      "Ed25519",
    ]);
    expect(firstRead[0]?.publicJwk.alg).toBe("original");
    expect(firstRead[0]?.publicJwk.key_ops).toEqual(["verify"]);

    if (firstRead[0] !== undefined) {
      firstRead[0].publicJwk.alg = "mutated-result";
      firstRead[0].publicJwk.key_ops?.push("unexpected-result");
    }
    expect((await repository.getKeyPairs("feed_a"))[0]?.publicJwk.alg).toBe("original");
    expect((await repository.getKeyPairs("feed_a"))[0]?.publicJwk.key_ops).toEqual([
      "verify",
    ]);
  });

  it("adds, pages, counts, and removes followers idempotently", async () => {
    const repository = createInMemoryFederationRepository();
    const older = follower(
      "https://remote.test/users/alice",
      "2026-08-30T00:00:00Z",
    );
    const newer = follower(
      "https://remote.test/users/bob",
      "2026-08-31T00:00:00Z",
    );

    expect(await repository.addFollower(older)).toBe(true);
    expect(await repository.addFollower(older)).toBe(false);
    expect(await repository.addFollower(newer)).toBe(true);
    expect(await repository.countFollowers("feed_a")).toBe(2);

    const firstPage = await repository.listFollowers("feed_a", null, 1);
    expect(firstPage.items.map((item) => item.actorUri)).toEqual([newer.actorUri]);
    expect(firstPage.nextCursor).toBe("1");
    expect((await repository.listFollowers("feed_a", firstPage.nextCursor, 1)).items
      .map((item) => item.actorUri)).toEqual([older.actorUri]);
    expect((await repository.listFollowers("feed_a", "invalid", 1)).items
      .map((item) => item.actorUri)).toEqual([newer.actorUri]);

    expect(await repository.removeFollower(older.localHandle, older.actorUri)).toBe(true);
    expect(await repository.removeFollower(older.localHandle, older.actorUri)).toBe(false);
    expect(await repository.countFollowers("feed_a")).toBe(1);
  });

  it("upserts one stable object and pages newest first", async () => {
    const repository = createInMemoryFederationRepository();
    const older = objectRecord("a", "2026-08-30T00:00:00Z");
    const toUris = ["https://www.w3.org/ns/activitystreams#Public"];
    const mentions = [{
      name: "@alice@remote.test",
      href: "https://remote.test/users/alice",
    }];
    const newer = {
      ...objectRecord("b", "2026-08-31T00:00:00Z"),
      toUris,
      mentions,
    };

    await repository.upsertObject(older);
    await repository.upsertObject(newer);
    await repository.upsertObject({ ...older, contentHtml: "changed" });

    expect(await repository.findObject("feed_a", "a")).toMatchObject({
      contentHtml: "changed",
    });
    expect(await repository.countObjects("feed_a")).toBe(2);

    const firstPage = await repository.listObjects("feed_a", null, 1);
    expect(firstPage.items.map((item) => item.id)).toEqual(["b"]);
    expect(firstPage.nextCursor).toBe("1");
    expect((await repository.listObjects("feed_a", firstPage.nextCursor, 1)).items
      .map((item) => item.id)).toEqual(["a"]);

    toUris.push("https://unexpected.test/");
    if (mentions[0] !== undefined) mentions[0].href = "https://unexpected.test/";
    expect((await repository.findObject("feed_a", "b"))?.toUris).toEqual([
      "https://www.w3.org/ns/activitystreams#Public",
    ]);
    expect((await repository.findObject("feed_a", "b"))?.mentions).toEqual([{
      name: "@alice@remote.test",
      href: "https://remote.test/users/alice",
    }]);

    await repository.removeObjectsOfActor("feed_a");
    expect(await repository.countObjects("feed_a")).toBe(0);
    expect(await repository.findObject("feed_a", "a")).toBeNull();
  });
});
