import type Database from "better-sqlite3";
import { correctAttempt, voidAttempt } from "@/lib/services/attemptCorrections";
import { PROJECTOR_VERSION, projectAbility } from "@/lib/services/abilityProjector";
import {
  insertAbilityTransition,
  listAttemptNodeMappings,
  upsertAbilitySnapshot,
} from "@/lib/repositories/ability";
import type { AbilitySnapshotRow } from "@/lib/domain/ability";
import {
  findActivePlan,
  findLatestDailySnapshot,
} from "@/lib/repositories/plans";
import { LOCAL_DEFAULT_LEARNER_ID } from "@/lib/domain/learner";
import { regenerateDailyPlan } from "@/lib/services/planRegeneration";

/**
 * V0 correction / void reprojection wrapper (Todo 16).
 *
 * The wrapper sits between the existing correction/void API routes and
 * the lower-level `correctAttempt` / `voidAttempt` services. The
 * `attempt_*` mutation functions remain unchanged; this module owns the
 * additional responsibility of replaying mapped-node ability inside the
 * same outer transaction so the attempt row, the attempt_node_mappings
 * view, the resulting `ability_snapshots` / `ability_transitions` rows,
 * and the `plan_revision_events` audit trail commit or roll back
 * together.
 *
 * Rules:
 *   - The mutation runs inside one outer SQLite transaction; on any
 *     failure the entire replay is rolled back.
 *   - `attempt_voided` replays of an already-voided attempt short-circuit
 *     before the projector runs and emit zero transitions.
 *   - Unmapped attempts (no rows in `attempt_node_mappings`) return
 *     `{ ok: true, affectedNodes: [], transitionsEmitted: [] }` and do
 *     not write any ability state.
 *   - The projector runs across every active mapping for the learner,
 *     not just the affected attempt's mapping row, so an unrelated
 *     mapped attempt on the same node can still contribute when the
 *     corrected attempt is voided out.
 *   - The SQL UNIQUE constraint on
 *     `(learner_id, node_id, input_fingerprint, projection_version)`
 *     guarantees idempotent replay; the repository surfaces a duplicate
 *     insert as a typed `RangeError`, which the wrapper swallows as a
 *     no-op transition.
 */

export type ReprojectTrigger = "attempt_corrected" | "attempt_voided";

export type ReprojectRequest = {
  readonly learnerId: string;
  readonly attemptId: string;
  readonly trigger: ReprojectTrigger;
  readonly now?: string;
};

export type ReprojectResult = {
  readonly ok: true;
  readonly replayed: boolean;
  readonly affectedNodes: readonly string[];
  readonly transitionsEmitted: readonly string[];
  readonly fingerprint: string;
};

export type ReprojectionWrapperOptions = {
  readonly now?: () => string;
};

type PreviousSnapshot = {
  readonly visibleLevel: AbilitySnapshotRow["visible_level"];
  readonly confidence: AbilitySnapshotRow["confidence"];
  readonly evidenceCount: AbilitySnapshotRow["evidence_count"];
};

function isVoidReplayResult(value: unknown): value is { readonly replayed: boolean } {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as { readonly replayed?: unknown };
  return candidate.replayed === true;
}

function loadPreviousSnapshots(
  db: Database.Database,
  learnerId: string,
): ReadonlyMap<string, PreviousSnapshot> {
  type Row = {
    readonly node_id: string;
    readonly visible_level: string;
    readonly confidence: string;
    readonly evidence_count: number;
  };
  const map = new Map<string, PreviousSnapshot>();
  const rows = db
    .prepare<[string], Row>(
      `SELECT node_id, visible_level, confidence, evidence_count
         FROM ability_snapshots
        WHERE learner_id = ?
        ORDER BY node_id ASC`,
    )
    .all(learnerId);
  for (const row of rows) {
    map.set(row.node_id, {
      visibleLevel: row.visible_level as AbilitySnapshotRow["visible_level"],
      confidence: row.confidence as AbilitySnapshotRow["confidence"],
      evidenceCount: row.evidence_count,
    });
  }
  return map;
}

const EMPTY_REPROJECT_RESULT: ReprojectResult = {
  ok: true,
  replayed: false,
  affectedNodes: [],
  transitionsEmitted: [],
  fingerprint: "",
};

function reprojectAfterCorrectionInternal(
  db: Database.Database,
  request: ReprojectRequest,
): ReprojectResult {
  const now = request.now ?? new Date().toISOString();

  const mappingRows = listAttemptNodeMappings(db, request.learnerId);
  const attemptNodeIds = listAttemptNodeIdsRegardlessOfVoid(
    db,
    request.attemptId,
  );

  if (attemptNodeIds.length === 0) {
    return EMPTY_REPROJECT_RESULT;
  }

  const nodeIdSet = new Set<string>(attemptNodeIds);
  for (const entry of mappingRows) {
    nodeIdSet.add(entry.mapping.node_id);
  }
  const previousSnapshots = loadPreviousSnapshots(db, request.learnerId);
  for (const nodeId of previousSnapshots.keys()) {
    nodeIdSet.add(nodeId);
  }
  const nodeIds = [...nodeIdSet].sort();

  const projection = projectAbility({
    learnerId: request.learnerId,
    mappings: mappingRows,
    nodeIds,
    previousSnapshots,
    now,
  });

  const affectedNodes = [...nodeIdSet].sort();
  const transitionsEmitted: string[] = [];

  for (const nodeId of affectedNodes) {
    const projectionRow = projection.perNode.get(nodeId);
    if (projectionRow === undefined) continue;
    upsertAbilitySnapshot(db, {
      learner_id: request.learnerId,
      node_id: nodeId,
      visible_level: projectionRow.visibleLevel,
      confidence: projectionRow.confidence,
      evidence_count: projectionRow.evidenceCount,
      stale: projectionRow.stale,
      input_fingerprint: projection.inputFingerprint,
      projection_version: PROJECTOR_VERSION,
      as_of_time: now,
    });
  }

  for (const transition of projection.transitions) {
    try {
      const inserted = insertAbilityTransition(db, {
        learner_id: request.learnerId,
        node_id: transition.nodeId,
        previous_level: transition.previousLevel,
        new_level: transition.newLevel,
        reason_codes: transition.reasonCodes,
        source_attempt_ids: transition.sourceAttemptIds,
        source_attempt_revisions: transition.sourceAttemptRevisions,
        input_fingerprint: projection.inputFingerprint,
        projection_version: PROJECTOR_VERSION,
        created_at: now,
      });
      transitionsEmitted.push(inserted.id);
    } catch (error) {
      if (
        error instanceof RangeError
        && /already exists/.test(error.message)
      ) {
        continue;
      }
      throw error;
    }
  }

  const activePlan = findActivePlan(db, request.learnerId);
  if (activePlan !== null) {
    const latestSnapshot = findLatestDailySnapshot(db, activePlan.id);
    if (latestSnapshot !== null) {
      regenerateDailyPlan(db, {
        learnerId: request.learnerId,
        learningPlanId: activePlan.id,
        beforeSnapshotId: latestSnapshot.id,
        localDate: latestSnapshot.localDate,
        effortBoundaryMinutes: latestSnapshot.effortBoundaryMinutes,
        dailyMode: latestSnapshot.dailyMode,
        eventType: request.trigger,
        inputFingerprint: projection.inputFingerprint,
        now,
      });
    }
  }

  return {
    ok: true,
    replayed: false,
    affectedNodes,
    transitionsEmitted,
    fingerprint: projection.inputFingerprint,
  };
}

/**
 * Replay mapped-node ability after a correction or void.
 *
 * This is the public async entry point. The implementation is fully
 * synchronous because better-sqlite3 transactions are synchronous; the
 * Promise return type mirrors the wrapping `wrapWithReprojection`
 * helper and lets route handlers `await` the result without coupling
 * to SQLite's runtime.
 */
export async function reprojectAfterCorrection(
  db: Database.Database,
  request: ReprojectRequest,
): Promise<ReprojectResult> {
  return reprojectAfterCorrectionInternal(db, request);
}

/**
 * Wrap a mutation function so it runs inside one outer transaction that
 * also performs mapped-node ability reprojection for the given attempt.
 *
 * On any error thrown by `mutationFn` (for example a
 * `correctAttempt` revision conflict or a `voidAttempt` revision
 * mismatch) the outer transaction rolls back and the reprojection is
 * never persisted. When `trigger === 'attempt_voided'` and
 * `mutationFn()` returns `{ replayed: true }` the wrapper short-circuits
 * the reprojection: the attempt is already voided, nothing changed, and
 * no new ability transition or revision event is emitted.
 */
export async function wrapWithReprojection<T>(
  db: Database.Database,
  trigger: ReprojectTrigger,
  mutationFn: () => T,
  learnerId: string,
  attemptId: string,
  options: ReprojectionWrapperOptions = {},
): Promise<T> {
  const transaction = db.transaction((): T => {
    const result = mutationFn();
    if (trigger === "attempt_voided" && isVoidReplayResult(result)) {
      return result;
    }
    const now = (options.now ?? (() => new Date().toISOString()))();
    reprojectAfterCorrectionInternal(db, {
      learnerId,
      attemptId,
      trigger,
      now,
    });
    return result;
  });
  return transaction();
}

/**
 * Convenience wrapper that performs `correctAttempt` and the reprojection
 * in a single outer transaction. Route handlers can replace the current
 * direct call to `correctAttempt` with this helper without changing
 * their error handling — the thrown errors (`AttemptNotFoundError`,
 * `AttemptRevisionConflictError`, `AttemptCorrectionValidationError`)
 * remain the original types from `attemptCorrections`.
 */
export async function correctAttemptWithReprojection(
  db: Database.Database,
  attemptId: string,
  request: Parameters<typeof correctAttempt>[2],
  options: ReprojectionWrapperOptions = {},
): Promise<ReturnType<typeof correctAttempt>> {
  const learnerId = resolveLearnerIdFromAttempt(db, attemptId);
  return wrapWithReprojection(
    db,
    "attempt_corrected",
    () =>
      correctAttempt(
        db,
        attemptId,
        request,
        optionsToMutationOptions(options),
      ),
    learnerId,
    attemptId,
    options,
  );
}

/**
 * Convenience wrapper that performs `voidAttempt` and the reprojection
 * in a single outer transaction. The existing `VoidAttemptResult`
 * (`{ attempt, replayed }`) is returned unchanged so API layers keep
 * their `{ replayed: true }` semantics on already-void replays.
 */
export async function voidAttemptWithReprojection(
  db: Database.Database,
  attemptId: string,
  request: Parameters<typeof voidAttempt>[2],
  options: ReprojectionWrapperOptions = {},
): Promise<ReturnType<typeof voidAttempt>> {
  const learnerId = resolveLearnerIdFromAttempt(db, attemptId);
  return wrapWithReprojection(
    db,
    "attempt_voided",
    () =>
      voidAttempt(
        db,
        attemptId,
        request,
        optionsToMutationOptions(options),
      ),
    learnerId,
    attemptId,
    options,
  );
}

function optionsToMutationOptions(
  options: ReprojectionWrapperOptions,
): { readonly now?: () => string } {
  return options.now === undefined ? {} : { now: options.now };
}

function resolveLearnerIdFromAttempt(
  db: Database.Database,
  attemptId: string,
): string {
  void db;
  void attemptId;
  return LOCAL_DEFAULT_LEARNER_ID;
}

/**
 * Return the node ids mapped to the given attempt without filtering on
 * the attempt's voided state. The reprojection wrapper needs to know
 * which nodes this attempt was tied to even when the attempt has just
 * been voided inside the same outer transaction — `listAttemptNodeMappings`
 * filters voided attempts at the join, so it cannot answer that question
 * for an attempt that was voided by the wrapped mutation.
 */
function listAttemptNodeIdsRegardlessOfVoid(
  db: Database.Database,
  attemptId: string,
): readonly string[] {
  type Row = { readonly node_id: string };
  return db
    .prepare<[string], Row>(
      `SELECT node_id
         FROM attempt_node_mappings
        WHERE attempt_id = ?
        ORDER BY node_id ASC`,
    )
    .all(attemptId)
    .map((row) => row.node_id);
}
