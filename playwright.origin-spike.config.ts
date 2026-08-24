import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/extension-e2e",
  testMatch: "capture-local-origin-spike.spec.ts",
  workers: 1,
  fullyParallel: false,
  timeout: 120_000,
  expect: { timeout: 15_000 },
  outputDir: "test-results/extension-origin-spike",
});
