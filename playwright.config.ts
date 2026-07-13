import { defineConfig, devices } from "@playwright/test";
import { E2E_DB_PATH } from "./tests/e2e/database";

const PORT = 3000;
const BASE_URL = `http://localhost:${PORT}`;

process.env.TRAINING_DB_PATH = E2E_DB_PATH;

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
    command: `npm run e2e:prepare && npm run dev -- -p ${PORT}`,
    env: {
      TRAINING_DB_PATH: E2E_DB_PATH,
    },
    url: BASE_URL,
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
