import { readFile } from "node:fs/promises";
import { exportJwk, generateCryptoKeyPair } from "@fedify/fedify";
import postgres from "postgres";
import { afterAll, beforeAll, beforeEach, expect, inject, it } from "vitest";
import { createDrizzleFeedRepository } from "../../src/infrastructure/persistence/drizzle-feed-repository.js";
import { createDrizzleFederationRepository } from "../../src/infrastructure/persistence/drizzle-federation-repository.js";
import { getActorKeyPairs } from "../../src/infrastructure/federation/keys.js";
import { makeFeed } from "../helpers/fakes.js";
import { createTestDatabase, type TestDatabase } from "./helpers/database.js";

let database: TestDatabase;
let sql: postgres.Sql;
let legacyKeys: readonly { position: number; publicJwk: string; privateJwk: string }[];
const origin = "https://bridge.example";
const feed = makeFeed();
const actor = `${origin}/ap/actor/${feed.handle}`;
const object = {
  id: `${actor}/note/legacy-id`, type: "Note", content: "<p>Original body</p>",
  published: "2026-08-24T00:00:00Z", attributedTo: actor,
  to: "https://www.w3.org/ns/activitystreams#Public", cc: `${actor}/followers`,
  url: "https://source.example/post", contentMap: { ko: "<p>Original body</p>" },
};

beforeAll(async () => {
  database = await createTestDatabase(inject("databaseUrl"), "botkit_recovery");
  sql = postgres(database.url, { max: 1 });
  await sql.unsafe(`
    CREATE SCHEMA botkit;
    CREATE TABLE botkit.messages(bot_id text,id text,activity_json jsonb,published bigint);
    CREATE TABLE botkit.followers(bot_id text,follower_id text,actor_json jsonb);
    CREATE TABLE botkit.key_pairs(bot_id text,position integer,private_key_jwk jsonb,public_key_jwk jsonb);
  `);
  await createDrizzleFeedRepository(database.db).save(feed);
  legacyKeys = await Promise.all([
    generateCryptoKeyPair("RSASSA-PKCS1-v1_5"), generateCryptoKeyPair("Ed25519"),
  ].map(async (pending, position) => {
    const pair = await pending;
    return {
      position, publicJwk: JSON.stringify(await exportJwk(pair.publicKey)),
      privateJwk: JSON.stringify(await exportJwk(pair.privateKey)),
    };
  }));
});

beforeEach(async () => {
  await sql.unsafe("TRUNCATE botkit.messages,botkit.followers,botkit.key_pairs,federation_objects,federation_followers,federation_actor_keys");
  await sql`INSERT INTO botkit.messages VALUES (${feed.handle},'legacy-id',${sql.json({
    type: "Create", actor, object,
  })},1787529600000)`;
  await sql`INSERT INTO botkit.followers VALUES (${feed.handle},'https://remote.example/actor',${sql.json({
    id: "https://remote.example/actor", inbox: "https://remote.example/inbox",
    endpoints: { sharedInbox: "https://remote.example/shared" },
  })})`;
  for (const key of legacyKeys) {
    await sql`INSERT INTO botkit.key_pairs VALUES (${feed.handle},${key.position},${key.privateJwk}::text::jsonb,${key.publicJwk}::text::jsonb)`;
  }
});

afterAll(async () => {
  await sql?.end();
  await database?.close();
});

async function recover(): Promise<void> {
  const script = await readFile("scripts/recover-botkit-state.sql", "utf8");
  await sql.begin(async (tx) => {
    await tx`SELECT set_config('rss2pub.recovery_origin',${origin},true)`;
    await tx.unsafe(script);
  });
}

it("restores old object IDs, audiences, followers and absent keys idempotently", async () => {
  await recover();
  await recover();
  const repo = createDrizzleFederationRepository(database.db);
  expect(await repo.findObject(feed.handle, "legacy-id")).toMatchObject({
    contentHtml: object.content, language: "ko", sourceUrl: object.url,
    toUris: [object.to], ccUris: [object.cc], attributedToUris: [actor],
    publishedAt: new Date(object.published),
  });
  expect(await repo.countObjects(feed.handle)).toBe(1);
  expect(await repo.countFollowers(feed.handle)).toBe(1);
  expect(await repo.getKeyPairs(feed.handle)).toHaveLength(2);
  expect(await getActorKeyPairs(feed.handle, repo)).toHaveLength(2);
  expect(await sql`SELECT follower_count FROM feeds WHERE id=${feed.id}`).toEqual([{ follower_count: 1 }]);
  expect(await sql`SELECT count(*)::int AS n FROM botkit.messages`).toEqual([{ n: 1 }]);
});

it("rolls back rather than importing an incomplete legacy key pair", async () => {
  await sql`DELETE FROM botkit.key_pairs WHERE position=1`;
  await expect(recover()).rejects.toThrow(/key pair/i);
  expect(await sql`SELECT count(*)::int AS n FROM federation_actor_keys`).toEqual([{ n: 0 }]);
});

it("rejects malformed follower endpoints before committing recovered data", async () => {
  await sql`UPDATE botkit.followers SET actor_json=jsonb_set(actor_json,'{endpoints,sharedInbox}','"https://"'::jsonb)`;
  await expect(recover()).rejects.toThrow(/follower/i);
  expect(await sql`SELECT count(*)::int AS n FROM federation_objects`).toEqual([{ n: 0 }]);
});

it("expands BotKit's compact as:Public audience to the canonical URI", async () => {
  await sql`UPDATE botkit.messages SET activity_json=${sql.json({
    type: "Create", actor, object: { ...object, to: "as:Public" },
  })}`;
  await recover();
  expect(await createDrizzleFederationRepository(database.db).findObject(feed.handle, "legacy-id"))
    .toMatchObject({ toUris: [object.to] });
});

it("keeps current objects and keys, and excludes private main-actor replies", async () => {
  await recover();
  await sql`UPDATE federation_objects SET content_html='newer body'`;
  await sql`UPDATE federation_actor_keys SET private_jwk='{"marker":"current"}'::jsonb`;
  await sql`INSERT INTO botkit.messages VALUES ('rss2pub','private-reply',${sql.json({
    type: "Create", object: { ...object, id: `${origin}/ap/actor/rss2pub/note/private-reply`, inReplyTo: "https://remote.example/private" },
  })},1787529600000)`;
  await recover();
  expect(await sql`SELECT content_html FROM federation_objects`).toEqual([{ content_html: "newer body" }]);
  expect(await sql`SELECT count(*)::int AS n FROM federation_actor_keys WHERE private_jwk->>'marker'='current'`).toEqual([{ n: 2 }]);
});

it("rolls back on a mismatched object origin instead of assigning a new identity", async () => {
  await sql`UPDATE botkit.messages SET activity_json=${sql.json({
    type: "Create", actor, object: { ...object, id: "https://elsewhere.example/note/legacy-id" },
  })}`;
  await expect(recover()).rejects.toThrow(/identity/i);
  expect(await sql`SELECT count(*)::int AS n FROM federation_objects`).toEqual([{ n: 0 }]);
  expect(await sql`SELECT count(*)::int AS n FROM federation_followers`).toEqual([{ n: 0 }]);
});
