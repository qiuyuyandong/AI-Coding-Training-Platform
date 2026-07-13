import { expect, test } from "@playwright/test";

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
    await request.post("/api/capture/events", {
      data: {
        id: "evt_e2e_reflect_other_page",
        type: "PAGE_DETECTED",
        platform: "leetcode",
        problemExternalId: "valid-parentheses",
        problemTitle: "Valid Parentheses",
        canonicalUrl: "https://leetcode.com/problems/valid-parentheses/",
        occurredAt: "2026-07-06T00:02:00.000Z",
        payload: { source: "e2e" },
      },
    });
    await request.post("/api/capture/events", {
      data: {
        id: "evt_e2e_reflect_other_verdict",
        type: "VERDICT_UPDATED",
        platform: "leetcode",
        problemExternalId: "valid-parentheses",
        problemTitle: "Valid Parentheses",
        canonicalUrl: "https://leetcode.com/problems/valid-parentheses/",
        occurredAt: "2026-07-06T00:03:00.000Z",
        payload: { verdict: "Wrong Answer" },
      },
    });
    await request.post("/api/capture/events", {
      data: {
        id: "evt_e2e_reflect_page",
        type: "PAGE_DETECTED",
        platform: "leetcode",
        problemExternalId: "two-sum",
        problemTitle: "Two Sum",
        canonicalUrl: "https://leetcode.com/problems/two-sum/",
        occurredAt: "2026-07-06T00:00:00.000Z",
        payload: { source: "e2e" },
      },
    });
    await request.post("/api/capture/events", {
      data: {
        id: "evt_e2e_reflect_verdict",
        type: "VERDICT_UPDATED",
        platform: "leetcode",
        problemExternalId: "two-sum",
        problemTitle: "Two Sum",
        canonicalUrl: "https://leetcode.com/problems/two-sum/",
        occurredAt: "2026-07-06T00:01:00.000Z",
        payload: { verdict: "Accepted" },
      },
    });

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
    await request.post("/api/capture/events", {
      data: {
        id: "evt_e2e_partial_page",
        type: "PAGE_DETECTED",
        platform: "leetcode",
        problemExternalId: "longest-substring-without-repeating-characters",
        problemTitle: "Longest Substring Without Repeating Characters",
        canonicalUrl: "https://leetcode.com/problems/longest-substring-without-repeating-characters/",
        occurredAt: "2026-07-06T00:04:00.000Z",
        payload: { source: "e2e" },
      },
    });
    await request.post("/api/capture/events", {
      data: {
        id: "evt_e2e_partial_verdict",
        type: "VERDICT_UPDATED",
        platform: "leetcode",
        problemExternalId: "longest-substring-without-repeating-characters",
        problemTitle: "Longest Substring Without Repeating Characters",
        canonicalUrl: "https://leetcode.com/problems/longest-substring-without-repeating-characters/",
        occurredAt: "2026-07-06T00:05:00.000Z",
        payload: { verdict: "Time Limit Exceeded" },
      },
    });

    await page.goto(
      "/training?platform=leetcode&externalId=longest-substring-without-repeating-characters&title=Longest%20Substring%20Without%20Repeating%20Characters",
    );

    const attemptPanel = page.locator("section").filter({ has: page.getByRole("heading", { name: "Training attempt" }) });
    await expect(attemptPanel).toContainText("partial");
    await expect(attemptPanel).toContainText("Verdict: Time Limit Exceeded");
  });
});
