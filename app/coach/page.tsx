import { openDatabase } from "@/lib/db/client";
import { listAttempts } from "@/lib/repositories/attempts";
import { buildCoachAnalysis } from "@/lib/services/coachAnalysis";
import { LOCAL_DEFAULT_LEARNER_ID } from "@/lib/domain/learner";

export const dynamic = "force-dynamic";

export default function CoachPage() {
  const db = openDatabase();
  try {
    const attempts = listAttempts(db, { limit: 50 });
    const analysis = buildCoachAnalysis(attempts, new Date().toISOString());
    const dueReviews = db.prepare<[string, string], { readonly id: string; readonly node_title: string; readonly purpose: string; readonly due_at: string; readonly reason_codes_json: string }>(`
      SELECT review.id, node.title AS node_title, review.purpose,
             review.due_at, review.reason_codes_json
      FROM review_items review JOIN knowledge_nodes node ON node.id = review.node_id
      WHERE review.learner_id = ? AND review.status = 'open' AND review.due_at <= ?
      ORDER BY review.priority DESC, review.due_at ASC LIMIT 10
    `).all(LOCAL_DEFAULT_LEARNER_ID, new Date().toISOString());
    return (
      <main className="mx-auto max-w-4xl px-6 py-10">
        <h1 className="text-3xl font-semibold">Coach</h1>
        <p className="mt-3 text-slate-600">
          Coach uses local attempts and capture events to explain weak points and recommend the next practice. V1
          starts with rule-based analysis.
        </p>
        <section className="mt-6 rounded-xl border border-slate-200 bg-white p-4">
          <p className="text-sm uppercase tracking-wide text-slate-500">Local coach summary</p>
          <p className="mt-2 text-slate-700">{analysis.summary}</p>
          <p className="mt-2 text-xs text-slate-500">Latest 50 attempts reviewed: {analysis.recentWindowSize}</p>
        </section>

        <section className="mt-4 rounded-xl border border-slate-200 bg-white p-4">
          <h2 className="font-semibold text-slate-950">Signals</h2>
          <div className="mt-3 space-y-3">
            {analysis.signals.map((signal) => (
              <div key={signal.kind} className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                <p className="font-medium text-slate-900">{signal.title}</p>
                <p className="mt-1 text-sm text-slate-600">{signal.detail}</p>
                <p className="mt-2 text-xs text-slate-500">Evidence attempts: {signal.evidenceAttemptIds.length}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="mt-4 rounded-xl border border-slate-200 bg-white p-4">
          <h2 className="font-semibold text-slate-950">Recommendations</h2>
          <div className="mt-3 space-y-3">
            {analysis.recommendations.map((recommendation) => (
              <div key={recommendation.title} className="rounded-lg border border-slate-200 bg-white p-3">
                <p className="font-medium text-slate-900">{recommendation.title}</p>
                <p className="mt-1 text-sm text-slate-600">{recommendation.reason}</p>
                <p className="mt-2 text-sm text-slate-700">{recommendation.action}</p>
                <p className="mt-2 text-xs text-slate-500">Evidence attempts: {recommendation.evidenceAttemptIds.length}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="mt-4 rounded-xl border border-slate-200 bg-white p-4">
          <h2 className="font-semibold text-slate-950">Evidence review queue</h2>
          {dueReviews.length === 0 ? <p className="mt-3 text-sm text-slate-600">No due evidence reviews.</p> : <div className="mt-3 space-y-3">{dueReviews.map((review) => <div key={review.id} className="rounded-lg border border-slate-200 bg-slate-50 p-3"><p className="font-medium text-slate-900">{review.node_title}</p><p className="mt-1 text-sm text-slate-600">{review.purpose} · due {review.due_at}</p><p className="mt-2 text-xs text-slate-500">Reason codes: {review.reason_codes_json}</p></div>)}</div>}
        </section>
      </main>
    );
  } finally {
    db.close();
  }
}
