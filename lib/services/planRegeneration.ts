import type Database from "better-sqlite3";
import { createHash } from "node:crypto";
import { AbilityLevelSchema, type AbilityLevel } from "@/lib/domain/ability";
import { DifficultyBandSchema, type DifficultyBand } from "@/lib/domain/curriculum";
import { BaselineLevelSchema, type BaselineLevel } from "@/lib/domain/learner";
import type {
  DailyMode,
  EffortBoundaryMinutes,
  PlanItemRole,
  PlanRevisionEventType,
} from "@/lib/domain/plan";
import {
  createDailySnapshot,
  insertPlanItem,
  recordRevisionEvent,
} from "@/lib/repositories/plans";
import {
  findKnowledgeNodeIdByStableId,
  findPracticeTaskIdByStableId,
} from "@/lib/repositories/curriculum";
import {
  generatePlan,
  PLAN_GENERATOR_VERSION,
  type PlanGeneratorInput,
} from "@/lib/services/planGenerator";
import type { PracticeTaskRef } from "@/lib/services/candidateTaskSelector";
import { parseLearningPlanSnapshot } from "@/lib/services/planSnapshot";

type RegenerateInput = {
  readonly learnerId: string;
  readonly learningPlanId: string;
  readonly beforeSnapshotId: string;
  readonly localDate: string;
  readonly effortBoundaryMinutes: EffortBoundaryMinutes;
  readonly dailyMode: DailyMode;
  readonly eventType: Exclude<PlanRevisionEventType, "initial_plan">;
  readonly inputFingerprint: string;
  readonly now: string;
  readonly additionalRecentlySkippedTaskId?: string;
  readonly additionalRecentCompletionTaskId?: string;
};

export type RegeneratedPlan = {
  readonly snapshotId: string;
  readonly primaryTaskStableId: string;
};

function buildGeneratorInput(
  db: Database.Database,
  input: RegenerateInput,
): PlanGeneratorInput {
  type NodeRow = {
    readonly stable_id: string;
    readonly order_index: number;
    readonly title: string;
  };
  type EdgeRow = {
    readonly from_stable_id: string;
    readonly to_stable_id: string;
  };
  type PracticeRow = {
    readonly node_stable_id: string;
    readonly practice_task_stable_id: string;
    readonly title: string;
    readonly difficulty_band: string;
  };
  type ResourceRow = {
    readonly node_stable_id: string;
    readonly review_status: string;
  };
  type BaselineRow = { readonly node_stable_id: string; readonly baseline: string };
  type AbilityRow = { readonly node_stable_id: string; readonly visible_level: string };
  type TaskIdRow = { readonly practice_task_stable_id: string; readonly completed_at: string };
  type PlanSnapshotRow = { readonly snapshot_json: string };

  const nodes = db.prepare<[], NodeRow>(
    `SELECT stable_id, order_index, title
       FROM knowledge_nodes
      WHERE status = 'published'
      ORDER BY order_index ASC, stable_id ASC`,
  ).all();
  const edges = db.prepare<[], EdgeRow>(
    `SELECT from_node.stable_id AS from_stable_id,
            to_node.stable_id AS to_stable_id
       FROM knowledge_edges edge
       JOIN knowledge_nodes from_node ON from_node.id = edge.from_node_id
       JOIN knowledge_nodes to_node ON to_node.id = edge.to_node_id
      WHERE edge.edge_type = 'required_prerequisite'
      ORDER BY from_node.stable_id ASC, to_node.stable_id ASC`,
  ).all();
  const practiceRows = db.prepare<[], PracticeRow>(
    `SELECT node.stable_id AS node_stable_id,
            task.stable_id AS practice_task_stable_id,
            task.title,
            task.difficulty_band
       FROM node_practice_mappings mapping
       JOIN knowledge_nodes node ON node.id = mapping.node_id
       JOIN practice_tasks task ON task.id = mapping.practice_task_id
      ORDER BY node.stable_id ASC, mapping.sort_order ASC, task.stable_id ASC`,
  ).all();
  const resourceRows = db.prepare<[], ResourceRow>(
    `SELECT node.stable_id AS node_stable_id,
            resource.review_status
       FROM node_resources mapping
       JOIN knowledge_nodes node ON node.id = mapping.node_id
       JOIN learning_resources resource ON resource.id = mapping.resource_id
      WHERE mapping.role = 'primary'
      ORDER BY node.stable_id ASC`,
  ).all();

  const practicesByNode = new Map<string, Array<{
    readonly stable_id: string;
    readonly title: string;
    readonly difficulty_band: DifficultyBand;
  }>>();
  for (const row of practiceRows) {
    const list = practicesByNode.get(row.node_stable_id) ?? [];
    list.push({
      stable_id: row.practice_task_stable_id,
      title: row.title,
      difficulty_band: DifficultyBandSchema.parse(row.difficulty_band),
    });
    practicesByNode.set(row.node_stable_id, list);
  }
  const resourcesByNode = new Map<string, { readonly review_status: string }>();
  for (const row of resourceRows) {
    resourcesByNode.set(row.node_stable_id, { review_status: row.review_status });
  }

  const baselinesByNode: Record<string, BaselineLevel | undefined> = {};
  for (const row of db.prepare<[string], BaselineRow>(
    `SELECT node.stable_id AS node_stable_id, baseline.baseline
       FROM learner_node_baselines baseline
       JOIN knowledge_nodes node ON node.id = baseline.node_id
      WHERE baseline.learner_id = ?`,
  ).all(input.learnerId)) {
    baselinesByNode[row.node_stable_id] = BaselineLevelSchema.parse(row.baseline);
  }

  const abilitiesByNode: Record<string, AbilityLevel | undefined> = {};
  for (const row of db.prepare<[string], AbilityRow>(
    `SELECT node.stable_id AS node_stable_id, ability.visible_level
       FROM ability_snapshots ability
       JOIN knowledge_nodes node ON node.id = ability.node_id
      WHERE ability.learner_id = ?`,
  ).all(input.learnerId)) {
    abilitiesByNode[row.node_stable_id] = AbilityLevelSchema.parse(row.visible_level);
  }

  const recentlySkipped = db.prepare<[string], { readonly practice_task_stable_id: string }>(
    `SELECT task.stable_id AS practice_task_stable_id
       FROM task_feedback feedback
       JOIN plan_items item ON item.id = feedback.plan_item_id
       JOIN daily_plan_snapshots snapshot ON snapshot.id = item.daily_plan_id
       JOIN learning_plans plan ON plan.id = snapshot.learning_plan_id
       JOIN practice_tasks task ON task.id = item.practice_task_id
      WHERE plan.learner_id = ? AND feedback.action = 'skipped'
      ORDER BY feedback.created_at DESC
      LIMIT 20`,
  ).all(input.learnerId).map((row) => row.practice_task_stable_id);
  if (input.additionalRecentlySkippedTaskId !== undefined) {
    recentlySkipped.unshift(input.additionalRecentlySkippedTaskId);
  }

  const recentCompletions = db.prepare<[string], TaskIdRow>(
    `SELECT practice_task_stable_id, completed_at
       FROM (
         SELECT task.stable_id AS practice_task_stable_id,
                feedback.created_at AS completed_at
           FROM task_feedback feedback
           JOIN plan_items item ON item.id = feedback.plan_item_id
           JOIN daily_plan_snapshots snapshot ON snapshot.id = item.daily_plan_id
           JOIN learning_plans plan ON plan.id = snapshot.learning_plan_id
           JOIN practice_tasks task ON task.id = item.practice_task_id
           JOIN training_attempts attempt ON attempt.id = feedback.attempt_id
          WHERE plan.learner_id = ?
            AND feedback.action = 'completed'
            AND attempt.result = 'passed'
            AND attempt.voided_at IS NULL
          ORDER BY feedback.created_at DESC, feedback.id DESC
          LIMIT 20
       ) recent
      ORDER BY completed_at ASC, practice_task_stable_id ASC`,
  ).all(input.learnerId).map((row) => ({
    practiceTaskId: row.practice_task_stable_id,
    completedAt: row.completed_at,
  }));
  if (input.additionalRecentCompletionTaskId !== undefined) {
    recentCompletions.push({
      practiceTaskId: input.additionalRecentCompletionTaskId,
      completedAt: input.now,
    });
  }

  const prerequisitesByNode: Record<string, readonly string[]> = {};
  for (const edge of edges) {
    prerequisitesByNode[edge.to_stable_id] = [
      ...(prerequisitesByNode[edge.to_stable_id] ?? []),
      edge.from_stable_id,
    ];
  }

  const planSnapshotRow = db.prepare<[string], PlanSnapshotRow>(
    "SELECT snapshot_json FROM learning_plans WHERE id = ?",
  ).get(input.learningPlanId);
  const planSnapshot = parseLearningPlanSnapshot(planSnapshotRow?.snapshot_json ?? "{}");

  const auditFingerprint = createHash("sha256")
    .update(JSON.stringify({
      trigger: input.inputFingerprint,
      learnerId: input.learnerId,
      nodes,
      edges,
      practices: practiceRows,
      resources: resourceRows,
      baselinesByNode,
      abilitiesByNode,
      recentlySkipped,
      recentCompletions,
      goalPrimaryNodeId: planSnapshot.goalPrimaryNodeId,
      goalInterestNodeIds: planSnapshot.goalInterestNodeIds,
      effortBoundaryMinutes: input.effortBoundaryMinutes,
      dailyMode: input.dailyMode,
      localDate: input.localDate,
    }))
    .digest("hex");

  return {
    learnerId: input.learnerId,
    nodes,
    edges,
    practicesByNode,
    resourcesByNode,
    prerequisitesByNode,
    baselinesByNode,
    abilitiesByNode,
    recentlySkipped,
    recentCompletions,
    goalPrimaryNodeId: planSnapshot.goalPrimaryNodeId,
    goalInterestNodeIds: planSnapshot.goalInterestNodeIds,
    effortBoundaryMinutes: input.effortBoundaryMinutes,
    dailyMode: input.dailyMode,
    localDate: input.localDate,
    inputFingerprint: auditFingerprint,
  };
}

export function regenerateDailyPlan(
  db: Database.Database,
  input: RegenerateInput,
): RegeneratedPlan {
  const baseGeneratorInput = buildGeneratorInput(db, input);
  const dueReview = findDueReviewTask(db, input.learnerId, input.now);
  const generatorInput: PlanGeneratorInput = {
    ...baseGeneratorInput,
    inputFingerprint: createHash("sha256").update(JSON.stringify({
      base: baseGeneratorInput.inputFingerprint,
      dueReview,
    })).digest("hex"),
  };
  const generated = generatePlan(generatorInput);
  const packageRow = db.prepare<[], { readonly id: string }>(
    "SELECT id FROM curriculum_packages ORDER BY installed_at DESC, id ASC LIMIT 1",
  ).get();
  if (packageRow === undefined) {
    throw new RangeError("Cannot regenerate daily plan without a curriculum package");
  }
  const successor = createDailySnapshot(
    db,
    input.learningPlanId,
    input.localDate,
    input.effortBoundaryMinutes,
    input.dailyMode,
    PLAN_GENERATOR_VERSION,
    input.beforeSnapshotId,
    { now: () => input.now },
  );

  const primaryTask = dueReview?.task.taskId === generated.primary.taskId
    ? { ...generated.primary, reasonCodes: dueReview.task.reasonCodes }
    : generated.primary;
  const weaknessReview = dueReview?.task.taskId === primaryTask.taskId
    ? undefined
    : dueReview?.task ?? generated.alternatives.weakness_review;
  const entries: ReadonlyArray<readonly [PlanItemRole, typeof generated.primary]> = [
    ["primary", primaryTask],
    ...(["weakness_review", "warmup", "same_goal_alternative"] as const)
      .flatMap((role) => {
        const task = role === "weakness_review"
          ? weaknessReview
          : generated.alternatives[role];
        return task === undefined ? [] : [[role, task] as const];
      }),
  ];
  let rank = 0;
  const includedTaskIds = new Set<string>();
  for (const [role, task] of entries) {
    if (includedTaskIds.has(task.taskId)) continue;
    includedTaskIds.add(task.taskId);
    const nodeId = findKnowledgeNodeIdByStableId(db, packageRow.id, task.nodeId);
    const practiceTaskId = findPracticeTaskIdByStableId(db, packageRow.id, task.taskId);
    if (nodeId === null || practiceTaskId === null) {
      throw new RangeError(`Generated task '${task.taskId}' is not installed`);
    }
    insertPlanItem(
      db,
      successor.id,
      practiceTaskId,
      nodeId,
      role,
      rank,
      JSON.stringify(task.reasonCodes),
      { now: () => input.now },
    );
    rank += 1;
  }
  recordRevisionEvent(
    db,
    input.beforeSnapshotId,
    successor.id,
    input.eventType,
    generatorInput.inputFingerprint,
    { now: () => input.now },
  );
  return { snapshotId: successor.id, primaryTaskStableId: primaryTask.taskId };
}

function findDueReviewTask(
  db: Database.Database,
  learnerId: string,
  asOf: string,
): { readonly reviewId: string; readonly task: PracticeTaskRef } | null {
  type Row = {
    readonly review_id: string;
    readonly task_id: string;
    readonly node_id: string;
    readonly title: string;
    readonly difficulty_band: string;
  };
  const row = db.prepare<[string, string], Row>(`
    SELECT review.id AS review_id, task.stable_id AS task_id,
           node.stable_id AS node_id, task.title, task.difficulty_band
    FROM review_items review
    JOIN practice_tasks task ON task.id = review.selected_practice_task_id
    JOIN knowledge_nodes node ON node.id = review.node_id
    WHERE review.learner_id = ? AND review.status = 'open' AND review.due_at <= ?
    ORDER BY review.priority DESC, review.due_at ASC, review.id ASC
    LIMIT 1
  `).get(learnerId, asOf);
  if (row !== undefined) return toNextEvidenceTask(row, "due_review");
  const assessment = db.prepare<[string], Row>(`
    SELECT assessment.id AS review_id, task.stable_id AS task_id,
           node.stable_id AS node_id, task.title, task.difficulty_band
    FROM learner_assessments assessment
    JOIN knowledge_nodes node ON node.id = assessment.node_id
    JOIN node_practice_mappings mapping ON mapping.node_id = assessment.node_id
    JOIN practice_tasks task ON task.id = mapping.practice_task_id
    WHERE assessment.learner_id = ? AND assessment.resolution = 'pending_verification'
    ORDER BY CASE assessment.kind WHEN 'dispute' THEN 0 ELSE 1 END,
             assessment.created_at DESC, mapping.sort_order ASC, task.id ASC
    LIMIT 1
  `).get(learnerId);
  return assessment === undefined ? null : toNextEvidenceTask(assessment, "assessment_verification");
}

function toNextEvidenceTask(
  row: {
    readonly review_id: string;
    readonly task_id: string;
    readonly node_id: string;
    readonly title: string;
    readonly difficulty_band: string;
  },
  reasonCode: "due_review" | "assessment_verification",
): { readonly reviewId: string; readonly task: PracticeTaskRef } {
  return {
    reviewId: row.review_id,
    task: {
      taskId: row.task_id,
      nodeId: row.node_id,
      title: row.title,
      difficultyBand: DifficultyBandSchema.parse(row.difficulty_band),
      reasonCodes: [reasonCode],
    },
  };
}
