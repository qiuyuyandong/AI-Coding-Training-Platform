import { randomUUID } from "node:crypto";
import type Database from "better-sqlite3";
import {
  BaselineConfidenceSchema,
  BaselineLevelSchema,
  BaselineSourceSchema,
  DiagnosticResponseValueSchema,
  DiagnosticSessionRowSchema,
  LearnerNodeBaselineRowSchema,
  type DiagnosticResponseRow,
  type DiagnosticSessionRow,
  type LearnerNodeBaselineRow,
} from "@/lib/domain/learner";

/**
 * V0 diagnostic-session and node-baseline repository functions.
 *
 * Every function accepts a caller-owned SQLite handle and never opens or
 * closes it. The DB-handle rule comes from `AGENTS.md` and is enforced
 * by the repository-level tests; callers are expected to obtain their
 * handle from `lib/db/client.ts` and pass it in.
 *
 * Diagnostic responses UPSERT per `(session_id, prompt_id)` so a
 * partially completed session can be resumed and amended. Baselines are
 * upserted per `(learner_id, node_id)`; the latest write wins.
 */

type SessionRow = {
  readonly id: string;
  readonly learner_id: string;
  readonly blueprint_version: string;
  readonly status: string;
  readonly started_at: string;
  readonly completed_at: string | null;
};

type BaselineRow = {
  readonly learner_id: string;
  readonly node_id: string;
  readonly baseline: string;
  readonly confidence: string;
  readonly source: string;
  readonly updated_at: string;
};

export type DiagnosisClock = {
  readonly now?: () => string;
};

/**
 * Insert a fresh in-progress diagnostic session for the learner and
 * return the new row. The caller is expected to provide a stable
 * blueprint version (e.g. `v0-diagnosis-1`).
 */
export function startDiagnosticSession(
  db: Database.Database,
  learnerId: string,
  blueprintVersion: string,
  options: DiagnosisClock = {},
): DiagnosticSessionRow {
  const now = (options.now ?? (() => new Date().toISOString()))();
  const row: SessionRow = {
    id: `ds_${randomUUID()}`,
    learner_id: learnerId,
    blueprint_version: blueprintVersion,
    status: "in_progress",
    started_at: now,
    completed_at: null,
  };
  db.prepare(
    `INSERT INTO diagnostic_sessions (
       id, learner_id, blueprint_version, status, started_at, completed_at
     ) VALUES (
       @id, @learnerId, @blueprintVersion, @status, @startedAt, @completedAt
     )`,
  ).run({
    id: row.id,
    learnerId: row.learner_id,
    blueprintVersion: row.blueprint_version,
    status: row.status,
    startedAt: row.started_at,
    completedAt: row.completed_at,
  });
  return fromSessionRow(row);
}

/**
 * UPSERT the learner's response for one prompt. Calling twice with the
 * same `(session_id, prompt_id)` overwrites the previous response and
 * refreshes `created_at`; the caller's prompt id list remains
 * authoritative.
 */
export function recordDiagnosticResponse(
  db: Database.Database,
  sessionId: string,
  promptId: string,
  response: DiagnosticResponseRow["response"],
  options: DiagnosisClock = {},
): void {
  const parsed = DiagnosticResponseValueSchema.parse(response);
  if (promptId.length === 0) {
    throw new RangeError("promptId must not be empty");
  }
  const now = (options.now ?? (() => new Date().toISOString()))();
  db.prepare(
    `INSERT INTO diagnostic_responses (
       session_id, prompt_id, response, created_at
     ) VALUES (
       @sessionId, @promptId, @response, @createdAt
     )
     ON CONFLICT(session_id, prompt_id) DO UPDATE SET
       response = excluded.response,
       created_at = excluded.created_at`,
  ).run({
    sessionId,
    promptId,
    response: parsed,
    createdAt: now,
  });
}

/**
 * Mark an in-progress session as completed and stamp `completed_at`.
 * Returns the updated row. Sessions that are already `completed` are
 * returned unchanged so the function is safe to retry.
 */
export function completeDiagnosticSession(
  db: Database.Database,
  sessionId: string,
  options: DiagnosisClock = {},
): DiagnosticSessionRow {
  const now = (options.now ?? (() => new Date().toISOString()))();
  db.prepare(
    `UPDATE diagnostic_sessions
        SET status = 'completed', completed_at = ?
      WHERE id = ?`,
  ).run(now, sessionId);
  const row = findSessionById(db, sessionId);
  if (row === null) {
    throw new Error(`Diagnostic session ${sessionId} not found`);
  }
  return row;
}

/**
 * Return the latest in-progress diagnostic session for the learner, or
 * `null` when none exists.
 */
export function findCurrentSession(
  db: Database.Database,
  learnerId: string,
): DiagnosticSessionRow | null {
  const row = db
    .prepare<[string], SessionRow>(
      `SELECT id, learner_id, blueprint_version, status, started_at, completed_at
         FROM diagnostic_sessions
        WHERE learner_id = ? AND status = 'in_progress'
        ORDER BY started_at DESC, id DESC
        LIMIT 1`,
    )
    .get(learnerId);
  return row === undefined ? null : fromSessionRow(row);
}

/**
 * Return every baseline recorded for the learner. No ordering beyond
 * node id is enforced; callers that need a deterministic order should
 * sort by `nodeId`.
 */
export function listBaselines(
  db: Database.Database,
  learnerId: string,
): LearnerNodeBaselineRow[] {
  return db
    .prepare<[string], BaselineRow>(
      `SELECT learner_id, node_id, baseline, confidence, source, updated_at
         FROM learner_node_baselines
        WHERE learner_id = ?`,
    )
    .all(learnerId)
    .map(fromBaselineRow);
}

/**
 * INSERT OR REPLACE the baseline for one `(learner, node)` pair. The
 * `INSERT OR REPLACE` keeps the schema simple: history is not kept
 * here because every row is the current state, not an event log.
 */
export function upsertBaseline(
  db: Database.Database,
  learnerId: string,
  nodeId: string,
  baseline: LearnerNodeBaselineRow["baseline"],
  confidence: LearnerNodeBaselineRow["confidence"],
  source: LearnerNodeBaselineRow["source"],
  options: DiagnosisClock = {},
): LearnerNodeBaselineRow {
  const parsedBaseline = BaselineLevelSchema.parse(baseline);
  const parsedConfidence = BaselineConfidenceSchema.parse(confidence);
  const parsedSource = BaselineSourceSchema.parse(source);
  const now = (options.now ?? (() => new Date().toISOString()))();
  db.prepare(
    `INSERT INTO learner_node_baselines (
       learner_id, node_id, baseline, confidence, source, updated_at
     ) VALUES (
       @learnerId, @nodeId, @baseline, @confidence, @source, @updatedAt
     )
     ON CONFLICT(learner_id, node_id) DO UPDATE SET
       baseline = excluded.baseline,
       confidence = excluded.confidence,
       source = excluded.source,
       updated_at = excluded.updated_at`,
  ).run({
    learnerId,
    nodeId,
    baseline: parsedBaseline,
    confidence: parsedConfidence,
    source: parsedSource,
    updatedAt: now,
  });
  const row = db
    .prepare<[string, string], BaselineRow>(
      `SELECT learner_id, node_id, baseline, confidence, source, updated_at
         FROM learner_node_baselines
        WHERE learner_id = ? AND node_id = ?
        LIMIT 1`,
    )
    .get(learnerId, nodeId);
  if (row === undefined) {
    throw new Error(`Baseline upsert failed for ${learnerId}/${nodeId}`);
  }
  return fromBaselineRow(row);
}

function findSessionById(
  db: Database.Database,
  sessionId: string,
): DiagnosticSessionRow | null {
  const row = db
    .prepare<[string], SessionRow>(
      `SELECT id, learner_id, blueprint_version, status, started_at, completed_at
         FROM diagnostic_sessions
        WHERE id = ?
        LIMIT 1`,
    )
    .get(sessionId);
  return row === undefined ? null : fromSessionRow(row);
}

function fromSessionRow(row: SessionRow): DiagnosticSessionRow {
  return DiagnosticSessionRowSchema.parse({
    id: row.id,
    learnerId: row.learner_id,
    blueprintVersion: row.blueprint_version,
    status: row.status,
    startedAt: row.started_at,
    completedAt: row.completed_at,
  });
}

function fromBaselineRow(row: BaselineRow): LearnerNodeBaselineRow {
  return LearnerNodeBaselineRowSchema.parse({
    learnerId: row.learner_id,
    nodeId: row.node_id,
    baseline: row.baseline,
    confidence: row.confidence,
    source: row.source,
    updatedAt: row.updated_at,
  });
}