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

beforeAll(async () => {
  database = await createTestDatabase(inject("databaseUrl"), "actor_icon_e2e");
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

/** ADR-0010: the actor's avatar is resolved from the channel link's favicon,
 * discovered on the first poll after registration rather than at registration
 * time. */
describe("actor icon from channel favicon e2e (ADR-0010)", () => {
  it("picks up the site's declared icon on the first poll", async () => {
    fixtures.setFixture(
      "/",
      `<!doctype html><html><head><link rel="icon" href="/icon.png"></head><body></body></html>`,
      { contentType: "text/html" },
    );
    fixtures.setFixture(
      "/feed.xml",
      atomFixture({ title: "Iconic Blog", link: fixtures.url("/"), entries: [] }),
    );

    const feedUrl = fixtures.url("/feed.xml");
    const canonicalUrl = unwrap(FeedUrl.create(feedUrl));
    const handle = Handle.fromFeedUrl(canonicalUrl);

    const registerRes = await fetch(`${base}/register`, {
      method: "POST",
      body: new URLSearchParams({ url: feedUrl }),
    });
    expect(registerRes.status).toBe(200);

    const beforePoll = await fetchAp(`${base}/ap/actor/${handle}`);
    expect(beforePoll["icon"]).toBeUndefined();

    await app.scheduler.tick();

    const actor = await fetchAp(`${base}/ap/actor/${handle}`);
    const icon = actor["icon"] as Record<string, unknown> | undefined;
    expect(icon?.["url"] ?? icon).toBe(fixtures.url("/icon.png"));
  });

  it("falls back to /favicon.ico when no <link> icon is declared", async () => {
    fixtures.setFixture("/plain/", `<!doctype html><html><head></head><body></body></html>`, {
      contentType: "text/html",
    });
    // /favicon.ico is always probed relative to the origin root, regardless
    // of the channel link's own path (browser convention).
    fixtures.setFixture("/favicon.ico", "fake-ico-bytes", {
      contentType: "image/x-icon",
    });
    fixtures.setFixture(
      "/plain-feed.xml",
      atomFixture({
        title: "Plain Blog",
        link: fixtures.url("/plain/"),
        entries: [],
      }),
    );

    const feedUrl = fixtures.url("/plain-feed.xml");
    const canonicalUrl = unwrap(FeedUrl.create(feedUrl));
    const handle = Handle.fromFeedUrl(canonicalUrl);

    const registerRes = await fetch(`${base}/register`, {
      method: "POST",
      body: new URLSearchParams({ url: feedUrl }),
    });
    expect(registerRes.status).toBe(200);

    await app.scheduler.tick();

    const actor = await fetchAp(`${base}/ap/actor/${handle}`);
    const icon = actor["icon"] as Record<string, unknown> | undefined;
    expect(icon?.["url"] ?? icon).toBe(fixtures.url("/favicon.ico"));
  });
});
