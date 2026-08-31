import {
  createFederation,
  generateCryptoKeyPair,
  MemoryKvStore,
} from "@fedify/fedify";
import {
  Article,
  Create,
  LanguageString,
  Note,
  Service,
  Update,
} from "@fedify/vocab";
import { describe, expect, it } from "vitest";
import type { StoredFederationObject } from "../../../../src/infrastructure/federation/model.js";
import {
  buildCreate,
  buildLocalActor,
  buildMessage,
  buildUpdate,
  type LocalActorDescriptor,
} from "../../../../src/infrastructure/federation/vocab-builders.js";

async function collect<T>(items: AsyncIterable<T>): Promise<T[]> {
  const collected: T[] = [];
  for await (const item of items) collected.push(item);
  return collected;
}

function storedObject(
  kind: StoredFederationObject["kind"] = "note",
): StoredFederationObject {
  return {
    id: "object-1",
    actorHandle: "feed_a",
    kind,
    contentHtml: "<p>Hello</p>",
    name: kind === "article" ? "Article title" : null,
    summaryHtml: kind === "article" ? "<p>Summary</p>" : null,
    sourceUrl: "https://source.test/posts/1",
    language: "en",
    toUris: ["https://www.w3.org/ns/activitystreams#Public"],
    ccUris: ["https://local.test/ap/actor/feed_a/followers"],
    attributedToUris: ["https://local.test/ap/actor/feed_a"],
    mentions: [{ name: "@alice@remote.test", href: "https://remote.test/users/alice" }],
    publishedAt: new Date("2026-08-30T00:00:00Z"),
    updatedAt: new Date("2026-08-31T00:00:00Z"),
  };
}

async function builderContext() {
  const federation = createFederation<void>({ kv: new MemoryKvStore() });
  federation
    .setActorDispatcher("/ap/actor/{identifier}", () => null)
    .setKeyPairsDispatcher(async () => [
      await generateCryptoKeyPair("RSASSA-PKCS1-v1_5"),
      await generateCryptoKeyPair("Ed25519"),
    ]);
  federation.setObjectDispatcher(
    Note,
    "/ap/actor/{identifier}/note/{id}",
    () => null,
  );
  federation.setObjectDispatcher(
    Article,
    "/ap/actor/{identifier}/article/{id}",
    () => null,
  );
  federation.setObjectDispatcher(
    Create,
    "/ap/actor/{identifier}/create/{id}",
    () => null,
  );
  federation.setFollowersDispatcher(
    "/ap/actor/{identifier}/followers",
    () => ({ items: [], nextCursor: null }),
  );
  federation.setOutboxDispatcher(
    "/ap/actor/{identifier}/outbox",
    () => ({ items: [], nextCursor: null }),
  );
  federation.setInboxListeners(
    "/ap/actor/{identifier}/inbox",
    "/ap/inbox",
  );
  return federation.createContext(new URL("https://local.test"), undefined);
}

describe("vocab builders", () => {
  it("builds a local Service with canonical collections and both key types", async () => {
    const ctx = await builderContext();
    const keys = await ctx.getActorKeyPairs("feed_a");
    const descriptor: LocalActorDescriptor = {
      handle: "feed_a",
      name: "Example feed",
      summaryHtml: "<p>Mirrored Atom feed</p>",
      profileUrl: new URL("https://local.test/@feed_a"),
      homepageUrl: new URL("https://source.test/"),
      iconUrl: new URL("https://source.test/favicon.ico"),
    };

    const actor = buildLocalActor(ctx, descriptor, keys);

    expect(actor).toBeInstanceOf(Service);
    expect(actor.id?.href).toBe("https://local.test/ap/actor/feed_a");
    expect(actor.preferredUsername?.toString()).toBe("feed_a");
    expect(actor.inboxId?.href).toBe("https://local.test/ap/actor/feed_a/inbox");
    expect(actor.outboxId?.href).toBe("https://local.test/ap/actor/feed_a/outbox");
    expect(actor.followersId?.href).toBe("https://local.test/ap/actor/feed_a/followers");
    expect(actor.endpoints?.sharedInbox?.href).toBe("https://local.test/ap/inbox");
    expect(actor.url?.href).toBe("https://local.test/@feed_a");
    expect((await collect(actor.getIcons()))[0]?.url?.href)
      .toBe("https://source.test/favicon.ico");
    expect(actor.publicKeyId?.href).toContain("#main-key");
    expect(await collect(actor.getAssertionMethods())).toHaveLength(2);
    expect((await collect(actor.getAttachments()))[0]?.name?.toString())
      .toBe("Feed");
  });

  it("builds a language-tagged public Note from its stored record", async () => {
    const ctx = await builderContext();
    const record = storedObject();

    const message = buildMessage(ctx, record);

    expect(message).toBeInstanceOf(Note);
    expect(message.id?.href).toBe("https://local.test/ap/actor/feed_a/note/object-1");
    expect(message.content).toEqual(new LanguageString("<p>Hello</p>", "en"));
    expect(message.attributionIds.map((uri) => uri.href)).toEqual(record.attributedToUris);
    expect(message.toIds.map((uri) => uri.href)).toEqual(record.toUris);
    expect(message.ccIds.map((uri) => uri.href)).toEqual(record.ccUris);
    expect(message.url?.href).toBe(record.sourceUrl);
    expect(message.published?.toString()).toBe("2026-08-30T00:00:00Z");
    expect(message.updated?.toString()).toBe("2026-08-31T00:00:00Z");
    expect((await collect(message.getTags()))[0]?.name?.toString())
      .toBe("@alice@remote.test");
    expect(await message.toJsonLd()).toMatchObject({
      id: "https://local.test/ap/actor/feed_a/note/object-1",
      type: "Note",
      attributedTo: "https://local.test/ap/actor/feed_a",
      cc: "https://local.test/ap/actor/feed_a/followers",
      contentMap: { en: "<p>Hello</p>" },
      mediaType: "text/html",
      published: "2026-08-30T00:00:00Z",
      to: "as:Public",
      updated: "2026-08-31T00:00:00Z",
      url: "https://source.test/posts/1",
    });
  });

  it("omits malformed optional URLs without dropping the message", async () => {
    const ctx = await builderContext();
    const message = buildMessage(ctx, {
      ...storedObject(),
      sourceUrl: "relative/source",
      toUris: ["not a URL"],
      ccUris: ["still not a URL"],
      attributedToUris: ["also invalid"],
      mentions: [{ name: "invalid", href: "/relative" }],
    });

    expect(message.url?.href).toBe(
      "https://local.test/@feed_a/object-1",
    );
    expect(message.toIds).toEqual([]);
    expect(message.ccIds).toEqual([]);
    expect(message.attributionIds).toEqual([]);
    expect(await collect(message.getTags())).toEqual([]);
  });

  it("keeps the stored Article kind and wraps it in Create and Update", async () => {
    const ctx = await builderContext();
    const record = storedObject("article");

    const message = buildMessage(ctx, record);
    const create = buildCreate(ctx, record);
    const update = buildUpdate(
      ctx,
      record,
      new URL("https://local.test/ap/actor/feed_a/update/revision-1"),
    );

    expect(message).toBeInstanceOf(Article);
    expect(message.name).toEqual(new LanguageString("Article title", "en"));
    expect(message.summary).toEqual(new LanguageString("<p>Summary</p>", "en"));
    expect(create).toBeInstanceOf(Create);
    expect(create.id?.href).toBe("https://local.test/ap/actor/feed_a/create/object-1");
    expect(create.actorId?.href).toBe("https://local.test/ap/actor/feed_a");
    expect(create.objectId?.href).toBe(message.id?.href);
    expect(create.toIds.map((uri) => uri.href)).toEqual(record.toUris);
    expect(create.ccIds.map((uri) => uri.href)).toEqual(record.ccUris);
    expect(update).toBeInstanceOf(Update);
    expect(update.id?.href).toBe("https://local.test/ap/actor/feed_a/update/revision-1");
    expect(update.objectId?.href).toBe(message.id?.href);
  });
});
