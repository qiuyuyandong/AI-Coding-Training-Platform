import { defineConfig, devices } from "@playwright/test";
import { E2E_DB_PATH, E2E_VAULT_CONFIG_DIR } from "./tests/e2e/database";

const PORT = 3000;
const BASE_URL = `http://localhost:${PORT}`;

process.env.TRAINING_DB_PATH = E2E_DB_PATH;
process.env.TRAINING_VAULT_CONFIG_DIR = E2E_VAULT_CONFIG_DIR;

export default defineConfig({
  testDir: "./tests/e2e",
  globalTeardown: "./tests/e2e/global-teardown.ts",
  workers: 1,
  timeout: 30_000,
  expect: {
    timeout: 5_000,
  },
  use: {
    baseURL: BASE_URL,
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: {
    // E2E assertions exercise mutation feedback immediately after a click.
    // A production server avoids per-route development compilation consuming
    // that feedback window while keeping Playwright responsible for lifecycle.
    command: `npm run e2e:prepare && npm run build && npm run start -- -p ${PORT}`,
    env: {
      TRAINING_DB_PATH: E2E_DB_PATH,
      TRAINING_VAULT_CONFIG_DIR: E2E_VAULT_CONFIG_DIR,
    },
    url: BASE_URL,
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
