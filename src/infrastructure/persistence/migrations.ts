import { migrate } from "drizzle-orm/postgres-js/migrator";
import { fileURLToPath } from "node:url";

const migrationsFolder = fileURLToPath(new URL("../../../drizzle/", import.meta.url));

/** Apply the SQL bundled with this build, independent of the current directory. */
export async function applyMigrations(db: Parameters<typeof migrate>[0]): Promise<void> {
  await migrate(db, { migrationsFolder });
}
