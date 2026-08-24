import { serve, type ServerType } from "@hono/node-server";
import { createServer } from "node:net";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { FeedUrl } from "../../src/domain/feed/feed-url.js";
import { Handle } from "../../src/domain/feed/handle.js";
import { createApp, type App } from "../../src/web/app.js";
import type { AppConfig } from "../../src/web/config.js";
import { unwrap } from "../helpers/result.js";
import { createTestDatabase, type TestDatabase } from "./helpers/database.js";
import {
  startFixtureFeedServer,
  type FixtureFeedServer,
} from "./helpers/fixture-feed-server.js";
import { rssFixture } from "./helpers/fixtures.js";

async function getFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const probe = createServer();
    probe.once("error", reject);
    probe.listen(0, "127.0.0.1", () => {
      const { port } = probe.address() as AddressInfo;
      probe.close(() => resolve(port));
    });
  });
}

let database: TestDatabase;
let fixtures: FixtureFeedServer;
let app: App;
let server: ServerType;
let base: string;
let host: string;

const TEASER_BODY = "<p>A tiny teaser from the blog.</p>";

const ARTICLE_HTML = `<!doctype html>
<html>
  <head><title>The Full Article Title</title></head>
  <body>
    <nav>Home About Contact</nav>
    <article>
      <h1>The Full Article Title</h1>
      <p>This is the first paragraph of the full article, with enough real
      content to satisfy the Readability content-density heuristics so the
      parser confidently selects this block as the main article body instead
      of the navigation or footer chrome surrounding it.</p>
      <p>This is a second paragraph continuing the article, adding more
      substantive text so the total character count comfortably clears the
      default extraction threshold used internally during scoring.</p>
      <p>A third paragraph rounds out the piece, giving the parser multiple
      sibling paragraph nodes inside the same container element, which is
      exactly the structural signal Readability looks for when deciding a
      node is the primary content region of the page.</p>
    </article>
    <footer>Copyright 2026 Example Corp. All rights reserved.</footer>
  </body>
</html>`;

beforeAll(async () => {
  database = await createTestDatabase(inject("databaseUrl"), "full_content_e2e");
  fixtures = await startFixtureFeedServer();
  const port = await getFreePort();
  base = `http://127.0.0.1:${port}`;
  host = `127.0.0.1:${port}`;
  const config: AppConfig = {
    origin: base,
    host,
    port,
    databaseUrl: database.url,
    pollIntervalSeconds: 3600,
    pollMaxBackoffSeconds: 86_400,
    schedulerTickMs: 3_600_000,
    noteMaxChars: 2000,
    teaserMaxChars: 200,
    behindProxy: false,
    allowPrivateAddress: false,
    logLevel: "warning",
    logFormat: "console",
  };
  app = await createApp(config);
  server = serve({ fetch: app.fetch, port, hostname: "127.0.0.1" });
});

afterAll(async () => {
  server?.close();
  await app?.shutdown();
  await fixtures?.close();
  await database?.close();
});

const AP_ACCEPT = "application/activity+json";

async function fetchAp(url: string): Promise<Record<string, unknown>> {
  const response = await fetch(url, { headers: { accept: AP_ACCEPT } });
  expect(response.status, `GET ${url}`).toBe(200);
  return (await response.json()) as Record<string, unknown>;
}

async function resolveItem(item: unknown): Promise<Record<string, unknown>> {
  if (typeof item === "string") return fetchAp(item);
  return item as Record<string, unknown>;
}

async function collectOutbox(
  outboxUrl: string,
): Promise<Record<string, unknown>[]> {
  const outbox = await fetchAp(outboxUrl);
  let page: Record<string, unknown>;
  if (Array.isArray(outbox["orderedItems"])) {
    page = outbox;
  } else {
    expect(typeof outbox["first"]).toBe("string");
    page = await fetchAp(outbox["first"] as string);
  }
  const items = (page["orderedItems"] ?? page["items"] ?? []) as unknown[];
  return Promise.all(items.map(resolveItem));
}

/** ADR-0009: registering `full` fetches and publishes the article page's
 * extracted content instead of the feed's own teaser, as a separate actor. */
describe("full-content extraction e2e (ADR-0009)", () => {
  it("registers the same feed URL as two distinct actors, teaser and full", async () => {
    fixtures.setFixture("/full-article", ARTICLE_HTML, { contentType: "text/html" });
    fixtures.setFixture(
      "/feed.xml",
      rssFixture({
        title: "Full Content Blog",
        items: [
          {
            guid: "urn:e2e:full",
            link: fixtures.url("/full-article"),
            title: "Post Title",
            description: TEASER_BODY,
            pubDate: "Wed, 01 Jul 2026 00:00:00 GMT",
          },
        ],
      }),
    );
    const feedUrl = fixtures.url("/feed.xml");
    const canonicalUrl = unwrap(FeedUrl.create(feedUrl));
    const teaserHandle = Handle.fromFeedUrl(canonicalUrl);
    const fullHandle = Handle.fromFeedUrl(canonicalUrl, true);
    expect(fullHandle).not.toBe(teaserHandle);

    const teaserRes = await fetch(`${base}/register`, {
      method: "POST",
      body: new URLSearchParams({ url: feedUrl }),
    });
    expect(teaserRes.status).toBe(200);
    const teaserHtml = await teaserRes.text();
    expect(teaserHtml).toContain("Feed registered");
    expect(teaserHtml).toContain(`@${teaserHandle}@${host}`);

    const fullRes = await fetch(`${base}/register`, {
      method: "POST",
      body: new URLSearchParams({ url: feedUrl, full: "1" }),
    });
    expect(fullRes.status).toBe(200);
    const fullHtml = await fullRes.text();
    expect(fullHtml).toContain("Feed registered");
    expect(fullHtml).toContain(`@${fullHandle}@${host}`);

    await app.scheduler.tick();

    const teaserActor = await fetchAp(`${base}/ap/actor/${teaserHandle}`);
    const teaserActivities = await collectOutbox(teaserActor["outbox"] as string);
    const teaserObjects = await Promise.all(
      teaserActivities.map((activity) => resolveItem(activity["object"])),
    );
    expect(teaserObjects).toHaveLength(1);
    expect(teaserObjects[0]?.["content"]).toContain("A tiny teaser from the blog");
    expect(teaserObjects[0]?.["content"]).not.toContain("Readability content-density");

    const fullActor = await fetchAp(`${base}/ap/actor/${fullHandle}`);
    expect(fullActor["summary"]).toContain("full article content fetched");
    const fullActivities = await collectOutbox(fullActor["outbox"] as string);
    const fullObjects = await Promise.all(
      fullActivities.map((activity) => resolveItem(activity["object"])),
    );
    expect(fullObjects).toHaveLength(1);
    const fullContent = JSON.stringify(fullObjects[0]);
    expect(fullContent).toContain("Readability content-density");
    expect(fullContent).not.toContain("A tiny teaser from the blog");
  });
});
