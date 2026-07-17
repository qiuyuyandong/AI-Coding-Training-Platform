"use client";

import { useState } from "react";

/**
 * V0 `/today` effort-boundary selector (Todo 19).
 *
 * Renders four buttons (15 / 30 / 60 / 90 minutes). Clicking a different
 * value POSTs to the plan-item feedback endpoint with action `accepted`
 * and the new `effortBoundaryMinutes`. The feedback handler decides
 * whether the change is enough to create a successor daily-plan
 * snapshot and records the `effort_changed` revision event.
 *
 * The component never assumes a fixed learner id; the parent page
 * passes the primary plan item id so the request reaches the right
 * `task_feedback` row. The current value is supplied for visual
 * highlighting only — the actual persistence happens on the server.
 *
 * No cookies, tokens, or platform credentials are read. No global
 * state is introduced.
 */

export type EffortBoundaryMinutes = 15 | 30 | 60 | 90;

export type EffortBoundarySelectorProps = {
  readonly planItemId: string;
  readonly current: EffortBoundaryMinutes;
  readonly available: readonly EffortBoundaryMinutes[];
  readonly disabled?: boolean;
};

type FeedbackApiResponse =
  | { readonly ok: true; readonly snapshotId: string | null }
  | { readonly ok: false; readonly error?: string };

const BUTTON_BASE =
  "rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-950";
const BUTTON_ACTIVE = "bg-slate-950 text-white border-slate-950";
const BUTTON_INACTIVE = "bg-white text-slate-800 hover:bg-slate-50";

export function EffortBoundarySelector({
  planItemId,
  current,
  available,
  disabled = false,
}: EffortBoundarySelectorProps) {
  const [status, setStatus] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function select(next: EffortBoundaryMinutes): Promise<void> {
    if (disabled || submitting || next === current) return;
    setSubmitting(true);
    setStatus(null);
    try {
      const response = await fetch(
        `/api/plans/items/${planItemId}/feedback`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            action: "accepted",
            effortBoundaryMinutes: next,
          }),
        },
      );
      const body: FeedbackApiResponse = await response.json();
      if (!body.ok) {
        setStatus(body.error ?? "保存失败");
        return;
      }
      setStatus("已更新");
      window.location.reload();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "保存失败");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <div
        className="flex flex-wrap gap-2"
        role="radiogroup"
        aria-label="时间投入"
      >
        {available.map((value) => {
          const isActive = value === current;
          return (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={isActive}
              disabled={disabled || submitting}
              onClick={() => void select(value)}
              className={`${BUTTON_BASE} ${isActive ? BUTTON_ACTIVE : BUTTON_INACTIVE} disabled:opacity-50`}
            >
              {value} 分钟
            </button>
          );
        })}
      </div>
      {status !== null ? (
        <p
          role="status"
          aria-live="polite"
          className={
            status === "已更新"
              ? "text-sm text-emerald-700"
              : "text-sm text-red-700"
          }
        >
          {status}
        </p>
      ) : null}
    </div>
  );
}