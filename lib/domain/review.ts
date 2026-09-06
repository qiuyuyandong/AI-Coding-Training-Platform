import { z } from "zod";
import { AbilityLevelSchema } from "@/lib/domain/ability";

export const ReviewPurposeSchema = z.enum([
  "refresh",
  "variant",
  "transfer",
  "prerequisite_check",
]);
export type ReviewPurpose = z.infer<typeof ReviewPurposeSchema>;

export const ReviewStatusSchema = z.enum(["open", "completed", "cancelled"]);
export type ReviewStatus = z.infer<typeof ReviewStatusSchema>;

export const ReviewItemSchema = z.object({
  id: z.string().min(1),
  learnerId: z.string().min(1),
  nodeId: z.string().min(1),
  purpose: ReviewPurposeSchema,
  dueAt: z.string().datetime(),
  priority: z.number().int().min(0).max(100),
  selectedPracticeTaskId: z.string().nullable(),
  schedulerVersion: z.string().min(1),
  sourceSummaryId: z.string().min(1),
  reasonCodes: z.array(z.string().min(1)),
  status: ReviewStatusSchema,
  createdAt: z.string().datetime(),
  completedAt: z.string().datetime().nullable(),
});
export type ReviewItem = z.infer<typeof ReviewItemSchema>;

export const LearnerAssessmentSchema = z.object({
  id: z.string().min(1),
  learnerId: z.string().min(1),
  nodeId: z.string().min(1),
  kind: z.enum(["self_rating", "dispute"]),
  rating: AbilityLevelSchema.nullable(),
  reason: z.string().max(500).nullable(),
  abilityInputFingerprint: z.string().nullable(),
  resolution: z.enum([
    "pending_verification",
    "accepted_as_context",
    "resolved_by_evidence",
  ]),
  createdAt: z.string().datetime(),
});
export type LearnerAssessment = z.infer<typeof LearnerAssessmentSchema>;
