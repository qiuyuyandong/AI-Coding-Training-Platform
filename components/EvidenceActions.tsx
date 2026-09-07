"use client";

import React, { useState } from "react";

type NodeOption = { readonly id: string; readonly title: string };
type DueReview = { readonly id: string; readonly nodeTitle: string; readonly purpose: string; readonly dueAt: string };

export function EvidenceActions({ nodes, initialReviews }: {
  readonly nodes: readonly NodeOption[];
  readonly initialReviews: readonly DueReview[];
}) {
  const [reviews, setReviews] = useState(initialReviews);
  const [nodeId, setNodeId] = useState(nodes[0]?.id ?? "");
  const [kind, setKind] = useState<"self_rating" | "dispute">("self_rating");
  const [rating, setRating] = useState("L1");
  const [reason, setReason] = useState("");
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  const [assessmentRequestKey, setAssessmentRequestKey] = useState(() => crypto.randomUUID());

  async function submitAssessment(): Promise<void> {
    setBusy(true);
    try {
      const response = await fetch("/api/evidence/assessments", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          nodeId,
          kind,
          rating: kind === "self_rating" ? rating : null,
          reason: reason.trim().length > 0 ? reason.trim() : null,
          abilityInputFingerprint: null,
          idempotencyKey: assessmentRequestKey,
        }),
      });
      const result: { readonly ok: boolean; readonly error?: string } = await response.json();
      setStatus(result.ok ? "已记录，能力等级保持不变，等待后续证据验证。" : result.error ?? "保存失败");
      if (result.ok) {
        setReason("");
        setAssessmentRequestKey(crypto.randomUUID());
      }
    } catch (error) {
      setStatus(error instanceof Error ? `网络错误：${error.message}` : "网络错误：保存失败");
    } finally {
      setBusy(false);
    }
  }

  async function finishReview(reviewId: string): Promise<void> {
    setBusy(true);
    try {
      const response = await fetch(`/api/evidence/reviews/${reviewId}/complete`, { method: "POST" });
      const result: { readonly ok: boolean; readonly error?: string } = await response.json();
      if (result.ok) setReviews((current) => current.filter((review) => review.id !== reviewId));
      setStatus(result.ok ? "复习项已完成。" : result.error ?? "更新失败");
    } catch (error) {
      setStatus(error instanceof Error ? `网络错误：${error.message}` : "网络错误：更新失败");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-5">
      <section className="rounded-xl border border-slate-200 bg-white p-5">
        <h2 className="text-lg font-semibold text-slate-950">到期复习</h2>
        {reviews.length === 0 ? <p className="mt-2 text-sm text-slate-600">当前没有到期复习。</p> : (
          <div className="mt-3 space-y-2">
            {reviews.map((review) => (
              <div key={review.id} className="flex items-center justify-between gap-4 rounded-lg bg-slate-50 p-3">
                <div><p className="font-medium text-slate-900">{review.nodeTitle}</p><p className="text-xs text-slate-500">{review.purpose} · {review.dueAt}</p></div>
                <button type="button" disabled={busy} onClick={() => void finishReview(review.id)} className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm disabled:opacity-50">标记完成</button>
              </div>
            ))}
          </div>
        )}
      </section>
      <section className="rounded-xl border border-slate-200 bg-white p-5">
        <h2 className="text-lg font-semibold text-slate-950">自评或申诉</h2>
        <p className="mt-1 text-xs text-slate-500">此处只记录你的看法，不会直接修改能力等级。</p>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <select value={nodeId} onChange={(event) => setNodeId(event.target.value)} className="rounded-lg border border-slate-200 px-3 py-2">
            {nodes.map((node) => <option key={node.id} value={node.id}>{node.title}</option>)}
          </select>
          <select value={kind} onChange={(event) => setKind(event.target.value as typeof kind)} className="rounded-lg border border-slate-200 px-3 py-2">
            <option value="self_rating">自评</option><option value="dispute">申诉现有判断</option>
          </select>
          {kind === "self_rating" ? <select value={rating} onChange={(event) => setRating(event.target.value)} className="rounded-lg border border-slate-200 px-3 py-2"><option value="unassessed">未评估</option>{[1, 2, 3, 4, 5].map((level) => <option key={level} value={`L${level}`}>L{level}</option>)}</select> : null}
          <textarea value={reason} onChange={(event) => setReason(event.target.value)} maxLength={500} placeholder={kind === "dispute" ? "说明你认为判断不准确的原因" : "可选说明"} className="rounded-lg border border-slate-200 px-3 py-2 sm:col-span-2" />
        </div>
        <button type="button" disabled={busy || nodeId.length === 0 || (kind === "dispute" && reason.trim().length === 0)} onClick={() => void submitAssessment()} className="mt-3 rounded-lg bg-slate-950 px-4 py-2 text-sm text-white disabled:opacity-50">保存</button>
        {status.length > 0 ? <p role="status" className="mt-3 text-sm text-slate-700">{status}</p> : null}
      </section>
    </div>
  );
}
