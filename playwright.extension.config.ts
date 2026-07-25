import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/extension-e2e",
  globalTeardown: "./tests/extension-e2e/global-teardown.ts",
  workers: 1,
  fullyParallel: false,
  timeout: 120_000,
  expect: {
    timeout: 10_000,
  },
  use: {
    trace: "on-first-retry",
  },
  outputDir: "test-results/extension-e2e",
});
