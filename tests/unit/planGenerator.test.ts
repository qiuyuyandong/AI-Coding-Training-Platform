import { describe, expect, it } from "vitest";
import type { DailyMode } from "@/lib/domain/plan";
import {
  generatePlan,
  PLAN_GENERATOR_VERSION,
  type PlanGeneratorInput,
} from "@/lib/services/planGenerator";
import type { CandidateTaskSelectorInput } from "@/lib/services/candidateTaskSelector";

/**
 * V0 plan-generator tests.
 *
 * Todo 12 of the 2026-07-17-v0-manual-learning-loop-vertical-slice plan
 * locks the pure-generator contract: a normally-eligible graph produces
 * a primary + alternatives without fallback; an empty graph falls back
 * to the published `cpp-io-types` / `task-cpp-io-types` pairing; the
 * generator is deterministic for byte-equivalent inputs.
 */

function makeEligibleFixture(): CandidateTaskSelectorInput {
  const nodes = [
    { stable_id: "sample-node-a", order_index: 1, title: "Sample Node A" },
  ];
  const practicesByNode = new Map<
    string,
    ReadonlyArray<{
      stable_id: string;
      title: string;
      difficulty_band: "intro";
    }>
  >([
    [
      "sample-node-a",
      [
        {
          stable_id: "sample-task-a",
          title: "Practice Task A",
          difficulty_band: "intro",
        },
      ],
    ],
  ]);
  const resourcesByNode = new Map<string, { review_status: string }>([
    ["sample-node-a", { review_status: "reviewed" }],
  ]);
  return {
    nodes,
    edges: [],
    practicesByNode,
    resourcesByNode,
    effortBoundaryMinutes: 30,
  };
}

function makeInput(
  selector: CandidateTaskSelectorInput,
  dailyMode: DailyMode = "learn",
): PlanGeneratorInput {
  return {
    ...selector,
    learnerId: "local-default-learner",
    dailyMode,
    localDate: "2026-07-17",
    inputFingerprint: "fp-test-1",
  };
}

describe("planGenerator", () => {
  it("exports the frozen version constant", () => {
    expect(PLAN_GENERATOR_VERSION).toBe("v0-plan-generator-1");
  });

  it("returns primary + alternatives for an eligible graph", () => {
    const input = makeInput(makeEligibleFixture());
    const out = generatePlan(input);
    expect(out.isFallback).toBe(false);
    expect(out.primary.taskId).toBe("sample-task-a");
    expect(out.primary.nodeId).toBe("sample-node-a");
    expect(out.alternatives).toEqual({});
  });

  it("returns the safe foundation fallback when the selector has no candidate", () => {
    const empty: CandidateTaskSelectorInput = {
      nodes: [],
      edges: [],
      practicesByNode: new Map(),
      resourcesByNode: new Map(),
      effortBoundaryMinutes: 30,
    };
    const input = makeInput(empty);
    const out = generatePlan(input);
    expect(out.isFallback).toBe(true);
    expect(out.primary.taskId).toBe("task-cpp-io-types");
    expect(out.primary.nodeId).toBe("cpp-io-types");
    expect(out.primary.difficultyBand).toBe("intro");
    expect(out.alternatives).toEqual({});
    expect(out.reason).toMatch(/safe foundation fallback/);
  });

  it("propagates the supplied daily mode unchanged", () => {
    const input = makeInput(makeEligibleFixture(), "practice");
    const out = generatePlan(input);
    expect(out.mode).toBe("practice");

    const fallbackInput = makeInput(
      {
        nodes: [],
        edges: [],
        practicesByNode: new Map(),
        resourcesByNode: new Map(),
        effortBoundaryMinutes: 30,
      },
      "recover",
    );
    const fallbackOut = generatePlan(fallbackInput);
    expect(fallbackOut.mode).toBe("recover");
    expect(fallbackOut.isFallback).toBe(true);
  });

  it("is deterministic for identical inputs", () => {
    const input = makeInput(makeEligibleFixture());
    const a = generatePlan(input);
    const b = generatePlan(input);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));

    const emptyInput = makeInput({
      nodes: [],
      edges: [],
      practicesByNode: new Map(),
      resourcesByNode: new Map(),
      effortBoundaryMinutes: 30,
    });
    const fa = generatePlan(emptyInput);
    const fb = generatePlan(emptyInput);
    expect(JSON.stringify(fa)).toBe(JSON.stringify(fb));
  });
});
