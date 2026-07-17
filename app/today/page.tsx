import { EffortBoundarySelector } from "@/components/EffortBoundarySelector";
import { PlanItemCompletionPanel } from "@/components/PlanItemCompletionPanel";
import {
  TodayTaskPanel,
  decorateReasonCodes,
} from "@/components/TodayTaskPanel";
import { openDatabase } from "@/lib/db/client";
import type { EffortBoundaryMinutes } from "@/lib/domain/plan";
import {
  type TodayPayload,
  buildTodayPagePayload,
} from "@/lib/pages/todayPage";

export const dynamic = "force-dynamic";

const EFFORT_VALUES: readonly EffortBoundaryMinutes[] = [15, 30, 60, 90];

export default function TodayPage() {
  const db = openDatabase();
  try {
    const payload = buildTodayPagePayload(db);
    return <TodayView payload={payload} />;
  } finally {
    db.close();
  }
}

function TodayView({ payload }: { readonly payload: TodayPayload }) {
  if (payload.state === "no_plan" || payload.state === "no_snapshot") {
    return (
      <main lang="zh-CN" className="mx-auto max-w-4xl px-6 py-10">
        <header>
          <p className="text-sm uppercase tracking-wide text-slate-500">
            Today
          </p>
          <h1 className="mt-3 text-3xl font-semibold text-slate-950">
            今日还没有可执行的任务
          </h1>
          <p className="mt-3 text-slate-600">
            请先访问
            <a className="ml-1 underline" href="/plan">
              /plan
            </a>
            完成方向选择、诊断或起点覆盖，再回到这里查看当日主任务。
          </p>
        </header>
      </main>
    );
  }

  return (
    <main lang="zh-CN" className="mx-auto max-w-4xl px-6 py-10">
      <header>
        <p className="text-sm uppercase tracking-wide text-slate-500">Today</p>
        <h1 className="mt-3 text-3xl font-semibold text-slate-950">今日主任务</h1>
        <p className="mt-3 text-slate-600">
          下方是按
          <span className="mx-1 font-medium text-slate-900">
            {payload.effortBoundaryMinutes} 分钟
          </span>
          投入选出的唯一一个主任务。下方可调整投入时间；调整后会生成新快照。
        </p>
      </header>

      <section
        aria-labelledby="effort-heading"
        className="mt-6 rounded-xl border border-slate-200 bg-white p-4"
      >
        <h2
          id="effort-heading"
          className="text-base font-semibold text-slate-950"
        >
          时间投入
        </h2>
        <p className="mt-1 text-xs text-slate-500">
          调整后仅影响主任务的排序，不显示具体预计耗时。
        </p>
        <div className="mt-3">
          <EffortBoundarySelector
            planItemId={payload.primary.planItemId}
            current={payload.effortBoundaryMinutes}
            available={EFFORT_VALUES}
          />
        </div>
      </section>

      <div className="mt-6">
        <TodayTaskPanel
          planItemId={payload.primary.planItemId}
          dailyMode={payload.dailyMode}
          effortBoundaryMinutes={payload.effortBoundaryMinutes}
          nodeId={payload.primary.nodeId}
          nodeTitle={payload.primary.nodeTitle}
          practiceTaskTitle={payload.primary.practiceTaskTitle}
          reasonCodes={decorateReasonCodes(payload.primary.reasonCodes)}
          practiceLinks={payload.primary.practiceLinks}
          resourceLinks={payload.primary.resourceLinks}
          fallbackExplanation={payload.fallbackExplanation}
          alternatives={payload.alternatives}
        />
      </div>

      <div className="mt-6">
        <PlanItemCompletionPanel
          planItemId={payload.primary.planItemId}
          taskTitle={payload.primary.practiceTaskTitle}
        />
      </div>

      <p className="mt-6 text-xs text-slate-500">
        计划生成器：{payload.generatorVersion} · 快照：
        {payload.snapshotId}
      </p>
    </main>
  );
}