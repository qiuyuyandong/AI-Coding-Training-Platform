import { z } from "zod";
import { PlatformSchema } from "./source";

export const AttemptResultSchema = z.enum(["draft", "passed", "failed", "partial", "stuck"]);
export type AttemptResult = z.infer<typeof AttemptResultSchema>;

export const TrainingAttemptSchema = z.object({
  id: z.string().min(1),
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
  sourceEventId: z.string().min(1).optional(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export type TrainingAttempt = z.infer<typeof TrainingAttemptSchema>;