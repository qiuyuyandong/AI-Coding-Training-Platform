import { openDatabase } from "@/lib/db/client";
import { listRecentAttempts } from "@/lib/repositories/attempts";

export const dynamic = "force-dynamic";

export default function CoachPage() {
  const db = openDatabase();
  try {
    const attempts = listRecentAttempts(db, 20);
    const failed = attempts.filter((attempt) => attempt.result === "failed" || attempt.result === "stuck");
    const passed = attempts.filter((attempt) => attempt.result === "passed");
    return (
      <main className="mx-auto max-w-4xl px-6 py-10">
        <h1 className="text-3xl font-semibold">Coach</h1>
        <p className="mt-3 text-slate-600">
          Coach uses local attempts and capture events to explain weak points and recommend the next practice. V1
          starts with rule-based analysis.
        </p>
        {attempts.length === 0 ? (
          <p className="mt-4 text-slate-600">
            No attempts yet. Complete a captured training session to unlock local coach feedback.
          </p>
        ) : (
          <section className="mt-6 rounded-xl border border-slate-200 bg-white p-4">
            <p className="text-sm uppercase tracking-wide text-slate-500">Local coach summary</p>
            <p className="mt-2 text-slate-700">Recent attempts reviewed: {attempts.length}</p>
            <p className="mt-2 text-slate-700">Passed: {passed.length}</p>
            <p className="mt-2 text-slate-700">Failed or stuck: {failed.length}</p>
            <p className="mt-4 text-slate-700">
              {failed.length > 0
                ? "Focus: review failed or stuck attempts first before starting new problems."
                : "Focus: keep building consistency with new problems and revisit edge cases."}
            </p>
          </section>
        )}
      </main>
    );
  } finally {
    db.close();
  }
}
