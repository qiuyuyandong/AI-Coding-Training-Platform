import { randomUUID } from "node:crypto";
import type Database from "better-sqlite3";
import { z } from "zod";
import {
  AttemptResultSchema,
  TrainingAttemptSchema,
  type TrainingAttempt,
} from "@/lib/domain/training";
import { PlatformSchema } from "@/lib/domain/source";
import { saveTrainingAttempt } from "@/lib/repositories/attempts";
import {
  canonicalProblemUrl,
  normalizeProblemIdentity,
} from "@/lib/services/canonicalProblemUrl";

export const ManualAttemptInputSchema = z.object({
  platform: PlatformSchema,
  problemExternalId: z.string().trim().min(1).max(200),
  problemTitle: z.string().trim().min(1).max(300),
  canonicalUrl: z.string().url().optional(),
  startedAt: z.string().datetime(),
  endedAt: z.string().datetime().optional(),
  result: AttemptResultSchema,
  language: z.string().trim().min(1).max(100).optional(),
  durationMinutes: z.number().int().nonnegative().max(10_080).optional(),
  reflection: z.string().trim().min(1).max(2000).optional(),
}).strict();

export type ManualAttemptInput = z.infer<typeof ManualAttemptInputSchema>;

export type CreateManualAttemptOptions = {
  readonly id?: () => string;
  readonly now?: () => string;
};

export function createManualAttempt(
  db: Database.Database,
  input: ManualAttemptInput,
  options: CreateManualAttemptOptions = {},
): TrainingAttempt {
  const parsed = ManualAttemptInputSchema.parse(input);
  const identity = normalizeProblemIdentity({
    platform: parsed.platform,
    externalId: parsed.problemExternalId,
  });
  const now = (options.now ?? (() => new Date().toISOString()))();
  const id = (options.id ?? (() => `manual_attempt_${randomUUID()}`))();
  const attempt = TrainingAttemptSchema.parse({
    id,
    recordSource: "manual",
    platform: identity.platform,
    problemExternalId: identity.externalId,
    problemTitle: parsed.problemTitle,
    canonicalUrl: canonicalProblemUrl(identity, parsed.canonicalUrl),
    startedAt: parsed.startedAt,
    endedAt: parsed.endedAt,
    result: parsed.result,
    language: parsed.language,
    durationMinutes: parsed.durationMinutes,
    reflection: parsed.reflection,
    revision: 1,
    createdAt: now,
    updatedAt: now,
  });
  saveTrainingAttempt(db, attempt);
  return attempt;
}
