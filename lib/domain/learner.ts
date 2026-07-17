import { z } from "zod";

/**
 * V0 learner domain enums and row schemas.
 *
 * Every enum in this file mirrors a SQL CHECK constraint declared in
 * `lib/db/migrations/0007_learner_goals_and_plans.sql`. Adding, removing,
 * or renaming a member without updating the matching CHECK (or vice
 * versa) is a verifier failure: the repositories reject values that
 * cannot be persisted, and the migration tests assert that every CHECK
 * accepts all members here and rejects exactly one known invalid value.
 *
 * V0 deliberately omits a target-level field or UI; only one stable
 * local profile is ever created, with id `local-default-learner`.
 */

export const OnboardingStateSchema = z.enum([
  "new",
  "goal_resolved",
  "diagnosing",
  "plan_ready",
]);
export type OnboardingState = z.infer<typeof OnboardingStateSchema>;

export const LearnerGoalStatusSchema = z.enum(["active", "superseded"]);
export type LearnerGoalStatus = z.infer<typeof LearnerGoalStatusSchema>;

export const DiagnosticStatusSchema = z.enum(["in_progress", "completed"]);
export type DiagnosticStatus = z.infer<typeof DiagnosticStatusSchema>;

export const DiagnosticResponseValueSchema = z.enum([
  "unknown",
  "needs_foundation",
  "can_with_help",
  "ready",
]);
export type DiagnosticResponseValue = z.infer<
  typeof DiagnosticResponseValueSchema
>;

export const BaselineLevelSchema = z.enum([
  "unknown",
  "needs_foundation",
  "self_reported",
  "ready",
]);
export type BaselineLevel = z.infer<typeof BaselineLevelSchema>;

export const BaselineConfidenceSchema = z.enum(["low", "medium", "high"]);
export type BaselineConfidence = z.infer<typeof BaselineConfidenceSchema>;

export const BaselineSourceSchema = z.enum([
  "diagnosis",
  "manual_override",
]);
export type BaselineSource = z.infer<typeof BaselineSourceSchema>;

export const LOCAL_DEFAULT_LEARNER_ID = "local-default-learner";

export const InterestTrackIdsSchema = z
  .array(z.string().min(1))
  .max(2)
  .superRefine((tracks, context) => {
    const seen = new Set<string>();
    for (const [index, track] of tracks.entries()) {
      if (seen.has(track)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: [index],
          message: `Duplicate interest track '${track}'`,
        });
      }
      seen.add(track);
    }
  });
export type InterestTrackIds = z.infer<typeof InterestTrackIdsSchema>;

export const LearnerProfileRowSchema = z.object({
  id: z.string().min(1),
  onboardingState: OnboardingStateSchema,
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type LearnerProfileRow = z.infer<typeof LearnerProfileRowSchema>;

export const LearnerGoalRowSchema = z.object({
  id: z.string().min(1),
  learnerId: z.string().min(1),
  primaryTrackId: z.string().min(1).nullable(),
  interestTrackIds: InterestTrackIdsSchema,
  status: LearnerGoalStatusSchema,
  createdAt: z.string().datetime(),
});
export type LearnerGoalRow = z.infer<typeof LearnerGoalRowSchema>;

export const DiagnosticSessionRowSchema = z.object({
  id: z.string().min(1),
  learnerId: z.string().min(1),
  blueprintVersion: z.string().min(1),
  status: DiagnosticStatusSchema,
  startedAt: z.string().datetime(),
  completedAt: z.string().datetime().nullable(),
});
export type DiagnosticSessionRow = z.infer<typeof DiagnosticSessionRowSchema>;

export const DiagnosticResponseRowSchema = z.object({
  sessionId: z.string().min(1),
  promptId: z.string().min(1),
  response: DiagnosticResponseValueSchema,
  createdAt: z.string().datetime(),
});
export type DiagnosticResponseRow = z.infer<
  typeof DiagnosticResponseRowSchema
>;

export const LearnerNodeBaselineRowSchema = z.object({
  learnerId: z.string().min(1),
  nodeId: z.string().min(1),
  baseline: BaselineLevelSchema,
  confidence: BaselineConfidenceSchema,
  source: BaselineSourceSchema,
  updatedAt: z.string().datetime(),
});
export type LearnerNodeBaselineRow = z.infer<
  typeof LearnerNodeBaselineRowSchema
>;