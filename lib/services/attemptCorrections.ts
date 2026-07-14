import { randomUUID } from "node:crypto";
import type Database from "better-sqlite3";
import { z } from "zod";
import {
  AttemptCorrectionSchema,
  AttemptResultSchema,
  TrainingAttemptSchema,
  type AttemptCorrectionChange,
  type AttemptCorrectionField,
  type TrainingAttempt,
} from "@/lib/domain/training";
import { insertAttemptCorrectionChanges } from "@/lib/repositories/attemptCorrections";
import {
  findAttemptByIdIncludingVoided,
  markAttemptVoided,
  updateAttemptCorrectionFields,
} from "@/lib/repositories/attempts";

const CorrectionChangesSchema = z.object({
  result: AttemptResultSchema.optional(),
  language: z.string().trim().min(1).max(100).nullable().optional(),
  durationMinutes: z.number().int().nonnegative().max(10_080).nullable().optional(),
  reflection: z.string().trim().min(1).max(2000).nullable().optional(),
  startedAt: z.string().datetime().optional(),
  endedAt: z.string().datetime().nullable().optional(),
}).strict().refine((changes) => Object.keys(changes).length > 0, {
  message: "At least one correction field is required",
});

export const AttemptCorrectionRequestSchema = z.object({
  expectedRevision: z.number().int().positive(),
  reason: z.string().trim().min(1).max(500),
  changes: CorrectionChangesSchema,
}).strict();
export type AttemptCorrectionRequest = z.infer<
  typeof AttemptCorrectionRequestSchema
>;

export const VoidAttemptRequestSchema = z.object({
  expectedRevision: z.number().int().positive(),
  reason: z.string().trim().min(1).max(500),
}).strict();
export type VoidAttemptRequest = z.infer<typeof VoidAttemptRequestSchema>;

export type AttemptMutationOptions = {
  readonly id?: () => string;
  readonly now?: () => string;
};

export type VoidAttemptResult = {
  readonly attempt: TrainingAttempt;
  readonly replayed: boolean;
};

export class AttemptNotFoundError extends Error {
  constructor(message = "Attempt not found") {
    super(message);
    this.name = "AttemptNotFoundError";
  }
}

export class AttemptRevisionConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AttemptRevisionConflictError";
  }
}

export class AttemptCorrectionValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AttemptCorrectionValidationError";
  }
}

export function correctAttempt(
  db: Database.Database,
  attemptId: string,
  request: AttemptCorrectionRequest,
  options: AttemptMutationOptions = {},
): TrainingAttempt {
  const parsed = AttemptCorrectionRequestSchema.parse(request);
  const transaction = db.transaction(() => {
    const current = requireAttempt(db, attemptId);
    if (current.voidedAt !== undefined) {
      throw new AttemptRevisionConflictError("Voided attempts cannot be corrected");
    }
    assertRevision(current, parsed.expectedRevision);
    const nextValues = correctionValues(current, parsed.changes);
    const changes = correctionChanges(current, nextValues);
    if (changes.length === 0) {
      throw new AttemptCorrectionValidationError("Correction does not change any values");
    }
    const now = (options.now ?? (() => new Date().toISOString()))();
    const resultingRevision = current.revision + 1;
    TrainingAttemptSchema.parse({
      ...current,
      ...nextValues,
      revision: resultingRevision,
      updatedAt: now,
    });
    const updatedRows = updateAttemptCorrectionFields(db, {
      attemptId,
      expectedRevision: parsed.expectedRevision,
      updatedAt: now,
      result: nextValues.result,
      language: nextValues.language ?? null,
      durationMinutes: nextValues.durationMinutes ?? null,
      reflection: nextValues.reflection ?? null,
      startedAt: nextValues.startedAt,
      endedAt: nextValues.endedAt ?? null,
    });
    if (updatedRows !== 1) {
      throw new AttemptRevisionConflictError("Attempt revision changed before correction");
    }
    insertAttemptCorrectionChanges(db, AttemptCorrectionSchema.parse({
      id: (options.id ?? (() => `attempt_correction_${randomUUID()}`))(),
      attemptId,
      reason: parsed.reason,
      correctedAt: now,
      resultingRevision,
      changes,
    }));
    return requireAttempt(db, attemptId);
  });
  return transaction();
}

export function voidAttempt(
  db: Database.Database,
  attemptId: string,
  request: VoidAttemptRequest,
  options: AttemptMutationOptions = {},
): VoidAttemptResult {
  const parsed = VoidAttemptRequestSchema.parse(request);
  const transaction = db.transaction(() => {
    const current = requireAttempt(db, attemptId);
    if (current.voidedAt !== undefined) {
      return { attempt: current, replayed: true };
    }
    assertRevision(current, parsed.expectedRevision);
    const now = (options.now ?? (() => new Date().toISOString()))();
    const resultingRevision = current.revision + 1;
    const updatedRows = markAttemptVoided(db, {
      attemptId,
      expectedRevision: parsed.expectedRevision,
      voidedAt: now,
      voidReason: parsed.reason,
    });
    if (updatedRows !== 1) {
      throw new AttemptRevisionConflictError("Attempt revision changed before voiding");
    }
    insertAttemptCorrectionChanges(db, AttemptCorrectionSchema.parse({
      id: (options.id ?? (() => `attempt_correction_${randomUUID()}`))(),
      attemptId,
      reason: parsed.reason,
      correctedAt: now,
      resultingRevision,
      changes: [{ field: "voidedAt", oldValue: null, newValue: now }],
    }));
    return { attempt: requireAttempt(db, attemptId), replayed: false };
  });
  return transaction();
}

type CorrectionValues = Pick<
  TrainingAttempt,
  "result" | "language" | "durationMinutes" | "reflection" | "startedAt" | "endedAt"
>;

function correctionValues(
  current: TrainingAttempt,
  changes: AttemptCorrectionRequest["changes"],
): CorrectionValues {
  return {
    result: changes.result ?? current.result,
    language: "language" in changes ? changes.language ?? undefined : current.language,
    durationMinutes: "durationMinutes" in changes
      ? changes.durationMinutes ?? undefined
      : current.durationMinutes,
    reflection: "reflection" in changes
      ? changes.reflection ?? undefined
      : current.reflection,
    startedAt: changes.startedAt ?? current.startedAt,
    endedAt: "endedAt" in changes ? changes.endedAt ?? undefined : current.endedAt,
  };
}

function correctionChanges(
  current: TrainingAttempt,
  next: CorrectionValues,
): AttemptCorrectionChange[] {
  const candidates: readonly [AttemptCorrectionField, string | number | undefined, string | number | undefined][] = [
    ["result", current.result, next.result],
    ["language", current.language, next.language],
    ["durationMinutes", current.durationMinutes, next.durationMinutes],
    ["reflection", current.reflection, next.reflection],
    ["startedAt", current.startedAt, next.startedAt],
    ["endedAt", current.endedAt, next.endedAt],
  ];
  return candidates.flatMap(([field, oldValue, newValue]) => {
    const oldText = scalarText(oldValue);
    const newText = scalarText(newValue);
    return oldText === newText ? [] : [{ field, oldValue: oldText, newValue: newText }];
  });
}

function scalarText(value: string | number | undefined): string | null {
  return value === undefined ? null : String(value);
}

function requireAttempt(
  db: Database.Database,
  attemptId: string,
): TrainingAttempt {
  const attempt = findAttemptByIdIncludingVoided(db, attemptId);
  if (attempt === null) throw new AttemptNotFoundError();
  return attempt;
}

function assertRevision(attempt: TrainingAttempt, expectedRevision: number): void {
  if (attempt.revision !== expectedRevision) {
    throw new AttemptRevisionConflictError(
      `Attempt revision is ${attempt.revision}, not ${expectedRevision}`,
    );
  }
}
