import type Database from "better-sqlite3";
import { z } from "zod";
import {
  AttemptResultSchema,
  TrainingAttemptSchema,
  type AttemptResult,
  type TrainingAttempt,
} from "@/lib/domain/training";
import type { Platform } from "@/lib/domain/source";
import {
  canonicalProblemUrl,
  normalizeProblemIdentity,
} from "@/lib/services/canonicalProblemUrl";

type AttemptRow = {
  readonly id: string;
  readonly capture_session_id: string;
  readonly submission_id: string;
  readonly platform: string;
  readonly problem_external_id: string;
  readonly problem_title: string;
  readonly canonical_url: string;
  readonly started_at: string;
  readonly ended_at: string | null;
  readonly result: string;
  readonly verdict: string | null;
  readonly language: string | null;
  readonly duration_minutes: number | null;
  readonly reflection: string | null;
  readonly submission_event_id: string | null;
  readonly verdict_event_id: string | null;
  readonly created_at: string;
  readonly updated_at: string;
};

type AttemptAggregateRow = {
  readonly total_attempts: number;
  readonly completed_attempts: number;
  readonly passed_attempts: number;
  readonly draft_attempts: number;
  readonly failed_attempts: number;
  readonly partial_attempts: number;
  readonly stuck_attempts: number;
};

export type AttemptProblemScope = {
  readonly platform: Platform;
  readonly externalId: string;
};

export type AttemptTimeWindow = {
  readonly updatedFrom?: string;
  readonly updatedBefore?: string;
};

export type ListAttemptsQuery = AttemptTimeWindow & {
  readonly problem?: AttemptProblemScope;
  readonly limit: number;
};

export type AttemptAggregate = {
  readonly totalAttempts: number;
  readonly completedAttempts: number;
  readonly passedAttempts: number;
  readonly resultDistribution: Record<AttemptResult, number>;
};

type AttemptQueryParameters = {
  readonly platform: string | null;
  readonly externalId: string | null;
  readonly updatedFrom: string | null;
  readonly updatedBefore: string | null;
};

type ListAttemptParameters = AttemptQueryParameters & {
  readonly limit: number;
};

const AttemptTimeWindowSchema = z.object({
  updatedFrom: z.string().datetime().optional(),
  updatedBefore: z.string().datetime().optional(),
});

export type UpdateAttemptReflectionInput = {
  readonly attemptId: string;
  readonly reflection: string;
  readonly now: string;
};

export function findAttemptById(
  db: Database.Database,
  id: string,
): TrainingAttempt | null {
  const row = db
    .prepare<string, AttemptRow>("SELECT * FROM training_attempts WHERE id = ?")
    .get(id);
  return row === undefined ? null : fromRow(row);
}

export function findAttemptBySubmissionId(
  db: Database.Database,
  submissionId: string,
): TrainingAttempt | null {
  const row = db
    .prepare<string, AttemptRow>(
      "SELECT * FROM training_attempts WHERE submission_id = ?",
    )
    .get(submissionId);
  return row === undefined ? null : fromRow(row);
}

export function saveTrainingAttempt(
  db: Database.Database,
  attempt: TrainingAttempt,
): void {
  const parsed = normalizeAttempt(TrainingAttemptSchema.parse(attempt));
  db.prepare(`
    INSERT INTO training_attempts (
      id, capture_session_id, submission_id, platform, problem_external_id,
      problem_title, canonical_url, started_at, ended_at, result, verdict,
      language, duration_minutes, reflection, submission_event_id,
      verdict_event_id, created_at, updated_at
    ) VALUES (
      @id, @captureSessionId, @submissionId, @platform, @problemExternalId,
      @problemTitle, @canonicalUrl, @startedAt, @endedAt, @result, @verdict,
      @language, @durationMinutes, @reflection, @submissionEventId,
      @verdictEventId, @createdAt, @updatedAt
    )
    ON CONFLICT(id) DO UPDATE SET
      capture_session_id = excluded.capture_session_id,
      submission_id = excluded.submission_id,
      platform = excluded.platform,
      problem_external_id = excluded.problem_external_id,
      problem_title = excluded.problem_title,
      canonical_url = excluded.canonical_url,
      started_at = excluded.started_at,
      ended_at = excluded.ended_at,
      result = excluded.result,
      verdict = excluded.verdict,
      language = excluded.language,
      duration_minutes = excluded.duration_minutes,
      reflection = excluded.reflection,
      submission_event_id = excluded.submission_event_id,
      verdict_event_id = excluded.verdict_event_id,
      updated_at = excluded.updated_at
  `).run({
    ...parsed,
    endedAt: parsed.endedAt ?? null,
    verdict: parsed.verdict ?? null,
    language: parsed.language ?? null,
    durationMinutes: parsed.durationMinutes ?? null,
    reflection: parsed.reflection ?? null,
    submissionEventId: parsed.submissionEventId ?? null,
    verdictEventId: parsed.verdictEventId ?? null,
  });
}

export function listAttempts(
  db: Database.Database,
  query: ListAttemptsQuery,
): TrainingAttempt[] {
  validateLimit(query.limit);
  const parameters = queryParameters(query);
  return db.prepare<ListAttemptParameters, AttemptRow>(`
    SELECT *
    FROM training_attempts
    WHERE (@platform IS NULL OR platform = @platform)
      AND (@externalId IS NULL OR problem_external_id = @externalId)
      AND (@updatedFrom IS NULL OR updated_at >= @updatedFrom)
      AND (@updatedBefore IS NULL OR updated_at < @updatedBefore)
    ORDER BY updated_at DESC, id DESC
    LIMIT @limit
  `).all({ ...parameters, limit: query.limit }).map(fromRow);
}

export function findLatestAttempt(
  db: Database.Database,
  problem: AttemptProblemScope,
): TrainingAttempt | null {
  return listAttempts(db, { problem, limit: 1 })[0] ?? null;
}

export function aggregateAttempts(
  db: Database.Database,
  window: AttemptTimeWindow,
): AttemptAggregate {
  const parameters = queryParameters(window);
  const row = db.prepare<AttemptQueryParameters, AttemptAggregateRow>(`
    SELECT
      COUNT(*) AS total_attempts,
      COALESCE(SUM(CASE WHEN result <> 'draft' THEN 1 ELSE 0 END), 0) AS completed_attempts,
      COALESCE(SUM(CASE WHEN result = 'passed' THEN 1 ELSE 0 END), 0) AS passed_attempts,
      COALESCE(SUM(CASE WHEN result = 'draft' THEN 1 ELSE 0 END), 0) AS draft_attempts,
      COALESCE(SUM(CASE WHEN result = 'failed' THEN 1 ELSE 0 END), 0) AS failed_attempts,
      COALESCE(SUM(CASE WHEN result = 'partial' THEN 1 ELSE 0 END), 0) AS partial_attempts,
      COALESCE(SUM(CASE WHEN result = 'stuck' THEN 1 ELSE 0 END), 0) AS stuck_attempts
    FROM training_attempts
    WHERE (@updatedFrom IS NULL OR updated_at >= @updatedFrom)
      AND (@updatedBefore IS NULL OR updated_at < @updatedBefore)
  `).get(parameters);
  if (row === undefined) {
    throw new Error("Attempt aggregate query returned no row");
  }
  const resultDistribution = {
    draft: row.draft_attempts,
    passed: row.passed_attempts,
    failed: row.failed_attempts,
    partial: row.partial_attempts,
    stuck: row.stuck_attempts,
  } satisfies Record<AttemptResult, number>;
  for (const result of AttemptResultSchema.options) {
    if (!Number.isSafeInteger(resultDistribution[result])) {
      throw new Error(`Invalid aggregate count for ${result}`);
    }
  }
  return {
    totalAttempts: row.total_attempts,
    completedAttempts: row.completed_attempts,
    passedAttempts: row.passed_attempts,
    resultDistribution,
  };
}

export function updateAttemptReflection(
  db: Database.Database,
  input: UpdateAttemptReflectionInput,
): TrainingAttempt | null {
  db.prepare(`
    UPDATE training_attempts
    SET reflection = @reflection,
        updated_at = @now
    WHERE id = @attemptId
  `).run(input);
  return findAttemptById(db, input.attemptId);
}

function fromRow(row: AttemptRow): TrainingAttempt {
  return normalizeAttempt(TrainingAttemptSchema.parse({
    id: row.id,
    captureSessionId: row.capture_session_id,
    submissionId: row.submission_id,
    platform: row.platform,
    problemExternalId: row.problem_external_id,
    problemTitle: row.problem_title,
    canonicalUrl: row.canonical_url,
    startedAt: row.started_at,
    endedAt: row.ended_at ?? undefined,
    result: row.result,
    verdict: row.verdict ?? undefined,
    language: row.language ?? undefined,
    durationMinutes: row.duration_minutes ?? undefined,
    reflection: row.reflection ?? undefined,
    submissionEventId: row.submission_event_id ?? undefined,
    verdictEventId: row.verdict_event_id ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }));
}

function normalizeAttempt(attempt: TrainingAttempt): TrainingAttempt {
  const identity = normalizeProblemIdentity({
    platform: attempt.platform,
    externalId: attempt.problemExternalId,
  });
  return TrainingAttemptSchema.parse({
    ...attempt,
    problemExternalId: identity.externalId,
    canonicalUrl: canonicalProblemUrl(identity, attempt.canonicalUrl),
  });
}

function validateLimit(limit: number): void {
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
    throw new RangeError("Attempt query limit must be an integer from 1 to 100");
  }
}

function queryParameters(window: AttemptTimeWindow & {
  readonly problem?: AttemptProblemScope;
}): AttemptQueryParameters {
  const parsedWindow = AttemptTimeWindowSchema.safeParse(window);
  if (!parsedWindow.success) {
    const field = parsedWindow.error.issues[0]?.path[0];
    throw new RangeError(`${String(field)} must be an ISO date-time`);
  }
  const { updatedFrom, updatedBefore } = parsedWindow.data;
  if (updatedFrom !== undefined && updatedBefore !== undefined
    && updatedFrom >= updatedBefore) {
    throw new RangeError("updatedFrom must be before updatedBefore");
  }
  const problem = window.problem === undefined
    ? undefined
    : normalizeProblemIdentity(window.problem);
  return {
    platform: problem?.platform ?? null,
    externalId: problem?.externalId ?? null,
    updatedFrom: updatedFrom ?? null,
    updatedBefore: updatedBefore ?? null,
  };
}
