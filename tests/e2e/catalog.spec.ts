import { test, expect } from "@playwright/test";
import { openDatabase } from "@/lib/db/client";
import { seedDatabase } from "@/lib/db/seed";

test.describe("Catalog smoke", () => {
  test.beforeAll(() => {
    const db = openDatabase();
    try {
      seedDatabase(db);
    } finally {
      db.close();
    }
  });

  test("empty catalog can be seeded from the page", async ({ page }) => {
    const db = openDatabase();
    try {
      db.prepare("DELETE FROM problems").run();
    } finally {
      db.close();
    }

    await page.goto("/problems");

    await expect(page.getByRole("heading", { name: "No local problems yet" })).toBeVisible();
    await page.getByRole("button", { name: "Seed starter catalog" }).click();
    await expect(page.getByRole("heading", { name: "Two Sum" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Start Training" }).first()).toBeVisible();
  });

  test("problems page renders seeded local catalog", async ({ page }) => {
    await page.goto("/problems");

    await expect(page.getByRole("heading", { name: "Unified Problem Catalog" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Two Sum" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Start Training" }).first()).toBeVisible();
  });

  test("sources page renders validated registry", async ({ page }) => {
    await page.goto("/sources");

    await expect(page.getByRole("heading", { name: "Source Registry" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "LeetCode" })).toBeVisible();
    await expect(page.getByText("extension_capture").first()).toBeVisible();
  });

  test("catalog APIs return local data over HTTP", async ({ request }) => {
    const problems = await request.get("/api/problems");
    const sources = await request.get("/api/sources");

    expect(problems.ok()).toBe(true);
    await expect(problems).toBeOK();
    await expect(sources).toBeOK();
    expect(await problems.json()).toMatchObject({ ok: true });
    expect(await sources.json()).toMatchObject({ ok: true });
  });

  test("shared navigation is available away from the home page", async ({ page }) => {
    await page.goto("/coach");

    await expect(page.getByRole("navigation").getByRole("link", { name: "Problems" })).toBeVisible();
    await expect(page.getByRole("navigation").getByRole("link", { name: "Growth" })).toBeVisible();
    await expect(page.getByRole("navigation").getByRole("link", { name: "Compliance" })).toBeVisible();
  });
});
