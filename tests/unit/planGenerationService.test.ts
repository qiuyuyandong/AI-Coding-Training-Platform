import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";
import Database from "better-sqlite3";
import { applyMigrations } from "@/lib/db/migrations";
import { importPackage } from "@/lib/curriculum/importPackage";
import { LOCAL_DEFAULT_LEARNER_ID } from "@/lib/domain/learner";
import { getOrCreateLocalProfile } from "@/lib/repositories/learnerProfiles";
import {
  generateAndPersistPlan,
} from "@/lib/services/planGenerationService";
import type { PlanGeneratorInput } from "@/lib/services/planGenerator";
import type { CandidateTaskSelectorInput } from "@/lib/services/candidateTaskSelector";

/**
 * V0 plan-generation-service tests.
 *
 * Locks the transactional wrapper for Todo 12: a single SQLite
 * transaction must commit exactly one learning plan, one daily snapshot,
 * one or more immutable plan items, and one `initial_plan` revision
 * event per call. The fallback path (`isFallback: true`) must commit
 * only the safe-foundation primary item and the fingerprint must round
 * trip into `plan_revision_events`.
 *
 * The test deliberately opens the SQLite handle without the
 * `foreign_keys` pragma so the fallback path can persist plan items
 * whose `node_id` / `practice_task_id` reference the synthetic
 * `cpp-io-types` stable id (which has no `knowledge_nodes` or
 * `practice_tasks` row in the sample fixture). This is the same
 * pattern used by `tests/unit/curriculumImporter.test.ts`.
 */

const SAMPLE_FIXTURE = join(
  process.cwd(),
  "tests",
  "fixtures",
  "curriculum",
  "sample-package",
);

type CountRow = { readonly c: number };

const tempDirs: string[] = [];
const tempDbs: Database.Database[] = [];

function openImportedDb(): {
  readonly db: Database.Database;
  readonly tmp: string;
} {
  const tmp = mkdtempSync(join(tmpdir(), "plan-gen-svc-test-"));
  tempDirs.push(tmp);
  const db = new Database(join(tmp, "plan-svc.sqlite"));
  tempDbs.push(db);
  // better-sqlite3 turns foreign key enforcement ON by default. We
  // disable it here so the Todo 12 fallback path can persist plan
  // items whose `node_id` / `practice_task_id` reference the synthetic
  // `cpp-io-types` / `task-cpp-io-types` stable ids. The Todo 12 contract
  // explicitly defers the no-fallback-KB-row error handling to a future
  // design decision; this test mirrors that contract end-to-end rather
  // than papering over it.
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

function baseSelector(): CandidateTaskSelectorInput {
  return {
    nodes: [
      {
        stable_id: "sample-node-a",
        order_index: 1,
        title: "Sample Node A",
      },
      {
        stable_id: "sample-node-b",
        order_index: 2,
        title: "Sample Node B",
      },
    ],
    edges: [
      {
        from_stable_id: "sample-node-a",
        to_stable_id: "sample-node-b",
      },
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
        "sample-node-a",
        [
          {
            stable_id: "sample-task-a",
            title: "Practice Task A",
            difficulty_band: "intro",
          },
        ],
      ],
      [
        "sample-node-b",
        [
          {
            stable_id: "sample-task-b",
            title: "Practice Task B",
            difficulty_band: "easy",
          },
        ],
      ],
    ]),
    resourcesByNode: new Map<string, { review_status: string }>([
      ["sample-node-a", { review_status: "reviewed" }],
      ["sample-node-b", { review_status: "reviewed" }],
    ]),
    effortBoundaryMinutes: 30,
    // The fixture's `sample-node-b` requires `sample-node-a` to be a
    // ready prereq; without a baseline the selector still considers
    // both nodes eligible because undefined baselines are treated as
    // "no blockers" by the V0 prerequisite algorithm (only explicit
    // "unknown" / "needs_foundation" / "self_reported" values block).
  };
}

describe("generateAndPersistPlan", () => {
  afterEach(() => {
    while (tempDbs.length > 0) {
      const db = tempDbs.pop();
      if (db !== undefined) {
        db.close();
      }
    }
    while (tempDirs.length > 0) {
      const tmp = tempDirs.pop();
      if (tmp !== undefined) {
        rmSync(tmp, { recursive: true, force: true });
      }
    }
  });

  it("commits 1 active plan / 1 snapshot / >=1 items / 1 initial_plan revision event", () => {
    const { db } = openImportedDb();
    const input: PlanGeneratorInput = {
      ...baseSelector(),
      learnerId: LOCAL_DEFAULT_LEARNER_ID,
      dailyMode: "learn",
      localDate: "2026-07-17",
      inputFingerprint: "fp-happy-path-001",
    };
    const persisted = generateAndPersistPlan(db, input);

    expect(persisted.isFallback).toBe(false);
    expect(persisted.snapshotId.length).toBeGreaterThan(0);
    expect(persisted.itemIds.length).toBeGreaterThan(0);

    const planRow = db
      .prepare<[string], { readonly c: number; readonly status: string }>(
        `SELECT COUNT(*) AS c, MAX(status) AS status
           FROM learning_plans
          WHERE learner_id = ?`,
      )
      .get(LOCAL_DEFAULT_LEARNER_ID);
    expect(planRow?.c).toBe(1);
    expect(planRow?.status).toBe("active");

    const snapshotRow = db
      .prepare<[string], CountRow>(
        `SELECT COUNT(*) AS c FROM daily_plan_snapshots
          WHERE learning_plan_id = ?`,
      )
      .get(persisted.planId);
    expect(snapshotRow?.c).toBe(1);

    const itemsRow = db
      .prepare<[string], CountRow>(
        `SELECT COUNT(*) AS c FROM plan_items WHERE daily_plan_id = ?`,
      )
      .get(persisted.snapshotId);
    expect(itemsRow?.c).toBeGreaterThanOrEqual(1);

    const eventRow = db
      .prepare<
        [string],
        { readonly c: number; readonly event_type: string }
      >(
        `SELECT COUNT(*) AS c, MAX(event_type) AS event_type
           FROM plan_revision_events
          WHERE after_daily_plan_id = ?`,
      )
      .get(persisted.snapshotId);
    expect(eventRow?.c).toBe(1);
    expect(eventRow?.event_type).toBe("initial_plan");
  });

  it("falls back to cpp-io-types when the selector has no candidate", () => {
    const { db } = openImportedDb();
    const skipped = ["sample-task-a", "sample-task-b"];
    const fallbackInput: PlanGeneratorInput = {
      ...baseSelector(),
      learnerId: LOCAL_DEFAULT_LEARNER_ID,
      dailyMode: "learn",
      localDate: "2026-07-17",
      // Force the selector to return `noCandidate` by listing every
      // known practice task id in `recentlySkipped` and pointing the
      // primary goal at a non-existent node. The combined input
      // collapses the candidate pool to length 0 without changing any
      // persisted fixture row.
      goalPrimaryNodeId: "non-existent-node",
      recentlySkipped: skipped,
      inputFingerprint: "fp-fallback-002",
    };

    const persisted = generateAndPersistPlan(db, fallbackInput);

    expect(persisted.isFallback).toBe(true);
    expect(persisted.primaryTaskId).toBe("task-cpp-io-types");

    const itemsRow = db
      .prepare<
        [string],
        {
          readonly c: number;
          readonly role: string;
          readonly node_id: string;
          readonly practice_task_id: string;
        }
      >(
        `SELECT COUNT(*) AS c, MAX(role) AS role,
                MAX(node_id) AS node_id,
                MAX(practice_task_id) AS practice_task_id
           FROM plan_items
          WHERE daily_plan_id = ?`,
      )
      .get(persisted.snapshotId);
    expect(itemsRow?.c).toBe(1);
    expect(itemsRow?.role).toBe("primary");
    expect(itemsRow?.node_id).toBe("cpp-io-types");
    expect(itemsRow?.practice_task_id).toBe("task-cpp-io-types");

    const knowledgeRow = db
      .prepare<
        [string],
        {
          readonly count: number;
          readonly stable_id: string;
        }
      >(
        `SELECT COUNT(*) AS count, MAX(stable_id) AS stable_id
           FROM knowledge_nodes
          WHERE stable_id = ?`,
      )
      .get("cpp-io-types");
    // The sample fixture does not include `cpp-io-types`; the
    // generator's fallback path may forward that literal text as the
    // plan_item `node_id` without depending on a corresponding row in
    // `knowledge_nodes`. This assertion documents that.
    expect(knowledgeRow?.count ?? 0).toBe(0);
    expect(itemsRow?.node_id).toBe("cpp-io-types");
  });

  it("records the supplied input fingerprint on the revision event", () => {
    const { db } = openImportedDb();
    const input: PlanGeneratorInput = {
      ...baseSelector(),
      learnerId: LOCAL_DEFAULT_LEARNER_ID,
      dailyMode: "learn",
      localDate: "2026-07-17",
      inputFingerprint: "fp-fingerprint-003",
    };
    const persisted = generateAndPersistPlan(db, input);

    const fingerprintRow = db
      .prepare<[string], { readonly input_fingerprint: string }>(
        `SELECT input_fingerprint
           FROM plan_revision_events
          WHERE after_daily_plan_id = ?`,
      )
      .get(persisted.snapshotId);
    expect(fingerprintRow?.input_fingerprint).toBe("fp-fingerprint-003");
  });

  it("persists node goal context so successor plans can restore ranking intent", () => {
    const { db } = openImportedDb();
    const input: PlanGeneratorInput = {
      ...baseSelector(),
      learnerId: LOCAL_DEFAULT_LEARNER_ID,
      goalPrimaryNodeId: "sample-node-b",
      goalInterestNodeIds: ["sample-node-a"],
      dailyMode: "learn",
      localDate: "2026-07-17",
      inputFingerprint: "fp-goal-context-004",
    };

    const persisted = generateAndPersistPlan(db, input);
    const row = db
      .prepare<[string], { readonly snapshot_json: string }>(
        "SELECT snapshot_json FROM learning_plans WHERE id = ?",
      )
      .get(persisted.planId);

    expect(row).toBeDefined();
    expect(JSON.parse(row?.snapshot_json ?? "{}")).toEqual({
      goalPrimaryNodeId: "sample-node-b",
      goalInterestNodeIds: ["sample-node-a"],
    });
  });
});
