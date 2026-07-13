import type Database from "better-sqlite3";
import {
  TrainingSessionSchema,
  type TrainingSession,
} from "@/lib/domain/training";

type TrainingSessionRow = {
  readonly id: string;
  readonly installation_id: string;
  readonly platform: string;
  readonly problem_external_id: string;
  readonly problem_title: string;
  readonly canonical_url: string;
  readonly provenance_level: string;
  readonly started_at: string;
  readonly ended_at: string | null;
  readonly end_reason: string | null;
  readonly created_at: string;
  readonly updated_at: string;
};

export function findTrainingSessionById(
  db: Database.Database,
  sessionId: string,
): TrainingSession | null {
  const row = db
    .prepare<string, TrainingSessionRow>(
      "SELECT * FROM training_sessions WHERE id = ?",
    )
    .get(sessionId);
  return row === undefined ? null : fromRow(row);
}

export function saveTrainingSession(
  db: Database.Database,
  session: TrainingSession,
): void {
  const parsed = TrainingSessionSchema.parse(session);
  db.prepare(`
    INSERT INTO training_sessions (
      id, installation_id, platform, problem_external_id, problem_title,
      canonical_url, provenance_level, started_at, ended_at, end_reason,
      created_at, updated_at
    ) VALUES (
      @id, @installationId, @platform, @problemExternalId, @problemTitle,
      @canonicalUrl, @provenanceLevel, @startedAt, @endedAt, @endReason,
      @createdAt, @updatedAt
    )
    ON CONFLICT(id) DO UPDATE SET
      installation_id = excluded.installation_id,
      platform = excluded.platform,
      problem_external_id = excluded.problem_external_id,
      problem_title = excluded.problem_title,
      canonical_url = excluded.canonical_url,
      provenance_level = excluded.provenance_level,
      started_at = excluded.started_at,
      ended_at = excluded.ended_at,
      end_reason = excluded.end_reason,
      updated_at = excluded.updated_at
  `).run({
    ...parsed,
    endedAt: parsed.endedAt ?? null,
    endReason: parsed.endReason ?? null,
  });
}

function fromRow(row: TrainingSessionRow): TrainingSession {
  return TrainingSessionSchema.parse({
    id: row.id,
    installationId: row.installation_id,
    platform: row.platform,
    problemExternalId: row.problem_external_id,
    problemTitle: row.problem_title,
    canonicalUrl: row.canonical_url,
    provenanceLevel: row.provenance_level,
    startedAt: row.started_at,
    endedAt: row.ended_at ?? undefined,
    endReason: row.end_reason ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  });
}
