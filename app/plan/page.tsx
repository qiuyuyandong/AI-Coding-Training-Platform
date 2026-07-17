import type Database from "better-sqlite3";
import { openDatabase } from "@/lib/db/client";
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
import {
  GoalSetupPanel,
  type GoalTrackOption,
} from "@/components/GoalSetupPanel";

export const dynamic = "force-dynamic";

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

function findActiveCurriculumPackageId(db: Database.Database): string | null {
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

export default function PlanPage() {
  const db = openDatabase();
  try {
    const payload = buildPlanPagePayload(db);
    return <PlanView payload={payload} />;
  } finally {
    db.close();
  }
}

type PlanViewProps = {
  readonly payload: PlanPagePayload;
};

function PlanView({ payload }: PlanViewProps) {
  if (payload.state === "no_goal") {
    return (
      <main lang="zh-CN" className="mx-auto max-w-4xl px-6 py-10">
        <header>
          <p className="text-sm uppercase tracking-wide text-slate-500">Plan</p>
          <h1 className="mt-3 text-3xl font-semibold text-slate-950">
            设置你的方向
          </h1>
          <p className="mt-3 text-slate-600">
            选择一个主要方向（可选）和最多 2 个兴趣方向；保存后即可进入诊断与计划。
          </p>
        </header>
        <GoalSetupPanel
          availableTracks={payload.tracks}
          initialPrimaryTrackId={null}
          initialInterestTrackIds={[]}
        />
      </main>
    );
  }

  if (payload.state === "pre_diagnosis") {
    return (
      <main lang="zh-CN" className="mx-auto max-w-4xl px-6 py-10">
        <header>
          <p className="text-sm uppercase tracking-wide text-slate-500">Plan</p>
          <h1 className="mt-3 text-3xl font-semibold text-slate-950">完成诊断</h1>
          <p className="mt-3 text-slate-600">
            下面是你的目标摘要。诊断包含 6 个可恢复的题目，将帮助系统为每个节点写入 baseline。
          </p>
        </header>
        <GoalSummaryCard goal={payload.goal} />
        <section className="mt-6 rounded-xl border border-slate-200 bg-white p-4">
          <h2 className="text-lg font-semibold text-slate-950">诊断</h2>
          <p className="mt-1 text-sm text-slate-600">
            {payload.nextPromptId === null
              ? "诊断已全部回答；请刷新页面查看计划概览。"
              : "下一步：点击下方按钮开始或恢复诊断。"}
          </p>
          <a
            href="/plan/diagnosis"
            className="mt-3 inline-block rounded-lg bg-slate-950 px-4 py-2 text-sm font-medium text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-950"
          >
            {payload.nextPromptId === null ? "查看诊断结果" : "开始 / 继续诊断"}
          </a>
        </section>
        <details className="mt-6 rounded-xl border border-slate-200 bg-white p-4">
          <summary className="cursor-pointer text-sm font-medium text-slate-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-950">
            修改方向选择
          </summary>
          <GoalSetupPanel
            availableTracks={payload.tracks}
            initialPrimaryTrackId={payload.goal.primaryTrackId}
            initialInterestTrackIds={payload.goal.interestTracks.map(
              (entry) => entry.slug,
            )}
          />
        </details>
      </main>
    );
  }

  return (
    <main lang="zh-CN" className="mx-auto max-w-4xl px-6 py-10">
      <header>
        <p className="text-sm uppercase tracking-wide text-slate-500">Plan</p>
        <h1 className="mt-3 text-3xl font-semibold text-slate-950">计划概览</h1>
        <p className="mt-3 text-slate-600">
          下方显示已生成的目标、阶段、前置节点与即将到来的练习。日历当日任务请前往
          <a className="ml-1 underline" href="/today">/today</a>。
        </p>
      </header>
      <GoalSummaryCard goal={payload.goal} />
      <StageCard
        overview={payload.overview}
        prerequisites={payload.prerequisites}
      />
      <UpcomingItemsCard items={payload.overview.items} />
      <BaselinesCard baselines={payload.baselines} />
      <details className="mt-6 rounded-xl border border-slate-200 bg-white p-4">
        <summary className="cursor-pointer text-sm font-medium text-slate-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-950">
          修改方向选择
        </summary>
        <GoalSetupPanel
          availableTracks={payload.tracks}
          initialPrimaryTrackId={payload.goal.primaryTrackId}
          initialInterestTrackIds={payload.goal.interestTracks.map(
            (entry) => entry.slug,
          )}
        />
      </details>
    </main>
  );
}

function GoalSummaryCard({ goal }: { readonly goal: PlanGoalView }) {
  return (
    <section className="mt-6 rounded-xl border border-slate-200 bg-white p-4">
      <h2 className="text-lg font-semibold text-slate-950">目标</h2>
      <dl className="mt-3 grid gap-3 text-sm text-slate-700 sm:grid-cols-2">
        <div>
          <dt className="text-xs uppercase tracking-wide text-slate-500">主要方向</dt>
          <dd className="mt-1 text-slate-900">
            {goal.primaryTrackName ?? "暂未选择"}
          </dd>
        </div>
        <div>
          <dt className="text-xs uppercase tracking-wide text-slate-500">兴趣方向</dt>
          <dd className="mt-1 text-slate-900">
            {goal.interestTracks.length === 0
              ? "暂未选择"
              : goal.interestTracks.map((entry) => entry.name).join("、")}
          </dd>
        </div>
      </dl>
    </section>
  );
}

function StageCard({
  overview,
  prerequisites,
}: {
  readonly overview: PlanOverviewView;
  readonly prerequisites: readonly PrerequisiteNodeView[];
}) {
  const stageLabel = STAGE_LABELS[overview.dailyMode] ?? overview.dailyMode;
  const effortLabel = `${overview.effortBoundaryMinutes} 分钟`;
  return (
    <section className="mt-6 rounded-xl border border-slate-200 bg-white p-4">
      <h2 className="text-lg font-semibold text-slate-950">阶段</h2>
      <ul className="mt-3 grid gap-3 text-sm text-slate-700 sm:grid-cols-3">
        <li>
          <p className="text-xs uppercase tracking-wide text-slate-500">学习阶段</p>
          <p className="mt-1 text-slate-900">{stageLabel}</p>
        </li>
        <li>
          <p className="text-xs uppercase tracking-wide text-slate-500">时间投入</p>
          <p className="mt-1 text-slate-900">{effortLabel}</p>
        </li>
        <li>
          <p className="text-xs uppercase tracking-wide text-slate-500">计划生成器</p>
          <p className="mt-1 text-slate-900">{overview.generatorVersion}</p>
        </li>
      </ul>
      {prerequisites.length > 0 ? (
        <div className="mt-4">
          <p className="text-xs uppercase tracking-wide text-slate-500">前置节点</p>
          <ul className="mt-2 space-y-1 text-sm text-slate-700">
            {prerequisites.map((node) => (
              <li key={node.stableId}>
                <a
                  href={`/map/${node.stableId}`}
                  className="underline"
                >
                  #{node.orderIndex} {node.title}
                </a>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}

function UpcomingItemsCard({
  items,
}: {
  readonly items: readonly PlanUpcomingItem[];
}) {
  if (items.length === 0) {
    return (
      <section className="mt-6 rounded-xl border border-slate-200 bg-white p-4">
        <h2 className="text-lg font-semibold text-slate-950">即将到来的练习</h2>
        <p className="mt-3 text-sm text-slate-600">
          当前尚未生成计划项。完成诊断后会自动生成第一条计划。
        </p>
      </section>
    );
  }
  return (
    <section className="mt-6 rounded-xl border border-slate-200 bg-white p-4">
      <h2 className="text-lg font-semibold text-slate-950">即将到来的练习</h2>
      <ol className="mt-3 space-y-3">
        {items.map((item) => (
          <li
            key={item.itemId}
            className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700"
          >
            <div className="flex items-center justify-between">
              <span className="font-medium text-slate-900">
                {item.role === "primary"
                  ? "主任务"
                  : item.role === "warmup"
                  ? "热身"
                  : item.role === "same_goal_alternative"
                  ? "同目标备选"
                  : "薄弱复盘"}
              </span>
              <span className="text-xs uppercase tracking-wide text-slate-500">
                #{item.orderIndex}
              </span>
            </div>
            <p className="mt-1 text-slate-900">{item.nodeTitle}</p>
            <p className="mt-1 text-xs text-slate-500">
              任务 ID: {item.practiceTaskId} · 节点: {item.nodeId}
            </p>
            {item.reasonCodes.length > 0 ? (
              <ul className="mt-2 flex flex-wrap gap-2">
                {item.reasonCodes.map((code) => (
                  <li
                    key={`${item.itemId}-${code}`}
                    className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-700"
                  >
                    {code}
                  </li>
                ))}
              </ul>
            ) : null}
          </li>
        ))}
      </ol>
    </section>
  );
}

function BaselinesCard({
  baselines,
}: {
  readonly baselines: readonly LearnerNodeBaselineRow[];
}) {
  if (baselines.length === 0) return null;
  return (
    <section className="mt-6 rounded-xl border border-slate-200 bg-white p-4">
      <h2 className="text-lg font-semibold text-slate-950">节点 baseline</h2>
      <ul className="mt-3 grid gap-2 text-sm text-slate-700 sm:grid-cols-2">
        {baselines.map((row) => (
          <li
            key={`${row.learnerId}-${row.nodeId}`}
            className="rounded-lg border border-slate-200 bg-slate-50 p-2"
          >
            <p className="font-medium text-slate-900">{row.nodeId}</p>
            <p className="text-xs text-slate-500">
              {row.baseline} · {row.confidence} · {row.source}
            </p>
          </li>
        ))}
      </ul>
    </section>
  );
}

const STAGE_LABELS: Readonly<Record<string, string>> = {
  learn: "学习",
  practice: "练习",
  recover: "恢复",
};