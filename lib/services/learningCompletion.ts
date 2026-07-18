import { randomUUID } from "node:crypto";
import type Database from "better-sqlite3";
import { z } from "zod";
import { AbilityLevelSchema } from "@/lib/domain/ability";
import { type AttemptResult, AttemptResultSchema } from "@/lib/domain/training";
import { LOCAL_DEFAULT_LEARNER_ID } from "@/lib/domain/learner";
import {
  type DailyMode,
  type PlanItemRole,
  PlanItemRoleSchema,
} from "@/lib/domain/plan";
import { PlatformSchema, type Platform } from "@/lib/domain/source";
import {
  insertAbilityTransition,
  listAttemptNodeMappings,
  upsertAbilitySnapshot,
} from "@/lib/repositories/ability";
import {
  appendFeedback,
} from "@/lib/repositories/plans";
import { createManualAttempt } from "@/lib/services/manualAttempts";
import {
  PROJECTOR_VERSION,
  projectAbility,
  type AbilityTransition,
  type ProjectorInput,
} from "@/lib/services/abilityProjector";
import { explainLevel, type Explanation } from "@/lib/services/evidenceExplanation";
import { regenerateDailyPlan } from "@/lib/services/planRegeneration";

/**
 * V0 atomic plan-item completion service (Todo 15).
 *
 * The completion loop is the heart of the offline V0 vertical slice: a
 * single SQLite transaction must commit exactly one manual attempt, one
 * attempt-node mapping, the completed feedback row, the replayed ability
 * snapshot, the resulting transition, one successor daily-plan snapshot
 * and one revision event — or none of them, if any step fails.
 *
 * Lookup is across every daily-plan snapshot (including superseded
 * ones) so the replay path can return the original attempt id even when
 * the original snapshot has already been superseded. New completions
 * require the plan item to belong to the latest snapshot for the
 * learner; stale items return `{ ok: false, error: ... }` so the API
 * layer can translate that into HTTP 409.
 *
 * The deterministic attempt id `manual_plan_<planItemId>` makes the
 * UNIQUE `(plan_item_id, action)` constraint on `task_feedback` and the
 * deterministic `attempt_id` reproducible for replay tests.
 */

const CompletionResultSchema = AttemptResultSchema;

export type CompletionResult = AttemptResult;

const CompleteRequestSchema = z.object({
  learnerId: z.string().min(1),
  dailyPlanItemId: z.string().min(1),
  result: CompletionResultSchema,
  language: z.string().trim().min(1).max(100).optional(),
  durationMinutes: z.number().int().nonnegative().max(10_080).optional(),
  reflection: z.string().trim().min(1).max(2000).optional(),
}).strict();

export type CompleteRequest = z.infer<typeof CompleteRequestSchema>;

export type CompleteExplanation = {
  readonly levelLabel: string;
  readonly confidenceLabel: "low" | "medium" | "high";
  readonly reasonCodes: readonly string[];
  readonly uncertainty: string;
  readonly nextEvidenceNeeded: string;
  readonly citedAttemptIds: readonly string[];
  readonly citedAttemptRevisions: readonly number[];
};

export type CompleteNextPlan = {
  readonly planId: string;
  readonly snapshotId: string;
};

export type CompleteResponse =
  | {
      readonly ok: true;
      readonly replayed: false;
      readonly attemptId: string;
      readonly nodeId: string;
      readonly explanation: CompleteExplanation;
      readonly nextPlan: CompleteNextPlan;
    }
  | {
      readonly ok: true;
      readonly replayed: true;
      readonly attemptId: string;
    }
  | { readonly ok: false; readonly error: string };

type PracticeContext = {
  readonly taskStableId: string;
  readonly platform: Platform;
  readonly externalId: string;
  readonly title: string;
  readonly canonicalUrl: string | null;
  readonly canonicalProblemId: string;
};

type PlanItemContext = {
  readonly planItemId: string;
  readonly learnerId: string;
  readonly learningPlanId: string;
  readonly snapshotId: string;
  readonly practiceTaskId: string;
  readonly nodeId: string;
  readonly role: PlanItemRole;
  readonly dailyMode: DailyMode;
  readonly localDate: string;
  readonly effortBoundaryMinutes: 15 | 30 | 60 | 90;
  readonly practice: PracticeContext;
  readonly isLatestSnapshot: boolean;
};

type PreviousSnapshot = {
  readonly visibleLevel: z.infer<typeof AbilityLevelSchema>;
  readonly confidence: Explanation["confidenceLabel"];
  readonly evidenceCount: number;
};

function loadPlanItemContext(
  db: Database.Database,
  planItemId: string,
  learnerId: string,
): PlanItemContext | null {
  type ItemRow = {
    readonly plan_item_id: string;
    readonly daily_plan_id: string;
    readonly practice_task_id: string;
    readonly node_id: string;
    readonly role: string;
    readonly learner_id: string;
    readonly learning_plan_id: string;
    readonly daily_mode: string;
    readonly local_date: string;
    readonly effort_boundary_minutes: number;
  };
  type TaskRow = {
    readonly id: string;
    readonly stable_id: string;
    readonly canonical_problem_id: string;
    readonly title: string;
    readonly platform: string;
    readonly external_id: string;
    readonly primary_url: string;
  };

  const item = db
    .prepare<[string], ItemRow>(
      `SELECT pi.id           AS plan_item_id,
              pi.daily_plan_id AS daily_plan_id,
              pi.practice_task_id AS practice_task_id,
              pi.node_id      AS node_id,
              pi.role         AS role,
              s.learning_plan_id AS learning_plan_id,
              lp.learner_id   AS learner_id,
              s.daily_mode    AS daily_mode,
              s.local_date    AS local_date,
              s.effort_boundary_minutes AS effort_boundary_minutes
         FROM plan_items pi
         JOIN daily_plan_snapshots s ON s.id = pi.daily_plan_id
         JOIN learning_plans lp ON lp.id = s.learning_plan_id
        WHERE pi.id = ?
        LIMIT 1`,
    )
    .get(planItemId);
  if (item === undefined) return null;
  if (item.learner_id !== learnerId) return null;

  const latest = db
    .prepare<[string], { readonly id: string }>(
      `SELECT id FROM daily_plan_snapshots
        WHERE learning_plan_id = ?
        ORDER BY created_at DESC, id DESC
        LIMIT 1`,
    )
    .get(item.learning_plan_id);
  const isLatestSnapshot = latest !== undefined
    && latest.id === item.daily_plan_id;

  const task = db
    .prepare<[string], TaskRow>(
      `SELECT pt.id, pt.stable_id, pt.canonical_problem_id, pt.title,
              cp.platform, cp.external_id, cp.url AS primary_url
         FROM practice_tasks pt
         JOIN canonical_problem_sources cp
           ON cp.canonical_problem_id = pt.canonical_problem_id
          AND cp.is_primary = 1
        WHERE pt.id = ?
        LIMIT 1`,
    )
    .get(item.practice_task_id);
  if (task === undefined) return null;

  return {
    planItemId,
    learnerId,
    learningPlanId: item.learning_plan_id,
    snapshotId: item.daily_plan_id,
    practiceTaskId: item.practice_task_id,
    nodeId: item.node_id,
    role: PlanItemRoleSchema.parse(item.role),
    dailyMode: z.enum(["learn", "practice", "recover"]).parse(item.daily_mode),
    localDate: item.local_date,
    effortBoundaryMinutes: z.union([
      z.literal(15),
      z.literal(30),
      z.literal(60),
      z.literal(90),
    ]).parse(item.effort_boundary_minutes),
    practice: {
      taskStableId: task.stable_id,
      platform: PlatformSchema.parse(task.platform),
      externalId: task.external_id,
      title: task.title,
      canonicalUrl: task.primary_url,
      canonicalProblemId: task.canonical_problem_id,
    },
    isLatestSnapshot,
  };
}

function findCompletedFeedbackRow(
  db: Database.Database,
  planItemId: string,
): { readonly attempt_id: string | null } | null {
  type Row = { readonly attempt_id: string | null };
  const row = db
    .prepare<[string], Row>(
      `SELECT attempt_id
         FROM task_feedback
        WHERE plan_item_id = ? AND action = 'completed'
        LIMIT 1`,
    )
    .get(planItemId);
  return row === undefined ? null : row;
}

function collectPreviousSnapshots(
  db: Database.Database,
  learnerId: string,
): Map<string, PreviousSnapshot> {
  const map = new Map<string, PreviousSnapshot>();
  type Row = {
    readonly node_id: string;
    readonly visible_level: string;
    readonly confidence: string;
    readonly evidence_count: number;
  };
  const rows = db
    .prepare<[string], Row>(
      `SELECT node_id, visible_level, confidence, evidence_count
         FROM ability_snapshots
        WHERE learner_id = ?
        ORDER BY node_id ASC`,
    )
    .all(learnerId);
  for (const row of rows) {
    map.set(row.node_id, {
      visibleLevel: AbilityLevelSchema.parse(row.visible_level),
      confidence: z.enum(["low", "medium", "high"]).parse(row.confidence),
      evidenceCount: row.evidence_count,
    });
  }
  return map;
}

function buildExplanation(
  level: z.infer<typeof AbilityLevelSchema>,
  confidence: Explanation["confidenceLabel"],
  transition: AbilityTransition | null,
): CompleteExplanation {
  const explanation = transition === null
    ? explainLevel(level, confidence, [], [], [])
    : explainLevel(
        level,
        confidence,
        transition.reasonCodes,
        transition.sourceAttemptIds,
        transition.sourceAttemptRevisions,
      );
  return {
    levelLabel: explanation.levelLabel,
    confidenceLabel: explanation.confidenceLabel,
    reasonCodes: [...explanation.reasonCodes],
    uncertainty: explanation.uncertainty,
    nextEvidenceNeeded: explanation.nextEvidenceNeeded,
    citedAttemptIds: [...explanation.citedAttemptIds],
    citedAttemptRevisions: [...explanation.citedAttemptRevisions],
  };
}

/**
 * Complete one V0 daily-plan item atomically.
 *
 * Steps performed inside one SQLite transaction:
 *
 *   1. Validate the request.
 *   2. Resolve the plan item across every daily-plan snapshot. A
 *      missing item or a learner mismatch returns `{ ok: false }`.
 *   3. If `task_feedback` already contains a `completed` row for the
 *      same item, return `replayed: true` with the original attempt id
 *      and do not touch any other table.
 *   4. Reject non-latest snapshots for fresh completions (new
 *      completions may not target superseded plans).
 *   5. Create the manual attempt (deterministic id
 *      `manual_plan_<planItemId>`), insert the `primary`
 *      `attempt_node_mappings` row, replay every affected node through
 *      the projector, upsert the resulting snapshot (inserting one
 *      transition row only when the level changed), append the
 *      `completed` feedback row referencing the attempt id, create the
 *      successor daily-plan snapshot that
 *      `supersedes_daily_plan_id`-points at the prior snapshot, and
 *      record an `item_completed` revision event.
 */
export function completePlanItem(
  db: Database.Database,
  request: CompleteRequest,
): CompleteResponse {
  const parsed = CompleteRequestSchema.parse(request);
  const learnerId = parsed.learnerId;
  const planItemId = parsed.dailyPlanItemId;

  // Replay check outside the transaction: the SQL UNIQUE constraint on
  // (plan_item_id, action) gives the same guarantee, but pre-checking
  // avoids opening a transaction when the result is a cheap read.
  const replay = findCompletedFeedbackRow(db, planItemId);
  if (replay !== null && replay.attempt_id !== null) {
    return { ok: true, replayed: true, attemptId: replay.attempt_id };
  }

  const context = loadPlanItemContext(db, planItemId, learnerId);
  if (context === null) {
    return { ok: false, error: "Plan item not found" };
  }
  if (!context.isLatestSnapshot) {
    return { ok: false, error: "Plan item no longer belongs to the latest snapshot" };
  }
  if (context.role !== "primary") {
    return { ok: false, error: "Only the primary plan item can be completed" };
  }
  if (parsed.result === "draft") {
    return { ok: false, error: "Draft attempts cannot be recorded as plan completion" };
  }

  const mappingId = `mapping_${randomUUID()}`;
  const nowMs = Date.now();
  const nowIso = new Date(nowMs).toISOString();
  const attemptId = `manual_plan_${planItemId}`;

  const transaction = db.transaction((): CompleteResponse => {
    // Re-check inside the transaction so two concurrent requests do
    // not both believe they are creating the first completion.
    const concurrentReplay = findCompletedFeedbackRow(db, planItemId);
    if (concurrentReplay !== null && concurrentReplay.attempt_id !== null) {
      return { ok: true, replayed: true, attemptId: concurrentReplay.attempt_id };
    }

    createManualAttempt(
      db,
      {
        platform: context.practice.platform,
        problemExternalId: context.practice.externalId,
        problemTitle: context.practice.title,
        canonicalUrl: context.practice.canonicalUrl ?? undefined,
        startedAt: nowIso,
        endedAt: nowIso,
        result: parsed.result,
        language: parsed.language,
        durationMinutes: parsed.durationMinutes,
        reflection: parsed.reflection,
      },
      { id: () => attemptId, now: () => nowIso },
    );

    db.prepare(
      `INSERT INTO attempt_node_mappings (
         id, attempt_id, node_id, role, mapping_reason, created_at
       ) VALUES (
         @id, @attemptId, @nodeId, @role, @mappingReason, @createdAt
       )`,
    ).run({
      id: mappingId,
      attemptId,
      nodeId: context.nodeId,
      role: "primary",
      mappingReason: `plan_completion:${planItemId}`,
      createdAt: nowIso,
    });

    const mappingRows = listAttemptNodeMappings(db, learnerId);
    const previousSnapshots = collectPreviousSnapshots(db, learnerId);

    const nodeIdSet = new Set<string>([
      ...mappingRows.map((entry) => entry.mapping.node_id),
      context.nodeId,
    ]);
    const nodeIds = [...nodeIdSet].sort();

    const projection = projectAbility({
      learnerId,
      mappings: mappingRows,
      nodeIds,
      previousSnapshots,
      now: nowIso,
    } satisfies ProjectorInput);

    for (const [nodeId, projectionRow] of projection.perNode) {
      upsertAbilitySnapshot(db, {
        learner_id: learnerId,
        node_id: nodeId,
        visible_level: projectionRow.visibleLevel,
        confidence: projectionRow.confidence,
        evidence_count: projectionRow.evidenceCount,
        stale: projectionRow.stale,
        input_fingerprint: projection.inputFingerprint,
        projection_version: PROJECTOR_VERSION,
        as_of_time: nowIso,
      });
    }

    const transitionForNode = projection.transitions.find(
      (entry) => entry.nodeId === context.nodeId,
    ) ?? null;

    const projectionForNode = projection.perNode.get(context.nodeId);
    if (projectionForNode === undefined) {
      throw new RangeError(
        `Projector did not return a row for the completed node '${context.nodeId}'`,
      );
    }

    for (const transition of projection.transitions) {
      try {
        insertAbilityTransition(db, {
          learner_id: learnerId,
          node_id: transition.nodeId,
          previous_level: transition.previousLevel,
          new_level: transition.newLevel,
          reason_codes: transition.reasonCodes,
          source_attempt_ids: transition.sourceAttemptIds,
          source_attempt_revisions: transition.sourceAttemptRevisions,
          input_fingerprint: projection.inputFingerprint,
          projection_version: PROJECTOR_VERSION,
          created_at: nowIso,
        });
      } catch (error) {
        if (
          error instanceof RangeError
          && /already exists/.test(error.message)
        ) {
          // Duplicate fingerprint → idempotent replay; ignore.
          continue;
        }
        throw error;
      }
    }

    const explanation = buildExplanation(
      projectionForNode.visibleLevel,
      projectionForNode.confidence,
      transitionForNode,
    );

    const successor = regenerateDailyPlan(db, {
      learnerId,
      learningPlanId: context.learningPlanId,
      beforeSnapshotId: context.snapshotId,
      localDate: context.localDate,
      effortBoundaryMinutes: context.effortBoundaryMinutes,
      dailyMode: context.dailyMode,
      eventType: "item_completed",
      inputFingerprint: projection.inputFingerprint,
      now: nowIso,
      additionalRecentCompletionTaskId: context.practice.taskStableId,
    });

    appendFeedback(db, planItemId, "completed", {
      now: () => nowIso,
      attemptId,
      reasonCode: null,
      reasonText: null,
      successorDailyPlanId: successor.snapshotId,
    });

    return {
      ok: true,
      replayed: false,
      attemptId,
      nodeId: context.nodeId,
      explanation,
      nextPlan: {
        planId: context.learningPlanId,
        snapshotId: successor.snapshotId,
      },
    };
  });
  return transaction();
}

export { LOCAL_DEFAULT_LEARNER_ID };
