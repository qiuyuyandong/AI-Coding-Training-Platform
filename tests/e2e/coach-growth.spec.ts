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
    await expect(page.getByText("No attempt data yet").or(page.getByText("Result distribution"))).toBeVisible();
  });

  test("training workspace records a reflection for the latest attempt", async ({ page, request }) => {
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
    await page.getByLabel("Reflection").fill("Used a hash map after checking the brute-force invariant.");
    await page.getByRole("button", { name: "Save reflection" }).click();

    await expect(page.getByText("Reflection saved")).toBeVisible();
    await expect(page.locator("p").filter({ hasText: "Used a hash map after checking the brute-force invariant." })).toBeVisible();
  });
});
