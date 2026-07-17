import { randomUUID } from "node:crypto";
import type Database from "better-sqlite3";
import {
  DailyModeSchema,
  EffortBoundaryMinutesSchema,
  LearningPlanRowSchema,
  LearningPlanStatusSchema,
  DailyPlanSnapshotRowSchema,
  PlanItemRoleSchema,
  PlanItemRowSchema,
  PlanRevisionEventRowSchema,
  PlanRevisionEventTypeSchema,
  TaskFeedbackActionSchema,
  TaskFeedbackRowSchema,
  type DailyPlanSnapshotRow,
  type LearningPlanRow,
  type PlanItemRow,
  type PlanRevisionEventRow,
  type TaskFeedbackRow,
} from "@/lib/domain/plan";

/**
 * V0 learning-plan, daily-snapshot, plan-item, feedback, and revision
 * repository functions.
 *
 * Every function accepts a caller-owned SQLite handle and never opens or
 * closes it. The DB-handle rule comes from `AGENTS.md` and is enforced
 * by the repository-level tests; callers are expected to obtain their
 * handle from `lib/db/client.ts` and pass it in.
 *
 * Plan items are immutable: there is no UPDATE statement for the
 * `plan_items` table. `insertPlanItem` may be called more than once
 * for the same `(daily_plan_id, practice_task_id)` and will create a
 * distinct row each time; callers are responsible for not doing so if
 * they need exactly one row.
 *
 * Task feedback is append-only. The SQL UNIQUE constraint on
 * `(plan_item_id, action)` enforces idempotency at the persistence
 * boundary; the repository translates the resulting constraint
 * failure into a typed `RangeError`.
 *
 * Revision events are append-only too.
 */

type LearningPlanTableRow = {
  readonly id: string;
  readonly learner_id: string;
  readonly generator_version: string;
  readonly snapshot_json: string;
  readonly status: string;
  readonly created_at: string;
};

type DailySnapshotTableRow = {
  readonly id: string;
  readonly learning_plan_id: string;
  readonly local_date: string;
  readonly effort_boundary_minutes: number;
  readonly daily_mode: string;
  readonly generator_version: string;
  readonly supersedes_daily_plan_id: string | null;
  readonly created_at: string;
};

type PlanItemTableRow = {
  readonly id: string;
  readonly daily_plan_id: string;
  readonly practice_task_id: string;
  readonly node_id: string;
  readonly role: string;
  readonly rank: number;
  readonly reason_codes_json: string;
};

type TaskFeedbackTableRow = {
  readonly id: string;
  readonly plan_item_id: string;
  readonly action: string;
  readonly reason_code: string | null;
  readonly reason_text: string | null;
  readonly attempt_id: string | null;
  readonly successor_daily_plan_id: string | null;
  readonly created_at: string;
};

type RevisionEventTableRow = {
  readonly id: string;
  readonly before_daily_plan_id: string | null;
  readonly after_daily_plan_id: string;
  readonly event_type: string;
  readonly input_fingerprint: string;
  readonly created_at: string;
};

export type PlanClock = {
  readonly now?: () => string;
};

/**
 * Insert a new learning plan for the learner. If the learner already
 * has an `active` plan it is marked `superseded` first so the active
 * plan is always unique per learner; the new plan becomes the active
 * one. Returns the newly-inserted plan row.
 */
export function createLearningPlan(
  db: Database.Database,
  learnerId: string,
  generatorVersion: string,
  snapshotJson: string,
  options: PlanClock = {},
): LearningPlanRow {
  if (generatorVersion.length === 0) {
    throw new RangeError("generatorVersion must not be empty");
  }
  const now = (options.now ?? (() => new Date().toISOString()))();
  const transaction = db.transaction(() => {
    const active = findActivePlanRow(db, learnerId);
    if (active !== null) {
      supersedePlanRow(db, active.id);
    }
    const row: LearningPlanTableRow = {
      id: `plan_${randomUUID()}`,
      learner_id: learnerId,
      generator_version: generatorVersion,
      snapshot_json: snapshotJson,
      status: "active",
      created_at: now,
    };
    db.prepare(
      `INSERT INTO learning_plans (
         id, learner_id, generator_version, snapshot_json, status, created_at
       ) VALUES (
         @id, @learnerId, @generatorVersion, @snapshotJson, @status, @createdAt
       )`,
    ).run({
      id: row.id,
      learnerId: row.learner_id,
      generatorVersion: row.generator_version,
      snapshotJson: row.snapshot_json,
      status: row.status,
      createdAt: row.created_at,
    });
    return fromLearningPlanRow(row);
  });
  return transaction();
}

/**
 * Mark a learning plan as `superseded`. Plans already in that state
 * remain unchanged. No-op when the plan id does not exist.
 */
export function supersedePlan(db: Database.Database, planId: string): void {
  supersedePlanRow(db, planId);
}

/**
 * Return the active learning plan for the learner, or `null` when none
 * exists.
 */
export function findActivePlan(
  db: Database.Database,
  learnerId: string,
): LearningPlanRow | null {
  const row = findActivePlanRow(db, learnerId);
  return row === null ? null : fromLearningPlanRow(row);
}

/**
 * Insert a new daily plan snapshot. The caller may pass an existing
 * snapshot id to link the new snapshot as a successor (`supersedes`)
 * which lets the repository record the lineage without losing
 * immutability of the prior snapshot.
 */
export function createDailySnapshot(
  db: Database.Database,
  planId: string,
  localDate: string,
  effortBoundaryMinutes: DailyPlanSnapshotRow["effortBoundaryMinutes"],
  dailyMode: DailyPlanSnapshotRow["dailyMode"],
  generatorVersion: string,
  supersedesDailyPlanId: string | null = null,
  options: PlanClock = {},
): DailyPlanSnapshotRow {
  const parsedEffort = EffortBoundaryMinutesSchema.parse(effortBoundaryMinutes);
  const parsedMode = DailyModeSchema.parse(dailyMode);
  if (generatorVersion.length === 0) {
    throw new RangeError("generatorVersion must not be empty");
  }
  const now = (options.now ?? (() => new Date().toISOString()))();
  const row: DailySnapshotTableRow = {
    id: `daily_${randomUUID()}`,
    learning_plan_id: planId,
    local_date: localDate,
    effort_boundary_minutes: parsedEffort,
    daily_mode: parsedMode,
    generator_version: generatorVersion,
    supersedes_daily_plan_id: supersedesDailyPlanId,
    created_at: now,
  };
  db.prepare(
    `INSERT INTO daily_plan_snapshots (
       id, learning_plan_id, local_date, effort_boundary_minutes, daily_mode,
       generator_version, supersedes_daily_plan_id, created_at
     ) VALUES (
       @id, @learningPlanId, @localDate, @effortBoundaryMinutes, @dailyMode,
       @generatorVersion, @supersedesDailyPlanId, @createdAt
     )`,
  ).run({
    id: row.id,
    learningPlanId: row.learning_plan_id,
    localDate: row.local_date,
    effortBoundaryMinutes: row.effort_boundary_minutes,
    dailyMode: row.daily_mode,
    generatorVersion: row.generator_version,
    supersedesDailyPlanId: row.supersedes_daily_plan_id,
    createdAt: row.created_at,
  });
  return fromDailySnapshotRow(row);
}

/**
 * Return the most-recent daily plan snapshot for the learning plan
 * (by `created_at` descending then `id` descending for tie-breaks), or
 * `null` when the plan has no snapshots yet.
 */
export function findLatestDailySnapshot(
  db: Database.Database,
  planId: string,
): DailyPlanSnapshotRow | null {
  const row = db
    .prepare<[string], DailySnapshotTableRow>(
      `SELECT id, learning_plan_id, local_date, effort_boundary_minutes,
              daily_mode, generator_version, supersedes_daily_plan_id,
              created_at
         FROM daily_plan_snapshots
        WHERE learning_plan_id = ?
        ORDER BY created_at DESC, id DESC
        LIMIT 1`,
    )
    .get(planId);
  return row === undefined ? null : fromDailySnapshotRow(row);
}

/**
 * Insert an immutable plan item. There is intentionally no UPDATE
 * operation on `plan_items`; calling this function twice for the same
 * `(daily_plan_id, practice_task_id)` produces two distinct rows.
 */
export function insertPlanItem(
  db: Database.Database,
  dailyPlanId: string,
  practiceTaskId: string,
  nodeId: string,
  role: PlanItemRow["role"],
  rank: number,
  reasonCodesJson: string,
  options: PlanClock = {},
): PlanItemRow {
  const parsedRole = PlanItemRoleSchema.parse(role);
  if (!Number.isInteger(rank)) {
    throw new RangeError("rank must be an integer");
  }
  const now = (options.now ?? (() => new Date().toISOString()))();
  const row: PlanItemTableRow = {
    id: `item_${randomUUID()}`,
    daily_plan_id: dailyPlanId,
    practice_task_id: practiceTaskId,
    node_id: nodeId,
    role: parsedRole,
    rank,
    reason_codes_json: reasonCodesJson,
  };
  db.prepare(
    `INSERT INTO plan_items (
       id, daily_plan_id, practice_task_id, node_id, role, rank,
       reason_codes_json
     ) VALUES (
       @id, @dailyPlanId, @practiceTaskId, @nodeId, @role, @rank,
       @reasonCodesJson
     )`,
  ).run({
    id: row.id,
    dailyPlanId: row.daily_plan_id,
    practiceTaskId: row.practice_task_id,
    nodeId: row.node_id,
    role: row.role,
    rank: row.rank,
    reasonCodesJson: row.reason_codes_json,
  });
  void now;
  return fromPlanItemRow(row);
}

/**
 * Return every plan item for the daily snapshot, ordered by `rank`
 * ascending with `id` as a deterministic tie-breaker.
 */
export function listPlanItems(
  db: Database.Database,
  dailyPlanId: string,
): PlanItemRow[] {
  return db
    .prepare<[string], PlanItemTableRow>(
      `SELECT id, daily_plan_id, practice_task_id, node_id, role, rank,
              reason_codes_json
         FROM plan_items
        WHERE daily_plan_id = ?
        ORDER BY rank ASC, id ASC`,
    )
    .all(dailyPlanId)
    .map(fromPlanItemRow);
}

/**
 * Append a single feedback row for a plan item. The SQL UNIQUE
 * constraint on `(plan_item_id, action)` is enforced at the persistence
 * boundary; the repository surfaces that as a typed `RangeError` so
 * callers can distinguish the SQL-level failure from arbitrary runtime
 * errors.
 */
export function appendFeedback(
  db: Database.Database,
  planItemId: string,
  action: TaskFeedbackRow["action"],
  options: PlanClock & {
    readonly reasonCode?: TaskFeedbackRow["reasonCode"];
    readonly reasonText?: string | null;
    readonly attemptId?: string | null;
    readonly successorDailyPlanId?: string | null;
  } = {},
): TaskFeedbackRow {
  const parsedAction = TaskFeedbackActionSchema.parse(action);
  if (parsedAction === "skipped") {
    if (options.reasonCode === undefined || options.reasonCode === null) {
      throw new RangeError(
        "Skipped feedback requires a non-null reasonCode",
      );
    }
    if (options.reasonCode === "other") {
      const text = options.reasonText ?? null;
      if (text === null || text.trim().length === 0) {
        throw new RangeError(
          "reasonText must be present and non-blank for skip reason 'other'",
        );
      }
    }
  }
  const now = (options.now ?? (() => new Date().toISOString()))();
  const row: TaskFeedbackTableRow = {
    id: `feedback_${randomUUID()}`,
    plan_item_id: planItemId,
    action: parsedAction,
    reason_code: options.reasonCode ?? null,
    reason_text: options.reasonText ?? null,
    attempt_id: options.attemptId ?? null,
    successor_daily_plan_id: options.successorDailyPlanId ?? null,
    created_at: now,
  };
  try {
    db.prepare(
      `INSERT INTO task_feedback (
         id, plan_item_id, action, reason_code, reason_text,
         attempt_id, successor_daily_plan_id, created_at
       ) VALUES (
         @id, @planItemId, @action, @reasonCode, @reasonText,
         @attemptId, @successorDailyPlanId, @createdAt
       )`,
    ).run({
      id: row.id,
      planItemId: row.plan_item_id,
      action: row.action,
      reasonCode: row.reason_code,
      reasonText: row.reason_text,
      attemptId: row.attempt_id,
      successorDailyPlanId: row.successor_daily_plan_id,
      createdAt: row.created_at,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (/UNIQUE constraint failed/.test(message)) {
      throw new RangeError(
        `Feedback for plan_item_id='${planItemId}' action='${parsedAction}' already exists`,
      );
    }
    throw error;
  }
  return fromTaskFeedbackRow(row);
}

/**
 * Record a revision event linking a previous daily plan (nullable for
 * `initial_plan`) to a successor daily plan. The fingerprint is stored
 * verbatim so deterministic replays can be deduplicated by callers.
 */
export function recordRevisionEvent(
  db: Database.Database,
  beforeDailyPlanId: string | null,
  afterDailyPlanId: string,
  eventType: PlanRevisionEventRow["eventType"],
  inputFingerprint: string,
  options: PlanClock = {},
): PlanRevisionEventRow {
  const parsedEventType = PlanRevisionEventTypeSchema.parse(eventType);
  if (afterDailyPlanId.length === 0) {
    throw new RangeError("afterDailyPlanId must not be empty");
  }
  const now = (options.now ?? (() => new Date().toISOString()))();
  const row: RevisionEventTableRow = {
    id: `rev_${randomUUID()}`,
    before_daily_plan_id: beforeDailyPlanId,
    after_daily_plan_id: afterDailyPlanId,
    event_type: parsedEventType,
    input_fingerprint: inputFingerprint,
    created_at: now,
  };
  db.prepare(
    `INSERT INTO plan_revision_events (
       id, before_daily_plan_id, after_daily_plan_id, event_type,
       input_fingerprint, created_at
     ) VALUES (
       @id, @beforeDailyPlanId, @afterDailyPlanId, @eventType,
       @inputFingerprint, @createdAt
     )`,
  ).run({
    id: row.id,
    beforeDailyPlanId: row.before_daily_plan_id,
    afterDailyPlanId: row.after_daily_plan_id,
    eventType: row.event_type,
    inputFingerprint: row.input_fingerprint,
    createdAt: row.created_at,
  });
  return fromRevisionEventRow(row);
}

function findActivePlanRow(
  db: Database.Database,
  learnerId: string,
): LearningPlanTableRow | null {
  const row = db
    .prepare<[string], LearningPlanTableRow>(
      `SELECT id, learner_id, generator_version, snapshot_json, status, created_at
         FROM learning_plans
        WHERE learner_id = ? AND status = 'active'
        ORDER BY created_at DESC, id DESC
        LIMIT 1`,
    )
    .get(learnerId);
  return row === undefined ? null : row;
}

function supersedePlanRow(db: Database.Database, planId: string): void {
  db.prepare(
    `UPDATE learning_plans SET status = ? WHERE id = ?`,
  ).run(LearningPlanStatusSchema.parse("superseded"), planId);
}

function fromLearningPlanRow(row: LearningPlanTableRow): LearningPlanRow {
  return LearningPlanRowSchema.parse({
    id: row.id,
    learnerId: row.learner_id,
    generatorVersion: row.generator_version,
    snapshotJson: row.snapshot_json,
    status: row.status,
    createdAt: row.created_at,
  });
}

function fromDailySnapshotRow(
  row: DailySnapshotTableRow,
): DailyPlanSnapshotRow {
  return DailyPlanSnapshotRowSchema.parse({
    id: row.id,
    learningPlanId: row.learning_plan_id,
    localDate: row.local_date,
    effortBoundaryMinutes: row.effort_boundary_minutes,
    dailyMode: row.daily_mode,
    generatorVersion: row.generator_version,
    supersedesDailyPlanId: row.supersedes_daily_plan_id,
    createdAt: row.created_at,
  });
}

function fromPlanItemRow(row: PlanItemTableRow): PlanItemRow {
  return PlanItemRowSchema.parse({
    id: row.id,
    dailyPlanId: row.daily_plan_id,
    practiceTaskId: row.practice_task_id,
    nodeId: row.node_id,
    role: row.role,
    rank: row.rank,
    reasonCodesJson: row.reason_codes_json,
  });
}

function fromTaskFeedbackRow(row: TaskFeedbackTableRow): TaskFeedbackRow {
  return TaskFeedbackRowSchema.parse({
    id: row.id,
    planItemId: row.plan_item_id,
    action: row.action,
    reasonCode: row.reason_code,
    reasonText: row.reason_text,
    attemptId: row.attempt_id,
    successorDailyPlanId: row.successor_daily_plan_id,
    createdAt: row.created_at,
  });
}

function fromRevisionEventRow(
  row: RevisionEventTableRow,
): PlanRevisionEventRow {
  return PlanRevisionEventRowSchema.parse({
    id: row.id,
    beforeDailyPlanId: row.before_daily_plan_id,
    afterDailyPlanId: row.after_daily_plan_id,
    eventType: row.event_type,
    inputFingerprint: row.input_fingerprint,
    createdAt: row.created_at,
  });
}