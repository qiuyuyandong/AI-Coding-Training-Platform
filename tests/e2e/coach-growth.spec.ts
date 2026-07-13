import { expect, test } from "@playwright/test";
import {
  captureEvent,
  postCaptureEvents,
  type CaptureProblemFixture,
} from "./captureFixtures";

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

    await expect(page.getByRole("heading", { name: "Coach" })).toBeVisible();
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
    await page.getByLabel("Reflection").fill("Used a hash map after checking the brute-force invariant.");
    await page.getByRole("button", { name: "Save reflection" }).click();

    await expect(page.getByText("Reflection saved")).toBeVisible();
    await expect(page.locator("p").filter({ hasText: "Used a hash map after checking the brute-force invariant." })).toBeVisible();
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
    await expect(attemptPanel).toContainText("Verdict: Time Limit Exceeded");
  });
});
