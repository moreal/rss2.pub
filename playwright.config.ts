import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./test/ui",
  fullyParallel: false,
  workers: 1,
  reporter: "list",
  use: {
    ...devices["Desktop Chrome"],
    trace: "retain-on-failure",
  },
});
