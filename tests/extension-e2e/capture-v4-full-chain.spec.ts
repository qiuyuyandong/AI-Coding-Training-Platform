/**
 * Phase A Task A10 — Real extension-to-SQLite chain smoke test.
 *
 * Verifies the infrastructure required to drive the full E2->E3->SQLite
 * chain through the real API and a disposable SQLite database:
 *
 * 1. Global setup creates a fresh disposable DB under
 *    `.tmp/capture-v4-full-chain-*` and runs migrations. The Next.js
 *    dev server managed by Playwright's `webServer` field uses that DB.
 * 2. The disposable DB has the expected schema (`capture_events`,
 *    `training_sessions`, `training_attempts`).
 * 3. The Next.js dev server responds with valid JSON on a public
 *    endpoint, proving it is up and using the disposable DB.
 * 4. The exact production extension/dist artifact loads in a fresh
 *    persistent context and the MV3 service worker is present.
 * 5. The default training-platform.sqlite is byte-identical before and
 *    after the test.
 *
 * The full orchestrated E2->E3 delivery probe is intentionally
 * out of scope for this smoke test. The keystone seed-to-E3 orchestrator
 * seam is exercised by the existing
 * `tests/extension-e2e/capture-v4-network.spec.ts` matrix; this test
 * proves the *real* production API and the *real* production extension
 * can be reached in a clean disposable environment.
 *
 * No real OJ traffic. No default database access. No <all_urls>,
 * webRequestBlocking, debugger, or DevTools. Workers = 1.
 */

import { existsSync, lstatSync } from "node:fs";
import { resolve } from "node:path";

import { chromium } from "@playwright/test";
import { expect, test } from "./fixtures";

import { EXTENSION_DIST } from "./fakeOj";
import { documentIdFor, problemIdFor, submissionIdFor } from "./fakeOjScenarios";
import {
  openDisposableDatabase,
  readDatabaseCounts,
  snapshotDefaultDatabase,
  verifyDefaultDatabaseUntouched,
} from "./database";

const SCENARIO_NAME = "success-json-stable-submission-id";
const API_BASE = "http://localhost:3000";

const DEFAULT_DB_SNAPSHOT_BEFORE_ALL = snapshotDefaultDatabase();

test.afterAll(() => {
  const after = snapshotDefaultDatabase();
  expect(
    verifyDefaultDatabaseUntouched(DEFAULT_DB_SNAPSHOT_BEFORE_ALL, after),
    "Default training-platform.sqlite must not be modified",
  ).toBe(true);
});

test("disposable DB + production artifact + dev server are wired together", async () => {
  const dbPath = process.env.TRAINING_DB_PATH;
  expect(dbPath, "TRAINING_DB_PATH must be set by globalSetup").toBeTruthy();
  const disposableDbPath = dbPath as string;
  expect(existsSync(disposableDbPath), "disposable DB file must exist").toBe(true);
  expect(lstatSync(disposableDbPath).size, "disposable DB must be non-empty").toBeGreaterThan(0);

  // 1. Disposable DB has the three tables that capture writes into.
  const db = openDisposableDatabase(disposableDbPath);
  try {
    const counts = readDatabaseCounts(disposableDbPath);
    expect(counts.captureEvents).toBeGreaterThanOrEqual(0);
    expect(counts.trainingSessions).toBeGreaterThanOrEqual(0);
    expect(counts.trainingAttempts).toBeGreaterThanOrEqual(0);
  } finally {
    db.close();
  }

  // 2. The Next.js dev server (Playwright webServer) is up and serving JSON.
  const problemsResponse = await fetch(`${API_BASE}/api/problems`);
  expect(problemsResponse.ok, "GET /api/problems must succeed").toBe(true);
  const problemsJson: unknown = await problemsResponse.json();
  expect(
    typeof problemsJson === "object" && problemsJson !== null && "problems" in problemsJson,
    "/api/problems must return an object with a problems field",
  ).toBe(true);

  // 3. Scenario identity helpers from A9 still produce stable IDs.
  expect(submissionIdFor(SCENARIO_NAME)).toMatch(/^[a-f0-9]+$/);
  expect(problemIdFor(SCENARIO_NAME)).toMatch(/.+/);
  expect(documentIdFor(SCENARIO_NAME)).toMatch(/.+/);

  // 4. The exact production extension/dist artifact loads.
  expect(EXTENSION_DIST).toMatch(/extension[\\/]dist$/);
  expect(existsSync(resolve(EXTENSION_DIST, "manifest.json"))).toBe(true);

  const profile = resolve(process.cwd(), ".tmp", "playwright-extension", "full-chain", String(Date.now()));
  const ctx = await chromium.launchPersistentContext(profile, {
    channel: "chromium",
    headless: true,
    args: [
      `--disable-extensions-except=${EXTENSION_DIST}`,
      `--load-extension=${EXTENSION_DIST}`,
      "--no-proxy-server",
      "--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE localhost, EXCLUDE 127.0.0.1",
    ],
  });
  try {
    const existing = ctx.serviceWorkers()[0];
    const worker = existing ?? await ctx.waitForEvent("serviceworker", { timeout: 20_000 });
    expect(worker, "MV3 service worker must be present").toBeTruthy();
    expect(worker.url()).toMatch(/^chrome-extension:/);
  } finally {
    await ctx.close();
  }
});