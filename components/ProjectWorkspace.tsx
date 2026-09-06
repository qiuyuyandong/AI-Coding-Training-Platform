"use client";

import { useState } from "react";
import type { CaptureMode } from "@/lib/domain/evidence";

type ActiveProject = {
  readonly projectId: string;
  readonly projectTitle: string;
  readonly sessionId: string;
  readonly milestoneTitle: string;
  readonly captureMode: CaptureMode;
  readonly artifacts: readonly { readonly id: string; readonly kind: string; readonly purpose: string; readonly recordedAt: string }[];
  readonly runResults: readonly { readonly id: string; readonly kind: "build" | "test" | "check"; readonly result: string; readonly recordedAt: string }[];
};

type ProjectWorkspaceProps = {
  readonly templateTitle: string;
  readonly templateSummary: string;
  readonly activeProject: ActiveProject | null;
  readonly projectCount: number;
};

export function ProjectWorkspace(props: ProjectWorkspaceProps) {
  const [active, setActive] = useState(props.activeProject);
  const [captureMode, setCaptureMode] = useState<CaptureMode>("basic");
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);

  async function startProject(): Promise<void> {
    setBusy(true);
    setStatus("");
    try {
      const response = await fetch("/api/projects", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "start", captureMode, toolchainLabel: "local toolchain" }),
      });
      const body: { readonly ok: boolean; readonly error?: string; readonly projectId?: string; readonly sessionId?: string } = await response.json();
      if (!body.ok || body.projectId === undefined || body.sessionId === undefined) {
        setStatus(body.error ?? "项目启动失败");
        return;
      }
      setActive({
        projectId: body.projectId,
        sessionId: body.sessionId,
        projectTitle: props.templateTitle,
        milestoneTitle: "Basic input, output, and CRUD",
        captureMode,
        artifacts: [],
        runResults: [],
      });
      setStatus("项目与第一个显式训练会话已创建。");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "项目启动失败");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main lang="zh-CN" className="mx-auto max-w-4xl px-6 py-10">
      <header>
        <p className="text-sm uppercase tracking-wide text-slate-500">Projects</p>
        <h1 className="mt-3 text-3xl font-semibold text-slate-950">显式项目实践</h1>
        <p className="mt-3 text-slate-600">
          任何编辑器都可以使用。系统只接收你主动填写的构建、测试和选定制品，不监控工作区或终端。
        </p>
      </header>

      {active === null ? (
        <section className="mt-6 rounded-xl border border-slate-200 bg-white p-5">
          <h2 className="text-xl font-semibold text-slate-950">{props.templateTitle}</h2>
          <p className="mt-2 text-sm text-slate-600">{props.templateSummary}</p>
          <p className="mt-2 text-xs text-slate-500">已有项目：{props.projectCount}</p>
          <label className="mt-4 block text-sm text-slate-700">
            证据模式
            <select
              value={captureMode}
              onChange={(event) => setCaptureMode(event.target.value as CaptureMode)}
              className="mt-1 block w-full rounded-lg border border-slate-200 bg-white px-3 py-2"
            >
              <option value="full">完整：保存明确粘贴的快照</option>
              <option value="basic">基础：只保存哈希与结构摘要</option>
              <option value="minimal">最小：只保存结果</option>
            </select>
          </label>
          <button
            type="button"
            disabled={busy}
            onClick={() => void startProject()}
            className="mt-4 rounded-lg bg-slate-950 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            开始项目
          </button>
        </section>
      ) : (
        <EvidencePanel active={active} busy={busy} setBusy={setBusy} setStatus={setStatus} />
      )}

      {status.length > 0 ? <p role="status" className="mt-4 text-sm text-slate-700">{status}</p> : null}
    </main>
  );
}

function EvidencePanel({
  active,
  busy,
  setBusy,
  setStatus,
}: {
  readonly active: ActiveProject;
  readonly busy: boolean;
  readonly setBusy: (value: boolean) => void;
  readonly setStatus: (value: string) => void;
}) {
  const [runKind, setRunKind] = useState<"build" | "test" | "check">("build");
  const [runResult, setRunResult] = useState<"passed" | "failed" | "not_run">("passed");
  const [supersedesResultId, setSupersedesResultId] = useState("");
  const [diagnostics, setDiagnostics] = useState("");
  const [artifactKind, setArtifactKind] = useState<"snapshot" | "diff" | "test_summary" | "commit_reference">("diff");
  const [relativePath, setRelativePath] = useState("src/main.cpp");
  const [content, setContent] = useState("");
  const [reflection, setReflection] = useState("");
  const [assistance, setAssistance] = useState<"unknown" | "yes" | "no">("unknown");
  const [rubric, setRubric] = useState({
    function: 0, design: 0, testing: 0, integration: 0,
    maintainability: 0, robustness: 0, explanation: 0, transfer: 0,
  });
  const [replacementReason, setReplacementReason] = useState("");

  async function postEvidence(body: Readonly<Record<string, unknown>>): Promise<void> {
    setBusy(true);
    try {
      const response = await fetch(`/api/projects/sessions/${active.sessionId}/evidence`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const result: { readonly ok: boolean; readonly error?: string } = await response.json();
      setStatus(result.ok ? "证据已保存。" : result.error ?? "证据保存失败");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "证据保存失败");
    } finally {
      setBusy(false);
    }
  }

  async function complete(): Promise<void> {
    setBusy(true);
    try {
      const response = await fetch(`/api/projects/sessions/${active.sessionId}/complete`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          usedAssistance: assistance === "unknown" ? null : assistance === "yes",
          reflection: reflection.trim().length > 0 ? reflection.trim() : undefined,
          rubricScores: rubric,
        }),
      });
      const result: { readonly ok: boolean; readonly error?: string; readonly outcome?: string } = await response.json();
      if (!result.ok) {
        setStatus(result.error ?? "里程碑确认失败");
        return;
      }
      setStatus(`里程碑已确认；训练结论：${result.outcome ?? "已生成"}`);
      window.location.reload();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "里程碑确认失败");
    } finally {
      setBusy(false);
    }
  }

  async function deleteArtifact(artifactId: string): Promise<void> {
    await postEvidence({ action: "delete_artifact", artifactId });
    window.location.reload();
  }

  async function exportEvidence(): Promise<void> {
    setBusy(true);
    try {
      const response = await fetch(`/api/projects/sessions/${active.sessionId}/export`, { method: "POST" });
      if (!response.ok) {
        const result: { readonly error?: string } = await response.json();
        setStatus(result.error ?? "导出失败");
        return;
      }
      const url = URL.createObjectURL(await response.blob());
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `project-evidence-${active.sessionId}.json`;
      anchor.click();
      URL.revokeObjectURL(url);
      setStatus("证据元数据已导出；未包含原始快照内容或本地绝对路径。");
    } finally {
      setBusy(false);
    }
  }

  async function replaceSession(): Promise<void> {
    if (replacementReason.trim().length === 0) return;
    setBusy(true);
    try {
      const response = await fetch(`/api/projects/sessions/${active.sessionId}/replace`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ reason: replacementReason.trim() }),
      });
      const result: { readonly ok: boolean; readonly error?: string } = await response.json();
      if (result.ok) window.location.reload();
      else setStatus(result.error ?? "替换会话失败");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-6 space-y-5">
      <section className="rounded-xl border border-slate-200 bg-white p-5">
        <p className="text-xs uppercase tracking-wide text-slate-500">{active.projectTitle}</p>
        <h2 className="mt-2 text-xl font-semibold text-slate-950">{active.milestoneTitle}</h2>
        <p className="mt-1 text-xs text-slate-500">证据模式：{active.captureMode} · 会话：{active.sessionId}</p>
        <button type="button" disabled={busy} onClick={() => void exportEvidence()} className="mt-3 rounded-lg border border-slate-300 px-3 py-1.5 text-sm disabled:opacity-50">导出本会话证据</button>
        <div className="mt-3 flex gap-2"><input value={replacementReason} onChange={(event) => setReplacementReason(event.target.value)} maxLength={500} placeholder="重新开始此里程碑的原因" className="min-w-0 flex-1 rounded-lg border border-slate-200 px-3 py-1.5 text-sm" /><button type="button" disabled={busy || replacementReason.trim().length === 0} onClick={() => void replaceSession()} className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm disabled:opacity-50">替换会话</button></div>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-5">
        <h2 className="text-lg font-semibold">构建、测试或检查</h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <select value={runKind} onChange={(event) => setRunKind(event.target.value as typeof runKind)} className="rounded-lg border border-slate-200 px-3 py-2">
            <option value="build">构建</option><option value="test">测试</option><option value="check">检查</option>
          </select>
          <select value={runResult} onChange={(event) => setRunResult(event.target.value as typeof runResult)} className="rounded-lg border border-slate-200 px-3 py-2">
            <option value="passed">通过</option><option value="failed">失败</option><option value="not_run">未运行</option>
          </select>
          <textarea value={diagnostics} onChange={(event) => setDiagnostics(event.target.value)} maxLength={4000} placeholder="可选：简短诊断或测试摘要" className="rounded-lg border border-slate-200 px-3 py-2 sm:col-span-2" />
          <select value={supersedesResultId} onChange={(event) => setSupersedesResultId(event.target.value)} className="rounded-lg border border-slate-200 px-3 py-2 sm:col-span-2">
            <option value="">新增结果</option>
            {active.runResults.filter((run) => run.kind === runKind).map((run) => <option key={run.id} value={run.id}>更正：{run.kind} / {run.result} / {run.recordedAt}</option>)}
          </select>
        </div>
        <button type="button" disabled={busy} onClick={() => void postEvidence({
          action: "run", kind: runKind, result: runResult,
          diagnostics: diagnostics.trim().length > 0 ? diagnostics.trim() : undefined,
          provenance: "user_entered", supersedesResultId: supersedesResultId || undefined,
          idempotencyKey: crypto.randomUUID(),
        })} className="mt-3 rounded-lg bg-slate-950 px-4 py-2 text-sm text-white disabled:opacity-50">保存结果</button>
        {active.runResults.length > 0 ? <div className="mt-3 space-y-1 text-xs text-slate-500">{active.runResults.map((run) => <p key={run.id}>{run.kind} · {run.result} · {run.recordedAt}</p>)}</div> : null}
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-5">
        <h2 className="text-lg font-semibold">选定制品</h2>
        <p className="mt-1 text-xs text-slate-500">只处理你在这里明确粘贴的内容；不会读取路径指向的文件。</p>
        <div className="mt-3 grid gap-3">
          <select value={artifactKind} onChange={(event) => setArtifactKind(event.target.value as typeof artifactKind)} className="rounded-lg border border-slate-200 px-3 py-2">
            <option value="diff">Git diff</option><option value="snapshot">代码快照</option><option value="test_summary">测试摘要</option><option value="commit_reference">提交引用</option>
          </select>
          <input value={relativePath} onChange={(event) => setRelativePath(event.target.value)} placeholder="相对路径，如 src/main.cpp" className="rounded-lg border border-slate-200 px-3 py-2" />
          <textarea value={content} onChange={(event) => setContent(event.target.value)} placeholder="粘贴已预览的代码、diff 或摘要" className="min-h-32 rounded-lg border border-slate-200 px-3 py-2" />
        </div>
        <button type="button" disabled={busy || active.captureMode === "minimal"} onClick={() => void postEvidence({
          action: "artifact", kind: artifactKind, purpose: "project milestone evidence",
          captureMode: active.captureMode, relativePath, content,
          reference: artifactKind === "commit_reference" ? content.trim() : undefined,
          idempotencyKey: crypto.randomUUID(),
        })} className="mt-3 rounded-lg bg-slate-950 px-4 py-2 text-sm text-white disabled:opacity-50">保存选定制品</button>
        {active.artifacts.length > 0 ? <div className="mt-3 space-y-2">{active.artifacts.map((artifact) => <div key={artifact.id} className="flex items-center justify-between gap-3 rounded-lg bg-slate-50 p-2 text-xs"><span>{artifact.kind} · {artifact.purpose} · {artifact.recordedAt}</span><button type="button" disabled={busy} onClick={() => void deleteArtifact(artifact.id)} className="rounded border border-slate-300 px-2 py-1">删除</button></div>)}</div> : null}
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-5">
        <h2 className="text-lg font-semibold">确认里程碑</h2>
        <select value={assistance} onChange={(event) => setAssistance(event.target.value as typeof assistance)} className="mt-3 w-full rounded-lg border border-slate-200 px-3 py-2">
          <option value="unknown">是否使用帮助：未知</option><option value="no">未使用帮助</option><option value="yes">使用了帮助</option>
        </select>
        <textarea value={reflection} onChange={(event) => setReflection(event.target.value)} maxLength={2000} placeholder="简短复盘（可选）" className="mt-3 w-full rounded-lg border border-slate-200 px-3 py-2" />
        <div className="mt-3 grid gap-2 sm:grid-cols-4">
          {(Object.keys(rubric) as Array<keyof typeof rubric>).map((key) => <label key={key} className="text-xs text-slate-600">{key}<select value={rubric[key]} onChange={(event) => setRubric((current) => ({ ...current, [key]: Number(event.target.value) }))} className="mt-1 block w-full rounded-lg border border-slate-200 px-2 py-2">{[0, 1, 2, 3].map((score) => <option key={score} value={score}>{score}</option>)}</select></label>)}
        </div>
        <p className="mt-2 text-xs text-slate-500">功能、测试、集成和解释必须至少 2 分；所有分数都会引用本次证据。</p>
        <button type="button" disabled={busy || rubric.function < 2 || rubric.testing < 2 || rubric.integration < 2 || rubric.explanation < 2} onClick={() => void complete()} className="mt-3 rounded-lg bg-emerald-700 px-4 py-2 text-sm text-white disabled:opacity-50">确认并生成训练结论</button>
      </section>
    </div>
  );
}
