import { describe, expect, it } from "vitest";
import { createInMemoryFederationRepository } from "../../../src/infrastructure/persistence/in-memory-federation-repository.js";
import { createInMemoryFeedRepository } from "../../../src/infrastructure/persistence/in-memory-feed-repository.js";
import { createFederationPages } from "../../../src/web/federation-pages.js";
import { makeFeed } from "../../helpers/fakes.js";

async function setup() {
  const feeds = createInMemoryFeedRepository();
  const federationObjects = createInMemoryFederationRepository();
  const feed = makeFeed({
    handle: "feed_a",
    title: "Example Feed",
    description: "A useful feed",
    iconUrl: "https://source.test/icon.png",
    url: "https://source.test/feed.xml",
  });
  await feeds.save(feed);
  await federationObjects.addFollower({
    localHandle: feed.handle,
    actorUri: "https://remote.test/users/alice",
    inboxUri: "https://remote.test/users/alice/inbox",
    sharedInboxUri: null,
    followedAt: new Date("2026-08-30T00:00:00Z"),
  });
  await federationObjects.upsertObject({
    id: "post-1",
    actorHandle: feed.handle,
    kind: "article",
    contentHtml: "<p>Hello<script>alert(1)</script><strong>world</strong></p>",
    name: "Article title",
    summaryHtml: "<p>Short summary</p>",
    sourceUrl: "https://source.test/posts/1",
    language: "en",
    toUris: ["https://www.w3.org/ns/activitystreams#Public"],
    ccUris: [],
    attributedToUris: ["https://local.test/ap/actor/feed_a"],
    mentions: [],
    publishedAt: new Date("2026-08-30T00:00:00Z"),
    updatedAt: null,
  });
  return {
    app: createFederationPages({
      origin: "https://local.test",
      feeds,
      federationObjects,
    }),
  };
}

describe("createFederationPages", () => {
  it("renders feed and main actor profiles with public metadata", async () => {
    const { app } = await setup();
    const feed = await app.request("https://local.test/@feed_a", {
      headers: { Accept: "text/html" },
    });
    const main = await app.request("https://local.test/@rss2pub", {
      headers: { Accept: "text/html" },
    });

    expect(feed.status).toBe(200);
    const html = await feed.text();
    expect(html).toContain("Example Feed");
    expect(html).toContain("@feed_a@local.test");
    expect(html).toContain("A useful feed");
    expect(html).toContain("https://source.test/feed.xml");
    expect(html).toContain("https://source.test/icon.png");
    expect(html).toContain("1 follower");
    expect(html).toContain("Article title");

    expect(main.status).toBe(200);
    expect(await main.text()).toContain("rss2.pub");
  });

  it("renders sanitized Note/Article message pages and source links", async () => {
    const { app } = await setup();
    const response = await app.request("https://local.test/@feed_a/post-1", {
      headers: { Accept: "text/html" },
    });

    expect(response.status).toBe(200);
    const html = await response.text();
    expect(html).toContain("Article title");
    expect(html).toContain("Short summary");
    expect(html).toContain("<strong>world</strong>");
    expect(html).not.toContain("<script>");
    expect(html).toContain("https://source.test/posts/1");
    expect(html).toContain("2026-08-30");
  });

  it("returns 404 for unknown/reserved paths and negotiates HTML only", async () => {
    const { app } = await setup();

    expect((await app.request("https://local.test/@missing")).status).toBe(404);
    expect((await app.request("https://local.test/@feed_a/missing")).status)
      .toBe(404);
    expect((await app.request("https://local.test/@feed_a/followers")).status)
      .toBe(404);
    expect((await app.request("https://local.test/@feed_a", {
      headers: { Accept: "application/activity+json" },
    })).status).toBe(406);
  });
});
