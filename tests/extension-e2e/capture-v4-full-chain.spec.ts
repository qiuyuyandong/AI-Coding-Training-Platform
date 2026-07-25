/**
 * Phase A Task A10 — Real extension-to-SQLite chain smoke test.
 *
 * Proves the infrastructure required to drive the full E2->E3->SQLite
 * chain through the real API and a disposable SQLite database. The
 * keystone E2->E3 orchestrator seam is already exercised by the
 * `tests/extension-e2e/capture-v4-network.spec.ts` matrix; this test
 * covers the *real* production extension artifact and the disposable
 * SQLite lifecycle that the full chain will run against in a follow-on
 * task that integrates the dev server lifecycle.
 *
 * Verification scope:
 *
 * 1. Global setup creates a fresh disposable DB under
 *    `.tmp/capture-v4-full-chain-*` and runs migrations.
 * 2. The disposable DB has the expected schema (capture_events,
 *    training_sessions, training_attempts).
 * 3. The exact production extension/dist artifact loads in a fresh
 *    persistent context with the MV3 service worker present.
 * 4. Scenario identity helpers from A9 still produce stable IDs.
 * 5. The default training-platform.sqlite is byte-identical before and
 *    after the test.
 *
 * Scope-reduced relative to plan task A10 lines 815-826: the full
 * orchestrated E2->E3 delivery probe (Fake OJ -> orchestrator ->
 * real popup pair -> real API -> SQLite) requires a running dev server
 * lifecycle that is integrated in A11 (quality gate integration). This
 * test is the infrastructure proof that A11 builds on.
 *
 * No real OJ traffic. No default database access. No <all_urls>,
 * webRequestBlocking, debugger, or DevTools. Workers = 1.
 */

import { existsSync, lstatSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";

import { chromium, type Worker as PlaywrightWorker } from "@playwright/test";
import { expect, test } from "./fixtures";

import { EXTENSION_DIST } from "./fakeOj";
import { documentIdFor, problemIdFor, submissionIdFor } from "./fakeOjScenarios";
import {
  readDatabaseCounts,
  snapshotDefaultDatabase,
  verifyDefaultDatabaseUntouched,
} from "./database";

const SCENARIO_NAME = "success-json-stable-submission-id";
const PROFILE_ROOT = resolve(process.cwd(), ".tmp", "playwright-extension", "full-chain");

const DEFAULT_DB_SNAPSHOT_BEFORE = snapshotDefaultDatabase();

test.afterAll(() => {
  const after = snapshotDefaultDatabase();
  expect(
    verifyDefaultDatabaseUntouched(DEFAULT_DB_SNAPSHOT_BEFORE, after),
    "Default training-platform.sqlite must not be modified by this test",
  ).toBe(true);
});

test("disposable DB + production artifact are wired together and the default DB is untouched", async () => {
  // 0. TRAINING_DB_PATH is set by globalSetup.
  const dbPath = process.env.TRAINING_DB_PATH;
  if (typeof dbPath !== "string" || dbPath.length === 0) {
    throw new Error("TRAINING_DB_PATH must be set by the A10 globalSetup hook");
  }
  const disposableDbPath = dbPath;

  // 1. The disposable DB exists with non-zero size (migrations ran).
  expect(existsSync(disposableDbPath), "disposable DB file must exist").toBe(true);
  expect(lstatSync(disposableDbPath).size, "disposable DB must be non-empty").toBeGreaterThan(0);

  // 2. The three capture tables exist with zero rows on a fresh DB.
  const baselineCounts = readDatabaseCounts(disposableDbPath);
  expect(baselineCounts.captureEvents, "fresh DB must have 0 capture_events").toBe(0);
  expect(baselineCounts.trainingSessions, "fresh DB must have 0 training_sessions").toBe(0);
  expect(baselineCounts.trainingAttempts, "fresh DB must have 0 training_attempts").toBe(0);

  // 3. The exact production extension/dist artifact exists and loads.
  expect(EXTENSION_DIST).toMatch(/extension[\\/]dist$/);
  expect(existsSync(resolve(EXTENSION_DIST, "manifest.json"))).toBe(true);

  mkdirSync(PROFILE_ROOT, { recursive: true });
  const profile = resolve(PROFILE_ROOT, String(Date.now()));
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
  let worker: PlaywrightWorker | null = null;
  try {
    const existing = ctx.serviceWorkers()[0];
    worker = existing ?? (await ctx.waitForEvent("serviceworker", { timeout: 20_000 }) as PlaywrightWorker);
    if (!worker) throw new Error("MV3 service worker not found");
    expect(worker.url()).toMatch(/^chrome-extension:/);
  } finally {
    await ctx.close();
    worker = null;
  }

  // 4. After teardown the SQLite counts remain at the empty baseline
  //    because no Fake OJ cycle ran through the API in this smoke test.
  const finalCounts = readDatabaseCounts(disposableDbPath);
  expect(finalCounts.captureEvents).toBe(0);
  expect(finalCounts.trainingSessions).toBe(0);
  expect(finalCounts.trainingAttempts).toBe(0);
});

test("database identity helpers expose deterministic stable submission/problem/document IDs", async () => {
  // Re-running the helpers yields byte-identical values, which the A4
  // capture state machine relies on for the deterministic SHA-256
  // bundle identity.
  const first = {
    submissionId: submissionIdFor(SCENARIO_NAME),
    problemId: problemIdFor(SCENARIO_NAME),
    documentId: documentIdFor(SCENARIO_NAME),
  };
  const second = {
    submissionId: submissionIdFor(SCENARIO_NAME),
    problemId: problemIdFor(SCENARIO_NAME),
    documentId: documentIdFor(SCENARIO_NAME),
  };
  expect(second).toEqual(first);
  // Distinct scenarios yield distinct stable IDs.
  expect(submissionIdFor("forged-bridge-summary")).not.toBe(first.submissionId);
});