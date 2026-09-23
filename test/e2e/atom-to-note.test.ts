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

const AP_ACCEPT = "application/activity+json";
const PUBLIC = "https://www.w3.org/ns/activitystreams#Public";

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
let handle: string;

const SOURCE_LINK = "https://blog.example/hello";
const KO_LINK = "https://blog.example/korean";

/** Carries markup the sanitizer must drop, and markup it must keep. */
const ENTRY_HTML =
  '<p>Hello <strong>world</strong>, see <a href="https://ref.example/x">this</a>.</p>' +
  '<script>alert(1)</script>' +
  '<p onclick="steal()" style="color:red">Second paragraph.</p>';

beforeAll(async () => {
  database = await createTestDatabase(inject("databaseUrl"), "atom_to_note_e2e");
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
    registrationDailyLimit: 20,
    registrationTotalLimit: 1000,
    registrationAttemptsPerHour: 60,
    behindProxy: false,
    allowPrivateAddress: true,
    logLevel: "warning",
    logFormat: "console",
  };
  app = await createApp(config);
  server = serve({ fetch: app.fetch, port, hostname: "127.0.0.1" });

  fixtures.setFixture(
    "/atom.xml",
    atomFixture({
      title: "Atom To Note Blog",
      entries: [
        {
          id: "urn:e2e:note",
          link: SOURCE_LINK,
          title: "Hello Post",
          contentHtml: ENTRY_HTML,
          published: "2026-07-01T00:00:00Z",
          updated: "2026-07-01T00:00:00Z",
        },
        {
          // Language-tagged content is serialized as contentMap only, so it
          // gets its own entry rather than hiding `content` on every other
          // assertion in this file.
          id: "urn:e2e:korean",
          link: KO_LINK,
          title: "Korean Post",
          contentHtml: "<p>안녕하세요</p>",
          language: "ko",
          updated: "2026-07-03T00:00:00Z",
        },
        {
          id: "urn:e2e:long-note",
          link: "https://blog.example/long",
          title: "Long Post",
          contentHtml: `<p>${"padding ".repeat(60)}</p>`,
          updated: "2026-07-02T00:00:00Z",
        },
      ],
    }),
  );

  const feedUrl = fixtures.url("/atom.xml");
  handle = Handle.fromFeedUrl(unwrap(FeedUrl.create(feedUrl)));
  const registered = await fetch(`${base}/register`, {
    method: "POST",
    body: new URLSearchParams({ url: feedUrl }),
  });
  expect(registered.status).toBe(200);
  await app.scheduler.tick();
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

async function outboxActivities(): Promise<Record<string, unknown>[]> {
  const actor = await fetchAp(`${base}/ap/actor/${handle}`);
  const outbox = await fetchAp(actor["outbox"] as string);
  const page = Array.isArray(outbox["orderedItems"])
    ? outbox
    : await fetchAp(outbox["first"] as string);
  const items = (page["orderedItems"] ?? page["items"] ?? []) as unknown[];
  return Promise.all(items.map(resolveItem));
}

/** The Create whose object is the Note for `sourceLink`. */
async function noteCreate(sourceLink: string): Promise<{
  activity: Record<string, unknown>;
  note: Record<string, unknown>;
}> {
  const activities = await outboxActivities();
  for (const activity of activities) {
    const object = await resolveItem(activity["object"]);
    if (object["type"] === "Note" && object["url"] === sourceLink) {
      return { activity, note: object };
    }
  }
  throw new Error(`no Note for ${sourceLink} in the outbox`);
}

/** Fedify emits the compact `as:Public`; treat it as the URI it stands for. */
const normalizePublic = (value: string): string =>
  value === "as:Public" || value === "Public" ? PUBLIC : value;

const stringValues = (value: unknown): string[] =>
  Array.isArray(value)
    ? value.map((entry) => String(entry))
    : value === undefined || value === null
      ? []
      : [String(value)];

/**
 * One Atom document, end to end: parsed, decided, federated, and served back
 * as an ActivityPub Note that a remote server can dereference on its own.
 */
describe("Atom entry to ActivityPub Note", () => {
  it("wraps the Note in a Create addressed to the public and the followers", async () => {
    const { activity, note } = await noteCreate(SOURCE_LINK);

    expect(activity["type"]).toBe("Create");
    expect(stringValues(activity["actor"])).toEqual([
      `${base}/ap/actor/${handle}`,
    ]);
    expect(stringValues(activity["to"]).map(normalizePublic)).toEqual([PUBLIC]);
    expect(stringValues(activity["cc"])).toEqual([
      `${base}/ap/actor/${handle}/followers`,
    ]);
    expect(String(note["id"])).toMatch(
      new RegExp(`^${base}/ap/actor/${handle}/note/[^/]+$`),
    );
  });

  it("serves the Note at its own id, for a remote server to dereference", async () => {
    const { note } = await noteCreate(SOURCE_LINK);
    const standalone = await fetchAp(note["id"] as string);

    expect(standalone["type"]).toBe("Note");
    expect(standalone["id"]).toBe(note["id"]);
    expect(standalone["content"]).toBe(note["content"]);
    expect(standalone["url"]).toBe(note["url"]);
  });

  it("attributes the Note to the feed actor and repeats the addressing", async () => {
    const { note } = await noteCreate(SOURCE_LINK);

    expect(stringValues(note["attributedTo"])).toEqual([
      `${base}/ap/actor/${handle}`,
    ]);
    expect(stringValues(note["to"]).map(normalizePublic)).toEqual([PUBLIC]);
    expect(stringValues(note["cc"])).toEqual([
      `${base}/ap/actor/${handle}/followers`,
    ]);
  });

  it("renders the title, the sanitized body and the source link as HTML", async () => {
    const { note } = await noteCreate(SOURCE_LINK);
    const content = String(note["content"]);

    expect(note["mediaType"]).toBe("text/html");
    expect(content).toContain("<strong>Hello Post</strong>");
    expect(content).toContain("Hello <strong>world</strong>");
    expect(content).toContain(
      `<a href="${SOURCE_LINK}" rel="nofollow noopener noreferrer">${SOURCE_LINK}</a>`,
    );

    // The sanitizer's allowlist: scripts and event handlers never reach a
    // follower's timeline, and neither does inline styling.
    expect(content).not.toContain("<script");
    expect(content).not.toContain("alert(1)");
    expect(content).not.toContain("onclick");
    expect(content).not.toContain("style=");
    expect(content).toContain("Second paragraph.");
  });

  it("tags a language-marked entry's content with its xml:lang (ADR-0011)", async () => {
    const { note } = await noteCreate(KO_LINK);
    expect(note["contentMap"]).toMatchObject({ ko: expect.any(String) });
    expect(String((note["contentMap"] as Record<string, string>)["ko"])).toContain(
      "안녕하세요",
    );
  });

  it("points url at the original entry, distinct from the Note's own id", async () => {
    const { note } = await noteCreate(SOURCE_LINK);
    expect(note["url"]).toBe(SOURCE_LINK);
    expect(note["url"]).not.toBe(note["id"]);
  });

  it("timestamps the Note with the feed item's publication date", async () => {
    const { note } = await noteCreate(SOURCE_LINK);
    expect(note["published"]).toBe("2026-07-01T00:00:00Z");
  });

  it("publishes every entry as a Note without a generated summary", async () => {
    const activities = await outboxActivities();
    const objects = await Promise.all(
      activities.map((activity) => resolveItem(activity["object"])),
    );
    expect(objects).toHaveLength(3);
    for (const note of objects) {
      expect(note["type"]).toBe("Note");
      expect(note["name"]).toBeUndefined();
      expect(note["summary"]).toBeUndefined();
    }

    const { note: longNote } = await noteCreate("https://blog.example/long");
    expect(String(longNote["content"])).toContain("padding padding");
    expect(String(longNote["content"])).toContain("<strong>Long Post</strong>");
  });
});
