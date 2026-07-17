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
  listAbilityTransitions,
} from "@/lib/repositories/ability";
import {
  AttemptRevisionConflictError,
  correctAttempt,
  voidAttempt,
} from "@/lib/services/attemptCorrections";
import {
  reprojectAfterCorrection,
  wrapWithReprojection,
} from "@/lib/services/abilityReprojection";
import { createManualAttempt } from "@/lib/services/manualAttempts";
import { computeInputFingerprint } from "@/lib/services/abilityProjector";

/**
 * V0 ability reprojection wrapper tests (Todo 16).
 *
 * The fixture imports `tests/fixtures/curriculum/sample-package` so the
 * `knowledge_nodes` rows referenced by `attempt_node_mappings` exist;
 * without them the FK on `ability_snapshots.node_id` would reject the
 * reprojection. Foreign-key enforcement stays OFF for parity with the
 * plan-completion tests: the planner writes `node_id` as the
 * `knowledge_nodes.stable_id`, which is the established pre-existing
 * design gap documented in the Todo 15 evidence.
 */

const SAMPLE_FIXTURE = join(
  process.cwd(),
  "tests",
  "fixtures",
  "curriculum",
  "sample-package",
);

const NODE_SAMPLE_A = "sample-node-a";
const NODE_ID_A = `node_${NODE_SAMPLE_A}`;
const NODE_ID_B = `node_sample-node-b`;
const LEARNER = LOCAL_DEFAULT_LEARNER_ID;

const tempDirs: string[] = [];
const tempDbs: Database.Database[] = [];

type CountRow = { readonly c: number };
type SnapshotRow = {
  readonly visible_level: string;
  readonly confidence: string;
  readonly evidence_count: number;
};
type RevisionRow = {
  readonly event_type: string;
  readonly before_daily_plan_id: string | null;
  readonly after_daily_plan_id: string;
  readonly input_fingerprint: string;
};

function openImportedDb(): {
  readonly db: Database.Database;
  readonly tmp: string;
} {
  const tmp = mkdtempSync(join(tmpdir(), "ability-reproj-test-"));
  tempDirs.push(tmp);
  const db = new Database(join(tmp, "reproj.sqlite"));
  tempDbs.push(db);
  db.pragma("foreign_keys = OFF");
  applyMigrations(db, { now: () => "2026-07-17T00:00:00.000Z" });
  const result = importPackage(db, SAMPLE_FIXTURE);
  if (!result.ok) {
    throw new Error(`importPackage failed: ${JSON.stringify(result.errors)}`);
  }
  getOrCreateLocalProfile(db, { now: () => "2026-07-17T00:00:00.000Z" });
  return { db, tmp };
}

function seedMapping(
  db: Database.Database,
  attemptId: string,
  nodeId: string,
  role: "primary" | "supporting",
  reason: string,
): void {
  db.prepare(
    `INSERT INTO attempt_node_mappings (
       id, attempt_id, node_id, role, mapping_reason, created_at
     ) VALUES (
       @id, @attemptId, @nodeId, @role, @mappingReason, @createdAt
     )`,
  ).run({
    id: `mapping_${attemptId}_${nodeId}`,
    attemptId,
    nodeId,
    role,
    mappingReason: reason,
    createdAt: "2026-07-17T00:00:00.000Z",
  });
}

function seedPlanRevisionEvent(
  db: Database.Database,
  snapshotId: string,
  eventType: string,
  fingerprint: string,
): void {
  db.prepare(
    `INSERT INTO plan_revision_events (
       id, before_daily_plan_id, after_daily_plan_id, event_type,
       input_fingerprint, created_at
     ) VALUES (
       @id, @beforeDailyPlanId, @afterDailyPlanId, @eventType,
       @inputFingerprint, @createdAt
     )`,
  ).run({
    id: `rev_seed_${eventType}`,
    beforeDailyPlanId: snapshotId,
    afterDailyPlanId: snapshotId,
    eventType,
    inputFingerprint: fingerprint,
    createdAt: "2026-07-17T00:00:00.000Z",
  });
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

describe("reprojectAfterCorrection", () => {
  it("drops a mapped passed ability down to unassessed after correction to failed", async () => {
    const { db } = openImportedDb();
    const attemptId = "manual_reproj_correct";
    createManualAttempt(db, {
      platform: "atcoder",
      problemExternalId: "practice_1",
      problemTitle: "Practice 1",
      startedAt: "2026-07-17T01:00:00.000Z",
      endedAt: "2026-07-17T01:15:00.000Z",
      result: "passed",
    }, {
      id: () => attemptId,
      now: () => "2026-07-17T01:16:00.000Z",
    });
    seedMapping(db, attemptId, NODE_ID_A, "primary", "manual_completion");

    db.prepare(
      `INSERT INTO ability_snapshots (
         learner_id, node_id, visible_level, confidence, evidence_count,
         stale, input_fingerprint, projection_version, as_of_time
       ) VALUES (
         @learnerId, @nodeId, @visibleLevel, @confidence, @evidenceCount,
         0, @fingerprint, @version, @asOf
       )`,
    ).run({
      learnerId: LEARNER,
      nodeId: NODE_ID_A,
      visibleLevel: "L1",
      confidence: "low",
      evidenceCount: 1,
      fingerprint: "fp_pre_correction",
      version: "v0-ability-projector-1",
      asOf: "2026-07-17T01:16:00.000Z",
    });

    const corrected = await wrapWithReprojection(
      db,
      "attempt_corrected",
      () =>
        correctAttempt(db, attemptId, {
          expectedRevision: 1,
          reason: "Re-tested, missed an edge case.",
          changes: { result: "failed" },
        }, { now: () => "2026-07-17T01:30:00.000Z" }),
      LEARNER,
      attemptId,
      { now: () => "2026-07-17T01:30:00.000Z" },
    );
    expect(corrected.revision).toBe(2);
    expect(corrected.result).toBe("failed");

    const snapshot = db
      .prepare<[string, string], SnapshotRow>(
        `SELECT visible_level, confidence, evidence_count
           FROM ability_snapshots
          WHERE learner_id = ? AND node_id = ?`,
      )
      .get(LEARNER, NODE_ID_A);
    expect(snapshot?.visible_level).toBe("unassessed");
    expect(snapshot?.evidence_count).toBe(1);

    const transitions = listAbilityTransitions(db, LEARNER, NODE_ID_A);
    expect(transitions).toHaveLength(1);
    expect(transitions[0]?.previous_level).toBe("L1");
    expect(transitions[0]?.new_level).toBe("unassessed");
  });

  it("recomputes mapped ability after voiding a sole pass", async () => {
    const { db } = openImportedDb();
    const attemptId = "manual_reproj_void";
    createManualAttempt(db, {
      platform: "atcoder",
      problemExternalId: "practice_1",
      problemTitle: "Practice 1",
      startedAt: "2026-07-17T01:00:00.000Z",
      endedAt: "2026-07-17T01:15:00.000Z",
      result: "passed",
    }, {
      id: () => attemptId,
      now: () => "2026-07-17T01:16:00.000Z",
    });
    seedMapping(db, attemptId, NODE_ID_A, "primary", "manual_completion");

    db.prepare(
      `INSERT INTO ability_snapshots (
         learner_id, node_id, visible_level, confidence, evidence_count,
         stale, input_fingerprint, projection_version, as_of_time
       ) VALUES (
         @learnerId, @nodeId, @visibleLevel, @confidence, @evidenceCount,
         0, @fingerprint, @version, @asOf
       )`,
    ).run({
      learnerId: LEARNER,
      nodeId: NODE_ID_A,
      visibleLevel: "L1",
      confidence: "low",
      evidenceCount: 1,
      fingerprint: "fp_pre_void",
      version: "v0-ability-projector-1",
      asOf: "2026-07-17T01:16:00.000Z",
    });

    const voided = await wrapWithReprojection(
      db,
      "attempt_voided",
      () =>
        voidAttempt(db, attemptId, {
          expectedRevision: 1,
          reason: "Wrong problem attribution.",
        }, { now: () => "2026-07-17T02:00:00.000Z" }),
      LEARNER,
      attemptId,
      { now: () => "2026-07-17T02:00:00.000Z" },
    );
    expect(voided.replayed).toBe(false);

    const snapshot = db
      .prepare<[string, string], SnapshotRow>(
        `SELECT visible_level, confidence, evidence_count
           FROM ability_snapshots
          WHERE learner_id = ? AND node_id = ?`,
      )
      .get(LEARNER, NODE_ID_A);
    expect(snapshot?.visible_level).toBe("unassessed");
    expect(snapshot?.evidence_count).toBe(0);

    const transitions = listAbilityTransitions(db, LEARNER, NODE_ID_A);
    expect(transitions).toHaveLength(1);
    expect(transitions[0]?.previous_level).toBe("L1");
    expect(transitions[0]?.new_level).toBe("unassessed");
  });

  it("is idempotent on already-voided replays via wrapWithReprojection", async () => {
    const { db } = openImportedDb();
    const attemptId = "manual_reproj_void_replay";
    createManualAttempt(db, {
      platform: "atcoder",
      problemExternalId: "practice_1",
      problemTitle: "Practice 1",
      startedAt: "2026-07-17T01:00:00.000Z",
      endedAt: "2026-07-17T01:15:00.000Z",
      result: "passed",
    }, {
      id: () => attemptId,
      now: () => "2026-07-17T01:16:00.000Z",
    });
    seedMapping(db, attemptId, NODE_ID_A, "primary", "manual_completion");

    db.prepare(
      `INSERT INTO ability_snapshots (
         learner_id, node_id, visible_level, confidence, evidence_count,
         stale, input_fingerprint, projection_version, as_of_time
       ) VALUES (
         @learnerId, @nodeId, @visibleLevel, @confidence, @evidenceCount,
         0, @fingerprint, @version, @asOf
       )`,
    ).run({
      learnerId: LEARNER,
      nodeId: NODE_ID_A,
      visibleLevel: "L1",
      confidence: "low",
      evidenceCount: 1,
      fingerprint: "fp_pre_void_replay",
      version: "v0-ability-projector-1",
      asOf: "2026-07-17T01:16:00.000Z",
    });

    const first = await wrapWithReprojection(
      db,
      "attempt_voided",
      () =>
        voidAttempt(db, attemptId, {
          expectedRevision: 1,
          reason: "Wrong problem attribution.",
        }, { now: () => "2026-07-17T01:30:00.000Z" }),
      LEARNER,
      attemptId,
      { now: () => "2026-07-17T01:30:00.000Z" },
    );
    expect(first.replayed).toBe(false);
    const transitionsAfterFirst = listAbilityTransitions(db, LEARNER, NODE_ID_A);
    expect(transitionsAfterFirst).toHaveLength(1);

    const replay = await wrapWithReprojection(
      db,
      "attempt_voided",
      () =>
        voidAttempt(db, attemptId, {
          expectedRevision: 2,
          reason: "Replay must be idempotent.",
        }, { now: () => "2026-07-17T01:40:00.000Z" }),
      LEARNER,
      attemptId,
      { now: () => "2026-07-17T01:40:00.000Z" },
    );
    expect(replay.replayed).toBe(true);
    const transitionsAfterReplay = listAbilityTransitions(db, LEARNER, NODE_ID_A);
    expect(transitionsAfterReplay).toHaveLength(1);
  });

  it("rolls back the whole outer transaction when voidAttempt hits a revision conflict", async () => {
    const { db } = openImportedDb();
    const attemptId = "manual_reproj_void_conflict";
    createManualAttempt(db, {
      platform: "atcoder",
      problemExternalId: "practice_1",
      problemTitle: "Practice 1",
      startedAt: "2026-07-17T01:00:00.000Z",
      endedAt: "2026-07-17T01:15:00.000Z",
      result: "passed",
    }, {
      id: () => attemptId,
      now: () => "2026-07-17T01:16:00.000Z",
    });
    seedMapping(db, attemptId, NODE_ID_A, "primary", "manual_completion");

    await wrapWithReprojection(
      db,
      "attempt_corrected",
      () =>
        correctAttempt(db, attemptId, {
          expectedRevision: 1,
          reason: "First valid correction.",
          changes: { result: "failed" },
        }, { now: () => "2026-07-17T01:30:00.000Z" }),
      LEARNER,
      attemptId,
      { now: () => "2026-07-17T01:30:00.000Z" },
    );

    const snapshotBefore = db
      .prepare<[string, string], SnapshotRow>(
        `SELECT visible_level, confidence, evidence_count
           FROM ability_snapshots
          WHERE learner_id = ? AND node_id = ?`,
      )
      .get(LEARNER, NODE_ID_A);
    expect(snapshotBefore?.visible_level).toBe("unassessed");
    expect(snapshotBefore?.evidence_count).toBe(1);

    let caught: unknown;
    try {
      await wrapWithReprojection(
        db,
        "attempt_corrected",
        () =>
          correctAttempt(db, attemptId, {
            expectedRevision: 99,
            reason: "Stale revision must roll everything back.",
            changes: { result: "passed" },
          }, { now: () => "2026-07-17T02:00:00.000Z" }),
        LEARNER,
        attemptId,
        { now: () => "2026-07-17T02:00:00.000Z" },
      );
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(AttemptRevisionConflictError);

    const snapshotAfter = db
      .prepare<[string, string], SnapshotRow>(
        `SELECT visible_level, confidence, evidence_count
           FROM ability_snapshots
          WHERE learner_id = ? AND node_id = ?`,
      )
      .get(LEARNER, NODE_ID_A);
    expect(snapshotAfter?.visible_level).toBe("unassessed");
    expect(snapshotAfter?.evidence_count).toBe(1);
    expect(
      db.prepare<[], CountRow>("SELECT COUNT(*) AS c FROM plan_revision_events")
        .get()?.c,
    ).toBe(0);
    expect(
      db.prepare<[], CountRow>("SELECT COUNT(*) AS c FROM attempt_corrections")
        .get()?.c,
    ).toBe(1);
  });

  it("returns an empty result for an attempt that has no node mappings", async () => {
    const { db } = openImportedDb();
    const attemptId = "manual_reproj_unmapped";
    createManualAttempt(db, {
      platform: "atcoder",
      problemExternalId: "practice_1",
      problemTitle: "Practice 1",
      startedAt: "2026-07-17T01:00:00.000Z",
      endedAt: "2026-07-17T01:15:00.000Z",
      result: "passed",
    }, {
      id: () => attemptId,
      now: () => "2026-07-17T01:16:00.000Z",
    });

    const beforeSnapshots = db
      .prepare<[], CountRow>("SELECT COUNT(*) AS c FROM ability_snapshots")
      .get()?.c;
    const beforeTransitions = db
      .prepare<[], CountRow>("SELECT COUNT(*) AS c FROM ability_transitions")
      .get()?.c;

    const result = await reprojectAfterCorrection(db, {
      learnerId: LEARNER,
      attemptId,
      trigger: "attempt_corrected",
      now: "2026-07-17T01:30:00.000Z",
    });
    expect(result.ok).toBe(true);
    expect(result.affectedNodes).toEqual([]);
    expect(result.transitionsEmitted).toEqual([]);
    expect(result.fingerprint).toBe("");
    expect(
      db.prepare<[], CountRow>("SELECT COUNT(*) AS c FROM ability_snapshots")
        .get()?.c,
    ).toBe(beforeSnapshots);
    expect(
      db.prepare<[], CountRow>("SELECT COUNT(*) AS c FROM ability_transitions")
        .get()?.c,
    ).toBe(beforeTransitions);
  });

  it("produces byte-identical fingerprints for byte-identical replay inputs", () => {
    const mappingsA = [
      {
        mapping: {
          id: "mapping_a_node_a",
          attempt_id: "a1",
          node_id: NODE_ID_A,
          role: "primary" as const,
          mapping_reason: "manual_completion",
          created_at: "2026-07-17T00:00:00.000Z",
        },
        attempt: {
          id: "a1",
          revision: 1,
          result: "passed" as const,
          voided: false,
          startedAt: "2026-07-10T00:00:00.000Z",
          canonicalProblemId: "atcoder-practice-1",
        },
      },
      {
        mapping: {
          id: "mapping_a_node_b",
          attempt_id: "a2",
          node_id: NODE_ID_B,
          role: "primary" as const,
          mapping_reason: "manual_completion",
          created_at: "2026-07-17T00:00:00.000Z",
        },
        attempt: {
          id: "a2",
          revision: 1,
          result: "passed" as const,
          voided: false,
          startedAt: "2026-07-18T00:00:00.000Z",
          canonicalProblemId: "atcoder-abc086-a",
        },
      },
    ];
    const mappingsB = mappingsA.map((entry) => ({
      mapping: { ...entry.mapping },
      attempt: { ...entry.attempt },
    }));

    const fingerprintA = computeInputFingerprint({
      learnerId: LEARNER,
      mappings: mappingsA,
      nodeIds: [NODE_ID_A, NODE_ID_B],
      now: "2026-07-20T00:00:00.000Z",
    });
    const fingerprintB = computeInputFingerprint({
      learnerId: LEARNER,
      mappings: mappingsB,
      nodeIds: [NODE_ID_A, NODE_ID_B],
      now: "2026-07-20T00:00:00.000Z",
    });
    expect(fingerprintA).toBe(fingerprintB);
    expect(fingerprintA).toMatch(/^[a-f0-9]{64}$/);
  });
});

describe("wrapWithReprojection revision-event audit trail", () => {
  it("records an attempt_corrected revision event when an active plan snapshot exists", async () => {
    const { db } = openImportedDb();
    const planId = "plan_seed_reproj";
    const snapshotId = "daily_seed_reproj";
    db.prepare(
      `INSERT INTO learning_plans (
         id, learner_id, generator_version, snapshot_json, status, created_at
       ) VALUES (
         @id, @learnerId, @version, @snapshot, @status, @createdAt
       )`,
    ).run({
      id: planId,
      learnerId: LEARNER,
      version: "v0-plan-generator-1",
      snapshot: "{}",
      status: "active",
      createdAt: "2026-07-17T00:00:00.000Z",
    });
    db.prepare(
      `INSERT INTO daily_plan_snapshots (
         id, learning_plan_id, local_date, effort_boundary_minutes, daily_mode,
         generator_version, supersedes_daily_plan_id, created_at
       ) VALUES (
         @id, @learningPlanId, @localDate, @effortBoundaryMinutes, @dailyMode,
         @generatorVersion, @supersedesDailyPlanId, @createdAt
       )`,
    ).run({
      id: snapshotId,
      learningPlanId: planId,
      localDate: "2026-07-17",
      effortBoundaryMinutes: 30,
      dailyMode: "learn",
      generatorVersion: "v0-plan-generator-1",
      supersedesDailyPlanId: null,
      createdAt: "2026-07-17T00:00:00.000Z",
    });
    seedPlanRevisionEvent(db, snapshotId, "initial_plan", "fp_seed_initial");

    const attemptId = "manual_reproj_revision";
    createManualAttempt(db, {
      platform: "atcoder",
      problemExternalId: "practice_1",
      problemTitle: "Practice 1",
      startedAt: "2026-07-17T01:00:00.000Z",
      endedAt: "2026-07-17T01:15:00.000Z",
      result: "passed",
    }, {
      id: () => attemptId,
      now: () => "2026-07-17T01:16:00.000Z",
    });
    seedMapping(db, attemptId, NODE_ID_A, "primary", "manual_completion");

    const corrected = await wrapWithReprojection(
      db,
      "attempt_corrected",
      () =>
        correctAttempt(db, attemptId, {
          expectedRevision: 1,
          reason: "Second-pass attempt.",
          changes: { result: "failed" },
        }, { now: () => "2026-07-17T01:30:00.000Z" }),
      LEARNER,
      attemptId,
      { now: () => "2026-07-17T01:30:00.000Z" },
    );
    expect(corrected.revision).toBe(2);

    const eventRow = db
      .prepare<[], RevisionRow>(
        `SELECT event_type, before_daily_plan_id, after_daily_plan_id,
                input_fingerprint
           FROM plan_revision_events
          WHERE event_type = 'attempt_corrected'
          ORDER BY created_at DESC, id DESC
          LIMIT 1`,
      )
      .get();
    expect(eventRow?.event_type).toBe("attempt_corrected");
    expect(eventRow?.before_daily_plan_id).toBe(snapshotId);
    expect(eventRow?.after_daily_plan_id).toBe(snapshotId);
    expect(eventRow?.input_fingerprint).toMatch(/^[a-f0-9]{64}$/);
  });
});