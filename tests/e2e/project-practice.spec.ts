import { expect, test } from "@playwright/test";
import Database from "better-sqlite3";
import { join } from "node:path";
import { importPackage } from "@/lib/curriculum/importPackage";
import { E2E_DB_PATH } from "./database";

const MILESTONES = [
  "Basic input, output, and CRUD",
  "Functions, types, and modules",
  "Search, sort, and priority",
  "File persistence and recovery",
  "Tests, build, Git, and documentation",
  "Unfamiliar change: recurring tasks",
] as const;

test("offline V1 completes all six project milestones through the browser", async ({ page }) => {
  test.setTimeout(90_000);

  const db = new Database(E2E_DB_PATH);
  try {
    const imported = importPackage(
      db,
      join(process.cwd(), "content", "tracks", "software-development-foundations-v1"),
    );
    expect(imported.ok).toBe(true);
  } finally {
    db.close();
  }

  const aiRequests: string[] = [];
  page.on("request", (request) => {
    if (new URL(request.url()).pathname.startsWith("/api/ai/")) {
      aiRequests.push(request.url());
    }
  });

  await page.goto("/projects");
  await page.getByLabel("证据模式").selectOption("minimal");
  await page.getByRole("button", { name: "开始项目" }).click();
  await expect(page.getByRole("status")).toContainText("已创建");

  for (const [index, milestone] of MILESTONES.entries()) {
    await expect(page.getByRole("heading", { name: milestone })).toBeVisible();
    await page.getByRole("button", { name: "保存结果" }).click();
    await expect(page.getByRole("status")).toContainText("证据已保存");

    const completionPanel = page.locator("section").filter({
      has: page.getByRole("heading", { name: "确认里程碑" }),
    });
    for (const rubric of ["function", "testing", "integration", "explanation"] as const) {
      await completionPanel.locator("label").filter({ hasText: rubric }).locator("select").selectOption("2");
    }

    await page.getByRole("button", { name: "确认并生成训练结论" }).click();
    if (index < MILESTONES.length - 1) {
      await expect(page.getByRole("heading", { name: MILESTONES[index + 1] })).toBeVisible();
    }
  }

  await expect(page.getByRole("button", { name: "开始项目" })).toBeVisible();

  const verifiedDb = new Database(E2E_DB_PATH);
  try {
    const project = verifiedDb.prepare<[], { readonly status: string }>(
      "SELECT status FROM learner_projects ORDER BY created_at DESC LIMIT 1",
    ).get();
    const sessionCount = verifiedDb.prepare<[], { readonly count: number }>(
      "SELECT COUNT(*) AS count FROM project_practice_sessions",
    ).get()?.count ?? 0;
    const summaryCount = verifiedDb.prepare<[], { readonly count: number }>(
      "SELECT COUNT(*) AS count FROM training_session_summaries WHERE source_type = 'project'",
    ).get()?.count ?? 0;
    const review = verifiedDb.prepare<[], { readonly id: string }>(
      "SELECT id FROM review_items WHERE status = 'open' ORDER BY created_at ASC LIMIT 1",
    ).get();
    expect(project?.status).toBe("completed");
    expect(sessionCount).toBe(6);
    expect(summaryCount).toBe(6);
    expect(review).toBeDefined();
    if (review === undefined) throw new Error("Project completion did not create a review");
    verifiedDb.prepare("UPDATE review_items SET due_at = ? WHERE id = ?")
      .run("2000-01-01T00:00:00.000Z", review.id);
  } finally {
    verifiedDb.close();
  }

  await page.goto("/evidence");
  await expect(page.getByRole("heading", { name: "可审计训练证据" })).toBeVisible();
  await page.getByRole("button", { name: "标记完成" }).first().click();
  await expect(page.getByRole("status")).toContainText("复习项已完成");
  expect(aiRequests).toEqual([]);
});
