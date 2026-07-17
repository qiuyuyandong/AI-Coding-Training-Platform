/**
 * V0 `/today` primary-task panel (Todo 19).
 *
 * Server-renderable panel that surfaces exactly one primary plan item
 * with its title, daily mode, effort boundary, the deterministic
 * reason codes and the canonical deep links. The alternatives stay
 * inside a collapsed `<details>` section so the primary focus remains
 * the primary task.
 *
 * The component receives a fully-resolved view from `app/today/page.tsx`
 * so it never opens a database or performs network I/O on its own.
 */

export type TodayTaskPanelReasonCode = {
  readonly code: string;
  readonly label: string;
};

export type TodayTaskPanelAlternative = {
  readonly itemId: string;
  readonly role: "warmup" | "same_goal_alternative" | "weakness_review";
  readonly nodeId: string;
  readonly nodeTitle: string;
  readonly practiceTaskTitle: string;
  readonly reasonCodes: readonly string[];
};

export type TodayTaskPanelPracticeLink = {
  readonly platform: string;
  readonly url: string;
  readonly label: string;
};

export type TodayTaskPanelResourceLink = {
  readonly title: string;
  readonly url: string;
};

export type TodayTaskPanelProps = {
  readonly planItemId: string;
  readonly dailyMode: "learn" | "practice" | "recover";
  readonly effortBoundaryMinutes: 15 | 30 | 60 | 90;
  readonly nodeId: string;
  readonly nodeTitle: string;
  readonly practiceTaskTitle: string;
  readonly reasonCodes: readonly TodayTaskPanelReasonCode[];
  readonly practiceLinks: readonly TodayTaskPanelPracticeLink[];
  readonly resourceLinks: readonly TodayTaskPanelResourceLink[];
  readonly fallbackExplanation: string | null;
  readonly alternatives: readonly TodayTaskPanelAlternative[];
};

const DAILY_MODE_LABEL: Readonly<Record<TodayTaskPanelProps["dailyMode"], string>> = {
  learn: "学习",
  practice: "练习",
  recover: "恢复",
};

const ALTERNATIVE_LABEL: Readonly<
  Record<TodayTaskPanelAlternative["role"], string>
> = {
  warmup: "热身",
  same_goal_alternative: "同目标备选",
  weakness_review: "薄弱复盘",
};

const DEFAULT_REASON_LABELS: Readonly<Record<string, string>> = {
  primary_goal: "主方向优先",
  interest_goal: "兴趣方向相关",
  common_foundation: "通用基础",
  first_unassessed: "首次接触",
  reachable_ability: "已有能力可承接",
  within_effort: "匹配当前时间投入",
  not_recently_skipped: "未在最近跳过",
  not_same_variant: "未重复最近一次变体",
  low_difficulty_match: "难度匹配",
};

export function TodayTaskPanel(props: TodayTaskPanelProps) {
  return (
    <section
      aria-labelledby="today-primary-heading"
      className="rounded-xl border border-slate-200 bg-white p-5"
    >
      <header>
        <p className="text-xs uppercase tracking-wide text-slate-500">
          {DAILY_MODE_LABEL[props.dailyMode]} · {props.effortBoundaryMinutes} 分钟
        </p>
        <h2
          id="today-primary-heading"
          className="mt-2 text-2xl font-semibold text-slate-950"
        >
          {props.nodeTitle}
        </h2>
        <p className="mt-1 text-sm text-slate-600">
          任务：{props.practiceTaskTitle}
        </p>
      </header>

      <div className="mt-4">
        <p className="text-xs uppercase tracking-wide text-slate-500">原因</p>
        <ul className="mt-2 flex flex-wrap gap-2">
          {props.reasonCodes.map((reason) => (
            <li
              key={reason.code}
              className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-700"
            >
              {reason.label}
            </li>
          ))}
        </ul>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <div>
          <p className="text-xs uppercase tracking-wide text-slate-500">
            练习链接
          </p>
          {props.practiceLinks.length === 0 ? (
            <p className="mt-1 text-sm text-slate-500">暂无公开来源链接。</p>
          ) : (
            <ul className="mt-2 space-y-1 text-sm text-slate-700">
              {props.practiceLinks.map((link) => (
                <li key={`${link.platform}-${link.url}`}>
                  <a
                    href={link.url}
                    rel="noopener noreferrer"
                    target="_blank"
                    className="underline"
                  >
                    {link.label}
                  </a>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div>
          <p className="text-xs uppercase tracking-wide text-slate-500">
            阅读资源
          </p>
          {props.resourceLinks.length === 0 ? (
            <p className="mt-1 text-sm text-slate-500">暂无阅读资源。</p>
          ) : (
            <ul className="mt-2 space-y-1 text-sm text-slate-700">
              {props.resourceLinks.map((link) => (
                <li key={link.url}>
                  <a
                    href={link.url}
                    rel="noopener noreferrer"
                    target="_blank"
                    className="underline"
                  >
                    {link.title}
                  </a>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {props.fallbackExplanation !== null ? (
        <p
          role="note"
          className="mt-4 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800"
        >
          {props.fallbackExplanation}
        </p>
      ) : null}

      <details className="mt-5 rounded-lg border border-slate-200 bg-slate-50 p-3">
        <summary className="cursor-pointer text-sm font-medium text-slate-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-950">
          查看备选（{props.alternatives.length}）
        </summary>
        {props.alternatives.length === 0 ? (
          <p className="mt-2 text-sm text-slate-500">当前没有备选任务。</p>
        ) : (
          <ul className="mt-3 space-y-2">
            {props.alternatives.map((alt) => (
              <li
                key={alt.itemId}
                className="rounded-md border border-slate-200 bg-white p-3 text-sm text-slate-700"
              >
                <div className="flex items-center justify-between">
                  <span className="font-medium text-slate-900">
                    {ALTERNATIVE_LABEL[alt.role]}
                  </span>
                  <span className="text-xs uppercase tracking-wide text-slate-500">
                    {alt.nodeId}
                  </span>
                </div>
                <p className="mt-1 text-slate-900">{alt.nodeTitle}</p>
                <p className="mt-1 text-xs text-slate-500">
                  {alt.practiceTaskTitle}
                </p>
                {alt.reasonCodes.length > 0 ? (
                  <ul className="mt-2 flex flex-wrap gap-1">
                    {alt.reasonCodes.map((code) => (
                      <li
                        key={`${alt.itemId}-${code}`}
                        className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-700"
                      >
                        {labelForReason(code)}
                      </li>
                    ))}
                  </ul>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </details>
    </section>
  );
}

export function labelForReason(code: string): string {
  return DEFAULT_REASON_LABELS[code] ?? code;
}

/**
 * Pure helper exposed for the server page to translate reason code
 * arrays coming from the persistence layer into the panel-friendly
 * shape. Unknown codes fall back to the raw string so the UI still
 * surfaces them.
 */
export function decorateReasonCodes(
  codes: readonly string[],
): readonly TodayTaskPanelReasonCode[] {
  return codes.map((code) => ({
    code,
    label: labelForReason(code),
  }));
}