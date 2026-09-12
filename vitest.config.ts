import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: "unit",
          include: ["test/unit/**/*.test.ts", "packages/*/test/**/*.test.ts"],
          // Both W3C Feed Validator conformance suites (atom-feed, rss-feed)
          // exercise real git plumbing against the single shared
          // vendor/w3c-feedvalidator submodule checkout (staging/unstaging a
          // fixture to prove the manifest updater rejects a dirty corpus).
          // Running test files in parallel workers races on that submodule's
          // .git/modules/.../index.lock. The whole "unit" project is fast
          // enough that serializing files is not a meaningful cost.
          fileParallelism: false,
        },
      },
      {
        test: {
          name: "e2e",
          include: ["test/e2e/**/*.test.ts"],
          globalSetup: ["./test/e2e/global-setup.ts"],
          testTimeout: 60_000,
          hookTimeout: 120_000,
        },
      },
    ],
  },
});
