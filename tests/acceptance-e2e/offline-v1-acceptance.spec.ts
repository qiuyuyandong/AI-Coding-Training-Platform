import { expect, test } from "@playwright/test";
import Database from "better-sqlite3";
import { ACCEPTANCE_DB_PATH } from "./database";

const MILESTONES = [
  "Basic input, output, and CRUD",
  "Functions, types, and modules",
  "Search, sort, and priority",
  "File persistence and recovery",
  "Tests, build, Git, and documentation",
  "Unfamiliar change: recurring tasks",
] as const;

test("fresh local V1: manual training to evidence, review, today plan, and six-stage project", async ({ page }) => {
  const aiRequests: string[] = [];
  const externalRequests: string[] = [];
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (url.pathname.startsWith("/api/ai/")) aiRequests.push(request.url());
    if (url.origin !== "http://localhost:3010") externalRequests.push(request.url());
  });

  expect(readCounts()).toMatchObject({ attempts: 0, evidence: 0, reviews: 0, projects: 0 });

  await page.goto("/today");
  await expect(page.getByRole("heading", { name: "今日主任务", exact: true })).toBeVisible();
  const completion = page.locator("section").filter({ hasText: "完成本次任务" });
  await completion.getByLabel("结果").selectOption("passed");
  await completion.getByLabel("语言（可选）").fill("C++17");
  await completion.getByLabel("耗时（分钟，可选）").fill("20");
  await completion.getByLabel("反思（可选）").fill("The smallest verified step worked.");
  const completedResponse = page.waitForResponse((response) => response.url().includes("/api/plans/items/")
    && response.url().endsWith("/complete") && response.request().method() === "POST");
  await completion.getByRole("button", { name: "提交完成" }).click();
  expect((await completedResponse).status()).toBe(200);
  await expect(page.getByRole("heading", { name: "今日主任务", exact: true })).toBeVisible();

  const afterManual = readCounts();
  expect(afterManual).toMatchObject({ attempts: 1, reviews: 1, projects: 0 });
  expect(afterManual.evidence).toBeGreaterThan(0);
  const reviewId = readOpenReviewId();
  const reviewResponse = await page.request.post(`/api/evidence/reviews/${reviewId}/complete`, {
    headers: { origin: "http://localhost:3010" },
  });
  expect(reviewResponse.status()).toBe(200);
  await page.goto("/evidence");
  await expect(page.getByRole("heading", { name: "可审计训练证据" })).toBeVisible();
  expect(readReviewStatus(reviewId)).toBe("completed");
  await page.goto("/today");
  await expect(page.getByRole("heading", { name: "今日主任务", exact: true })).toBeVisible();

  await page.goto("/projects");
  await page.getByLabel("证据模式").selectOption("minimal");
  await page.getByRole("button", { name: "开始项目" }).click();
  await expect(page.getByRole("status")).toContainText("已创建");
  for (const [index, milestone] of MILESTONES.entries()) {
    await expect(page.getByRole("heading", { name: milestone })).toBeVisible();
    await page.getByRole("button", { name: "保存结果" }).click();
    await expect(page.getByRole("status")).toContainText("证据已保存");
    const panel = page.locator("section").filter({ has: page.getByRole("heading", { name: "确认里程碑" }) });
    for (const rubric of ["function", "testing", "integration", "explanation"] as const) {
      await panel.locator("label").filter({ hasText: rubric }).locator("select").selectOption("2");
    }
    await page.getByRole("button", { name: "确认并生成训练结论" }).click();
    if (index < MILESTONES.length - 1) {
      await expect(page.getByRole("heading", { name: MILESTONES[index + 1] })).toBeVisible();
    }
  }
  await expect(page.getByRole("button", { name: "开始项目" })).toBeVisible();

  const final = readCounts();
  expect(final.projects).toBe(1);
  expect(final.projectSessions).toBe(6);
  expect(final.projectSummaries).toBe(6);
  expect(final.completionReceipts).toBe(6);
  expect(readLatestProjectStatus()).toBe("completed");
  expect(aiRequests).toEqual([]);
  expect(externalRequests).toEqual([]);
});

function readCounts() {
  const db = new Database(ACCEPTANCE_DB_PATH, { readonly: true, fileMustExist: true });
  try {
    return {
      attempts: count(db, "training_attempts"),
      evidence: count(db, "learning_evidence_events"),
      reviews: count(db, "review_items"),
      projects: count(db, "learner_projects"),
      projectSessions: count(db, "project_practice_sessions"),
      projectSummaries: db.prepare<[], { readonly count: number }>(`
        SELECT COUNT(*) AS count FROM training_session_summaries WHERE source_type = 'project'
      `).get()?.count ?? 0,
      completionReceipts: count(db, "project_session_completion_receipts"),
    };
  } finally {
    db.close();
  }
}

function count(db: Database.Database, table: string): number {
  return db.prepare<[], { readonly count: number }>(`SELECT COUNT(*) AS count FROM ${table}`).get()?.count ?? 0;
}

function readOpenReviewId(): string {
  const db = new Database(ACCEPTANCE_DB_PATH, { readonly: true, fileMustExist: true });
  try {
    const row = db.prepare<[], { readonly id: string }>("SELECT id FROM review_items WHERE status = 'open' ORDER BY created_at ASC LIMIT 1").get();
    if (row === undefined) throw new Error("Manual completion did not create a review");
    return row.id;
  } finally {
    db.close();
  }
}

function readReviewStatus(reviewId: string): string | null {
  const db = new Database(ACCEPTANCE_DB_PATH, { readonly: true, fileMustExist: true });
  try {
    return db.prepare<[string], { readonly status: string }>("SELECT status FROM review_items WHERE id = ?").get(reviewId)?.status ?? null;
  } finally {
    db.close();
  }
}

function readLatestProjectStatus(): string | null {
  const db = new Database(ACCEPTANCE_DB_PATH, { readonly: true, fileMustExist: true });
  try {
    return db.prepare<[], { readonly status: string }>("SELECT status FROM learner_projects ORDER BY created_at DESC LIMIT 1").get()?.status ?? null;
  } finally {
    db.close();
  }
}
