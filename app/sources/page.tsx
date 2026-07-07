import { listSources } from "@/lib/sources/registry";

export default function SourcesPage() {
  const sources = listSources();

  return (
    <main className="mx-auto max-w-4xl px-6 py-10">
      <h1 className="text-3xl font-semibold">Source Registry</h1>
      <p className="mt-3 text-slate-600">V1 catalogs OJ sources and their compliance metadata. Browser-extension-captured platforms stay metadata-only; Codeforces/AtCoder use official metadata APIs.</p>
      <ul className="mt-8 space-y-3">
        {sources.map((s) => (
          <li key={s.id} className="rounded-xl border border-slate-200 bg-white p-4">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs uppercase tracking-wide text-slate-500">{s.platform}</p>
                <h2 className="mt-1 text-lg font-semibold text-slate-950">{s.name}</h2>
                <a className="mt-2 block text-sm text-slate-600 underline" href={s.homepage} target="_blank" rel="noreferrer">{s.homepage}</a>
              </div>
              <div className="text-right text-xs text-slate-500">
                <p>{s.integrationMode}</p>
                <p>{s.statementPolicy}</p>
                <p className={s.enabled ? "text-emerald-700" : "text-slate-400"}>{s.enabled ? "enabled" : "disabled"}</p>
              </div>
            </div>
          </li>
        ))}
      </ul>
    </main>
  );
}
