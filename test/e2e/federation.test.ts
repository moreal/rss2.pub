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
import { atomFixture, rssFixture } from "./helpers/fixtures.js";

const AP_ACCEPT = "application/activity+json";

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

beforeAll(async () => {
  database = await createTestDatabase(inject("databaseUrl"), "federation_e2e");
  fixtures = await startFixtureFeedServer();
  const port = await getFreePort();
  base = `http://127.0.0.1:${port}`;
  host = `127.0.0.1:${port}`;
  const config: AppConfig = {
    origin: base,
    host,
    port,
    databaseUrl: database.url,
    // 1s so the feed is due again right after the first poll.
    pollIntervalSeconds: 1,
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

const SHORT_BODY = "<p>A tiny <strong>update</strong> from the blog.</p>";
const LONG_BODY = `<p>lead paragraph of the long post</p><p>${"word ".repeat(600)}</p>`;

describe("federation e2e", () => {
  let feedHandle: string;

  it("registers a feed through the web form", async () => {
    fixtures.setFixture(
      "/blog/feed.xml",
      rssFixture({
        title: "E2E Blog",
        description: "end to end fixture blog",
        items: [
          {
            guid: "urn:e2e:short",
            link: "https://blog.example/short",
            title: "Short Post",
            description: SHORT_BODY,
            pubDate: "Wed, 01 Jul 2026 00:00:00 GMT",
          },
          {
            guid: "urn:e2e:long",
            link: "https://blog.example/long",
            title: "Long Post",
            contentEncoded: LONG_BODY,
            pubDate: "Thu, 02 Jul 2026 00:00:00 GMT",
          },
        ],
      }),
      { etag: 'W/"v1"' },
    );

    const feedUrl = fixtures.url("/blog/feed.xml");
    feedHandle = Handle.fromFeedUrl(unwrap(FeedUrl.create(feedUrl)));

    const response = await fetch(`${base}/register`, {
      method: "POST",
      body: new URLSearchParams({ url: feedUrl }),
    });
    expect(response.status).toBe(200);
    const html = await response.text();
    expect(html).toContain("Feed registered");
    expect(html).toContain(`@${feedHandle}@${host}`);
  });

  it("resolves the feed actor via WebFinger", async () => {
    const response = await fetch(
      `${base}/.well-known/webfinger?resource=acct:${feedHandle}@${host}`,
    );
    expect(response.status).toBe(200);
    const jrd = (await response.json()) as {
      subject: string;
      links: { rel: string; href?: string }[];
    };
    expect(jrd.subject).toBe(`acct:${feedHandle}@${host}`);
    const self = jrd.links.find((l) => l.rel === "self");
    expect(self?.href).toBe(`${base}/ap/actor/${feedHandle}`);
  });

  it("serves the feed actor document with feed metadata", async () => {
    const actor = await fetchAp(`${base}/ap/actor/${feedHandle}`);
    expect(actor["preferredUsername"]).toBe(feedHandle);
    expect(actor["type"]).toBe("Service");
    expect(actor["name"]).toBe("E2E Blog");
    expect(typeof actor["outbox"]).toBe("string");
    expect(typeof actor["inbox"]).toBe("string");
  });

  it("resolves the main actor via WebFinger", async () => {
    const response = await fetch(
      `${base}/.well-known/webfinger?resource=acct:rss2pub@${host}`,
    );
    expect(response.status).toBe(200);
  });

  it("publishes new items to the outbox on poll — Note and titled Article", async () => {
    await app.scheduler.tick();

    const actor = await fetchAp(`${base}/ap/actor/${feedHandle}`);
    const activities = await collectOutbox(actor["outbox"] as string);
    expect(activities).toHaveLength(2);

    const objects = await Promise.all(
      activities.map((activity) => resolveItem(activity["object"])),
    );
    const note = objects.find((o) => o["type"] === "Note");
    const article = objects.find((o) => o["type"] === "Article");

    expect(note, "short item becomes a Note").toBeDefined();
    expect(note?.["content"]).toContain("<strong>Short Post</strong>");
    expect(note?.["content"]).toContain("tiny <strong>update</strong>");
    expect(note?.["content"]).toContain("https://blog.example/short");
    // ADR-0005 follow-up: object-level `url` (distinct from `id`) is the
    // original feed item link, so remote clients navigate there instead of
    // rss2.pub's own message page.
    expect(note?.["url"]).toBe("https://blog.example/short");

    expect(article, "long item becomes an Article").toBeDefined();
    expect(article?.["name"]).toBe("Long Post");
    expect(article?.["summary"]).toContain("lead paragraph of the long post");
    expect(article?.["content"]).toContain("<h1>Long Post</h1>");
    expect(article?.["content"]).toContain("word word");
    expect(article?.["url"]).toBe("https://blog.example/long");
  });

  it("still publishes when a feed item's link is not an absolute URL", async () => {
    // `new URL()` throws on a relative link; that must only skip the object's
    // `url` metadata, not fail the whole publish (regression guard for the
    // botkit-gateway.ts url rewrite).
    fixtures.setFixture(
      "/blog/bad-link-feed.xml",
      rssFixture({
        title: "Bad Link Blog",
        items: [
          {
            guid: "urn:e2e:bad-link",
            link: "/relative/path",
            title: "Bad Link Post",
            description: SHORT_BODY,
            pubDate: "Fri, 03 Jul 2026 00:00:00 GMT",
          },
        ],
      }),
    );

    const feedUrl = fixtures.url("/blog/bad-link-feed.xml");
    const badLinkHandle = Handle.fromFeedUrl(unwrap(FeedUrl.create(feedUrl)));

    const registerResponse = await fetch(`${base}/register`, {
      method: "POST",
      body: new URLSearchParams({ url: feedUrl }),
    });
    expect(registerResponse.status).toBe(200);

    await app.scheduler.tick();

    const actor = await fetchAp(`${base}/ap/actor/${badLinkHandle}`);
    const activities = await collectOutbox(actor["outbox"] as string);
    expect(activities).toHaveLength(1);

    const note = await resolveItem(activities[0]?.["object"]);
    expect(note["type"]).toBe("Note");
    expect(note["content"]).toContain("Bad Link Post");
    // The malformed link is never parsed into `url`; BotKit's own default
    // permalink (set at publish time) is left untouched instead.
    expect(note["url"]).not.toBe("/relative/path");
    expect(typeof note["url"]).toBe("string");
  });

  it("does not duplicate items and honors conditional GET on the next poll", async () => {
    // Wait past the 1s poll interval so the feed is due again.
    await new Promise((resolve) => setTimeout(resolve, 1500));
    await app.scheduler.tick();

    const lastFetch = fixtures.requests
      .filter((r) => r.path === "/blog/feed.xml")
      .at(-1);
    expect(lastFetch?.headers["if-none-match"]).toBe('W/"v1"');

    const actor = await fetchAp(`${base}/ap/actor/${feedHandle}`);
    const activities = await collectOutbox(actor["outbox"] as string);
    expect(activities).toHaveLength(2);
  });

  it("serves the web UI with the registered feed", async () => {
    const home = await fetch(base).then((r) => r.text());
    expect(home).toContain(`@${feedHandle}@${host}`);

    const search = await fetch(`${base}/search?q=E2E`).then((r) => r.text());
    expect(search).toContain(`@${feedHandle}@${host}`);

    expect((await fetch(`${base}/healthz`)).status).toBe(200);
    expect((await fetch(`${base}/readyz`)).status).toBe(200);
  });

  it("keeps the language cookie off non-page responses", async () => {
    // Language detection is attached per HTML route precisely so that it does
    // not reach BotKit's routes through the "/" mount (see routes.tsx).
    for (const path of [
      "/healthz",
      "/readyz",
      `/.well-known/webfinger?resource=acct:${feedHandle}@${host}`,
      `/ap/actor/${feedHandle}`,
    ]) {
      const response = await fetch(`${base}${path}`);
      expect(response.headers.get("set-cookie"), path).toBeNull();
    }

    const page = await fetch(`${base}/?lang=ko`);
    expect(page.headers.get("set-cookie")).toContain("lang=ko");
  });

  it("bridges Atom feeds the same way", async () => {
    fixtures.setFixture(
      "/atom.xml",
      atomFixture({
        title: "Atom Blog",
        entries: [
          {
            id: "urn:atom:1",
            link: "https://blog.example/a1",
            title: "Atom Entry",
            contentHtml: "<p>from an atom feed</p>",
            updated: "2026-07-03T00:00:00Z",
          },
        ],
      }),
      { contentType: "application/atom+xml" },
    );
    const feedUrl = fixtures.url("/atom.xml");
    const handle = Handle.fromFeedUrl(unwrap(FeedUrl.create(feedUrl)));

    const response = await fetch(`${base}/register`, {
      method: "POST",
      body: new URLSearchParams({ url: feedUrl }),
    });
    expect(response.status).toBe(200);
    await app.scheduler.tick();

    const actor = await fetchAp(`${base}/ap/actor/${handle}`);
    expect(actor["name"]).toBe("Atom Blog");
    const activities = await collectOutbox(actor["outbox"] as string);
    expect(activities).toHaveLength(1);
    const object = await resolveItem(activities[0]?.["object"]);
    expect(object["type"]).toBe("Note");
    expect(object["content"]).toContain("from an atom feed");
    expect(object["content"]).toContain("<strong>Atom Entry</strong>");
  });

  it("tags Note content with the feed's RSS channel <language> (ADR-0011)", async () => {
    fixtures.setFixture(
      "/lang-rss.xml",
      rssFixture({
        title: "Korean Blog",
        language: "ko",
        items: [
          {
            guid: "urn:e2e:lang-rss",
            title: "Post",
            description: SHORT_BODY,
            pubDate: "Fri, 03 Jul 2026 00:00:00 GMT",
          },
        ],
      }),
    );
    const feedUrl = fixtures.url("/lang-rss.xml");
    const handle = Handle.fromFeedUrl(unwrap(FeedUrl.create(feedUrl)));

    await fetch(`${base}/register`, {
      method: "POST",
      body: new URLSearchParams({ url: feedUrl }),
    });
    await app.scheduler.tick();

    const actor = await fetchAp(`${base}/ap/actor/${handle}`);
    const activities = await collectOutbox(actor["outbox"] as string);
    const note = await resolveItem(activities[0]?.["object"]);
    expect(note["type"]).toBe("Note");
    expect(note["contentMap"]).toMatchObject({ ko: expect.any(String) });
  });

  it("tags Note content with the Atom feed root's xml:lang (ADR-0011)", async () => {
    fixtures.setFixture(
      "/lang-atom.xml",
      atomFixture({
        title: "Atom Lang Blog",
        language: "ja",
        entries: [
          {
            id: "urn:e2e:lang-atom",
            title: "Entry",
            contentHtml: "<p>from an atom feed</p>",
            updated: "2026-07-03T00:00:00Z",
          },
        ],
      }),
      { contentType: "application/atom+xml" },
    );
    const feedUrl = fixtures.url("/lang-atom.xml");
    const handle = Handle.fromFeedUrl(unwrap(FeedUrl.create(feedUrl)));

    await fetch(`${base}/register`, {
      method: "POST",
      body: new URLSearchParams({ url: feedUrl }),
    });
    await app.scheduler.tick();

    const actor = await fetchAp(`${base}/ap/actor/${handle}`);
    const activities = await collectOutbox(actor["outbox"] as string);
    const note = await resolveItem(activities[0]?.["object"]);
    expect(note["type"]).toBe("Note");
    expect(note["contentMap"]).toMatchObject({ ja: expect.any(String) });
  });

  it("lets an Atom entry's own xml:lang override the feed root's (ADR-0011)", async () => {
    fixtures.setFixture(
      "/lang-atom-override.xml",
      atomFixture({
        title: "Mixed Language Blog",
        language: "en",
        entries: [
          {
            id: "urn:e2e:lang-override",
            title: "Entry en Français",
            contentHtml: "<p>ceci est en français</p>",
            updated: "2026-07-03T00:00:00Z",
            language: "fr",
          },
        ],
      }),
      { contentType: "application/atom+xml" },
    );
    const feedUrl = fixtures.url("/lang-atom-override.xml");
    const handle = Handle.fromFeedUrl(unwrap(FeedUrl.create(feedUrl)));

    await fetch(`${base}/register`, {
      method: "POST",
      body: new URLSearchParams({ url: feedUrl }),
    });
    await app.scheduler.tick();

    const actor = await fetchAp(`${base}/ap/actor/${handle}`);
    const activities = await collectOutbox(actor["outbox"] as string);
    const note = await resolveItem(activities[0]?.["object"]);
    expect(note["type"]).toBe("Note");
    expect(note["contentMap"]).toMatchObject({ fr: expect.any(String) });
    expect(note["contentMap"]).not.toHaveProperty("en");
  });

  it("publishes an Update activity when a feed entry's content changes", async () => {
    fixtures.setFixture(
      "/blog/mutable-feed.xml",
      rssFixture({
        title: "Mutable Blog",
        items: [
          {
            guid: "urn:e2e:mutable",
            link: "https://blog.example/mutable",
            title: "Original Title",
            description: "<p>original body</p>",
            pubDate: "Sat, 04 Jul 2026 00:00:00 GMT",
          },
        ],
      }),
    );
    const feedUrl = fixtures.url("/blog/mutable-feed.xml");
    const handle = Handle.fromFeedUrl(unwrap(FeedUrl.create(feedUrl)));

    await fetch(`${base}/register`, {
      method: "POST",
      body: new URLSearchParams({ url: feedUrl }),
    });
    await app.scheduler.tick();

    const actor = await fetchAp(`${base}/ap/actor/${handle}`);
    const before = await collectOutbox(actor["outbox"] as string);
    expect(before).toHaveLength(1);
    const originalNote = await resolveItem(before[0]?.["object"]);
    expect(originalNote["content"]).toContain("Original Title");
    const noteId = originalNote["id"] as string;

    // Wait past the poll interval so the feed is due again, then edit it.
    await new Promise((resolve) => setTimeout(resolve, 1500));
    fixtures.setFixture(
      "/blog/mutable-feed.xml",
      rssFixture({
        title: "Mutable Blog",
        items: [
          {
            guid: "urn:e2e:mutable",
            link: "https://blog.example/mutable",
            title: "Edited Title",
            description: "<p>edited body</p>",
            pubDate: "Sat, 04 Jul 2026 00:00:00 GMT",
          },
        ],
      }),
    );
    await app.scheduler.tick();

    const after = await collectOutbox(actor["outbox"] as string);
    expect(after, "no duplicate post for the same entry").toHaveLength(1);

    const editedNote = await fetchAp(noteId);
    expect(editedNote["content"]).toContain("Edited Title");
    expect(editedNote["content"]).toContain("edited body");
  });

  it("exposes NodeInfo", async () => {
    const response = await fetch(`${base}/nodeinfo/2.1`);
    expect(response.status).toBe(200);
    const nodeinfo = (await response.json()) as {
      software: { name: string };
    };
    expect(nodeinfo.software.name).toBe("rss2pub");
  });
});
