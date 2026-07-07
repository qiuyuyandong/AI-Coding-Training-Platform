import type Database from "better-sqlite3";
import { ProblemSchema, type Problem } from "@/lib/domain/problem";

type ProblemRow = {
  id: string;
  platform: string;
  external_id: string;
  title: string;
  canonical_url: string;
  tags_json: string;
  difficulty: string;
  status: string;
  content_mode: string;
  training_mode: string;
  created_at: string;
  updated_at: string;
};

function fromRow(row: ProblemRow): Problem {
  return ProblemSchema.parse({
    id: row.id,
    platform: row.platform,
    externalId: row.external_id,
    title: row.title,
    canonicalUrl: row.canonical_url,
    tags: JSON.parse(row.tags_json) as string[],
    difficulty: row.difficulty,
    status: row.status,
    contentMode: row.content_mode,
    trainingMode: row.training_mode,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  });
}

export function upsertProblem(db: Database.Database, problem: Problem): void {
  const parsed = ProblemSchema.parse(problem);
  db.prepare(`
    INSERT INTO problems (id, platform, external_id, title, canonical_url, tags_json, difficulty, status, content_mode, training_mode, created_at, updated_at)
    VALUES (@id, @platform, @externalId, @title, @canonicalUrl, @tagsJson, @difficulty, @status, @contentMode, @trainingMode, @createdAt, @updatedAt)
    ON CONFLICT(platform, external_id) DO UPDATE SET
      title = excluded.title,
      canonical_url = excluded.canonical_url,
      tags_json = excluded.tags_json,
      difficulty = excluded.difficulty,
      updated_at = excluded.updated_at
  `).run({ ...parsed, tagsJson: JSON.stringify(parsed.tags) });
}

export function listProblems(db: Database.Database): Problem[] {
  return db.prepare("SELECT * FROM problems ORDER BY updated_at DESC").all().map((row) => fromRow(row as ProblemRow));
}
