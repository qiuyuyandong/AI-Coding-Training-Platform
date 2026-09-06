import { createHash } from "node:crypto";
import type { AttemptResult } from "@/lib/domain/training";
import type {
  EvidenceCoverage,
  TrainingOutcome,
} from "@/lib/domain/evidence";
import type { AbilityConfidence } from "@/lib/domain/ability";

export const TRAINING_OUTCOME_CLASSIFIER_VERSION = "training-outcome-1" as const;

export type TrainingOutcomeInput = {
  readonly result: AttemptResult;
  readonly usedAssistance: boolean | null;
  readonly submissionCount: number;
  readonly meaningfulChangeCount: number;
  readonly hasSubmissionSequence: boolean;
  readonly hasCodeSnapshot: boolean;
  readonly hasRunOrTestEvidence: boolean;
  readonly hasReflection: boolean;
};

export type TrainingOutcomeResult = {
  readonly outcome: TrainingOutcome;
  readonly coverageLevel: EvidenceCoverage;
  readonly confidence: AbilityConfidence;
  readonly reasonCodes: readonly string[];
  readonly unresolvedFacts: readonly string[];
  readonly inputFingerprint: string;
  readonly classifierVersion: typeof TRAINING_OUTCOME_CLASSIFIER_VERSION;
};

export function classifyTrainingOutcome(
  input: TrainingOutcomeInput,
): TrainingOutcomeResult {
  validateCounts(input);
  const coverageLevel: EvidenceCoverage = input.hasRunOrTestEvidence
    ? "E4"
    : input.hasCodeSnapshot
      ? "E3"
      : input.hasSubmissionSequence
        ? "E2"
        : "E1";
  const unresolvedFacts: string[] = [];
  if (input.usedAssistance === null) unresolvedFacts.push("assistance_unknown");
  if (!input.hasCodeSnapshot) unresolvedFacts.push("code_change_unavailable");

  let outcome: TrainingOutcome;
  let reasonCodes: readonly string[];
  if (input.result === "passed" && input.usedAssistance === false) {
    outcome = coverageLevel === "E1"
      ? "insufficient_evidence"
      : "independent_effective_completion";
    reasonCodes = coverageLevel === "E1"
      ? ["pass_without_independence_coverage"]
      : ["passed_without_assistance", "sequence_or_code_verified"];
  } else if (input.result === "passed" && input.usedAssistance === true) {
    outcome = "assisted_effective_completion";
    reasonCodes = ["passed_with_assistance", input.hasReflection ? "reflection_present" : "reflection_missing"];
  } else if (
    input.result !== "draft"
    && (input.meaningfulChangeCount > 0 || input.hasRunOrTestEvidence)
  ) {
    outcome = "productive_struggle";
    reasonCodes = ["unfinished_with_progress_evidence"];
  } else if (
    input.result !== "draft"
    && input.submissionCount >= 3
    && input.meaningfulChangeCount === 0
  ) {
    outcome = "unproductive_trial_and_error";
    reasonCodes = ["repeated_without_meaningful_change"];
  } else {
    outcome = "insufficient_evidence";
    reasonCodes = [input.result === "draft" ? "session_unfinished" : "facts_too_sparse"];
  }

  const confidence: AbilityConfidence = coverageLevel === "E1"
    ? "low"
    : coverageLevel === "E2" || unresolvedFacts.length > 0
      ? "medium"
      : "high";
  return {
    outcome,
    coverageLevel,
    confidence,
    reasonCodes,
    unresolvedFacts,
    inputFingerprint: createHash("sha256").update(JSON.stringify(input)).digest("hex"),
    classifierVersion: TRAINING_OUTCOME_CLASSIFIER_VERSION,
  };
}

function validateCounts(input: TrainingOutcomeInput): void {
  for (const [name, value] of [
    ["submissionCount", input.submissionCount],
    ["meaningfulChangeCount", input.meaningfulChangeCount],
  ] as const) {
    if (!Number.isInteger(value) || value < 0) {
      throw new RangeError(`${name} must be a non-negative integer`);
    }
  }
}
