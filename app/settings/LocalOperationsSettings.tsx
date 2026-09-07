"use client";

import React, { useState } from "react";
import type { FeedbackCategory, VaultDiagnosisSummary } from "@/lib/services/pilotSupport";

export function LocalOperationsSettings({
  initialMetricsEnabled,
  initialDiagnosis,
}: {
  readonly initialMetricsEnabled: boolean;
  readonly initialDiagnosis: VaultDiagnosisSummary | null;
}) {
  const [metricsEnabled, setMetricsEnabled] = useState(initialMetricsEnabled);
  const [diagnosis, setDiagnosis] = useState(initialDiagnosis);
  const [categories, setCategories] = useState<readonly FeedbackCategory[]>(["vault_health"]);
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);

  async function runDiagnosis(): Promise<void> {
    setBusy(true);
    try {
      const response = await fetch("/api/support/diagnose", { cache: "no-store" });
      const body: { readonly ok: boolean; readonly error?: string; readonly diagnosis?: VaultDiagnosisSummary } = await response.json();
      if (body.ok && body.diagnosis !== undefined) {
        setDiagnosis(body.diagnosis);
        setStatus("只读诊断已完成。");
      } else setStatus(body.error ?? "诊断失败");
    } catch (error) {
      setStatus(networkError(error));
    } finally {
      setBusy(false);
    }
  }

  async function updateMetrics(enabled: boolean): Promise<void> {
    setBusy(true);
    try {
      const response = await fetch("/api/support/preferences", {
        method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ metricsEnabled: enabled }),
      });
      const body: { readonly ok: boolean; readonly error?: string } = await response.json();
      if (body.ok) {
        setMetricsEnabled(enabled);
        setStatus(enabled ? "本地聚合指标已启用；不含自由文本或身份。" : "本地聚合指标已关闭。");
      } else setStatus(body.error ?? "指标设置失败");
    } catch (error) {
      setStatus(networkError(error));
    } finally {
      setBusy(false);
    }
  }

  async function downloadFeedback(): Promise<void> {
    setBusy(true);
    try {
      const response = await fetch("/api/support/feedback", {
        method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ categories }),
      });
      const body: { readonly ok: boolean; readonly error?: string; readonly bundle?: unknown } = await response.json();
      if (!body.ok || body.bundle === undefined) {
        setStatus(body.error ?? "反馈预览生成失败");
        return;
      }
      const url = URL.createObjectURL(new Blob([`${JSON.stringify(body.bundle, null, 2)}\n`], { type: "application/json" }));
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = "training-feedback.json";
      anchor.click();
      URL.revokeObjectURL(url);
      setStatus("反馈包已下载到本机；没有上传。请在分享前再次预览。");
    } catch (error) {
      setStatus(networkError(error));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="mt-6 rounded-xl border border-slate-200 bg-white p-5">
      <h2 className="text-lg font-semibold">诊断与本地反馈</h2>
      <p className="mt-2 text-sm text-slate-600">网页只执行只读诊断和本地导出；恢复必须在应用停止后使用终端命令。</p>
      <button type="button" disabled={busy} onClick={() => void runDiagnosis()} className="mt-3 rounded-lg border border-slate-300 px-3 py-1.5 text-sm disabled:opacity-50">运行只读诊断</button>
      {diagnosis === null ? null : <p className="mt-3 text-sm text-slate-700">Vault：{diagnosis.status} · 数据库：{diagnosis.database} · 缺失快照：{diagnosis.missingSnapshotCount} · sidecar：{diagnosis.sidecars}</p>}
      <label className="mt-4 flex items-center gap-2 text-sm"><input type="checkbox" checked={metricsEnabled} disabled={busy} onChange={(event) => void updateMetrics(event.target.checked)} />启用白名单本地聚合指标（默认关闭）</label>
      <fieldset className="mt-4">
        <legend className="text-sm font-medium">反馈包类别</legend>
        {(["vault_health", "feature_counts", "schema"] as const).map((category) => <label key={category} className="mt-2 flex items-center gap-2 text-sm"><input type="checkbox" checked={categories.includes(category)} onChange={(event) => setCategories((current) => event.target.checked ? [...current, category] : current.filter((item) => item !== category))} />{category}</label>)}
      </fieldset>
      <button type="button" disabled={busy || categories.length === 0} onClick={() => void downloadFeedback()} className="mt-3 rounded-lg bg-slate-950 px-4 py-2 text-sm text-white disabled:opacity-50">预览并下载反馈包</button>
      {status.length > 0 ? <p role="status" className="mt-3 text-sm text-slate-700">{status}</p> : null}
    </section>
  );
}

function networkError(error: unknown): string {
  return error instanceof Error ? `本地请求失败：${error.message}` : "本地请求失败";
}
