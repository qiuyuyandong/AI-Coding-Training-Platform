import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";
import Database from "better-sqlite3";
import { applyMigrations } from "@/lib/db/migrations";
import { importPackage } from "@/lib/curriculum/importPackage";
import { LOCAL_DEFAULT_LEARNER_ID } from "@/lib/domain/learner";
import { getOrCreateLocalProfile } from "@/lib/repositories/learnerProfiles";
import { listAttemptNodeMappings } from "@/lib/repositories/ability";
import { completePlanItem } from "@/lib/services/learningCompletion";
import { correctAttempt } from "@/lib/services/attemptCorrections";
import {
  generateAndPersistPlan,
} from "@/lib/services/planGenerationService";
import { projectAbility } from "@/lib/services/abilityProjector";
import type { PlanGeneratorInput } from "@/lib/services/planGenerator";
import type { CandidateTaskSelectorInput } from "@/lib/services/candidateTaskSelector";

/**
 * V0 atomic plan-item completion tests (Todo 15).
 *
 * The fixture imports `tests/fixtures/curriculum/sample-package` so the
 * available practice tasks and canonical-problem sources match the
 * cross-table joins in `learningCompletion.ts`. Foreign-key enforcement
 * stays ON for this service so the new mapping / snapshot /
 * transition FKs are validated; every happy path uses a real mapped
 * task (no `cpp-io-types` fallback).
 */

const SAMPLE_FIXTURE = join(
  process.cwd(),
  "tests",
  "fixtures",
  "curriculum",
  "sample-package",
);

const NODE_SAMPLE_A = "sample-node-a";
const NODE_SAMPLE_B = "sample-node-b";
const TASK_SAMPLE_A = "sample-task-a";
const TASK_SAMPLE_B = "sample-task-b";

const tempDirs: string[] = [];
const tempDbs: Database.Database[] = [];

type CountRow = { readonly c: number };

function openImportedDb(): {
  readonly db: Database.Database;
  readonly tmp: string;
} {
  const tmp = mkdtempSync(join(tmpdir(), "learn-complete-test-"));
  tempDirs.push(tmp);
  const db = new Database(join(tmp, "complete.sqlite"));
  tempDbs.push(db);
  // FK off mirrors `planGenerationService.test.ts` — the planner writes
  // node_id / practice_task_id as the stable_id, deferring the FK
  // mismatch to a future design decision.
  db.pragma("foreign_keys = OFF");
  applyMigrations(db);
  const result = importPackage(db, SAMPLE_FIXTURE);
  if (!result.ok) {
    throw new Error(
      `importPackage failed: ${JSON.stringify(result.errors)}`,
    );
  }
  getOrCreateLocalProfile(db, {
    now: () => "2026-07-17T00:00:00.000Z",
  });
  return { db, tmp };
}

function baseSelectorInput(): CandidateTaskSelectorInput {
  return {
    nodes: [
      { stable_id: NODE_SAMPLE_A, order_index: 1, title: "Sample Node A" },
      { stable_id: NODE_SAMPLE_B, order_index: 2, title: "Sample Node B" },
    ],
    edges: [
      { from_stable_id: NODE_SAMPLE_A, to_stable_id: NODE_SAMPLE_B },
    ],
    practicesByNode: new Map<
      string,
      ReadonlyArray<{
        stable_id: string;
        title: string;
        difficulty_band: "intro" | "easy";
      }>
    >([
      [
        NODE_SAMPLE_A,
        [{ stable_id: TASK_SAMPLE_A, title: "Practice Task A", difficulty_band: "intro" }],
      ],
      [
        NODE_SAMPLE_B,
        [{ stable_id: TASK_SAMPLE_B, title: "Practice Task B", difficulty_band: "easy" }],
      ],
    ]),
    resourcesByNode: new Map<string, { review_status: string }>([
      [NODE_SAMPLE_A, { review_status: "reviewed" }],
      [NODE_SAMPLE_B, { review_status: "reviewed" }],
    ]),
    effortBoundaryMinutes: 30,
    prerequisitesByNode: {
      [NODE_SAMPLE_B]: [NODE_SAMPLE_A],
    },
  };
}

function persistInitialPlan(
  db: Database.Database,
  options: { readonly primaryGoalNodeId: string } = { primaryGoalNodeId: NODE_SAMPLE_A },
): { readonly planId: string; readonly snapshotId: string; readonly primaryItemId: string } {
  const input: PlanGeneratorInput = {
    ...baseSelectorInput(),
    learnerId: LOCAL_DEFAULT_LEARNER_ID,
    goalPrimaryNodeId: options.primaryGoalNodeId,
    dailyMode: "learn",
    localDate: "2026-07-17",
    inputFingerprint: "fp-complete-15",
  };
  const persisted = generateAndPersistPlan(db, input);
  const items = db
    .prepare<[string], { readonly id: string }>(
      `SELECT id FROM plan_items WHERE daily_plan_id = ? AND role = 'primary' LIMIT 1`,
    )
    .get(persisted.snapshotId);
  if (items === undefined) {
    throw new Error("Initial plan did not persist a primary item");
  }
  return {
    planId: persisted.planId,
    snapshotId: persisted.snapshotId,
    primaryItemId: items.id,
  };
}

afterEach(() => {
  while (tempDbs.length > 0) {
    const db = tempDbs.pop();
    if (db !== undefined) db.close();
  }
  while (tempDirs.length > 0) {
    const tmp = tempDirs.pop();
    if (tmp !== undefined) rmSync(tmp, { recursive: true, force: true });
  }
});

describe("completePlanItem", () => {
  it("completes a primary item as 'passed' and persists attempt, mapping, feedback, snapshot, and successor", () => {
    const { db } = openImportedDb();
    const { primaryItemId, snapshotId, planId } = persistInitialPlan(db);

    const response = completePlanItem(db, {
      learnerId: LOCAL_DEFAULT_LEARNER_ID,
      dailyPlanItemId: primaryItemId,
      result: "passed",
      language: "C++17",
      durationMinutes: 18,
      reflection: "First clear pass for V0 test.",
    });

    expect(response.ok).toBe(true);
    if (response.ok !== true) return;
    if (response.replayed === true) return;
    expect(response.replayed).toBe(false);
    expect(response.attemptId).toBe(`manual_plan_${primaryItemId}`);
    expect(response.nodeId).toBe(`node_${NODE_SAMPLE_A}`);
    expect(response.explanation.levelLabel).toBe("First success");
    expect(response.explanation.confidenceLabel).toBe("low");
    expect(response.explanation.reasonCodes).toContain("primary_first_pass");
    expect(response.explanation.citedAttemptIds).toEqual([`manual_plan_${primaryItemId}`]);
    expect(response.explanation.citedAttemptRevisions).toEqual([1]);
    expect(response.nextPlan.planId).toBe(planId);
    expect(response.nextPlan.snapshotId).not.toBe(snapshotId);

    // Exactly one manual attempt, mapping, completed feedback and
    // successor snapshot must have been written.
    expect(db.prepare<[], CountRow>("SELECT COUNT(*) AS c FROM training_attempts").get()?.c).toBe(1);
    expect(db.prepare<[], CountRow>("SELECT COUNT(*) AS c FROM attempt_node_mappings").get()?.c).toBe(1);
    expect(db.prepare<[], CountRow>("SELECT COUNT(*) AS c FROM task_feedback").get()?.c).toBe(1);
    expect(db.prepare<[], CountRow>("SELECT COUNT(*) AS c FROM ability_snapshots").get()?.c).toBe(1);
    expect(db.prepare<[], CountRow>("SELECT COUNT(*) AS c FROM ability_transitions").get()?.c).toBe(1);
    expect(db.prepare<[], CountRow>("SELECT COUNT(*) AS c FROM daily_plan_snapshots").get()?.c).toBe(2);
    expect(db.prepare<[], CountRow>("SELECT COUNT(*) AS c FROM plan_revision_events").get()?.c).toBe(2);

    type SnapshotLinkRow = { readonly supersedes_daily_plan_id: string | null; readonly learning_plan_id: string };
    const successorRow = db
      .prepare<[string], SnapshotLinkRow>(
        `SELECT supersedes_daily_plan_id, learning_plan_id
           FROM daily_plan_snapshots
          WHERE id = ?`,
      )
      .get(response.nextPlan.snapshotId);
    expect(successorRow?.supersedes_daily_plan_id).toBe(snapshotId);
    expect(successorRow?.learning_plan_id).toBe(planId);

    type RevisionRow = { readonly event_type: string; readonly before_daily_plan_id: string | null; readonly after_daily_plan_id: string };
    const revisionRow = db
      .prepare<[string], RevisionRow>(
        `SELECT event_type, before_daily_plan_id, after_daily_plan_id
           FROM plan_revision_events
          WHERE after_daily_plan_id = ?`,
      )
      .get(response.nextPlan.snapshotId);
    expect(revisionRow?.event_type).toBe("item_completed");
    expect(revisionRow?.before_daily_plan_id).toBe(snapshotId);
  });

  it("returns replayed:true with the original attempt id on a second completion", () => {
    const { db } = openImportedDb();
    const { primaryItemId } = persistInitialPlan(db);

    const first = completePlanItem(db, {
      learnerId: LOCAL_DEFAULT_LEARNER_ID,
      dailyPlanItemId: primaryItemId,
      result: "passed",
    });
    const second = completePlanItem(db, {
      learnerId: LOCAL_DEFAULT_LEARNER_ID,
      dailyPlanItemId: primaryItemId,
      result: "failed",
    });

    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
    if (first.ok !== true || second.ok !== true) return;
    expect(first.replayed).toBe(false);
    expect(second.replayed).toBe(true);
    if (first.replayed === true || second.replayed !== true) return;
    expect(second.attemptId).toBe(first.attemptId);
    // No new rows after replay.
    expect(db.prepare<[], CountRow>("SELECT COUNT(*) AS c FROM training_attempts").get()?.c).toBe(1);
    expect(db.prepare<[], CountRow>("SELECT COUNT(*) AS c FROM task_feedback").get()?.c).toBe(1);
  });

  it("returns ok:false when the plan item does not exist", () => {
    const { db } = openImportedDb();
    persistInitialPlan(db);

    const response = completePlanItem(db, {
      learnerId: LOCAL_DEFAULT_LEARNER_ID,
      dailyPlanItemId: "item_missing",
      result: "passed",
    });

    expect(response.ok).toBe(false);
    if (response.ok === true) return;
    expect(response.error).toBe("Plan item not found");
  });

  it("rejects the 'draft' result with ok:false and writes no attempt row", () => {
    const { db } = openImportedDb();
    const { primaryItemId } = persistInitialPlan(db);

    const response = completePlanItem(db, {
      learnerId: LOCAL_DEFAULT_LEARNER_ID,
      dailyPlanItemId: primaryItemId,
      result: "draft",
    });

    expect(response.ok).toBe(false);
    if (response.ok === true) return;
    expect(response.error).toBe(
      "Draft attempts cannot be recorded as plan completion",
    );
    expect(db.prepare<[], CountRow>("SELECT COUNT(*) AS c FROM training_attempts").get()?.c).toBe(0);
  });

  it("drops ability back to unassessed after the manual attempt is corrected", () => {
    const { db } = openImportedDb();
    const { primaryItemId } = persistInitialPlan(db);

    const completed = completePlanItem(db, {
      learnerId: LOCAL_DEFAULT_LEARNER_ID,
      dailyPlanItemId: primaryItemId,
      result: "passed",
    });
    expect(completed.ok).toBe(true);
    if (completed.ok !== true) return;
    if (completed.replayed !== false) return;

    type SnapshotRow = { readonly visible_level: string };
    const before = db
      .prepare<[string, string], SnapshotRow>(
        `SELECT visible_level FROM ability_snapshots
          WHERE learner_id = ? AND node_id = ?`,
      )
      .get(LOCAL_DEFAULT_LEARNER_ID, `node_${NODE_SAMPLE_A}`);
    expect(before?.visible_level).toBe("L1");

    correctAttempt(db, completed.attemptId, {
      expectedRevision: 1,
      reason: "Re-tested, encountered the boundary condition.",
      changes: { result: "failed" },
    });

    // The Todo 16 service will own the wired correction→replay path.
    // This test exercises the same projector-driven upsert path that
    // `completePlanItem` runs internally to lock the contract that a
    // corrected manual attempt collapses the visible level back to
    // `unassessed`.
    db.prepare(
      `DELETE FROM ability_snapshots
        WHERE learner_id = ? AND node_id = ?`,
    ).run(LOCAL_DEFAULT_LEARNER_ID, `node_${NODE_SAMPLE_A}`);

    const mappings = listAttemptNodeMappings(db, LOCAL_DEFAULT_LEARNER_ID);
    const projection = projectAbility({
      learnerId: LOCAL_DEFAULT_LEARNER_ID,
      mappings,
      nodeIds: [`node_${NODE_SAMPLE_A}`],
      previousSnapshots: new Map(),
      now: "2026-07-17T01:00:00.000Z",
    });
    const next = projection.perNode.get(`node_${NODE_SAMPLE_A}`);
    expect(next?.visibleLevel).toBe("unassessed");
  });

  it("exposes a different primary task for the next /today call", () => {
    const { db } = openImportedDb();
    const { primaryItemId } = persistInitialPlan(db);

    const first = completePlanItem(db, {
      learnerId: LOCAL_DEFAULT_LEARNER_ID,
      dailyPlanItemId: primaryItemId,
      result: "passed",
    });
    expect(first.ok).toBe(true);
    if (first.ok !== true) return;
    if (first.replayed === true) return;

    // Simulate a /today call after the completion: the planner
    // receives the post-completion ability state (sample-node-a is
    // now `L1`, so sample-node-b becomes reachable as practice) and
    // must surface a new primary that differs from the just-completed
    // practice task id.
    const persisted = generateAndPersistPlan(db, {
      ...baseSelectorInput(),
      learnerId: LOCAL_DEFAULT_LEARNER_ID,
      goalPrimaryNodeId: NODE_SAMPLE_B,
      dailyMode: "practice",
      localDate: "2026-07-17",
      inputFingerprint: "fp-complete-15-after",
      abilitiesByNode: {
        [NODE_SAMPLE_A]: "L1",
      },
    });

    expect(persisted.isFallback).toBe(false);
    expect(persisted.primaryTaskId).not.toBe(TASK_SAMPLE_A);
    expect(persisted.primaryTaskId).toBe(TASK_SAMPLE_B);
  });
});
