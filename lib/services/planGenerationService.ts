import type Database from "better-sqlite3";
import {
  createDailySnapshot,
  createLearningPlan,
  insertPlanItem,
  recordRevisionEvent,
} from "@/lib/repositories/plans";
import {
  generatePlan,
  PLAN_GENERATOR_VERSION,
  type PlanGeneratorInput,
} from "@/lib/services/planGenerator";
import type { PlanItemRole } from "@/lib/domain/plan";

/**
 * V0 transactional persistence wrapper around `generatePlan`.
 *
 * The pure generator returns a planning intent. This module is the only
 * place that opens the SQLite transaction, creates the learning plan +
 * daily snapshot + plan items + revision event, and returns the row ids
 * the caller can show in the UI. All-or-nothing semantics: any
 * individual `INSERT` failure rolls the entire transaction back.
 *
 * Daily mode and effort are propagated from the input to the snapshot.
 * The revision event is always `initial_plan` because the layer above
 * (Todo 14, 15) decides which event type a planning replay actually
 * represents; this service intentionally exposes only the first commit.
 */

export type PersistedPlan = {
  readonly planId: string;
  readonly snapshotId: string;
  readonly itemIds: readonly string[];
  readonly primaryTaskId: string;
  readonly isFallback: boolean;
};

export function generateAndPersistPlan(
  db: Database.Database,
  input: PlanGeneratorInput,
): PersistedPlan {
  const plan = generatePlan(input);
  return db.transaction((): PersistedPlan => {
    const learningPlan = createLearningPlan(
      db,
      input.learnerId,
      PLAN_GENERATOR_VERSION,
      JSON.stringify({}),
      {},
    );

    const snapshot = createDailySnapshot(
      db,
      learningPlan.id,
      input.localDate,
      input.effortBoundaryMinutes,
      input.dailyMode,
      PLAN_GENERATOR_VERSION,
      null,
      {},
    );

    const itemIds: string[] = [];
    const primaryRow = insertPlanItem(
      db,
      snapshot.id,
      plan.primary.taskId,
      plan.primary.nodeId,
      "primary",
      0,
      JSON.stringify(plan.primary.reasonCodes),
      {},
    );
    itemIds.push(primaryRow.id);

    let rank = 1;
    type AlternativeRole = Exclude<PlanItemRole, "primary">;
    const alternativeRoles: readonly AlternativeRole[] = [
      "warmup",
      "same_goal_alternative",
      "weakness_review",
    ];
    for (const role of alternativeRoles) {
      const alternative = plan.alternatives[role];
      if (alternative === undefined) continue;
      insertPlanItem(
        db,
        snapshot.id,
        alternative.taskId,
        alternative.nodeId,
        role,
        rank,
        JSON.stringify(alternative.reasonCodes),
        {},
      );
      rank += 1;
    }

    recordRevisionEvent(
      db,
      null,
      snapshot.id,
      "initial_plan",
      input.inputFingerprint,
      {},
    );

    return {
      planId: learningPlan.id,
      snapshotId: snapshot.id,
      itemIds,
      primaryTaskId: plan.primary.taskId,
      isFallback: plan.isFallback,
    };
  })();
}
