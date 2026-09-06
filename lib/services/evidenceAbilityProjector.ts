import { createHash } from "node:crypto";
import type { AbilityConfidence, AbilityLevel, MappingRole } from "@/lib/domain/ability";
import type { EvidenceCoverage, EvidenceSourceType, TrainingOutcome } from "@/lib/domain/evidence";

export const EVIDENCE_ABILITY_PROJECTOR_VERSION = "evidence-ability-projector-1" as const;
const LEVELS: readonly AbilityLevel[] = ["unassessed", "L1", "L2", "L3", "L4", "L5"];
const STALE_MS = 30 * 86_400_000;

export type EvidenceAbilityFact = {
  readonly summaryId: string;
  readonly sourceType: EvidenceSourceType;
  readonly sourceId: string;
  readonly taskIdentity: string;
  readonly outcome: TrainingOutcome;
  readonly coverageLevel: EvidenceCoverage;
  readonly confidence: AbilityConfidence;
  readonly role: MappingRole;
  readonly createdAt: string;
  readonly unfamiliarTransfer: boolean;
  readonly evidenceEventIds: readonly string[];
};

export type EvidenceAbilityProjection = {
  readonly visibleLevel: AbilityLevel;
  readonly confidence: AbilityConfidence;
  readonly evidenceCount: number;
  readonly stale: boolean;
  readonly reasonCodes: readonly string[];
  readonly sourceSummaryIds: readonly string[];
  readonly sourceEvidenceIds: readonly string[];
  readonly inputFingerprint: string;
};

export function projectEvidenceAbility(input: {
  readonly learnerId: string;
  readonly nodeId: string;
  readonly previousLevel: AbilityLevel;
  readonly facts: readonly EvidenceAbilityFact[];
  readonly now: string;
}): EvidenceAbilityProjection {
  const facts = [...input.facts].sort((left, right) => left.createdAt.localeCompare(right.createdAt) || left.summaryId.localeCompare(right.summaryId));
  const primary = facts.filter((fact) => fact.role === "primary");
  const independent = primary.filter((fact) => fact.outcome === "independent_effective_completion" && fact.coverageLevel !== "E1");
  const assisted = primary.filter((fact) => fact.outcome === "assisted_effective_completion");
  const productive = primary.filter((fact) => fact.outcome === "productive_struggle");
  const transfer = independent.some((fact) => fact.sourceType === "project" && fact.coverageLevel === "E4" && fact.unfamiliarTransfer);
  const stableIndependent = hasStableIndependentEvidence(independent);

  let target: AbilityLevel = "unassessed";
  let reasonCodes: readonly string[] = ["no_qualifying_evidence"];
  if (transfer) {
    target = "L5";
    reasonCodes = ["unfamiliar_project_transfer"];
  } else if (stableIndependent) {
    target = "L4";
    reasonCodes = ["independent_across_time_or_tasks"];
  } else if (independent.length > 0) {
    target = "L3";
    reasonCodes = ["independent_application_with_sequence_or_code"];
  } else if (assisted.length > 0) {
    target = "L2";
    reasonCodes = ["assisted_effective_application"];
  } else if (productive.length > 0 || facts.some((fact) => fact.role === "supporting")) {
    target = "L1";
    reasonCodes = [productive.length > 0 ? "productive_struggle_observed" : "supporting_evidence_cap_l1"];
  }

  const latestTwo = primary.slice(-2);
  const repeatedUnproductive = latestTwo.length === 2
    && latestTwo.every((fact) => fact.outcome === "unproductive_trial_and_error");
  const previousRank = LEVELS.indexOf(input.previousLevel);
  const targetRank = LEVELS.indexOf(target);
  let nextRank = previousRank;
  if (targetRank > previousRank) nextRank = Math.min(previousRank + 1, targetRank);
  if (repeatedUnproductive && previousRank > 0) {
    nextRank = previousRank - 1;
    reasonCodes = ["two_consecutive_unproductive_sessions_lower_one"];
  }
  const latestTime = facts.at(-1)?.createdAt;
  const nowMs = parseTime(input.now);
  const stale = latestTime !== undefined && nowMs - parseTime(latestTime) >= STALE_MS;
  const visibleLevel = LEVELS[nextRank] ?? "unassessed";
  const confidence: AbilityConfidence = stale || facts.length === 0
    ? "low"
    : independent.some((fact) => fact.coverageLevel === "E4")
      ? "high"
      : independent.length > 0 || assisted.length > 0
        ? "medium"
        : "low";
  const sourceSummaryIds = [...new Set(facts.map((fact) => fact.summaryId))];
  const sourceEvidenceIds = [...new Set(facts.flatMap((fact) => fact.evidenceEventIds))].sort();
  const inputFingerprint = createHash("sha256").update(JSON.stringify({
    version: EVIDENCE_ABILITY_PROJECTOR_VERSION,
    learnerId: input.learnerId,
    nodeId: input.nodeId,
    facts,
  })).digest("hex");
  return {
    visibleLevel,
    confidence,
    evidenceCount: facts.length,
    stale,
    reasonCodes,
    sourceSummaryIds,
    sourceEvidenceIds,
    inputFingerprint,
  };
}

function hasStableIndependentEvidence(facts: readonly EvidenceAbilityFact[]): boolean {
  for (let leftIndex = 0; leftIndex < facts.length - 1; leftIndex += 1) {
    const left = facts[leftIndex];
    if (left === undefined) continue;
    for (let rightIndex = leftIndex + 1; rightIndex < facts.length; rightIndex += 1) {
      const right = facts[rightIndex];
      if (right === undefined) continue;
      if (left.taskIdentity !== right.taskIdentity || parseTime(right.createdAt) - parseTime(left.createdAt) >= 7 * 86_400_000) return true;
    }
  }
  return false;
}

function parseTime(value: string): number {
  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) throw new RangeError(`Invalid evidence time '${value}'`);
  return parsed;
}
