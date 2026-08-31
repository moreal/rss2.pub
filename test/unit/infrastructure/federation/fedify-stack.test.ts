import { MemoryKvStore } from "@fedify/fedify";
import { describe, expect, it } from "vitest";
import { createFedifyStack } from "../../../../src/infrastructure/federation/fedify-stack.js";
import type { StoredFederationObject } from "../../../../src/infrastructure/federation/model.js";
import { createInMemoryFederationRepository } from "../../../../src/infrastructure/persistence/in-memory-federation-repository.js";
import { createInMemoryFeedRepository } from "../../../../src/infrastructure/persistence/in-memory-feed-repository.js";
import { makeFeed } from "../../../helpers/fakes.js";

function storedObject(
  id: string,
  kind: StoredFederationObject["kind"],
  publishedAt: string,
): StoredFederationObject {
  return {
    id,
    actorHandle: "feed_a",
    kind,
    contentHtml: `<p>${id}</p>`,
    name: kind === "article" ? `Title ${id}` : null,
    summaryHtml: kind === "article" ? `<p>Summary ${id}</p>` : null,
    sourceUrl: `https://source.test/${id}`,
    language: null,
    toUris: ["https://www.w3.org/ns/activitystreams#Public"],
    ccUris: ["https://local.test/ap/actor/feed_a/followers"],
    attributedToUris: ["https://local.test/ap/actor/feed_a"],
    mentions: [],
    publishedAt: new Date(publishedAt),
    updatedAt: null,
  };
}

async function fixtureStack() {
  const feeds = createInMemoryFeedRepository();
  const federationObjects = createInMemoryFederationRepository();
  await feeds.save(makeFeed({
    handle: "feed_a",
    title: "Example feed",
    description: "A feed profile",
    url: "https://source.test/feed.xml",
  }));
  await federationObjects.upsertObject(
    storedObject("older-note", "note", "2026-08-29T00:00:00Z"),
  );
  await federationObjects.upsertObject(
    storedObject("newer-article", "article", "2026-08-30T00:00:00Z"),
  );
  await federationObjects.addFollower({
    localHandle: "feed_a",
    actorUri: "https://remote.test/users/alice",
    inboxUri: "https://remote.test/users/alice/inbox",
    sharedInboxUri: "https://remote.test/inbox",
    followedAt: new Date("2026-08-30T00:00:00Z"),
  });
  return createFedifyStack({
    kv: new MemoryKvStore(),
    feeds,
    repository: federationObjects,
    softwareVersion: "0.1.0",
    allowPrivateAddress: true,
  });
}

async function fetchActivity(
  stack: Awaited<ReturnType<typeof fixtureStack>>,
  path: string,
) {
  return stack.federation.fetch(
    new Request(`https://local.test${path}`, {
      headers: { Accept: "application/activity+json" },
    }),
    { contextData: undefined },
  );
}

describe("createFedifyStack", () => {
  it("serves the main actor, a dynamic feed actor, and WebFinger", async () => {
    const stack = await fixtureStack();

    const main = await fetchActivity(stack, "/ap/actor/rss2pub");
    const feed = await fetchActivity(stack, "/ap/actor/feed_a");
    const missing = await fetchActivity(stack, "/ap/actor/missing");
    const webFinger = await stack.federation.fetch(
      new Request(
        "https://local.test/.well-known/webfinger?resource=acct:feed_a@local.test",
      ),
      { contextData: undefined },
    );

    expect(main.status).toBe(200);
    expect(await main.json()).toMatchObject({
      id: "https://local.test/ap/actor/rss2pub",
      preferredUsername: "rss2pub",
      type: "Service",
    });
    expect(feed.status).toBe(200);
    expect(await feed.json()).toMatchObject({
      id: "https://local.test/ap/actor/feed_a",
      name: "Example feed",
      preferredUsername: "feed_a",
      type: "Service",
    });
    expect(missing.status).toBe(404);
    expect(webFinger.status).toBe(200);
    expect(await webFinger.json()).toMatchObject({
      subject: "acct:feed_a@local.test",
    });
  });

  it("dispatches stored Note, Article, Create, and refuses wrong-kind paths", async () => {
    const stack = await fixtureStack();

    expect((await fetchActivity(
      stack,
      "/ap/actor/feed_a/note/older-note",
    )).status).toBe(200);
    expect((await fetchActivity(
      stack,
      "/ap/actor/feed_a/article/newer-article",
    )).status).toBe(200);
    expect((await fetchActivity(
      stack,
      "/ap/actor/feed_a/create/older-note",
    )).status).toBe(200);
    expect((await fetchActivity(
      stack,
      "/ap/actor/feed_a/article/older-note",
    )).status).toBe(404);
    expect((await fetchActivity(
      stack,
      "/ap/actor/missing/note/older-note",
    )).status).toBe(404);
  });

  it("serves collection counts/pages and NodeInfo from repositories", async () => {
    const stack = await fixtureStack();
    const outbox = await fetchActivity(stack, "/ap/actor/feed_a/outbox?cursor=0");
    const followers = await fetchActivity(
      stack,
      "/ap/actor/feed_a/followers?cursor=0",
    );
    const nodeInfo = await stack.federation.fetch(
      new Request("https://local.test/nodeinfo/2.1"),
      { contextData: undefined },
    );

    expect(outbox.status).toBe(200);
    expect(await outbox.text()).toContain("newer-article");
    expect(followers.status).toBe(200);
    expect(await followers.text()).toContain("https://remote.test/users/alice");
    expect(nodeInfo.status).toBe(200);
    expect(await nodeInfo.json()).toMatchObject({
      software: { name: "rss2pub", version: "0.1.0" },
      protocols: ["activitypub"],
      usage: { users: { total: 2 }, localPosts: 2 },
    });
  });
});
