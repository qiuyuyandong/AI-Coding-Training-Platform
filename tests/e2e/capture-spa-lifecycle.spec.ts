import { expect, test } from "@playwright/test";
import Database from "better-sqlite3";
import {
  captureEvent,
  postCaptureEvents,
  type CaptureProblemFixture,
} from "./captureFixtures";
import { E2E_DB_PATH } from "./database";

const twoSum: CaptureProblemFixture = {
  captureSessionId: "session_e2e_spa_two_sum",
  platform: "leetcode",
  problemExternalId: "two-sum",
  problemTitle: "Two Sum",
  canonicalUrl: "https://leetcode.com/problems/two-sum/",
};

const validParentheses: CaptureProblemFixture = {
  captureSessionId: "session_e2e_spa_valid_parentheses",
  platform: "leetcode",
  problemExternalId: "valid-parentheses",
  problemTitle: "Valid Parentheses",
  canonicalUrl: "https://leetcode.com/problems/valid-parentheses/",
};

type SessionRow = {
  readonly id: string;
  readonly end_reason: string | null;
};

type AttemptRow = {
  readonly problem_external_id: string;
  readonly verdict: string;
};

test("projects an SPA end/start sequence without cross-linking problems", async ({
  page,
  request,
}) => {
  // Extension SPA observation itself is covered by content-runtime unit tests.
  // This browser test validates the downstream API, SQLite, and UI sequence.
  await postCaptureEvents(request, [
    captureEvent(twoSum, {
      type: "SESSION_STARTED",
      eventId: "evt_e2e_spa_two_sum_session",
      occurredAt: "2026-07-14T06:00:00.000Z",
    }),
    captureEvent(twoSum, {
      type: "SUBMISSION_OBSERVED",
      eventId: "evt_e2e_spa_two_sum_submission",
      submissionId: "submission_e2e_spa_two_sum",
      occurredAt: "2026-07-14T06:01:00.000Z",
    }),
    captureEvent(twoSum, {
      type: "VERDICT_OBSERVED",
      eventId: "evt_e2e_spa_two_sum_verdict",
      submissionId: "submission_e2e_spa_two_sum",
      verdict: "Wrong Answer",
      occurredAt: "2026-07-14T06:02:00.000Z",
    }),
    captureEvent(twoSum, {
      type: "SESSION_ENDED",
      eventId: "evt_e2e_spa_two_sum_end",
      endReason: "spa_navigation",
      occurredAt: "2026-07-14T06:03:00.000Z",
    }),
    captureEvent(validParentheses, {
      type: "SESSION_STARTED",
      eventId: "evt_e2e_spa_valid_session",
      occurredAt: "2026-07-14T06:03:00.000Z",
    }),
    captureEvent(validParentheses, {
      type: "SUBMISSION_OBSERVED",
      eventId: "evt_e2e_spa_valid_submission",
      submissionId: "submission_e2e_spa_valid_parentheses",
      occurredAt: "2026-07-14T06:04:00.000Z",
    }),
    captureEvent(validParentheses, {
      type: "VERDICT_OBSERVED",
      eventId: "evt_e2e_spa_valid_verdict",
      submissionId: "submission_e2e_spa_valid_parentheses",
      verdict: "Accepted",
      occurredAt: "2026-07-14T06:05:00.000Z",
    }),
  ]);

  const db = new Database(E2E_DB_PATH, { readonly: true });
  try {
    const sessions = db.prepare<[], SessionRow>(`
      SELECT id, end_reason
      FROM training_sessions
      WHERE id LIKE 'session_e2e_spa_%'
      ORDER BY id
    `).all();
    expect(sessions).toEqual([
      {
        id: "session_e2e_spa_two_sum",
        end_reason: "spa_navigation",
      },
      {
        id: "session_e2e_spa_valid_parentheses",
        end_reason: null,
      },
    ]);

    const attempts = db.prepare<[], AttemptRow>(`
      SELECT problem_external_id, verdict
      FROM training_attempts
      WHERE submission_id LIKE 'submission_e2e_spa_%'
      ORDER BY submission_id
    `).all();
    expect(attempts).toEqual([
      {
        problem_external_id: "two-sum",
        verdict: "Wrong Answer",
      },
      {
        problem_external_id: "valid-parentheses",
        verdict: "Accepted",
      },
    ]);
  } finally {
    db.close();
  }

  await page.goto("/training?platform=leetcode&externalId=two-sum&title=Two%20Sum");
  const twoSumPanel = page.locator("section").filter({
    has: page.getByRole("heading", { name: "Training attempt" }),
  });
  await expect(twoSumPanel).toContainText("Two Sum");
  await expect(twoSumPanel).toContainText("Wrong Answer");
  await expect(twoSumPanel).not.toContainText("Valid Parentheses");

  await page.goto(
    "/training?platform=leetcode&externalId=valid-parentheses&title=Valid%20Parentheses",
  );
  const validPanel = page.locator("section").filter({
    has: page.getByRole("heading", { name: "Training attempt" }),
  });
  await expect(validPanel).toContainText("Valid Parentheses");
  await expect(validPanel).toContainText("Accepted");
  await expect(validPanel).not.toContainText("Two Sum");
});
