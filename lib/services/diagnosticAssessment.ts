import type Database from "better-sqlite3";
import {
  BaselineConfidenceSchema,
  BaselineLevelSchema,
  BaselineSourceSchema,
  DiagnosticResponseValueSchema,
  type DiagnosticResponseValue,
  type LearnerNodeBaselineRow,
  type LearnerProfileRow,
} from "@/lib/domain/learner";
import {
  completeDiagnosticSession,
  findCurrentSession,
  listBaselines,
  recordDiagnosticResponse,
  startDiagnosticSession,
  upsertBaseline,
} from "@/lib/repositories/diagnosis";
import { getOrCreateLocalProfile } from "@/lib/repositories/learnerProfiles";
import {
  listPublishedKnowledgeNodes,
  type KnowledgeNodeRow,
} from "@/lib/repositories/curriculum";

/**
 * V0 diagnostic assessment service.
 *
 * This module owns the resumable six-prompt baseline flow and the
 * starting-point override described in Todo 9 of the
 * `2026-07-17-v0-manual-learning-loop-vertical-slice` plan. It is pure
 * with respect to HTTP and runs against a caller-owned SQLite handle.
 * Boundary validation is performed at the entry points so the API
 * route only needs to translate between JSON and the service contract.
 *
 * Blueprint version `v0-diagnosis-1` freezes exactly six prompts in a
 * fixed order. Each prompt covers a stable, named subset of the
 * published 12-node foundation package; the baseline computation
 * applies the strongest available response across all prompts that
 * cover a node, using the deterministic priority documented below.
 *
 * Diagnosis and starting-point overrides ONLY touch
 * `learner_node_baselines`; they never write to `ability_snapshots` or
 * `ability_transitions` (those are owned by Todo 14).
 *
 * Migration 0007 declares `learner_node_baselines.node_id` as a
 * foreign key into `knowledge_nodes.id` (the importer-generated row
 * id). The service therefore stores row ids in that column and exposes
 * stable ids at the API boundary so callers never need to know the
 * internal id scheme.
 */

export const DIAGNOSIS_BLUEPRINT_VERSION = "v0-diagnosis-1";

/**
 * Stable prompt identifier → covered node stable ids. The order of
 * `DIAGNOSIS_PROMPTS` is authoritative; the table is intentionally
 * private so callers cannot reorder the prompts without going through
 * this module.
 */
export type PromptSpec = {
  readonly promptId: string;
  readonly title: string;
  readonly question: string;
  readonly coveredNodeStableIds: readonly string[];
};

const PROMPT_SPECS: readonly PromptSpec[] = [
  {
    promptId: "cpp-basics",
    title: "C++ basics",
    question:
      "How comfortable are you with C++ I/O, basic types, conditionals, loops, and functions?",
    coveredNodeStableIds: ["cpp-io-types", "cpp-control-flow-functions"],
  },
  {
    promptId: "containers-functions",
    title: "Containers and decomposition",
    question:
      "How comfortable are you selecting standard containers and decomposing problems into cooperating functions?",
    coveredNodeStableIds: ["cpp-containers", "program-decomposition"],
  },
  {
    promptId: "debugging-testing",
    title: "Debugging and testing",
    question:
      "How comfortable are you reproducing failures, narrowing them with debugging tools, and constructing boundary test cases?",
    coveredNodeStableIds: ["debugging-testing"],
  },
  {
    promptId: "git-build",
    title: "Git and build workflow",
    question:
      "How comfortable are you initializing a Git repository, committing changes with descriptive messages, and compiling C++ from the command line?",
    coveredNodeStableIds: ["git-build-workflow"],
  },
  {
    promptId: "complexity-search-structures",
    title: "Complexity, search, and core structures",
    question:
      "How comfortable are you with complexity analysis, sorting and binary search, stacks and queues, and hash or linked structures?",
    coveredNodeStableIds: [
      "complexity-analysis",
      "sorting-binary-search",
      "stacks-queues",
      "hashing-linked-structures",
    ],
  },
  {
    promptId: "trees-graphs",
    title: "Trees and graphs",
    question:
      "How comfortable are you with recursive tree traversal and BFS / DFS on graphs?",
    coveredNodeStableIds: ["trees-recursion-traversal", "graphs-bfs-dfs"],
  },
];

export const DIAGNOSIS_PROMPTS: readonly PromptSpec[] = PROMPT_SPECS;

export const DIAGNOSIS_RESPONSE_VALUES: readonly DiagnosticResponseValue[] = [
  "unknown",
  "needs_foundation",
  "can_with_help",
  "ready",
];

const PROMPT_ID_SET: ReadonlySet<string> = new Set(
  PROMPT_SPECS.map((spec) => spec.promptId),
);

export type AssessmentClock = {
  readonly now?: () => string;
};

export type StartSessionResult = {
  readonly sessionId: string;
};

export type ResumeSessionResult = {
  readonly sessionId: string;
  readonly nextPrompt: PromptSpec | null;
};

export type RecordResponseOptions = AssessmentClock;

export type CompleteSessionResult = {
  readonly baselines: readonly LearnerNodeBaselineRow[];
};

export type OverrideResult = {
  readonly baselines: readonly LearnerNodeBaselineRow[];
};

/**
 * Pure preconditions for the public functions. Every entry point calls
 * `assertPromptId` and `assertResponseValue` BEFORE touching the
 * database so an invalid request is rejected without partial state.
 */
function assertPromptId(promptId: string): void {
  if (!PROMPT_ID_SET.has(promptId)) {
    throw new RangeError(`Unknown diagnostic promptId '${promptId}'`);
  }
}

function assertResponseValue(
  response: string,
): asserts response is DiagnosticResponseValue {
  const parsed = DiagnosticResponseValueSchema.safeParse(response);
  if (!parsed.success) {
    throw new RangeError(`Invalid diagnostic response '${response}'`);
  }
}

function ensureProfile(
  db: Database.Database,
  learnerId: string,
): LearnerProfileRow {
  // `getOrCreateLocalProfile` ignores its argument and always returns
  // the V0 singleton; passing the caller's id keeps the type contract
  // explicit without inventing a second profile.
  void learnerId;
  return getOrCreateLocalProfile(db);
}

function listResponsesForSession(
  db: Database.Database,
  sessionId: string,
): Map<string, DiagnosticResponseValue> {
  type Row = { readonly prompt_id: string; readonly response: string };
  const rows = db
    .prepare<[string], Row>(
      `SELECT prompt_id, response
         FROM diagnostic_responses
        WHERE session_id = ?`,
    )
    .all(sessionId);
  const responses = new Map<string, DiagnosticResponseValue>();
  for (const row of rows) {
    const parsed = DiagnosticResponseValueSchema.safeParse(row.response);
    if (parsed.success) {
      responses.set(row.prompt_id, parsed.data);
    }
  }
  return responses;
}

function firstUnansweredPrompt(
  responses: ReadonlyMap<string, DiagnosticResponseValue>,
): PromptSpec | null {
  for (const spec of PROMPT_SPECS) {
    if (!responses.has(spec.promptId)) {
      return spec;
    }
  }
  return null;
}

/**
 * Compute the strongest available response across every prompt that
 * covers `nodeStableId`. Priority order (highest first):
 *
 *   ready → can_with_help → needs_foundation → unknown
 *
 * Baseline level and confidence follow the V0 contract:
 *
 *   ready           → ready / low
 *   can_with_help   → self_reported / medium
 *   needs_foundation→ needs_foundation / medium
 *   unknown / none  → unknown / low
 *
 * The function is pure; callers persist its output.
 */
function computeBaselineForNode(
  nodeStableId: string,
  responses: ReadonlyMap<string, DiagnosticResponseValue>,
): {
  readonly baseline: LearnerNodeBaselineRow["baseline"];
  readonly confidence: LearnerNodeBaselineRow["confidence"];
} {
  let strongest: DiagnosticResponseValue = "unknown";
  for (const spec of PROMPT_SPECS) {
    if (!spec.coveredNodeStableIds.includes(nodeStableId)) continue;
    const value = responses.get(spec.promptId);
    if (value === undefined) continue;
    if (value === "ready") {
      strongest = "ready";
    } else if (value === "can_with_help" && strongest !== "ready") {
      strongest = "can_with_help";
    } else if (
      value === "needs_foundation"
      && strongest !== "ready"
      && strongest !== "can_with_help"
    ) {
      strongest = "needs_foundation";
    }
  }
  switch (strongest) {
    case "ready":
      return { baseline: "ready", confidence: "low" };
    case "can_with_help":
      return { baseline: "self_reported", confidence: "medium" };
    case "needs_foundation":
      return { baseline: "needs_foundation", confidence: "medium" };
    case "unknown":
      return { baseline: "unknown", confidence: "low" };
  }
}

/**
 * Snapshot of the active curriculum package's published nodes.
 * `rowIdByStableId` lets callers translate the API's stable-id surface
 * into the `knowledge_nodes.id` row id that `learner_node_baselines`
 * actually stores (the column has a FK to `knowledge_nodes.id`).
 */
type PackageSnapshot = {
  readonly packageId: string;
  readonly nodes: readonly KnowledgeNodeRow[];
  readonly stableIds: readonly string[];
  readonly rowIdByStableId: ReadonlyMap<string, string>;
  readonly stableIdByRowId: ReadonlyMap<string, string>;
};

function loadActivePackage(db: Database.Database): PackageSnapshot {
  const packages = db
    .prepare<[], { readonly id: string }>(
      `SELECT id
         FROM curriculum_packages
        ORDER BY installed_at DESC, id ASC`,
    )
    .all();
  if (packages.length === 0) {
    throw new RangeError(
      "Cannot resolve diagnostic override node: no curriculum package is installed",
    );
  }
  const packageId = packages[0]?.id;
  if (packageId === undefined) {
    throw new RangeError(
      "Cannot resolve diagnostic override node: curriculum package row missing",
    );
  }
  const nodes = listPublishedKnowledgeNodes(db, packageId);
  const rowIdByStableId = new Map<string, string>();
  const stableIdByRowId = new Map<string, string>();
  for (const node of nodes) {
    rowIdByStableId.set(node.stable_id, node.id);
    stableIdByRowId.set(node.id, node.stable_id);
  }
  return {
    packageId,
    nodes,
    stableIds: nodes.map((node) => node.stable_id),
    rowIdByStableId,
    stableIdByRowId,
  };
}

/**
 * Upsert a baseline by stable id. Internally resolves to the
 * `knowledge_nodes.id` row id, calls the repository, then translates
 * the returned row's `node_id` back to the stable id so the public
 * API surface uses stable ids end-to-end.
 */
function upsertBaselineByStableId(
  db: Database.Database,
  learnerId: string,
  stableId: string,
  packageSnapshot: PackageSnapshot,
  baseline: LearnerNodeBaselineRow["baseline"],
  confidence: LearnerNodeBaselineRow["confidence"],
  source: LearnerNodeBaselineRow["source"],
  options: AssessmentClock,
): LearnerNodeBaselineRow {
  const rowId = packageSnapshot.rowIdByStableId.get(stableId);
  if (rowId === undefined) {
    throw new RangeError(
      `Cannot upsert baseline for unknown stable id '${stableId}'`,
    );
  }
  const stored = upsertBaseline(
    db,
    learnerId,
    rowId,
    baseline,
    confidence,
    source,
    options,
  );
  return { ...stored, nodeId: stableId };
}

/**
 * Create a fresh in-progress diagnostic session for the learner.
 * Sessions are intentionally not lazy-created: callers that want
 * resume semantics should call `resumeSession` instead.
 */
export function startSession(
  db: Database.Database,
  learnerId: string,
  options: AssessmentClock = {},
): StartSessionResult {
  const profile = ensureProfile(db, learnerId);
  const session = startDiagnosticSession(
    db,
    profile.id,
    DIAGNOSIS_BLUEPRINT_VERSION,
    options,
  );
  return { sessionId: session.id };
}

/**
 * UPSERT one diagnostic response. `promptId` must reference a prompt
 * in `DIAGNOSIS_PROMPTS`; `response` must be one of
 * `DiagnosticResponseValue`. A duplicate call for the same
 * `(sessionId, promptId)` overwrites the previous response, matching
 * the repository contract.
 */
export function recordResponse(
  db: Database.Database,
  sessionId: string,
  promptId: string,
  response: string,
  options: RecordResponseOptions = {},
): void {
  assertPromptId(promptId);
  assertResponseValue(response);
  recordDiagnosticResponse(db, sessionId, promptId, response, options);
}

/**
 * Resume the latest in-progress session for the learner, returning the
 * first unanswered prompt. When no in-progress session exists, a new
 * one is started; when every prompt has a response, `nextPrompt` is
 * `null` and the caller should move to the completion step.
 */
export function resumeSession(
  db: Database.Database,
  learnerId: string,
): ResumeSessionResult {
  const profile = ensureProfile(db, learnerId);
  const current = findCurrentSession(db, profile.id);
  if (current === null) {
    const created = startDiagnosticSession(
      db,
      profile.id,
      DIAGNOSIS_BLUEPRINT_VERSION,
    );
    return { sessionId: created.id, nextPrompt: PROMPT_SPECS[0] ?? null };
  }
  const responses = listResponsesForSession(db, current.id);
  return {
    sessionId: current.id,
    nextPrompt: firstUnansweredPrompt(responses),
  };
}

/**
 * Mark the session as completed and compute baselines for the entire
 * published foundation graph. Each baseline is upserted with source
 * `diagnosis` so a later manual override can replace it cleanly.
 *
 * `learnerId` is read from the session row rather than passed by the
 * caller; this keeps the contract single-source-of-truth and matches
 * the repository helpers that own session identity.
 */
export function completeSession(
  db: Database.Database,
  sessionId: string,
  options: AssessmentClock = {},
): CompleteSessionResult {
  const sessionRow = db
    .prepare<[string], { readonly learner_id: string }>(
      `SELECT learner_id
         FROM diagnostic_sessions
        WHERE id = ?
        LIMIT 1`,
    )
    .get(sessionId);
  if (sessionRow === undefined) {
    throw new RangeError(`Diagnostic session ${sessionId} not found`);
  }
  completeDiagnosticSession(db, sessionId, options);
  const responses = listResponsesForSession(db, sessionId);
  const packageSnapshot = loadActivePackage(db);
  const upserted: LearnerNodeBaselineRow[] = [];
  const transaction = db.transaction(() => {
    for (const nodeStableId of packageSnapshot.stableIds) {
      const { baseline, confidence } = computeBaselineForNode(
        nodeStableId,
        responses,
      );
      upserted.push(
        upsertBaselineByStableId(
          db,
          sessionRow.learner_id,
          nodeStableId,
          packageSnapshot,
          baseline,
          confidence,
          "diagnosis",
          options,
        ),
      );
    }
  });
  transaction();
  upserted.sort((a, b) =>
    a.nodeId < b.nodeId ? -1 : a.nodeId > b.nodeId ? 1 : 0
  );
  return { baselines: upserted };
}

/**
 * Persist a learner-driven starting-point override. Every published
 * node that precedes `nodeId` in `order_index` is treated as a strict
 * prerequisite and upserted as `ready / low / manual_override`; the
 * node itself is upserted as
 * `needs_foundation / medium / manual_override`. The override path
 * never touches the ability tables and never rewrites graph edges.
 *
 * The override uses an `order_index`-based prerequisite definition
 * rather than the graph closure because the V0 diagnostic blueprint
 * groups the published nodes into six self-report prompts whose
 * boundaries fall on the prompt boundaries (1–2, 3–4, 5, 6, 7–10,
 * 11–12). Choosing node X means "I have mastered everything before
 * X" regardless of whether explicit graph edges cross the prompt
 * boundaries. The function still relies on `knowledge_nodes` so a
 * missing or draft node throws `RangeError`.
 *
 * `nodeId` is the `knowledge_nodes.stable_id`. The function scans the
 * most-recently installed curriculum package and throws `RangeError`
 * when the node is missing or not `published`.
 */
export function applyStartingNodeOverride(
  db: Database.Database,
  learnerId: string,
  nodeId: string,
  options: AssessmentClock = {},
): OverrideResult {
  if (nodeId.length === 0) {
    throw new RangeError("nodeId must not be empty");
  }
  const profile = ensureProfile(db, learnerId);
  const packageSnapshot = loadActivePackage(db);
  const targetNode = packageSnapshot.nodes.find(
    (node) => node.stable_id === nodeId,
  );
  if (targetNode === undefined) {
    throw new RangeError(
      `Starting-node override requires a published node '${nodeId}'`,
    );
  }
  if (targetNode.status !== "published") {
    throw new RangeError(
      `Starting-node override requires a published node '${nodeId}'`,
    );
  }
  // Order-index prerequisite semantics: every published node whose
  // `order_index` is strictly less than the target is treated as a
  // prerequisite. The published set is already filtered by the
  // repository, so the filter on `order_index` is enough.
  const prerequisiteIds = packageSnapshot.nodes
    .filter((node) => node.order_index < targetNode.order_index)
    .map((node) => node.stable_id)
    .sort();
  const upserted: LearnerNodeBaselineRow[] = [];
  const transaction = db.transaction(() => {
    for (const prereqId of prerequisiteIds) {
      upserted.push(
        upsertBaselineByStableId(
          db,
          profile.id,
          prereqId,
          packageSnapshot,
          "ready",
          "low",
          "manual_override",
          options,
        ),
      );
    }
    upserted.push(
      upsertBaselineByStableId(
        db,
        profile.id,
        nodeId,
        packageSnapshot,
        "needs_foundation",
        "medium",
        "manual_override",
        options,
      ),
    );
  });
  transaction();
  upserted.sort((a, b) =>
    a.nodeId < b.nodeId ? -1 : a.nodeId > b.nodeId ? 1 : 0
  );
  return { baselines: upserted };
}

/**
 * Convenience wrapper that mirrors the existing repository export but
 * lives on the service surface so callers never import the repository
 * directly. The returned baselines use stable ids at the API
 * boundary.
 */
export function listLearnerBaselines(
  db: Database.Database,
  learnerId: string,
): readonly LearnerNodeBaselineRow[] {
  const profile = ensureProfile(db, learnerId);
  const packageSnapshot = loadActivePackage(db);
  const stored = listBaselines(db, profile.id);
  return stored
    .map((row) => ({
      ...row,
      nodeId: packageSnapshot.stableIdByRowId.get(row.nodeId) ?? row.nodeId,
    }))
    .sort((a, b) =>
      a.nodeId < b.nodeId ? -1 : a.nodeId > b.nodeId ? 1 : 0
    );
}

/**
 * Re-export of the schema enums for API layers that want a single
 * import for the diagnosis domain. The exports are read-only; callers
 * MUST NOT use them to bypass the service-layer validation.
 */
export {
  BaselineConfidenceSchema,
  BaselineLevelSchema,
  BaselineSourceSchema,
  DiagnosticResponseValueSchema,
};