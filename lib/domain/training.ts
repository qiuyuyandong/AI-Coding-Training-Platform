import { z } from "zod";
import { PlatformSchema } from "./source";
import { CaptureProvenanceLevelSchema } from "./captureCredential";

export const AttemptResultSchema = z.enum([
  "draft",
  "passed",
  "failed",
  "partial",
  "stuck",
]);
export type AttemptResult = z.infer<typeof AttemptResultSchema>;

export const SessionEndReasonSchema = z.enum([
  "pagehide",
  "spa_navigation",
  "capture_disabled",
]);
export type SessionEndReason = z.infer<typeof SessionEndReasonSchema>;

export const TrainingSessionSchema = z.object({
  id: z.string().min(1),
  installationId: z.string().min(1),
  platform: PlatformSchema,
  problemExternalId: z.string().min(1),
  problemTitle: z.string().min(1),
  canonicalUrl: z.string().url(),
  provenanceLevel: CaptureProvenanceLevelSchema,
  startedAt: z.string().datetime(),
  endedAt: z.string().datetime().optional(),
  endReason: SessionEndReasonSchema.optional(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
}).superRefine((session, context) => {
  if ((session.endedAt === undefined) !== (session.endReason === undefined)) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Session end time and reason must be present together",
    });
  }
});

export type TrainingSession = z.infer<typeof TrainingSessionSchema>;

export const TrainingAttemptSchema = z.object({
  id: z.string().min(1),
  captureSessionId: z.string().min(1),
  submissionId: z.string().min(1),
  platform: PlatformSchema,
  problemExternalId: z.string().min(1),
  problemTitle: z.string().min(1),
  canonicalUrl: z.string().url(),
  startedAt: z.string().datetime(),
  endedAt: z.string().datetime().optional(),
  result: AttemptResultSchema,
  verdict: z.string().optional(),
  language: z.string().optional(),
  durationMinutes: z.number().int().nonnegative().optional(),
  reflection: z.string().optional(),
  submissionEventId: z.string().min(1).optional(),
  verdictEventId: z.string().min(1).optional(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export type TrainingAttempt = z.infer<typeof TrainingAttemptSchema>;
