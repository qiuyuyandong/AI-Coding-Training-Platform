import type { KnowledgeEdge, KnowledgeNode } from "@/lib/domain/curriculum";
import type { BaselineLevel } from "@/lib/domain/learner";
import {
  prerequisiteClosure,
  type PracticeSnapshot,
  type ResourceSnapshot,
} from "@/lib/services/curriculumGraph";

export type { PracticeSnapshot, ResourceSnapshot };

/**
 * V0 prerequisite and eligibility analysis.
 *
 * This service extends `lib/services/curriculumGraph.ts` with the
 * learner-aware eligibility reasons described in Todo 10 of the
 * `2026-07-17-v0-manual-learning-loop-vertical-slice` plan. The
 * curriculum-graph helper decides whether a published node is
 * "structurally" eligible (status, reviewed resource, practice mapping).
 * This module adds the prerequisite + baseline + ability layer that the
 * recommendation engine and UI consume.
 *
 * Pure functions only. The service does NOT import SQLite or read Node
 * process state; every caller's data is supplied through the function
 * arguments.
 *
 * Reason-code vocabulary (first-match order in `analyzeNodeEligibility`):
 *   - `blocked_status` — node status is not `published`.
 *   - `missing_reviewed_resource` — primary resource missing or not reviewed.
 *   - `missing_practice_mapping` — node has zero practice tasks.
 *   - `needs_diagnostic` — at least one prerequisite has an `unknown`
 *     baseline.
 *   - `needs_foundation` — at least one prerequisite has a
 *     `needs_foundation` or `self_reported` baseline.
 *   - `ready_for_learning` — no blockers and the node's own ability is
 *     `undefined` or `unassessed`.
 *   - `ready_for_practice` — no blockers and the node's own ability is
 *     `L1`, `L2`, `L3`, `L4`, or `L5` (V0 E1 cannot reach L3–L5 from the
 *     one-task-per-node corpus, so mastery never gates eligibility in
 *     this projector).
 *
 * `missing_prerequisite` is reserved in the reason union for future
 * use and is not emitted by V0; the algorithm does not currently
 * distinguish "no baseline entry" from "explicitly unknown" because
 * both mean "the learner has not been assessed for this prerequisite".
 */

export const PREREQUISITE_REASONS = {
  blockedStatus: "blocked_status",
  missingReviewedResource: "missing_reviewed_resource",
  missingPracticeMapping: "missing_practice_mapping",
  missingPrerequisite: "missing_prerequisite",
  needsDiagnostic: "needs_diagnostic",
  needsFoundation: "needs_foundation",
  readyForLearning: "ready_for_learning",
  readyForPractice: "ready_for_practice",
} as const;

export type PrerequisiteReason =
  (typeof PREREQUISITE_REASONS)[keyof typeof PREREQUISITE_REASONS];

/**
 * V0 visible ability levels for a single node. The set mirrors the
 * CHECK constraint declared on `ability_snapshots.visible_level` in
 * migration `0008_ability_projection.sql`; only `unassessed`, `L1`, and
 * `L2` are reachable through the V0 E1 projector today.
 */
export type AbilityLevel =
  | "unassessed"
  | "L1"
  | "L2"
  | "L3"
  | "L4"
  | "L5";

/**
 * Sparse map keyed by node stable id. `undefined` means "no baseline
 * row for this node", which is treated the same as an explicit
 * `unknown` baseline by the gating algorithm.
 */
export type BaselineMap = Readonly<Record<string, BaselineLevel | undefined>>;

/**
 * Sparse map keyed by node stable id. `undefined` means "no ability
 * snapshot for this node", which the algorithm treats as `unassessed`.
 */
export type AbilityMap = Readonly<Record<string, AbilityLevel | undefined>>;

/**
 * Precomputed transitive prerequisite closure per node stable id. When
 * the caller does not supply this map, each node's closure is computed
 * on demand through `prerequisiteClosure`.
 */
export type PrerequisitesByNode = Readonly<Record<string, readonly string[]>>;

export type EligibilityResult = {
  readonly status: "available" | "unavailable";
  readonly reason: PrerequisiteReason;
  readonly blockingNodeIds: readonly string[];
  readonly message: string;
};

export type GraphEligibilitySummary = {
  readonly readyForLearning: readonly string[];
  readonly readyForPractice: readonly string[];
  readonly unavailable: readonly string[];
};

export type GraphEligibilitySnapshot = {
  readonly perNode: Readonly<Record<string, EligibilityResult>>;
  readonly summary: GraphEligibilitySummary;
};

function lookupBaseline(
  baselines: BaselineMap,
  nodeStableId: string,
): BaselineLevel | undefined {
  return baselines[nodeStableId];
}

function lookupAbility(
  abilities: AbilityMap,
  nodeStableId: string,
): AbilityLevel | undefined {
  return abilities[nodeStableId];
}

function makeBlocked(
  reason: PrerequisiteReason,
  message: string,
  blockingNodeIds: readonly string[] = [],
): EligibilityResult {
  return {
    status: "unavailable",
    reason,
    message,
    blockingNodeIds,
  };
}

function makeReady(
  reason: "ready_for_learning" | "ready_for_practice",
  message: string,
): EligibilityResult {
  return {
    status: "available",
    reason,
    message,
    blockingNodeIds: [],
  };
}

/**
 * Evaluate a single node's eligibility through the V0 prerequisite +
 * diagnostic + ability precedence ladder. The function returns
 * immediately on the first matching step:
 *
 *   1. Non-published → `blocked_status`
 *   2. Missing reviewed primary resource → `missing_reviewed_resource`
 *   3. Missing practice mapping → `missing_practice_mapping`
 *   4. Prerequisite with `unknown` baseline → `needs_diagnostic`
 *   5. Prerequisite with `needs_foundation` or `self_reported` baseline
 *      → `needs_foundation`
 *   6. Ability undefined or `unassessed` → `ready_for_learning`
 *   7. Ability `L1` / `L2` → `ready_for_practice`
 *   8. Ability `L3` / `L4` / `L5` → `ready_for_practice`
 *
 * Self-report never counts as evidence: a `self_reported` prerequisite
 * baseline still produces `needs_foundation` per step 5. The function
 * does not inspect SQLite and does not record telemetry.
 *
 * When `prerequisites` is omitted, the function computes the transitive
 * `required_prerequisite` closure through `prerequisiteClosure`.
 */
export function analyzeNodeEligibility(
  node: KnowledgeNode,
  edges: readonly KnowledgeEdge[],
  resources: ResourceSnapshot,
  practices: PracticeSnapshot,
  prerequisites?: readonly string[],
  baseline?: BaselineMap,
  abilityLevel?: AbilityMap,
): EligibilityResult {
  // Step 1 — node status must be published.
  if (node.status !== "published") {
    return makeBlocked(
      "blocked_status",
      `Node ${node.stable_id} has status '${node.status}' and is not eligible`,
    );
  }

  // Step 2 — primary resource must be reviewed.
  if (resources.primary === null || resources.reviewStatus !== "reviewed") {
    return makeBlocked(
      "missing_reviewed_resource",
      `Node ${node.stable_id} has no reviewed primary resource`,
    );
  }

  // Step 3 — at least one practice mapping must exist.
  if (practices.tasks.length === 0) {
    return makeBlocked(
      "missing_practice_mapping",
      `Node ${node.stable_id} has no practice mapping`,
    );
  }

  const prereqs: readonly string[] =
    prerequisites ?? prerequisiteClosure(node.stable_id, edges);
  const baselines: BaselineMap = baseline ?? {};
  const abilities: AbilityMap = abilityLevel ?? {};

  // Step 4 — prerequisites with an `unknown` baseline OR no recorded
  // baseline (undefined) block with `needs_diagnostic`. Treating
  // `undefined` as `unknown` is required so a learner who has not been
  // diagnosed at all still sees `needs_diagnostic` instead of a silent
  // `ready_for_learning`.
  const unknownPrereqs: string[] = [];
  for (const prereqId of prereqs) {
    const value = lookupBaseline(baselines, prereqId);
    if (value === "unknown" || value === undefined) {
      unknownPrereqs.push(prereqId);
    }
  }
  if (unknownPrereqs.length > 0) {
    return makeBlocked(
      "needs_diagnostic",
      `Node ${node.stable_id} needs diagnostic on prerequisites: ${unknownPrereqs.join(", ")}`,
      unknownPrereqs,
    );
  }

  // Step 5 — `needs_foundation` / `self_reported` prerequisite
  // baselines block the dependent node. Self-report never grants
  // automatic mastery because the diagnostic override path does not
  // certify the learner as ready.
  const foundationPrereqs: string[] = [];
  for (const prereqId of prereqs) {
    const value = lookupBaseline(baselines, prereqId);
    if (value === "needs_foundation" || value === "self_reported") {
      foundationPrereqs.push(prereqId);
    }
  }
  if (foundationPrereqs.length > 0) {
    return makeBlocked(
      "needs_foundation",
      `Node ${node.stable_id} needs foundation on prerequisites: ${foundationPrereqs.join(", ")}`,
      foundationPrereqs,
    );
  }

  // Steps 6–8 — ability level determines ready_for_learning vs
  // ready_for_practice. L3–L5 are stored but unreachable from the V0
  // E1 projector today; the algorithm still treats them as
  // ready_for_practice so a future projector does not silently lose
  // eligibility when the corpus expands.
  void PREREQUISITE_REASONS.missingPrerequisite;
  const ability = lookupAbility(abilities, node.stable_id);
  if (ability === undefined || ability === "unassessed") {
    return makeReady(
      "ready_for_learning",
      `Node ${node.stable_id} is ready for learning`,
    );
  }

  return makeReady(
    "ready_for_practice",
    `Node ${node.stable_id} is ready for practice`,
  );
}

/**
 * Pure graph-wide eligibility projection. The function iterates every
 * published node in deterministic `(order_index ASC, stable_id ASC)`
 * order, calls `analyzeNodeEligibility` once per node, and folds the
 * results into:
 *
 *   - `perNode`: lookup from stable id → `EligibilityResult`
 *   - `summary`: three lists keyed by terminal reason
 *     (`ready_for_learning`, `ready_for_practice`, `unavailable`)
 *
 * The traversal is pure, deterministic, and never reads SQLite. The
 * caller is expected to load resource / practice snapshots through the
 * existing `curriculumGraph` helpers (or supply them directly). When
 * a node has no resource / practice entry in the supplied maps, the
 * function falls back to `{ primary: null, reviewStatus: null }` and
 * `{ tasks: [] }` respectively so the structural reasons
 * (`missing_reviewed_resource`, `missing_practice_mapping`) still
 * surface in the summary.
 */
export function analyzeGraphEligibility(
  nodes: readonly KnowledgeNode[],
  edges: readonly KnowledgeEdge[],
  resources: ReadonlyMap<string, ResourceSnapshot>,
  practices: ReadonlyMap<string, PracticeSnapshot>,
  prerequisites: PrerequisitesByNode = {},
  baselines: BaselineMap = {},
  abilities: AbilityMap = {},
): GraphEligibilitySnapshot {
  const sortedNodes = [...nodes].sort(compareKnowledgeNodes);

  const perNode: Record<string, EligibilityResult> = {};
  const readyForLearning: string[] = [];
  const readyForPractice: string[] = [];
  const unavailable: string[] = [];

  for (const node of sortedNodes) {
    const resourceSnapshot: ResourceSnapshot =
      resources.get(node.stable_id) ?? { primary: null, reviewStatus: null };
    const practiceSnapshot: PracticeSnapshot =
      practices.get(node.stable_id) ?? { tasks: [] };

    const result = analyzeNodeEligibility(
      node,
      edges,
      resourceSnapshot,
      practiceSnapshot,
      prerequisites[node.stable_id],
      baselines,
      abilities,
    );

    perNode[node.stable_id] = result;

    if (result.status === "unavailable") {
      unavailable.push(node.stable_id);
    } else if (result.reason === "ready_for_learning") {
      readyForLearning.push(node.stable_id);
    } else {
      readyForPractice.push(node.stable_id);
    }
  }

  return {
    perNode,
    summary: {
      readyForLearning,
      readyForPractice,
      unavailable,
    },
  };
}

function compareKnowledgeNodes(
  a: KnowledgeNode,
  b: KnowledgeNode,
): number {
  if (a.order_index !== b.order_index) {
    return a.order_index - b.order_index;
  }
  if (a.stable_id < b.stable_id) return -1;
  if (a.stable_id > b.stable_id) return 1;
  return 0;
}