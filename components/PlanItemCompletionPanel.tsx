"use client";

import { useState } from "react";

/**
 * V0 `/today` plan-item completion panel (Todo 19).
 *
 * Three actions on the primary plan item:
 *
 *   - `started` — POSTs the `started` feedback action and records the
 *     moment the learner commits to working on the task. No attempt
 *     is created; no ability is replayed. A duplicate call is a replay
 *     and is a no-op on the server.
 *   - `skipped` — collects a required reason code and optional free
 *     text, then POSTs the `skipped` feedback action. The server
 *     creates a successor daily-plan snapshot and a revision event.
 *   - `complete` — POSTs to the dedicated completion endpoint which
 *     atomically creates the manual attempt, replays ability, and
 *     surfaces a next-task explanation.
 *
 * The component never reads cookies, tokens or platform credentials.
 * All server errors are surfaced as accessible status text; the
 * optimistic state rolls back on failure by abandoning the change
 * without updating the local view.
 */

export type SkipReasonCode =
  | "too_hard"
  | "too_easy"
  | "not_relevant"
  | "missing_resource"
  | "not_now"
  | "other";

export type CompletionResult = "passed" | "failed" | "partial" | "stuck";

export type CompletionExplanation = {
  readonly levelLabel: string;
  readonly confidenceLabel: "low" | "medium" | "high";
  readonly reasonCodes: readonly string[];
  readonly uncertainty: string;
  readonly nextEvidenceNeeded: string;
};

export type PlanItemCompletionPanelProps = {
  readonly planItemId: string;
  readonly taskTitle: string;
};

type StartedResponse =
  | { readonly ok: true; readonly replayed: boolean }
  | { readonly ok: false; readonly error?: string };

type SkippedResponse =
  | { readonly ok: true; readonly snapshotId: string | null }
  | { readonly ok: false; readonly error?: string };

type CompletedResponse =
  | {
      readonly ok: true;
      readonly replayed: boolean;
      readonly attemptId: string;
      readonly nodeId: string;
      readonly explanation: CompletionExplanation;
      readonly nextPlan: { readonly planId: string; readonly snapshotId: string };
    }
  | { readonly ok: false; readonly error?: string };

const SKIP_REASON_OPTIONS: ReadonlyArray<{
  readonly value: SkipReasonCode;
  readonly label: string;
}> = [
  { value: "too_hard", label: "太难" },
  { value: "too_easy", label: "太简单" },
  { value: "not_relevant", label: "与当前方向不相关" },
  { value: "missing_resource", label: "缺少资源" },
  { value: "not_now", label: "暂不想做" },
  { value: "other", label: "其他原因" },
];

const RESULT_OPTIONS: ReadonlyArray<{
  readonly value: CompletionResult;
  readonly label: string;
}> = [
  { value: "passed", label: "通过" },
  { value: "failed", label: "未通过" },
  { value: "partial", label: "部分完成" },
  { value: "stuck", label: "卡住" },
];

type StatusTone = "info" | "success" | "error";

type StatusMessage = {
  readonly tone: StatusTone;
  readonly text: string;
};

export function PlanItemCompletionPanel({
  planItemId,
  taskTitle,
}: PlanItemCompletionPanelProps) {
  const [startedAt, setStartedAt] = useState<string | null>(null);
  const [skipReason, setSkipReason] = useState<SkipReasonCode>("not_now");
  const [skipText, setSkipText] = useState<string>("");
  const [skipOpen, setSkipOpen] = useState(false);
  const [result, setResult] = useState<CompletionResult>("passed");
  const [language, setLanguage] = useState<string>("");
  const [duration, setDuration] = useState<string>("");
  const [reflection, setReflection] = useState<string>("");
  const [status, setStatus] = useState<StatusMessage | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function submitStarted(): Promise<void> {
    setSubmitting(true);
    setStatus(null);
    try {
      const response = await fetch(
        `/api/plans/items/${planItemId}/feedback`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ action: "started" }),
        },
      );
      const body: StartedResponse = await response.json();
      if (!body.ok) {
        setStatus({ tone: "error", text: body.error ?? "保存失败" });
        return;
      }
      setStartedAt(new Date().toISOString());
      setStatus({
        tone: "success",
        text: body.replayed ? "已开始（重复请求未产生新状态）" : "已开始",
      });
    } catch (error) {
      setStatus({
        tone: "error",
        text: error instanceof Error ? error.message : "保存失败",
      });
    } finally {
      setSubmitting(false);
    }
  }

  async function submitSkipped(): Promise<void> {
    if (skipReason === "other" && skipText.trim().length === 0) {
      setStatus({ tone: "error", text: "其他原因必须填写说明" });
      return;
    }
    setSubmitting(true);
    setStatus(null);
    try {
      const response = await fetch(
        `/api/plans/items/${planItemId}/feedback`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            action: "skipped",
            reasonCode: skipReason,
            reasonText:
              skipReason === "other" && skipText.trim().length > 0
                ? skipText.trim()
                : null,
          }),
        },
      );
      const body: SkippedResponse = await response.json();
      if (!body.ok) {
        setStatus({ tone: "error", text: body.error ?? "保存失败" });
        return;
      }
      setStatus({ tone: "success", text: "已跳过，下方已生成新的主任务" });
      window.location.reload();
    } catch (error) {
      setStatus({
        tone: "error",
        text: error instanceof Error ? error.message : "保存失败",
      });
    } finally {
      setSubmitting(false);
    }
  }

  async function submitCompletion(): Promise<void> {
    setSubmitting(true);
    setStatus(null);
    const payload: Record<string, unknown> = { result };
    const trimmedLanguage = language.trim();
    if (trimmedLanguage.length > 0) payload["language"] = trimmedLanguage;
    const parsedDuration = Number.parseInt(duration, 10);
    if (duration.trim().length > 0) {
      if (
        !Number.isFinite(parsedDuration)
        || !Number.isInteger(parsedDuration)
        || parsedDuration < 0
      ) {
        setStatus({ tone: "error", text: "耗时必须是整数分钟" });
        setSubmitting(false);
        return;
      }
      payload["durationMinutes"] = parsedDuration;
    }
    const trimmedReflection = reflection.trim();
    if (trimmedReflection.length > 0) payload["reflection"] = trimmedReflection;

    try {
      const response = await fetch(
        `/api/plans/items/${planItemId}/complete`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(payload),
        },
      );
      const body: CompletedResponse = await response.json();
      if (!body.ok) {
        setStatus({ tone: "error", text: body.error ?? "保存失败" });
        return;
      }
      if (body.replayed) {
        setStatus({
          tone: "info",
          text: "已完成（重复请求未产生新状态）",
        });
      } else {
        setStatus({
          tone: "success",
          text: `${body.explanation.levelLabel} · ${body.explanation.confidenceLabel} · ${body.explanation.uncertainty}`,
        });
      }
      window.location.reload();
    } catch (error) {
      setStatus({
        tone: "error",
        text: error instanceof Error ? error.message : "保存失败",
      });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section
      aria-labelledby="completion-heading"
      className="rounded-xl border border-slate-200 bg-white p-5"
    >
      <h2
        id="completion-heading"
        className="text-lg font-semibold text-slate-950"
      >
        反馈与完成：{taskTitle}
      </h2>
      {startedAt !== null ? (
        <p className="mt-1 text-xs text-slate-500">
          已开始于 {startedAt}
        </p>
      ) : null}

      <div className="mt-4 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => void submitStarted()}
          disabled={submitting}
          className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-800 hover:bg-slate-50 disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-950"
        >
          标记开始
        </button>
        <button
          type="button"
          onClick={() => setSkipOpen((open) => !open)}
          disabled={submitting}
          aria-expanded={skipOpen}
          className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-800 hover:bg-slate-50 disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-950"
        >
          {skipOpen ? "收起跳过表单" : "跳过（选择原因）"}
        </button>
      </div>

      {skipOpen ? (
        <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
          <label className="block text-xs uppercase tracking-wide text-slate-500">
            原因
            <select
              className="mt-1 block w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm normal-case tracking-normal text-slate-800"
              value={skipReason}
              onChange={(event) =>
                setSkipReason(event.target.value as SkipReasonCode)
              }
              disabled={submitting}
            >
              {SKIP_REASON_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          {skipReason === "other" ? (
            <label className="mt-3 block text-xs uppercase tracking-wide text-slate-500">
              说明（必填）
              <input
                type="text"
                value={skipText}
                onChange={(event) => setSkipText(event.target.value)}
                disabled={submitting}
                className="mt-1 block w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm normal-case tracking-normal text-slate-800"
                maxLength={2000}
              />
            </label>
          ) : null}
          <button
            type="button"
            onClick={() => void submitSkipped()}
            disabled={submitting}
            className="mt-3 rounded-lg bg-slate-950 px-3 py-2 text-sm font-medium text-white disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-950"
          >
            确认跳过
          </button>
        </div>
      ) : null}

      <div className="mt-5 border-t border-slate-200 pt-4">
        <p className="text-xs uppercase tracking-wide text-slate-500">
          完成本次任务
        </p>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <label className="block text-xs uppercase tracking-wide text-slate-500">
            结果
            <select
              className="mt-1 block w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm normal-case tracking-normal text-slate-800"
              value={result}
              onChange={(event) =>
                setResult(event.target.value as CompletionResult)
              }
              disabled={submitting}
            >
              {RESULT_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-xs uppercase tracking-wide text-slate-500">
            语言（可选）
            <input
              type="text"
              value={language}
              onChange={(event) => setLanguage(event.target.value)}
              disabled={submitting}
              className="mt-1 block w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm normal-case tracking-normal text-slate-800"
              maxLength={100}
            />
          </label>
          <label className="block text-xs uppercase tracking-wide text-slate-500">
            耗时（分钟，可选）
            <input
              type="number"
              value={duration}
              onChange={(event) => setDuration(event.target.value)}
              disabled={submitting}
              className="mt-1 block w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm normal-case tracking-normal text-slate-800"
              min={0}
              max={10080}
            />
          </label>
          <label className="block text-xs uppercase tracking-wide text-slate-500">
            反思（可选）
            <input
              type="text"
              value={reflection}
              onChange={(event) => setReflection(event.target.value)}
              disabled={submitting}
              className="mt-1 block w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm normal-case tracking-normal text-slate-800"
              maxLength={2000}
            />
          </label>
        </div>
        <button
          type="button"
          onClick={() => void submitCompletion()}
          disabled={submitting}
          className="mt-3 rounded-lg bg-slate-950 px-3 py-2 text-sm font-medium text-white disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-950"
        >
          提交完成
        </button>
      </div>

      {status !== null ? (
        <p
          role="status"
          aria-live="polite"
          className={`mt-3 text-sm ${
            status.tone === "success"
              ? "text-emerald-700"
              : status.tone === "error"
              ? "text-red-700"
              : "text-slate-700"
          }`}
        >
          {status.text}
        </p>
      ) : null}
    </section>
  );
}