import { expect, test } from "@playwright/test";
import Database from "better-sqlite3";
import {
  captureAttemptBundle,
  postCaptureAttempt,
  type CaptureProblemFixture,
} from "./captureFixtures";
import { E2E_DB_PATH } from "./database";

const problem: CaptureProblemFixture = {
  captureSessionId: "session_e2e_atomic_bundle",
  platform: "atcoder",
  problemExternalId: "abc100_a",
  problemTitle: "Happy Birthday!",
  canonicalUrl: "https://atcoder.jp/contests/abc100/tasks/abc100_a",
};

test("atomically ingests and idempotently replays one completed attempt", async ({ page, request }) => {
  const bundle = captureAttemptBundle(problem, {
    bundleId: "bundle_e2e_atomic",
    submissionId: "submission_e2e_atomic",
    verdict: "Accepted",
    submittedAt: "2026-07-21T01:00:00.000Z",
    verdictAt: "2026-07-21T01:01:00.000Z",
  });
  const first = await postCaptureAttempt(request, bundle);
  if (!first.ok()) {
    throw new Error(`Atomic bundle failed with ${first.status()}: ${await first.text()}`);
  }
  expect(await first.json()).toMatchObject({
    ok: true,
    bundleId: bundle.bundleId,
    attemptStatus: "passed",
    replayed: false,
  });
  const replay = await postCaptureAttempt(request, bundle);
  expect(replay.status()).toBe(200);
  expect(await replay.json()).toMatchObject({ replayed: true });

  const db = new Database(E2E_DB_PATH, { readonly: true });
  try {
    const attempts = db.prepare<[string], { readonly count: number }>(
      "SELECT COUNT(*) AS count FROM training_attempts WHERE submission_id = ?",
    ).get("submission_e2e_atomic");
    const events = db.prepare<[string], { readonly count: number }>(
      "SELECT COUNT(*) AS count FROM capture_events WHERE capture_session_id = ?",
    ).get(problem.captureSessionId);
    expect(attempts?.count).toBe(1);
    expect(events?.count).toBe(4);
  } finally {
    db.close();
  }

  await page.goto("/training?platform=atcoder&externalId=abc100_a&title=Happy%20Birthday!");
  await expect(page.locator("main")).toContainText("Accepted");
});

test("rejects a conflicting atomic replay without partial rows", async ({ request }) => {
  const bundle = captureAttemptBundle({ ...problem, captureSessionId: "session_e2e_atomic_conflict" }, {
    bundleId: "bundle_e2e_atomic_conflict",
    submissionId: "submission_e2e_atomic_conflict",
    verdict: "Wrong Answer",
    submittedAt: "2026-07-21T02:00:00.000Z",
    verdictAt: "2026-07-21T02:01:00.000Z",
  });
  const conflicting = {
    ...bundle,
    events: [
      bundle.events[0],
      { ...bundle.events[1], id: bundle.events[0].id },
      { ...bundle.events[2], id: bundle.events[0].id },
      { ...bundle.events[3], id: bundle.events[0].id },
    ] as typeof bundle.events,
  };
  const response = await postCaptureAttempt(request, conflicting);
  expect(response.status()).toBe(409);
  const db = new Database(E2E_DB_PATH, { readonly: true });
  try {
    const events = db.prepare<[string], { readonly count: number }>(
      "SELECT COUNT(*) AS count FROM capture_events WHERE capture_session_id = ?",
    ).get("session_e2e_atomic_conflict");
    expect(events?.count).toBe(0);
  } finally {
    db.close();
  }
});
