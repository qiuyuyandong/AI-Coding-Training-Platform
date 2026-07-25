import { defineConfig } from "@playwright/test";

const PORT = 3000;
const BASE_URL = `http://localhost:${PORT}`;

// The disposable DB path is set by globalSetup before webServer starts.
// Reading it here would be racy; globalSetup sets process.env.TRAINING_DB_PATH
// and Playwright forwards that env to the webServer subprocess.

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
    command: `npm run dev -- -p ${PORT}`,
    url: BASE_URL,
    reuseExistingServer: false,
    timeout: 120_000,
  },
  outputDir: "test-results/extension-e2e",
});