import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";
import { afterEach, describe, expect, it } from "vitest";
import { applyMigrations } from "@/lib/db/migrations";
import { importPackage } from "@/lib/curriculum/importPackage";
import { getOrCreateLocalProfile } from "@/lib/repositories/learnerProfiles";
import { LOCAL_DEFAULT_LEARNER_ID } from "@/lib/domain/learner";
import { classifyTrainingOutcome } from "@/lib/services/trainingOutcomeClassifier";
import { replayAttemptEvidence } from "@/lib/services/attemptEvidence";
import { appendLearnerAssessment, listLearnerAssessments } from "@/lib/repositories/learnerAssessments";
import { createDailySnapshot, createLearningPlan, insertPlanItem } from "@/lib/repositories/plans";
import { regenerateDailyPlan } from "@/lib/services/planRegeneration";

const directories: string[] = [];
const databases: Database.Database[] = [];

afterEach(() => {
  for (const db of databases.splice(0)) db.close();
  for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true });
});

describe("Phase 3 evidence pipeline", () => {
  it("classifies all five outcomes without producing a capability level", () => {
    const base = {
      submissionCount: 1,
      meaningfulChangeCount: 0,
      hasSubmissionSequence: true,
      hasCodeSnapshot: false,
      hasRunOrTestEvidence: false,
      hasReflection: false,
    } as const;
    expect(classifyTrainingOutcome({ ...base, result: "passed", usedAssistance: false }).outcome)
      .toBe("independent_effective_completion");
    expect(classifyTrainingOutcome({ ...base, result: "passed", usedAssistance: true }).outcome)
      .toBe("assisted_effective_completion");
    expect(classifyTrainingOutcome({ ...base, result: "partial", usedAssistance: null, meaningfulChangeCount: 1 }).outcome)
      .toBe("productive_struggle");
    expect(classifyTrainingOutcome({ ...base, result: "failed", usedAssistance: null, submissionCount: 3, hasSubmissionSequence: true }).outcome)
      .toBe("unproductive_trial_and_error");
    expect(classifyTrainingOutcome({ ...base, result: "draft", usedAssistance: null, hasSubmissionSequence: false }).outcome)
      .toBe("insufficient_evidence");
  });

  it("replays one attempt into one fact, one summary, and one bounded review", () => {
    const db = openFixture();
    const node = db.prepare<[], { readonly id: string }>(
      "SELECT id FROM knowledge_nodes ORDER BY order_index DESC LIMIT 1",
    ).get();
    if (node === undefined) throw new Error("Fixture has no node");
    db.prepare(`
      INSERT INTO training_attempts (
        id, record_source, platform, problem_external_id, problem_title,
        canonical_url, started_at, ended_at, result, revision, created_at, updated_at
      ) VALUES (
        'attempt_phase3', 'manual', 'manual', 'phase3', 'Phase 3',
        'manual://phase3', '2026-09-07T00:00:00.000Z', '2026-09-07T00:20:00.000Z',
        'passed', 1, '2026-09-07T00:00:00.000Z', '2026-09-07T00:20:00.000Z'
      )
    `).run();
    db.prepare(`
      INSERT INTO attempt_node_mappings (id, attempt_id, node_id, role, mapping_reason, created_at)
      VALUES ('mapping_phase3', 'attempt_phase3', ?, 'primary', 'fixture', '2026-09-07T00:20:00.000Z')
    `).run(node.id);

    const first = replayAttemptEvidence(db, LOCAL_DEFAULT_LEARNER_ID, "attempt_phase3", {
      usedAssistance: false,
      hasCodeSnapshot: true,
    });
    const second = replayAttemptEvidence(db, LOCAL_DEFAULT_LEARNER_ID, "attempt_phase3", {
      usedAssistance: false,
      hasCodeSnapshot: true,
    });

    expect(first.replayed).toBe(false);
    expect(second).toEqual({ ...first, replayed: true });
    expect(count(db, "learning_evidence_events")).toBe(1);
    expect(count(db, "training_session_summaries")).toBe(1);
    expect(count(db, "review_items")).toBe(1);
    expect(db.prepare<[], { readonly selected_practice_task_id: string | null }>(
      "SELECT selected_practice_task_id FROM review_items LIMIT 1",
    ).get()?.selected_practice_task_id).not.toBeNull();

    const task = db.prepare<[string], { readonly id: string }>(`
      SELECT practice_task_id AS id FROM node_practice_mappings
      WHERE node_id = ? ORDER BY sort_order ASC LIMIT 1
    `).get(node.id);
    if (task === undefined) throw new Error("Fixture node has no practice task");
    const plan = createLearningPlan(db, LOCAL_DEFAULT_LEARNER_ID, "test-generator", "{}", {
      now: () => "2026-09-07T00:21:00.000Z",
    });
    const snapshot = createDailySnapshot(db, plan.id, "2026-09-15", 30, "review", "test-generator", null, {
      now: () => "2026-09-07T00:21:00.000Z",
    });
    insertPlanItem(db, snapshot.id, task.id, node.id, "primary", 0, "[]");
    const regenerated = regenerateDailyPlan(db, {
      learnerId: LOCAL_DEFAULT_LEARNER_ID,
      learningPlanId: plan.id,
      beforeSnapshotId: snapshot.id,
      localDate: "2026-09-15",
      effortBoundaryMinutes: 30,
      dailyMode: "review",
      eventType: "effort_changed",
      inputFingerprint: "due-review-test",
      now: "2026-09-15T00:00:00.000Z",
    });
    const reviewItem = db.prepare<[string], { readonly reason_codes_json: string }>(`
      SELECT reason_codes_json FROM plan_items
      WHERE daily_plan_id = ? AND reason_codes_json = '["due_review"]'
    `).get(regenerated.snapshotId);
    expect(reviewItem?.reason_codes_json).toBe('["due_review"]');
  });

  it("records self-assessment as pending context without mutating ability", () => {
    const db = openFixture();
    const node = db.prepare<[], { readonly id: string }>(
      "SELECT id FROM knowledge_nodes ORDER BY order_index ASC LIMIT 1",
    ).get();
    if (node === undefined) throw new Error("Fixture has no node");
    appendLearnerAssessment(db, {
      learnerId: LOCAL_DEFAULT_LEARNER_ID,
      nodeId: node.id,
      kind: "self_rating",
      rating: "L3",
      reason: "I can explain the trade-offs.",
      abilityInputFingerprint: null,
      createdAt: "2026-09-07T02:00:00.000Z",
    });
    expect(listLearnerAssessments(db, LOCAL_DEFAULT_LEARNER_ID)).toHaveLength(1);
    expect(listLearnerAssessments(db, LOCAL_DEFAULT_LEARNER_ID)[0]?.resolution)
      .toBe("pending_verification");
    expect(count(db, "ability_snapshots")).toBe(0);
    const task = db.prepare<[string], { readonly id: string }>(`
      SELECT practice_task_id AS id FROM node_practice_mappings
      WHERE node_id = ? ORDER BY sort_order ASC LIMIT 1
    `).get(node.id);
    if (task === undefined) throw new Error("Fixture node has no practice task");
    const plan = createLearningPlan(db, LOCAL_DEFAULT_LEARNER_ID, "test-generator", "{}", {
      now: () => "2026-09-07T02:01:00.000Z",
    });
    const snapshot = createDailySnapshot(db, plan.id, "2026-09-07", 30, "review", "test-generator", null, {
      now: () => "2026-09-07T02:01:00.000Z",
    });
    insertPlanItem(db, snapshot.id, task.id, node.id, "primary", 0, "[]");
    const regenerated = regenerateDailyPlan(db, {
      learnerId: LOCAL_DEFAULT_LEARNER_ID,
      learningPlanId: plan.id,
      beforeSnapshotId: snapshot.id,
      localDate: "2026-09-07",
      effortBoundaryMinutes: 30,
      dailyMode: "review",
      eventType: "effort_changed",
      inputFingerprint: "assessment-test",
      now: "2026-09-07T02:02:00.000Z",
    });
    expect(db.prepare<[string], { readonly reason_codes_json: string }>(`
      SELECT reason_codes_json FROM plan_items
      WHERE daily_plan_id = ? AND reason_codes_json = '["assessment_verification"]'
    `).get(regenerated.snapshotId)?.reason_codes_json).toBe('["assessment_verification"]');
  });
});

function openFixture(): Database.Database {
  const directory = mkdtempSync(join(tmpdir(), "phase3-evidence-"));
  directories.push(directory);
  const db = new Database(join(directory, "test.sqlite"));
  databases.push(db);
  db.pragma("foreign_keys = ON");
  applyMigrations(db);
  const imported = importPackage(
    db,
    join(process.cwd(), "tests", "fixtures", "curriculum", "sample-package"),
  );
  if (!imported.ok) throw new Error("Fixture import failed");
  getOrCreateLocalProfile(db, { now: () => "2026-09-07T00:00:00.000Z" });
  return db;
}

function count(db: Database.Database, table: string): number {
  return db.prepare<[], { readonly count: number }>(
    `SELECT COUNT(*) AS count FROM ${table}`,
  ).get()?.count ?? 0;
}
