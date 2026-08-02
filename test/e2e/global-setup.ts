import { PostgreSqlContainer } from "@testcontainers/postgresql";
import type { TestProject } from "vitest/node";

/**
 * Starts one PostgreSQL container for the whole e2e project. Each test file
 * carves out its own database via createTestDatabase() for isolation.
 */
export default async function setup(project: TestProject) {
  const container = await new PostgreSqlContainer("postgres:17-alpine").start();
  project.provide("databaseUrl", container.getConnectionUri());
  return async () => {
    await container.stop();
  };
}

declare module "vitest" {
  export interface ProvidedContext {
    databaseUrl: string;
  }
}
