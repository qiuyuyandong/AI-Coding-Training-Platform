import { defineConfig, devices } from "@playwright/test";
import { ACCEPTANCE_DB_PATH, ACCEPTANCE_VAULT_CONFIG_DIR } from "./tests/acceptance-e2e/database";

const PORT = 3010;
const BASE_URL = `http://localhost:${PORT}`;

process.env.TRAINING_DB_PATH = ACCEPTANCE_DB_PATH;
process.env.TRAINING_VAULT_CONFIG_DIR = ACCEPTANCE_VAULT_CONFIG_DIR;

export default defineConfig({
  testDir: "./tests/acceptance-e2e",
  globalTeardown: "./tests/acceptance-e2e/global-teardown.ts",
  workers: 1,
  timeout: 120_000,
  expect: { timeout: 8_000 },
  use: { baseURL: BASE_URL, trace: "on-first-retry" },
  projects: [{ name: "bundled-chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: `npm run e2e:acceptance:prepare && npm run build && npm run start -- -p ${PORT}`,
    env: {
      TRAINING_DB_PATH: ACCEPTANCE_DB_PATH,
      TRAINING_VAULT_CONFIG_DIR: ACCEPTANCE_VAULT_CONFIG_DIR,
      TRAINING_AI_MODE: "disabled",
      TRAINING_AI_OPENAI_API_KEY: "",
    },
    url: BASE_URL,
    reuseExistingServer: false,
    timeout: 300_000,
  },
});
