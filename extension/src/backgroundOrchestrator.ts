/**
 * Background Orchestrator (Phase A Task A8).
 *
 * The orchestrator owns the data plane of the capture extension. It is the
 * single mutation entry: every event that affects durable storage, transient
 * session evidence, or the outbox/quarantine/confirmed state machine flows
 * through `apply`. `install` runs the V4 split initialization once; `snapshot`
 * rebuilds a frozen {@link OrchestratorState} from current storage.
 *
 * Design contract (matches the master plan sections 11-15):
 *
 * 1. No `chrome.*` references; all storage access flows through the injected
 *    {@link ExtensionInitializationStorageSplit} interface so the orchestrator
 *    is unit-testable with an in-memory storage spy.
 * 2. All side effects are returned through the {@link OrchestratorEffects}
 *    `persistence` diff and `executorSchedule` list. The background owns the
 *    actual write/remove/executor wiring, so the orchestrator never reaches
 *    into chrome.storage directly.
 * 3. Historical V3 bundles remain readable and deliverable, but no event can
 *    create or consume click-derived pending intent. Upgrade initialization
 *    removes the legacy key before the orchestrator accepts events.
 * 4. E0 UI hints, E1 lifecycles, ambiguity diagnostics, and unmatched finals
 *    use the existing `transientEvidenceStorage` / `uiHint` parsers; the
 *    orchestrator never invents a new evidence boundary.
 * 5. `snapshot` is pure-read; it never writes to storage. The background
 *    caches the latest snapshot so popup reads are O(1).
 */

import {
  isCaptureOutboxItem,
  isCaptureQuarantineItem,
  type CaptureOutboxItem,
  type CaptureQuarantineItem,
} from "./attemptStorage";
import {
  safeStoredCaptureError,
  sanitizeCaptureOutboxRecords,
  sanitizeCaptureQuarantineRecords,
} from "./captureErrorPrivacy";
import {
  deleteQuarantined,
  retryQuarantined,
} from "./attemptStorage";
import type {
  ConfirmedSubmissionRecord,
  ConfirmedSubmissionTombstone,
} from "./confirmedSubmissionStorage";
import {
  markConfirmedSubmissionFinalized,
  readConfirmedSubmissionState,
  recordConfirmedSubmission,
} from "./confirmedSubmissionStorage";
import {
  pruneUiHints,
  readStoredUiHints,
  retainUiHint,
  type StoredUiHint,
  type UiHintDraft,
} from "./uiHint";
import type { E1RequestObserved, E2SubmissionConfirmed, E3FinalVerdictConfirmed } from "./evidence";
import {
  createCaptureStateMachineState,
  reduceCaptureState,
} from "./captureStateMachine";
import type {
  AmbiguousCaptureResult,
  CorrelatedCaptureResult,
  NoMatchCaptureResult,
  RejectedCaptureResult,
} from "./captureStateMachine";
import type { MainBridgeSummary } from "./submissionCorrelator";
import {
  isSubmitEpochDiagnostic,
  type SubmitEpochDiagnostic,
} from "./submitEpochControl";
import {
  retryAllCaptureStorageUpdate,
} from "./outboxDrain";
import {
  createDiagnostic,
  pruneTransientSessionEvidence,
  readTransientSessionEvidenceState,
  type TransientAmbiguityDiagnostic,
  type TransientAmbiguityDiagnosticIdentity,
  type TransientE1Lifecycle,
  type TransientPageContext,
  type TransientSessionEvidenceState,
  type TransientUnmatchedFinal,
  type TransientVerdictCandidate,
} from "./transientEvidenceStorage";
import {
  reconcileVerdictCandidates,
  type VerdictCandidateResolution,
  type VerdictCandidateTerminal,
} from "./verdictCandidateCoordinator";
import {
  extensionInitializationLocalStorage,
  extensionInitializationSessionStorage,
  planExtensionInitialization,
  type ExtensionInitializationPlan,
  type ExtensionInitializationStorageSplit,
} from "./installation";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const LOCAL_KEYS = [
  "installationId",
  "captureCredential",
  "captureCredentialVersion",
  "captureEnabled",
  "captureEndpoint",
  "captureProtocolVersion",
  "confirmedSubmissions",
  "confirmedSubmissionTombstones",
  "captureOutbox",
  "captureQuarantine",
  "lastCaptureError",
  "lastSuccessfulCaptureAt",
  "lastDeliveredAttemptId",
  "lastDeliveredAttemptStatus",
  "pairedAt",
  "discardedPreBundleEventCount",
  "preBundleQueueDiscardedAt",
  "v4ClickIntentMigration",
  "pendingSubmissionIntents",
  "eventQueue",
  "outbox",
  "quarantine",
] as const;

const SESSION_KEYS = [
  "uiHints",
  "transientE1",
  "transientPageContexts",
  "transientUnmatchedE3",
  "transientVerdictCandidates",
  "transientAmbiguityDiagnostics",
] as const;

const FLUSH_OUTBOX_WORK_ID = "flush_outbox";

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export type OrchestratorProvenanceLevel = "extension_paired" | "extension_unpaired";

export type OrchestratorUserAction =
  | { readonly type: "SET_CAPTURE_ENABLED"; readonly enabled: boolean }
  | { readonly type: "RETRY_CAPTURE_OUTBOX" }
  | { readonly type: "CLEAR_CAPTURE_OUTBOX" }
  | { readonly type: "CLEAR_CAPTURE_QUARANTINE" }
  | { readonly type: "RETRY_QUARANTINED_CAPTURE"; readonly id: string }
  | {
      readonly type: "DELETE_QUARANTINED_CAPTURE";
      readonly id: string;
      readonly malformed?: boolean;
    };

export type OrchestratorEvent =
  | {
      readonly kind: "submit_epoch_diagnostic";
      readonly reason: SubmitEpochDiagnostic;
    }
  | {
      readonly kind: "e1_recorded";
      readonly evidence: E1RequestObserved;
      readonly tabId: number;
      readonly frameId: number;
      readonly documentId: string;
      readonly adapterVersion: string;
    }
  | {
      readonly kind: "main_bridge_correlated";
      readonly correlated: CorrelatedCaptureResult;
      readonly summary: MainBridgeSummary;
      readonly tabId: number;
      readonly frameId: number;
      readonly documentId: string;
    }
  | {
      readonly kind: "e2_recorded";
      readonly evidence: E2SubmissionConfirmed;
      readonly matchedSubmitRequestId: string;
    }
  | {
      readonly kind: "e3_recorded";
      readonly evidence: E3FinalVerdictConfirmed;
      readonly candidateId?: string;
    }
  | {
      readonly kind: "verdict_candidate_recorded";
      readonly candidate: TransientVerdictCandidate;
    }
  | {
      readonly kind: "verdict_candidate_blocked";
      readonly candidateId: string;
      readonly platform: "leetcode";
      readonly problemExternalId: string;
    }
  | { readonly kind: "main_bridge_ambiguous"; readonly ambiguous: AmbiguousCaptureResult }
  | { readonly kind: "main_bridge_no_match"; readonly noMatch: NoMatchCaptureResult; readonly summary: MainBridgeSummary }
  | { readonly kind: "main_bridge_rejected"; readonly rejected: RejectedCaptureResult; readonly summary: MainBridgeSummary }
  | {
      readonly kind: "e0_recorded";
      readonly hint: UiHintDraft;
      readonly sourceDocumentId?: string;
    }
  | { readonly kind: "user_action"; readonly action: OrchestratorUserAction };

export type OrchestratorState = Readonly<{
  readonly installationId: string;
  readonly captureEnabled: boolean;
  readonly captureEndpoint: string;
  readonly captureCredentialVersion?: number;
  readonly provenanceLevel: OrchestratorProvenanceLevel;
  readonly waiting: boolean;
  readonly waitingCount: number;
  readonly sessionCount: number;
  readonly finalizedCount: number;
  readonly outboxCount: number;
  readonly quarantineCount: number;
  readonly lastCaptureError?: string;
  readonly lastSuccessfulCaptureAt?: string;
  readonly lastDeliveredAttemptId?: string;
  readonly lastDeliveredAttemptStatus?: string;
  readonly e0HintCount: number;
  readonly e1LifecycleCount: number;
  readonly ambiguityCount: number;
  readonly migrationRemovedActiveIntentCount: number;
  readonly quarantineDetails: readonly OrchestratorQuarantineDetail[];
}>;

export type OrchestratorQuarantineDetail = Readonly<{
  readonly summary: string;
  readonly retryable: boolean;
  readonly deletable: boolean;
  readonly malformed?: boolean;
  readonly id?: string;
}>;

export type OrchestratorPersistence = Readonly<{
  readonly local: ReadonlyArray<{ readonly key: string; readonly value: unknown }>;
  readonly localRemovals: readonly string[];
  readonly session: ReadonlyArray<{ readonly key: string; readonly value: unknown }>;
  readonly sessionRemovals: readonly string[];
  readonly outbox: ReadonlyArray<CaptureOutboxItem>;
  readonly quarantine: ReadonlyArray<CaptureQuarantineItem>;
  readonly confirmed: ReadonlyArray<ConfirmedSubmissionRecord>;
  readonly tombstones: ReadonlyArray<ConfirmedSubmissionTombstone>;
  readonly e0Hints: ReadonlyArray<StoredUiHint>;
  readonly transientE1: ReadonlyArray<TransientE1Lifecycle>;
  readonly pageContexts: ReadonlyArray<TransientPageContext>;
  readonly unmatchedFinals: ReadonlyArray<TransientUnmatchedFinal>;
  readonly verdictCandidates: ReadonlyArray<TransientVerdictCandidate>;
  readonly ambiguityDiagnostics: ReadonlyArray<TransientAmbiguityDiagnostic>;
}>;

export type OrchestratorEffects = Readonly<{
  readonly state: OrchestratorState;
  readonly persistence: OrchestratorPersistence;
  readonly executorSchedule: ReadonlyArray<{ readonly id: string; readonly work: () => Promise<void> }>;
  readonly verdictCandidateResolutions: readonly VerdictCandidateResolution[];
}>;

/**
 * Apply the data-plane storage diff in the same order used by initialization:
 * authoritative local/session writes first, then legacy cleanup. Keeping the
 * ordering here makes the background side-effect boundary directly testable.
 */
export async function applyOrchestratorPersistence(
  storage: ExtensionInitializationStorageSplit,
  persistence: OrchestratorPersistence,
): Promise<void> {
  const localItems: Record<string, unknown> = {};
  for (const write of persistence.local) localItems[write.key] = write.value;
  if (Object.keys(localItems).length > 0) await storage.local.set(localItems);

  const sessionItems: Record<string, unknown> = {};
  for (const write of persistence.session) sessionItems[write.key] = write.value;
  if (Object.keys(sessionItems).length > 0) await storage.session.set(sessionItems);

  for (const key of persistence.localRemovals) await storage.local.remove(key);
  for (const key of persistence.sessionRemovals) await storage.session.remove(key);
}

export type Orchestrator = Readonly<{
  readonly apply: (event: OrchestratorEvent) => Promise<OrchestratorEffects>;
  readonly snapshot: () => Promise<OrchestratorState>;
  readonly install: () => Promise<OrchestratorEffects>;
  /**
   * Recompute the pruned session state against `now` and return an effects
   * shape describing only the surviving slices. The background calls this on
   * the idle UI hint cleanup alarm so the bounded E0/E1 slices age out even
   * when no orchestrator event has fired.
   */
  readonly pruneOrchestratorSession: (now: string) => Promise<OrchestratorEffects>;
}>;

export type OrchestratorDependencies = Readonly<{
  readonly storage: ExtensionInitializationStorageSplit;
  readonly now: () => string;
  readonly flushOutbox: () => Promise<void>;
}>;

// ---------------------------------------------------------------------------
// Storage parsers (defensive; unknown storage must never produce state)
// ---------------------------------------------------------------------------

function readOutbox(value: unknown): readonly CaptureOutboxItem[] {
  return Array.isArray(value) ? value.filter(isCaptureOutboxItem) : [];
}

function readQuarantine(value: unknown): readonly CaptureQuarantineItem[] {
  return Array.isArray(value) ? value.filter(isCaptureQuarantineItem) : [];
}

export function readMalformedQuarantineRecords(value: unknown): readonly unknown[] {
  return Array.isArray(value) ? value.filter((item) => !isCaptureQuarantineItem(item)) : [];
}

export function readMalformedOutboxRecords(value: unknown): readonly unknown[] {
  return Array.isArray(value) ? value.filter((item) => !isCaptureOutboxItem(item)) : [];
}

function readMalformedQuarantineDetails(
  value: unknown,
): readonly OrchestratorQuarantineDetail[] {
  return readMalformedQuarantineRecords(value).map(malformedQuarantineDetail);
}

function malformedQuarantineDetail(value: unknown): OrchestratorQuarantineDetail {
  if (typeof value !== "object" || value === null) {
    return {
      summary: "? · ? · malformed quarantine record",
      retryable: false,
      deletable: false,
      malformed: true,
    };
  }
  const id = readNonemptyString(Reflect.get(value, "id"));
  const error = safeStoredCaptureError(Reflect.get(value, "error")) ?? "malformed retained bundle";
  return {
    summary: `? · ? · malformed quarantine bundle · ${id ?? "?"} · ${error}`,
    retryable: false,
    deletable: id !== undefined,
    malformed: true,
    ...(id === undefined ? {} : { id }),
  };
}

function readNonemptyString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function readPositiveInteger(value: unknown): number | undefined {
  return typeof value === "number" && Number.isInteger(value) && value > 0 ? value : undefined;
}

function readMigrationRemovedCount(value: unknown): number {
  if (typeof value !== "object" || value === null) return 0;
  if (!("removedActiveIntentCount" in value)) return 0;
  const count = Reflect.get(value, "removedActiveIntentCount");
  return typeof count === "number" && Number.isInteger(count) && count >= 0 ? count : 0;
}

// ---------------------------------------------------------------------------
// State derivation
// ---------------------------------------------------------------------------

function deriveState(
  local: Record<string, unknown>,
  session: Record<string, unknown>,
): OrchestratorState {
  const installationId = readNonemptyString(local.installationId) ?? "";
  const captureEnabled = local.captureEnabled !== false;
  const captureEndpoint = typeof local.captureEndpoint === "string" && local.captureEndpoint.length > 0
    ? local.captureEndpoint
    : "http://localhost:3000/api/capture/events";
  const captureCredentialVersion = readPositiveInteger(local.captureCredentialVersion);
  const captureCredential = readNonemptyString(local.captureCredential);
  const provenanceLevel: OrchestratorProvenanceLevel = captureCredential === undefined
    ? "extension_unpaired"
    : "extension_paired";

  const outbox = readOutbox(local.captureOutbox);
  const malformedOutbox = readMalformedOutboxRecords(local.captureOutbox);
  const quarantine = readQuarantine(local.captureQuarantine);
  const malformedQuarantineDetails = readMalformedQuarantineDetails(local.captureQuarantine);
  const confirmedState = readConfirmedSubmissionState(local);
  const confirmed = confirmedState.confirmed;
  const tombstones = confirmedState.tombstones;

  const waitingCount = outbox.length + malformedOutbox.length
    + confirmed.filter((record) => record.finalizedAt === undefined).length;
  const outboxCount = outbox.length + malformedOutbox.length;
  const quarantineCount = quarantine.length + malformedQuarantineDetails.length;
  const finalizedCount = tombstones.length;
  const sessionCount = waitingCount + finalizedCount;
  const waiting = waitingCount > 0;

  const transientState = readTransientSessionEvidenceState(session);
  const e0Hints = transientState.uiHints;
  const e1List = transientState.requestLifecycles;
  const ambiguityDiags = transientState.ambiguityDiagnostics;

  return deepFreeze({
    installationId,
    captureEnabled,
    captureEndpoint,
    ...(captureCredentialVersion !== undefined ? { captureCredentialVersion } : {}),
    provenanceLevel,
    waiting,
    waitingCount,
    sessionCount,
    finalizedCount,
    outboxCount,
    quarantineCount,
    ...(safeStoredCaptureError(local.lastCaptureError) === undefined
      ? {}
      : { lastCaptureError: safeStoredCaptureError(local.lastCaptureError) as string }),
    ...(readNonemptyString(local.lastSuccessfulCaptureAt) === undefined
      ? {}
      : { lastSuccessfulCaptureAt: readNonemptyString(local.lastSuccessfulCaptureAt) as string }),
    ...(readNonemptyString(local.lastDeliveredAttemptId) === undefined
      ? {}
      : { lastDeliveredAttemptId: readNonemptyString(local.lastDeliveredAttemptId) as string }),
    ...(readNonemptyString(local.lastDeliveredAttemptStatus) === undefined
      ? {}
      : { lastDeliveredAttemptStatus: readNonemptyString(local.lastDeliveredAttemptStatus) as string }),
    e0HintCount: e0Hints.length,
    e1LifecycleCount: e1List.length,
    ambiguityCount: ambiguityDiags.length,
    migrationRemovedActiveIntentCount: readMigrationRemovedCount(local.v4ClickIntentMigration),
    quarantineDetails: [
      ...quarantine.map((item): OrchestratorQuarantineDetail => ({
        id: item.id,
        summary: quarantineDetailLine(item),
        retryable: true,
        deletable: true,
      })),
      ...malformedQuarantineDetails,
      ...malformedOutbox.map(malformedOutboxDetail),
    ],
  });
}

function quarantineDetailLine(item: CaptureQuarantineItem): string {
  const bundle = item.item.bundle;
  const firstEvent = bundle.events[0];
  const verdictEvent = bundle.events[2];
  const verdict = verdictEvent && typeof verdictEvent.payload.verdict === "string"
    ? verdictEvent.payload.verdict
    : undefined;
  return `${firstEvent?.platform ?? "?"} · ${firstEvent?.problemExternalId ?? "?"} · ${verdict ?? "?"} · ${verdictEvent?.occurredAt ?? "?"} · ${safeStoredCaptureError(item.error) ?? "Retained capture error"}`;
}

function malformedOutboxDetail(value: unknown): OrchestratorQuarantineDetail {
  if (typeof value !== "object" || value === null) {
    return {
      summary: "? · ? · malformed outbox record",
      retryable: false,
      deletable: false,
      malformed: true,
    };
  }
  const id = readNonemptyString(Reflect.get(value, "id"));
  return {
    summary: `? · ? · malformed outbox bundle · ${id ?? "?"} · retained without delivery`,
    retryable: false,
    deletable: false,
    malformed: true,
    ...(id === undefined ? {} : { id }),
  };
}

function preserveMalformedQuarantine(
  value: unknown,
  valid: readonly CaptureQuarantineItem[],
): readonly unknown[] {
  return [...valid, ...readMalformedQuarantineRecords(value)];
}

function preserveMalformedOutbox(
  value: unknown,
  valid: readonly CaptureOutboxItem[],
): readonly unknown[] {
  return [...valid, ...readMalformedOutboxRecords(value)];
}

function recordId(value: unknown): string | undefined {
  return typeof value === "object" && value !== null
    ? readNonemptyString(Reflect.get(value, "id"))
    : undefined;
}

// ---------------------------------------------------------------------------
// Event handlers
// ---------------------------------------------------------------------------

type EventOutcome = Readonly<{
  readonly localWrites: ReadonlyArray<{ readonly key: string; readonly value: unknown }>;
  readonly localRemovals: readonly string[];
  readonly sessionWrites: ReadonlyArray<{ readonly key: string; readonly value: unknown }>;
  readonly sessionRemovals: readonly string[];
  readonly scheduleFlush: boolean;
  readonly outbox: readonly CaptureOutboxItem[];
  readonly quarantine: readonly CaptureQuarantineItem[];
  readonly confirmed: readonly ConfirmedSubmissionRecord[];
  readonly tombstones: readonly ConfirmedSubmissionTombstone[];
  readonly verdictCandidateResolutions: readonly VerdictCandidateResolution[];
}>;

function handleEvent(
  event: OrchestratorEvent,
  local: Record<string, unknown>,
  session: Record<string, unknown>,
  now: string,
): EventOutcome {
  switch (event.kind) {
    case "submit_epoch_diagnostic":
      return handleSubmitEpochDiagnostic(event, local, now);
    case "user_action":
      return handleUserAction(event.action, local, now);
    case "e1_recorded":
      return handleE1Recorded(event, local, session, now);
    case "e0_recorded":
      return handleE0Recorded(event, session, now);
    case "main_bridge_correlated":
      return handleMainBridgeCorrelated(event, local, session, now);
    case "e2_recorded":
      return handleE2Recorded(event, local, session, now);
    case "verdict_candidate_recorded":
      return handleVerdictCandidateRecorded(event, local, session, now);
    case "verdict_candidate_blocked":
      return handleVerdictCandidateBlocked(event, local, session, now);
    case "e3_recorded":
      return handleE3Recorded(event, local, session, now);
    case "main_bridge_ambiguous":
      return handleMainBridgeDiagnostic(
        event.ambiguous.summary,
        event.ambiguous.reason,
        event.ambiguous.summary.evidenceId,
        session,
        now,
      );
    case "main_bridge_no_match":
      return handleMainBridgeDiagnostic(
        event.summary,
        "bridge_message_unmatched",
        event.summary.evidenceId,
        session,
        now,
      );
    case "main_bridge_rejected":
      // Dedupe by the summary's actual `evidenceId` (and the other summary
      // identity fields folded in by `handleMainBridgeDiagnostic`). The previous
      // implementation synthesised `${requestId}:${rejectionReason}` which
      // collided when the same bridge summary was rejected for different
      // reasons and fragmented when different summaries shared a requestId.
      return handleMainBridgeDiagnostic(
        event.summary,
        "corrupt_record",
        event.summary.evidenceId,
        session,
        now,
      );
  }
}

function handleSubmitEpochDiagnostic(
  event: Extract<OrchestratorEvent, { readonly kind: "submit_epoch_diagnostic" }>,
  local: Record<string, unknown>,
  now: string,
): EventOutcome {
  // Keep this boundary defensive even though the TypeScript event is closed:
  // a future caller must not be able to persist arbitrary page-derived text.
  const diagnostic = isSubmitEpochDiagnostic(event.reason)
    ? event.reason
    : "epoch_control_malformed";
  const outbox = readOutbox(local.captureOutbox);
  const quarantine = readQuarantine(local.captureQuarantine);
  return makeLocalOutcome(
    { ...local, lastCaptureError: diagnostic },
    local,
    now,
    false,
    outbox,
    quarantine,
  );
}

function handleUserAction(
  action: OrchestratorUserAction,
  local: Record<string, unknown>,
  now: string,
): EventOutcome {
  switch (action.type) {
    case "SET_CAPTURE_ENABLED":
      return makeLocalOutcome(
        { ...local, captureEnabled: action.enabled },
        local,
        now,
        false,
        readOutbox(local.captureOutbox),
        readQuarantine(local.captureQuarantine),
      );
    case "CLEAR_CAPTURE_OUTBOX":
      return clearOutbox(local, now);
    case "CLEAR_CAPTURE_QUARANTINE":
      return clearQuarantine(local, now);
    case "RETRY_CAPTURE_OUTBOX":
      return retryAll(local, now);
    case "RETRY_QUARANTINED_CAPTURE":
      return retryQuarantineEntry(local, action.id, now);
    case "DELETE_QUARANTINED_CAPTURE":
      return deleteQuarantineEntry(local, action.id, now, action.malformed === true);
  }
}

function handleE1Recorded(
  event: Extract<OrchestratorEvent, { readonly kind: "e1_recorded" }>,
  local: Record<string, unknown>,
  session: Record<string, unknown>,
  now: string,
): EventOutcome {
  if (event.evidence.platform !== event.evidence.platform
    || event.evidence.tabId !== event.tabId
    || event.evidence.frameId !== event.frameId
    || event.evidence.documentId !== event.documentId
    || event.evidence.adapterVersion !== event.adapterVersion) {
    return emptyOutcome(now);
  }
  const transient = readTransientSessionEvidenceState(session);
  const prior = transient.requestLifecycles.find((entry) => entry.evidence.requestId === event.evidence.requestId);

  // E1 identity preservation: when the same requestId arrives with a different
  // identity (`platform`/`tabId`/`frameId`/`documentId`/`method`/`endpointKey`/
  // `resourceType`), reject the merge. Only `receivedAt` / `apiTimeStamp` /
  // `statusCode` / `redirectEndpointKey` may update under one requestId. A
  // matched E2 or a recorded `stableSubmissionId` MUST survive this rejection
  // so the later E3 can still correlate.
  if (prior !== undefined && e1IdentityDiffers(prior.evidence, event.evidence)) {
    const isMatched = prior.outcome === "matched" || prior.stableSubmissionId !== null;
    // Always create a fresh lifecycle wrapper, but retain the prior evidence and
    // terminal correlation fields. The incoming record is only a diagnostic;
    // it must never overwrite the evidence that was matched to E2.
    const updatedPrior: TransientE1Lifecycle = Object.freeze({
      ...prior,
      evidence: prior.evidence,
      rejectionReason: isMatched ? prior.rejectionReason : "identity_mismatch",
    });
    const requestLifecycles = transient.requestLifecycles.map((entry) =>
      entry.evidence.requestId === event.evidence.requestId ? updatedPrior : entry);
    // Emit an `ignored` diagnostic so the identity_mismatch is recorded
    // independent of any later merge. The transient storage's closed reason
    // enum has no `identity_mismatch`, so we use the closest existing
    // `corrupt_record` reason (an inbound E1 with mismatched identity
    // under a reused requestId is structurally an untrustworthy record).
    const diagnostic = createDiagnostic("corrupt_record", now, {
      evidenceId: event.evidence.requestId,
      tabId: event.evidence.tabId,
      frameId: event.evidence.frameId,
      documentId: event.evidence.documentId,
      endpointKey: event.evidence.endpointKey,
    });
    const alreadyRecorded = transient.ambiguityDiagnostics.some((existing) =>
      diagnosticMatchesIdentity(existing, "corrupt_record", {
        evidenceId: event.evidence.requestId,
        tabId: event.evidence.tabId,
        frameId: event.evidence.frameId,
        documentId: event.evidence.documentId,
        endpointKey: event.evidence.endpointKey,
      }));
    if (alreadyRecorded) {
      return makeSessionOnlyOutcome({
        ...transient,
        requestLifecycles,
      }, session, now);
    }
    const diagnostics = [...transient.ambiguityDiagnostics, diagnostic].slice(-32);
    return makeSessionOnlyOutcome({
      ...transient,
      requestLifecycles,
      ambiguityDiagnostics: diagnostics,
    }, session, now);
  }

  const mergedEvidence = prior === undefined
    ? Object.freeze({ ...event.evidence })
    : mergeE1Evidence(prior.evidence, event.evidence);
  const priorIsTerminal = prior !== undefined
    && (prior.outcome !== "pending" || prior.stableSubmissionId !== null);
  const incomingIsError = event.evidence.lifecycle === "error_occurred";
  const outcome = priorIsTerminal
    ? prior.outcome
    : incomingIsError ? "error" : prior?.outcome ?? "pending";
  const rejectionReason = priorIsTerminal
    ? prior?.rejectionReason ?? null
    : incomingIsError ? "network_error" : prior?.rejectionReason ?? null;
  const lifecycle: TransientE1Lifecycle = Object.freeze({
    schemaVersion: 1,
    tier: "E1",
    kind: "request_lifecycle",
    evidence: mergedEvidence,
    outcome,
    stableSubmissionId: prior?.stableSubmissionId ?? null,
    rejectionReason,
    receivedAt: prior === undefined
      ? mergedEvidence.receivedAt
      : earlierIsoTime(prior.receivedAt, mergedEvidence.receivedAt),
  });
  const requestLifecycles = [
    ...transient.requestLifecycles.filter((entry) => entry.evidence.requestId !== event.evidence.requestId),
    lifecycle,
  ];
  const legacyCandidates = transient.verdictCandidates.filter(
    (candidate) => candidate.submitRequestId === undefined,
  );
  if (legacyCandidates.length === 0) {
    return makeSessionOnlyOutcome({
      ...transient,
      requestLifecycles,
    }, session, now);
  }
  // E1 visibility is the chronology wake-up for historical request-unbound
  // candidates.  Reconcile only that legacy subset: armed candidates remain
  // untouched (and any resolution they may already have is not discarded).
  const reconciliation = reconcileVerdictCandidates({
    candidates: legacyCandidates,
    requestLifecycles,
    confirmed: readConfirmedSubmissionState(local).confirmed,
    now,
  });
  const terminalCandidateIds = new Set(
    reconciliation.terminal.map((entry) => entry.candidateId),
  );
  const nextSession: TransientSessionEvidenceState = {
    ...transient,
    requestLifecycles,
    verdictCandidates: transient.verdictCandidates.filter(
      (candidate) => !terminalCandidateIds.has(candidate.candidateId),
    ),
  };
  const sessionOutcome = makeSessionOnlyOutcome(nextSession, session, now);
  const terminalDiagnostic = terminalDiagnosticFor(reconciliation.terminal);
  if (terminalDiagnostic === undefined) {
    return {
      ...sessionOutcome,
      verdictCandidateResolutions: [],
    };
  }
  const outbox = readOutbox(local.captureOutbox);
  const quarantine = readQuarantine(local.captureQuarantine);
  const localOutcome = makeLocalOutcome(
    { ...local, lastCaptureError: terminalDiagnostic },
    local,
    now,
    false,
    outbox,
    quarantine,
  );
  return {
    ...localOutcome,
    sessionWrites: sessionOutcome.sessionWrites,
    sessionRemovals: sessionOutcome.sessionRemovals,
    verdictCandidateResolutions: [],
  };
}

/**
 * Merge two lifecycle signals for one requestId using the same ordering and
 * optional-field rules as the A3 submission correlator. `apiTimeStamp` is the
 * primary signal clock; `receivedAt` breaks ties. The background clock keeps
 * the earliest observed timestamp, while lifecycle identity comes from the
 * latest signal.
 */
function mergeE1Evidence(
  existing: E1RequestObserved,
  incoming: E1RequestObserved,
): E1RequestObserved {
  const latest = isIncomingE1SignalLater(existing, incoming) ? incoming : existing;
  const statusCode = pickLatestE1Field(
    existing.statusCode,
    incoming.statusCode,
    existing,
    incoming,
  );
  const redirectEndpointKey = pickLatestE1Field(
    existing.redirectEndpointKey,
    incoming.redirectEndpointKey,
    existing,
    incoming,
  );
  return Object.freeze({
    schemaVersion: 1,
    evidenceId: latest.evidenceId,
    platform: latest.platform,
    tier: "E1",
    kind: "request_observed",
    receivedAt: existing.receivedAt <= incoming.receivedAt ? existing.receivedAt : incoming.receivedAt,
    tabId: latest.tabId,
    frameId: latest.frameId,
    documentId: latest.documentId,
    adapterVersion: latest.adapterVersion,
    requestId: latest.requestId,
    method: latest.method,
    endpointKey: latest.endpointKey,
    resourceType: latest.resourceType,
    lifecycle: latest.lifecycle,
    apiTimeStamp: Math.max(existing.apiTimeStamp, incoming.apiTimeStamp),
    ...(statusCode === undefined ? {} : { statusCode }),
    ...(redirectEndpointKey === undefined ? {} : { redirectEndpointKey }),
  });
}

function isIncomingE1SignalLater(
  existing: E1RequestObserved,
  incoming: E1RequestObserved,
): boolean {
  return incoming.apiTimeStamp > existing.apiTimeStamp
    || (incoming.apiTimeStamp === existing.apiTimeStamp && incoming.receivedAt >= existing.receivedAt);
}

function pickLatestE1Field<T>(
  existing: T | undefined,
  incoming: T | undefined,
  existingEvidence: E1RequestObserved,
  incomingEvidence: E1RequestObserved,
): T | undefined {
  if (existing === undefined) return incoming;
  if (incoming === undefined) return existing;
  return isIncomingE1SignalLater(existingEvidence, incomingEvidence) ? incoming : existing;
}

/**
 * Compare the identity-defining fields of two E1 lifecycles. Returns true when
 * any of `platform`, `tabId`, `frameId`, `documentId`, `method`,
 * `endpointKey`, or `resourceType` differs. `receivedAt` / `apiTimeStamp` /
 * `statusCode` / `redirectEndpointKey` are deliberately excluded because the
 * correlator and orchestrator merge them freely under one requestId.
 */
function e1IdentityDiffers(a: E1RequestObserved, b: E1RequestObserved): boolean {
  return a.platform !== b.platform
    || a.tabId !== b.tabId
    || a.frameId !== b.frameId
    || a.documentId !== b.documentId
    || a.method !== b.method
    || a.endpointKey !== b.endpointKey
    || a.resourceType !== b.resourceType;
}

function handleE0Recorded(
  event: Extract<OrchestratorEvent, { readonly kind: "e0_recorded" }>,
  session: Record<string, unknown>,
  now: string,
): EventOutcome {
  if (event.sourceDocumentId === undefined || event.sourceDocumentId.length === 0) {
    return emptyOutcome(now);
  }
  const current = readStoredUiHints(session.uiHints);
  const pruned = pruneUiHints(current, now);
  const transient = readTransientSessionEvidenceState(session);
  // The visibility seed and the trusted click may both report the same
  // control. Retain exactly one hint per (platform, problem, document)
  // inside the TTL window so NowCoder confirmation never sees two problem
  // candidates for one submission.
  const duplicate = pruned.some((existing) =>
    existing.platform === event.hint.platform
    && existing.problemExternalId === event.hint.problemExternalId
    && existing.sourceDocumentId === event.sourceDocumentId);
  if (duplicate) {
    return makeSessionOnlyOutcome({
      ...transient,
      uiHints: pruned,
    }, session, now);
  }
  const hint: StoredUiHint = { ...event.hint, sourceDocumentId: event.sourceDocumentId };
  const retained = retainUiHint(pruned, hint, now);
  return makeSessionOnlyOutcome({
    ...transient,
    uiHints: retained,
  }, session, now);
}

function handleE2Recorded(
  event: Extract<OrchestratorEvent, { readonly kind: "e2_recorded" }>,
  local: Record<string, unknown>,
  session: Record<string, unknown>,
  now: string,
): EventOutcome {
  const evidence = event.evidence;
  const transient = readTransientSessionEvidenceState(session);
  const confirmationLifecycle = transient.requestLifecycles.find((entry) =>
    entry.evidence.evidenceId === evidence.requestEvidenceId);
  const submitLifecycle = transient.requestLifecycles.find((entry) =>
    entry.evidence.requestId === event.matchedSubmitRequestId);
  if (confirmationLifecycle === undefined || submitLifecycle === undefined
    || confirmationLifecycle.evidence.platform !== evidence.platform
    || confirmationLifecycle.evidence.tabId !== evidence.tabId
    || confirmationLifecycle.evidence.frameId !== evidence.frameId
    || confirmationLifecycle.evidence.documentId !== evidence.documentId
    || submitLifecycle.evidence.platform !== evidence.platform
    || submitLifecycle.evidence.tabId !== evidence.tabId
    || submitLifecycle.evidence.frameId !== evidence.frameId
    || submitLifecycle.evidence.documentId !== evidence.documentId) {
    return emptyOutcome(now);
  }

  const currentConfirmed = readConfirmedSubmissionState(local);
  const record: ConfirmedSubmissionRecord = Object.freeze({
    schemaVersion: 1,
    status: "confirmed",
    platform: evidence.platform,
    problemExternalId: evidence.problemExternalId,
    externalSubmissionId: evidence.externalSubmissionId,
    confirmedAt: evidence.receivedAt,
    storageKey: `${evidence.platform}:${evidence.externalSubmissionId}`,
    lastE3At: evidence.receivedAt,
  });
  const recorded = recordConfirmedSubmission(currentConfirmed, record, now);
  if (recorded.outcome === "already_finalized"
    || recorded.outcome === "identity_conflict") return emptyOutcome(now);

  const stableSubmissionId = `${evidence.platform}:${evidence.externalSubmissionId}`;
  const requestLifecycles = transient.requestLifecycles.map((entry) =>
    entry.evidence.requestId === event.matchedSubmitRequestId
      ? Object.freeze({
        ...entry,
        outcome: "matched" as const,
        stableSubmissionId,
        rejectionReason: null,
      })
      : entry);
  const matchedSession: TransientSessionEvidenceState = { ...transient, requestLifecycles };
  const reconciliation = reconcileVerdictCandidates({
    candidates: matchedSession.verdictCandidates,
    requestLifecycles: matchedSession.requestLifecycles,
    confirmed: recorded.state.confirmed,
    now,
  });
  // A resolved candidate is intentionally NOT consumed here: the background
  // constructs E3 after this apply completes, so the candidate must survive
  // a worker stop between E2 persistence and E3 handling, and `install` must
  // be able to replay the resolution from the retained candidate + confirmed
  // record. Only terminal candidates (whose closed diagnostic is persisted in
  // this same outcome) are removed.
  const terminalCandidateIds = new Set(
    reconciliation.terminal.map((entry) => entry.candidateId),
  );
  const nextSession: TransientSessionEvidenceState = {
    ...matchedSession,
    verdictCandidates: matchedSession.verdictCandidates.filter(
      (candidate) => !terminalCandidateIds.has(candidate.candidateId),
    ),
  };
  const sessionOutcome = makeSessionOnlyOutcome(nextSession, session, now);
  const outbox = readOutbox(local.captureOutbox);
  const quarantine = readQuarantine(local.captureQuarantine);
  const nextLocal: Record<string, unknown> = {
    ...local,
    confirmedSubmissions: recorded.state.confirmed,
    confirmedSubmissionTombstones: recorded.state.tombstones,
  };
  const localOutcome = makeLocalOutcome(nextLocal, local, now, false, outbox, quarantine);
  const replay = transient.unmatchedE3.find((entry) =>
    `${entry.evidence.platform}:${entry.evidence.externalSubmissionId}` === stableSubmissionId);
  if (replay !== undefined) {
    const replayOutcome = handleE3Recorded(
      { kind: "e3_recorded", evidence: replay.evidence },
      nextLocal,
      nextSession,
      now,
    );
    return {
      ...replayOutcome,
      sessionWrites: mergeWrites(sessionOutcome.sessionWrites, replayOutcome.sessionWrites),
      verdictCandidateResolutions: [
        ...reconciliation.resolutions,
        ...replayOutcome.verdictCandidateResolutions,
      ],
    };
  }
  return {
    ...localOutcome,
    sessionWrites: sessionOutcome.sessionWrites,
    sessionRemovals: sessionOutcome.sessionRemovals,
    verdictCandidateResolutions: reconciliation.resolutions,
  };
}

/**
 * Verdict candidate intake. The candidate is appended (deduped by
 * `candidateId`, capped at 32) and reconciled against matched submit
 * lifecycles and confirmed submissions. Exact resolutions are returned for
 * the background to construct adapter E3 evidence; terminal reasons are
 * persisted as a closed `lastCaptureError` diagnostic.
 *
 * Resolved candidates remain in the slice until E3 is recorded (or the
 * submission is already finalized), so a worker stop between E2 persistence
 * and E3 handling can never strand a confirmed submission without a final
 * verdict. Terminal candidates are removed because their closed diagnostic
 * is persisted in the same outcome.
 */
function handleVerdictCandidateRecorded(
  event: Extract<OrchestratorEvent, { readonly kind: "verdict_candidate_recorded" }>,
  local: Record<string, unknown>,
  session: Record<string, unknown>,
  now: string,
): EventOutcome {
  const transient = readTransientSessionEvidenceState(session);
  const deduped = transient.verdictCandidates.filter(
    (candidate) => candidate.candidateId !== event.candidate.candidateId,
  );
  const appended = [...deduped, event.candidate].slice(-32);
  const confirmedState = readConfirmedSubmissionState(local);
  const reconciliation = reconcileVerdictCandidates({
    candidates: appended,
    requestLifecycles: transient.requestLifecycles,
    confirmed: confirmedState.confirmed,
    now,
  });
  const terminalCandidateIds = new Set(
    reconciliation.terminal.map((entry) => entry.candidateId),
  );
  const nextSession: TransientSessionEvidenceState = {
    ...transient,
    verdictCandidates: appended.filter(
      (candidate) => !terminalCandidateIds.has(candidate.candidateId),
    ),
  };
  const sessionOutcome = makeSessionOnlyOutcome(nextSession, session, now);
  const terminalDiagnostic = terminalDiagnosticFor(reconciliation.terminal);
  if (terminalDiagnostic === undefined) {
    return {
      ...sessionOutcome,
      verdictCandidateResolutions: reconciliation.resolutions,
    };
  }
  const outbox = readOutbox(local.captureOutbox);
  const quarantine = readQuarantine(local.captureQuarantine);
  const nextLocal: Record<string, unknown> = {
    ...local,
    lastCaptureError: terminalDiagnostic,
  };
  const localOutcome = makeLocalOutcome(nextLocal, local, now, false, outbox, quarantine);
  return {
    ...localOutcome,
    sessionWrites: sessionOutcome.sessionWrites,
    sessionRemovals: sessionOutcome.sessionRemovals,
    verdictCandidateResolutions: reconciliation.resolutions,
  };
}

/**
 * Closed one-line diagnostic for a terminal verdict candidate. The reason is
 * narrowed from the coordinator's four reasons to the allowed capture-error
 * allowlist (Task 8). Identity-sensitive fields (submission/document/tab/
 * request id, timestamps, URL, verdict text) never enter the diagnostic.
 */
/**
 * Closed diagnostic for verdict candidates that a TTL prune removed before
 * any later reconciliation could observe them. `reconcileVerdictCandidates`
 * is the single source of truth for expiry, so the removed candidates are
 * reconciled once against the surviving lifecycles; any candidate classified
 * expired (or another terminal reason) this way is surfaced through the same
 * `lastCaptureError` channel instead of disappearing silently.
 */
function terminalDiagnosticForRemovedCandidates(
  prior: readonly TransientVerdictCandidate[],
  pruned: readonly TransientVerdictCandidate[],
  requestLifecycles: readonly TransientE1Lifecycle[],
  confirmed: readonly ConfirmedSubmissionRecord[],
  now: string,
): string | undefined {
  const removedIds = new Set(
    prior.map((candidate) => candidate.candidateId),
  );
  for (const retained of pruned) removedIds.delete(retained.candidateId);
  if (removedIds.size === 0) return undefined;
  const removed = prior.filter((candidate) => removedIds.has(candidate.candidateId));
  const reconciliation = reconcileVerdictCandidates({
    candidates: removed,
    requestLifecycles,
    confirmed,
    now,
  });
  return terminalDiagnosticFor(reconciliation.terminal);
}

function terminalDiagnosticFor(
  terminal: readonly VerdictCandidateTerminal[],
): string | undefined {
  const last = terminal[terminal.length - 1];
  if (last === undefined) return undefined;
  return reasonForTerminal(last.reason);
}

function reasonForTerminal(
  reason: VerdictCandidateTerminal["reason"],
): string {
  switch (reason) {
    case "ambiguous_latest_submit":
      return "epoch_identity_conflict";
    case "identity_mismatch":
      return "epoch_identity_conflict";
    case "chronology_mismatch":
      return "verdict_candidate_chronology_mismatch";
    case "expired":
      return "epoch_started_missing";
    case "adapter":
      return "verdict_candidate_adapter_rejected";
  }
}

/**
 * Adapter-failure terminal event. The background routes a resolution whose
 * E3 construction failed through this event so the closed `lastCaptureError`
 * diagnostic and the candidate removal share the single orchestrator
 * persistence path (Task 8 review fix). The candidate is consumed only here,
 * in `handleE3Recorded` success/tombstone paths, and by the terminal
 * diagnostic persisted in intake outcomes.
 */
function handleVerdictCandidateBlocked(
  event: Extract<OrchestratorEvent, { readonly kind: "verdict_candidate_blocked" }>,
  local: Record<string, unknown>,
  session: Record<string, unknown>,
  now: string,
): EventOutcome {
  const outcome = removeVerdictCandidate(event.candidateId, session, now);
  const diagnostic = terminalDiagnosticFor([{
    candidateId: event.candidateId,
    platform: event.platform,
    problemExternalId: event.problemExternalId,
    reason: "adapter",
  }]);
  if (diagnostic === undefined) return outcome;
  const outbox = readOutbox(local.captureOutbox);
  const quarantine = readQuarantine(local.captureQuarantine);
  const nextLocal: Record<string, unknown> = {
    ...local,
    lastCaptureError: diagnostic,
  };
  const localOutcome = makeLocalOutcome(nextLocal, local, now, false, outbox, quarantine);
  return {
    ...localOutcome,
    sessionWrites: outcome.sessionWrites,
    sessionRemovals: outcome.sessionRemovals,
  };
}

function handleMainBridgeCorrelated(
  event: Extract<OrchestratorEvent, { readonly kind: "main_bridge_correlated" }>,
  local: Record<string, unknown>,
  session: Record<string, unknown>,
  now: string,
): EventOutcome {
  const matched = event.correlated.matchedE1;
  const summary = event.summary;
  const externalSubmissionId = summary.externalSubmissionId;
  const problemExternalId = summary.problemExternalId;
  if (event.correlated.summary.evidenceId !== summary.evidenceId
    || matched.tabId !== event.tabId
    || matched.frameId !== event.frameId
    || matched.documentId !== event.documentId
    || summary.tabId !== event.tabId
    || summary.frameId !== event.frameId
    || summary.documentId !== event.documentId
    || summary.platform !== matched.platform
    || externalSubmissionId === undefined
    || problemExternalId === undefined) {
    return emptyOutcome(now);
  }

  const currentConfirmed = readConfirmedSubmissionState(local);
  const record: ConfirmedSubmissionRecord = Object.freeze({
    schemaVersion: 1,
    status: "confirmed",
    platform: summary.platform,
    problemExternalId,
    externalSubmissionId,
    confirmedAt: summary.receivedAt,
    storageKey: `${summary.platform}:${externalSubmissionId}`,
    lastE3At: summary.receivedAt,
  });
  const recorded = recordConfirmedSubmission(currentConfirmed, record, now);
  if (recorded.outcome === "already_finalized"
    || recorded.outcome === "identity_conflict") return emptyOutcome(now);

  const transient = readTransientSessionEvidenceState(session);
  const stableSubmissionId = `${summary.platform}:${externalSubmissionId}`;
  const requestLifecycles = transient.requestLifecycles.map((entry) =>
    entry.evidence.requestId === matched.requestId
      ? Object.freeze({ ...entry, outcome: "matched" as const, stableSubmissionId, rejectionReason: null })
      : entry);
  const nextSession = { ...transient, requestLifecycles };
  const sessionOutcome = makeSessionOnlyOutcome(nextSession, session, now);
  const outbox = readOutbox(local.captureOutbox);
  const quarantine = readQuarantine(local.captureQuarantine);
  const nextLocal: Record<string, unknown> = {
    ...local,
    confirmedSubmissions: recorded.state.confirmed,
    confirmedSubmissionTombstones: recorded.state.tombstones,
  };
  const localOutcome = makeLocalOutcome(nextLocal, local, now, false, outbox, quarantine);
  const replay = transient.unmatchedE3.find((entry) =>
    `${entry.evidence.platform}:${entry.evidence.externalSubmissionId}` === stableSubmissionId);
  if (replay !== undefined) {
    const replayOutcome = handleE3Recorded({ kind: "e3_recorded", evidence: replay.evidence }, nextLocal, nextSession, now);
    return {
      ...replayOutcome,
      sessionWrites: mergeWrites(sessionOutcome.sessionWrites, replayOutcome.sessionWrites),
    };
  }
  return {
    ...localOutcome,
    sessionWrites: sessionOutcome.sessionWrites,
    sessionRemovals: sessionOutcome.sessionRemovals,
  };
}

function handleE3Recorded(
  event: Extract<OrchestratorEvent, { readonly kind: "e3_recorded" }>,
  local: Record<string, unknown>,
  session: Record<string, unknown>,
  now: string,
): EventOutcome {
  const evidence = event.evidence;
  const key = `${evidence.platform}:${evidence.externalSubmissionId}`;
  const confirmedState = readConfirmedSubmissionState(local);
  const nowMs = Date.parse(now);
  const alreadyFinalized = confirmedState.tombstones.some((tombstone) =>
    tombstone.submissionKey === key
    && Number.isFinite(nowMs)
    && Date.parse(tombstone.expiresAt) > nowMs);
  if (alreadyFinalized) {
    // Idempotent success: the submission is already finalized, so a matching
    // candidate must be consumed without constructing a second bundle.
    return event.candidateId === undefined
      ? emptyOutcome(now)
      : removeVerdictCandidate(event.candidateId, session, now);
  }
  const confirmed = confirmedState.confirmed.find((record) =>
    record.storageKey === key
    && record.finalizedAt === undefined
    && record.problemExternalId === evidence.problemExternalId);
  const transient = readTransientSessionEvidenceState(session);
  const lifecycle = transient.requestLifecycles.find((entry) =>
    entry.stableSubmissionId === key && entry.outcome === "matched");
  if (confirmed === undefined) {
    const parked: TransientUnmatchedFinal = {
      schemaVersion: 1,
      tier: "E3",
      kind: "unmatched_final",
      evidence,
      receivedAt: evidence.receivedAt,
    };
    const parsed = readTransientSessionEvidenceState({ transientUnmatchedE3: [parked] }).unmatchedE3[0];
    if (parsed === undefined) return emptyOutcome(now);
    const unmatchedE3 = [...transient.unmatchedE3.filter((entry) =>
      `${entry.evidence.platform}:${entry.evidence.externalSubmissionId}` !== key), parsed].slice(-32);
    return makeSessionOnlyOutcome({ ...transient, unmatchedE3 }, session, now);
  }
  // Synthesizing a recovery E1 from a parked E3 (or after a browser restart
  // where the transient E1 was lost) requires a chronology-correct receivedAt
  // and apiTimeStamp. The A4 reducer's `record.startedAt <= record.e2.receivedAt`
  // check would otherwise fail because the parked E3 was observed strictly
  // after its confirmed E2. The minimum of (E3.receivedAt, E2.confirmedAt)
  // preserves the chronology invariant at every path that reaches the
  // reducer through `safe_evidence`; the apiTimeStamp matches so the
  // per-record max-merge rule in `mergeE1` stays consistent with that.
  const recoveredReceivedAt = earlierIsoTime(evidence.receivedAt, confirmed.confirmedAt);
  const recoveredApiTimeStamp = Math.min(
    readOptionalNonnegativeNumber(evidence, "apiTimeStamp"),
    parseIsoOrZero(confirmed.confirmedAt),
  );
  const effectiveLifecycle = lifecycle ?? {
    evidence: {
      ...evidence,
      tier: "E1" as const,
      kind: "request_observed" as const,
      evidenceId: `recovery-e1-${confirmed.externalSubmissionId}`,
      requestId: `recovery-request-${confirmed.externalSubmissionId}`,
      method: "POST" as const,
      endpointKey: "submit",
      resourceType: "xmlhttprequest" as const,
      apiTimeStamp: recoveredApiTimeStamp,
      receivedAt: recoveredReceivedAt,
      lifecycle: "completed" as const,
    },
    stableSubmissionId: key,
  };

  const e2: E2SubmissionConfirmed = {
    schemaVersion: 1,
    evidenceId: `correlated-e2-${confirmed.externalSubmissionId}`,
    platform: confirmed.platform,
    tier: "E2",
    kind: "submission_confirmed",
    receivedAt: confirmed.confirmedAt,
    tabId: effectiveLifecycle.evidence.tabId,
    frameId: effectiveLifecycle.evidence.frameId,
    documentId: effectiveLifecycle.evidence.documentId,
    adapterVersion: effectiveLifecycle.evidence.adapterVersion,
    requestEvidenceId: effectiveLifecycle.evidence.evidenceId,
    externalSubmissionId: confirmed.externalSubmissionId,
    problemExternalId: confirmed.problemExternalId,
  };
  const installationId = readNonemptyString(local.installationId) ?? "v4-installation";
  const provenanceLevel: OrchestratorProvenanceLevel = readNonemptyString(local.captureCredential) === undefined
    ? "extension_unpaired"
    : "extension_paired";
  const metadata = {
    installationId,
    captureSessionId: effectiveLifecycle.evidence.documentId,
    adapterVersion: effectiveLifecycle.evidence.adapterVersion,
    provenanceLevel,
  } as const;
  let reducerState = createCaptureStateMachineState(() => now);
  reducerState = reduceCaptureState(reducerState, {
    kind: "safe_evidence",
    evidence: effectiveLifecycle.evidence,
    metadata,
  }).state;
  reducerState = reduceCaptureState(reducerState, {
    kind: "safe_evidence",
    evidence: e2,
    metadata,
  }).state;
  const finalizedReduction = reduceCaptureState(reducerState, {
    kind: "safe_evidence",
    evidence,
    metadata,
  });
  const bundleEffect = finalizedReduction.effects.find((effect) => effect.kind === "bundle");
  if (bundleEffect === undefined || bundleEffect.kind !== "bundle") {
    // Terminal mismatch/rejection: consume the candidate and persist a closed
    // diagnostic. The candidate is never retained for a later retry because
    // the coordinator already enforced identity/chronology at resolution.
    if (event.candidateId === undefined) return emptyOutcome(now);
    const outcome = removeVerdictCandidate(event.candidateId, session, now);
    const diagnostic = terminalDiagnosticFor([{
      candidateId: event.candidateId,
      platform: "leetcode",
      problemExternalId: evidence.problemExternalId,
      reason: "ambiguous_latest_submit",
    }]) ?? "Retained capture error";
    return {
      ...outcome,
      localWrites: [...outcome.localWrites, {
        key: "lastCaptureError",
        value: safeStoredCaptureError(diagnostic) ?? "Retained capture error",
      }],
    };
  }

  const finalized = markConfirmedSubmissionFinalized(confirmedState, confirmed, evidence.receivedAt);
  const remainingConfirmed = finalized.state.confirmed.filter((record) => record.storageKey !== key);
  const priorOutbox = readOutbox(local.captureOutbox);
  const nextOutbox = priorOutbox.some((item) => item.id === bundleEffect.bundle.bundleId)
    ? priorOutbox
    : [...priorOutbox, {
        id: bundleEffect.bundle.bundleId,
        kind: "attempt_bundle" as const,
        bundle: bundleEffect.bundle,
        attempts: 0,
        createdAt: evidence.receivedAt,
      }];
  const quarantine = readQuarantine(local.captureQuarantine);
  const nextLocal: Record<string, unknown> = {
    ...local,
    confirmedSubmissions: remainingConfirmed,
    confirmedSubmissionTombstones: finalized.state.tombstones,
    captureOutbox: preserveMalformedOutbox(local.captureOutbox, nextOutbox),
  };
  const nextTransient: TransientSessionEvidenceState = {
    ...transient,
    requestLifecycles: transient.requestLifecycles.filter((entry) => entry.stableSubmissionId !== key),
    unmatchedE3: transient.unmatchedE3.filter((entry) =>
      `${entry.evidence.platform}:${entry.evidence.externalSubmissionId}` !== key),
    verdictCandidates: event.candidateId === undefined
      ? transient.verdictCandidates
      : transient.verdictCandidates.filter((candidate) => candidate.candidateId !== event.candidateId),
  };
  const localOutcome = makeLocalOutcome(nextLocal, local, now, nextOutbox.length > priorOutbox.length, nextOutbox, quarantine);
  const sessionOutcome = makeSessionOnlyOutcome(nextTransient, session, now);
  return {
    ...localOutcome,
    sessionWrites: sessionOutcome.sessionWrites,
    sessionRemovals: sessionOutcome.sessionRemovals,
  };
}

/**
 * Remove a verdict candidate by id and return its session-only outcome.
 */
function removeVerdictCandidate(
  candidateId: string,
  session: Record<string, unknown>,
  now: string,
): EventOutcome {
  const transient = readTransientSessionEvidenceState(session);
  const verdictCandidates = transient.verdictCandidates.filter(
    (candidate) => candidate.candidateId !== candidateId,
  );
  return makeSessionOnlyOutcome({ ...transient, verdictCandidates }, session, now);
}

function handleMainBridgeDiagnostic(
  summary: MainBridgeSummary | undefined,
  reason: TransientAmbiguityDiagnostic["reason"],
  evidenceId: string | undefined,
  session: Record<string, unknown>,
  now: string,
): EventOutcome {
  const transient = readTransientSessionEvidenceState(session);
  const receivedAt = summary?.receivedAt ?? now;
  const identity = buildDiagnosticIdentity(summary, evidenceId);
  const alreadyRecorded = transient.ambiguityDiagnostics.some((existing) =>
    diagnosticMatchesIdentity(existing, reason, identity));
  if (alreadyRecorded) return emptyOutcome(now);
  const nextDiagnostic = createDiagnostic(reason, receivedAt, identity);
  const diagnostics = [...transient.ambiguityDiagnostics, nextDiagnostic].slice(-32);
  return makeSessionOnlyOutcome({
    ...transient,
    ambiguityDiagnostics: diagnostics,
  }, session, now);
}

function buildDiagnosticIdentity(
  summary: MainBridgeSummary | undefined,
  evidenceId: string | undefined,
): TransientAmbiguityDiagnosticIdentity {
  if (summary === undefined) {
    return evidenceId !== undefined ? { evidenceId } : {};
  }
  return {
    ...(evidenceId !== undefined ? { evidenceId } : {}),
    tabId: summary.tabId,
    frameId: summary.frameId,
    documentId: summary.documentId,
    endpointKey: summary.endpointKey,
  };
}

function diagnosticMatchesIdentity(
  existing: TransientAmbiguityDiagnostic,
  reason: TransientAmbiguityDiagnostic["reason"],
  identity: TransientAmbiguityDiagnosticIdentity,
): boolean {
  return existing.reason === reason
    && (existing.evidenceId ?? "") === (identity.evidenceId ?? "")
    && (existing.tabId ?? -1) === (identity.tabId ?? -1)
    && (existing.frameId ?? -1) === (identity.frameId ?? -1)
    && (existing.documentId ?? "") === (identity.documentId ?? "")
    && (existing.endpointKey ?? "") === (identity.endpointKey ?? "");
}

// ---------------------------------------------------------------------------
// User-action helpers
// ---------------------------------------------------------------------------

function clearOutbox(local: Record<string, unknown>, now: string): EventOutcome {
  const quarantine = readQuarantine(local.captureQuarantine);
  const next: Record<string, unknown> = {
    ...local,
    captureOutbox: [],
    lastCaptureError: undefined,
  };
  return makeLocalOutcome(next, local, now, false, [], quarantine);
}

function clearQuarantine(local: Record<string, unknown>, now: string): EventOutcome {
  const outbox = readOutbox(local.captureOutbox);
  const next: Record<string, unknown> = {
    ...local,
    captureQuarantine: [],
    lastCaptureError: undefined,
  };
  return makeLocalOutcome(next, local, now, false, outbox, []);
}

function retryAll(local: Record<string, unknown>, now: string): EventOutcome {
  const outbox = readOutbox(local.captureOutbox);
  const quarantine = readQuarantine(local.captureQuarantine);
  const update = retryAllCaptureStorageUpdate({ outbox, quarantine });
  const next: Record<string, unknown> = {
    ...local,
    captureOutbox: preserveMalformedOutbox(local.captureOutbox, update.captureOutbox),
    captureQuarantine: preserveMalformedQuarantine(local.captureQuarantine, update.captureQuarantine),
    lastCaptureError: undefined,
  };
  return makeLocalOutcome(next, local, now, true, update.captureOutbox, update.captureQuarantine);
}

function retryQuarantineEntry(
  local: Record<string, unknown>,
  id: string,
  now: string,
): EventOutcome {
  const outbox = readOutbox(local.captureOutbox);
  const quarantine = readQuarantine(local.captureQuarantine);
  const retried = retryQuarantined(outbox, quarantine, id);
  const next: Record<string, unknown> = {
    ...local,
    captureOutbox: preserveMalformedOutbox(local.captureOutbox, retried.outbox),
    captureQuarantine: preserveMalformedQuarantine(local.captureQuarantine, retried.quarantine),
    lastCaptureError: undefined,
  };
  return makeLocalOutcome(next, local, now, true, retried.outbox, retried.quarantine);
}

function deleteQuarantineEntry(
  local: Record<string, unknown>,
  id: string,
  now: string,
  malformedTarget: boolean,
): EventOutcome {
  const outbox = readOutbox(local.captureOutbox);
  const quarantine = readQuarantine(local.captureQuarantine);
  const deleted = malformedTarget
    ? { quarantine, deletedCount: 0 }
    : deleteQuarantined(quarantine, id);
  const malformed = readMalformedQuarantineRecords(local.captureQuarantine)
    .filter((item) => !malformedTarget || recordId(item) !== id);
  const next: Record<string, unknown> = {
    ...local,
    captureQuarantine: [...deleted.quarantine, ...malformed],
  };
  if (deleted.deletedCount > 0 && deleted.quarantine.length === 0
    && malformed.length === 0 && outbox.length === 0) {
    next.lastCaptureError = undefined;
  }
  return makeLocalOutcome(next, local, now, false, outbox, deleted.quarantine);
}

// ---------------------------------------------------------------------------
// Outcome builders
// ---------------------------------------------------------------------------

function emptyOutcome(now: string): EventOutcome {
  void now;
  return {
    localWrites: [],
    localRemovals: [],
    sessionWrites: [],
    sessionRemovals: [],
    scheduleFlush: false,
    outbox: [],
    quarantine: [],
    confirmed: [],
    tombstones: [],
    verdictCandidateResolutions: [],
  };
}

function makeLocalOutcome(
  next: Record<string, unknown>,
  prior: Record<string, unknown>,
  now: string,
  scheduleFlush: boolean,
  outbox: readonly CaptureOutboxItem[],
  quarantine: readonly CaptureQuarantineItem[],
): EventOutcome {
  void now;
  const safeLastCaptureError = safeStoredCaptureError(next.lastCaptureError);
  const safeNext: Record<string, unknown> = {
    ...next,
    captureOutbox: sanitizeCaptureOutboxRecords(next.captureOutbox),
    captureQuarantine: sanitizeCaptureQuarantineRecords(next.captureQuarantine),
    ...(safeLastCaptureError === undefined
      ? { lastCaptureError: undefined }
      : { lastCaptureError: safeLastCaptureError }),
  };
  const writes: Array<{ key: string; value: unknown }> = [];
  const removals: string[] = [];
  for (const [key, value] of Object.entries(safeNext)) {
    if (!deepEqual(Reflect.get(prior, key), value)) {
      writes.push({ key, value });
    }
  }
  for (const [key, value] of Object.entries(safeNext)) {
    if (value === undefined && Reflect.get(prior, key) !== undefined) {
      removals.push(key);
    }
  }
  const confirmed = readConfirmedSubmissionState(safeNext).confirmed;
  const tombstones = readConfirmedSubmissionState(safeNext).tombstones;
  return {
    localWrites: writes,
    localRemovals: removals,
    sessionWrites: [],
    sessionRemovals: [],
    scheduleFlush,
    outbox,
    quarantine,
    confirmed,
    tombstones,
    verdictCandidateResolutions: [],
  };
}

function makeSessionOnlyOutcome(
  next: TransientSessionEvidenceState,
  priorSession: Record<string, unknown>,
  now: string,
): EventOutcome {
  void now;
  const writes: Array<{ key: string; value: unknown }> = [];
  const removals: string[] = [];
  const mapping: ReadonlyArray<readonly [keyof TransientSessionEvidenceState, string]> = [
    ["uiHints", "uiHints"],
    ["requestLifecycles", "transientE1"],
    ["pageContexts", "transientPageContexts"],
    ["unmatchedE3", "transientUnmatchedE3"],
    ["verdictCandidates", "transientVerdictCandidates"],
    ["ambiguityDiagnostics", "transientAmbiguityDiagnostics"],
  ];
  for (const [key, storageKey] of mapping) {
    const newValue = next[key];
    const priorValue = Reflect.get(priorSession, storageKey);
    if (!deepEqual(priorValue, newValue)) {
      writes.push({ key: storageKey, value: newValue });
    }
  }
  return {
    localWrites: [],
    localRemovals: [],
    sessionWrites: writes,
    sessionRemovals: removals,
    scheduleFlush: false,
    outbox: [],
    quarantine: [],
    confirmed: [],
    tombstones: [],
    verdictCandidateResolutions: [],
  };
}

// ---------------------------------------------------------------------------
// Public factory
// ---------------------------------------------------------------------------

export function createBackgroundOrchestrator(
  deps: OrchestratorDependencies,
): Orchestrator {
  const installImpl = async (): Promise<OrchestratorEffects> => {
    const priorLocal = await deps.storage.local.get([...LOCAL_KEYS]);
    const priorSession = await deps.storage.session.get([...SESSION_KEYS]);
    const plan = planExtensionInitialization({ ...priorLocal, ...priorSession }, {
      now: deps.now(),
      createInstallationId: () => createInstallationId(),
    });
    const pruned = pruneTransientSessionEvidence(
      readTransientSessionEvidenceState(priorSession),
      deps.now(),
    );
    // Compute the init diff against prior storage rather than calling
    // `applyExtensionInitializationSplit` so the orchestrator remains pure:
    // every write is described in the returned `persistence` diff and the
    // background performs the single round of storage writes.
    const initDiff = computeInitializationDiff(plan, priorLocal, priorSession);
    const prunedSessionDiff = diffPrunedSession(pruned, priorSession);
    const localWrites = mergeWriteArrays(initDiff.localWrites, prunedSessionDiff.localWrites);
    const localRemovals = [...initDiff.localRemovals];
    const sessionWrites = mergeWriteArrays(initDiff.sessionWrites, prunedSessionDiff.sessionWrites);
    const sessionRemovals = [...initDiff.sessionRemovals];
    // Reconcile persisted candidates against matched lifecycles and confirmed
    // submissions so a service worker that stopped after candidate or E2
    // persistence can resume safely and re-emit a recoverable resolution.
    const provisionalLocal = applyLocalDiff(priorLocal, localWrites, localRemovals);
    const confirmedState = readConfirmedSubmissionState(provisionalLocal);
    const reconciliation = reconcileVerdictCandidates({
      candidates: pruned.verdictCandidates,
      requestLifecycles: pruned.requestLifecycles,
      confirmed: confirmedState.confirmed,
      now: deps.now(),
    });
    // Resolved candidates survive install: they stay in the slice until E3
    // consumes them, so a worker restart that landed after E2 persistence but
    // before E3 handling replays the resolution from the retained candidate
    // plus the confirmed record. Only terminal candidates are dropped, and
    // only after their closed diagnostic is persisted here (defensive: a
    // persisted terminal candidate implies an apply whose diagnostic write
    // never completed).
    const terminalCandidateIds = new Set(
      reconciliation.terminal.map((entry) => entry.candidateId),
    );
    const retainedCandidates = pruned.verdictCandidates.filter(
      (candidate) => !terminalCandidateIds.has(candidate.candidateId),
    );
    const candidateWrites = deepEqual(retainedCandidates, pruned.verdictCandidates)
      ? []
      : [{ key: "transientVerdictCandidates", value: retainedCandidates }];
    const sessionWritesWithCandidates = mergeWrites(sessionWrites, candidateWrites);
    // Candidates pruned by TTL are reconciled once before deletion so an
    // expiry is surfaced as a closed diagnostic instead of disappearing
    // silently (Task 9 review gate: every terminal path observable).
    const removedDiagnostic = terminalDiagnosticForRemovedCandidates(
      readTransientSessionEvidenceState(priorSession).verdictCandidates,
      pruned.verdictCandidates,
      pruned.requestLifecycles,
      confirmedState.confirmed,
      deps.now(),
    );
    const terminalDiagnostic = removedDiagnostic
      ?? terminalDiagnosticFor(reconciliation.terminal);
    const diagnosticWrites = terminalDiagnostic === undefined
      ? []
      : [{ key: "lastCaptureError", value: terminalDiagnostic }];
    const localWritesWithDiagnostic = mergeWriteArrays(localWrites, diagnosticWrites);
    // A fresh diagnostic write must win over a plan-driven removal of the same
    // key: `computeInitializationDiff` may ask to delete a stale
    // `lastCaptureError` while a reconciliated terminal candidate installs a
    // new one, and the write-then-remove order would net delete the new error.
    const finalLocalRemovals = dropRemovalsOverwrittenByWrites(localRemovals, localWritesWithDiagnostic);
    const nextLocal = applyLocalDiff(priorLocal, localWritesWithDiagnostic, finalLocalRemovals);
    const state = deriveState(nextLocal, applySessionDiff(priorSession, sessionWritesWithCandidates, sessionRemovals));
    const outbox = readOutbox(nextLocal.captureOutbox);
    const quarantine = readQuarantine(nextLocal.captureQuarantine);
    const confirmed = confirmedState.confirmed;
    const tombstones = confirmedState.tombstones;
    const executorSchedule = outbox.length > 0
      ? [{ id: FLUSH_OUTBOX_WORK_ID, work: async (): Promise<void> => { await deps.flushOutbox(); } }]
      : [];
    return deepFreeze({
      state,
      persistence: deepFreeze({
        local: localWritesWithDiagnostic,
        localRemovals: finalLocalRemovals,
        session: sessionWritesWithCandidates,
        sessionRemovals,
        outbox,
        quarantine,
        confirmed,
        tombstones,
        e0Hints: pruned.uiHints,
        transientE1: pruned.requestLifecycles,
        pageContexts: pruned.pageContexts,
        unmatchedFinals: pruned.unmatchedE3,
        verdictCandidates: retainedCandidates,
        ambiguityDiagnostics: pruned.ambiguityDiagnostics,
      }),
      executorSchedule,
      verdictCandidateResolutions: reconciliation.resolutions,
    });
  };

  const applyImpl = async (event: OrchestratorEvent): Promise<OrchestratorEffects> => {
    const priorLocal = await deps.storage.local.get([...LOCAL_KEYS]);
    const priorSession = await deps.storage.session.get([...SESSION_KEYS]);
    const now = deps.now();
    const prunedSessionState = pruneTransientSessionEvidence(
      readTransientSessionEvidenceState(priorSession),
      now,
    );
    const normalizedSession = transientStateAsStorage(prunedSessionState);
    const pruneOutcome = makeSessionOnlyOutcome(prunedSessionState, priorSession, now);
    const eventOutcome = handleEvent(event, priorLocal, normalizedSession, now);
    // Surface candidates that the TTL prune removed before this event could
    // be reconciled as a closed expired diagnostic (Task 9 review gate).
    const removedDiagnostic = terminalDiagnosticForRemovedCandidates(
      readTransientSessionEvidenceState(priorSession).verdictCandidates,
      prunedSessionState.verdictCandidates,
      prunedSessionState.requestLifecycles,
      readConfirmedSubmissionState(priorLocal).confirmed,
      now,
    );
    const removedWrites = removedDiagnostic === undefined
      ? []
      : [{ key: "lastCaptureError", value: removedDiagnostic }];
    const outcome: EventOutcome = {
      ...eventOutcome,
      localWrites: mergeWriteArrays(eventOutcome.localWrites, removedWrites),
      sessionWrites: mergeWrites(pruneOutcome.sessionWrites, eventOutcome.sessionWrites),
      sessionRemovals: [...new Set([...pruneOutcome.sessionRemovals, ...eventOutcome.sessionRemovals])],
    };
    // A fresh write merged above must win over a same-key removal from the
    // event outcome (e.g. an event that clears `lastCaptureError` while the
    // TTL prune concurrently surfaces an expiry diagnostic for that key).
    const finalLocalRemovals = dropRemovalsOverwrittenByWrites(outcome.localRemovals, outcome.localWrites);
    // Pure: no `deps.storage.*` writes here. The background owns the single
    // round of writes per `apply` invocation and consumes `persistence`.
    const nextLocal = applyLocalDiff(priorLocal, outcome.localWrites, finalLocalRemovals);
    const nextSession = applySessionDiff(priorSession, outcome.sessionWrites, outcome.sessionRemovals);
    const state = deriveState(nextLocal, nextSession);
    const executorSchedule = outcome.scheduleFlush
      ? [{ id: FLUSH_OUTBOX_WORK_ID, work: async (): Promise<void> => { await deps.flushOutbox(); } }]
      : [];
    return deepFreeze({
      state,
      persistence: deepFreeze({
        local: outcome.localWrites,
        localRemovals: finalLocalRemovals,
        session: outcome.sessionWrites,
        sessionRemovals: outcome.sessionRemovals,
        outbox: outcome.outbox,
        quarantine: outcome.quarantine,
        confirmed: outcome.confirmed,
        tombstones: outcome.tombstones,
        e0Hints: readTransientSessionEvidenceState(nextSession).uiHints,
        transientE1: readTransientSessionEvidenceState(nextSession).requestLifecycles,
        pageContexts: readTransientSessionEvidenceState(nextSession).pageContexts,
        unmatchedFinals: readTransientSessionEvidenceState(nextSession).unmatchedE3,
        verdictCandidates: readTransientSessionEvidenceState(nextSession).verdictCandidates,
        ambiguityDiagnostics: readTransientSessionEvidenceState(nextSession).ambiguityDiagnostics,
      }),
      executorSchedule,
      verdictCandidateResolutions: outcome.verdictCandidateResolutions,
    });
  };

  const snapshotImpl = async (): Promise<OrchestratorState> => {
    const local = await deps.storage.local.get([...LOCAL_KEYS]);
    const session = await deps.storage.session.get([...SESSION_KEYS]);
    return deriveState(local, session);
  };

  const pruneOrchestratorSessionImpl = async (now: string): Promise<OrchestratorEffects> => {
    const priorLocal = await deps.storage.local.get([...LOCAL_KEYS]);
    const priorSession = await deps.storage.session.get([...SESSION_KEYS]);
    const pruned = pruneTransientSessionEvidence(
      readTransientSessionEvidenceState(priorSession),
      now,
    );
    const sessionDiff = diffPrunedSession(pruned, priorSession);
    const nextSession = applySessionDiff(priorSession, sessionDiff.sessionWrites, sessionDiff.sessionRemovals);
    const outbox = readOutbox(priorLocal.captureOutbox);
    const quarantine = readQuarantine(priorLocal.captureQuarantine);
    const confirmed = readConfirmedSubmissionState(priorLocal).confirmed;
    const tombstones = readConfirmedSubmissionState(priorLocal).tombstones;
    // Candidates removed by the TTL prune are reconciled once so expiry is
    // surfaced as a closed diagnostic instead of vanishing silently.
    const removedDiagnostic = terminalDiagnosticForRemovedCandidates(
      readTransientSessionEvidenceState(priorSession).verdictCandidates,
      pruned.verdictCandidates,
      pruned.requestLifecycles,
      confirmed,
      now,
    );
    const localWrites = removedDiagnostic === undefined
      ? []
      : [{ key: "lastCaptureError", value: removedDiagnostic }];
    // Derive the returned state from the *final* local diff so the popup sees
    // the closed expiry diagnostic on the same prune pass instead of the next
    // refresh (Task 9 review gate: state must reflect the exact persistence).
    const nextLocal = applyLocalDiff(priorLocal, localWrites, []);
    const state = deriveState(nextLocal, nextSession);
    return deepFreeze({
      state,
      persistence: deepFreeze({
        local: localWrites,
        localRemovals: [],
        session: sessionDiff.sessionWrites,
        sessionRemovals: sessionDiff.sessionRemovals,
        outbox,
        quarantine,
        confirmed,
        tombstones,
        e0Hints: pruned.uiHints,
        transientE1: pruned.requestLifecycles,
        pageContexts: pruned.pageContexts,
        unmatchedFinals: pruned.unmatchedE3,
        verdictCandidates: pruned.verdictCandidates,
        ambiguityDiagnostics: pruned.ambiguityDiagnostics,
      }),
      executorSchedule: [],
      verdictCandidateResolutions: [],
    });
  };

  return Object.freeze({
    apply: applyImpl,
    snapshot: snapshotImpl,
    install: installImpl,
    pruneOrchestratorSession: pruneOrchestratorSessionImpl,
  });
}

// ---------------------------------------------------------------------------
// Utility helpers
// ---------------------------------------------------------------------------

function transientStateAsStorage(state: TransientSessionEvidenceState): Record<string, unknown> {
  return {
    uiHints: state.uiHints,
    transientE1: state.requestLifecycles,
    transientPageContexts: state.pageContexts,
    transientUnmatchedE3: state.unmatchedE3,
    transientVerdictCandidates: state.verdictCandidates,
    transientAmbiguityDiagnostics: state.ambiguityDiagnostics,
  };
}

function mergeWrites(
  first: ReadonlyArray<{ readonly key: string; readonly value: unknown }>,
  second: ReadonlyArray<{ readonly key: string; readonly value: unknown }>,
): ReadonlyArray<{ readonly key: string; readonly value: unknown }> {
  const values = new Map<string, unknown>();
  for (const write of first) values.set(write.key, write.value);
  for (const write of second) values.set(write.key, write.value);
  return [...values].map(([key, value]) => ({ key, value }));
}

function mergeWriteArrays(
  first: ReadonlyArray<{ readonly key: string; readonly value: unknown }>,
  second: ReadonlyArray<{ readonly key: string; readonly value: unknown }>,
): ReadonlyArray<{ readonly key: string; readonly value: unknown }> {
  return mergeWrites(first, second);
}

/**
 * Compute the initialization storage diff for both local and session areas
 * without writing. Mirrors `applyExtensionInitializationSplit` from
 * `installation.ts`:
 *
 *   - diff each area against prior state, preserving a non-empty existing
 *     `confirmedSubmissionTombstones` array when the plan omits it;
 *   - drop writes whose value equals the prior read;
 *   - record removals for `pendingSubmissionIntents` /
 *     `eventQueue` / `outbox` / `quarantine` when the plan requests them.
 *
 * Pure: no `chrome.*` access, no storage mutation. The background consumes
 * the returned diff exactly once via `applyPersistence`.
 */
function computeInitializationDiff(
  plan: ExtensionInitializationPlan,
  priorLocal: Record<string, unknown>,
  priorSession: Record<string, unknown>,
): {
  readonly localWrites: ReadonlyArray<{ readonly key: string; readonly value: unknown }>;
  readonly localRemovals: readonly string[];
  readonly sessionWrites: ReadonlyArray<{ readonly key: string; readonly value: unknown }>;
  readonly sessionRemovals: readonly string[];
} {
  const localItems = extensionInitializationLocalStorage(plan);
  const localWrites: Array<{ key: string; value: unknown }> = [];
  for (const [key, value] of Object.entries(localItems)) {
    let next: unknown = value;
    if (key === "confirmedSubmissionTombstones") {
      const planArr = Array.isArray(value) ? value : [];
      const priorArr = Array.isArray(Reflect.get(priorLocal, key))
        ? Reflect.get(priorLocal, key)
        : [];
      next = planArr.length > 0 ? planArr : priorArr;
    }
    if (!deepEqual(Reflect.get(priorLocal, key), next)) {
      localWrites.push({ key, value: next });
    }
  }
  const sessionItems = extensionInitializationSessionStorage(plan);
  const sessionWrites: Array<{ key: string; value: unknown }> = [];
  for (const [key, value] of Object.entries(sessionItems)) {
    if (!deepEqual(Reflect.get(priorSession, key), value)) {
      sessionWrites.push({ key, value });
    }
  }
  const localRemovals: string[] = [];
  if (plan.shouldRemovePendingSubmissionIntents) localRemovals.push("pendingSubmissionIntents");
  if (plan.shouldRemoveLastCaptureError) localRemovals.push("lastCaptureError");
  if (plan.shouldRemoveLegacyEventQueue) localRemovals.push("eventQueue");
  // `applyExtensionInitializationSplit` always issues these legacy cleanups;
  // the orchestrator only records them in the diff when the key is present
  // in the prior read so a truly no-op install (e.g. re-installation on a
  // clean V4 store) emits an empty diff.
  if (Reflect.get(priorLocal, "outbox") !== undefined) localRemovals.push("outbox");
  if (Reflect.get(priorLocal, "quarantine") !== undefined) localRemovals.push("quarantine");
  return {
    localWrites,
    localRemovals: dedupeStrings(localRemovals),
    sessionWrites,
    sessionRemovals: [],
  };
}

/**
 * Compute the session storage diff implied by transitioning to a pruned
 * transient state. Only keys whose value differs from the prior read are
 * returned. No removals: pruning removes records inside arrays, not the
 * keys themselves.
 */
function diffPrunedSession(
  pruned: TransientSessionEvidenceState,
  priorSession: Record<string, unknown>,
): {
  readonly localWrites: ReadonlyArray<{ readonly key: string; readonly value: unknown }>;
  readonly localRemovals: readonly string[];
  readonly sessionWrites: ReadonlyArray<{ readonly key: string; readonly value: unknown }>;
  readonly sessionRemovals: readonly string[];
} {
  const mapping: ReadonlyArray<readonly [keyof TransientSessionEvidenceState, string]> = [
    ["uiHints", "uiHints"],
    ["requestLifecycles", "transientE1"],
    ["pageContexts", "transientPageContexts"],
    ["unmatchedE3", "transientUnmatchedE3"],
    ["verdictCandidates", "transientVerdictCandidates"],
    ["ambiguityDiagnostics", "transientAmbiguityDiagnostics"],
  ];
  const sessionWrites: Array<{ key: string; value: unknown }> = [];
  for (const [fieldKey, storageKey] of mapping) {
    const next = pruned[fieldKey];
    if (!deepEqual(Reflect.get(priorSession, storageKey), next)) {
      sessionWrites.push({ key: storageKey, value: next });
    }
  }
  return {
    localWrites: [],
    localRemovals: [],
    sessionWrites,
    sessionRemovals: [],
  };
}

/**
 * Apply a local diff to a baseline record and return the merged snapshot.
 * Used to derive the next local state without re-reading from storage.
 */
function applyLocalDiff(
  prior: Record<string, unknown>,
  writes: ReadonlyArray<{ readonly key: string; readonly value: unknown }>,
  removals: readonly string[],
): Record<string, unknown> {
  const next: Record<string, unknown> = { ...prior };
  for (const write of writes) next[write.key] = write.value;
  for (const key of removals) Reflect.deleteProperty(next, key);
  return next;
}

/**
 * Resolve the same-key write/removal conflict before a diff is applied:
 * a fresh non-undefined write (e.g. a closed `lastCaptureError` diagnostic)
 * must win over a legacy cleanup removal of the same key, otherwise the
 * write-then-remove order used by `applyLocalDiff` and
 * `applyOrchestratorPersistence` would net delete the diagnostic. A write
 * whose value is `undefined` is itself a deletion intent and does NOT cancel
 * the matching removal.
 */
function dropRemovalsOverwrittenByWrites(
  removals: readonly string[],
  writes: ReadonlyArray<{ readonly key: string; readonly value: unknown }>,
): readonly string[] {
  const writtenKeys = new Set(
    writes.filter((write) => write.value !== undefined).map((write) => write.key),
  );
  return removals.filter((key) => !writtenKeys.has(key));
}

/**
 * Apply a session diff to a baseline record and return the merged snapshot.
 * Used to derive the next session state without re-reading from storage.
 */
function applySessionDiff(
  prior: Record<string, unknown>,
  writes: ReadonlyArray<{ readonly key: string; readonly value: unknown }>,
  removals: readonly string[],
): Record<string, unknown> {
  const next: Record<string, unknown> = { ...prior };
  for (const write of writes) next[write.key] = write.value;
  for (const key of removals) Reflect.deleteProperty(next, key);
  return next;
}

function dedupeStrings(values: readonly string[]): readonly string[] {
  return [...new Set(values)];
}

function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== typeof b) return false;
  if (a === null || b === null) return false;
  if (typeof a !== "object") return false;
  const aArr = Array.isArray(a);
  const bArr = Array.isArray(b);
  if (aArr !== bArr) return false;
  if (aArr && bArr) {
    const left = a as readonly unknown[];
    const right = b as readonly unknown[];
    if (left.length !== right.length) return false;
    for (let index = 0; index < left.length; index += 1) {
      if (!deepEqual(left[index], right[index])) return false;
    }
    return true;
  }
  const leftRec = a as Record<string, unknown>;
  const rightRec = b as Record<string, unknown>;
  const leftKeys = Object.keys(leftRec);
  const rightKeys = Object.keys(rightRec);
  if (leftKeys.length !== rightKeys.length) return false;
  for (const key of leftKeys) {
    if (!Object.hasOwn(rightRec, key)) return false;
    if (!deepEqual(leftRec[key], rightRec[key])) return false;
  }
  return true;
}

function deepFreeze<T>(value: T): T {
  if (typeof value !== "object" || value === null || Object.isFrozen(value)) return value;
  for (const key of Reflect.ownKeys(value)) deepFreeze(Reflect.get(value, key));
  Object.freeze(value);
  return value;
}

function createInstallationId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return `installation_${crypto.randomUUID()}`;
  }
  return `installation_${Date.now()}_${Math.random().toString(36).slice(2)}`;
}

/**
 * Returns the earlier of two ISO datetime strings by parsing them as ms since
 * epoch. When `Date.parse` cannot parse either value, falls back to a string
 * comparison so the function never throws and never returns NaN. Pure, no
 * I/O, no wall clock.
 */
function earlierIsoTime(left: string, right: string): string {
  const leftMs = Date.parse(left);
  const rightMs = Date.parse(right);
  if (Number.isFinite(leftMs) && Number.isFinite(rightMs)) {
    return leftMs <= rightMs ? left : right;
  }
  if (Number.isFinite(leftMs)) return left;
  if (Number.isFinite(rightMs)) return right;
  return left <= right ? left : right;
}

/**
 * Parses an ISO datetime string as milliseconds since epoch, returning 0 when
 * the input is missing or unparseable. Pure, no I/O, no wall clock. Used to
 * derive a chronology-respecting numeric `apiTimeStamp` from an ISO string.
 */
function parseIsoOrZero(value: string): number {
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? ms : 0;
}

/**
 * Reads an optional numeric property off an evidence object, returning 0 when
 * the property is absent, not a number, or not a nonneg finite value. Uses
 * `Reflect.get` so the helper does not depend on the static E3 type (which
 * intentionally omits `apiTimeStamp`). Pure, no I/O, no wall clock.
 */
function readOptionalNonnegativeNumber(source: object, key: string): number {
  const candidate = Reflect.get(source, key);
  return typeof candidate === "number" && Number.isFinite(candidate) && candidate >= 0
    ? candidate
    : 0;
}
