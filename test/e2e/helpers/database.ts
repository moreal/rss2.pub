import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import type { Database } from "../../../src/infrastructure/persistence/drizzle-feed-repository.js";
import { applyMigrations } from "../../../src/infrastructure/persistence/migrations.js";

export type TestDatabase = {
  readonly url: string;
  readonly db: Database;
  close(): Promise<void>;
};

/**
 * Creates a fresh database on the shared e2e container and applies the
 * committed Drizzle migrations to it.
 */
export async function createTestDatabase(
  baseUrl: string,
  name: string,
  applySchema = true,
): Promise<TestDatabase> {
  if (!/^[a-z_][a-z0-9_]*$/.test(name)) {
    throw new Error(`unsafe test database name: ${name}`);
  }
  const admin = postgres(baseUrl, { max: 1 });
  await admin.unsafe(`DROP DATABASE IF EXISTS ${name}`);
  await admin.unsafe(`CREATE DATABASE ${name}`);
  await admin.end();

  const url = new URL(baseUrl);
  url.pathname = `/${name}`;

  const sql = postgres(url.href);
  const db = drizzle(sql);
  if (applySchema) await applyMigrations(db);

  return {
    url: url.href,
    db,
    close: async () => {
      await sql.end();
    },
  };
}
