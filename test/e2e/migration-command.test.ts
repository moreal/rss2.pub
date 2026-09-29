import { execFileSync } from "node:child_process";
import { sql } from "drizzle-orm";
import { inject, it, expect } from "vitest";
import { createTestDatabase } from "./helpers/database.js";

it("applies bundled migrations to an empty database and can be rerun", async () => {
  const database = await createTestDatabase(
    inject("databaseUrl"),
    "migration_command_e2e",
    false,
  );
  const run = () => execFileSync(process.execPath, [
    "--import", "tsx", "src/web/migrate.ts",
  ], {
    env: { ...process.env, DATABASE_URL: database.url },
    encoding: "utf8",
  });

  try {
    expect(execFileSync("yarn", ["db:migrate"], {
      env: { ...process.env, DATABASE_URL: database.url },
      encoding: "utf8",
    })).toContain("migrations applied");
    const tables = await database.db.execute(sql`
      SELECT to_regclass('public.feeds') AS feeds,
             to_regclass('public.federation_actor_keys') AS actor_keys
    `);
    expect(tables[0]).toMatchObject({
      feeds: "feeds",
      actor_keys: "federation_actor_keys",
    });
    expect(run()).toContain("migrations applied");
  } finally {
    await database.close();
  }
});

it("runs operator moderation commands against the migrated database", async () => {
  const database = await createTestDatabase(inject("databaseUrl"), "moderation_command_e2e");
  const run = (...args: string[]) => execFileSync(process.execPath, [
    "--import", "tsx", "src/web/moderate.ts", ...args,
  ], {
    env: { ...process.env, DATABASE_URL: database.url, ORIGIN: "https://local.test" },
    encoding: "utf8",
    timeout: 30_000,
  });
  try {
    expect(run("reports")).toContain("[]");
    expect(run("block", "https://example.test/feed", "Spam")).toContain("Feed blocked.");
    const rows = await database.db.execute(sql`SELECT url FROM blocked_feeds`);
    expect(rows[0]).toMatchObject({ url: "https://example.test/feed" });
  } finally {
    await database.close();
  }
});
