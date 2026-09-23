import { drizzle } from "drizzle-orm/postgres-js";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import postgres from "postgres";
import { applyMigrations } from "../infrastructure/persistence/migrations.js";

/** Entry point shared by the local, container, and Nix migration commands. */
export async function runDatabaseMigrations(databaseUrl: string | undefined): Promise<void> {
  if (databaseUrl === undefined || databaseUrl.trim() === "") {
    throw new Error("DATABASE_URL is required");
  }
  const sql = postgres(databaseUrl, { onnotice: () => {} });
  try {
    await applyMigrations(drizzle(sql));
  } finally {
    await sql.end();
  }
}

if (process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    await runDatabaseMigrations(process.env["DATABASE_URL"]);
    console.log("database migrations applied");
  } catch (cause) {
    console.error("database migration failed:", cause instanceof Error ? cause.message : String(cause));
    process.exitCode = 1;
  }
}
