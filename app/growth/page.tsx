import { openDatabase } from "@/lib/db/client";
import { aggregateAttempts, listAttempts } from "@/lib/repositories/attempts";
import { buildGrowthStats } from "@/lib/services/growthStats";

export const dynamic = "force-dynamic";

export default function GrowthPage() {
  const db = openDatabase();
  try {
    const aggregate = aggregateAttempts(db, {});
    const recentAttempts = listAttempts(db, { limit: 5 });
    const stats = buildGrowthStats(aggregate, recentAttempts);
    const evidenceOutcomes = db.prepare<[], { readonly outcome: string; readonly coverage_level: string; readonly count: number }>(`
      SELECT outcome, coverage_level, COUNT(*) AS count
      FROM training_session_summaries
      GROUP BY outcome, coverage_level
      ORDER BY outcome ASC, coverage_level ASC
    `).all();
    const calibration = db.prepare<[], {
      readonly correction_count: number;
      readonly pending_assessment_count: number;
      readonly stale_node_count: number;
      readonly wheel_spinning_count: number;
    }>(`
      SELECT
        (SELECT COUNT(DISTINCT correction_id) FROM attempt_corrections) AS correction_count,
        (SELECT COUNT(*) FROM learner_assessments WHERE resolution = 'pending_verification') AS pending_assessment_count,
        (SELECT COUNT(*) FROM ability_snapshots WHERE stale = 1) AS stale_node_count,
        (SELECT COUNT(*) FROM training_session_summaries WHERE outcome = 'unproductive_trial_and_error') AS wheel_spinning_count
    `).get();
    return (
      <main className="mx-auto max-w-4xl px-6 py-10">
        <h1 className="text-3xl font-semibold">Growth</h1>
        <p className="mt-3 text-slate-600">
          Growth summarizes all local attempts, completion/pass rates, result distribution, and recent activity.
        </p>
        {stats.totalAttempts === 0 ? (
          <p className="mt-4 text-slate-600">
            No attempt data yet. Captured sessions will appear here after Phase 2.2 materializes them.
          </p>
        ) : (
          <>
            <section className="mt-6 grid gap-3 sm:grid-cols-5">
              <h2 className="sr-only">All-time totals</h2>
              <MetricCard label="Attempts" value={stats.totalAttempts.toString()} />
              <MetricCard label="Completed" value={stats.completedAttempts.toString()} />
              <MetricCard label="Passed" value={stats.passedAttempts.toString()} />
              <MetricCard label="Completion Rate" value={formatRate(stats.completionRate)} />
              <MetricCard label="Pass Rate" value={formatRate(stats.passRate)} />
            </section>

            <section className="mt-6 rounded-xl border border-slate-200 bg-white p-4">
              <h2 className="font-semibold text-slate-950">Result distribution</h2>
              <dl className="mt-3 grid gap-2 sm:grid-cols-5">
                {Object.entries(stats.resultDistribution).map(([result, count]) => (
                  <div key={result} className="rounded-lg bg-slate-50 p-3">
                    <dt className="text-xs uppercase tracking-wide text-slate-500">{result}</dt>
                    <dd className="mt-1 text-lg font-semibold text-slate-950">{count}</dd>
                  </div>
                ))}
              </dl>
            </section>

            <section className="mt-6 rounded-xl border border-slate-200 bg-white p-4">
              <h2 className="font-semibold text-slate-950">Latest 5 attempts</h2>
              <div className="mt-3 space-y-3">
                {stats.recentActivity.map((item) => (
                  <div key={item.id} className="rounded-lg border border-slate-200 bg-white p-3">
                    <p className="font-medium text-slate-900">{item.problemTitle}</p>
                    <p className="mt-1 text-sm text-slate-600">
                      {item.platform} · {item.result} · {sourceLabel(item.recordSource)}
                    </p>
                    <p className="mt-2 text-xs text-slate-500">Updated: {item.updatedAt}</p>
                  </div>
                ))}
              </div>
            </section>
          </>
        )}
        <section className="mt-6 rounded-xl border border-slate-200 bg-white p-4">
          <h2 className="font-semibold text-slate-950">Evidence-backed outcomes</h2>
          <p className="mt-1 text-sm text-slate-600">Training conclusions are separated from raw pass counts and include their evidence coverage.</p>
          {evidenceOutcomes.length === 0 ? <p className="mt-3 text-sm text-slate-600">No evidence conclusions yet.</p> : <dl className="mt-3 grid gap-2 sm:grid-cols-2">{evidenceOutcomes.map((row) => <div key={`${row.outcome}-${row.coverage_level}`} className="rounded-lg bg-slate-50 p-3"><dt className="text-sm text-slate-700">{row.outcome}</dt><dd className="mt-1 text-lg font-semibold text-slate-950">{row.count} <span className="text-xs font-normal text-slate-500">at {row.coverage_level}</span></dd></div>)}</dl>}
        </section>
        <section className="mt-6 grid gap-3 sm:grid-cols-4">
          <MetricCard label="Corrections" value={(calibration?.correction_count ?? 0).toString()} />
          <MetricCard label="Pending assessments" value={(calibration?.pending_assessment_count ?? 0).toString()} />
          <MetricCard label="Stale nodes" value={(calibration?.stale_node_count ?? 0).toString()} />
          <MetricCard label="Wheel-spinning sessions" value={(calibration?.wheel_spinning_count ?? 0).toString()} />
        </section>
      </main>
    );
  } finally {
    db.close();
  }
}

function sourceLabel(source: "capture" | "manual"): string {
  return source === "capture" ? "Automatic capture" : "Manual entry";
}

function MetricCard({ label, value }: { readonly label: string; readonly value: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <p className="text-sm text-slate-500">{label}</p>
      <p className="mt-1 text-2xl font-semibold text-slate-950">{value}</p>
    </div>
  );
}

function formatRate(rate: number): string {
  return `${Math.round(rate * 100)}%`;
}
