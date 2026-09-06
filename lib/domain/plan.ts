import { z } from "zod";

/**
 * V0 plan domain enums and row schemas.
 *
 * Every enum in this file mirrors a SQL CHECK constraint declared in
 * `lib/db/migrations/0007_learner_goals_and_plans.sql`. Adding, removing,
 * or renaming a member without updating the matching CHECK (or vice
 * versa) is a verifier failure: the repositories reject values that
 * cannot be persisted, and the migration tests assert that every CHECK
 * accepts all members here and rejects exactly one known invalid value.
 *
 * Plan items are immutable once written: there is no UPDATE in the
 * repository. Task feedback is append-only with a UNIQUE
 * `(plan_item_id, action)` constraint. Revision events are append-only.
 */

export const LearningPlanStatusSchema = z.enum(["active", "superseded"]);
export type LearningPlanStatus = z.infer<typeof LearningPlanStatusSchema>;

export const EffortBoundaryMinutesSchema = z.union([
  z.literal(15),
  z.literal(30),
  z.literal(60),
  z.literal(90),
]);
export type EffortBoundaryMinutes = z.infer<typeof EffortBoundaryMinutesSchema>;

export const DailyModeSchema = z.enum(["learn", "review", "practice", "build", "recover"]);
export type DailyMode = z.infer<typeof DailyModeSchema>;

export const PlanItemRoleSchema = z.enum([
  "primary",
  "warmup",
  "same_goal_alternative",
  "weakness_review",
]);
export type PlanItemRole = z.infer<typeof PlanItemRoleSchema>;

export const TaskFeedbackActionSchema = z.enum([
  "accepted",
  "started",
  "skipped",
  "completed",
]);
export type TaskFeedbackAction = z.infer<typeof TaskFeedbackActionSchema>;

export const SkipReasonCodeSchema = z.enum([
  "too_hard",
  "too_easy",
  "not_relevant",
  "missing_resource",
  "not_now",
  "other",
]);
export type SkipReasonCode = z.infer<typeof SkipReasonCodeSchema>;

export const PlanRevisionEventTypeSchema = z.enum([
  "initial_plan",
  "goal_changed",
  "diagnosis_completed",
  "effort_changed",
  "mode_changed",
  "item_skipped",
  "item_completed",
  "attempt_corrected",
  "attempt_voided",
]);
export type PlanRevisionEventType = z.infer<
  typeof PlanRevisionEventTypeSchema
>;

export const LearningPlanRowSchema = z.object({
  id: z.string().min(1),
  learnerId: z.string().min(1),
  generatorVersion: z.string().min(1),
  snapshotJson: z.string(),
  status: LearningPlanStatusSchema,
  createdAt: z.string().datetime(),
});
export type LearningPlanRow = z.infer<typeof LearningPlanRowSchema>;

export const DailyPlanSnapshotRowSchema = z.object({
  id: z.string().min(1),
  learningPlanId: z.string().min(1),
  localDate: z.string().min(1),
  effortBoundaryMinutes: EffortBoundaryMinutesSchema,
  dailyMode: DailyModeSchema,
  generatorVersion: z.string().min(1),
  supersedesDailyPlanId: z.string().nullable(),
  createdAt: z.string().datetime(),
});
export type DailyPlanSnapshotRow = z.infer<typeof DailyPlanSnapshotRowSchema>;

export const PlanItemRowSchema = z.object({
  id: z.string().min(1),
  dailyPlanId: z.string().min(1),
  practiceTaskId: z.string().min(1),
  nodeId: z.string().min(1),
  role: PlanItemRoleSchema,
  rank: z.number().int(),
  reasonCodesJson: z.string(),
});
export type PlanItemRow = z.infer<typeof PlanItemRowSchema>;

export const TaskFeedbackRowSchema = z.object({
  id: z.string().min(1),
  planItemId: z.string().min(1),
  action: TaskFeedbackActionSchema,
  reasonCode: SkipReasonCodeSchema.nullable(),
  reasonText: z.string().nullable(),
  attemptId: z.string().nullable(),
  successorDailyPlanId: z.string().nullable(),
  createdAt: z.string().datetime(),
});
export type TaskFeedbackRow = z.infer<typeof TaskFeedbackRowSchema>;

export const PlanRevisionEventRowSchema = z.object({
  id: z.string().min(1),
  beforeDailyPlanId: z.string().nullable(),
  afterDailyPlanId: z.string().min(1),
  eventType: PlanRevisionEventTypeSchema,
  inputFingerprint: z.string(),
  createdAt: z.string().datetime(),
});
export type PlanRevisionEventRow = z.infer<typeof PlanRevisionEventRowSchema>;
