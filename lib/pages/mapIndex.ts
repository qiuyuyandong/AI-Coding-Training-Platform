import type Database from "better-sqlite3";
import {
  listCareerTracks,
  listKnowledgeEdges,
  listPublishedKnowledgeNodes,
  type CareerTrackRow,
  type KnowledgeEdgeRow,
  type KnowledgeNodeRow,
} from "@/lib/repositories/curriculum";

/**
 * V0 curriculum map index payload.
 *
 * The page renders list-first: nine direction summaries, then the
 * ordered 12-node keyboard-readable list as primary navigation, with a
 * supplementary `<details>`-collapsed static SVG visualisation of the
 * 13 prerequisite edges. The payload shape is exported so the unit
 * suite can assert on it without going through the React component.
 */
export type DirectionSummary = {
  readonly slug: string;
  readonly name: string;
  readonly purpose: string;
  readonly unavailableInV0: boolean;
};

export type NodeListItem = {
  readonly stableId: string;
  readonly title: string;
  readonly orderIndex: number;
  readonly status: KnowledgeNodeRow["status"];
  readonly detailHref: string;
};

export type EdgeView = {
  readonly fromStableId: string;
  readonly toStableId: string;
  readonly edgeType: KnowledgeEdgeRow["edge_type"];
};

export type MapIndexPayload = {
  readonly status: "available" | "empty";
  readonly packageId: string;
  readonly directions: readonly DirectionSummary[];
  readonly nodes: readonly NodeListItem[];
  readonly edges: readonly EdgeView[];
};

type CareerSummaryRecord = {
  readonly purpose?: unknown;
  readonly unavailable_in_v0?: unknown;
};

const EMPTY_PAYLOAD: MapIndexPayload = {
  status: "empty",
  packageId: "",
  directions: [],
  nodes: [],
  edges: [],
};

/**
 * Look up the most recently installed curriculum package. V0 has at most
 * one active published package at a time, but the schema allows several
 * rows. Newest by `installed_at` is the conventional "active" choice.
 */
export function findActiveCurriculumPackageId(
  db: Database.Database,
): string | null {
  const row = db
    .prepare<[], { readonly id: string }>(
      `SELECT id
         FROM curriculum_packages
         ORDER BY installed_at DESC, id DESC
         LIMIT 1`,
    )
    .get();
  return row === undefined ? null : row.id;
}

/**
 * Build the payload the map page renders. Pure function of the database
 * contents: no clock, no process state, no I/O. Returns an `empty`
 * payload when no curriculum package is installed so the page can show
 * the actionable empty state.
 */
export function buildMapIndex(db: Database.Database): MapIndexPayload {
  const packageId = findActiveCurriculumPackageId(db);
  if (packageId === null) {
    return EMPTY_PAYLOAD;
  }

  const trackRows = listCareerTracks(db, packageId);
  const directions = trackRows.map(toDirectionSummary);

  const nodeRows = listPublishedKnowledgeNodes(db, packageId);
  const nodes = nodeRows.map(toNodeListItem);

  const edgeRows = listKnowledgeEdges(db, packageId);
  const stableIdByNodeId = new Map<string, string>();
  for (const row of nodeRows) {
    stableIdByNodeId.set(row.id, row.stable_id);
  }
  const edges: EdgeView[] = [];
  for (const edge of edgeRows) {
    const from = stableIdByNodeId.get(edge.from_node_id);
    const to = stableIdByNodeId.get(edge.to_node_id);
    if (from === undefined || to === undefined) continue;
    edges.push({
      fromStableId: from,
      toStableId: to,
      edgeType: edge.edge_type,
    });
  }

  return {
    status: "available",
    packageId,
    directions,
    nodes,
    edges,
  };
}

function toDirectionSummary(row: CareerTrackRow): DirectionSummary {
  const parsed = parseCareerSummary(row.summary);
  return {
    slug: row.slug,
    name: row.name,
    purpose: parsed.purpose,
    unavailableInV0: parsed.unavailableInV0,
  };
}

function parseCareerSummary(raw: string): {
  readonly purpose: string;
  readonly unavailableInV0: boolean;
} {
  let value: CareerSummaryRecord;
  try {
    value = JSON.parse(raw) as CareerSummaryRecord;
  } catch {
    return { purpose: "", unavailableInV0: false };
  }
  return {
    purpose: typeof value.purpose === "string" ? value.purpose : "",
    unavailableInV0: value.unavailable_in_v0 === true,
  };
}

function toNodeListItem(row: KnowledgeNodeRow): NodeListItem {
  return {
    stableId: row.stable_id,
    title: row.title,
    orderIndex: row.order_index,
    status: row.status,
    detailHref: `/map/${row.stable_id}`,
  };
}