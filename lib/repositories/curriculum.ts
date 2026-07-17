import type Database from "better-sqlite3";

/**
 * V0 curriculum catalog repository functions.
 *
 * Every function accepts a caller-owned SQLite handle and never opens or
 * closes it. The DB-handle rule comes from `AGENTS.md` and is enforced
 * by the repository-level tests; callers are expected to obtain their
 * handle from `lib/db/client.ts` and pass it in.
 *
 * The returned objects mirror the underlying SQL columns verbatim in
 * snake_case. Pure graph functions in `lib/services/curriculumGraph.ts`
 * own the responsibility of any type narrowing or provenance JSON
 * parsing; this module deliberately stays a thin transport layer so the
 * SQL surface is auditable in one place.
 */

export type KnowledgeNodeRow = {
  readonly id: string;
  readonly stable_id: string;
  readonly title: string;
  readonly outcome: string;
  readonly rationale: string;
  readonly order_index: number;
  readonly status: string;
  readonly provenance_json: string;
  readonly package_id: string;
};

export type KnowledgeEdgeRow = {
  readonly id: string;
  readonly from_node_id: string;
  readonly to_node_id: string;
  readonly edge_type: string;
};

export type CareerTrackRow = {
  readonly id: string;
  readonly slug: string;
  readonly name: string;
  readonly summary: string;
  readonly status: string;
  readonly package_id: string;
};

/**
 * List every `published` knowledge node for the package, ordered by
 * `order_index` ascending and breaking ties on `stable_id`. Non-published
 * rows (`planned`, `draft`, `deprecated`) are filtered out so callers
 * can iterate the recommended learning path without further filtering.
 */
export function listPublishedKnowledgeNodes(
  db: Database.Database,
  packageId: string,
): KnowledgeNodeRow[] {
  return db
    .prepare<[string], KnowledgeNodeRow>(
      `SELECT *
         FROM knowledge_nodes
        WHERE package_id = ? AND status = 'published'
        ORDER BY order_index ASC, stable_id ASC`,
    )
    .all(packageId);
}

/**
 * Look up a single knowledge node by its package-scoped stable id.
 * Returns `null` when the row does not exist; callers are responsible
 * for distinguishing missing nodes from nodes belonging to a different
 * package.
 */
export function findKnowledgeNodeByStableId(
  db: Database.Database,
  packageId: string,
  stableId: string,
): KnowledgeNodeRow | null {
  const row = db
    .prepare<[string, string], KnowledgeNodeRow>(
      `SELECT *
         FROM knowledge_nodes
        WHERE package_id = ? AND stable_id = ?
        LIMIT 1`,
    )
    .get(packageId, stableId);
  return row ?? null;
}

/**
 * List every knowledge edge that belongs to the package. The SQL joins
 * on both `from_node_id` and `to_node_id` so any edge whose either side
 * is a node of the package is returned. Output is deterministically
 * ordered so two callers receive byte-identical arrays.
 */
export function listKnowledgeEdges(
  db: Database.Database,
  packageId: string,
): KnowledgeEdgeRow[] {
  return db
    .prepare<[string, string], KnowledgeEdgeRow>(
      `SELECT e.*
         FROM knowledge_edges e
         JOIN knowledge_nodes n_from ON n_from.id = e.from_node_id
        WHERE n_from.package_id = ?
        UNION
       SELECT e.*
         FROM knowledge_edges e
         JOIN knowledge_nodes n_to ON n_to.id = e.to_node_id
        WHERE n_to.package_id = ?
        ORDER BY from_node_id ASC, to_node_id ASC, edge_type ASC`,
    )
    .all(packageId, packageId);
}

/**
 * Resolve a knowledge node row id from its package-scoped stable id.
 * Returns `null` when no matching row exists.
 */
export function findKnowledgeNodeIdByStableId(
  db: Database.Database,
  packageId: string,
  stableId: string,
): string | null {
  const row = db
    .prepare<[string, string], { readonly id: string }>(
      `SELECT id FROM knowledge_nodes WHERE package_id = ? AND stable_id = ? LIMIT 1`,
    )
    .get(packageId, stableId);
  return row?.id ?? null;
}

/**
 * Resolve a practice task row id from its package-scoped stable id.
 * Returns `null` when no matching row exists.
 */
export function findPracticeTaskIdByStableId(
  db: Database.Database,
  packageId: string,
  stableId: string,
): string | null {
  const row = db
    .prepare<[string, string], { readonly id: string }>(
      `SELECT id FROM practice_tasks WHERE package_id = ? AND stable_id = ? LIMIT 1`,
    )
    .get(packageId, stableId);
  return row?.id ?? null;
}

/**
 * List every career track for the package, ordered by `slug`. The
 * `summary` column is returned as the raw JSON string written by the
 * importer; parse-on-demand is the caller's responsibility.
 */
export function listCareerTracks(
  db: Database.Database,
  packageId: string,
): CareerTrackRow[] {
  return db
    .prepare<[string], CareerTrackRow>(
      `SELECT *
         FROM career_tracks
        WHERE package_id = ?
        ORDER BY slug ASC`,
    )
    .all(packageId);
}