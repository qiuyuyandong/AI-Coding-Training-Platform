import { randomUUID } from "node:crypto";
import type Database from "better-sqlite3";
import {
  AbilityConfidenceSchema,
  AbilityLevelSchema,
  AbilitySnapshotRowSchema,
  AbilityTransitionRowSchema,
  AttemptNodeMappingRowSchema,
  type AbilitySnapshotRow,
  type AbilityTransitionRow,
  type AttemptNodeMappingRow,
} from "@/lib/domain/ability";
import type { AttemptRef } from "@/lib/services/abilityProjector";

/**
 * V0 ability repository functions.
 *
 * Every function accepts a caller-owned SQLite handle and never opens or
 * closes it. The DB-handle rule comes from `AGENTS.md` and is enforced
 * by the repository-level tests; callers are expected to obtain their
 * handle from `lib/db/client.ts` and pass it in.
 *
 * `ability_snapshots` is a current-state table keyed by
 * `(learner_id, node_id)`. `upsertAbilitySnapshot` writes the latest
 * projector output and overwrites prior rows for the same learner /
 * node pair. The Zod schemas in `lib/domain/ability.ts` are used at the
 * boundary to reject malformed input early so the repository is a thin
 * transport layer and the SQL surface remains auditable in one place.
 *
 * The `AbilitySnapshotRow` and `AbilityTransitionRow` types mirror the
 * underlying SQL columns verbatim in snake_case, so repository callers
 * pass and receive those exact keys (matching the `lib/domain/ability.ts`
 * Zod schemas).
 *
 * `ability_transitions` is append-only. The SQL UNIQUE constraint on
 * `(learner_id, node_id, input_fingerprint, projection_version)` is
 * enforced at the persistence boundary; the repository surfaces that as
 * a typed `RangeError` so the projector replay can be idempotent.
 *
 * `listAttemptNodeMappings` joins `attempt_node_mappings` with
 * `training_attempts` and filters voided rows out. The join returns the
 * narrow AttemptRef shape consumed by `abilityProjector.projectAbility`.
 */

type AbilitySnapshotTableRow = {
  readonly learner_id: string;
  readonly node_id: string;
  readonly visible_level: string;
  readonly confidence: string;
  readonly evidence_count: number;
  readonly stale: number;
  readonly input_fingerprint: string;
  readonly projection_version: string;
  readonly as_of_time: string;
};

type AbilityTransitionTableRow = {
  readonly id: string;
  readonly learner_id: string;
  readonly node_id: string;
  readonly previous_level: string;
  readonly new_level: string;
  readonly reason_codes_json: string;
  readonly source_attempt_ids_json: string;
  readonly source_attempt_revisions_json: string;
  readonly input_fingerprint: string;
  readonly projection_version: string;
  readonly created_at: string;
};

type MappingTableRow = {
  readonly mapping_id: string;
  readonly attempt_id: string;
  readonly node_id: string;
  readonly mapping_role: string;
  readonly mapping_reason: string;
  readonly mapping_created_at: string;
  readonly attempt_revision: number;
  readonly attempt_result: string;
  readonly attempt_voided_at: string | null;
  readonly attempt_started_at: string;
};

export type UpsertAbilitySnapshotInput = {
  readonly learner_id: AbilitySnapshotRow["learner_id"];
  readonly node_id: AbilitySnapshotRow["node_id"];
  readonly visible_level: AbilitySnapshotRow["visible_level"];
  readonly confidence: AbilitySnapshotRow["confidence"];
  readonly evidence_count: AbilitySnapshotRow["evidence_count"];
  readonly stale: AbilitySnapshotRow["stale"];
  readonly input_fingerprint: AbilitySnapshotRow["input_fingerprint"];
  readonly projection_version: AbilitySnapshotRow["projection_version"];
  readonly as_of_time: AbilitySnapshotRow["as_of_time"];
};

export type InsertAbilityTransitionInput = {
  readonly learner_id: AbilityTransitionRow["learner_id"];
  readonly node_id: AbilityTransitionRow["node_id"];
  readonly previous_level: AbilityTransitionRow["previous_level"];
  readonly new_level: AbilityTransitionRow["new_level"];
  readonly reason_codes: readonly string[];
  readonly source_attempt_ids: readonly string[];
  readonly source_attempt_revisions: readonly number[];
  readonly input_fingerprint: AbilityTransitionRow["input_fingerprint"];
  readonly projection_version: AbilityTransitionRow["projection_version"];
  readonly created_at: AbilityTransitionRow["created_at"];
};

/**
 * Return the current ability snapshot for `(learnerId, nodeId)`, or
 * `null` when none exists. Stale (`stale = true`) snapshots are
 * returned verbatim; the caller decides whether to surface them.
 */
export function findAbilitySnapshot(
  db: Database.Database,
  learnerId: string,
  nodeId: string,
): AbilitySnapshotRow | null {
  const row = db
    .prepare<[string, string], AbilitySnapshotTableRow>(
      `SELECT learner_id, node_id, visible_level, confidence,
              evidence_count, stale, input_fingerprint, projection_version,
              as_of_time
         FROM ability_snapshots
        WHERE learner_id = ? AND node_id = ?
        LIMIT 1`,
    )
    .get(learnerId, nodeId);
  return row === undefined ? null : fromSnapshotRow(row);
}

/**
 * Insert or replace the current ability snapshot for a single
 * `(learner_id, node_id)` pair. The Zod boundary validates every enum
 * member so malformed callers fail fast with a typed `ZodError`.
 */
export function upsertAbilitySnapshot(
  db: Database.Database,
  snapshot: UpsertAbilitySnapshotInput,
): void {
  const parsedVisible = AbilityLevelSchema.parse(snapshot.visible_level);
  const parsedConfidence = AbilityConfidenceSchema.parse(snapshot.confidence);
  if (
    !Number.isInteger(snapshot.evidence_count) ||
    snapshot.evidence_count < 0
  ) {
    throw new RangeError("evidence_count must be a non-negative integer");
  }
  db.prepare(
    `INSERT INTO ability_snapshots (
       learner_id, node_id, visible_level, confidence, evidence_count,
       stale, input_fingerprint, projection_version, as_of_time
     ) VALUES (
       @learner_id, @node_id, @visible_level, @confidence, @evidence_count,
       @stale, @input_fingerprint, @projection_version, @as_of_time
     )
     ON CONFLICT(learner_id, node_id) DO UPDATE SET
       visible_level = excluded.visible_level,
       confidence = excluded.confidence,
       evidence_count = excluded.evidence_count,
       stale = excluded.stale,
       input_fingerprint = excluded.input_fingerprint,
       projection_version = excluded.projection_version,
       as_of_time = excluded.as_of_time`,
  ).run({
    learner_id: snapshot.learner_id,
    node_id: snapshot.node_id,
    visible_level: parsedVisible,
    confidence: parsedConfidence,
    evidence_count: snapshot.evidence_count,
    stale: snapshot.stale ? 1 : 0,
    input_fingerprint: snapshot.input_fingerprint,
    projection_version: snapshot.projection_version,
    as_of_time: snapshot.as_of_time,
  });
}

/**
 * Append a single ability transition. The SQL UNIQUE constraint on
 * `(learner_id, node_id, input_fingerprint, projection_version)`
 * guarantees replay idempotency; the repository surfaces a duplicate
 * insert as a typed `RangeError` so callers can distinguish it from
 * arbitrary runtime errors.
 */
export function insertAbilityTransition(
  db: Database.Database,
  transition: InsertAbilityTransitionInput,
): AbilityTransitionRow {
  const parsedPrevious = AbilityLevelSchema.parse(transition.previous_level);
  const parsedNew = AbilityLevelSchema.parse(transition.new_level);
  const reasonJson = JSON.stringify([...transition.reason_codes]);
  const attemptIdsJson = JSON.stringify([...transition.source_attempt_ids]);
  const revisionsJson = JSON.stringify([
    ...transition.source_attempt_revisions,
  ]);
  const row: AbilityTransitionTableRow = {
    id: `transition_${randomUUID()}`,
    learner_id: transition.learner_id,
    node_id: transition.node_id,
    previous_level: parsedPrevious,
    new_level: parsedNew,
    reason_codes_json: reasonJson,
    source_attempt_ids_json: attemptIdsJson,
    source_attempt_revisions_json: revisionsJson,
    input_fingerprint: transition.input_fingerprint,
    projection_version: transition.projection_version,
    created_at: transition.created_at,
  };
  try {
    db.prepare(
      `INSERT INTO ability_transitions (
         id, learner_id, node_id, previous_level, new_level,
         reason_codes_json, source_attempt_ids_json,
         source_attempt_revisions_json, input_fingerprint,
         projection_version, created_at
       ) VALUES (
         @id, @learner_id, @node_id, @previous_level, @new_level,
         @reason_codes_json, @source_attempt_ids_json,
         @source_attempt_revisions_json, @input_fingerprint,
         @projection_version, @created_at
       )`,
    ).run({
      id: row.id,
      learner_id: row.learner_id,
      node_id: row.node_id,
      previous_level: row.previous_level,
      new_level: row.new_level,
      reason_codes_json: row.reason_codes_json,
      source_attempt_ids_json: row.source_attempt_ids_json,
      source_attempt_revisions_json: row.source_attempt_revisions_json,
      input_fingerprint: row.input_fingerprint,
      projection_version: row.projection_version,
      created_at: row.created_at,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (/UNIQUE constraint failed/.test(message)) {
      throw new RangeError(
        `Ability transition for (learner='${transition.learner_id}', node='${transition.node_id}', fingerprint='${transition.input_fingerprint}', version='${transition.projection_version}') already exists`,
      );
    }
    throw error;
  }
  return fromTransitionRow(row);
}

/**
 * Return every transition for `(learnerId, nodeId)` ordered by
 * `created_at` ascending then `id` ascending for deterministic tie
 * breaks. Pure read; no transactions required.
 */
export function listAbilityTransitions(
  db: Database.Database,
  learnerId: string,
  nodeId: string,
): AbilityTransitionRow[] {
  return db
    .prepare<[string, string], AbilityTransitionTableRow>(
      `SELECT id, learner_id, node_id, previous_level, new_level,
              reason_codes_json, source_attempt_ids_json,
              source_attempt_revisions_json, input_fingerprint,
              projection_version, created_at
         FROM ability_transitions
        WHERE learner_id = ? AND node_id = ?
        ORDER BY created_at ASC, id ASC`,
    )
    .all(learnerId, nodeId)
    .map(fromTransitionRow);
}

/**
 * Return every non-voided attempt-to-node mapping for the learner,
 * joined with the corresponding `training_attempts` row. The returned
 * shape mirrors the projector input's `{ mapping, attempt }` pair so
 * callers can hand the result straight to `projectAbility`.
 */
export function listAttemptNodeMappings(
  db: Database.Database,
  learnerId: string,
): ReadonlyArray<{
  readonly mapping: AttemptNodeMappingRow;
  readonly attempt: AttemptRef;
}> {
  // The repository joins through the local default learner profile by
  // surfacing every non-voided attempt with at least one mapping; the
  // `learner_id` argument is accepted for future per-learner filtering
  // (the V0 corpus has exactly one local learner) but the current
  // mapping table is not keyed by learner. We still scope the join so
  // callers can pass `local-default-learner` and have the function
  // resolve correctly when the schema gains an attempt-level learner
  // FK in a later phase.
  void learnerId;
  const rows = db
    .prepare<[], MappingTableRow>(
      `SELECT m.id          AS mapping_id,
              m.attempt_id  AS attempt_id,
              m.node_id     AS node_id,
              m.role        AS mapping_role,
              m.mapping_reason AS mapping_reason,
              m.created_at  AS mapping_created_at,
              a.revision    AS attempt_revision,
              a.result      AS attempt_result,
              a.voided_at   AS attempt_voided_at,
              a.started_at  AS attempt_started_at
         FROM attempt_node_mappings AS m
         JOIN training_attempts AS a
           ON a.id = m.attempt_id
        WHERE a.voided_at IS NULL
        ORDER BY a.started_at ASC, a.id ASC, m.created_at ASC`,
    )
    .all();
  return rows.map((row) => {
    const mapping = AttemptNodeMappingRowSchema.parse({
      id: row.mapping_id,
      attempt_id: row.attempt_id,
      node_id: row.node_id,
      role: row.mapping_role,
      mapping_reason: row.mapping_reason,
      created_at: row.mapping_created_at,
    });
    const attempt: AttemptRef = {
      id: row.attempt_id,
      revision: row.attempt_revision,
      result: parseAttemptResult(row.attempt_result),
      voided: row.attempt_voided_at !== null,
      startedAt: row.attempt_started_at,
    };
    return { mapping, attempt };
  });
}

function parseAttemptResult(value: string): AttemptRef["result"] {
  switch (value) {
    case "passed":
    case "failed":
    case "partial":
    case "stuck":
    case "draft":
      return value;
    default:
      throw new RangeError(`Unknown attempt result '${value}'`);
  }
}

function fromSnapshotRow(row: AbilitySnapshotTableRow): AbilitySnapshotRow {
  return AbilitySnapshotRowSchema.parse({
    learner_id: row.learner_id,
    node_id: row.node_id,
    visible_level: row.visible_level,
    confidence: row.confidence,
    evidence_count: row.evidence_count,
    stale: row.stale === 1,
    input_fingerprint: row.input_fingerprint,
    projection_version: row.projection_version,
    as_of_time: row.as_of_time,
  });
}

function fromTransitionRow(
  row: AbilityTransitionTableRow,
): AbilityTransitionRow {
  return AbilityTransitionRowSchema.parse({
    id: row.id,
    learner_id: row.learner_id,
    node_id: row.node_id,
    previous_level: row.previous_level,
    new_level: row.new_level,
    reason_codes_json: row.reason_codes_json,
    source_attempt_ids_json: row.source_attempt_ids_json,
    source_attempt_revisions_json: row.source_attempt_revisions_json,
    input_fingerprint: row.input_fingerprint,
    projection_version: row.projection_version,
    created_at: row.created_at,
  });
}