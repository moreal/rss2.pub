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
