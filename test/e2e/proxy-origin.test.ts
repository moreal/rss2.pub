import { afterAll, beforeAll, expect, inject, it } from "vitest";
import { createApp, type App } from "../../src/web/app.js";
import { loadConfig } from "../../src/web/config.js";
import { unwrap } from "../helpers/result.js";
import { createTestDatabase, type TestDatabase } from "./helpers/database.js";

let database: TestDatabase;
let app: App;
const origin = "https://bridge.example";

beforeAll(async () => {
  database = await createTestDatabase(inject("databaseUrl"), "proxy_origin");
  app = await createApp(unwrap(loadConfig({
    DATABASE_URL: database.url,
    ORIGIN: origin,
    BEHIND_PROXY: "true",
  })));
});

afterAll(async () => {
  await app?.shutdown();
  await database?.close();
});

it("uses the configured public origin for actor profiles behind an HTTP proxy", async () => {
  const response = await app.fetch(new Request("http://internal:8000/ap/actor/rss2pub", {
    headers: { accept: "application/activity+json", "x-forwarded-host": "attacker.example" },
  }));
  expect(response.status).toBe(200);
  expect(await response.json()).toMatchObject({
    id: `${origin}/ap/actor/rss2pub`,
    url: `${origin}/@rss2pub`,
  });
});

it("preserves the WebFinger query and emits HTTPS collection pagination", async () => {
  const finger = await app.fetch(new Request(
    "http://internal:8000/.well-known/webfinger?resource=acct:rss2pub@bridge.example",
  ));
  expect(finger.status).toBe(200);
  expect(await finger.json()).toMatchObject({ links: expect.arrayContaining([
    expect.objectContaining({ rel: "http://webfinger.net/rel/profile-page", href: `${origin}/@rss2pub` }),
  ]) });
  const response = await app.fetch(new Request("http://internal:8000/ap/actor/rss2pub/outbox", {
    headers: { accept: "application/activity+json" },
  }));
  expect(response.status).toBe(200);
  expect(await response.json()).toMatchObject({ first: `${origin}/ap/actor/rss2pub/outbox?cursor=0` });
});
