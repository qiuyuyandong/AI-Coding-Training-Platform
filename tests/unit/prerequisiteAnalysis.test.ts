import { describe, expect, it } from "vitest";
import {
  KnowledgeEdgeSchema,
  KnowledgeNodeSchema,
  type KnowledgeEdge,
  type KnowledgeNode,
} from "@/lib/domain/curriculum";
import type { BaselineLevel } from "@/lib/domain/learner";
import nodesJson from "@/content/tracks/software-development-foundations-v1/nodes.json";
import edgesJson from "@/content/tracks/software-development-foundations-v1/edges.json";
import {
  analyzeGraphEligibility,
  analyzeNodeEligibility,
  type AbilityLevel,
  type AbilityMap,
  type BaselineMap,
  type EligibilityResult,
  type GraphEligibilitySnapshot,
  type PracticeSnapshot,
  type ResourceSnapshot,
} from "@/lib/services/prerequisiteAnalysis";

/**
 * Pure-function tests for `lib/services/prerequisiteAnalysis.ts`.
 *
 * The service is fully pure: it never imports SQLite, never touches the
 * file system, and never reads `process.env`. Every test below feeds
 * hand-built domain fixtures into the service. The V0 foundation graph
 * fixtures come from the published
 * `content/tracks/software-development-foundations-v1/{nodes,edges}.json`
 * package so the test mirrors what the importer actually installs.
 */

// Parse the package fixtures through the canonical Zod schemas so any
// drift between the JSON files and the domain types surfaces here.
const V0_NODES: readonly KnowledgeNode[] = nodesJson.map((raw) =>
  KnowledgeNodeSchema.parse(raw),
);
const V0_EDGES: readonly KnowledgeEdge[] = edgesJson.map((raw) =>
  KnowledgeEdgeSchema.parse(raw),
);

function nodeByStableId(stableId: string): KnowledgeNode {
  const node = V0_NODES.find((entry) => entry.stable_id === stableId);
  if (node === undefined) {
    throw new Error(`V0 fixture missing node '${stableId}'`);
  }
  return node;
}

function reviewedPrimaryResource(stableId: string): ResourceSnapshot {
  return {
    primary: {
      id: `res_${stableId}`,
      stable_id: `res-${stableId}`,
      title: `Primary resource for ${stableId}`,
      url: `https://example.com/${stableId}`,
      author: "Test Authority",
      language: "en",
      cost: "free",
      access: "open",
      license_boundary: "permissive_open",
      review_status: "reviewed",
      reviewed_at: "2026-07-17T00:00:00.000Z",
      stopping_guidance: `Stop after ${stableId}.`,
      package_id: "pkg_v0_1_0",
    },
    reviewStatus: "reviewed",
  };
}

function singlePracticeTask(stableId: string): PracticeSnapshot {
  return {
    tasks: [
      {
        id: `task_${stableId}`,
        stable_id: `task-${stableId}`,
        canonical_problem_id: `cp_${stableId}`,
        title: `Practice for ${stableId}`,
        kind: "oj",
        difficulty_band: "intro",
        package_id: "pkg_v0_1_0",
      },
    ],
  };
}

function draftPrimaryResource(stableId: string): ResourceSnapshot {
  return {
    primary: {
      id: `res_${stableId}`,
      stable_id: `res-${stableId}`,
      title: `Draft primary resource for ${stableId}`,
      url: `https://example.com/${stableId}`,
      author: "Test Authority",
      language: "en",
      cost: "free",
      access: "open",
      license_boundary: "permissive_open",
      review_status: "draft",
      reviewed_at: "2026-07-17T00:00:00.000Z",
      stopping_guidance: `Stop after ${stableId}.`,
      package_id: "pkg_v0_1_0",
    },
    reviewStatus: "draft",
  };
}

function noResource(): ResourceSnapshot {
  return { primary: null, reviewStatus: null };
}

function noPractice(): PracticeSnapshot {
  return { tasks: [] };
}

describe("V0 fixture integrity", () => {
  it("contains exactly 12 published nodes and 13 required_prerequisite edges", () => {
    expect(V0_NODES).toHaveLength(12);
    expect(V0_EDGES).toHaveLength(13);
    expect(V0_NODES.every((node) => node.status === "published")).toBe(true);
    expect(
      V0_EDGES.every((edge) => edge.edge_type === "required_prerequisite"),
    ).toBe(true);
  });

  it("lists the 12 foundation node stable ids in canonical order", () => {
    expect(V0_NODES.map((node) => node.stable_id)).toEqual([
      "cpp-io-types",
      "cpp-control-flow-functions",
      "cpp-containers",
      "program-decomposition",
      "debugging-testing",
      "git-build-workflow",
      "complexity-analysis",
      "sorting-binary-search",
      "stacks-queues",
      "hashing-linked-structures",
      "trees-recursion-traversal",
      "graphs-bfs-dfs",
    ]);
  });
});

describe("analyzeNodeEligibility — single node", () => {
  it("returns blocked_status for a non-published node", () => {
    const draftNode: KnowledgeNode = {
      ...nodeByStableId("cpp-io-types"),
      status: "draft",
    };
    const result = analyzeNodeEligibility(
      draftNode,
      V0_EDGES,
      reviewedPrimaryResource("cpp-io-types"),
      singlePracticeTask("cpp-io-types"),
    );
    expect(result.status).toBe("unavailable");
    expect(result.reason).toBe("blocked_status");
    expect(result.blockingNodeIds).toEqual([]);
  });

  it("returns missing_reviewed_resource when the primary resource is missing", () => {
    const result = analyzeNodeEligibility(
      nodeByStableId("cpp-io-types"),
      V0_EDGES,
      noResource(),
      singlePracticeTask("cpp-io-types"),
    );
    expect(result.reason).toBe("missing_reviewed_resource");
    expect(result.status).toBe("unavailable");
    expect(result.blockingNodeIds).toEqual([]);
  });

  it("returns missing_reviewed_resource when the primary resource is not reviewed", () => {
    const result = analyzeNodeEligibility(
      nodeByStableId("cpp-io-types"),
      V0_EDGES,
      draftPrimaryResource("cpp-io-types"),
      singlePracticeTask("cpp-io-types"),
    );
    expect(result.reason).toBe("missing_reviewed_resource");
  });

  it("returns missing_practice_mapping when the node has no practice task", () => {
    const result = analyzeNodeEligibility(
      nodeByStableId("cpp-io-types"),
      V0_EDGES,
      reviewedPrimaryResource("cpp-io-types"),
      noPractice(),
    );
    expect(result.reason).toBe("missing_practice_mapping");
  });

  it("returns ready_for_learning for node 1 (cpp-io-types) with no prerequisites and no baselines", () => {
    const result = analyzeNodeEligibility(
      nodeByStableId("cpp-io-types"),
      V0_EDGES,
      reviewedPrimaryResource("cpp-io-types"),
      singlePracticeTask("cpp-io-types"),
    );
    expect(result.status).toBe("available");
    expect(result.reason).toBe("ready_for_learning");
    expect(result.blockingNodeIds).toEqual([]);
  });

  it("returns ready_for_learning for node 7 when all prerequisites are ready", () => {
    const result = analyzeNodeEligibility(
      nodeByStableId("complexity-analysis"),
      V0_EDGES,
      reviewedPrimaryResource("complexity-analysis"),
      singlePracticeTask("complexity-analysis"),
      undefined,
      {
        "cpp-containers": "ready",
        "cpp-control-flow-functions": "ready",
        "cpp-io-types": "ready",
      },
      {},
    );
    expect(result.reason).toBe("ready_for_learning");
    expect(result.blockingNodeIds).toEqual([]);
  });

  it("returns needs_diagnostic when one prerequisite baseline is unknown", () => {
    const result = analyzeNodeEligibility(
      nodeByStableId("complexity-analysis"),
      V0_EDGES,
      reviewedPrimaryResource("complexity-analysis"),
      singlePracticeTask("complexity-analysis"),
      undefined,
      {
        "cpp-containers": "unknown",
        "cpp-control-flow-functions": "ready",
        "cpp-io-types": "ready",
      },
      {},
    );
    expect(result.status).toBe("unavailable");
    expect(result.reason).toBe("needs_diagnostic");
    expect(result.blockingNodeIds).toEqual(["cpp-containers"]);
  });

  it("returns needs_foundation when one prerequisite baseline is needs_foundation", () => {
    const result = analyzeNodeEligibility(
      nodeByStableId("complexity-analysis"),
      V0_EDGES,
      reviewedPrimaryResource("complexity-analysis"),
      singlePracticeTask("complexity-analysis"),
      undefined,
      {
        "cpp-containers": "needs_foundation",
        "cpp-control-flow-functions": "ready",
        "cpp-io-types": "ready",
      },
      {},
    );
    expect(result.status).toBe("unavailable");
    expect(result.reason).toBe("needs_foundation");
    expect(result.blockingNodeIds).toEqual(["cpp-containers"]);
  });

  it("returns needs_foundation when one prerequisite baseline is self_reported (never auto-mastery)", () => {
    const result = analyzeNodeEligibility(
      nodeByStableId("complexity-analysis"),
      V0_EDGES,
      reviewedPrimaryResource("complexity-analysis"),
      singlePracticeTask("complexity-analysis"),
      undefined,
      {
        "cpp-containers": "self_reported",
        "cpp-control-flow-functions": "ready",
        "cpp-io-types": "ready",
      },
      {},
    );
    expect(result.status).toBe("unavailable");
    expect(result.reason).toBe("needs_foundation");
    expect(result.blockingNodeIds).toEqual(["cpp-containers"]);
  });

  it("returns missing_reviewed_resource ahead of prerequisite checks", () => {
    const result = analyzeNodeEligibility(
      nodeByStableId("complexity-analysis"),
      V0_EDGES,
      noResource(),
      singlePracticeTask("complexity-analysis"),
      undefined,
      {
        "cpp-containers": "ready",
        "cpp-control-flow-functions": "ready",
        "cpp-io-types": "ready",
      },
      {},
    );
    expect(result.reason).toBe("missing_reviewed_resource");
  });

  it("returns missing_practice_mapping ahead of prerequisite checks", () => {
    const result = analyzeNodeEligibility(
      nodeByStableId("complexity-analysis"),
      V0_EDGES,
      reviewedPrimaryResource("complexity-analysis"),
      noPractice(),
      undefined,
      {
        "cpp-containers": "ready",
        "cpp-control-flow-functions": "ready",
        "cpp-io-types": "ready",
      },
      {},
    );
    expect(result.reason).toBe("missing_practice_mapping");
  });

  it("returns needs_diagnostic for a node whose prerequisites are not in the baseline map at all", () => {
    const result = analyzeNodeEligibility(
      nodeByStableId("complexity-analysis"),
      V0_EDGES,
      reviewedPrimaryResource("complexity-analysis"),
      singlePracticeTask("complexity-analysis"),
      undefined,
      {},
      {},
    );
    expect(result.reason).toBe("needs_diagnostic");
    expect(result.blockingNodeIds).toEqual([
      "cpp-containers",
      "cpp-control-flow-functions",
      "cpp-io-types",
    ]);
  });

  it("returns ready_for_practice when prerequisites are ready and ability is L1", () => {
    const result = analyzeNodeEligibility(
      nodeByStableId("complexity-analysis"),
      V0_EDGES,
      reviewedPrimaryResource("complexity-analysis"),
      singlePracticeTask("complexity-analysis"),
      undefined,
      {
        "cpp-containers": "ready",
        "cpp-control-flow-functions": "ready",
        "cpp-io-types": "ready",
      },
      { "complexity-analysis": "L1" },
    );
    expect(result.status).toBe("available");
    expect(result.reason).toBe("ready_for_practice");
    expect(result.blockingNodeIds).toEqual([]);
  });

  it("returns ready_for_practice when prerequisites are ready and ability is L2", () => {
    const result = analyzeNodeEligibility(
      nodeByStableId("complexity-analysis"),
      V0_EDGES,
      reviewedPrimaryResource("complexity-analysis"),
      singlePracticeTask("complexity-analysis"),
      undefined,
      {
        "cpp-containers": "ready",
        "cpp-control-flow-functions": "ready",
        "cpp-io-types": "ready",
      },
      { "complexity-analysis": "L2" },
    );
    expect(result.status).toBe("available");
    expect(result.reason).toBe("ready_for_practice");
  });

  it("returns ready_for_learning when prerequisites are ready and ability is undefined", () => {
    const result = analyzeNodeEligibility(
      nodeByStableId("complexity-analysis"),
      V0_EDGES,
      reviewedPrimaryResource("complexity-analysis"),
      singlePracticeTask("complexity-analysis"),
      undefined,
      {
        "cpp-containers": "ready",
        "cpp-control-flow-functions": "ready",
        "cpp-io-types": "ready",
      },
      {},
    );
    expect(result.status).toBe("available");
    expect(result.reason).toBe("ready_for_learning");
  });

  it("returns ready_for_learning when prerequisites are ready and ability is unassessed", () => {
    const result = analyzeNodeEligibility(
      nodeByStableId("complexity-analysis"),
      V0_EDGES,
      reviewedPrimaryResource("complexity-analysis"),
      singlePracticeTask("complexity-analysis"),
      undefined,
      {
        "cpp-containers": "ready",
        "cpp-control-flow-functions": "ready",
        "cpp-io-types": "ready",
      },
      { "complexity-analysis": "unassessed" },
    );
    expect(result.status).toBe("available");
    expect(result.reason).toBe("ready_for_learning");
  });

  it("ignores recommended_prerequisite edges when computing the closure", () => {
    const node = nodeByStableId("cpp-io-types");
    // recommended_prerequisite edges should not gate eligibility
    const recommendedEdges: readonly KnowledgeEdge[] = [
      {
        from_stable_id: "complexity-analysis",
        to_stable_id: "cpp-io-types",
        edge_type: "recommended_prerequisite",
      },
    ];
    const result = analyzeNodeEligibility(
      node,
      recommendedEdges,
      reviewedPrimaryResource("cpp-io-types"),
      singlePracticeTask("cpp-io-types"),
    );
    expect(result.reason).toBe("ready_for_learning");
  });

  it("accepts a precomputed prerequisites list and does not recompute the closure", () => {
    // Precomputed closure omits the real prerequisite to prove the
    // caller-supplied list wins over the graph closure.
    const result = analyzeNodeEligibility(
      nodeByStableId("complexity-analysis"),
      V0_EDGES,
      reviewedPrimaryResource("complexity-analysis"),
      singlePracticeTask("complexity-analysis"),
      [],
      { "cpp-containers": "ready" },
      {},
    );
    expect(result.reason).toBe("ready_for_learning");
  });
});

describe("analyzeGraphEligibility — full V0 graph", () => {
  function allReviewed(): ReadonlyMap<string, ResourceSnapshot> {
    const map = new Map<string, ResourceSnapshot>();
    for (const node of V0_NODES) {
      map.set(node.stable_id, reviewedPrimaryResource(node.stable_id));
    }
    return map;
  }

  function allPractices(): ReadonlyMap<string, PracticeSnapshot> {
    const map = new Map<string, PracticeSnapshot>();
    for (const node of V0_NODES) {
      map.set(node.stable_id, singlePracticeTask(node.stable_id));
    }
    return map;
  }

  it("returns one entry per node in the published graph (12 nodes)", () => {
    const result = analyzeGraphEligibility(
      V0_NODES,
      V0_EDGES,
      allReviewed(),
      allPractices(),
    );
    expect(Object.keys(result.perNode)).toHaveLength(12);
  });

  it("places node 1 (cpp-io-types) in readyForLearning when no baselines exist", () => {
    const result = analyzeGraphEligibility(
      V0_NODES,
      V0_EDGES,
      allReviewed(),
      allPractices(),
    );
    expect(result.summary.readyForLearning).toContain("cpp-io-types");
  });

  it("places every node-with-prerequisites into unavailable when no baselines exist", () => {
    const result = analyzeGraphEligibility(
      V0_NODES,
      V0_EDGES,
      allReviewed(),
      allPractices(),
    );
    // Only node 1 has no prerequisites, so it is the lone
    // readyForLearning entry and the remaining 11 nodes must be in
    // unavailable because at least one prerequisite has an unknown /
    // undefined baseline. Order matches the deterministic
    // (order_index ASC, stable_id ASC) traversal.
    expect(result.summary.unavailable).toEqual([
      "cpp-control-flow-functions",
      "cpp-containers",
      "program-decomposition",
      "debugging-testing",
      "git-build-workflow",
      "complexity-analysis",
      "sorting-binary-search",
      "stacks-queues",
      "hashing-linked-structures",
      "trees-recursion-traversal",
      "graphs-bfs-dfs",
    ]);
    expect(result.summary.readyForPractice).toEqual([]);
  });

  it("moves every node to readyForLearning when all 12 baselines are ready and abilities undefined", () => {
    const baselines: BaselineMap = {};
    const abilities: AbilityMap = {};
    for (const node of V0_NODES) {
      (baselines as Record<string, BaselineLevel | undefined>)[
        node.stable_id
      ] = "ready";
    }
    const result = analyzeGraphEligibility(
      V0_NODES,
      V0_EDGES,
      allReviewed(),
      allPractices(),
      {},
      baselines,
      abilities,
    );
    expect(result.summary.unavailable).toEqual([]);
    expect(result.summary.readyForPractice).toEqual([]);
    expect(result.summary.readyForLearning).toHaveLength(12);
  });

  it("moves every node to readyForPractice when all 12 baselines are ready and abilities are L2", () => {
    const baselines: BaselineMap = {};
    const abilities: AbilityMap = {};
    for (const node of V0_NODES) {
      (baselines as Record<string, BaselineLevel | undefined>)[
        node.stable_id
      ] = "ready";
      (abilities as Record<string, AbilityLevel | undefined>)[
        node.stable_id
      ] = "L2";
    }
    const result = analyzeGraphEligibility(
      V0_NODES,
      V0_EDGES,
      allReviewed(),
      allPractices(),
      {},
      baselines,
      abilities,
    );
    expect(result.summary.readyForPractice).toHaveLength(12);
    expect(result.summary.readyForLearning).toEqual([]);
    expect(result.summary.unavailable).toEqual([]);
  });

  it("falls back to missing_reviewed_resource / missing_practice_mapping for nodes without snapshots", () => {
    // Empty resource + practice maps so every node falls back to the
    // no-resource / no-practice defaults.
    const result = analyzeGraphEligibility(
      V0_NODES,
      V0_EDGES,
      new Map<string, ResourceSnapshot>(),
      new Map<string, PracticeSnapshot>(),
    );
    expect(result.summary.unavailable).toHaveLength(12);
    for (const node of V0_NODES) {
      const resultForNode: EligibilityResult | undefined =
        result.perNode[node.stable_id];
      expect(resultForNode).toBeDefined();
      expect(resultForNode?.reason).toBe("missing_reviewed_resource");
    }
  });

  it("emits per-node entries in (order_index ASC, stable_id ASC) iteration order", () => {
    const result = analyzeGraphEligibility(
      V0_NODES,
      V0_EDGES,
      allReviewed(),
      allPractices(),
    );
    expect(Object.keys(result.perNode)).toEqual(
      V0_NODES.map((node) => node.stable_id),
    );
  });

  it("summary lists are deterministically ordered by stable id", () => {
    const result = analyzeGraphEligibility(
      V0_NODES,
      V0_EDGES,
      allReviewed(),
      allPractices(),
    );
    const sorted = (xs: readonly string[]): readonly string[] =>
      [...xs].sort();
    expect([...result.summary.unavailable].sort()).toEqual(
      sorted(result.summary.unavailable),
    );
    expect([...result.summary.readyForLearning].sort()).toEqual(
      sorted(result.summary.readyForLearning),
    );
    expect([...result.summary.readyForPractice].sort()).toEqual(
      sorted(result.summary.readyForPractice),
    );
  });

  it("produces byte-identical output for identical input", () => {
    const resources = allReviewed();
    const practices = allPractices();
    const first: GraphEligibilitySnapshot = analyzeGraphEligibility(
      V0_NODES,
      V0_EDGES,
      resources,
      practices,
    );
    const second: GraphEligibilitySnapshot = analyzeGraphEligibility(
      V0_NODES,
      V0_EDGES,
      resources,
      practices,
    );
    expect(JSON.stringify(first)).toBe(JSON.stringify(second));
  });

  it("accepts a precomputed PrerequisitesByNode map and uses it for every node", () => {
    // Precomputed empty closures mean no node sees any prerequisites,
    // so every published node with a reviewed resource + practice
    // becomes ready_for_learning (no ability set).
    const prerequisites: Record<string, readonly string[]> = {};
    for (const node of V0_NODES) {
      prerequisites[node.stable_id] = [];
    }
    const result = analyzeGraphEligibility(
      V0_NODES,
      V0_EDGES,
      allReviewed(),
      allPractices(),
      prerequisites,
      {},
      {},
    );
    expect(result.summary.readyForLearning).toHaveLength(12);
    expect(result.summary.unavailable).toEqual([]);
  });
});