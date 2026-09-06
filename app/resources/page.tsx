import { openDatabase } from "@/lib/db/client";

export const dynamic = "force-dynamic";

type ResourceRow = {
  readonly id: string;
  readonly title: string;
  readonly url: string;
  readonly author: string;
  readonly language: string;
  readonly cost: string;
  readonly access: string;
  readonly license_boundary: string;
  readonly review_status: string;
  readonly reviewed_at: string;
  readonly stopping_guidance: string;
  readonly node_titles: string | null;
};

export default function ResourcesPage() {
  const db = openDatabase();
  try {
    const resources = db.prepare<[], ResourceRow>(`
      SELECT resource.id, resource.title, resource.url, resource.author,
             resource.language, resource.cost, resource.access,
             resource.license_boundary, resource.review_status,
             resource.reviewed_at, resource.stopping_guidance,
             group_concat(node.title, ' · ') AS node_titles
      FROM learning_resources resource
      LEFT JOIN node_resources mapping ON mapping.resource_id = resource.id
      LEFT JOIN knowledge_nodes node ON node.id = mapping.node_id
      GROUP BY resource.id
      ORDER BY resource.review_status DESC, resource.title ASC
    `).all();
    return (
      <main className="mx-auto max-w-5xl px-6 py-10">
        <header><p className="text-sm uppercase tracking-wide text-slate-500">Resources</p><h1 className="mt-3 text-3xl font-semibold text-slate-950">学习资源目录</h1><p className="mt-3 text-slate-600">目录展示审查状态、访问条件、语言、授权边界和停止指引；链接直接指向原始来源。</p></header>
        {resources.length === 0 ? <p className="mt-6 rounded-xl border border-slate-200 bg-white p-5 text-slate-600">当前数据库还没有安装课程包。先在 Plan 页面完成初始化。</p> : <div className="mt-6 space-y-3">{resources.map((resource) => (
          <article key={resource.id} className="rounded-xl border border-slate-200 bg-white p-5">
            <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-xs uppercase tracking-wide text-slate-500">{resource.node_titles ?? "未绑定节点"}</p><h2 className="mt-1 text-lg font-semibold text-slate-950"><a href={resource.url} target="_blank" rel="noreferrer" className="underline decoration-slate-300">{resource.title}</a></h2><p className="mt-1 text-sm text-slate-600">{resource.author}</p></div><span className={`rounded px-2 py-1 text-xs ${resource.review_status === "reviewed" ? "bg-emerald-50 text-emerald-800" : "bg-amber-50 text-amber-800"}`}>{resource.review_status}</span></div>
            <dl className="mt-4 grid gap-2 text-sm sm:grid-cols-4"><div><dt className="text-slate-500">语言</dt><dd>{resource.language}</dd></div><div><dt className="text-slate-500">费用</dt><dd>{resource.cost}</dd></div><div><dt className="text-slate-500">访问</dt><dd>{resource.access}</dd></div><div><dt className="text-slate-500">审查时间</dt><dd>{resource.reviewed_at}</dd></div></dl>
            <p className="mt-3 text-sm text-slate-700"><strong>停止指引：</strong>{resource.stopping_guidance}</p><p className="mt-2 text-xs text-slate-500">授权边界：{resource.license_boundary}</p>
          </article>
        ))}</div>}
      </main>
    );
  } finally {
    db.close();
  }
}
