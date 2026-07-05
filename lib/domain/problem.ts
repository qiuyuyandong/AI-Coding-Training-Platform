import { z } from "zod";
import { PlatformSchema, type Platform } from "./source";

export const EXTERNAL_NO_CACHE_PLATFORMS = ["leetcode", "nowcoder", "luogu"] as const;
export type ExternalNoCachePlatform = (typeof EXTERNAL_NO_CACHE_PLATFORMS)[number];

export const ContentModeSchema = z.enum(["metadata_only", "licensed_statement", "manual_statement"]);
export const TrainingModeSchema = z.enum(["in_app", "deep_link"]);

export const ProblemStatusSchema = z.enum([
  "not_started",
  "in_progress",
  "solved",
  "needs_review",
  "needs_retry",
]);

const BaseProblemSchema = z.object({
  id: z.string().min(1),
  platform: PlatformSchema,
  externalId: z.string().min(1),
  title: z.string().min(1),
  canonicalUrl: z.string().url(),
  tags: z.array(z.string()),
  difficulty: z.string().min(1),
  status: ProblemStatusSchema,
  contentMode: ContentModeSchema,
  trainingMode: TrainingModeSchema,
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export const ProblemSchema = BaseProblemSchema.superRefine((value, context) => {
  if (
    (EXTERNAL_NO_CACHE_PLATFORMS as readonly Platform[]).includes(value.platform) &&
    value.contentMode !== "metadata_only"
  ) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["contentMode"],
      message: "LeetCode, NowCoder, and Luogu V1 problems must remain metadata_only.",
    });
  }
});

export type Problem = z.infer<typeof BaseProblemSchema>;