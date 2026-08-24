import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/extension-e2e",
  testMatch: "capture-local-route-h-spike.spec.ts",
  workers: 1,
  fullyParallel: false,
  timeout: 180_000,
  expect: { timeout: 20_000 },
  outputDir: "test-results/extension-route-h-spike",
});
