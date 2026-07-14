import { expect, test } from "@playwright/test";
import Database from "better-sqlite3";
import {
  captureEvent,
  postCaptureEvents,
  type CaptureProblemFixture,
} from "./captureFixtures";
import { E2E_DB_PATH } from "./database";

// Phase 0B4 Task 5 — Luogu capture-pipeline E2E.
// COVERAGE: Pipeline identity only. The full capture API, deterministic
// session/attempt materializer, and the /training UI must preserve the
// `luogu` platform string end-to-end.
//
// NON-GOAL: This test does NOT certify the extension DOM detector for Luogu.
// The visible-verdict selectors and detector logic are covered separately in
// tests/unit/luoguFixtureLoader.test.ts and tests/unit/extensionPlatforms.test.ts.
// Replaying a real Luogu URL through the extension is a future task.

const luoguProblem: CaptureProblemFixture = {
  captureSessionId: "session_e2e_luogu_pipeline",
  platform: "luogu",
  problemExternalId: "P1001",
  problemTitle: "A+B Problem",
  canonicalUrl: "https://www.luogu.com.cn/problem/P1001",
};

type LuoguAttemptRow = {
  readonly platform: string;
  readonly problem_external_id: string;
  readonly submission_id: string;
  readonly verdict: string | null;
  readonly result: string;
  readonly voided_at: string | null;
};

type LuoguSessionRow = {
  readonly id: string;
  readonly platform: string;
  readonly problem_external_id: string;
};

test("Luogu capture events project into the local training attempt with platform identity intact", async ({ page, request }) => {
  await postCaptureEvents(request, [
    captureEvent(luoguProblem, {
      type: "SESSION_STARTED",
      eventId: "evt_e2e_luogu_session",
      occurredAt: "2026-07-14T03:00:00.000Z",
    }),
    captureEvent(luoguProblem, {
      type: "SUBMISSION_OBSERVED",
      eventId: "evt_e2e_luogu_submission",
      submissionId: "submission_e2e_luogu_1",
      occurredAt: "2026-07-14T03:01:00.000Z",
    }),
    captureEvent(luoguProblem, {
      type: "VERDICT_OBSERVED",
      eventId: "evt_e2e_luogu_verdict",
      submissionId: "submission_e2e_luogu_1",
      verdict: "Accepted",
      occurredAt: "2026-07-14T03:02:00.000Z",
    }),
  ]);

  const db = new Database(E2E_DB_PATH, { readonly: true });
  try {
    const attempts = db.prepare<[], LuoguAttemptRow>(`
      SELECT platform, problem_external_id, submission_id, verdict, result, voided_at
      FROM training_attempts
      WHERE submission_id = 'submission_e2e_luogu_1'
    `).all();
    expect(attempts).toHaveLength(1);
    const attempt = attempts[0];
    if (attempt === undefined) throw new Error("Luogu attempt row was not returned");

    // Pipeline identity: the platform string from the capture event must
    // survive the materializer without falling back to a default platform.
    expect(attempt.platform).toBe("luogu");
    expect(attempt.problem_external_id).toBe("P1001");
    expect(attempt.submission_id).toBe("submission_e2e_luogu_1");
    expect(attempt.verdict).toBe("Accepted");
    expect(attempt.voided_at).toBeNull();

    const sessions = db.prepare<[], LuoguSessionRow>(`
      SELECT id, platform, problem_external_id
      FROM training_sessions
      WHERE id = 'session_e2e_luogu_pipeline'
    `).all();
    expect(sessions).toHaveLength(1);
    const session = sessions[0];
    if (session === undefined) throw new Error("Luogu session row was not returned");
    expect(session.platform).toBe("luogu");
    expect(session.problem_external_id).toBe("P1001");
  } finally {
    db.close();
  }

  // /training UI must render the Luogu identity from the projection above.
  // This is a render check, not a DOM-detector certification: the query string
  // is the only input the page receives, and the panel reads from the SQLite
  // attempt created by the same capture pipeline.
  await page.goto("/training?platform=luogu&externalId=P1001&title=A%2BB%20Problem");

  const headerSection = page.locator("section").filter({
    has: page.getByRole("heading", { name: "A+B Problem" }),
  });
  await expect(headerSection).toContainText("luogu");
  await expect(headerSection).toContainText("Problem ID: P1001");

  const attemptPanel = page.locator("section").filter({
    has: page.getByRole("heading", { name: "Training attempt" }),
  });
  await expect(attemptPanel).toContainText("A+B Problem");
  await expect(attemptPanel).toContainText("luogu");
  await expect(attemptPanel).toContainText("P1001");
  await expect(attemptPanel).toContainText("Accepted");
  await expect(attemptPanel).not.toContainText("leetcode");
  await expect(attemptPanel).not.toContainText("two-sum");
});
