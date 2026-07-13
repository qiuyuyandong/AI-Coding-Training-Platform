import { expect, test } from "@playwright/test";
import Database from "better-sqlite3";
import { captureEvent, postCaptureEvents, type CaptureProblemFixture } from "./captureFixtures";
import { E2E_DB_PATH } from "./database";

const twoSum: CaptureProblemFixture = {
  captureSessionId: "session_e2e_isolation_two_sum",
  platform: "leetcode",
  problemExternalId: "two-sum",
  problemTitle: "Two Sum",
  canonicalUrl: "https://leetcode.com/problems/two-sum/",
};

const validParentheses: CaptureProblemFixture = {
  captureSessionId: "session_e2e_isolation_valid_parentheses",
  platform: "leetcode",
  problemExternalId: "valid-parentheses",
  problemTitle: "Valid Parentheses",
  canonicalUrl: "https://leetcode.com/problems/valid-parentheses/",
};

type AttemptRow = {
  readonly submission_id: string;
  readonly problem_external_id: string;
  readonly verdict: string;
};

type SessionRow = {
  readonly id: string;
  readonly ended_at: string | null;
};

test("isolates two problems across independent full page loads", async ({ page, request }) => {
  await postCaptureEvents(request, [
    captureEvent(twoSum, {
      type: "SESSION_STARTED",
      eventId: "evt_e2e_isolation_two_sum_session",
      occurredAt: "2026-07-14T01:00:00.000Z",
    }),
    captureEvent(twoSum, {
      type: "SUBMISSION_OBSERVED",
      eventId: "evt_e2e_isolation_two_sum_submission_1",
      submissionId: "submission_e2e_isolation_two_sum_1",
      occurredAt: "2026-07-14T01:01:00.000Z",
    }),
    captureEvent(twoSum, {
      type: "VERDICT_OBSERVED",
      eventId: "evt_e2e_isolation_two_sum_verdict_1",
      submissionId: "submission_e2e_isolation_two_sum_1",
      verdict: "Wrong Answer",
      occurredAt: "2026-07-14T01:02:00.000Z",
    }),
    captureEvent(twoSum, {
      type: "SUBMISSION_OBSERVED",
      eventId: "evt_e2e_isolation_two_sum_submission_2",
      submissionId: "submission_e2e_isolation_two_sum_2",
      occurredAt: "2026-07-14T01:03:00.000Z",
    }),
    captureEvent(twoSum, {
      type: "VERDICT_OBSERVED",
      eventId: "evt_e2e_isolation_two_sum_verdict_2",
      submissionId: "submission_e2e_isolation_two_sum_2",
      verdict: "Wrong Answer",
      occurredAt: "2026-07-14T01:04:00.000Z",
    }),
    captureEvent(validParentheses, {
      type: "SESSION_STARTED",
      eventId: "evt_e2e_isolation_valid_session",
      occurredAt: "2026-07-14T02:00:00.000Z",
    }),
    captureEvent(validParentheses, {
      type: "SUBMISSION_OBSERVED",
      eventId: "evt_e2e_isolation_valid_submission",
      submissionId: "submission_e2e_isolation_valid_1",
      occurredAt: "2026-07-14T02:01:00.000Z",
    }),
    captureEvent(validParentheses, {
      type: "VERDICT_OBSERVED",
      eventId: "evt_e2e_isolation_valid_verdict",
      submissionId: "submission_e2e_isolation_valid_1",
      verdict: "Accepted",
      occurredAt: "2026-07-14T02:02:00.000Z",
    }),
  ]);

  const db = new Database(E2E_DB_PATH, { readonly: true });
  try {
    const attempts = db.prepare<[], AttemptRow>(`
      SELECT submission_id, problem_external_id, verdict
      FROM training_attempts
      WHERE submission_id LIKE 'submission_e2e_isolation_%'
      ORDER BY submission_id
    `).all();
    expect(attempts).toEqual([
      {
        submission_id: "submission_e2e_isolation_two_sum_1",
        problem_external_id: "two-sum",
        verdict: "Wrong Answer",
      },
      {
        submission_id: "submission_e2e_isolation_two_sum_2",
        problem_external_id: "two-sum",
        verdict: "Wrong Answer",
      },
      {
        submission_id: "submission_e2e_isolation_valid_1",
        problem_external_id: "valid-parentheses",
        verdict: "Accepted",
      },
    ]);

    const sessions = db.prepare<[], SessionRow>(`
      SELECT id, ended_at
      FROM training_sessions
      WHERE id LIKE 'session_e2e_isolation_%'
      ORDER BY id
    `).all();
    expect(sessions).toHaveLength(2);
    expect(sessions.every((session) => session.ended_at === null)).toBe(true);
  } finally {
    db.close();
  }

  await page.goto("/training?platform=leetcode&externalId=two-sum&title=Two%20Sum");
  const twoSumPanel = page.locator("section").filter({
    has: page.getByRole("heading", { name: "Training attempt" }),
  });
  await expect(page.getByRole("heading", { name: "Two Sum" })).toBeVisible();
  await expect(twoSumPanel).toContainText("Two Sum");
  await expect(twoSumPanel).toContainText("Wrong Answer");
  await expect(twoSumPanel).not.toContainText("Valid Parentheses");

  await page.goto(
    "/training?platform=leetcode&externalId=valid-parentheses&title=Valid%20Parentheses",
  );
  const validParenthesesPanel = page.locator("section").filter({
    has: page.getByRole("heading", { name: "Training attempt" }),
  });
  await expect(
    page.getByRole("heading", { name: "Valid Parentheses" }),
  ).toBeVisible();
  await expect(validParenthesesPanel).toContainText("Valid Parentheses");
  await expect(validParenthesesPanel).toContainText("Accepted");
  await expect(validParenthesesPanel).not.toContainText("Two Sum");
});
