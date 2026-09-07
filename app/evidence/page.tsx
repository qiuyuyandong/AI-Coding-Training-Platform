import { EvidenceActions } from "@/components/EvidenceActions";
import { openDatabase } from "@/lib/db/client";
import { LOCAL_DEFAULT_LEARNER_ID } from "@/lib/domain/learner";
import { getOrCreateLocalProfile } from "@/lib/repositories/learnerProfiles";
import { AiCoachActions } from "@/components/AiCoachActions";
import { buildAiCoachPanelData } from "@/lib/services/aiCoachService";

export const dynamic = "force-dynamic";

type SummaryRow = {
  readonly id: string;
  readonly source_type: string;
  readonly outcome: string;
  readonly coverage_level: string;
  readonly confidence: string;
  readonly reason_codes_json: string;
  readonly unresolved_facts_json: string;
  readonly created_at: string;
};
type EventRow = { readonly id: string; readonly source_type: string; readonly event_type: string; readonly confidence: string; readonly occurred_at: string };
type SnapshotRow = { readonly id: string; readonly source_type: string; readonly event_kind: string; readonly capture_mode: string; readonly byte_size: number; readonly captured_at: string; readonly deleted_at: string | null };
type ReviewRow = { readonly id: string; readonly node_title: string; readonly purpose: string; readonly due_at: string };
type NodeRow = { readonly id: string; readonly title: string };
type AssessmentRow = { readonly id: string; readonly node_title: string; readonly kind: string; readonly rating: string | null; readonly reason: string | null; readonly resolution: string; readonly created_at: string };
type AbilityRow = { readonly node_id: string; readonly node_title: string; readonly visible_level: string; readonly confidence: string; readonly evidence_count: number; readonly stale: number; readonly projection_version: string; readonly as_of_time: string };

export default function EvidencePage() {
  const db = openDatabase();
  try {
    getOrCreateLocalProfile(db);
    const summaries = db.prepare<[string], SummaryRow>(`
      SELECT id, source_type, outcome, coverage_level, confidence,
             reason_codes_json, unresolved_facts_json, created_at
      FROM training_session_summaries WHERE learner_id = ?
      ORDER BY created_at DESC, id ASC LIMIT 20
    `).all(LOCAL_DEFAULT_LEARNER_ID);
    const events = db.prepare<[string], EventRow>(`
      SELECT id, source_type, event_type, confidence, occurred_at
      FROM learning_evidence_events WHERE learner_id = ?
      ORDER BY occurred_at DESC, id ASC LIMIT 30
    `).all(LOCAL_DEFAULT_LEARNER_ID);
    const snapshots = db.prepare<[string], SnapshotRow>(`
      SELECT id, source_type, event_kind, capture_mode, byte_size, captured_at, deleted_at
      FROM code_snapshot_refs WHERE learner_id = ?
      ORDER BY captured_at DESC, id ASC LIMIT 20
    `).all(LOCAL_DEFAULT_LEARNER_ID);
    const reviews = db.prepare<[string, string], ReviewRow>(`
      SELECT review.id, node.title AS node_title, review.purpose, review.due_at
      FROM review_items review JOIN knowledge_nodes node ON node.id = review.node_id
      WHERE review.learner_id = ? AND review.status = 'open' AND review.due_at <= ?
      ORDER BY review.priority DESC, review.due_at ASC LIMIT 20
    `).all(LOCAL_DEFAULT_LEARNER_ID, new Date().toISOString());
    const nodes = db.prepare<[], NodeRow>(`
      SELECT id, title FROM knowledge_nodes WHERE status = 'published' ORDER BY title ASC
    `).all();
    const assessments = db.prepare<[string], AssessmentRow>(`
      SELECT assessment.id, node.title AS node_title, assessment.kind,
             assessment.rating, assessment.reason, assessment.resolution, assessment.created_at
      FROM learner_assessments assessment JOIN knowledge_nodes node ON node.id = assessment.node_id
      WHERE assessment.learner_id = ? ORDER BY assessment.created_at DESC LIMIT 10
    `).all(LOCAL_DEFAULT_LEARNER_ID);
    const abilities = db.prepare<[string], AbilityRow>(`
      SELECT ability.node_id, node.title AS node_title, ability.visible_level,
             ability.confidence, ability.evidence_count, ability.stale,
             ability.projection_version, ability.as_of_time
      FROM ability_snapshots ability JOIN knowledge_nodes node ON node.id = ability.node_id
      WHERE ability.learner_id = ?
      ORDER BY node.order_index ASC, node.title ASC
    `).all(LOCAL_DEFAULT_LEARNER_ID);
    const ai = buildAiCoachPanelData(db);
    const coverage = countBy(summaries.map((summary) => summary.coverage_level));

    return (
      <main className="mx-auto max-w-5xl px-6 py-10">
        <header>
          <p className="text-sm uppercase tracking-wide text-slate-500">Evidence</p>
          <h1 className="mt-3 text-3xl font-semibold text-slate-950">可审计训练证据</h1>
          <p className="mt-3 text-slate-600">每个结论保留来源、覆盖等级、置信度和未确认事实。能力变化仍由独立投影器决定。</p>
        </header>

        <section className="mt-6 grid gap-3 sm:grid-cols-4">
          {(["E1", "E2", "E3", "E4"] as const).map((level) => <Metric key={level} label={level} value={coverage.get(level) ?? 0} />)}
        </section>

        <div className="mt-6"><EvidenceActions nodes={nodes} initialReviews={reviews.map((review) => ({ id: review.id, nodeTitle: review.node_title, purpose: review.purpose, dueAt: review.due_at }))} /></div>

        <div className="mt-6"><AiCoachActions surface="evidence" evidenceOptions={ai.evidenceOptions} initialPreference={ai.preference} /></div>

        <section className="mt-6 rounded-xl border border-slate-200 bg-white p-5">
          <h2 className="text-lg font-semibold text-slate-950">当前能力投影</h2>
          {abilities.length === 0 ? <p className="mt-2 text-sm text-slate-600">尚无能力投影。</p> : <div className="mt-3 grid gap-2 sm:grid-cols-2">{abilities.map((ability) => <div key={ability.node_id} className="rounded-lg bg-slate-50 p-3"><div className="flex items-center justify-between gap-2"><p className="font-medium text-slate-900">{ability.node_title}</p><strong>{ability.visible_level}</strong></div><p className="mt-1 text-xs text-slate-500">{ability.confidence} · {ability.evidence_count} evidence · {ability.stale === 1 ? "stale" : "current"}</p><p className="mt-1 text-xs text-slate-400">{ability.projection_version} · {ability.as_of_time}</p></div>)}</div>}
        </section>

        <section className="mt-6 rounded-xl border border-slate-200 bg-white p-5">
          <h2 className="text-lg font-semibold text-slate-950">最近训练结论</h2>
          {summaries.length === 0 ? <p className="mt-2 text-sm text-slate-600">尚无训练结论。</p> : <div className="mt-3 space-y-3">{summaries.map((summary) => (
            <article key={summary.id} className="rounded-lg border border-slate-200 p-3">
              <div className="flex flex-wrap items-center gap-2"><strong className="text-slate-950">{outcomeLabel(summary.outcome)}</strong><span className="rounded bg-slate-100 px-2 py-0.5 text-xs">{summary.coverage_level}</span><span className="text-xs text-slate-500">{summary.confidence} confidence · {summary.source_type}</span></div>
              <p className="mt-2 text-sm text-slate-700">依据：{parseStringArray(summary.reason_codes_json).join("、") || "无"}</p>
              <p className="mt-1 text-sm text-amber-800">未确认：{parseStringArray(summary.unresolved_facts_json).join("、") || "无"}</p>
              <p className="mt-2 text-xs text-slate-500">{summary.created_at}</p>
            </article>
          ))}</div>}
        </section>

        <div className="mt-6 grid gap-5 lg:grid-cols-2">
          <section className="rounded-xl border border-slate-200 bg-white p-5">
            <h2 className="text-lg font-semibold text-slate-950">证据时间线</h2>
            <div className="mt-3 space-y-2">{events.length === 0 ? <p className="text-sm text-slate-600">尚无事件。</p> : events.map((event) => <div key={event.id} className="rounded-lg bg-slate-50 p-3 text-sm"><p className="font-medium text-slate-900">{event.event_type}</p><p className="text-xs text-slate-500">{event.source_type} · {event.confidence} · {event.occurred_at}</p></div>)}</div>
          </section>
          <section className="rounded-xl border border-slate-200 bg-white p-5">
            <h2 className="text-lg font-semibold text-slate-950">快照引用</h2>
            <div className="mt-3 space-y-2">{snapshots.length === 0 ? <p className="text-sm text-slate-600">尚无快照引用。</p> : snapshots.map((snapshot) => <div key={snapshot.id} className="rounded-lg bg-slate-50 p-3 text-sm"><p className="font-medium text-slate-900">{snapshot.event_kind} · {snapshot.capture_mode}</p><p className="text-xs text-slate-500">{snapshot.source_type} · {snapshot.byte_size} bytes · {snapshot.deleted_at === null ? "retained" : "deleted"}</p></div>)}</div>
          </section>
        </div>

        <section className="mt-6 rounded-xl border border-slate-200 bg-white p-5">
          <h2 className="text-lg font-semibold text-slate-950">自评记录</h2>
          <div className="mt-3 space-y-2">{assessments.length === 0 ? <p className="text-sm text-slate-600">尚无自评或申诉。</p> : assessments.map((assessment) => <div key={assessment.id} className="rounded-lg bg-slate-50 p-3 text-sm"><p className="font-medium text-slate-900">{assessment.node_title} · {assessment.kind}{assessment.rating === null ? "" : ` ${assessment.rating}`}</p><p className="text-slate-600">{assessment.reason ?? "未填写说明"}</p><p className="text-xs text-slate-500">{assessment.resolution} · {assessment.created_at}</p></div>)}</div>
        </section>
      </main>
    );
  } finally {
    db.close();
  }
}

function Metric({ label, value }: { readonly label: string; readonly value: number }) {
  return <div className="rounded-xl border border-slate-200 bg-white p-4"><p className="text-sm text-slate-500">{label} conclusions</p><p className="mt-1 text-2xl font-semibold text-slate-950">{value}</p></div>;
}

function parseStringArray(value: string): readonly string[] {
  try {
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed) && parsed.every((item) => typeof item === "string") ? parsed : [];
  } catch {
    return [];
  }
}

function countBy(values: readonly string[]): ReadonlyMap<string, number> {
  const counts = new Map<string, number>();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  return counts;
}

function outcomeLabel(value: string): string {
  return ({
    independent_effective_completion: "独立有效完成",
    assisted_effective_completion: "借助帮助后有效完成",
    productive_struggle: "有效卡住",
    unproductive_trial_and_error: "无效试错",
    insufficient_evidence: "证据不足",
  } as Readonly<Record<string, string>>)[value] ?? value;
}
