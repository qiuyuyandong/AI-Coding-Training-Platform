import { describe, expect, it } from "vitest";
import { selectCandidateTask, SELECTOR_VERSION } from "@/lib/services/candidateTaskSelector";

function makeFixture(overrides: {
  effortBoundaryMinutes?: 15 | 30 | 60 | 90;
  recentlySkipped?: string[];
  recentCompletions?: { practiceTaskId: string; completedAt?: string }[];
  goalPrimaryNodeId?: string;
  goalInterestNodeIds?: string[];
  abilitiesByNode?: Record<string, "unassessed" | "L1" | "L2" | "L3" | "L4" | "L5" | undefined>;
} = {}) {
  const nodes = Array.from({ length: 12 }, (_, i) => ({
    stable_id: `node-${i + 1}`,
    order_index: i + 1,
    title: `Node ${i + 1}`,
  }));
  const edges = Array.from({ length: 11 }, (_, i) => ({
    from_stable_id: `node-${i + 1}`,
    to_stable_id: `node-${i + 2}`,
  }));
  const practicesByNode = new Map(
    nodes.map(n => [
      n.stable_id,
      [{ stable_id: `task-${n.stable_id}`, title: `Task ${n.order_index}`, difficulty_band: "intro" as "intro" | "easy" | "medium" | "hard" }],
    ]),
  );
  const resourcesByNode = new Map(nodes.map(n => [n.stable_id, { review_status: "reviewed" }]));
  const prerequisitesByNode: Record<string, string[]> = {};
  for (const n of nodes) {
    const idx = parseInt(n.stable_id.split("-")[1]!, 10);
    prerequisitesByNode[n.stable_id] = nodes
      .filter(p => parseInt(p.stable_id.split("-")[1]!, 10) < idx)
      .map(p => p.stable_id);
  }
  return {
    nodes,
    edges,
    practicesByNode,
    resourcesByNode,
    prerequisitesByNode,
    abilitiesByNode: overrides.abilitiesByNode,
    recentlySkipped: overrides.recentlySkipped,
    recentCompletions: overrides.recentCompletions,
    goalPrimaryNodeId: overrides.goalPrimaryNodeId,
    goalInterestNodeIds: overrides.goalInterestNodeIds,
    effortBoundaryMinutes: overrides.effortBoundaryMinutes ?? 30,
  };
}

describe("candidateTaskSelector", () => {
  it("exports version", () => {
    expect(SELECTOR_VERSION).toBe("v0-selector-1");
  });

  it("returns primary + alternatives for a fully eligible graph", () => {
    const result = selectCandidateTask(makeFixture());
    expect(result.noCandidate).toBe(false);
    if (result.noCandidate) return;
    expect(result.primary).toBeTruthy();
    expect(result.primary.taskId).toBe("task-node-1");
    const allTaskIds = [result.primary.taskId];
    if (result.alternatives.warmup) allTaskIds.push(result.alternatives.warmup.taskId);
    if (result.alternatives.same_goal_alternative) allTaskIds.push(result.alternatives.same_goal_alternative.taskId);
    if (result.alternatives.weakness_review) allTaskIds.push(result.alternatives.weakness_review.taskId);
    expect(new Set(allTaskIds).size).toBe(allTaskIds.length);
  });

  it("returns noCandidate when graph has no eligible nodes", () => {
    const nodes = [{ stable_id: "x", order_index: 1, title: "X" }];
    const edges: { from_stable_id: string; to_stable_id: string }[] = [];
    const practicesByNode = new Map<string, { stable_id: string; title: string; difficulty_band: "intro" }[]>();
    const resourcesByNode = new Map<string, { review_status: string } | null>();
    const result = selectCandidateTask({
      nodes, edges, practicesByNode, resourcesByNode, effortBoundaryMinutes: 30,
    });
    expect(result.noCandidate).toBe(true);
  });

  it("produces deterministic output", () => {
    const fixture = makeFixture();
    const r1 = selectCandidateTask(fixture);
    const r2 = selectCandidateTask(fixture);
    expect(JSON.stringify(r1)).toBe(JSON.stringify(r2));
  });

  it("effort boundary 15 prefers intro difficulty", () => {
    const nodes = [
      { stable_id: "a", order_index: 1, title: "A" },
      { stable_id: "b", order_index: 2, title: "B" },
    ];
    const edges: { from_stable_id: string; to_stable_id: string }[] = [];
    const practicesByNode = new Map([
      ["a", [{ stable_id: "task-a", title: "T-A", difficulty_band: "hard" as "intro" | "easy" | "medium" | "hard" }]],
      ["b", [{ stable_id: "task-b", title: "T-B", difficulty_band: "intro" as "intro" | "easy" | "medium" | "hard" }]],
    ]);
    const resourcesByNode = new Map([["a", { review_status: "reviewed" }], ["b", { review_status: "reviewed" }]]);
    const result = selectCandidateTask({ nodes, edges, practicesByNode, resourcesByNode, effortBoundaryMinutes: 15 });
    expect(result.noCandidate).toBe(false);
    if (result.noCandidate) return;
    expect(result.primary.difficultyBand).toBe("intro");
  });

  it("effort boundary 90 prefers hard difficulty", () => {
    const nodes = [
      { stable_id: "a", order_index: 1, title: "A" },
      { stable_id: "b", order_index: 2, title: "B" },
    ];
    const edges: { from_stable_id: string; to_stable_id: string }[] = [];
    const practicesByNode = new Map([
      ["a", [{ stable_id: "task-a", title: "T-A", difficulty_band: "intro" as "intro" | "easy" | "medium" | "hard" }]],
      ["b", [{ stable_id: "task-b", title: "T-B", difficulty_band: "hard" as "intro" | "easy" | "medium" | "hard" }]],
    ]);
    const resourcesByNode = new Map([["a", { review_status: "reviewed" }], ["b", { review_status: "reviewed" }]]);
    const result = selectCandidateTask({ nodes, edges, practicesByNode, resourcesByNode, effortBoundaryMinutes: 90 });
    expect(result.noCandidate).toBe(false);
    if (result.noCandidate) return;
    expect(result.primary.difficultyBand).toBe("hard");
  });

  it("excludes recently skipped tasks from primary and alternatives", () => {
    const fixture = makeFixture({ recentlySkipped: ["task-node-1"] });
    const result = selectCandidateTask(fixture);
    expect(result.noCandidate).toBe(false);
    if (result.noCandidate) return;
    expect(result.primary.taskId).not.toBe("task-node-1");
    const all = [result.primary.taskId];
    if (result.alternatives.warmup) all.push(result.alternatives.warmup.taskId);
    if (result.alternatives.same_goal_alternative) all.push(result.alternatives.same_goal_alternative.taskId);
    if (result.alternatives.weakness_review) all.push(result.alternatives.weakness_review.taskId);
    expect(all).not.toContain("task-node-1");
  });

  it("excludes same-variant when other candidates exist", () => {
    const fixture = makeFixture({ recentCompletions: [{ practiceTaskId: "task-node-1" }] });
    const result = selectCandidateTask(fixture);
    expect(result.noCandidate).toBe(false);
    if (result.noCandidate) return;
    expect(result.primary.taskId).not.toBe("task-node-1");
  });

  it("ranks primary goal path tasks before non-primary", () => {
    const fixture = makeFixture({ goalPrimaryNodeId: "node-1" });
    const result = selectCandidateTask(fixture);
    expect(result.noCandidate).toBe(false);
    if (result.noCandidate) return;
    expect(result.primary.nodeId).toBe("node-1");
  });
});