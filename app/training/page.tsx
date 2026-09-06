import { TrainingWorkspace } from "@/components/TrainingWorkspace";
import { openDatabase } from "@/lib/db/client";
import { LOCAL_DEFAULT_LEARNER_ID } from "@/lib/domain/learner";

export const dynamic = "force-dynamic";

export default async function TrainingPage({ searchParams }: { searchParams: Promise<{ platform?: string; externalId?: string; title?: string }> }) {
  const { platform = "leetcode", externalId = "two-sum", title } = await searchParams;
  const db = openDatabase();
  let latestEvidence: { readonly outcome: string; readonly coverage_level: string; readonly confidence: string } | undefined;
  let activeProjects = 0;
  try {
    latestEvidence = db.prepare<[string, string, string], { readonly outcome: string; readonly coverage_level: string; readonly confidence: string }>(`
      SELECT summary.outcome, summary.coverage_level, summary.confidence
      FROM training_session_summaries summary
      JOIN training_attempts attempt ON summary.source_type = 'attempt' AND summary.source_id = attempt.id
      WHERE summary.learner_id = ? AND attempt.platform = ? AND attempt.external_id = ?
      ORDER BY summary.created_at DESC LIMIT 1
    `).get(LOCAL_DEFAULT_LEARNER_ID, platform, externalId);
    activeProjects = db.prepare<[string], { readonly count: number }>(`
      SELECT COUNT(*) AS count FROM learner_projects WHERE learner_id = ? AND status = 'active'
    `).get(LOCAL_DEFAULT_LEARNER_ID)?.count ?? 0;
  } finally {
    db.close();
  }

  return (
    <main className="mx-auto max-w-4xl px-6 py-10">
      <section className="mb-5 grid gap-3 sm:grid-cols-2">
        <div className="rounded-xl border border-slate-200 bg-white p-4"><p className="text-xs uppercase tracking-wide text-slate-500">Latest evidence</p><p className="mt-2 text-sm text-slate-800">{latestEvidence === undefined ? "此题还没有证据结论" : `${latestEvidence.outcome} · ${latestEvidence.coverage_level} · ${latestEvidence.confidence}`}</p><a href="/evidence" className="mt-2 inline-block text-sm underline">查看证据链</a></div>
        <div className="rounded-xl border border-slate-200 bg-white p-4"><p className="text-xs uppercase tracking-wide text-slate-500">Project practice</p><p className="mt-2 text-sm text-slate-800">进行中的项目：{activeProjects}</p><a href="/projects" className="mt-2 inline-block text-sm underline">进入项目训练</a></div>
      </section>
      <TrainingWorkspace platform={platform} externalId={externalId} title={title} />
    </main>
  );
}
