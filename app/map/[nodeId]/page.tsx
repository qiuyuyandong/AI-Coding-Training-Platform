import Link from "next/link";
import { notFound } from "next/navigation";
import { openDatabase } from "@/lib/db/client";
import {
  type NodeDetailPayload,
  buildNodeDetail,
} from "@/lib/pages/nodeDetail";

export const dynamic = "force-dynamic";

type NodeDetailPageProps = {
  readonly params: Promise<{ readonly nodeId: string }>;
};

export default async function NodeDetailPage({ params }: NodeDetailPageProps) {
  const { nodeId } = await params;
  const db = openDatabase();
  try {
    const payload = buildNodeDetail(db, nodeId);
    if (payload.status === "missing-package") {
      return (
        <NodeDetailMissingPackage
          requestedNodeId={nodeId}
        />
      );
    }
    if (payload.status === "unknown-node") {
      notFound();
    }
    return <NodeDetailView payload={payload} />;
  } finally {
    db.close();
  }
}

function NodeDetailMissingPackage({
  requestedNodeId,
}: {
  readonly requestedNodeId: string;
}) {
  return (
    <main lang="zh-CN" className="mx-auto max-w-4xl px-6 py-10">
      <h1 className="text-3xl font-semibold text-slate-950">
        Curriculum map
      </h1>
      <p className="mt-3 text-slate-600">
        当前数据库未安装任何 curriculum package。请先运行
        <code className="mx-1 rounded bg-slate-100 px-1 py-0.5 text-xs">
          npm run curriculum:import
        </code>
        导入 <code>software-development-foundations-v1@1.0.1</code>，然后刷新
        <code className="mx-1 rounded bg-slate-100 px-1 py-0.5 text-xs">
          /map/{requestedNodeId}
        </code>
        。
      </p>
      <Link
        href="/map"
        className="mt-4 inline-block rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 hover:bg-slate-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-950"
      >
        返回节点列表
      </Link>
    </main>
  );
}

function NodeDetailView({
  payload,
}: {
  readonly payload: Extract<NodeDetailPayload, { status: "available" }>;
}) {
  const { node, prerequisites, resource, practice, ability } = payload;
  return (
    <main lang="zh-CN" className="mx-auto max-w-4xl px-6 py-10">
      <nav aria-label="Breadcrumb" className="text-xs text-slate-500">
        <Link
          href="/map"
          className="hover:text-slate-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-950"
        >
          ← 返回节点列表
        </Link>
      </nav>

      <header className="mt-3">
        <p className="text-sm uppercase tracking-wide text-slate-500">
          步骤 {node.orderIndex} · {node.status}
        </p>
        <h1 className="mt-3 text-3xl font-semibold text-slate-950">
          {node.title}
        </h1>
        <p className="mt-2 text-xs text-slate-500">{node.stableId}</p>
        <p className="mt-3 text-slate-700">{node.outcome}</p>
      </header>

      <section
        aria-labelledby="why-heading"
        className="mt-6 rounded-xl border border-slate-200 bg-white p-4"
      >
        <h2
          id="why-heading"
          className="text-lg font-semibold text-slate-950"
        >
          为什么重要
        </h2>
        <p className="mt-2 text-slate-600">{node.rationale}</p>
      </section>

      <section
        aria-labelledby="prereq-heading"
        className="mt-4 rounded-xl border border-slate-200 bg-white p-4"
      >
        <h2
          id="prereq-heading"
          className="text-lg font-semibold text-slate-950"
        >
          先修节点（传递闭包）
        </h2>
        {prerequisites.length === 0 ? (
          <p className="mt-2 text-sm text-slate-500">
            该节点无任何传递先修。
          </p>
        ) : (
          <ul className="mt-3 space-y-1">
            {prerequisites.map((stableId) => (
              <li key={stableId}>
                <Link
                  href={`/map/${stableId}`}
                  className="text-slate-900 underline-offset-2 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-950"
                >
                  {stableId}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section
        aria-labelledby="resource-heading"
        className="mt-4 rounded-xl border border-slate-200 bg-white p-4"
      >
        <h2
          id="resource-heading"
          className="text-lg font-semibold text-slate-950"
        >
          主要学习资源
        </h2>
        {resource === null ? (
          <p className="mt-2 text-sm text-red-700">
            该节点尚未挂载审核通过的资源。
          </p>
        ) : (
          <article className="mt-3">
            <p className="font-medium text-slate-900">{resource.title}</p>
            <p className="mt-1 text-xs text-slate-500">
              作者：{resource.author} · 语言：{resource.language} · 访问：
              {resource.access} · 费用：{resource.cost}
            </p>
            <p className="mt-1 text-xs text-slate-500">
              审核状态：{resource.reviewStatus}（{resource.reviewedAt}）·
              许可证边界：{resource.licenseBoundary}
            </p>
            <p className="mt-2 text-sm text-slate-600">
              停止指引：{resource.stoppingGuidance}
            </p>
            <a
              href={resource.url}
              target="_blank"
              rel="noreferrer noopener"
              className="mt-3 inline-block rounded-lg bg-slate-950 px-4 py-2 text-sm text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-950"
            >
              打开资源（外部）
            </a>
          </article>
        )}
      </section>

      <section
        aria-labelledby="practice-heading"
        className="mt-4 rounded-xl border border-slate-200 bg-white p-4"
      >
        <h2
          id="practice-heading"
          className="text-lg font-semibold text-slate-950"
        >
          映射练习
        </h2>
        {practice === null ? (
          <p className="mt-2 text-sm text-red-700">
            该节点尚未挂载练习映射。
          </p>
        ) : (
          <article className="mt-3">
            <p className="font-medium text-slate-900">{practice.title}</p>
            <p className="mt-1 text-xs text-slate-500">
              类型：{practice.kind} · 难度：{practice.difficultyBand}
            </p>
            {practice.primarySource !== null ? (
              <a
                href={practice.primarySource.url}
                target="_blank"
                rel="noreferrer noopener"
                className="mt-3 inline-block rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm text-slate-900 hover:bg-slate-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-950"
              >
                前往练习（{practice.primarySource.platform}，外部）
              </a>
            ) : null}
            {practice.sources.length > 1 ? (
              <details className="mt-3">
                <summary className="cursor-pointer rounded-lg bg-slate-100 px-3 py-2 text-sm text-slate-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-950">
                  查看全部来源
                </summary>
                <ul className="mt-2 space-y-1">
                  {practice.sources.map((source) => (
                    <li key={`${source.platform}-${source.externalId}`}>
                      <a
                        href={source.url}
                        target="_blank"
                        rel="noreferrer noopener"
                        className="text-sm text-slate-700 underline-offset-2 hover:underline"
                      >
                        {source.platform} · {source.externalId}
                        {source.isPrimary ? "（主要）" : ""}
                      </a>
                    </li>
                  ))}
                </ul>
              </details>
            ) : null}
          </article>
        )}
      </section>

      <section
        aria-labelledby="ability-heading"
        className="mt-4 rounded-xl border border-slate-200 bg-white p-4"
      >
        <h2
          id="ability-heading"
          className="text-lg font-semibold text-slate-950"
        >
          当前能力
        </h2>
        {ability === null ? (
          <p className="mt-2 text-sm text-slate-500">
            该节点尚无能力快照。可完成对应练习以建立首次信号。
          </p>
        ) : (
          <article className="mt-3">
            <p className="font-medium text-slate-900">
              {ability.explanation.levelLabel} · {ability.explanation.confidenceLabel}
            </p>
            <p className="mt-1 text-xs text-slate-500">
              证据 {ability.evidenceCount} 条 ·
              投影版本 {ability.projectionVersion} ·
              {ability.stale ? " 已陈旧" : " 现行"}
            </p>
            <p className="mt-2 text-sm text-slate-600">
              不确定性：{ability.explanation.uncertainty}
            </p>
            <p className="mt-1 text-sm text-slate-600">
              下一步证据：{ability.explanation.nextEvidenceNeeded}
            </p>
          </article>
        )}
      </section>

      <section
        aria-labelledby="provenance-heading"
        className="mt-4 rounded-xl border border-slate-200 bg-white p-4"
      >
        <h2
          id="provenance-heading"
          className="text-lg font-semibold text-slate-950"
        >
          出处与合规
        </h2>
        <p className="mt-2 text-sm text-slate-600">
          来源：{node.provenance.authority} · 检索时间：
          {node.provenance.retrievedAt}
        </p>
        <a
          href={node.provenance.url}
          target="_blank"
          rel="noreferrer noopener"
          className="mt-2 inline-block text-sm text-slate-700 underline-offset-2 hover:underline"
        >
          查看参考链接
        </a>
      </section>
    </main>
  );
}