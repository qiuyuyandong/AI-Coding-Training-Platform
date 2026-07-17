import { createHash } from "node:crypto";
import {
  AbilityLevelSchema,
  AbilityConfidenceSchema,
  type AbilityLevel,
  type AbilityConfidence,
  type AttemptNodeMappingRow,
} from "@/lib/domain/ability";

/**
 * V0 deterministic replayable ability projector.
 *
 * Pure functions only. The service never imports SQLite, never reads
 * Node process state, and never opens clocks — every input (including
 * the reference "now") is supplied by the caller. Determinism is the
 * core contract: two replays with byte-identical inputs (including
 * `now`) must yield byte-identical projections, transitions, and
 * fingerprints.
 *
 * The projector intentionally accepts a pre-joined mapping view
 * (`mappings`) rather than opening a database handle. The repository
 * (`lib/repositories/ability.ts`) is the only caller-bound module that
 * joins `attempt_node_mappings` with `training_attempts`; the projector
 * operates on the resulting shape.
 *
 * Rules (Todo 14, Wave 3 of the V0 vertical slice):
 *
 *   - Voided attempts are filtered out at the input boundary; they do
 *     not contribute to ability.
 *   - Drafts do not advance ability.
 *   - The first qualifying primary pass → `L1` / `low`.
 *   - The second qualifying primary pass on a distinct canonical
 *     problem OR at least seven days after the first → `L2` / `medium`.
 *   - V0 has exactly one canonical practice task per node, so the
 *     "distinct canonical problem" branch is reserved for future corpus
 *     expansion. Today's tests trigger L2 via the 7-day delay.
 *   - Supporting evidence alone (no qualifying primary pass) can reach
 *     `L1` but cannot exceed `L1`.
 *   - One ordinary failed/stuck attempt lowers confidence only.
 *   - Two latest consecutive primary failures may lower the visible
 *     level by one step.
 *   - Corrections and voids change the visible level only when the
 *     remaining active evidence supports the change; identical replays
 *     never emit duplicate transitions.
 *   - L3–L5 are stored but unreachable from the V0 E1 projector; the
 *     projector explicitly caps visible level at `L2`.
 *
 * Transitions are emitted only when the visible level changes compared
 * to the supplied `previousSnapshots` map. The persistence layer is
 * responsible for fingerprint deduplication through the SQL UNIQUE
 * constraint on `(learner_id, node_id, input_fingerprint,
 * projection_version)`.
 */

export const PROJECTOR_VERSION = "v0-ability-projector-1" as const;

const RE_VERIFICATION_DAYS = 7;
const STALE_DAYS = 30;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

export type AttemptResultLiteral =
  | "passed"
  | "failed"
  | "partial"
  | "stuck"
  | "draft";

export type AttemptRef = {
  readonly id: string;
  readonly revision: number;
  readonly result: AttemptResultLiteral;
  readonly voided: boolean;
  readonly startedAt: string;
  /**
   * The canonical problem identity recorded against the attempt. Two
   * attempts on the same node but on different canonical problems
   * promote to `L2` even when they are temporally close. The V0 corpus
   * ships one canonical problem per node, so this field is normally
   * identical across all primary mappings of a node; the test suite
   * passes it explicitly when it needs to exercise the distinct-problem
   * branch. The repository layer may leave it undefined when the
   * underlying attempt has no canonical-problem linkage.
   */
  readonly canonicalProblemId?: string;
};

export type PerNodeProjection = {
  readonly visibleLevel: AbilityLevel;
  readonly confidence: AbilityConfidence;
  readonly evidenceCount: number;
};

export type ProjectorInput = {
  readonly learnerId: string;
  readonly mappings: ReadonlyArray<{
    readonly mapping: AttemptNodeMappingRow;
    readonly attempt: AttemptRef;
  }>;
  readonly nodeIds: ReadonlyArray<string>;
  readonly previousSnapshots?: ReadonlyMap<string, PerNodeProjection>;
  readonly now: string;
};

export type AbilityTransition = {
  readonly nodeId: string;
  readonly previousLevel: AbilityLevel;
  readonly newLevel: AbilityLevel;
  readonly reasonCodes: readonly string[];
  readonly sourceAttemptIds: readonly string[];
  readonly sourceAttemptRevisions: readonly number[];
};

export type ProjectionResult = {
  readonly perNode: ReadonlyMap<string, PerNodeProjection>;
  readonly transitions: readonly AbilityTransition[];
  readonly inputFingerprint: string;
};

const ABILITY_LEVELS = AbilityLevelSchema.options;
const LEVEL_RANK: Readonly<Record<AbilityLevel, number>> = {
  unassessed: 0,
  L1: 1,
  L2: 2,
  L3: 3,
  L4: 4,
  L5: 5,
};

function isQualifyingPass(attempt: AttemptRef): boolean {
  return attempt.result === "passed" && !attempt.voided;
}

function isQualifyingFailure(attempt: AttemptRef): boolean {
  return (
    (attempt.result === "failed" || attempt.result === "stuck") &&
    !attempt.voided
  );
}

function isCompletedAttempt(attempt: AttemptRef): boolean {
  return !attempt.voided && attempt.result !== "draft";
}

function isPrimaryEvidence(mapping: AttemptNodeMappingRow): boolean {
  return mapping.role === "primary";
}

function isSupportingEvidence(mapping: AttemptNodeMappingRow): boolean {
  return mapping.role === "supporting";
}

function parseTimestamp(value: string): number {
  const ms = Date.parse(value);
  if (Number.isNaN(ms)) {
    throw new RangeError(`Invalid ISO timestamp: '${value}'`);
  }
  return ms;
}

function compareAttemptRefs(a: AttemptRef, b: AttemptRef): number {
  if (a.startedAt !== b.startedAt) {
    return a.startedAt < b.startedAt ? -1 : 1;
  }
  if (a.id !== b.id) return a.id < b.id ? -1 : 1;
  return 0;
}

function sortByAttemptOrder<
  T extends { readonly attempt: AttemptRef },
>(entries: readonly T[]): T[] {
  return [...entries].sort((x, y) => compareAttemptRefs(x.attempt, y.attempt));
}

function sortNodeIds(nodeIds: readonly string[]): string[] {
  return [...nodeIds].sort();
}

function lowerLevelByOne(level: AbilityLevel): AbilityLevel {
  const rank = LEVEL_RANK[level];
  const lowered = ABILITY_LEVELS[Math.max(0, rank - 1)];
  return lowered;
}

type PerNodeProjectionInputs = {
  readonly nodeId: string;
  readonly nodeMappings: ReadonlyArray<{
    readonly mapping: AttemptNodeMappingRow;
    readonly attempt: AttemptRef;
  }>;
  readonly previous: PerNodeProjection | undefined;
  readonly nowMs: number;
};

type PerNodeProjectionOutput = {
  readonly projection: PerNodeProjection;
  readonly transition: AbilityTransition | null;
  readonly isStale: boolean;
};

function projectSingleNode(
  inputs: PerNodeProjectionInputs,
): PerNodeProjectionOutput {
  const { nodeId, nodeMappings, previous, nowMs } = inputs;

  // Step 1 — drop voided attempts at the boundary; the repository
  // already filters voided rows but the projector re-applies the rule so
  // direct callers and tests cannot accidentally include them.
  const active = nodeMappings.filter((entry) => !entry.attempt.voided);

  // Step 2 — stable chronological order.
  const sorted = sortByAttemptOrder(active);

  const primaryEntries = sorted.filter((entry) =>
    isPrimaryEvidence(entry.mapping),
  );
  const supportingEntries = sorted.filter((entry) =>
    isSupportingEvidence(entry.mapping),
  );
  const primaryPasses = primaryEntries.filter((entry) =>
    isQualifyingPass(entry.attempt),
  );
  const primaryFailures = primaryEntries.filter((entry) =>
    isQualifyingFailure(entry.attempt),
  );
  const supportingPasses = supportingEntries.filter((entry) =>
    isQualifyingPass(entry.attempt),
  );

  // Latest-two primary check for the consecutive-failure rule.
  const latestTwoPrimary = primaryEntries.slice(-2);
  const twoConsecutivePrimaryFailures =
    latestTwoPrimary.length === 2 &&
    latestTwoPrimary.every((entry) => isQualifyingFailure(entry.attempt));

  // Stale is reported to the caller; the projector never lowers the
  // visible level for staleness.
  const latestActiveMs = sorted.length > 0
    ? parseTimestamp(
        sorted[sorted.length - 1]?.attempt.startedAt ?? "",
      )
    : null;
  const isStale =
    latestActiveMs !== null &&
    nowMs - latestActiveMs >= STALE_DAYS * MS_PER_DAY;

  // Determine visible level from primary evidence.
  let visibleLevel: AbilityLevel = "unassessed";
  let reasonCodes: string[] = [];
  let sourceAttemptIds: string[] = [];
  let sourceAttemptRevisions: number[] = [];

  if (primaryPasses.length >= 2) {
    const first = primaryPasses[0];
    const second = primaryPasses[1];
    if (first !== undefined && second !== undefined) {
      const firstMs = parseTimestamp(first.attempt.startedAt);
      const secondMs = parseTimestamp(second.attempt.startedAt);
      const gapDays = (secondMs - firstMs) / MS_PER_DAY;
      const isDistinctProblem =
        first.attempt.canonicalProblemId !== undefined &&
        second.attempt.canonicalProblemId !== undefined &&
        first.attempt.canonicalProblemId !==
          second.attempt.canonicalProblemId;
      const isDelayed = gapDays >= RE_VERIFICATION_DAYS;
      if (isDistinctProblem || isDelayed) {
        visibleLevel = "L2";
        reasonCodes = [
          isDistinctProblem
            ? "primary_second_pass_distinct_problem"
            : "primary_second_pass_delayed_reverification",
        ];
        sourceAttemptIds = [first.attempt.id, second.attempt.id];
        sourceAttemptRevisions = [
          first.attempt.revision,
          second.attempt.revision,
        ];
      } else {
        visibleLevel = "L1";
        reasonCodes = ["primary_repeat_short_window"];
        sourceAttemptIds = [first.attempt.id, second.attempt.id];
        sourceAttemptRevisions = [
          first.attempt.revision,
          second.attempt.revision,
        ];
      }
    }
  } else if (primaryPasses.length === 1) {
    const first = primaryPasses[0];
    if (first !== undefined) {
      visibleLevel = "L1";
      reasonCodes = ["primary_first_pass"];
      sourceAttemptIds = [first.attempt.id];
      sourceAttemptRevisions = [first.attempt.revision];
    }
  } else if (supportingPasses.length >= 1) {
    visibleLevel = "L1";
    reasonCodes = ["supporting_only_cap_l1"];
    sourceAttemptIds = supportingPasses.map((entry) => entry.attempt.id);
    sourceAttemptRevisions = supportingPasses.map(
      (entry) => entry.attempt.revision,
    );
  } else if (primaryFailures.length > 0) {
    visibleLevel = "unassessed";
    reasonCodes = ["primary_failures_only"];
  } else {
    visibleLevel = "unassessed";
    reasonCodes = ["no_evidence"];
  }

  // Two latest consecutive primary failures may lower one step.
  if (twoConsecutivePrimaryFailures) {
    const lowered = lowerLevelByOne(visibleLevel);
    if (lowered !== visibleLevel) {
      reasonCodes = [
        ...reasonCodes,
        "two_consecutive_primary_failures_lower_one",
      ];
      visibleLevel = lowered;
      sourceAttemptIds = latestTwoPrimary.map((entry) => entry.attempt.id);
      sourceAttemptRevisions = latestTwoPrimary.map(
        (entry) => entry.attempt.revision,
      );
    }
  }

  // Supporting cap — supporting evidence cannot push the visible level
  // above L1. This guard is a defensive net for future multi-task
  // nodes where supporting entries arrive alongside primary entries
  // that would otherwise drive L2.
  if (
    visibleLevel !== "unassessed" &&
    visibleLevel !== "L1" &&
    supportingPasses.length > 0 &&
    primaryPasses.length === 0
  ) {
    visibleLevel = "L1";
  }

  // Confidence — one ordinary failure lowers confidence only.
  let confidence: AbilityConfidence;
  if (primaryFailures.length > 0 || primaryPasses.length === 0) {
    confidence = "low";
  } else if (visibleLevel === "L2") {
    const firstPass = primaryPasses[0];
    const secondPass = primaryPasses[1];
    if (firstPass !== undefined && secondPass !== undefined) {
      const firstMs = parseTimestamp(firstPass.attempt.startedAt);
      const secondMs = parseTimestamp(secondPass.attempt.startedAt);
      const gapDays = (secondMs - firstMs) / MS_PER_DAY;
      const isDistinctProblem =
        firstPass.attempt.canonicalProblemId !== undefined &&
        secondPass.attempt.canonicalProblemId !== undefined &&
        firstPass.attempt.canonicalProblemId !==
          secondPass.attempt.canonicalProblemId;
      const isDelayed = gapDays >= RE_VERIFICATION_DAYS;
      confidence =
        isDistinctProblem || isDelayed ? "medium" : "low";
    } else {
      confidence = "low";
    }
  } else {
    confidence = "low";
  }
  // Validate the chosen confidence against the domain schema so the
  // projector never emits a value that the persistence layer would
  // reject. This is a defensive parse; the branches above already
  // assign known members of the enum.
  AbilityConfidenceSchema.parse(confidence);

  const evidenceCount = sorted.filter((entry) =>
    isCompletedAttempt(entry.attempt),
  ).length;

  const projection: PerNodeProjection = {
    visibleLevel,
    confidence,
    evidenceCount,
  };

  const previousLevel = previous?.visibleLevel ?? "unassessed";
  const transition: AbilityTransition | null =
    previousLevel !== visibleLevel
      ? {
          nodeId,
          previousLevel,
          newLevel: visibleLevel,
          reasonCodes,
          sourceAttemptIds,
          sourceAttemptRevisions,
        }
      : null;

  return { projection, transition, isStale };
}

export function computeInputFingerprint(input: ProjectorInput): string {
  const sortedMappings = [...input.mappings].sort((a, b) => {
    const nodeA = a.mapping.node_id;
    const nodeB = b.mapping.node_id;
    if (nodeA !== nodeB) return nodeA < nodeB ? -1 : 1;
    const attemptA = a.mapping.attempt_id;
    const attemptB = b.mapping.attempt_id;
    if (attemptA !== attemptB) return attemptA < attemptB ? -1 : 1;
    return 0;
  });

  const mappingRecords = sortedMappings.map((entry) => ({
    node_id: entry.mapping.node_id,
    role: entry.mapping.role,
    mapping_reason: entry.mapping.mapping_reason,
    mapping_created_at: entry.mapping.created_at,
    attempt_id: entry.attempt.id,
    attempt_revision: entry.attempt.revision,
    attempt_result: entry.attempt.result,
    attempt_voided: entry.attempt.voided,
    attempt_started_at: entry.attempt.startedAt,
    canonical_problem_id: entry.attempt.canonicalProblemId ?? null,
  }));

  const sortedNodes = sortNodeIds(input.nodeIds);

  const previousRecords: Record<string, unknown> = {};
  if (input.previousSnapshots !== undefined) {
    for (const key of [...input.previousSnapshots.keys()].sort()) {
      const value = input.previousSnapshots.get(key);
      if (value !== undefined) {
        previousRecords[key] = {
          visible_level: value.visibleLevel,
          confidence: value.confidence,
          evidence_count: value.evidenceCount,
        };
      }
    }
  }

  const payload = {
    projector_version: PROJECTOR_VERSION,
    learner_id: input.learnerId,
    now: input.now,
    node_ids: sortedNodes,
    mappings: mappingRecords,
    previous_snapshots: previousRecords,
  };

  return createHash("sha256")
    .update(JSON.stringify(payload))
    .digest("hex");
}

export function projectAbility(input: ProjectorInput): ProjectionResult {
  const grouped = new Map<
    string,
    Array<{
      readonly mapping: AttemptNodeMappingRow;
      readonly attempt: AttemptRef;
    }>
  >();
  for (const entry of input.mappings) {
    if (entry.attempt.voided) continue;
    const list = grouped.get(entry.mapping.node_id);
    if (list === undefined) {
      grouped.set(entry.mapping.node_id, [entry]);
    } else {
      list.push(entry);
    }
  }

  const nowMs = parseTimestamp(input.now);

  const perNode = new Map<string, PerNodeProjection>();
  const transitions: AbilityTransition[] = [];

  for (const nodeId of sortNodeIds(input.nodeIds)) {
    const nodeMappings = grouped.get(nodeId) ?? [];
    const previous = input.previousSnapshots?.get(nodeId);
    const result = projectSingleNode({
      nodeId,
      nodeMappings,
      previous,
      nowMs,
    });
    perNode.set(nodeId, result.projection);
    if (result.transition !== null) {
      transitions.push(result.transition);
    }
  }

  return {
    perNode,
    transitions,
    inputFingerprint: computeInputFingerprint(input),
  };
}