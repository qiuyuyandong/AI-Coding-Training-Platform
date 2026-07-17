import { describe, expect, it } from "vitest";
import Database from "better-sqlite3";
import { applyMigrations } from "@/lib/db/migrations";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  CurriculumCycleError,
  evaluateNodeEligibility,
  orderPublishedNodes,
  prerequisiteClosure,
  successors,
  type KnowledgeEdge,
  type KnowledgeNode,
} from "@/lib/services/curriculumGraph";

/**
 * Pure-function tests for `lib/services/curriculumGraph.ts`.
 *
 * The helpers themselves never touch SQLite, so this file uses hand-built
 * domain fixtures. One small integration test at the bottom asserts that
 * `loadGraphFromRepository` returns a coherent snapshot when fed an
 * in-memory migrated database; everything above is pure and DB-free.
 */

function makeNode(
  stableId: string,
  status: KnowledgeNode["status"],
  orderIndex: number,
): KnowledgeNode {
  return {
    stable_id: stableId,
    title: `Title for ${stableId}`,
    outcome: `Outcome for ${stableId}`,
    rationale: `Rationale for ${stableId}`,
    order_index: orderIndex,
    status,
    provenance: {
      authority: "Test Authority",
      url: `https://example.com/${stableId}`,
      retrieved_at: "2026-07-17T00:00:00.000Z",
    },
    stopping_guidance: `Stop when ${stableId} is mastered.`,
  };
}

function makeEdge(
  from: string,
  to: string,
  type: KnowledgeEdge["edge_type"] = "required_prerequisite",
): KnowledgeEdge {
  return {
    from_stable_id: from,
    to_stable_id: to,
    edge_type: type,
  };
}

describe("orderPublishedNodes", () => {
  it("returns nodes in topological order for a valid DAG", () => {
    const nodes: KnowledgeNode[] = [
      makeNode("alpha", "published", 1),
      makeNode("beta", "published", 2),
      makeNode("gamma", "published", 3),
      makeNode("delta", "published", 4),
    ];
    const edges: KnowledgeEdge[] = [
      makeEdge("alpha", "beta"),
      makeEdge("alpha", "gamma"),
      makeEdge("beta", "delta"),
      makeEdge("gamma", "delta"),
    ];

    const ordered = orderPublishedNodes(nodes, edges);
    expect(ordered.map((node) => node.stable_id)).toEqual([
      "alpha",
      "beta",
      "gamma",
      "delta",
    ]);
  });

  it("ignores recommended_prerequisite edges when ordering", () => {
    const nodes: KnowledgeNode[] = [
      makeNode("alpha", "published", 1),
      makeNode("beta", "published", 2),
      makeNode("gamma", "published", 3),
    ];
    const edges: KnowledgeEdge[] = [makeEdge("beta", "alpha", "recommended_prerequisite")];

    const ordered = orderPublishedNodes(nodes, edges);
    expect(ordered.map((node) => node.stable_id)).toEqual([
      "alpha",
      "beta",
      "gamma",
    ]);
  });

  it("throws CurriculumCycleError when the graph contains a cycle", () => {
    const nodes: KnowledgeNode[] = [
      makeNode("alpha", "published", 1),
      makeNode("beta", "published", 2),
      makeNode("gamma", "published", 3),
    ];
    const edges: KnowledgeEdge[] = [
      makeEdge("alpha", "beta"),
      makeEdge("beta", "gamma"),
      makeEdge("gamma", "alpha"),
    ];

    expect(() => orderPublishedNodes(nodes, edges)).toThrow(CurriculumCycleError);
  });

  it("breaks ties on stable_id when order_index is equal", () => {
    const nodes: KnowledgeNode[] = [
      makeNode("zeta", "published", 1),
      makeNode("alpha", "published", 1),
      makeNode("mike", "published", 1),
    ];
    const ordered = orderPublishedNodes(nodes, []);
    expect(ordered.map((node) => node.stable_id)).toEqual([
      "alpha",
      "mike",
      "zeta",
    ]);
  });

  it("produces byte-identical output for the same input", () => {
    const nodes: KnowledgeNode[] = [
      makeNode("alpha", "published", 1),
      makeNode("beta", "published", 2),
      makeNode("gamma", "published", 3),
    ];
    const edges: KnowledgeEdge[] = [makeEdge("alpha", "beta"), makeEdge("beta", "gamma")];

    const first = orderPublishedNodes(nodes, edges);
    const second = orderPublishedNodes(nodes, edges);
    expect(JSON.stringify(first)).toBe(JSON.stringify(second));
  });
});

describe("prerequisiteClosure", () => {
  it("returns transitive predecessors, excluding the node itself", () => {
    const edges: KnowledgeEdge[] = [
      makeEdge("a", "b"),
      makeEdge("b", "c"),
      makeEdge("c", "d"),
    ];

    expect(prerequisiteClosure("d", edges)).toEqual(["a", "b", "c"]);
    expect(prerequisiteClosure("c", edges)).toEqual(["a", "b"]);
    expect(prerequisiteClosure("b", edges)).toEqual(["a"]);
  });

  it("returns an empty array for a leaf node with no prerequisites", () => {
    expect(prerequisiteClosure("a", [])).toEqual([]);
  });

  it("ignores recommended_prerequisite edges", () => {
    const edges: KnowledgeEdge[] = [
      makeEdge("a", "b", "recommended_prerequisite"),
      makeEdge("a", "b"),
    ];
    expect(prerequisiteClosure("b", edges)).toEqual(["a"]);
  });

  it("collapses a diamond into the unique predecessor set", () => {
    const edges: KnowledgeEdge[] = [
      makeEdge("a", "b"),
      makeEdge("a", "c"),
      makeEdge("b", "d"),
      makeEdge("c", "d"),
    ];
    expect(prerequisiteClosure("d", edges)).toEqual(["a", "b", "c"]);
  });

  it("handles a multi-parent scenario without duplication", () => {
    const edges: KnowledgeEdge[] = [
      makeEdge("a", "c"),
      makeEdge("b", "c"),
      makeEdge("c", "d"),
    ];
    expect(prerequisiteClosure("d", edges)).toEqual(["a", "b", "c"]);
  });
});

describe("successors", () => {
  it("returns direct and transitive successors, excluding the node itself", () => {
    const edges: KnowledgeEdge[] = [
      makeEdge("a", "b"),
      makeEdge("b", "c"),
      makeEdge("c", "d"),
    ];

    expect(successors("a", edges)).toEqual(["b", "c", "d"]);
    expect(successors("b", edges)).toEqual(["c", "d"]);
    expect(successors("d", edges)).toEqual([]);
  });

  it("ignores recommended_prerequisite edges", () => {
    const edges: KnowledgeEdge[] = [
      makeEdge("a", "b", "recommended_prerequisite"),
    ];
    expect(successors("a", edges)).toEqual([]);
  });

  it("returns each successor exactly once in a diamond graph", () => {
    const edges: KnowledgeEdge[] = [
      makeEdge("a", "b"),
      makeEdge("a", "c"),
      makeEdge("b", "d"),
      makeEdge("c", "d"),
    ];
    expect(successors("a", edges)).toEqual(["b", "c", "d"]);
  });
});

describe("evaluateNodeEligibility", () => {
  function makePublishedNode(stableId: string): KnowledgeNode {
    return makeNode(stableId, "published", 1);
  }

  function reviewedPrimaryResource(stableId: string) {
    return {
      primary: {
        id: `res_${stableId}`,
        stable_id: `res-${stableId}`,
        title: "Primary",
        url: `https://example.com/${stableId}`,
        author: "Author",
        language: "en" as const,
        cost: "free" as const,
        access: "open" as const,
        license_boundary: "permissive_open" as const,
        review_status: "reviewed" as const,
        reviewed_at: "2026-07-17T00:00:00.000Z",
        stopping_guidance: "Stop after reading.",
        package_id: "pkg_x",
      },
      reviewStatus: "reviewed",
    };
  }

  function draftPrimaryResource(stableId: string) {
    return {
      primary: {
        id: `res_${stableId}`,
        stable_id: `res-${stableId}`,
        title: "Primary",
        url: `https://example.com/${stableId}`,
        author: "Author",
        language: "en" as const,
        cost: "free" as const,
        access: "open" as const,
        license_boundary: "permissive_open" as const,
        review_status: "draft" as const,
        reviewed_at: "2026-07-17T00:00:00.000Z",
        stopping_guidance: "Stop after reading.",
        package_id: "pkg_x",
      },
      reviewStatus: "draft",
    };
  }

  function singlePracticeTask(stableId: string) {
    return {
      tasks: [
        {
          id: `task_${stableId}`,
          stable_id: `task-${stableId}`,
          canonical_problem_id: `cp_${stableId}`,
          title: "Task",
          kind: "oj" as const,
          difficulty_band: "intro" as const,
          package_id: "pkg_x",
        },
      ],
    };
  }

  it("returns 'available' when the node has a reviewed primary resource and a practice task", () => {
    const node = makePublishedNode("alpha");
    const result = evaluateNodeEligibility(
      node,
      reviewedPrimaryResource("alpha"),
      singlePracticeTask("alpha"),
    );
    expect(result).toEqual({
      status: "available",
      reasonCode: "available",
    });
  });

  it("returns 'planned' for a planned node", () => {
    const node = makeNode("alpha", "planned", 1);
    const result = evaluateNodeEligibility(
      node,
      { primary: null, reviewStatus: null },
      { tasks: [] },
    );
    expect(result.status).toBe("unavailable");
    expect(result.reasonCode).toBe("planned");
    if (result.status === "unavailable") {
      expect(result.message).toContain("planned");
    }
  });

  it("returns 'draft' for a draft node", () => {
    const node = makeNode("alpha", "draft", 1);
    const result = evaluateNodeEligibility(
      node,
      { primary: null, reviewStatus: null },
      { tasks: [] },
    );
    expect(result.reasonCode).toBe("draft");
    expect(result.status).toBe("unavailable");
  });

  it("returns 'deprecated' for a deprecated node", () => {
    const node = makeNode("alpha", "deprecated", 1);
    const result = evaluateNodeEligibility(
      node,
      { primary: null, reviewStatus: null },
      { tasks: [] },
    );
    expect(result.reasonCode).toBe("deprecated");
    expect(result.status).toBe("unavailable");
  });

  it("returns 'missing_reviewed_resource' when the resource is missing entirely", () => {
    const node = makePublishedNode("alpha");
    const result = evaluateNodeEligibility(
      node,
      { primary: null, reviewStatus: null },
      { tasks: [] },
    );
    expect(result.reasonCode).toBe("missing_reviewed_resource");
    expect(result.status).toBe("unavailable");
  });

  it("returns 'missing_reviewed_resource' when the resource exists but is not 'reviewed'", () => {
    const node = makePublishedNode("alpha");
    const result = evaluateNodeEligibility(
      node,
      draftPrimaryResource("alpha"),
      { tasks: [] },
    );
    expect(result.reasonCode).toBe("missing_reviewed_resource");
    expect(result.status).toBe("unavailable");
  });

  it("returns 'missing_practice_mapping' when there is a reviewed resource but no practice task", () => {
    const node = makePublishedNode("alpha");
    const result = evaluateNodeEligibility(
      node,
      reviewedPrimaryResource("alpha"),
      { tasks: [] },
    );
    expect(result.reasonCode).toBe("missing_practice_mapping");
    expect(result.status).toBe("unavailable");
  });

  it("accepts prerequisites and baselines parameters without changing the result", () => {
    const node = makePublishedNode("alpha");
    const result = evaluateNodeEligibility(
      node,
      reviewedPrimaryResource("alpha"),
      singlePracticeTask("alpha"),
      { stableIds: ["some-prereq"] },
      { baseline: "ready", confidence: "low" },
    );
    expect(result.status).toBe("available");
    expect(result.reasonCode).toBe("available");
  });
});

describe("loadGraphFromRepository (integration)", () => {
  it("returns a coherent snapshot for a published node with all the required links", async () => {
    const tmpDir = mkdtempSync(join(tmpdir(), "curriculum-graph-test-"));
    const db = new Database(join(tmpDir, "test.sqlite"));
    try {
      applyMigrations(db);

      db.prepare(
        `INSERT INTO curriculum_packages (
           id, track_slug, semantic_version, checksum, source_revision, installed_at
         ) VALUES (?, ?, ?, ?, ?, ?)`,
      ).run(
        "pkg_test_1_0_0",
        "test-package",
        "1.0.0",
        "x".repeat(64),
        "rev-1",
        "2026-07-17T00:00:00.000Z",
      );

      const insertNode = db.prepare(
        `INSERT INTO knowledge_nodes (
           id, stable_id, title, outcome, rationale, order_index, status, provenance_json, package_id
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      );
      insertNode.run(
        "node_alpha",
        "alpha",
        "Alpha",
        "First",
        "Because.",
        1,
        "published",
        JSON.stringify({
          authority: "Test",
          url: "https://example.com/alpha",
          retrieved_at: "2026-07-17T00:00:00.000Z",
        }),
        "pkg_test_1_0_0",
      );
      insertNode.run(
        "node_beta",
        "beta",
        "Beta",
        "Second",
        "Because beta.",
        2,
        "published",
        JSON.stringify({
          authority: "Test",
          url: "https://example.com/beta",
          retrieved_at: "2026-07-17T00:00:00.000Z",
        }),
        "pkg_test_1_0_0",
      );

      db.prepare(
        `INSERT INTO knowledge_edges (id, from_node_id, to_node_id, edge_type)
         VALUES (?, ?, ?, ?)`,
      ).run(
        "edge_alpha_beta",
        "node_alpha",
        "node_beta",
        "required_prerequisite",
      );

      db.prepare(
        `INSERT INTO learning_resources (
           id, stable_id, title, url, author, language, cost, access,
           license_boundary, review_status, reviewed_at, stopping_guidance,
           package_id
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        "res_alpha",
        "res-alpha",
        "Alpha resource",
        "https://example.com/alpha-resource",
        "Test",
        "en",
        "free",
        "open",
        "permissive_open",
        "reviewed",
        "2026-07-17T00:00:00.000Z",
        "Stop after reading.",
        "pkg_test_1_0_0",
      );

      db.prepare(
        `INSERT INTO node_resources (node_id, resource_id, role, sort_order)
         VALUES (?, ?, ?, ?)`,
      ).run("node_alpha", "res_alpha", "primary", 0);

      const { loadGraphFromRepository } = await import("@/lib/services/curriculumGraph");
      const snapshot = await loadGraphFromRepository(db, "pkg_test_1_0_0");

      expect(snapshot.nodes.map((node) => node.stable_id).sort()).toEqual([
        "alpha",
        "beta",
      ]);
      expect(
        snapshot.edges.map((edge) => `${edge.from_stable_id}->${edge.to_stable_id}`),
      ).toEqual(["alpha->beta"]);
      const alphaResources = snapshot.resourcesByNode.get("alpha");
      expect(alphaResources?.reviewStatus).toBe("reviewed");
      const betaPrereqs = snapshot.prerequisitesByNode.get("beta");
      expect(betaPrereqs?.stableIds).toEqual(["alpha"]);
    } finally {
      db.close();
      try {
        rmSync(tmpDir, { recursive: true, force: true });
      } catch {
        /* ignore */
      }
    }
  });
});