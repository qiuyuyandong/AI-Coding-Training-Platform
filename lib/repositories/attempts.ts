import type Database from "better-sqlite3";
import {
  TrainingAttemptSchema,
  type TrainingAttempt,
} from "@/lib/domain/training";

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
  const parsed = TrainingAttemptSchema.parse(attempt);
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

export function listRecentAttempts(
  db: Database.Database,
  limit = 10,
): TrainingAttempt[] {
  return db
    .prepare<number, AttemptRow>(
      "SELECT * FROM training_attempts ORDER BY updated_at DESC LIMIT ?",
    )
    .all(limit)
    .map(fromRow);
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
  return TrainingAttemptSchema.parse({
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
  });
}
