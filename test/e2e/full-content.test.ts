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
import { atomFixture } from "./helpers/fixtures.js";

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
    pollMaxIntervalSeconds: 3600,
    pollMaxBackoffSeconds: 86_400,
    schedulerTickMs: 3_600_000,
    noteMaxChars: 2000,
    teaserMaxChars: 200,
    extractUserAgent: "rss2pub-e2e",
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
      atomFixture({
        title: "Full Content Blog",
        entries: [
          {
            id: "urn:e2e:full",
            link: fixtures.url("/full-article"),
            title: "Post Title",
            summary: TEASER_BODY,
            published: new Date("Wed, 01 Jul 2026 00:00:00 GMT").toISOString(),
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

/**
 * Some origins allowlist named crawlers and answer 403 to everything else,
 * rss2.pub's honest self-identification included (news.hada.io does exactly
 * this). The bridge must still publish — the feed's own teaser — rather than
 * dropping the item or failing the poll.
 */
describe("full-content extraction when the origin blocks our User-Agent", () => {
  it("falls back to the teaser and still federates the item", async () => {
    fixtures.setFixture("/blocked-article", ARTICLE_HTML, {
      contentType: "text/html",
      // Anything but the User-Agent this app is configured with.
      allowUserAgent: "Mozilla/5.0 (compatible; Googlebot/2.1)",
    });
    fixtures.setFixture(
      "/blocked-feed.xml",
      atomFixture({
        title: "Blocked Origin Blog",
        entries: [
          {
            id: "urn:e2e:blocked",
            link: fixtures.url("/blocked-article"),
            title: "Blocked Post",
            summary: TEASER_BODY,
            published: new Date("Wed, 01 Jul 2026 00:00:00 GMT").toISOString(),
          },
        ],
      }),
    );

    const feedUrl = fixtures.url("/blocked-feed.xml");
    const handle = Handle.fromFeedUrl(unwrap(FeedUrl.create(feedUrl)), true);
    const response = await fetch(`${base}/register`, {
      method: "POST",
      body: new URLSearchParams({ url: feedUrl, full: "1" }),
    });
    expect(response.status).toBe(200);

    await app.scheduler.tick();

    const actor = await fetchAp(`${base}/ap/actor/${handle}`);
    const activities = await collectOutbox(actor["outbox"] as string);
    expect(activities).toHaveLength(1);
    const object = await resolveItem(activities[0]?.["object"]);
    expect(object["content"]).toContain("A tiny teaser from the blog");
    expect(object["content"]).not.toContain("Readability content-density");

    // The attempt really happened and really carried our User-Agent — the
    // fallback is a rejection by the origin, not a skipped fetch.
    const attempt = fixtures.requests.find((r) => r.path === "/blocked-article");
    expect(attempt).toBeDefined();
    expect(attempt?.headers["user-agent"]).toBe("rss2pub-e2e");
  });
});
