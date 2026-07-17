import type Database from "better-sqlite3";
import {
  findKnowledgeNodeByStableId,
  listKnowledgeEdges,
  listPublishedKnowledgeNodes,
  type KnowledgeEdgeRow,
  type KnowledgeNodeRow,
} from "@/lib/repositories/curriculum";
import {
  findLearningResourceByNode,
  listCanonicalProblemSources,
  listPracticeTasksForNode,
  type CanonicalProblemSourceRow,
  type LearningResourceRow,
  type PracticeTaskRow,
} from "@/lib/repositories/resources";
import { findAbilitySnapshot } from "@/lib/repositories/ability";
import { type AbilitySnapshotRow } from "@/lib/domain/ability";
import { explainLevel, type Explanation } from "@/lib/services/evidenceExplanation";
import { prerequisiteClosure, type KnowledgeEdge } from "@/lib/services/curriculumGraph";
import { LOCAL_DEFAULT_LEARNER_ID } from "@/lib/domain/learner";

/**
 * V0 curriculum node-detail payload.
 *
 * The detail page renders the node's outcome, rationale, prerequisite
 * closure (transitive `required_prerequisite` predecessors), the primary
 * reviewed resource with access / review / stopping metadata, the mapped
 * practice deep link, the node status and, when available, the current
 * learner's ability explanation. The payload is exported so the unit
 * suite can assert on its shape without going through the React
 * component.
 */
export type NodeDetailPayload =
  | {
      readonly status: "available";
      readonly packageId: string;
      readonly node: NodeDetailNode;
      readonly prerequisites: readonly string[];
      readonly resource: NodeDetailResource | null;
      readonly practice: NodeDetailPractice | null;
      readonly ability: NodeDetailAbility | null;
    }
  | {
      readonly status: "missing-package";
    }
  | {
      readonly status: "unknown-node";
      readonly requestedNodeId: string;
    };

export type NodeDetailNode = {
  readonly stableId: string;
  readonly title: string;
  readonly outcome: string;
  readonly rationale: string;
  readonly orderIndex: number;
  readonly status: KnowledgeNodeRow["status"];
  readonly provenance: NodeDetailProvenance;
};

export type NodeDetailProvenance = {
  readonly authority: string;
  readonly url: string;
  readonly retrievedAt: string;
};

export type NodeDetailResource = {
  readonly stableId: string;
  readonly title: string;
  readonly author: string;
  readonly language: string;
  readonly cost: string;
  readonly access: string;
  readonly licenseBoundary: string;
  readonly reviewStatus: string;
  readonly reviewedAt: string;
  readonly stoppingGuidance: string;
  readonly url: string;
};

export type NodeDetailPractice = {
  readonly stableId: string;
  readonly title: string;
  readonly kind: string;
  readonly difficultyBand: string;
  readonly primarySource: NodeDetailPracticeSource | null;
  readonly sources: readonly NodeDetailPracticeSource[];
};

export type NodeDetailPracticeSource = {
  readonly platform: string;
  readonly externalId: string;
  readonly url: string;
  readonly isPrimary: boolean;
};

export type NodeDetailAbility = {
  readonly visibleLevel: string;
  readonly confidence: string;
  readonly evidenceCount: number;
  readonly stale: boolean;
  readonly projectionVersion: string;
  readonly asOfTime: string;
  readonly explanation: Explanation;
};

type KnowledgeEdgeInput = {
  readonly from_stable_id: string;
  readonly to_stable_id: string;
  readonly edge_type: string;
};

/**
 * Build the node-detail payload for the given package-scoped stable id.
 * Returns `missing-package` when no curriculum package is installed and
 * `unknown-node` when the requested id does not match any published
 * node. The function never throws on application-level errors so the
 * page can call `notFound()` only when it is meaningful.
 */
export function buildNodeDetail(
  db: Database.Database,
  requestedNodeId: string,
): NodeDetailPayload {
  const packageRow = db
    .prepare<[], { readonly id: string }>(
      `SELECT id
         FROM curriculum_packages
         ORDER BY installed_at DESC, id DESC
         LIMIT 1`,
    )
    .get();
  if (packageRow === undefined) {
    return { status: "missing-package" };
  }
  const packageId = packageRow.id;

  const nodeRow = findKnowledgeNodeByStableId(db, packageId, requestedNodeId);
  if (nodeRow === null) {
    return { status: "unknown-node", requestedNodeId };
  }

  const allNodeRows = listPublishedKnowledgeNodes(db, packageId);
  const stableIdByNodeId = new Map<string, string>();
  for (const row of allNodeRows) {
    stableIdByNodeId.set(row.id, row.stable_id);
  }

  const edgeRows = listKnowledgeEdges(db, packageId);
  const edges: KnowledgeEdge[] = edgeRows
    .map((row) => toKnowledgeEdge(row, stableIdByNodeId))
    .filter((edge): edge is KnowledgeEdge => edge !== null);

  const prerequisites = prerequisiteClosure(requestedNodeId, edges);

  const resourceRow = findLearningResourceByNode(db, nodeRow.id);
  const resource = resourceRow === null ? null : toResource(resourceRow);

  const practiceTasks = listPracticeTasksForNode(db, nodeRow.id);
  const practice =
    practiceTasks.length === 0
      ? null
      : buildPractice(db, practiceTasks[0]);

  const ability = buildAbility(db, nodeRow.id);

  return {
    status: "available",
    packageId,
    node: toNode(nodeRow),
    prerequisites,
    resource,
    practice,
    ability,
  };
}

function toKnowledgeEdge(
  row: KnowledgeEdgeRow,
  stableIdByNodeId: ReadonlyMap<string, string>,
): KnowledgeEdgeInput | null {
  const from = stableIdByNodeId.get(row.from_node_id);
  const to = stableIdByNodeId.get(row.to_node_id);
  if (from === undefined || to === undefined) return null;
  return {
    from_stable_id: from,
    to_stable_id: to,
    edge_type: row.edge_type,
  };
}

function toNode(row: KnowledgeNodeRow): NodeDetailNode {
  const provenance = parseProvenance(row.provenance_json);
  return {
    stableId: row.stable_id,
    title: row.title,
    outcome: row.outcome,
    rationale: row.rationale,
    orderIndex: row.order_index,
    status: row.status,
    provenance,
  };
}

function parseProvenance(raw: string): NodeDetailProvenance {
  type Parsed = {
    readonly authority?: unknown;
    readonly url?: unknown;
    readonly retrieved_at?: unknown;
  };
  let value: Parsed;
  try {
    value = JSON.parse(raw) as Parsed;
  } catch {
    return { authority: "", url: "", retrievedAt: "" };
  }
  return {
    authority: typeof value.authority === "string" ? value.authority : "",
    url: typeof value.url === "string" ? value.url : "",
    retrievedAt:
      typeof value.retrieved_at === "string" ? value.retrieved_at : "",
  };
}

function toResource(row: LearningResourceRow): NodeDetailResource {
  return {
    stableId: row.stable_id,
    title: row.title,
    author: row.author,
    language: row.language,
    cost: row.cost,
    access: row.access,
    licenseBoundary: row.license_boundary,
    reviewStatus: row.review_status,
    reviewedAt: row.reviewed_at,
    stoppingGuidance: row.stopping_guidance,
    url: row.url,
  };
}

function buildPractice(
  db: Database.Database,
  task: PracticeTaskRow,
): NodeDetailPractice {
  const sources = listCanonicalProblemSources(db, task.canonical_problem_id);
  const mapped: NodeDetailPracticeSource[] = sources.map(toPracticeSource);
  const primary =
    mapped.find((source) => source.isPrimary) ?? mapped[0] ?? null;
  return {
    stableId: task.stable_id,
    title: task.title,
    kind: task.kind,
    difficultyBand: task.difficulty_band,
    primarySource: primary,
    sources: mapped,
  };
}

function toPracticeSource(
  row: CanonicalProblemSourceRow,
): NodeDetailPracticeSource {
  return {
    platform: row.platform,
    externalId: row.external_id,
    url: row.url,
    isPrimary: row.is_primary === 1,
  };
}

function buildAbility(
  db: Database.Database,
  nodeId: string,
): NodeDetailAbility | null {
  const snapshot = findAbilitySnapshot(db, LOCAL_DEFAULT_LEARNER_ID, nodeId);
  if (snapshot === null) return null;
  return toAbility(snapshot);
}

function toAbility(snapshot: AbilitySnapshotRow): NodeDetailAbility {
  const reasonCodes = parseJsonStringArray(snapshot.input_fingerprint);
  const explanation = explainLevel(
    snapshot.visible_level,
    snapshot.confidence,
    reasonCodes,
    [],
    [],
  );
  return {
    visibleLevel: snapshot.visible_level,
    confidence: snapshot.confidence,
    evidenceCount: snapshot.evidence_count,
    stale: snapshot.stale,
    projectionVersion: snapshot.projection_version,
    asOfTime: snapshot.as_of_time,
    explanation,
  };
}

function parseJsonStringArray(raw: string): readonly string[] {
  if (raw.length === 0) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((value): value is string => typeof value === "string");
  } catch {
    return [];
  }
}