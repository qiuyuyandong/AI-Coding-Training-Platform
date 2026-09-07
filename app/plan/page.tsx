import { openDatabase } from "@/lib/db/client";
import { GoalSetupPanel } from "@/components/GoalSetupPanel";
import {
  type PlanGoalView,
  type PlanOverviewView,
  type PlanPagePayload,
  type PlanUpcomingItem,
  type PrerequisiteNodeView,
  buildPlanPagePayload,
} from "@/lib/pages/planPage";
import {
  type LearnerNodeBaselineRow,
} from "@/lib/domain/learner";
import { AiCoachActions } from "@/components/AiCoachActions";
import { buildAiCoachPanelData } from "@/lib/services/aiCoachService";

export const dynamic = "force-dynamic";

export default function PlanPage() {
  const db = openDatabase();
  try {
    const payload = buildPlanPagePayload(db);
    const ai = buildAiCoachPanelData(db);
    return <PlanView payload={payload} ai={ai} />;
  } finally {
    db.close();
  }
}

type PlanViewProps = {
  readonly payload: PlanPagePayload;
  readonly ai: ReturnType<typeof buildAiCoachPanelData>;
};

function PlanView({ payload, ai }: PlanViewProps) {
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
      <div className="mt-6"><AiCoachActions surface="plan" evidenceOptions={ai.evidenceOptions} initialPreference={ai.preference} /></div>
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
  review: "复习",
  practice: "练习",
  build: "项目",
  recover: "恢复",
};
