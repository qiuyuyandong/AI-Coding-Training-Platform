import { expect, test } from "@playwright/test";
import Database from "better-sqlite3";
import { saveTrainingAttempt } from "../../lib/repositories/attempts";
import { saveTrainingSession } from "../../lib/repositories/trainingSessions";
import {
  captureEvent,
  postCaptureEvents,
  type CaptureProblemFixture,
} from "./captureFixtures";
import { E2E_DB_PATH } from "./database";

const validParentheses: CaptureProblemFixture = {
  captureSessionId: "session_e2e_reflect_other",
  platform: "leetcode",
  problemExternalId: "valid-parentheses",
  problemTitle: "Valid Parentheses",
  canonicalUrl: "https://leetcode.com/problems/valid-parentheses/",
};

const twoSum: CaptureProblemFixture = {
  captureSessionId: "session_e2e_reflect_two_sum",
  platform: "leetcode",
  problemExternalId: "two-sum",
  problemTitle: "Two Sum",
  canonicalUrl: "https://leetcode.com/problems/two-sum/",
};

const longestSubstring: CaptureProblemFixture = {
  captureSessionId: "session_e2e_partial",
  platform: "leetcode",
  problemExternalId: "longest-substring-without-repeating-characters",
  problemTitle: "Longest Substring Without Repeating Characters",
  canonicalUrl: "https://leetcode.com/problems/longest-substring-without-repeating-characters/",
};

test.describe("Coach and Growth smoke", () => {
  test("coach renders deterministic insight sections", async ({ page }) => {
    await page.goto("/coach");

    await expect(page.getByRole("heading", { name: "Coach", exact: true })).toBeVisible();
    await expect(page.getByText("Local coach summary")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Signals" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Recommendations" })).toBeVisible();
  });

  test("growth renders local training data surface", async ({ page }) => {
    await page.goto("/growth");

    await expect(page.getByRole("heading", { name: "Growth" })).toBeVisible();
    const emptyState = page.getByText(/No attempt data yet\./);
    const populatedState = page.getByRole("heading", { name: "Result distribution" });
    await expect(emptyState.or(populatedState)).toBeVisible();
  });

  test("training workspace records a reflection for the latest attempt", async ({ page, request }) => {
    await postCaptureEvents(request, [
      captureEvent(validParentheses, {
        type: "SESSION_STARTED",
        eventId: "evt_e2e_reflect_other_session",
        occurredAt: "2026-07-06T00:02:00.000Z",
      }),
      captureEvent(validParentheses, {
        type: "VERDICT_OBSERVED",
        eventId: "evt_e2e_reflect_other_verdict",
        submissionId: "submission_e2e_reflect_other",
        verdict: "Wrong Answer",
        occurredAt: "2026-07-06T00:03:00.000Z",
      }),
      captureEvent(twoSum, {
        type: "SESSION_STARTED",
        eventId: "evt_e2e_reflect_session",
        occurredAt: "2026-07-06T00:00:00.000Z",
      }),
      captureEvent(twoSum, {
        type: "VERDICT_OBSERVED",
        eventId: "evt_e2e_reflect_verdict",
        submissionId: "submission_e2e_reflect_two_sum",
        verdict: "Accepted",
        occurredAt: "2026-07-06T00:01:00.000Z",
      }),
    ]);

    await page.goto("/training?platform=leetcode&externalId=two-sum&title=Two%20Sum");
    await expect(page.getByRole("heading", { name: "Two Sum" })).toBeVisible();
    await expect(page.getByText("Problem ID: two-sum")).toBeVisible();
    const attemptPanel = page.locator("section").filter({ has: page.getByRole("heading", { name: "Training attempt" }) });
    await expect(attemptPanel).toContainText("Two Sum");
    await expect(attemptPanel).not.toContainText("Valid Parentheses");
    await expect(attemptPanel).toContainText("Automatic capture");
    await page.getByLabel("Corrected reflection").fill("Used a hash map after checking the brute-force invariant.");
    await page.getByLabel("Correction reason").fill("Add the missing reflection.");
    await page.getByRole("button", { name: "Save correction" }).click();

    await expect(page.getByText("Correction saved")).toBeVisible();
    await expect(attemptPanel).toContainText("Add the missing reflection.");
  });

  test("training workspace shows partial verdict state for the current attempt", async ({ page, request }) => {
    await postCaptureEvents(request, [
      captureEvent(longestSubstring, {
        type: "SESSION_STARTED",
        eventId: "evt_e2e_partial_session",
        occurredAt: "2026-07-06T00:04:00.000Z",
      }),
      captureEvent(longestSubstring, {
        type: "VERDICT_OBSERVED",
        eventId: "evt_e2e_partial_verdict",
        submissionId: "submission_e2e_partial",
        verdict: "Time Limit Exceeded",
        occurredAt: "2026-07-06T00:05:00.000Z",
      }),
    ]);

    await page.goto(
      "/training?platform=leetcode&externalId=longest-substring-without-repeating-characters&title=Longest%20Substring%20Without%20Repeating%20Characters",
    );

    const attemptPanel = page.locator("section").filter({ has: page.getByRole("heading", { name: "Training attempt" }) });
    await expect(attemptPanel).toContainText("partial");
    await expect(attemptPanel).toContainText("Verdict evidence: Time Limit Exceeded");
  });

  test("keeps problem lookup isolated and reports complete analytics beyond display windows", async ({ page }) => {
    const db = new Database(E2E_DB_PATH);
    let expectedTotal = 0;
    try {
      const seed = db.transaction(() => {
        for (let index = 0; index < 61; index += 1) {
          const suffix = index.toString().padStart(2, "0");
          const externalId = index === 0 ? "query-correctness-target" : `query-other-${suffix}`;
          const title = index === 0 ? "Query Correctness Target" : `Query Other ${suffix}`;
          const timestamp = new Date(Date.UTC(2026, 6, 8, 0, index)).toISOString();
          const sessionId = `session_query_${suffix}`;
          saveTrainingSession(db, {
            id: sessionId,
            installationId: "installation_e2e",
            platform: "leetcode",
            problemExternalId: externalId,
            problemTitle: title,
            canonicalUrl: `https://leetcode.com/problems/${externalId}/`,
            provenanceLevel: "extension_paired",
            startedAt: timestamp,
            createdAt: timestamp,
            updatedAt: timestamp,
          });
          saveTrainingAttempt(db, {
            id: `attempt_query_${suffix}`,
            captureSessionId: sessionId,
            submissionId: `submission_query_${suffix}`,
            platform: "leetcode",
            problemExternalId: externalId,
            problemTitle: title,
            canonicalUrl: `https://leetcode.com/problems/${externalId}/`,
            startedAt: timestamp,
            result: index % 3 === 0 ? "failed" : "passed",
            recordSource: "capture",
            revision: 1,
            createdAt: timestamp,
            updatedAt: timestamp,
          });
        }
      });
      seed();
      expectedTotal = db.prepare<[], { readonly count: number }>(
        "SELECT COUNT(*) AS count FROM training_attempts",
      ).get()?.count ?? 0;
    } finally {
      db.close();
    }

    await page.goto(
      "/training?platform=leetcode&externalId=QUERY-CORRECTNESS-TARGET&title=Query%20Correctness%20Target",
    );
    const attemptPanel = page.locator("section").filter({
      has: page.getByRole("heading", { name: "Training attempt" }),
    });
    await expect(attemptPanel).toContainText("Query Correctness Target");
    await expect(attemptPanel).not.toContainText("Query Other");

    await page.goto("/growth");
    const totals = page.locator("section").filter({
      has: page.getByRole("heading", { name: "All-time totals" }),
    });
    await expect(totals).toContainText(`Attempts${expectedTotal}`);
    const latest = page.locator("section").filter({
      has: page.getByRole("heading", { name: "Latest 5 attempts" }),
    });
    await expect(latest.locator(":scope > div > div")).toHaveCount(5);

    await page.goto("/coach");
    await expect(page.getByText("Latest 50 attempts reviewed: 50")).toBeVisible();
  });

  test("manual fallback can be corrected, audited, and voided without adding attempts", async ({ page }) => {
    const db = new Database(E2E_DB_PATH);
    let activeBefore = 0;
    let allBefore = 0;
    try {
      activeBefore = db.prepare<[], { readonly count: number }>(
        "SELECT COUNT(*) AS count FROM training_attempts WHERE voided_at IS NULL",
      ).get()?.count ?? 0;
      allBefore = db.prepare<[], { readonly count: number }>(
        "SELECT COUNT(*) AS count FROM training_attempts",
      ).get()?.count ?? 0;
    } finally {
      db.close();
    }

    await page.goto("/training?platform=leetcode&externalId=manual-fallback-e2e&title=Manual%20Fallback%20E2E");
    await page.getByLabel("Manual result").selectOption("failed");
    await page.getByLabel("Language").fill("TypeScript");
    await page.getByLabel("Duration (minutes)").fill("25");
    await page.getByLabel("Reflection", { exact: true }).fill("Recorded after capture was unavailable.");
    await page.getByRole("button", { name: "Record manual attempt" }).click();

    await expect(page.getByText("Manual attempt recorded")).toBeVisible();
    const attemptPanel = page.locator("section").filter({ has: page.getByRole("heading", { name: "Training attempt" }) });
    await expect(attemptPanel).toContainText("Manual entry");
    await expect(attemptPanel).toContainText("failed");

    await page.goto("/growth");
    const totals = page.locator("section").filter({ has: page.getByRole("heading", { name: "All-time totals" }) });
    await expect(totals).toContainText(`Attempts${activeBefore + 1}`);
    await expect(page.getByText(/Manual entry/).first()).toBeVisible();
    await page.goto("/coach");
    await expect(page.getByText(`Latest 50 attempts reviewed: ${Math.min(activeBefore + 1, 50)}`)).toBeVisible();

    await page.goto("/training?platform=leetcode&externalId=manual-fallback-e2e&title=Manual%20Fallback%20E2E");
    await page.getByLabel("Corrected result").selectOption("passed");
    await page.getByLabel("Correction reason").fill("Verified the accepted result.");
    await page.getByRole("button", { name: "Save correction" }).click();
    await expect(page.getByText("Correction saved")).toBeVisible();
    await expect(attemptPanel).toContainText("Verified the accepted result.");
    await expect(attemptPanel).toContainText("result: failed → passed");

    const correctedDb = new Database(E2E_DB_PATH);
    try {
      const count = correctedDb.prepare<[], { readonly count: number }>(
        "SELECT COUNT(*) AS count FROM training_attempts",
      ).get()?.count ?? 0;
      expect(count).toBe(allBefore + 1);
    } finally {
      correctedDb.close();
    }

    await page.getByLabel("Void reason").fill("Duplicate record entered during recovery.");
    await page.getByRole("button", { name: "Void attempt" }).click();
    await expect(page.getByText("Attempt voided")).toBeVisible();
    await expect(attemptPanel).toContainText("No active training attempts");

    await page.goto("/growth");
    const totalsAfterVoid = page.locator("section").filter({ has: page.getByRole("heading", { name: "All-time totals" }) });
    await expect(totalsAfterVoid).toContainText(`Attempts${activeBefore}`);
    await page.goto("/coach");
    await expect(page.getByText(`Latest 50 attempts reviewed: ${Math.min(activeBefore, 50)}`)).toBeVisible();
  });
});
