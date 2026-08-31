import { exportJwk } from "@fedify/fedify";
import { describe, expect, it } from "vitest";
import { getActorKeyPairs } from "../../../../src/infrastructure/federation/keys.js";
import { createInMemoryFederationRepository } from "../../../../src/infrastructure/persistence/in-memory-federation-repository.js";

describe("getActorKeyPairs", () => {
  it("coalesces concurrent creation and persists RSA and Ed25519", async () => {
    const repository = createInMemoryFederationRepository();

    const [first, concurrent] = await Promise.all([
      getActorKeyPairs("feed_a", repository),
      getActorKeyPairs("feed_a", repository),
    ]);

    expect(first).toBe(concurrent);
    expect(first.map((pair) => pair.publicKey.algorithm.name)).toEqual([
      "RSASSA-PKCS1-v1_5",
      "Ed25519",
    ]);
    expect(first.map((pair) => pair.publicKey.usages)).toEqual([
      ["verify"],
      ["verify"],
    ]);
    expect(first.map((pair) => pair.privateKey.usages)).toEqual([
      ["sign"],
      ["sign"],
    ]);
    expect(await repository.getKeyPairs("feed_a")).toHaveLength(2);
  });

  it("reloads the persisted winners after the in-flight call completes", async () => {
    const repository = createInMemoryFederationRepository();
    const first = await getActorKeyPairs("feed_a", repository);
    const firstPublicJwks = await Promise.all(
      first.map((pair) => exportJwk(pair.publicKey)),
    );

    const reloaded = await getActorKeyPairs("feed_a", repository);

    expect(reloaded).not.toBe(first);
    expect(await Promise.all(reloaded.map((pair) => exportJwk(pair.publicKey))))
      .toEqual(firstPublicJwks);
  });
});
