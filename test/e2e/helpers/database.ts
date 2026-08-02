import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import type { Database } from "../../../src/infrastructure/persistence/drizzle-feed-repository.js";

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
  await migrate(db, { migrationsFolder: "drizzle" });

  return {
    url: url.href,
    db,
    close: async () => {
      await sql.end();
    },
  };
}
