import { serve } from "@hono/node-server";
import { Hono } from "hono";
import type { RemoteFollowResolver } from "../../src/domain/ports/remote-follow-resolver.js";
import type { FindFeedByHandle } from "../../src/application/find-feed-by-handle.js";
import type { RegisterFeed } from "../../src/application/register-feed.js";
import type {
  ListPopularFeeds,
  SearchFeeds,
} from "../../src/application/search-feeds.js";
import { err, ok } from "../../src/shared/result.js";
import { createInMemoryFeedRepository } from "../../src/infrastructure/persistence/in-memory-feed-repository.js";
import { createInMemoryFederationRepository } from "../../src/infrastructure/persistence/in-memory-federation-repository.js";
import { createFederationPages } from "../../src/web/federation-pages.js";
import { createWebRoutes } from "../../src/web/routes.js";
import { createWebUiAssetRoutes } from "../../src/web/ui/solid-assets.js";
import { makeFeed } from "../helpers/fakes.js";

const feed = makeFeed({
  url: "https://example.com/a/very-long-feed-path-that-should-not-widen-a-phone.xml",
  handle: "long_feed_account_name",
  title: "A long example title about publishing feeds across languages",
});

const registerFeed: RegisterFeed = {
  execute: async (url) =>
    url.startsWith("ftp:")
      ? err({ type: "UnsupportedProtocol", raw: url, protocol: "ftp:" })
      : ok({ feed, created: true }),
};
const findFeedByHandle: FindFeedByHandle = {
  execute: async (handle) =>
    handle === feed.handle ? ok(feed) : err({ type: "FeedNotFound" }),
};
const searchFeeds: SearchFeeds = {
  execute: async (keyword) =>
    keyword.trim() === "" ? err({ type: "EmptyQuery" }) : ok([feed]),
};
const listPopularFeeds: ListPopularFeeds = {
  execute: async () => [{ feed, followerCount: 2 }],
};

const feeds = createInMemoryFeedRepository();
await feeds.save(feed);
const federationObjects = createInMemoryFederationRepository();
await federationObjects.upsertObject({
  id: "post-1",
  actorHandle: feed.handle,
  contentHtml: '<p><strong>Example story</strong></p><p>A post from the example feed.</p>',
  name: "Example story",
  summaryHtml: null,
  sourceUrl: "https://example.com/posts/1",
  language: "en",
  toUris: ["https://www.w3.org/ns/activitystreams#Public"],
  ccUris: [],
  attributedToUris: ["http://127.0.0.1/ap/actor/long_feed_account_name"],
  mentions: [],
  publishedAt: new Date("2026-08-30T00:00:00Z"),
  updatedAt: null,
});
let fixturePort = 0;
const remoteFollow: RemoteFollowResolver = {
  resolveSubscribeUrl: async () => ok(new URL(`http://127.0.0.1:${fixturePort}/remote-authorization`)),
};

const app = new Hono();
app.route("/", createWebUiAssetRoutes());
app.get("/remote-authorization", (context) =>
  context.html("<h1>Remote authorization</h1>"),
);
app.route("/", createWebRoutes({
  origin: "http://127.0.0.1",
  host: "127.0.0.1",
  registerFeed,
  findFeedByHandle,
  searchFeeds,
  listPopularFeeds,
  ready: async () => true,
}));
app.route("/", createFederationPages({
  origin: "http://127.0.0.1",
  feeds,
  federationObjects,
  remoteFollow,
}));

const server = serve(
  { fetch: app.fetch, port: 0, hostname: "127.0.0.1" },
  (address) => {
    fixturePort = address.port;
    process.stdout.write(`PORT=${address.port}\n`);
  },
);

process.on("SIGTERM", () => server.close());
