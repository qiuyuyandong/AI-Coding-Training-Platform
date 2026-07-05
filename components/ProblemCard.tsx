import type { Problem } from "@/lib/domain/problem";

export function ProblemCard({ problem }: { problem: Problem }) {
  return (
    <article className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-wide text-slate-500">{problem.platform}</p>
          <h2 className="mt-1 text-lg font-semibold text-slate-950">{problem.title}</h2>
          <p className="mt-2 text-sm text-slate-600">{problem.tags.join(" · ")} · {problem.difficulty}</p>
        </div>
        <span className="rounded-full bg-slate-100 px-3 py-1 text-xs text-slate-700">{problem.contentMode}</span>
      </div>
      <a className="mt-4 inline-block rounded-lg bg-slate-950 px-4 py-2 text-sm text-white" href={`/training?platform=${problem.platform}&externalId=${encodeURIComponent(problem.externalId)}`}>
        Start Training
      </a>
    </article>
  );
}