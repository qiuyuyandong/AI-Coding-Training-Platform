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

export const AttemptRecordSourceSchema = z.enum(["capture", "manual"]);
export type AttemptRecordSource = z.infer<typeof AttemptRecordSourceSchema>;

export const AttemptCorrectionFieldSchema = z.enum([
  "result",
  "language",
  "durationMinutes",
  "reflection",
  "startedAt",
  "endedAt",
  "voidedAt",
]);
export type AttemptCorrectionField = z.infer<
  typeof AttemptCorrectionFieldSchema
>;

export const AttemptCorrectionChangeSchema = z.object({
  field: AttemptCorrectionFieldSchema,
  oldValue: z.string().nullable(),
  newValue: z.string().nullable(),
});
export type AttemptCorrectionChange = z.infer<
  typeof AttemptCorrectionChangeSchema
>;

export const AttemptCorrectionSchema = z.object({
  id: z.string().min(1),
  attemptId: z.string().min(1),
  reason: z.string().min(1).max(500),
  correctedAt: z.string().datetime(),
  resultingRevision: z.number().int().min(2),
  changes: z.array(AttemptCorrectionChangeSchema).min(1),
});
export type AttemptCorrection = z.infer<typeof AttemptCorrectionSchema>;

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
  captureSessionId: z.string().min(1).optional(),
  submissionId: z.string().min(1).optional(),
  recordSource: AttemptRecordSourceSchema,
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
  revision: z.number().int().positive(),
  voidedAt: z.string().datetime().optional(),
  voidReason: z.string().min(1).max(500).optional(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
}).superRefine((attempt, context) => {
  if (attempt.recordSource === "capture") {
    if (attempt.captureSessionId === undefined || attempt.submissionId === undefined) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Capture attempts require session and submission identity",
      });
    }
  } else if (
    attempt.captureSessionId !== undefined
    || attempt.submissionId !== undefined
    || attempt.submissionEventId !== undefined
    || attempt.verdictEventId !== undefined
    || attempt.verdict !== undefined
  ) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Manual attempts cannot contain capture identity or verdict evidence",
    });
  }
  if ((attempt.voidedAt === undefined) !== (attempt.voidReason === undefined)) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Voided attempts require both time and reason",
    });
  }
  if (attempt.endedAt !== undefined && attempt.endedAt < attempt.startedAt) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Attempt end time cannot precede start time",
    });
  }
});

export type TrainingAttempt = z.infer<typeof TrainingAttemptSchema>;
