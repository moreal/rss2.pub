import {
  createFederation,
  type DocumentLoader,
  MemoryKvStore,
} from "@fedify/fedify";
import { getDocumentLoader } from "@fedify/fedify/runtime";
import { Note, Organization, Person, Service } from "@fedify/vocab";
import { describe, expect, it } from "vitest";
import { AttributionCandidates } from "../../../../src/domain/feed/author-uri.js";
import { ResolvedActorUri } from "../../../../src/domain/ports/actor-resolver.js";
import { createFedifyActorResolver } from "../../../../src/infrastructure/federation/fedify-actor-resolver.js";

const AS_CONTEXT = "https://www.w3.org/ns/activitystreams";

function authorUri(raw: string) {
  const value = AttributionCandidates.values(
    AttributionCandidates.fromRaw([raw]),
  )[0];
  if (value === undefined) throw new Error(`invalid test author URI: ${raw}`);
  return value;
}

function resolverWith(documents: ReadonlyMap<string, unknown>) {
  const loader: DocumentLoader = async (url) => {
    const document = documents.get(url);
    if (document === undefined) throw new Error(`HTTP 404 for ${url}`);
    return { contextUrl: null, document, documentUrl: url };
  };
  const federation = createFederation<void>({
    kv: new MemoryKvStore(),
    documentLoaderFactory: () => loader,
    contextLoaderFactory: () => getDocumentLoader(),
  });
  return createFedifyActorResolver({
    federation,
    origin: "https://local.test",
  });
}

async function jsonLd(object: Person | Organization | Service | Note) {
  return object.toJsonLd();
}

describe("ResolvedActorUri", () => {
  it("canonicalizes absolute HTTP(S) IDs and rejects other inputs", () => {
    expect(ResolvedActorUri.create(" https://EXAMPLE.test:443/alice ")).toEqual({
      ok: true,
      value: "https://example.test/alice",
    });
    expect(ResolvedActorUri.create("acct:alice@example.test")).toMatchObject({
      ok: false,
      error: { type: "UnsupportedProtocol" },
    });
    expect(ResolvedActorUri.create("relative")).toMatchObject({
      ok: false,
      error: { type: "NotAUrl" },
    });
  });
});

describe("createFedifyActorResolver", () => {
  it.each([
    ["Person", Person],
    ["Organization", Organization],
    ["Service", Service],
  ] as const)("returns the canonical ID of a %s", async (_name, ActorClass) => {
    const requested = "https://actors.test/profile";
    const canonical = "https://actors.test/users/alice";
    const actor = new ActorClass({ id: new URL(canonical) });
    const resolver = resolverWith(new Map([[requested, await jsonLd(actor)]]));

    expect(await resolver.resolve(authorUri(requested))).toEqual({
      ok: true,
      value: canonical,
    });
  });

  it("omits a non-Actor object", async () => {
    const uri = "https://actors.test/post";
    const resolver = resolverWith(new Map([[
      uri,
      await jsonLd(new Note({ id: new URL(uri), content: "hello" })),
    ]]));

    expect(await resolver.resolve(authorUri(uri))).toEqual({
      ok: true,
      value: null,
    });
  });

  it("omits an Actor without an ID", async () => {
    const uri = "https://actors.test/idless";
    const resolver = resolverWith(new Map([[uri, {
      "@context": AS_CONTEXT,
      type: "Person",
      preferredUsername: "idless",
    }]]));

    expect(await resolver.resolve(authorUri(uri))).toEqual({
      ok: true,
      value: null,
    });
  });

  it("omits a cross-origin returned ID", async () => {
    const requested = "https://actors.test/redirect";
    const actor = new Person({ id: new URL("https://other.test/users/alice") });
    const resolver = resolverWith(new Map([[requested, await jsonLd(actor)]]));

    expect(await resolver.resolve(authorUri(requested))).toEqual({
      ok: true,
      value: null,
    });
  });

  it("returns typed errors for thrown JSON-LD failures and omits HTTP misses", async () => {
    const malformed = "https://actors.test/malformed";
    const missing = "https://actors.test/missing";
    const resolver = resolverWith(new Map([[malformed, {
      "@context": 42,
      type: "Person",
    }]]));

    const malformedResult = await resolver.resolve(authorUri(malformed));
    expect(malformedResult).toMatchObject({
      ok: false,
      error: { type: "ActorLookupFailed", uri: malformed },
    });
    const missingResult = await resolver.resolve(authorUri(missing));
    // Fedify treats an unavailable document like a lookup miss after trying
    // WebFinger, while parser/JSON-LD errors that escape lookup remain typed.
    expect(missingResult).toEqual({
      ok: true,
      value: null,
    });
  });
});
