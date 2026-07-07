import type Database from "better-sqlite3";
import { TrainingAttemptSchema, type AttemptResult, type TrainingAttempt } from "@/lib/domain/training";

type AttemptRow = {
  readonly id: string;
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
  readonly source_event_id: string | null;
  readonly created_at: string;
  readonly updated_at: string;
};

export type CreateDraftAttemptInput = {
  readonly id: string;
  readonly platform: TrainingAttempt["platform"];
  readonly problemExternalId: string;
  readonly problemTitle: string;
  readonly canonicalUrl: string;
  readonly startedAt: string;
  readonly sourceEventId: string;
  readonly now: string;
};

export type CompleteAttemptInput = {
  readonly attemptId: string;
  readonly result: Exclude<AttemptResult, "draft">;
  readonly verdict: string;
  readonly language?: string;
  readonly endedAt: string;
  readonly now: string;
};

export type FindCompletedAttemptInput = {
  readonly platform: string;
  readonly problemExternalId: string;
  readonly verdict: string;
  readonly endedAt: string;
};

export type UpdateAttemptReflectionInput = {
  readonly attemptId: string;
  readonly reflection: string;
  readonly now: string;
};

function fromRow(row: AttemptRow): TrainingAttempt {
  return TrainingAttemptSchema.parse({
    id: row.id,
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
    sourceEventId: row.source_event_id ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  });
}

export function findAttemptBySourceEventId(db: Database.Database, sourceEventId: string): TrainingAttempt | null {
  const row = db.prepare<string, AttemptRow>("SELECT * FROM training_attempts WHERE source_event_id = ?").get(sourceEventId);
  return row === undefined ? null : fromRow(row);
}

export function findAttemptById(db: Database.Database, id: string): TrainingAttempt | null {
  const row = db.prepare<string, AttemptRow>("SELECT * FROM training_attempts WHERE id = ?").get(id);
  return row === undefined ? null : fromRow(row);
}

export function findOpenAttemptByProblem(db: Database.Database, platform: string, problemExternalId: string): TrainingAttempt | null {
  const row = db
    .prepare<[string, string], AttemptRow>(`
      SELECT * FROM training_attempts
      WHERE platform = ? AND problem_external_id = ? AND result = 'draft'
      ORDER BY updated_at DESC
      LIMIT 1
    `)
    .get(platform, problemExternalId);
  return row === undefined ? null : fromRow(row);
}

export function findCompletedAttemptByCaptureUpdate(db: Database.Database, input: FindCompletedAttemptInput): TrainingAttempt | null {
  const row = db
    .prepare<FindCompletedAttemptInput, AttemptRow>(`
      SELECT * FROM training_attempts
      WHERE platform = @platform
        AND problem_external_id = @problemExternalId
        AND verdict = @verdict
        AND ended_at = @endedAt
        AND result != 'draft'
      ORDER BY updated_at DESC
      LIMIT 1
    `)
    .get(input);
  return row === undefined ? null : fromRow(row);
}

export function createDraftAttemptFromCapture(db: Database.Database, input: CreateDraftAttemptInput): TrainingAttempt {
  db.prepare(`
    INSERT INTO training_attempts (
      id, platform, problem_external_id, problem_title, canonical_url, started_at,
      result, source_event_id, created_at, updated_at
    ) VALUES (
      @id, @platform, @problemExternalId, @problemTitle, @canonicalUrl, @startedAt,
      'draft', @sourceEventId, @now, @now
    )
  `).run(input);
  return findAttemptBySourceEventId(db, input.sourceEventId) ?? findOpenAttemptByProblem(db, input.platform, input.problemExternalId) ?? failAttemptLookup(input.id);
}

export function updateAttemptFromCapture(db: Database.Database, input: CompleteAttemptInput): TrainingAttempt {
  db.prepare(`
    UPDATE training_attempts
    SET result = @result,
        verdict = @verdict,
        language = @language,
        ended_at = @endedAt,
        updated_at = @now
    WHERE id = @attemptId
  `).run({ ...input, language: input.language ?? null });
  const updated = findAttemptById(db, input.attemptId);
  return updated ?? failAttemptLookup(input.attemptId);
}

export function listRecentAttempts(db: Database.Database, limit = 10): TrainingAttempt[] {
  const rows = db.prepare<number, AttemptRow>("SELECT * FROM training_attempts ORDER BY updated_at DESC LIMIT ?").all(limit);
  return rows.map(fromRow);
}

export function updateAttemptReflection(db: Database.Database, input: UpdateAttemptReflectionInput): TrainingAttempt | null {
  db.prepare(`
    UPDATE training_attempts
    SET reflection = @reflection,
        updated_at = @now
    WHERE id = @attemptId
  `).run(input);
  return findAttemptById(db, input.attemptId);
}

function failAttemptLookup(id: string): never {
  throw new Error(`Training attempt not found after write: ${id}`);
}
