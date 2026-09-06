import { describe, expect, it } from "vitest";
import { projectEvidenceAbility, type EvidenceAbilityFact } from "@/lib/services/evidenceAbilityProjector";

const BASE: EvidenceAbilityFact = {
  summaryId: "summary-1",
  sourceType: "attempt",
  sourceId: "attempt-1",
  taskIdentity: "problem-1",
  outcome: "independent_effective_completion",
  coverageLevel: "E3",
  confidence: "high",
  role: "primary",
  createdAt: "2026-09-01T00:00:00.000Z",
  unfamiliarTransfer: false,
  evidenceEventIds: ["event-1"],
};

function project(previousLevel: "unassessed" | "L1" | "L2" | "L3" | "L4" | "L5", facts: readonly EvidenceAbilityFact[], now = "2026-09-08T00:00:00.000Z") {
  return projectEvidenceAbility({ learnerId: "learner", nodeId: "node", previousLevel, facts, now });
}

describe("evidence ability projector", () => {
  it("does not promote E1 insufficient evidence or self-report", () => {
    expect(project("L2", [{ ...BASE, outcome: "insufficient_evidence", coverageLevel: "E1" }]).visibleLevel).toBe("L2");
  });

  it("advances one level toward independent application", () => {
    const result = project("L2", [BASE]);
    expect(result.visibleLevel).toBe("L3");
    expect(result.reasonCodes).toContain("independent_application_with_sequence_or_code");
  });

  it("discounts short same-task repeats but accepts delayed or different-task stability", () => {
    const sameTask = { ...BASE, summaryId: "summary-2", sourceId: "attempt-2", evidenceEventIds: ["event-2"] };
    expect(project("L3", [BASE, sameTask]).visibleLevel).toBe("L3");
    const delayed = { ...sameTask, createdAt: "2026-09-10T00:00:00.000Z" };
    expect(project("L3", [BASE, delayed], "2026-09-10T01:00:00.000Z").visibleLevel).toBe("L4");
    const variant = { ...sameTask, taskIdentity: "problem-2" };
    expect(project("L3", [BASE, variant]).visibleLevel).toBe("L4");
  });

  it("reaches transfer only from unfamiliar E4 project evidence", () => {
    const transfer = { ...BASE, sourceType: "project" as const, taskIdentity: "milestone-final", coverageLevel: "E4" as const, unfamiliarTransfer: true };
    expect(project("L4", [transfer]).visibleLevel).toBe("L5");
  });

  it("marks stale evidence without lowering the visible level", () => {
    const result = project("L4", [BASE], "2026-11-01T00:00:00.000Z");
    expect(result.visibleLevel).toBe("L4");
    expect(result.stale).toBe(true);
    expect(result.confidence).toBe("low");
  });

  it("requires two consecutive unproductive sessions for a one-level reduction", () => {
    const failure = { ...BASE, outcome: "unproductive_trial_and_error" as const, coverageLevel: "E2" as const };
    expect(project("L3", [failure]).visibleLevel).toBe("L3");
    expect(project("L3", [failure, { ...failure, summaryId: "summary-2", sourceId: "attempt-2" }]).visibleLevel).toBe("L2");
  });
});
