const links = [
  ["Sources", "/sources"],
  ["Problems", "/problems"],
  ["Training", "/training"],
  ["Coach", "/coach"],
  ["Growth", "/growth"],
  ["Compliance", "/compliance"],
] as const;

export default function HomePage() {
  return (
    <main className="mx-auto max-w-5xl px-6 py-12">
      <p className="text-sm uppercase tracking-wide text-slate-500">Unified OJ Entry</p>
      <h1 className="mt-3 text-4xl font-semibold text-slate-950">
        一个入口检索题目，原站训练，本站沉淀训练记忆。
      </h1>
      <p className="mt-4 max-w-2xl text-slate-600">
        V1 使用元数据检索、原站 deep-link 和浏览器插件数据回流，不默认缓存力扣、牛客、洛谷等平台的完整题面。
      </p>
      <nav className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {links.map(([label, href]) => (
          <a key={href} href={href} className="rounded-xl border border-slate-200 p-4 text-slate-900 hover:bg-slate-50">
            {label}
          </a>
        ))}
      </nav>
    </main>
  );
}