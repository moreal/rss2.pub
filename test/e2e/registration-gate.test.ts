import postgres from "postgres";
import { sql } from "drizzle-orm";
import { expect, inject, it } from "vitest";
import { createPostgresRegistrationGate } from "../../src/infrastructure/persistence/postgres-registration-gate.js";
import { createDrizzleFeedRepository } from "../../src/infrastructure/persistence/drizzle-feed-repository.js";
import { createTestDatabase } from "./helpers/database.js";

it("admits only one new registration across independent database clients", async () => {
  const database = await createTestDatabase(inject("databaseUrl"), "registration_gate_e2e");
  const firstClient = postgres(database.url);
  const secondClient = postgres(database.url);
  try {
    const first = await createPostgresRegistrationGate(firstClient).tryAcquire();
    expect(first).not.toBeNull();
    expect(await createPostgresRegistrationGate(secondClient).tryAcquire()).toBeNull();
    await first?.release();
    const second = await createPostgresRegistrationGate(secondClient).tryAcquire();
    expect(second).not.toBeNull();
    await second?.release();
  } finally {
    await firstClient.end();
    await secondClient.end();
    await database.close();
  }
});

it("counts total and recent stored feeds for the shared registration budget", async () => {
  const database = await createTestDatabase(inject("databaseUrl"), "registration_counts_e2e");
  try {
    await database.db.execute(sql`
      INSERT INTO feeds (id, url, handle, registered_at, next_poll_at)
      VALUES
        ('old', 'https://old.example/feed', 'old_feed', '2026-09-20T00:00:00Z', '2026-09-20T00:00:00Z'),
        ('new', 'https://new.example/feed', 'new_feed', '2026-09-23T00:00:00Z', '2026-09-23T00:00:00Z')
    `);
    expect(await createDrizzleFeedRepository(database.db).registrationCounts(
      new Date("2026-09-22T00:00:00Z"),
    )).toEqual({ total: 2, recent: 1 });
  } finally {
    await database.close();
  }
});

it("bounds expensive registration attempts even when they fail downstream", async () => {
  const database = await createTestDatabase(inject("databaseUrl"), "registration_attempts_e2e");
  const client = postgres(database.url);
  let now = new Date("2026-09-23T00:00:00Z");
  const gate = createPostgresRegistrationGate(client, {
    attemptsPerHour: 2,
    now: () => now,
  });
  try {
    const first = await gate.tryAcquire();
    expect(first).not.toBeNull();
    await first?.release();
    const second = await gate.tryAcquire();
    expect(second).not.toBeNull();
    await second?.release();
    const blocked = await gate.tryAcquire();
    if (blocked !== null) await blocked.release();
    expect(blocked).toBeNull();
    now = new Date("2026-09-23T01:01:00Z");
    const afterWindow = await gate.tryAcquire();
    expect(afterWindow).not.toBeNull();
    await afterWindow?.release();
  } finally {
    await client.end();
    await database.close();
  }
});
