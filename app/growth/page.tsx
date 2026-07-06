import { openDatabase } from "@/lib/db/client";
import { listRecentAttempts } from "@/lib/repositories/attempts";

export default function GrowthPage() {
  const db = openDatabase();
  try {
    const attempts = listRecentAttempts(db, 50);
    const completed = attempts.filter((attempt) => attempt.result !== "draft");
    const passed = attempts.filter((attempt) => attempt.result === "passed");
    return (
      <main className="mx-auto max-w-4xl px-6 py-10">
        <h1 className="text-3xl font-semibold">Growth</h1>
        <p className="mt-3 text-slate-600">
          Growth summarizes attempts, streaks, tag performance, verdicts, and review completion from local training
          data.
        </p>
        {attempts.length === 0 ? (
          <p className="mt-4 text-slate-600">
            No attempt data yet. Captured sessions will appear here after Phase 2.2 materializes them.
          </p>
        ) : (
          <section className="mt-6 grid gap-3 sm:grid-cols-3">
            <div className="rounded-xl border border-slate-200 bg-white p-4">
              <p className="text-sm text-slate-500">Attempts</p>
              <p className="mt-1 text-2xl font-semibold text-slate-950">{attempts.length}</p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white p-4">
              <p className="text-sm text-slate-500">Completed</p>
              <p className="mt-1 text-2xl font-semibold text-slate-950">{completed.length}</p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white p-4">
              <p className="text-sm text-slate-500">Passed</p>
              <p className="mt-1 text-2xl font-semibold text-slate-950">{passed.length}</p>
            </div>
          </section>
        )}
      </main>
    );
  } finally {
    db.close();
  }
}
