import type Database from "better-sqlite3";
import {
  type KnowledgeEdgeRow,
  type KnowledgeNodeRow,
  listCareerTracks,
  listKnowledgeEdges,
  listPublishedKnowledgeNodes,
} from "@/lib/repositories/curriculum";
import {
  LOCAL_DEFAULT_LEARNER_ID,
  type LearnerGoalRow,
  type LearnerNodeBaselineRow,
} from "@/lib/domain/learner";
import {
  getOrCreateLocalProfile,
  listGoalHistory,
} from "@/lib/repositories/learnerProfiles";
import {
  findActivePlan,
  findLatestDailySnapshot,
  listPlanItems,
} from "@/lib/repositories/plans";
import type {
  DailyPlanSnapshotRow,
  PlanItemRow,
} from "@/lib/domain/plan";
import { type GoalTrackOption } from "@/components/GoalSetupPanel";
import { findActiveCurriculumPackageId } from "@/lib/pages/mapIndex";

/**
 * V0 `/plan` page payload.
 *
 * The page renders one of three states:
 *
 *   - `no_goal`: the learner has no active goal row. The page renders
 *     the goal-setup panel directly so the very first interaction can
 *     create the goal.
 *   - `pre_diagnosis`: a goal exists but no completed diagnostic
 *     session. The page shows the goal summary and prompts the learner
 *     to start the resumable six-prompt diagnosis.
 *   - `plan_overview`: at least one completed diagnostic session and a
 *     persisted daily plan exist. The page surfaces goal, mode,
 *     upcoming plan items with reasons, generator version and a link
 *     to the dedicated `/today` command surface.
 *
 * The exported payload type lets the unit suite assert on the page's
 * data shape without rendering React.
 */

export type PlanTrackOption = GoalTrackOption;

export type PlanGoalView = {
  readonly id: string;
  readonly primaryTrackId: string | null;
  readonly primaryTrackName: string | null;
  readonly interestTracks: readonly {
    readonly slug: string;
    readonly name: string;
  }[];
  readonly createdAt: string;
};

export type PlanUpcomingItem = {
  readonly itemId: string;
  readonly role: PlanItemRow["role"];
  readonly rank: number;
  readonly practiceTaskId: string;
  readonly nodeId: string;
  readonly nodeTitle: string;
  readonly orderIndex: number;
  readonly reasonCodes: readonly string[];
};

export type PlanOverviewView = {
  readonly dailySnapshotId: string;
  readonly dailyMode: DailyPlanSnapshotRow["dailyMode"];
  readonly effortBoundaryMinutes: DailyPlanSnapshotRow["effortBoundaryMinutes"];
  readonly generatorVersion: string;
  readonly createdAt: string;
  readonly items: readonly PlanUpcomingItem[];
};

export type PrerequisiteNodeView = {
  readonly stableId: string;
  readonly title: string;
  readonly orderIndex: number;
};

export type PlanPagePayload =
  | { readonly state: "no_goal"; readonly tracks: readonly PlanTrackOption[] }
  | {
      readonly state: "pre_diagnosis";
      readonly goal: PlanGoalView;
      readonly tracks: readonly PlanTrackOption[];
      readonly nextPromptId: string | null;
    }
  | {
      readonly state: "plan_overview";
      readonly goal: PlanGoalView;
      readonly tracks: readonly PlanTrackOption[];
      readonly overview: PlanOverviewView;
      readonly prerequisites: readonly PrerequisiteNodeView[];
      readonly baselines: readonly LearnerNodeBaselineRow[];
    };

/**
 * Build the payload the page renders. Pure of HTTP, pure of process
 * state; only reads from a caller-owned SQLite handle. Closes nothing.
 */
export function buildPlanPagePayload(db: Database.Database): PlanPagePayload {
  getOrCreateLocalProfile(db);
  const tracks = loadAvailableTracks(db);

  const activeGoal = findActiveGoalRow(db, LOCAL_DEFAULT_LEARNER_ID);
  if (activeGoal === null) {
    return { state: "no_goal", tracks };
  }
  const goalView = toGoalView(activeGoal, tracks);

  const completedSession = findCompletedDiagnosticSession(
    db,
    LOCAL_DEFAULT_LEARNER_ID,
  );
  if (completedSession === null) {
    const nextPromptId =
      loadNextPromptId(db) ?? FIRST_DIAGNOSIS_PROMPT;
    return {
      state: "pre_diagnosis",
      goal: goalView,
      tracks,
      nextPromptId,
    };
  }

  const overview = buildOverview(db);
  const prerequisites = buildPrerequisites(db, overview);
  const baselines = loadBaselines(db, LOCAL_DEFAULT_LEARNER_ID);
  return {
    state: "plan_overview",
    goal: goalView,
    tracks,
    overview,
    prerequisites,
    baselines,
  };
}

function loadAvailableTracks(db: Database.Database): readonly PlanTrackOption[] {
  const packageId = findActiveCurriculumPackageId(db);
  if (packageId === null) return [];
  const rows = listCareerTracks(db, packageId);
  return rows
    .filter((row) => row.status === "published")
    .map((row) => ({ slug: row.slug, name: row.name }));
}

function findActiveGoalRow(
  db: Database.Database,
  learnerId: string,
): LearnerGoalRow | null {
  for (const goal of listGoalHistory(db, learnerId)) {
    if (goal.status === "active") return goal;
  }
  return null;
}

function toGoalView(
  goal: LearnerGoalRow,
  tracks: readonly PlanTrackOption[],
): PlanGoalView {
  const trackBySlug = new Map<string, PlanTrackOption>();
  for (const track of tracks) {
    trackBySlug.set(track.slug, track);
  }
  const primaryName =
    goal.primaryTrackId === null
      ? null
      : (trackBySlug.get(goal.primaryTrackId)?.name ?? goal.primaryTrackId);
  const interestTracks = goal.interestTrackIds.map((slug) => ({
    slug,
    name: trackBySlug.get(slug)?.name ?? slug,
  }));
  return {
    id: goal.id,
    primaryTrackId: goal.primaryTrackId,
    primaryTrackName: primaryName,
    interestTracks,
    createdAt: goal.createdAt,
  };
}

function findCompletedDiagnosticSession(
  db: Database.Database,
  learnerId: string,
): { readonly id: string } | null {
  const row = db
    .prepare<[string], { readonly id: string }>(
      `SELECT id
         FROM diagnostic_sessions
        WHERE learner_id = ? AND status = 'completed'
        ORDER BY completed_at DESC, id DESC
        LIMIT 1`,
    )
    .get(learnerId);
  return row === undefined ? null : row;
}

function loadNextPromptId(db: Database.Database): string | null {
  const session = db
    .prepare<[string], { readonly id: string }>(
      `SELECT id
         FROM diagnostic_sessions
        WHERE learner_id = ? AND status = 'in_progress'
        ORDER BY started_at DESC, id DESC
        LIMIT 1`,
    )
    .get(LOCAL_DEFAULT_LEARNER_ID);
  if (session === undefined) return null;
  const answered = db
    .prepare<[string], { readonly prompt_id: string }>(
      `SELECT prompt_id FROM diagnostic_responses WHERE session_id = ?`,
    )
    .all(session.id)
    .map((row) => row.prompt_id);
  const answeredSet = new Set(answered);
  const prompts = [
    "cpp-basics",
    "containers-functions",
    "debugging-testing",
    "git-build",
    "complexity-search-structures",
    "trees-graphs",
  ];
  for (const promptId of prompts) {
    if (!answeredSet.has(promptId)) return promptId;
  }
  return null;
}

const FIRST_DIAGNOSIS_PROMPT = "cpp-basics";

function buildOverview(db: Database.Database): PlanOverviewView {
  const empty: PlanOverviewView = {
    dailySnapshotId: "",
    dailyMode: "learn",
    effortBoundaryMinutes: 30,
    generatorVersion: "",
    createdAt: "",
    items: [],
  };
  const activePlan = findActivePlan(db, LOCAL_DEFAULT_LEARNER_ID);
  if (activePlan === null) return empty;
  const snapshot = findLatestDailySnapshot(db, activePlan.id);
  if (snapshot === null) return empty;
  const items = listPlanItems(db, snapshot.id);
  const stableIdByRowId = loadStableIdLookup(db);
  const nodeTitleByStableId = loadNodeTitleLookup(db, items, stableIdByRowId);
  const upcoming: PlanUpcomingItem[] = items.map((item) => {
    const stableId = stableIdByRowId.get(item.nodeId) ?? item.nodeId;
    const meta = nodeTitleByStableId.get(stableId);
    return {
      itemId: item.id,
      role: item.role,
      rank: item.rank,
      practiceTaskId: item.practiceTaskId,
      nodeId: stableId,
      nodeTitle: meta?.title ?? stableId,
      orderIndex: meta?.orderIndex ?? 0,
      reasonCodes: parseReasonCodes(item.reasonCodesJson),
    };
  });
  upcoming.sort((a, b) => {
    if (a.rank !== b.rank) return a.rank - b.rank;
    if (a.nodeId < b.nodeId) return -1;
    if (a.nodeId > b.nodeId) return 1;
    return 0;
  });
  return {
    dailySnapshotId: snapshot.id,
    dailyMode: snapshot.dailyMode,
    effortBoundaryMinutes: snapshot.effortBoundaryMinutes,
    generatorVersion: snapshot.generatorVersion,
    createdAt: snapshot.createdAt,
    items: upcoming,
  };
}

function loadStableIdLookup(
  db: Database.Database,
): ReadonlyMap<string, string> {
  const lookup = new Map<string, string>();
  const packageId = findActiveCurriculumPackageId(db);
  if (packageId === null) return lookup;
  for (const node of listPublishedKnowledgeNodes(db, packageId)) {
    lookup.set(node.id, node.stable_id);
  }
  return lookup;
}

function loadNodeTitleLookup(
  db: Database.Database,
  items: readonly PlanItemRow[],
  stableIdByRowId: ReadonlyMap<string, string>,
): ReadonlyMap<string, { readonly title: string; readonly orderIndex: number }> {
  const lookup = new Map<
    string,
    { readonly title: string; readonly orderIndex: number }
  >();
  const packageId = findActiveCurriculumPackageId(db);
  if (packageId === null) return lookup;
  const stableIds = new Set<string>();
  for (const item of items) {
    const stableId = stableIdByRowId.get(item.nodeId) ?? item.nodeId;
    stableIds.add(stableId);
  }
  if (stableIds.size === 0) return lookup;
  const stableIdList = [...stableIds];
  const placeholders = stableIdList.map(() => "?").join(", ");
  type Row = {
    readonly stable_id: string;
    readonly title: string;
    readonly order_index: number;
  };
  const params: string[] = [packageId, ...stableIdList];
  const statement = db.prepare<string[], Row>(
    `SELECT stable_id, title, order_index
       FROM knowledge_nodes
      WHERE package_id = ?
        AND stable_id IN (${placeholders})`,
  );
  const rows = statement.all(...params);
  for (const row of rows) {
    lookup.set(row.stable_id, {
      title: row.title,
      orderIndex: row.order_index,
    });
  }
  return lookup;
}

function buildPrerequisites(
  db: Database.Database,
  overview: PlanOverviewView,
): readonly PrerequisiteNodeView[] {
  const packageId = findActiveCurriculumPackageId(db);
  if (packageId === null || overview.items.length === 0) return [];
  const primaryNodeStableId = overview.items[0]?.nodeId;
  if (primaryNodeStableId === undefined) return [];
  const edges: readonly KnowledgeEdgeRow[] = listKnowledgeEdges(db, packageId);
  const nodes: readonly KnowledgeNodeRow[] = listPublishedKnowledgeNodes(
    db,
    packageId,
  );
  const stableIdByRowId = new Map<string, string>();
  const nodeByStableId = new Map<string, KnowledgeNodeRow>();
  for (const row of nodes) {
    stableIdByRowId.set(row.id, row.stable_id);
    nodeByStableId.set(row.stable_id, row);
  }
  const predecessors = new Set<string>();
  for (const edge of edges) {
    if (edge.edge_type !== "required_prerequisite") continue;
    const toStable = stableIdByRowId.get(edge.to_node_id);
    const fromStable = stableIdByRowId.get(edge.from_node_id);
    if (toStable === undefined || fromStable === undefined) continue;
    if (toStable === primaryNodeStableId) {
      predecessors.add(fromStable);
    }
  }
  const result: PrerequisiteNodeView[] = [];
  for (const stableId of [...predecessors].sort()) {
    const node = nodeByStableId.get(stableId);
    if (node === undefined) continue;
    result.push({
      stableId: node.stable_id,
      title: node.title,
      orderIndex: node.order_index,
    });
  }
  return result;
}

function loadBaselines(
  db: Database.Database,
  learnerId: string,
): readonly LearnerNodeBaselineRow[] {
  type Row = {
    readonly learner_id: string;
    readonly node_id: string;
    readonly baseline: string;
    readonly confidence: string;
    readonly source: string;
    readonly updated_at: string;
  };
  const rows = db
    .prepare<[string], Row>(
      `SELECT learner_id, node_id, baseline, confidence, source, updated_at
         FROM learner_node_baselines
        WHERE learner_id = ?
        ORDER BY node_id ASC`,
    )
    .all(learnerId);
  const stableIdByRowId = loadStableIdLookup(db);
  return rows.map((row) => {
    const stableId = stableIdByRowId.get(row.node_id) ?? row.node_id;
    return {
      learnerId: row.learner_id,
      nodeId: stableId,
      baseline: row.baseline as LearnerNodeBaselineRow["baseline"],
      confidence: row.confidence as LearnerNodeBaselineRow["confidence"],
      source: row.source as LearnerNodeBaselineRow["source"],
      updatedAt: row.updated_at,
    };
  });
}

function parseReasonCodes(raw: string): readonly string[] {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed.filter((entry): entry is string => typeof entry === "string");
    }
  } catch {
    // The JSON column is written by the same module that reads it; any
    // non-array content is intentionally surfaced as an empty list.
  }
  return [];
}