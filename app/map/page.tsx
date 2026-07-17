import { openDatabase } from "@/lib/db/client";
import {
  type EdgeView,
  type NodeListItem,
  buildMapIndex,
} from "@/lib/pages/mapIndex";

export const dynamic = "force-dynamic";

export default function MapPage() {
  const db = openDatabase();
  try {
    const payload = buildMapIndex(db);
    if (payload.status === "empty") {
      return <MapEmptyState />;
    }
    return (
      <main
        lang="zh-CN"
        className="mx-auto max-w-4xl px-6 py-10"
      >
        <header>
          <p className="text-sm uppercase tracking-wide text-slate-500">
            Curriculum map
          </p>
          <h1 className="mt-3 text-3xl font-semibold text-slate-950">
            软件开发基础路径（V0）
          </h1>
          <p className="mt-3 text-slate-600">
            下方列表是首要导航入口：9 个方向概览、12 个顺序节点，每个节点链接到独立详情页。可展开的 SVG
            路线图作为补充视图，不影响键盘可达的列表导航。
          </p>
        </header>

        <section
          aria-labelledby="directions-heading"
          className="mt-8 rounded-xl border border-slate-200 bg-white p-4"
        >
          <h2
            id="directions-heading"
            className="text-lg font-semibold text-slate-950"
          >
            9 个方向概览
          </h2>
          <p className="mt-1 text-xs uppercase tracking-wide text-slate-500">
            V0 暂不提供方向专项课程，仅供阅读方向意图
          </p>
          <ul className="mt-4 grid gap-3 sm:grid-cols-3">
            {payload.directions.map((direction) => (
              <li
                key={direction.slug}
                className="rounded-lg border border-slate-200 bg-slate-50 p-3"
              >
                <p className="font-medium text-slate-900">{direction.name}</p>
                <p className="mt-1 text-sm text-slate-600">
                  {direction.purpose}
                </p>
                {direction.unavailableInV0 ? (
                  <p className="mt-2 rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-700">
                    详细路线 V0 暂未发布
                  </p>
                ) : null}
              </li>
            ))}
          </ul>
        </section>

        <section
          aria-labelledby="nodes-heading"
          className="mt-6 rounded-xl border border-slate-200 bg-white p-4"
        >
          <h2
            id="nodes-heading"
            className="text-lg font-semibold text-slate-950"
          >
            12 个顺序节点（列表为主要导航）
          </h2>
          <p className="mt-1 text-xs uppercase tracking-wide text-slate-500">
            使用 Tab 跳转、Enter 打开节点详情
          </p>
          <ol className="mt-4 space-y-2">
            {payload.nodes.map((node) => (
              <li key={node.stableId}>
                <a
                  href={node.detailHref}
                  className="block rounded-lg border border-slate-200 bg-white p-3 text-slate-900 hover:bg-slate-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-950"
                >
                  <span className="text-xs uppercase tracking-wide text-slate-500">
                    步骤 {node.orderIndex}
                  </span>
                  <span className="mt-1 block font-medium">{node.title}</span>
                  <span className="mt-1 block text-xs text-slate-500">
                    {node.stableId}
                  </span>
                </a>
              </li>
            ))}
          </ol>
        </section>

        <section
          aria-labelledby="graph-heading"
          className="mt-6 rounded-xl border border-slate-200 bg-white p-4"
        >
          <h2
            id="graph-heading"
            className="text-lg font-semibold text-slate-950"
          >
            13 条先修关系（补充视图）
          </h2>
          <details className="mt-3 group">
            <summary className="cursor-pointer rounded-lg bg-slate-100 px-3 py-2 text-sm text-slate-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-950">
              显示 / 隐藏 静态先修关系图
            </summary>
            <p className="mt-2 text-xs text-slate-500">
              该 SVG 仅作补充视觉，关闭后键盘导航仍可使用上方列表。
            </p>
            <PrerequisiteGraph edges={payload.edges} nodes={payload.nodes} />
          </details>
        </section>
      </main>
    );
  } finally {
    db.close();
  }
}

function MapEmptyState() {
  return (
    <main className="mx-auto max-w-4xl px-6 py-10">
      <h1 className="text-3xl font-semibold text-slate-950">Curriculum map</h1>
      <p className="mt-3 text-slate-600">
        当前数据库未安装任何 curriculum package。请先运行
        <code className="mx-1 rounded bg-slate-100 px-1 py-0.5 text-xs">
          npm run curriculum:import
        </code>
        导入 <code>software-development-foundations-v1@1.0.0</code>，然后刷新本页。
      </p>
    </main>
  );
}

type GraphNode = {
  readonly stableId: string;
  readonly title: string;
  readonly orderIndex: number;
};

type GraphEdge = {
  readonly fromStableId: string;
  readonly toStableId: string;
};

type NodeLayout = {
  readonly stableId: string;
  readonly title: string;
  readonly orderIndex: number;
  readonly level: number;
  readonly rowInLevel: number;
};

const CELL_WIDTH = 200;
const CELL_HEIGHT = 96;
const NODE_WIDTH = 170;
const NODE_HEIGHT = 52;
const MARGIN_X = 32;
const MARGIN_Y = 36;

function PrerequisiteGraph({
  edges,
  nodes,
}: {
  readonly edges: readonly EdgeView[];
  readonly nodes: readonly NodeListItem[];
}) {
  const layout = computeLayout(nodes, edges);
  if (layout.nodes.length === 0) {
    return (
      <p className="mt-3 text-sm text-slate-500">
        当前包未发布任何节点或先修关系。
      </p>
    );
  }
  const positions = new Map<string, { x: number; y: number }>();
  let maxRowInLevel = 0;
  for (const node of layout.nodes) {
    positions.set(node.stableId, {
      x: MARGIN_X + node.level * CELL_WIDTH,
      y: MARGIN_Y + node.rowInLevel * CELL_HEIGHT,
    });
    if (node.rowInLevel > maxRowInLevel) {
      maxRowInLevel = node.rowInLevel;
    }
  }
  const width = MARGIN_X * 2 + (layout.maxLevel + 1) * CELL_WIDTH - (CELL_WIDTH - NODE_WIDTH);
  const height = MARGIN_Y * 2 + (maxRowInLevel + 1) * CELL_HEIGHT - (CELL_HEIGHT - NODE_HEIGHT);

  return (
    <div className="mt-3 overflow-x-auto">
      <svg
        role="img"
        aria-labelledby="prereq-graph-title prereq-graph-desc"
        viewBox={`0 0 ${width} ${height}`}
        width={width}
        height={height}
        className="block max-w-full"
      >
        <title id="prereq-graph-title">先修关系静态图</title>
        <desc id="prereq-graph-desc">
          {`包含 ${layout.nodes.length} 个节点与 ${edges.length} 条先修关系，按层级从左到右排列。`}
        </desc>
        <defs>
          <marker
            id="arrow"
            viewBox="0 0 10 10"
            refX="9"
            refY="5"
            markerUnits="strokeWidth"
            markerWidth="6"
            markerHeight="6"
            orient="auto-start-reverse"
          >
            <path d="M0,0 L10,5 L0,10 z" fill="#475569" />
          </marker>
        </defs>
        {layout.orderedEdges.map((edge, idx) => {
          const from = positions.get(edge.fromStableId);
          const to = positions.get(edge.toStableId);
          if (from === undefined || to === undefined) return null;
          const x1 = from.x + NODE_WIDTH;
          const y1 = from.y + NODE_HEIGHT / 2;
          const x2 = to.x;
          const y2 = to.y + NODE_HEIGHT / 2;
          return (
            <line
              key={`edge-${idx}-${edge.fromStableId}-${edge.toStableId}`}
              x1={x1}
              y1={y1}
              x2={x2}
              y2={y2}
              stroke="#475569"
              strokeWidth={1.5}
              markerEnd="url(#arrow)"
            />
          );
        })}
        {layout.nodes.map((node) => {
          const pos = positions.get(node.stableId);
          if (pos === undefined) return null;
          return (
            <g key={node.stableId}>
              <rect
                x={pos.x}
                y={pos.y}
                width={NODE_WIDTH}
                height={NODE_HEIGHT}
                rx={6}
                ry={6}
                fill="#ffffff"
                stroke="#cbd5e1"
              />
              <a href={`/map/${node.stableId}`}>
                <text
                  x={pos.x + NODE_WIDTH / 2}
                  y={pos.y + 20}
                  textAnchor="middle"
                  fontSize={12}
                  fill="#0f172a"
                  fontWeight={600}
                >
                  {truncateLabel(node.title, 22)}
                </text>
                <text
                  x={pos.x + NODE_WIDTH / 2}
                  y={pos.y + 38}
                  textAnchor="middle"
                  fontSize={10}
                  fill="#475569"
                >
                  {`#${node.orderIndex} ${node.stableId}`}
                </text>
              </a>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

function truncateLabel(label: string, max: number): string {
  return label.length <= max ? label : `${label.slice(0, max - 1)}…`;
}

type GraphLayout = {
  readonly nodes: readonly NodeLayout[];
  readonly maxLevel: number;
  readonly orderedEdges: readonly GraphEdge[];
};

function computeLayout(
  nodes: readonly GraphNode[],
  edges: readonly GraphEdge[],
): GraphLayout {
  if (nodes.length === 0) {
    return { nodes: [], maxLevel: 0, orderedEdges: [] };
  }
  const incoming = new Map<string, string[]>();
  const outgoing = new Map<string, string[]>();
  const known = new Set<string>();
  for (const node of nodes) {
    known.add(node.stableId);
    incoming.set(node.stableId, []);
    outgoing.set(node.stableId, []);
  }
  const orderedEdges: GraphEdge[] = [];
  for (const edge of edges) {
    if (!known.has(edge.fromStableId) || !known.has(edge.toStableId)) continue;
    outgoing.get(edge.fromStableId)?.push(edge.toStableId);
    incoming.get(edge.toStableId)?.push(edge.fromStableId);
    orderedEdges.push({
      fromStableId: edge.fromStableId,
      toStableId: edge.toStableId,
    });
  }

  const level = new Map<string, number>();
  const sortedNodes = [...nodes].sort((a, b) => a.orderIndex - b.orderIndex);
  for (const node of sortedNodes) {
    const predecessors = incoming.get(node.stableId) ?? [];
    let lvl = 0;
    for (const pred of predecessors) {
      const predLevel = level.get(pred);
      if (predLevel !== undefined && predLevel + 1 > lvl) {
        lvl = predLevel + 1;
      }
    }
    level.set(node.stableId, lvl);
  }

  const byLevel = new Map<number, string[]>();
  let maxLevel = 0;
  for (const node of sortedNodes) {
    const lvl = level.get(node.stableId) ?? 0;
    if (lvl > maxLevel) maxLevel = lvl;
    const bucket = byLevel.get(lvl) ?? [];
    bucket.push(node.stableId);
    byLevel.set(lvl, bucket);
  }
  const rowInLevel = new Map<string, number>();
  for (const bucket of byLevel.values()) {
    bucket.sort();
    bucket.forEach((stableId, idx) => rowInLevel.set(stableId, idx));
  }

  const layoutNodes: NodeLayout[] = sortedNodes.map((node) => ({
    stableId: node.stableId,
    title: node.title,
    orderIndex: node.orderIndex,
    level: level.get(node.stableId) ?? 0,
    rowInLevel: rowInLevel.get(node.stableId) ?? 0,
  }));

  return {
    nodes: layoutNodes,
    maxLevel,
    orderedEdges,
  };
}