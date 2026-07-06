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
});
