import { describe, expect, it } from "vitest";
import { explainLevel } from "@/lib/services/evidenceExplanation";

/**
 * Pure-function tests for `lib/services/evidenceExplanation.ts`.
 *
 * The explanation builder is fully pure: it never imports SQLite, never
 * touches the file system, and never reads `process.env`. The V0
 * contracts from Todo 14 of the
 * `2026-07-17-v0-manual-learning-loop-vertical-slice` plan lock the
 * level label, uncertainty phrasing, and next-evidence guidance for
 * every reachable state.
 */

describe("explainLevel", () => {
  it("maps unassessed/low to 'Not yet assessed' with first-pass guidance", () => {
    const explanation = explainLevel(
      "unassessed",
      "low",
      ["no_evidence"],
      [],
      [],
    );
    expect(explanation.levelLabel).toBe("Not yet assessed");
    expect(explanation.confidenceLabel).toBe("low");
    expect(explanation.uncertainty).toBe("Limited signal");
    expect(explanation.nextEvidenceNeeded).toBe(
      "Complete the mapped practice task to record the first signal.",
    );
    expect(explanation.reasonCodes).toEqual(["no_evidence"]);
    expect(explanation.citedAttemptIds).toEqual([]);
    expect(explanation.citedAttemptRevisions).toEqual([]);
  });

  it("maps L1/low to 'First success' with re-verify guidance", () => {
    const explanation = explainLevel(
      "L1",
      "low",
      ["primary_first_pass"],
      ["manual_plan_42"],
      [1],
    );
    expect(explanation.levelLabel).toBe("First success");
    expect(explanation.confidenceLabel).toBe("low");
    expect(explanation.uncertainty).toBe("Limited signal");
    expect(explanation.nextEvidenceNeeded).toBe(
      "Re-verify after at least 7 days or on a distinct canonical problem.",
    );
    expect(explanation.reasonCodes).toEqual(["primary_first_pass"]);
    expect(explanation.citedAttemptIds).toEqual(["manual_plan_42"]);
    expect(explanation.citedAttemptRevisions).toEqual([1]);
  });

  it("maps L2/medium to 'Re-verified' with Beyond-V0 guidance", () => {
    const explanation = explainLevel(
      "L2",
      "medium",
      ["primary_second_pass_delayed_reverification"],
      ["manual_plan_42", "manual_plan_77"],
      [1, 1],
    );
    expect(explanation.levelLabel).toBe("Re-verified");
    expect(explanation.confidenceLabel).toBe("medium");
    expect(explanation.uncertainty).toBe("Moderate signal");
    expect(explanation.nextEvidenceNeeded).toBe(
      "Higher levels require new mapped tasks not included in V0.",
    );
    expect(explanation.reasonCodes).toEqual([
      "primary_second_pass_delayed_reverification",
    ]);
    expect(explanation.citedAttemptIds).toEqual(["manual_plan_42", "manual_plan_77"]);
    expect(explanation.citedAttemptRevisions).toEqual([1, 1]);
  });

  it("maps L3 to 'Out of V0 reach' regardless of confidence", () => {
    const explanation = explainLevel(
      "L3",
      "high",
      ["manual_override"],
      ["manual_plan_99"],
      [2],
    );
    expect(explanation.levelLabel).toBe("Out of V0 reach");
    expect(explanation.confidenceLabel).toBe("high");
    expect(explanation.uncertainty).toBe("Strong signal");
    expect(explanation.nextEvidenceNeeded).toBe(
      "Beyond current V0 content; will require new mapped tasks.",
    );
  });

  it("copies the caller-supplied reason codes and attempt references verbatim", () => {
    const explanation = explainLevel(
      "L1",
      "low",
      ["primary_first_pass", "manual_hint"],
      ["manual_plan_42"],
      [1],
    );
    expect(explanation.reasonCodes).toEqual([
      "primary_first_pass",
      "manual_hint",
    ]);
    expect(explanation.citedAttemptIds).toEqual(["manual_plan_42"]);
    expect(explanation.citedAttemptRevisions).toEqual([1]);
  });
});