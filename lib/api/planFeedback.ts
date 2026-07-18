import type Database from "better-sqlite3";
import {
  type EffortBoundaryMinutes,
  type PlanRevisionEventType,
  type SkipReasonCode,
} from "@/lib/domain/plan";
import {
  appendFeedback,
  findActivePlan,
  findLatestDailySnapshot,
} from "@/lib/repositories/plans";
import { regenerateDailyPlan } from "@/lib/services/planRegeneration";

export type ApplyFeedbackInput = {
  readonly planItemId: string;
  readonly learnerId: string;
  readonly action: "accepted" | "started" | "skipped";
  readonly reasonCode?: SkipReasonCode;
  readonly reasonText: string | null;
  readonly effortBoundaryMinutes?: EffortBoundaryMinutes;
};

export type ApplyFeedbackResponse =
  | {
      readonly ok: true;
      readonly feedbackId: string;
      readonly replayed: boolean;
      readonly snapshotId: string | null;
      readonly revisionEventType: PlanRevisionEventType | null;
    }
  | { readonly ok: false; readonly error: string };

type PlanItemLookupRow = {
  readonly plan_item_id: string;
  readonly daily_plan_id: string;
  readonly learner_id: string;
  readonly learning_plan_id: string;
  readonly local_date: string;
  readonly daily_mode: string;
  readonly effort_boundary_minutes: number;
  readonly practice_task_stable_id: string;
};

function lookupPlanItem(
  db: Database.Database,
  planItemId: string,
  learnerId: string,
): PlanItemLookupRow | null {
  const row = db
    .prepare<[string], PlanItemLookupRow>(
      `SELECT pi.id           AS plan_item_id,
              pi.daily_plan_id AS daily_plan_id,
              lp.learner_id   AS learner_id,
              lp.id           AS learning_plan_id,
              s.local_date    AS local_date,
              s.daily_mode    AS daily_mode,
              s.effort_boundary_minutes AS effort_boundary_minutes
              , task.stable_id AS practice_task_stable_id
         FROM plan_items pi
         JOIN daily_plan_snapshots s ON s.id = pi.daily_plan_id
         JOIN learning_plans lp ON lp.id = s.learning_plan_id
         JOIN practice_tasks task ON task.id = pi.practice_task_id
        WHERE pi.id = ?
        LIMIT 1`,
    )
    .get(planItemId);
  if (row === undefined) return null;
  if (row.learner_id !== learnerId) return null;
  return row;
}

function findExistingFeedback(
  db: Database.Database,
  planItemId: string,
  action: "accepted" | "started" | "skipped",
): {
  readonly feedbackId: string;
  readonly successorDailyPlanId: string | null;
} | null {
  type Row = {
    readonly id: string;
    readonly successor_daily_plan_id: string | null;
  };
  const row = db
    .prepare<[string, string], Row>(
      `SELECT id, successor_daily_plan_id
         FROM task_feedback
        WHERE plan_item_id = ? AND action = ?
        LIMIT 1`,
    )
    .get(planItemId, action);
  if (row === undefined) return null;
  return {
    feedbackId: row.id,
    successorDailyPlanId: row.successor_daily_plan_id,
  };
}

/**
 * Pure persistence step. The handler is exported for unit-testability
 * without going through the HTTP layer.
 */
export function applyFeedback(
  db: Database.Database,
  input: ApplyFeedbackInput,
): ApplyFeedbackResponse {
  const item = lookupPlanItem(db, input.planItemId, input.learnerId);
  if (item === null) {
    return { ok: false, error: "Plan item not found" };
  }

  const existing = findExistingFeedback(db, input.planItemId, input.action);
  if (existing !== null) {
    return {
      ok: true,
      feedbackId: existing.feedbackId,
      replayed: true,
      snapshotId: existing.successorDailyPlanId,
      revisionEventType: null,
    };
  }

  const activePlan = findActivePlan(db, input.learnerId);
  if (activePlan === null) {
    return { ok: false, error: "Learning plan not found" };
  }
  if (activePlan.id !== item.learning_plan_id) {
    return { ok: false, error: "Plan item belongs to a superseded plan" };
  }

  const currentSnapshot = findLatestDailySnapshot(db, activePlan.id);
  if (currentSnapshot === null) {
    return { ok: false, error: "Learning plan not found" };
  }

  const shouldResnapshot =
    input.action === "skipped"
    || (
      input.effortBoundaryMinutes !== undefined
      && input.effortBoundaryMinutes !== currentSnapshot.effortBoundaryMinutes
    );

  const revisionEventType: PlanRevisionEventType | null = input.action === "skipped"
    ? "item_skipped"
    : input.effortBoundaryMinutes !== undefined
    && input.effortBoundaryMinutes !== currentSnapshot.effortBoundaryMinutes
    ? "effort_changed"
    : null;

  const result = db.transaction((): ApplyFeedbackResponse => {
    // Re-check inside the transaction to handle concurrent requests.
    const concurrent = findExistingFeedback(db, input.planItemId, input.action);
    if (concurrent !== null) {
      return {
        ok: true,
        feedbackId: concurrent.feedbackId,
        replayed: true,
        snapshotId: concurrent.successorDailyPlanId,
        revisionEventType: null,
      };
    }

    let successorSnapshotId: string | null = null;
    if (shouldResnapshot && revisionEventType !== null) {
      const nextEffort: EffortBoundaryMinutes =
        input.effortBoundaryMinutes ?? currentSnapshot.effortBoundaryMinutes;
      const now = new Date().toISOString();
      const successor = regenerateDailyPlan(db, {
        learnerId: input.learnerId,
        learningPlanId: activePlan.id,
        beforeSnapshotId: currentSnapshot.id,
        localDate: currentSnapshot.localDate,
        effortBoundaryMinutes: nextEffort,
        dailyMode: currentSnapshot.dailyMode,
        eventType: revisionEventType,
        inputFingerprint: `feedback:${input.action}:${input.planItemId}:${nextEffort}`,
        now,
        additionalRecentlySkippedTaskId:
          input.action === "skipped" ? item.practice_task_stable_id : undefined,
      });
      successorSnapshotId = successor.snapshotId;
    }

    const feedback = appendFeedback(db, input.planItemId, input.action, {
      reasonCode: input.reasonCode ?? null,
      reasonText: input.reasonText,
      successorDailyPlanId: successorSnapshotId,
    });

    return {
      ok: true,
      feedbackId: feedback.id,
      replayed: false,
      snapshotId: successorSnapshotId,
      revisionEventType,
    };
  })();

  return result;
}
