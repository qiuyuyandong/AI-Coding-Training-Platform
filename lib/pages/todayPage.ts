import type Database from "better-sqlite3";
import { LOCAL_DEFAULT_LEARNER_ID } from "@/lib/domain/learner";
import type {
  DailyMode,
  EffortBoundaryMinutes,
  PlanItemRow,
} from "@/lib/domain/plan";
import {
  findActivePlan,
  findLatestDailySnapshot,
  listPlanItems,
} from "@/lib/repositories/plans";
import { getOrCreateLocalProfile } from "@/lib/repositories/learnerProfiles";
import {
  type TodayTaskPanelAlternative,
  type TodayTaskPanelPracticeLink,
  type TodayTaskPanelResourceLink,
} from "@/components/TodayTaskPanel";
import { findActiveCurriculumPackageId } from "@/lib/pages/mapIndex";

/**
 * V0 `/today` one-task command surface (Todo 19).
 *
 * The page renders exactly one primary plan item with its title, mode,
 * effort boundary, deterministic reason codes and canonical deep links.
 * Alternatives stay inside a collapsed `<details>` section. The
 * `EffortBoundarySelector` is a small client component that POSTs to the
 * feedback endpoint and triggers a successor daily-plan snapshot when
 * the boundary changes.
 *
 * The exported payload type lets the unit suite assert on the page's
 * data shape without rendering React.
 */

export type TodayPrimaryView = {
  readonly planItemId: string;
  readonly nodeId: string;
  readonly nodeTitle: string;
  readonly nodeOutcome: string;
  readonly practiceTaskTitle: string;
  readonly reasonCodes: readonly string[];
  readonly practiceLinks: readonly TodayTaskPanelPracticeLink[];
  readonly resourceLinks: readonly TodayTaskPanelResourceLink[];
  readonly mapHref: string;
};

export type TodayPayload =
  | {
      readonly state: "no_plan";
    }
  | {
      readonly state: "no_snapshot";
      readonly planId: string;
    }
  | {
      readonly state: "available";
      readonly planId: string;
      readonly snapshotId: string;
      readonly dailyMode: DailyMode;
      readonly effortBoundaryMinutes: EffortBoundaryMinutes;
      readonly generatorVersion: string;
      readonly primary: TodayPrimaryView;
      readonly alternatives: readonly TodayTaskPanelAlternative[];
      readonly fallbackExplanation: string | null;
      readonly acceptedActions: readonly string[];
      readonly completed: boolean;
    };

/**
 * Build the payload the page renders. Pure of HTTP, pure of process
 * state; only reads from a caller-owned SQLite handle. Closes nothing.
 */
export function buildTodayPagePayload(db: Database.Database): TodayPayload {
  getOrCreateLocalProfile(db);
  const activePlan = findActivePlan(db, LOCAL_DEFAULT_LEARNER_ID);
  if (activePlan === null) {
    return { state: "no_plan" };
  }
  const snapshot = findLatestDailySnapshot(db, activePlan.id);
  if (snapshot === null) {
    return { state: "no_snapshot", planId: activePlan.id };
  }
  const items = listPlanItems(db, snapshot.id);
  const primary = items.find((row) => row.role === "primary");
  if (primary === undefined) {
    return { state: "no_snapshot", planId: activePlan.id };
  }

  const titleLookup = loadNodeTitleLookup(db, items);
  const stableIdByRowId = loadStableIdLookup(db);
  const primaryStableId =
    stableIdByRowId.get(primary.nodeId) ?? primary.nodeId;
  const primaryMeta = titleLookup.get(primaryStableId);
  const primaryPractice = loadPrimaryPracticeTask(db, primary.practiceTaskId);
  const primaryLinks = loadPracticeLinks(
    db,
    primaryPractice?.canonicalProblemId ?? null,
  );
  const primaryResources = loadResourceLinks(db, primaryStableId);

  const acceptedActions = listAcceptedActions(db, primary.id);
  const completedFeedback = loadCompletedAttempt(db, primary.id);

  const alternatives: TodayTaskPanelAlternative[] = items
    .filter(
      (row): row is PlanItemRow & { readonly role: Exclude<PlanItemRow["role"], "primary"> } =>
        row.role !== "primary",
    )
    .map((row) => {
      const stableId = stableIdByRowId.get(row.nodeId) ?? row.nodeId;
      const meta = titleLookup.get(stableId);
      const task = loadPrimaryPracticeTask(db, row.practiceTaskId);
      return {
        itemId: row.id,
        role: row.role,
        nodeId: stableId,
        nodeTitle: meta?.title ?? stableId,
        practiceTaskTitle: task?.title ?? row.practiceTaskId,
        reasonCodes: parseReasonCodes(row.reasonCodesJson),
      };
    })
    .sort((a, b) => a.nodeId.localeCompare(b.nodeId));

  return {
    state: "available",
    planId: activePlan.id,
    snapshotId: snapshot.id,
    dailyMode: snapshot.dailyMode,
    effortBoundaryMinutes: snapshot.effortBoundaryMinutes,
    generatorVersion: snapshot.generatorVersion,
    primary: {
      planItemId: primary.id,
      nodeId: primaryStableId,
      nodeTitle: primaryMeta?.title ?? primaryStableId,
      nodeOutcome: primaryMeta?.outcome ?? "",
      practiceTaskTitle: primaryPractice?.title ?? primary.practiceTaskId,
      reasonCodes: parseReasonCodes(primary.reasonCodesJson),
      practiceLinks: primaryLinks,
      resourceLinks: primaryResources,
      mapHref: `/map/${primaryStableId}`,
    },
    alternatives,
    fallbackExplanation: detectFallbackExplanation(
      primary.reasonCodesJson,
      primaryStableId,
    ),
    acceptedActions,
    completed: completedFeedback !== null,
  };
}

function loadStableIdLookup(db: Database.Database): ReadonlyMap<string, string> {
  const lookup = new Map<string, string>();
  const packageId = findActiveCurriculumPackageId(db);
  if (packageId === null) return lookup;
  type Row = { readonly id: string; readonly stable_id: string };
  const rows = db
    .prepare<[string], Row>(
      `SELECT id, stable_id FROM knowledge_nodes WHERE package_id = ?`,
    )
    .all(packageId);
  for (const row of rows) lookup.set(row.id, row.stable_id);
  return lookup;
}

type NodeMeta = { readonly title: string; readonly outcome: string };

function loadNodeTitleLookup(
  db: Database.Database,
  items: readonly PlanItemRow[],
): ReadonlyMap<string, NodeMeta> {
  const lookup = new Map<string, NodeMeta>();
  const packageId = findActiveCurriculumPackageId(db);
  if (packageId === null) return lookup;
  type Row = {
    readonly stable_id: string;
    readonly title: string;
    readonly outcome: string;
  };
  const stableIds = new Set<string>();
  for (const item of items) stableIds.add(item.nodeId);
  const stableIdList = [...stableIds];
  if (stableIdList.length === 0) return lookup;
  const placeholders = stableIdList.map(() => "?").join(", ");
  const params: string[] = [packageId, ...stableIdList];
  const rows = db
    .prepare<string[], Row>(
      `SELECT id AS row_id, stable_id, title, outcome
         FROM knowledge_nodes
        WHERE package_id = ?
          AND id IN (${placeholders})`,
    )
    .all(...params);
  for (const row of rows) {
    lookup.set(row.stable_id, { title: row.title, outcome: row.outcome });
  }
  return lookup;
}

type PracticeTaskMeta = {
  readonly title: string;
  readonly canonicalProblemId: string | null;
};

function loadPrimaryPracticeTask(
  db: Database.Database,
  practiceTaskId: string,
): PracticeTaskMeta | null {
  type Row = {
    readonly title: string;
    readonly canonical_problem_id: string;
  };
  const row = db
    .prepare<[string], Row>(
      `SELECT title, canonical_problem_id
         FROM practice_tasks
        WHERE id = ?
        LIMIT 1`,
    )
    .get(practiceTaskId);
  if (row === undefined) return null;
  return { title: row.title, canonicalProblemId: row.canonical_problem_id };
}

function loadPracticeLinks(
  db: Database.Database,
  canonicalProblemId: string | null,
): readonly TodayTaskPanelPracticeLink[] {
  if (canonicalProblemId === null) return [];
  type Row = {
    readonly platform: string;
    readonly url: string;
  };
  const rows = db
    .prepare<[string], Row>(
      `SELECT platform, url
         FROM canonical_problem_sources
        WHERE canonical_problem_id = ?
        ORDER BY platform ASC, external_id ASC`,
    )
    .all(canonicalProblemId);
  return rows.map((row) => ({
    platform: row.platform,
    url: row.url,
    label: `${row.platform} · ${row.url}`,
  }));
}

function loadResourceLinks(
  db: Database.Database,
  nodeStableId: string,
): readonly TodayTaskPanelResourceLink[] {
  type Row = { readonly title: string; readonly url: string };
  const rows = db
    .prepare<[string], Row>(
      `SELECT lr.title, lr.url
         FROM learning_resources lr
         JOIN node_resources nr ON nr.resource_id = lr.id
         JOIN knowledge_nodes kn ON kn.id = nr.node_id
        WHERE kn.stable_id = ?
          AND lr.review_status = 'reviewed'
        ORDER BY nr.sort_order ASC, lr.stable_id ASC`,
    )
    .all(nodeStableId);
  return rows.map((row) => ({ title: row.title, url: row.url }));
}

function listAcceptedActions(
  db: Database.Database,
  planItemId: string,
): readonly string[] {
  type Row = { readonly action: string };
  const rows = db
    .prepare<[string], Row>(
      `SELECT action
         FROM task_feedback
        WHERE plan_item_id = ?
        ORDER BY created_at ASC, id ASC`,
    )
    .all(planItemId);
  return rows.map((row) => row.action);
}

function loadCompletedAttempt(
  db: Database.Database,
  planItemId: string,
): { readonly attemptId: string } | null {
  type Row = { readonly attempt_id: string | null };
  const row = db
    .prepare<[string], Row>(
      `SELECT attempt_id
         FROM task_feedback
        WHERE plan_item_id = ? AND action = 'completed'
        LIMIT 1`,
    )
    .get(planItemId);
  if (row === undefined || row.attempt_id === null) return null;
  return { attemptId: row.attempt_id };
}

function detectFallbackExplanation(
  raw: string,
  nodeStableId: string,
): string | null {
  if (nodeStableId !== "cpp-io-types") return null;
  const codes = parseReasonCodes(raw);
  if (!codes.includes("common_foundation")) return null;
  return "当前没有合适的候选任务；使用安全基础任务（cpp-io-types 入门级 I/O 练习，平台无关）。";
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