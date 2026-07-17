import type Database from "better-sqlite3";
import Link from "next/link";
import { notFound } from "next/navigation";
import { openDatabase } from "@/lib/db/client";
import { LOCAL_DEFAULT_LEARNER_ID } from "@/lib/domain/learner";
import {
  findKnowledgeNodeByStableId,
  listKnowledgeEdges,
  listPublishedKnowledgeNodes,
  type KnowledgeEdgeRow,
  type KnowledgeNodeRow,
} from "@/lib/repositories/curriculum";
import {
  findLearningResourceByNode,
  listCanonicalProblemSources,
  listPracticeTasksForNode,
  type CanonicalProblemSourceRow,
  type LearningResourceRow,
  type PracticeTaskRow,
} from "@/lib/repositories/resources";
import { findAbilitySnapshot } from "@/lib/repositories/ability";
import { type AbilitySnapshotRow } from "@/lib/domain/ability";
import { explainLevel, type Explanation } from "@/lib/services/evidenceExplanation";
import { prerequisiteClosure, type KnowledgeEdge } from "@/lib/services/curriculumGraph";

export const dynamic = "force-dynamic";

/**
 * V0 curriculum node-detail payload.
 *
 * The detail page renders the node's outcome, rationale, prerequisite
 * closure (transitive `required_prerequisite` predecessors), the primary
 * reviewed resource with access / review / stopping metadata, the mapped
 * practice deep link, the node status and, when available, the current
 * learner's ability explanation. The payload is exported so the unit
 * suite can assert on its shape without going through the React
 * component.
 */
export type NodeDetailPayload =
  | {
      readonly status: "available";
      readonly packageId: string;
      readonly node: NodeDetailNode;
      readonly prerequisites: readonly string[];
      readonly resource: NodeDetailResource | null;
      readonly practice: NodeDetailPractice | null;
      readonly ability: NodeDetailAbility | null;
    }
  | {
      readonly status: "missing-package";
    }
  | {
      readonly status: "unknown-node";
      readonly requestedNodeId: string;
    };

export type NodeDetailNode = {
  readonly stableId: string;
  readonly title: string;
  readonly outcome: string;
  readonly rationale: string;
  readonly orderIndex: number;
  readonly status: KnowledgeNodeRow["status"];
  readonly provenance: NodeDetailProvenance;
};

export type NodeDetailProvenance = {
  readonly authority: string;
  readonly url: string;
  readonly retrievedAt: string;
};

export type NodeDetailResource = {
  readonly stableId: string;
  readonly title: string;
  readonly author: string;
  readonly language: string;
  readonly cost: string;
  readonly access: string;
  readonly licenseBoundary: string;
  readonly reviewStatus: string;
  readonly reviewedAt: string;
  readonly stoppingGuidance: string;
  readonly url: string;
};

export type NodeDetailPractice = {
  readonly stableId: string;
  readonly title: string;
  readonly kind: string;
  readonly difficultyBand: string;
  readonly primarySource: NodeDetailPracticeSource | null;
  readonly sources: readonly NodeDetailPracticeSource[];
};

export type NodeDetailPracticeSource = {
  readonly platform: string;
  readonly externalId: string;
  readonly url: string;
  readonly isPrimary: boolean;
};

export type NodeDetailAbility = {
  readonly visibleLevel: string;
  readonly confidence: string;
  readonly evidenceCount: number;
  readonly stale: boolean;
  readonly projectionVersion: string;
  readonly asOfTime: string;
  readonly explanation: Explanation;
};

type KnowledgeEdgeInput = {
  readonly from_stable_id: string;
  readonly to_stable_id: string;
  readonly edge_type: string;
};

/**
 * Build the node-detail payload for the given package-scoped stable id.
 * Returns `missing-package` when no curriculum package is installed and
 * `unknown-node` when the requested id does not match any published
 * node. The function never throws on application-level errors so the
 * page can call `notFound()` only when it is meaningful.
 */
export function buildNodeDetail(
  db: Database.Database,
  requestedNodeId: string,
): NodeDetailPayload {
  const packageRow = db
    .prepare<[], { readonly id: string }>(
      `SELECT id
         FROM curriculum_packages
         ORDER BY installed_at DESC, id DESC
         LIMIT 1`,
    )
    .get();
  if (packageRow === undefined) {
    return { status: "missing-package" };
  }
  const packageId = packageRow.id;

  const nodeRow = findKnowledgeNodeByStableId(db, packageId, requestedNodeId);
  if (nodeRow === null) {
    return { status: "unknown-node", requestedNodeId };
  }

  const allNodeRows = listPublishedKnowledgeNodes(db, packageId);
  const stableIdByNodeId = new Map<string, string>();
  for (const row of allNodeRows) {
    stableIdByNodeId.set(row.id, row.stable_id);
  }

  const edgeRows = listKnowledgeEdges(db, packageId);
  const edges: KnowledgeEdge[] = edgeRows
    .map((row) => toKnowledgeEdge(row, stableIdByNodeId))
    .filter((edge): edge is KnowledgeEdge => edge !== null);

  const prerequisites = prerequisiteClosure(requestedNodeId, edges);

  const resourceRow = findLearningResourceByNode(db, nodeRow.id);
  const resource = resourceRow === null ? null : toResource(resourceRow);

  const practiceTasks = listPracticeTasksForNode(db, nodeRow.id);
  const practice =
    practiceTasks.length === 0
      ? null
      : buildPractice(db, practiceTasks[0]);

  const ability = buildAbility(db, nodeRow.id);

  return {
    status: "available",
    packageId,
    node: toNode(nodeRow),
    prerequisites,
    resource,
    practice,
    ability,
  };
}

function toKnowledgeEdge(
  row: KnowledgeEdgeRow,
  stableIdByNodeId: ReadonlyMap<string, string>,
): KnowledgeEdgeInput | null {
  const from = stableIdByNodeId.get(row.from_node_id);
  const to = stableIdByNodeId.get(row.to_node_id);
  if (from === undefined || to === undefined) return null;
  return {
    from_stable_id: from,
    to_stable_id: to,
    edge_type: row.edge_type,
  };
}

function toNode(row: KnowledgeNodeRow): NodeDetailNode {
  const provenance = parseProvenance(row.provenance_json);
  return {
    stableId: row.stable_id,
    title: row.title,
    outcome: row.outcome,
    rationale: row.rationale,
    orderIndex: row.order_index,
    status: row.status,
    provenance,
  };
}

function parseProvenance(raw: string): NodeDetailProvenance {
  type Parsed = {
    readonly authority?: unknown;
    readonly url?: unknown;
    readonly retrieved_at?: unknown;
  };
  let value: Parsed;
  try {
    value = JSON.parse(raw) as Parsed;
  } catch {
    return { authority: "", url: "", retrievedAt: "" };
  }
  return {
    authority: typeof value.authority === "string" ? value.authority : "",
    url: typeof value.url === "string" ? value.url : "",
    retrievedAt:
      typeof value.retrieved_at === "string" ? value.retrieved_at : "",
  };
}

function toResource(row: LearningResourceRow): NodeDetailResource {
  return {
    stableId: row.stable_id,
    title: row.title,
    author: row.author,
    language: row.language,
    cost: row.cost,
    access: row.access,
    licenseBoundary: row.license_boundary,
    reviewStatus: row.review_status,
    reviewedAt: row.reviewed_at,
    stoppingGuidance: row.stopping_guidance,
    url: row.url,
  };
}

function buildPractice(
  db: Database.Database,
  task: PracticeTaskRow,
): NodeDetailPractice {
  const sources = listCanonicalProblemSources(db, task.canonical_problem_id);
  const mapped: NodeDetailPracticeSource[] = sources.map(toPracticeSource);
  const primary =
    mapped.find((source) => source.isPrimary) ?? mapped[0] ?? null;
  return {
    stableId: task.stable_id,
    title: task.title,
    kind: task.kind,
    difficultyBand: task.difficulty_band,
    primarySource: primary,
    sources: mapped,
  };
}

function toPracticeSource(
  row: CanonicalProblemSourceRow,
): NodeDetailPracticeSource {
  return {
    platform: row.platform,
    externalId: row.external_id,
    url: row.url,
    isPrimary: row.is_primary === 1,
  };
}

function buildAbility(
  db: Database.Database,
  nodeId: string,
): NodeDetailAbility | null {
  const snapshot = findAbilitySnapshot(db, LOCAL_DEFAULT_LEARNER_ID, nodeId);
  if (snapshot === null) return null;
  return toAbility(snapshot);
}

function toAbility(snapshot: AbilitySnapshotRow): NodeDetailAbility {
  const reasonCodes = parseJsonStringArray(snapshot.input_fingerprint);
  const cited = parseJsonStringArray("");
  void cited;
  const explanation = explainLevel(
    snapshot.visible_level,
    snapshot.confidence,
    reasonCodes,
    [],
    [],
  );
  return {
    visibleLevel: snapshot.visible_level,
    confidence: snapshot.confidence,
    evidenceCount: snapshot.evidence_count,
    stale: snapshot.stale,
    projectionVersion: snapshot.projection_version,
    asOfTime: snapshot.as_of_time,
    explanation,
  };
}

function parseJsonStringArray(raw: string): readonly string[] {
  if (raw.length === 0) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((value): value is string => typeof value === "string");
  } catch {
    return [];
  }
}

type NodeDetailPageProps = {
  readonly params: { readonly nodeId: string };
};

export default function NodeDetailPage({ params }: NodeDetailPageProps) {
  const db = openDatabase();
  try {
    const payload = buildNodeDetail(db, params.nodeId);
    if (payload.status === "missing-package") {
      return (
        <NodeDetailMissingPackage
          requestedNodeId={params.nodeId}
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
        导入 <code>software-development-foundations-v1@1.0.0</code>，然后刷新
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