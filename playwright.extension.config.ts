import { defineConfig } from "@playwright/test";

const PORT = 3000;
const BASE_URL = `http://localhost:${PORT}`;

export default defineConfig({
  testDir: "./tests/extension-e2e",
  globalSetup: "./tests/extension-e2e/global-setup.ts",
  globalTeardown: "./tests/extension-e2e/global-teardown.ts",
  workers: 1,
  fullyParallel: false,
  timeout: 120_000,
  expect: {
    timeout: 10_000,
  },
  use: {
    baseURL: BASE_URL,
    trace: "on-first-retry",
  },
  webServer: {
    command: "node scripts/extension-e2e-server.mjs",
    url: BASE_URL,
    reuseExistingServer: false,
    timeout: 120_000,
  },
  outputDir: "test-results/extension-e2e",
});
