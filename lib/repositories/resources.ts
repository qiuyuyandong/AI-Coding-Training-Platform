import type Database from "better-sqlite3";

/**
 * V0 learning-resource and practice-mapping repository functions.
 *
 * Companion to `lib/repositories/curriculum.ts`. Functions accept a
 * caller-owned SQLite handle and return raw table rows as plain
 * objects. The DB-handle rule from `AGENTS.md` applies: callers obtain
 * their handle from `lib/db/client.ts` and pass it in; nothing in this
 * file opens or closes a database.
 *
 * Pure graph functions in `lib/services/curriculumGraph.ts` consume
 * these rows and translate them into eligibility snapshots. The raw
 * snake_case columns are kept here so the SQL surface is auditable in
 * one place.
 */

export type LearningResourceRow = {
  readonly id: string;
  readonly stable_id: string;
  readonly title: string;
  readonly url: string;
  readonly author: string;
  readonly language: string;
  readonly cost: string;
  readonly access: string;
  readonly license_boundary: string;
  readonly review_status: string;
  readonly reviewed_at: string;
  readonly stopping_guidance: string;
  readonly package_id: string;
};

export type PracticeTaskRow = {
  readonly id: string;
  readonly stable_id: string;
  readonly canonical_problem_id: string;
  readonly title: string;
  readonly kind: string;
  readonly difficulty_band: string;
  readonly package_id: string;
};

export type CanonicalProblemRow = {
  readonly id: string;
  readonly stable_id: string;
  readonly title: string;
};

export type CanonicalProblemSourceRow = {
  readonly id: string;
  readonly canonical_problem_id: string;
  readonly platform: string;
  readonly external_id: string;
  readonly url: string;
  readonly is_primary: number;
};

export type NodeResourceLinkRow = {
  readonly node_id: string;
  readonly resource_id: string;
  readonly role: string;
  readonly sort_order: number;
};

export type NodePracticeMappingRow = {
  readonly node_id: string;
  readonly practice_task_id: string;
  readonly measurement_role: string;
  readonly variant_family_id: string | null;
  readonly sort_order: number;
};

/**
 * Return the primary learning resource for a node, joining
 * `node_resources` with `learning_resources`. The `node_resources.role`
 * column is constrained to `'primary'` only, so the join is unique per
 * node in practice; the explicit `LIMIT 1` keeps the contract defensive
 * in case a future schema revision relaxes the CHECK.
 */
export function findLearningResourceByNode(
  db: Database.Database,
  nodeId: string,
): LearningResourceRow | null {
  const row = db
    .prepare<[string], LearningResourceRow>(
      `SELECT r.*
         FROM learning_resources r
         JOIN node_resources nr ON nr.resource_id = r.id
        WHERE nr.node_id = ?
        ORDER BY nr.sort_order ASC, r.stable_id ASC
        LIMIT 1`,
    )
    .get(nodeId);
  return row ?? null;
}

/**
 * List every practice task bound to a node via `node_practice_mappings`,
 * ordered by `sort_order` (then `stable_id` as a deterministic tie
 * breaker). The join guarantees a node with no mappings returns an
 * empty array rather than `null`.
 */
export function listPracticeTasksForNode(
  db: Database.Database,
  nodeId: string,
): PracticeTaskRow[] {
  return db
    .prepare<[string], PracticeTaskRow>(
      `SELECT t.*
         FROM practice_tasks t
         JOIN node_practice_mappings npm ON npm.practice_task_id = t.id
        WHERE npm.node_id = ?
        ORDER BY npm.sort_order ASC, t.stable_id ASC`,
    )
    .all(nodeId);
}

/**
 * Look up a canonical problem by its stable id. The stable id is the
 * package-side identifier and is unique by SQL constraint; the lookup
 * is therefore an index-friendly single-row query.
 */
export function findCanonicalProblemByStableId(
  db: Database.Database,
  stableId: string,
): CanonicalProblemRow | null {
  const row = db
    .prepare<[string], CanonicalProblemRow>(
      `SELECT *
         FROM canonical_problems
        WHERE stable_id = ?
        LIMIT 1`,
    )
    .get(stableId);
  return row ?? null;
}

/**
 * List every canonical source (platform + external_id + URL) for a
 * canonical problem, ordered by platform then external id. `is_primary`
 * is returned as the raw `0|1` integer written by the importer; the
 * boolean mapping is the caller's responsibility.
 */
export function listCanonicalProblemSources(
  db: Database.Database,
  canonicalProblemId: string,
): CanonicalProblemSourceRow[] {
  return db
    .prepare<[string], CanonicalProblemSourceRow>(
      `SELECT *
         FROM canonical_problem_sources
        WHERE canonical_problem_id = ?
        ORDER BY platform ASC, external_id ASC`,
    )
    .all(canonicalProblemId);
}