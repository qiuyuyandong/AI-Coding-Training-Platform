import type Database from "better-sqlite3";
import {
  type KnowledgeEdge,
  type KnowledgeEdgeType,
  type KnowledgeNode,
  type KnowledgeNodeStatus,
} from "@/lib/domain/curriculum";

export type { KnowledgeEdge, KnowledgeEdgeType, KnowledgeNode, KnowledgeNodeStatus };
import {
  listKnowledgeEdges,
  listPublishedKnowledgeNodes,
  type CareerTrackRow,
  type KnowledgeEdgeRow,
  type KnowledgeNodeRow,
} from "@/lib/repositories/curriculum";
import {
  findLearningResourceByNode,
  listPracticeTasksForNode,
  type LearningResourceRow,
  type PracticeTaskRow,
} from "@/lib/repositories/resources";

/**
 * Pure V0 curriculum graph helpers.
 *
 * Everything in this module except `loadGraphFromRepository` is a pure
 * function that never imports or touches SQLite. The repositories in
 * `lib/repositories/curriculum.ts` and `lib/repositories/resources.ts`
 * own all I/O; this module's job is to translate raw rows into typed
 * snapshots and run deterministic graph algorithms on them.
 *
 * Reason-code vocabulary for the V0 `evaluateNodeEligibility` helper
 * (Todo 6):
 *   - `planned`, `draft`, `deprecated` come straight from the node's
 *     stored status. Any non-`published` node is unreachable from a
 *     recommendation query.
 *   - `missing_reviewed_resource` is reported when a published node has
 *     no primary learning resource whose `review_status === 'reviewed'`.
 *   - `missing_practice_mapping` is reported when a published node has
 *     zero practice tasks bound through `node_practice_mappings`.
 *   - `available` is the only "go" signal.
 *
 * The full prerequisite + diagnostic eligibility expansion is owned by
 * Todo 10 (`lib/services/prerequisiteAnalysis.ts`); this module does not
 * import it and only accepts its inputs as data.
 */

/**
 * Stable, exhaustive set of eligibility reason codes emitted by the
 * graph helpers. Callers should `switch` on `reasonCode` and refuse to
 * compile when a new code is added in a future Todo.
 */
export const ELIGIBILITY_REASON_CODES = {
  planned: "planned",
  draft: "draft",
  deprecated: "deprecated",
  missingReviewedResource: "missing_reviewed_resource",
  missingPracticeMapping: "missing_practice_mapping",
  available: "available",
} as const;

export type EligibilityReasonCode =
  (typeof ELIGIBILITY_REASON_CODES)[keyof typeof ELIGIBILITY_REASON_CODES];

/**
 * Discriminated result of `evaluateNodeEligibility`. `status` is the
 * high-level recommendation signal; `reasonCode` is a stable enum the
 * UI can switch on without parsing free text. `message` is the optional
 * human-readable string callers may surface when `status` is
 * `unavailable`.
 */
export type EligibilityResult =
  | {
      readonly status: "available";
      readonly reasonCode: "available";
    }
  | {
      readonly status: "unavailable";
      readonly reasonCode: Exclude<EligibilityReasonCode, "available">;
      readonly message: string;
    };

/**
 * Resource availability snapshot for a single node. The optional
 * `reviewStatus` lets eligibility checks short-circuit on the review
 * state without touching the resource row.
 */
export type ResourceSnapshot = {
  readonly primary: LearningResourceRow | null;
  readonly reviewStatus: string | null;
};

/**
 * Practice availability snapshot for a single node. An empty `tasks`
 * list is the signal for `missing_practice_mapping`.
 */
export type PracticeSnapshot = {
  readonly tasks: readonly PracticeTaskRow[];
};

/**
 * Prerequisite snapshot for a single node. `stableIds` is the transitive
 * `required_prerequisite` closure (excluding the node itself), sorted
 * deterministically. The optional `baselines` parameter is reserved for
 * the later diagnostic-aware eligibility analysis and is unused in
 * Todo 6.
 */
export type PrerequisiteSnapshot = {
  readonly stableIds: readonly string[];
};

/**
 * A learner-facing node baseline placeholder. The shape mirrors the
 * persistence-side columns expected by the future prerequisite-analysis
 * service. Unused by Todo 6; accepted here so call sites can be wired
 * up before that service exists.
 */
export type BaselineSnapshot = {
  readonly baseline: string;
  readonly confidence: string;
};

/**
 * Bundle produced by `loadGraphFromRepository`. The shape is the
 * minimal input every pure helper in this file needs to do its work
 * without re-issuing SQL.
 */
export type GraphSnapshot = {
  readonly nodes: readonly KnowledgeNode[];
  readonly edges: readonly KnowledgeEdge[];
  readonly resourcesByNode: ReadonlyMap<string, ResourceSnapshot>;
  readonly practicesByNode: ReadonlyMap<string, PracticeSnapshot>;
  readonly prerequisitesByNode: ReadonlyMap<string, PrerequisiteSnapshot>;
  readonly careerTracks: readonly CareerTrackRow[];
};

/**
 * Thrown by `orderPublishedNodes` when the supplied edges still form a
 * cycle. The validator at `lib/curriculum/validatePackage.ts` already
 * rejects cyclic packages at import time, so this only fires when a
 * caller passes a synthetic graph (typically in tests).
 */
export class CurriculumCycleError extends Error {
  constructor() {
    super("Knowledge graph contains a cycle");
    this.name = "CurriculumCycleError";
  }
}

/**
 * Order nodes topologically, respecting only `required_prerequisite`
 * edges. `recommended_prerequisite` edges are ignored so the
 * recommended-path shape does not silently change the deterministic
 * "ordered published nodes" contract.
 *
 * The output is deterministic: Kahn's algorithm processes in-degree-zero
 * nodes in `(order_index ASC, stable_id ASC)` order and each node's
 * successors are visited in the same order. The function throws
 * `CurriculumCycleError` when the graph contains a cycle; in that
 * case the partial result is discarded.
 */
export function orderPublishedNodes(
  nodes: readonly KnowledgeNode[],
  edges: readonly KnowledgeEdge[],
): KnowledgeNode[] {
  const nodesByStableId = new Map<string, KnowledgeNode>();
  for (const node of nodes) {
    nodesByStableId.set(node.stable_id, node);
  }

  const adjacency = new Map<string, string[]>();
  const inDegree = new Map<string, number>();
  for (const node of nodes) {
    adjacency.set(node.stable_id, []);
    inDegree.set(node.stable_id, 0);
  }
  for (const edge of edges) {
    if (edge.edge_type !== "required_prerequisite") continue;
    if (!nodesByStableId.has(edge.from_stable_id)) continue;
    if (!nodesByStableId.has(edge.to_stable_id)) continue;
    const next = adjacency.get(edge.from_stable_id);
    if (next === undefined) continue;
    next.push(edge.to_stable_id);
    inDegree.set(
      edge.to_stable_id,
      (inDegree.get(edge.to_stable_id) ?? 0) + 1,
    );
  }

  const sortedNodes = [...nodes].sort(compareKnowledgeNodes);
  const initialQueue: string[] = [];
  for (const node of sortedNodes) {
    const degree = inDegree.get(node.stable_id) ?? 0;
    if (degree === 0) {
      initialQueue.push(node.stable_id);
    }
  }

  const result: KnowledgeNode[] = [];
  const queue: string[] = [...initialQueue];
  while (queue.length > 0) {
    const current = queue.shift();
    if (current === undefined) break;
    const node = nodesByStableId.get(current);
    if (node === undefined) continue;
    result.push(node);

    const successors = adjacency.get(current) ?? [];
    const sortedSuccessors = [...successors].sort((a, b) =>
      compareStableIds(nodesByStableId, a, b),
    );
    for (const successor of sortedSuccessors) {
      const nextDegree = (inDegree.get(successor) ?? 0) - 1;
      inDegree.set(successor, nextDegree);
      if (nextDegree === 0) {
        queue.push(successor);
      }
    }
  }

  if (result.length !== nodes.length) {
    throw new CurriculumCycleError();
  }
  return result;
}

/**
 * Transitive closure of `required_prerequisite` predecessors of the
 * given stable id. The node itself is **not** included in the result.
 * Recommended edges are ignored. Output is sorted lexicographically by
 * stable id so two callers with identical input receive byte-identical
 * arrays.
 */
export function prerequisiteClosure(
  stableId: string,
  edges: readonly KnowledgeEdge[],
): string[] {
  const predecessorsByTarget = buildPredecessorMap(edges);
  return transitiveNeighbors(stableId, predecessorsByTarget).sort();
}

/**
 * Direct and transitive successors of the given stable id via
 * `required_prerequisite` edges. The node itself is **not** included.
 * Output is sorted lexicographically by stable id.
 */
export function successors(
  stableId: string,
  edges: readonly KnowledgeEdge[],
): string[] {
  const successorsBySource = buildSuccessorMap(edges);
  return transitiveNeighbors(stableId, successorsBySource).sort();
}

/**
 * Pure eligibility check. The order of the checks is the order of
 * precedence:
 *
 *   1. The node's stored status. Anything other than `published` is
 *      unavailable with the matching reason code.
 *   2. For `published` nodes: a missing or non-`reviewed` primary
 *      resource yields `missing_reviewed_resource`.
 *   3. For `published` nodes with a reviewed primary resource: a
 *      missing practice mapping yields `missing_practice_mapping`.
 *   4. Otherwise: `available`.
 *
 * The `prerequisites` and `baselines` parameters are accepted for
 * forward compatibility with the Todo 10 prerequisite-analysis service
 * but do not influence the result in Todo 6.
 */
export function evaluateNodeEligibility(
  node: KnowledgeNode,
  resources: ResourceSnapshot,
  practices: PracticeSnapshot,
  prerequisites: PrerequisiteSnapshot = { stableIds: [] },
  baselines: BaselineSnapshot | null = null,
): EligibilityResult {
  if (node.status === "planned") {
    return {
      status: "unavailable",
      reasonCode: "planned",
      message: `Node ${node.stable_id} is planned and not yet available`,
    };
  }
  if (node.status === "draft") {
    return {
      status: "unavailable",
      reasonCode: "draft",
      message: `Node ${node.stable_id} is in draft and not yet published`,
    };
  }
  if (node.status === "deprecated") {
    return {
      status: "unavailable",
      reasonCode: "deprecated",
      message: `Node ${node.stable_id} is deprecated`,
    };
  }
  if (
    resources.primary === null ||
    resources.reviewStatus === null ||
    resources.reviewStatus !== "reviewed"
  ) {
    return {
      status: "unavailable",
      reasonCode: "missing_reviewed_resource",
      message: `Node ${node.stable_id} has no reviewed primary resource`,
    };
  }
  if (practices.tasks.length === 0) {
    return {
      status: "unavailable",
      reasonCode: "missing_practice_mapping",
      message: `Node ${node.stable_id} has no practice mapping`,
    };
  }
  // `prerequisites` and `baselines` are reserved for Todo 10; touching
  // them here would couple this module to a service that does not exist
  // yet. Reading the values once keeps the parameter list honest.
  void prerequisites;
  void baselines;
  return {
    status: "available",
    reasonCode: "available",
  };
}

/**
 * Read every published node, every package edge, and the matching
 * resource/practice snapshots for the given package, and shape them
 * into a single `GraphSnapshot` the pure helpers can consume without
 * touching SQLite again. This is the only export in this module that
 * reads the database.
 */
export async function loadGraphFromRepository(
  db: Database.Database,
  packageId: string,
): Promise<GraphSnapshot> {
  const nodeRows = listPublishedKnowledgeNodes(db, packageId);
  const edgeRows = listKnowledgeEdges(db, packageId);

  const stableIdByNodeId = new Map<string, string>();
  for (const row of nodeRows) {
    stableIdByNodeId.set(row.id, row.stable_id);
  }

  const nodes: KnowledgeNode[] = nodeRows.map((row) => fromNodeRow(row));
  const edges: KnowledgeEdge[] = edgeRows.map((row) =>
    fromEdgeRow(row, stableIdByNodeId),
  );

  const resourcesByNode = new Map<string, ResourceSnapshot>();
  const practicesByNode = new Map<string, PracticeSnapshot>();
  for (const row of nodeRows) {
    const resourceRow = findLearningResourceByNode(db, row.id);
    resourcesByNode.set(row.stable_id, {
      primary: resourceRow,
      reviewStatus: resourceRow?.review_status ?? null,
    });
    const tasks = listPracticeTasksForNode(db, row.id);
    practicesByNode.set(row.stable_id, { tasks });
  }

  const prerequisitesByNode = new Map<string, PrerequisiteSnapshot>();
  for (const node of nodes) {
    const stableIds = prerequisiteClosure(node.stable_id, edges);
    prerequisitesByNode.set(node.stable_id, { stableIds });
  }

  // `career_tracks` is loaded directly so the same snapshot can drive a
  // future map/direction UI without an extra round-trip. Reading it
  // here is cheap and keeps the graph snapshot complete.
  const careerTracks = readCareerTracks(db, packageId);

  return {
    nodes,
    edges,
    resourcesByNode,
    practicesByNode,
    prerequisitesByNode,
    careerTracks,
  };
}

function readCareerTracks(
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

function fromNodeRow(row: KnowledgeNodeRow): KnowledgeNode {
  // `provenance_json` was written by the importer after Zod validation,
  // so re-parsing it is safe. `stopping_guidance` is intentionally not
  // stored on `knowledge_nodes` (the V0 schema keeps the field on the
  // package-side manifest only); callers that need it must re-load the
  // package from disk.
  const provenance = JSON.parse(row.provenance_json) as KnowledgeNode["provenance"];
  const stoppingGuidance = "";
  return {
    stable_id: row.stable_id,
    title: row.title,
    outcome: row.outcome,
    rationale: row.rationale,
    order_index: row.order_index,
    status: row.status as KnowledgeNodeStatus,
    provenance,
    stopping_guidance: stoppingGuidance,
  };
}

function fromEdgeRow(
  row: KnowledgeEdgeRow,
  stableIdByNodeId: ReadonlyMap<string, string>,
): KnowledgeEdge {
  // Resolve the SQL `node_<stable_id>` row id back to the bare stable
  // id through the lookup map built from the published nodes. This
  // keeps the conversion explicit and free of string-prefix assumptions
  // that would silently break if the importer ever changed its id
  // scheme.
  const fromStableId = stableIdByNodeId.get(row.from_node_id);
  const toStableId = stableIdByNodeId.get(row.to_node_id);
  if (fromStableId === undefined || toStableId === undefined) {
    throw new Error(
      `Edge ${row.id} references unknown node id (${row.from_node_id} -> ${row.to_node_id})`,
    );
  }
  // `edge_type` is stored as the canonical Zod enum string and is
  // validated by the import CHECK constraint. Re-validating here would
  // couple the graph helper to the schema module for no real gain; the
  // TS cast keeps the row transport self-contained.
  return {
    from_stable_id: fromStableId,
    to_stable_id: toStableId,
    edge_type: row.edge_type as KnowledgeEdge["edge_type"],
  };
}

function compareKnowledgeNodes(
  a: KnowledgeNode,
  b: KnowledgeNode,
): number {
  if (a.order_index !== b.order_index) {
    return a.order_index - b.order_index;
  }
  if (a.stable_id < b.stable_id) return -1;
  if (a.stable_id > b.stable_id) return 1;
  return 0;
}

function compareStableIds(
  nodesByStableId: ReadonlyMap<string, KnowledgeNode>,
  a: string,
  b: string,
): number {
  const nodeA = nodesByStableId.get(a);
  const nodeB = nodesByStableId.get(b);
  if (nodeA !== undefined && nodeB !== undefined) {
    return compareKnowledgeNodes(nodeA, nodeB);
  }
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
}

function buildPredecessorMap(
  edges: readonly KnowledgeEdge[],
): ReadonlyMap<string, ReadonlySet<string>> {
  const map = new Map<string, Set<string>>();
  for (const edge of edges) {
    if (edge.edge_type !== "required_prerequisite") continue;
    const bucket = map.get(edge.to_stable_id);
    if (bucket === undefined) {
      map.set(edge.to_stable_id, new Set([edge.from_stable_id]));
    } else {
      bucket.add(edge.from_stable_id);
    }
  }
  return map;
}

function buildSuccessorMap(
  edges: readonly KnowledgeEdge[],
): ReadonlyMap<string, ReadonlySet<string>> {
  const map = new Map<string, Set<string>>();
  for (const edge of edges) {
    if (edge.edge_type !== "required_prerequisite") continue;
    const bucket = map.get(edge.from_stable_id);
    if (bucket === undefined) {
      map.set(edge.from_stable_id, new Set([edge.to_stable_id]));
    } else {
      bucket.add(edge.to_stable_id);
    }
  }
  return map;
}

function transitiveNeighbors(
  start: string,
  adjacency: ReadonlyMap<string, ReadonlySet<string>>,
): string[] {
  const visited = new Set<string>();
  const queue: string[] = [];
  const direct = adjacency.get(start);
  if (direct !== undefined) {
    for (const neighbor of direct) {
      queue.push(neighbor);
    }
  }
  while (queue.length > 0) {
    const current = queue.shift();
    if (current === undefined) break;
    if (visited.has(current)) continue;
    visited.add(current);
    const next = adjacency.get(current);
    if (next === undefined) continue;
    for (const neighbor of next) {
      if (!visited.has(neighbor)) {
        queue.push(neighbor);
      }
    }
  }
  return [...visited];
}