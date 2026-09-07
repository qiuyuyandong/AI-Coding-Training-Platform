"use client";

import { useState } from "react";
import type { AiContextCategory, AiMode, CoachReport, PlanChangeProposal } from "@/lib/domain/aiCoach";

type EvidenceOption = { readonly id: string; readonly label: string };

export function AiCoachActions({
  surface,
  evidenceOptions,
  initialPreference,
}: {
  readonly surface: "coach" | "evidence" | "plan";
  readonly evidenceOptions: readonly EvidenceOption[];
  readonly initialPreference: { readonly mode: AiMode; readonly allowedContext: readonly AiContextCategory[] };
}) {
  const [mode, setMode] = useState(initialPreference.mode);
  const [allowEvidence, setAllowEvidence] = useState(initialPreference.allowedContext.includes("evidence_summary"));
  const [allowCode, setAllowCode] = useState(initialPreference.allowedContext.includes("code_snapshot"));
  const [selectedIds, setSelectedIds] = useState<readonly string[]>(evidenceOptions.slice(0, 3).map((item) => item.id));
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [report, setReport] = useState<{ readonly id: string; readonly value: CoachReport; readonly source: string } | null>(null);
  const [proposal, setProposal] = useState<{ readonly id: string; readonly value: PlanChangeProposal; readonly source: string } | null>(null);

  const requestedContext: AiContextCategory[] = [
    ...(allowEvidence ? ["evidence_summary" as const] : []),
    ...(allowCode ? ["code_snapshot" as const] : []),
  ];

  async function savePreference(): Promise<void> {
    setBusy(true);
    setStatus("");
    try {
      const response = await fetch("/api/ai/preferences", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ mode, allowedContext: requestedContext }),
      });
      const body: { readonly ok: boolean; readonly error?: string } = await response.json();
      setStatus(body.ok ? "AI 偏好已保存在本机。" : body.error ?? "AI 偏好保存失败");
    } catch (error) {
      setStatus(networkError(error));
    } finally {
      setBusy(false);
    }
  }

  async function generate(): Promise<void> {
    setBusy(true);
    setStatus("");
    const isPlan = surface === "plan";
    try {
      const response = await fetch(isPlan ? "/api/ai/plan-proposals" : "/api/ai/reports", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ evidenceIds: selectedIds, requestedContext, requestKey: crypto.randomUUID() }),
      });
      const body: {
        readonly ok: boolean;
        readonly error?: string;
        readonly id?: string;
        readonly source?: string;
        readonly report?: CoachReport;
        readonly proposal?: PlanChangeProposal;
      } = await response.json();
      if (!body.ok || body.id === undefined || body.source === undefined) {
        setStatus(body.error ?? "AI 请求失败；本地功能不受影响。");
      } else if (isPlan && body.proposal !== undefined) {
        setProposal({ id: body.id, value: body.proposal, source: body.source });
        setStatus(body.source === "ai" ? "AI 计划提案已生成，尚未应用。" : "已生成确定性本地回退提案，尚未应用。");
      } else if (body.report !== undefined) {
        setReport({ id: body.id, value: body.report, source: body.source });
        setStatus(body.source === "ai" ? "AI 报告已生成并保存在本机。" : "已保存确定性本地回退报告。");
      }
    } catch (error) {
      setStatus(networkError(error));
    } finally {
      setBusy(false);
    }
  }

  async function deleteReport(): Promise<void> {
    if (report === null) return;
    setBusy(true);
    try {
      const response = await fetch(`/api/ai/reports/${report.id}`, { method: "DELETE" });
      const body: { readonly ok: boolean; readonly error?: string } = await response.json();
      if (body.ok) {
        setReport(null);
        setStatus("AI 报告已软删除。");
      } else setStatus(body.error ?? "报告删除失败");
    } catch (error) {
      setStatus(networkError(error));
    } finally {
      setBusy(false);
    }
  }

  async function decide(decision: "accept" | "reject"): Promise<void> {
    if (proposal === null) return;
    setBusy(true);
    try {
      const response = await fetch(`/api/ai/plan-proposals/${proposal.id}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ decision }),
      });
      const body: { readonly ok: boolean; readonly error?: string } = await response.json();
      if (!body.ok) setStatus(body.error ?? "提案处理失败");
      else {
        setStatus(decision === "accept" ? "提案已通过本地计划约束校验并应用。" : "提案已拒绝，计划未变化。");
        setProposal(null);
        if (decision === "accept") window.location.reload();
      }
    } catch (error) {
      setStatus(networkError(error));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-5">
      <h2 className="text-lg font-semibold text-slate-950">按需 AI Coach</h2>
      <p className="mt-1 text-sm text-slate-600">默认禁用。只有点击生成时才会发起请求；AI 只能生成报告或待确认提案。</p>
      <div className="mt-3 grid gap-2 text-sm sm:grid-cols-3">
        <label className="flex items-center gap-2"><input type="checkbox" checked={mode === "on_demand"} onChange={(event) => setMode(event.target.checked ? "on_demand" : "disabled")} />启用按需调用</label>
        <label className="flex items-center gap-2"><input type="checkbox" checked={allowEvidence} onChange={(event) => setAllowEvidence(event.target.checked)} />允许结构化证据摘要</label>
        <label className="flex items-center gap-2"><input type="checkbox" checked={allowCode} onChange={(event) => setAllowCode(event.target.checked)} />允许已选代码快照</label>
      </div>
      <button type="button" disabled={busy} onClick={() => void savePreference()} className="mt-3 rounded-lg border border-slate-300 px-3 py-1.5 text-sm disabled:opacity-50">保存 AI 偏好</button>
      <fieldset className="mt-4" disabled={busy}>
        <legend className="text-sm font-medium text-slate-800">本次明确选择的证据</legend>
        {evidenceOptions.length === 0 ? <p className="mt-2 text-sm text-slate-500">暂无可选证据。</p> : <div className="mt-2 space-y-1">{evidenceOptions.map((option) => <label key={option.id} className="flex items-center gap-2 text-xs text-slate-600"><input type="checkbox" checked={selectedIds.includes(option.id)} onChange={(event) => setSelectedIds((current) => event.target.checked ? [...current, option.id] : current.filter((id) => id !== option.id))} />{option.label}</label>)}</div>}
      </fieldset>
      <button type="button" disabled={busy || mode !== "on_demand" || !allowEvidence || selectedIds.length === 0} onClick={() => void generate()} className="mt-4 rounded-lg bg-slate-950 px-4 py-2 text-sm text-white disabled:opacity-50">{surface === "plan" ? "生成计划提案" : "生成 Coach 报告"}</button>
      {report === null ? null : <article className="mt-4 rounded-lg bg-slate-50 p-3 text-sm"><p className="font-medium">{report.value.summary}</p><p className="mt-2 text-xs text-slate-500">来源：{report.source} · 引用 {report.value.evidenceIds.length} 条证据</p><ul className="mt-2 list-disc pl-5">{report.value.nextSteps.map((step) => <li key={step}>{step}</li>)}</ul><button type="button" disabled={busy} onClick={() => void deleteReport()} className="mt-3 rounded border border-slate-300 px-2 py-1 text-xs">删除报告</button></article>}
      {proposal === null ? null : <article className="mt-4 rounded-lg bg-slate-50 p-3 text-sm"><p className="font-medium">{proposal.value.dailyMode} · {proposal.value.effortBoundaryMinutes} 分钟</p><p className="mt-1 text-slate-600">{proposal.value.rationale}</p><p className="mt-2 text-xs text-slate-500">来源：{proposal.source}；尚未写入计划。</p><div className="mt-3 flex gap-2"><button type="button" disabled={busy} onClick={() => void decide("accept")} className="rounded bg-emerald-700 px-3 py-1.5 text-xs text-white">接受并校验</button><button type="button" disabled={busy} onClick={() => void decide("reject")} className="rounded border border-slate-300 px-3 py-1.5 text-xs">拒绝</button></div></article>}
      {status.length > 0 ? <p role="status" className="mt-3 text-sm text-slate-700">{status}</p> : null}
    </section>
  );
}

function networkError(error: unknown): string {
  return error instanceof Error ? `网络错误：${error.message}` : "网络错误：AI 请求失败";
}
