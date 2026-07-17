import type { AbilityLevel, AbilityConfidence } from "@/lib/domain/ability";

/**
 * V0 evidence-explanation builder.
 *
 * Pure functions only. The service never imports SQLite or reads Node
 * process state; every input is supplied by the caller. The builder
 * converts a snapshot row (or projector transition) into the
 * learner-facing `Explanation` shape consumed by `/today` and `/map`.
 *
 * The explanation intentionally exposes only what the projector can
 * prove. It never claims mastery beyond the supplied level, never
 * interprets reason codes beyond the documented vocabulary, and never
 * substitutes a numeric score for the conservative L1 / L2 / L3 / L4 /
 * L5 progression.
 */

export type Explanation = {
  readonly levelLabel: string;
  readonly confidenceLabel: "low" | "medium" | "high";
  readonly reasonCodes: readonly string[];
  readonly citedAttemptIds: readonly string[];
  readonly citedAttemptRevisions: readonly number[];
  readonly uncertainty: string;
  readonly nextEvidenceNeeded: string;
};

const LEVEL_LABEL: Readonly<Record<AbilityLevel, string>> = {
  unassessed: "Not yet assessed",
  L1: "First success",
  L2: "Re-verified",
  L3: "Out of V0 reach",
  L4: "Out of V0 reach",
  L5: "Out of V0 reach",
};

const UNCERTAINTY_LABEL: Readonly<Record<AbilityConfidence, string>> = {
  low: "Limited signal",
  medium: "Moderate signal",
  high: "Strong signal",
};

const NEXT_EVIDENCE_BY_LEVEL: Readonly<Record<AbilityLevel, string>> = {
  unassessed: "Complete the mapped practice task to record the first signal.",
  L1: "Re-verify after at least 7 days or on a distinct canonical problem.",
  L2: "Higher levels require new mapped tasks not included in V0.",
  L3: "Beyond current V0 content; will require new mapped tasks.",
  L4: "Beyond current V0 content; will require new mapped tasks.",
  L5: "Beyond current V0 content; will require new mapped tasks.",
};

export function explainLevel(
  visibleLevel: AbilityLevel,
  confidence: AbilityConfidence,
  reasonCodes: readonly string[],
  citedAttemptIds: readonly string[],
  citedAttemptRevisions: readonly number[],
): Explanation {
  const levelLabel = LEVEL_LABEL[visibleLevel];
  const uncertainty = UNCERTAINTY_LABEL[confidence];
  const nextEvidenceNeeded = NEXT_EVIDENCE_BY_LEVEL[visibleLevel];

  return {
    levelLabel,
    confidenceLabel: confidence,
    reasonCodes: [...reasonCodes],
    citedAttemptIds: [...citedAttemptIds],
    citedAttemptRevisions: [...citedAttemptRevisions],
    uncertainty,
    nextEvidenceNeeded,
  };
}