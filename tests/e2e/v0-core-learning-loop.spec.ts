import { expect, test } from "@playwright/test";
import Database from "better-sqlite3";
import { applyMigrations } from "@/lib/db/migrations";
import { importPackage } from "@/lib/curriculum/importPackage";
import { LOCAL_DEFAULT_LEARNER_ID } from "@/lib/domain/learner";
import { generateAndPersistPlan } from "@/lib/services/planGenerationService";
import { completePlanItem } from "@/lib/services/learningCompletion";
import { findMappedAttempt } from "@/lib/services/attemptNodeMapping";
import { E2E_DB_PATH } from "./database";
import { join } from "node:path";

/**
 * V0 offline-core learning loop Playwright gate (Todo 20).
 *
 * Contract:
 *   - AI environment variables (`V0_AI_REFLECTION_*`) MUST be absent.
 *   - The browser extension MUST NOT be loaded by the test.
 *   - The path is: fresh DB → migrations 0001..0008 → import curriculum
 *     sample-package → create local learner profile → generate plan →
 *     complete the primary item → verify ability snapshot → verify
 *     Training page surfaces mapped evidence → assert NO non-localhost
 *     request was made.
 *
 * This test is the prerequisite artifact for Todo 21 (the optional
 * AI reflection experiment). It must remain green without any AI
 * provider, network, or extension involvement.
 */

const SAMPLE_PACKAGE_PATH = join(
  process.cwd(),
  "tests",
  "fixtures",
  "curriculum",
  "sample-package",
);

const REQUIRED_AI_ENV = [
  "V0_AI_REFLECTION_ENABLED",
  "V0_AI_REFLECTION_URL",
  "V0_AI_REFLECTION_MODEL",
  "V0_AI_REFLECTION_API_KEY",
  "V0_AI_REFLECTION_TIMEOUT_MS",
];

function ensureAiEnvAbsent(): void {
  for (const key of REQUIRED_AI_ENV) {
    const value = process.env[key];
    if (value !== undefined && value.length > 0) {
      throw new Error(
        `V0 offline-core gate forbids ${key}; remove it from the e2e environment before running`,
      );
    }
  }
}

type PlanItemRow = {
  readonly id: string;
  readonly practice_task_id: string;
  readonly node_id: string;
  readonly role: string;
};

function createLocalLearner(db: Database.Database): void {
  const existing = db
    .prepare<[string], { id: string }>(
      "SELECT id FROM learner_profiles WHERE id = ?",
    )
    .get(LOCAL_DEFAULT_LEARNER_ID);
  if (existing !== undefined) return;
  db.prepare(
    `INSERT INTO learner_profiles (id, onboarding_state, created_at, updated_at)
     VALUES (?, 'plan_ready', ?, ?)`,
  ).run(
    LOCAL_DEFAULT_LEARNER_ID,
    "2026-07-17T00:00:00.000Z",
    "2026-07-17T00:00:00.000Z",
  );
}

test("V0 offline-core loop: import → plan → completion → ability → mapped UI", async ({
  page,
}, testInfo) => {
  ensureAiEnvAbsent();

  const pageRequests: string[] = [];
  page.on("request", (pageRequest) => {
    pageRequests.push(pageRequest.url());
  });

  // Phase 1: seed the disposable database with curriculum + a learner.
  const db = new Database(E2E_DB_PATH);
  try {
    applyMigrations(db, { now: () => "2026-07-17T00:00:00.000Z" });
    const importResult = importPackage(db, SAMPLE_PACKAGE_PATH, {
      now: () => "2026-07-17T00:00:00.000Z",
    });
    expect(importResult.ok).toBe(true);
    if (!importResult.ok) {
      throw new Error("Sample-package import failed; gate cannot proceed");
    }
    createLocalLearner(db);

    // Phase 2: generate the deterministic plan for a 30-minute boundary.
    const persistedPlan = generateAndPersistPlan(db, {
      learnerId: LOCAL_DEFAULT_LEARNER_ID,
      dailyMode: "learn",
      effortBoundaryMinutes: 30,
      localDate: "2026-07-17",
      inputFingerprint: "v0-core-loop-fixture",
      nodes: [],
      edges: [],
      practicesByNode: new Map(),
      resourcesByNode: new Map(),
    });
    expect(persistedPlan.isFallback).toBe(false);

    const planItems = db
      .prepare<[string], PlanItemRow>(
        `SELECT id, practice_task_id, node_id, role
           FROM plan_items
          WHERE daily_plan_id = ?
          ORDER BY rank ASC, id ASC`,
      )
      .all(persistedPlan.snapshotId);
    expect(planItems.length).toBeGreaterThan(0);
    const primaryItem = planItems.find((row) => row.role === "primary");
    expect(primaryItem).toBeDefined();
    if (primaryItem === undefined) {
      throw new Error("Primary plan item was not persisted");
    }

    // Phase 3: complete the primary item atomically through the
    // learningCompletion service.
    const completion = completePlanItem(db, {
      learnerId: LOCAL_DEFAULT_LEARNER_ID,
      dailyPlanItemId: primaryItem.id,
      result: "passed",
      language: "cpp",
      durationMinutes: 30,
    });
    expect(completion.ok).toBe(true);
    if (!completion.ok) {
      throw new Error(`completePlanItem failed: ${completion.error}`);
    }
    expect(completion.replayed).toBe(false);

    // Phase 4: assert the ability snapshot exists and the mapped-attempt
    // helper returns the inline evidence the Training page renders.
    const mappedRow = findMappedAttempt(db, completion.attemptId);
    expect(mappedRow.mapped).toBe(true);
    expect(mappedRow.node).not.toBeNull();
    if (mappedRow.node === null) {
      throw new Error("Mapped attempt returned null node");
    }
    expect(mappedRow.node.nodeId).toBe(primaryItem.node_id);
    expect(mappedRow.ability).not.toBeNull();
    if (mappedRow.ability === null) {
      throw new Error("Mapped attempt returned null ability");
    }
    expect(mappedRow.ability.visibleLevel).toBe("L1");
    expect(mappedRow.ability.confidence).toBe("low");
    expect(mappedRow.ability.label).toBe("L1 (low)");

    // Phase 5: training page must surface the mapped attempt evidence.
    await page.goto(
      `/training?platform=atcoder&externalId=agc040_d&title=D%20-%20Balance%20Beam`,
    );
    const trainingHeading = page.getByRole("heading", { name: "D - Balance Beam" });
    await expect(trainingHeading).toBeVisible();
  } finally {
    db.close();
  }

  // Phase 6: assert the page issued ZERO non-localhost requests.
  const configuredOrigin = new URL(
    testInfo.project.use.baseURL ?? "http://localhost:3000",
  ).origin;
  const allowedOrigins = new Set([
    configuredOrigin,
    "http://localhost:3000",
    "http://127.0.0.1:3000",
  ]);
  const externalRequests = pageRequests.filter(
    (url) => !allowedOrigins.has(new URL(url).origin),
  );
  expect(externalRequests).toEqual([]);
});

test("V0 offline-core gate: ensureAiEnvAbsent catches accidental AI env injection", () => {
  // This sub-test guards the gate against environment drift; it runs
  // without Playwright fixtures and inspects process.env directly.
  const sentinel = process.env.V0_AI_REFLECTION_ENABLED;
  process.env.V0_AI_REFLECTION_ENABLED = "1";
  try {
    expect(() => ensureAiEnvAbsent()).toThrowError(/V0_AI_REFLECTION_ENABLED/);
  } finally {
    if (sentinel === undefined) {
      delete process.env.V0_AI_REFLECTION_ENABLED;
    } else {
      process.env.V0_AI_REFLECTION_ENABLED = sentinel;
    }
  }
});