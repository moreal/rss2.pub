import { eq } from "drizzle-orm";
import { feeds, publishedItems, federationObjects } from "../../src/infrastructure/persistence/schema.js";
import { serve, type ServerType } from "@hono/node-server";
import { createServer } from "node:net";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { FeedUrl } from "../../src/domain/feed/feed-url.js";
import { Handle } from "../../src/domain/feed/handle.js";
import { createApp, type App } from "../../src/web/app.js";
import type { AppConfig } from "../../src/web/config.js";
import { createDrizzleFeedRepository } from "../../src/infrastructure/persistence/drizzle-feed-repository.js";
import { makeFeed } from "../helpers/fakes.js";
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
  database = await createTestDatabase(inject("databaseUrl"), "atom_content_e2e");
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


describe("Atom entry content publication", () => {
  it.each([false, true])("publishes embedded content without fetching article pages (legacy=%s)", async (legacy) => {
    const path = legacy ? "/legacy.xml" : "/ordinary.xml";
    const articlePath = legacy ? "/legacy-article" : "/ordinary-article";
    fixtures.setFixture(articlePath, "<article>External article must not be fetched</article>", {
      contentType: "text/html",
    });
    fixtures.setFixture(path, atomFixture({
      title: "Atom Content Blog",
      entries: [
        { id: `urn:content:${legacy}`, title: "Embedded content",
          link: fixtures.url(articlePath), summary: "<p>Short summary</p>",
          contentHtml: '<p>Atom body with <strong>formatting</strong>.</p><script>unsafe()</script>' },
        { id: `urn:summary:${legacy}`, title: "Summary fallback",
          link: fixtures.url(articlePath), summary: "<p>Summary-only body</p>" },
      ],
    }));
    const feedUrl = fixtures.url(path);
    const url = unwrap(FeedUrl.create(feedUrl));
    const handle = Handle.fromFeedUrl(url, legacy);
    if (legacy) {
      // Seed the pre-existing identity through persistence: new registrations
      // can no longer create this variant.
      await createDrizzleFeedRepository(database.db).save(makeFeed({
        url: feedUrl, fullContentEnabled: true,
      }));
    } else {
      for (const form of [{ url: feedUrl }, { url: feedUrl, full: "1" }]) {
        const response = await fetch(`${base}/register`, {
          method: "POST", body: new URLSearchParams(form),
        });
        expect(response.status).toBe(200);
        expect(await response.text()).toContain(`@${handle}@${host}`);
      }
      expect((await fetch(`${base}/ap/actor/${Handle.fromFeedUrl(url, true)}`, {
        headers: { accept: AP_ACCEPT },
      })).status).toBe(404);
    }
    await app.scheduler.tick();
    const actor = await fetchAp(`${base}/ap/actor/${handle}`);
    expect(actor["preferredUsername"]).toBe(handle);
    expect(actor["summary"]).not.toContain("fetched from the original page");
    const activities = await collectOutbox(String(actor["outbox"]));
    const objects = await Promise.all(activities.map((activity) => resolveItem(activity["object"])));
    expect(objects).toHaveLength(2);
    const bodies = objects.map((object) => String(object["content"]));
    expect(bodies.some((body) => body.includes("Atom body with <strong>formatting</strong>"))).toBe(true);
    expect(bodies.some((body) => body.includes("Summary-only body"))).toBe(true);
    expect(bodies.join(" ")).not.toContain("Short summary");
    expect(bodies.join(" ")).not.toContain("unsafe()");

    if (legacy) {
      const feed = await createDrizzleFeedRepository(database.db).findByUrl(url, true);
      if (feed === null) throw new Error("missing legacy fixture feed");
      // Model an earlier deployment's published objects and overdue retry state.
      await database.db.update(publishedItems).set({
        fullContentUsed: true,
        extractFailures: 3,
        extractNextAttemptAt: new Date(0),
      }).where(eq(publishedItems.feedId, feed.id));
      await database.db.update(federationObjects).set({
        contentHtml: "<p>Previously extracted page</p>",
      }).where(eq(federationObjects.actorHandle, handle));
      const before = await database.db.select().from(federationObjects)
        .where(eq(federationObjects.actorHandle, handle));
      await database.db.update(feeds).set({ nextPollAt: new Date(0) })
        .where(eq(feeds.id, feed.id));
      await app.scheduler.tick();
      expect(await database.db.select().from(federationObjects)
        .where(eq(federationObjects.actorHandle, handle))).toEqual(before);

      fixtures.setFixture(path, atomFixture({
        title: "Atom Content Blog",
        entries: [{ id: `urn:content:${legacy}`, title: "Embedded content",
          link: fixtures.url(articlePath), contentHtml: "<p>Edited Atom body</p>" }],
      }));
      await database.db.update(feeds).set({ nextPollAt: new Date(0) })
        .where(eq(feeds.id, feed.id));
      await app.scheduler.tick();
      const after = await database.db.select().from(federationObjects)
        .where(eq(federationObjects.actorHandle, handle));
      expect(after).toHaveLength(2);
      expect(after.map((object) => object.id).sort()).toEqual(before.map((object) => object.id).sort());
      expect(after.filter((object) => object.contentHtml.includes("Edited Atom body"))).toHaveLength(1);
      const actorAfter = await fetchAp(`${base}/ap/actor/${handle}`);
      expect(actorAfter["id"]).toBe(actor["id"]);
      expect(actorAfter["publicKey"]).toEqual(actor["publicKey"]);
      expect(actorAfter["assertionMethod"]).toEqual(actor["assertionMethod"]);
    }
    expect(fixtures.requests.filter((request) => request.path === articlePath)).toEqual([]);
  });
});
