/**
 * Pure V4 capture state machine (Phase A Task A4).
 *
 * The reducer is deliberately narrower than the browser/runtime boundaries:
 * callers provide already-sanitized Safe Evidence or already-normalized
 * correlator results, and this module only projects those values into the
 * canonical capture states.  It does not call the Safe Evidence parser, use
 * Chrome or DOM APIs, read storage, or consult a clock.  The only time source
 * is the caller-supplied `now` function; its default is the fixed epoch.
 *
 * A bundle identity is a real SHA-256 over a canonical, length-prefixed UTF-8
 * encoding of `${installationId}\u001f${captureSessionId}\u001f${submissionKey}\u001f${adapterVersion}\u001f${parserVersion}`.
 * Each field is encoded as a single ASCII byte length prefix (1 byte) followed
 * by its UTF-8 bytes.  Identifiers that contain an ASCII control character
 * (codes 0x00–0x1F or 0x7F) are rejected with a `control_character_in_identity`
 * ignored effect so the digest input cannot be ambiguous under byte-prefixing.
 * Platform is folded into the namespaced `submissionKey`, which prevents
 * cross-platform collisions.  No random or process-global identity is used.
 *
 * The digest itself is computed by a module-local pure-JS SHA-256 helper
 * (`sha256HexBytes`).  It produces byte-identical output to Node's
 * `createHash("sha256").update(...).digest("hex")` so the bundle identity
 * stays in lock-step with prior test expectations, but it does not depend on
 * Node-only globals so the module bundles cleanly under esbuild for the
 * Chrome MV3 service worker (`Buffer` is absent in service workers).
 */

import { isFinalCaptureVerdict } from "@/lib/capture/verdictTaxonomy";
import type {
  SessionEndedEvent,
  SessionStartedEvent,
  SubmissionObservedEvent,
  VerdictObservedEvent,
} from "@/lib/capture/protocol";
import type { CaptureAttemptBundle } from "@/lib/capture/attemptBundle";
import type { CaptureProvenanceLevel } from "@/lib/domain/captureCredential";
import type { Platform } from "@/lib/domain/source";
import type {
  E1RequestObserved,
  E2SubmissionConfirmed,
  E3FinalVerdictConfirmed,
  RejectionEvidence,
  SafeEvidence,
} from "@/extension/src/evidence";
import type {
  CorrelationResult,
  CorrelatorAmbiguityReason,
  CorrelatorNoMatchReason,
  CorrelatorRejectionReason,
  E1LifecycleOutcome,
  MainBridgeSummary,
} from "@/extension/src/submissionCorrelator";

// ---------------------------------------------------------------------------
// Public state/effect types
// ---------------------------------------------------------------------------

export const CAPTURE_CANONICAL_STATES = [
  "IDLE",
  "REQUEST_OBSERVED",
  "REJECTED",
  "AMBIGUOUS",
  "EXPIRED",
  "SUBMISSION_CONFIRMED",
  "FINALIZED",
] as const;

export type CaptureCanonicalState = typeof CAPTURE_CANONICAL_STATES[number];
export type CaptureState = CaptureCanonicalState;

export const CAPTURE_SUBMISSION_PHASES = ["queued", "judging", "running"] as const;
export type CaptureSubmissionPhase = typeof CAPTURE_SUBMISSION_PHASES[number];

export type CaptureNowProvider = () => string;

/** Optional caller-owned metadata used when a Safe Evidence record lacks V3 bundle fields. */
export type CaptureReducerMetadata = Readonly<{
  readonly installationId?: string;
  readonly captureSessionId?: string;
  /** Alias accepted for callers that use the shorter session name. */
  readonly sessionId?: string;
  readonly adapterVersion?: string;
  readonly parserVersion?: string;
  readonly pageOrigin?: string;
  readonly provenanceLevel?: CaptureProvenanceLevel;
  readonly platform?: Platform;
  readonly problemExternalId?: string;
  readonly problemTitle?: string;
  readonly canonicalUrl?: string;
  readonly startedAt?: string;
  readonly sessionStartedAt?: string;
  readonly endedAt?: string;
  readonly sessionEndedAt?: string;
}>;

/** Resolved metadata copied identically into all four V3 bundle events. */
export type CaptureBundleMetadata = Readonly<{
  readonly installationId: string;
  readonly captureSessionId: string;
  readonly adapterVersion: string;
  readonly parserVersion: string;
  readonly pageOrigin: string;
  readonly provenanceLevel: CaptureProvenanceLevel;
  readonly platform: Platform;
  readonly problemExternalId: string;
  readonly problemTitle: string;
  readonly canonicalUrl: string;
}>;

/** Closed set of `ignored` effect reasons emitted by the capture reducer. */
export const CAPTURE_IGNORED_REASONS = [
  "missing_external_submission_id",
  "control_character_in_identity",
  "identity_mismatch",
  "non_final_verdict",
  "non_final_phase_only",
  "unsupported_v3_payload",
  "unknown_input_kind",
  "missing_metadata",
  "identity_collision",
] as const;
export type CaptureIgnoredReason = typeof CAPTURE_IGNORED_REASONS[number];

export type CaptureEffect =
  | {
      readonly kind: "bundle";
      readonly bundle: CaptureAttemptBundle;
      readonly observedAt: string;
    }
  | {
      readonly kind: "rejected";
      readonly reason: CorrelatorRejectionReason;
      readonly submissionKey: string | null;
      readonly observedAt: string;
    }
  | {
      readonly kind: "ambiguous";
      readonly reason: CorrelatorAmbiguityReason;
      readonly submissionKey: string | null;
      readonly observedAt: string;
    }
  | {
      readonly kind: "ignored";
      readonly reason: CaptureIgnoredReason;
      readonly observedAt: string;
    };

export type CaptureRequestRecord = Readonly<{
  readonly evidenceId: string;
  readonly requestId: string;
  readonly platform: Platform;
  readonly evidence: E1RequestObserved | null;
  readonly outcome: E1LifecycleOutcome;
  readonly rejectionReason: CorrelatorRejectionReason | null;
}>;

export type CaptureSubmissionRecord = Readonly<{
  readonly submissionKey: string;
  readonly platform: Platform;
  readonly externalSubmissionId: string;
  readonly problemExternalId: string;
  readonly status: CaptureCanonicalState;
  readonly phase: CaptureSubmissionPhase | null;
  readonly requestEvidenceId: string | null;
  readonly requestId: string | null;
  readonly e1: E1RequestObserved | null;
  readonly e2: E2SubmissionConfirmed | null;
  readonly e3: E3FinalVerdictConfirmed | null;
  readonly context: CaptureBundleMetadata;
  readonly startedAt: string;
  readonly bundle: CaptureAttemptBundle | null;
  readonly v3SessionStarted: SessionStartedEvent | null;
  readonly v3SubmissionObserved: SubmissionObservedEvent | null;
  readonly v3VerdictObserved: VerdictObservedEvent | null;
  readonly v3SessionEnded: SessionEndedEvent | null;
}>;

export type CapturePendingFinal = Readonly<{
  readonly submissionKey: string;
  readonly evidence: E3FinalVerdictConfirmed;
  readonly metadata: CaptureReducerMetadata;
}>;

export type CaptureSessionRecord = Readonly<{
  readonly captureSessionId: string;
  readonly installationId: string;
  readonly startedAt: string;
  readonly endedAt: string | null;
  readonly metadata: CaptureBundleMetadata;
  readonly startedEvent: SessionStartedEvent | null;
  readonly endedEvent: SessionEndedEvent | null;
}>;

export type CaptureReducerState = Readonly<{
  readonly status: CaptureCanonicalState;
  /** Alias for consumers that call the canonical projection `state`. */
  readonly state: CaptureCanonicalState;
  readonly phase: CaptureSubmissionPhase | null;
  readonly submissionKey: string | null;
  readonly activeSubmissionKey: string | null;
  readonly waiting: boolean;
  readonly waitingCount: number;
  readonly requests: readonly CaptureRequestRecord[];
  readonly records: readonly CaptureSubmissionRecord[];
  readonly pendingFinals: readonly CapturePendingFinal[];
  readonly session: CaptureSessionRecord | null;
  readonly nowProvider: CaptureNowProvider;
}>;

// ---------------------------------------------------------------------------
// Closed input union
// ---------------------------------------------------------------------------

type CaptureReducerInputBase = Readonly<{
  readonly metadata?: CaptureReducerMetadata;
  readonly context?: CaptureReducerMetadata;
  readonly installationId?: string;
  readonly captureSessionId?: string;
  readonly sessionId?: string;
  readonly adapterVersion?: string;
  readonly parserVersion?: string;
  readonly pageOrigin?: string;
  readonly provenanceLevel?: CaptureProvenanceLevel;
  readonly platform?: Platform;
  readonly problemExternalId?: string;
  readonly problemTitle?: string;
  readonly canonicalUrl?: string;
  readonly startedAt?: string;
  readonly sessionStartedAt?: string;
  readonly endedAt?: string;
  readonly sessionEndedAt?: string;
}>;

type V3SessionStartedInput = CaptureReducerInputBase & Readonly<{
  readonly kind: "v3_session_started";
  readonly event?: SessionStartedEvent;
  readonly value?: SessionStartedEvent;
  readonly v3Event?: SessionStartedEvent;
}>;

type V3SubmissionObservedInput = CaptureReducerInputBase & Readonly<{
  readonly kind: "v3_submission_observed";
  readonly event?: SubmissionObservedEvent;
  readonly value?: SubmissionObservedEvent;
  readonly v3Event?: SubmissionObservedEvent;
}>;

type V3VerdictObservedInput = CaptureReducerInputBase & Readonly<{
  readonly kind: "v3_verdict_observed";
  readonly event?: VerdictObservedEvent;
  readonly value?: VerdictObservedEvent;
  readonly v3Event?: VerdictObservedEvent;
}>;

type V3SessionEndedInput = CaptureReducerInputBase & Readonly<{
  readonly kind: "v3_session_ended";
  readonly event?: SessionEndedEvent;
  readonly value?: SessionEndedEvent;
  readonly v3Event?: SessionEndedEvent;
}>;

type SafeEvidenceInput = CaptureReducerInputBase & Readonly<{
  readonly kind: "safe_evidence";
  readonly evidence?: SafeEvidence;
  readonly safeEvidence?: SafeEvidence;
  readonly value?: SafeEvidence;
}>;

export type CorrelatedCaptureResult = Extract<CorrelationResult, { readonly kind: "correlated" }>;
export type AmbiguousCaptureResult = Extract<CorrelationResult, { readonly kind: "ambiguous" }>;
export type NoMatchCaptureResult = Extract<CorrelationResult, { readonly kind: "no_match" }>;
export type RejectedCaptureResult = Extract<CorrelationResult, { readonly kind: "rejected" }>;

type CorrelatorCorrelatedInput = CaptureReducerInputBase & Readonly<{
  readonly kind: "correlator_correlated";
  readonly result?: CorrelatedCaptureResult;
  readonly correlation?: CorrelatedCaptureResult;
  readonly correlatedResult?: CorrelatedCaptureResult;
  readonly value?: CorrelatedCaptureResult;
  readonly matchedE1?: E1RequestObserved;
  readonly summary?: MainBridgeSummary;
  readonly submissionEvidence?: E2SubmissionConfirmed;
  readonly e2?: E2SubmissionConfirmed;
  readonly verdictEvidence?: E3FinalVerdictConfirmed;
  readonly e3?: E3FinalVerdictConfirmed;
}>;

type CorrelatorAmbiguousInput = CaptureReducerInputBase & Readonly<{
  readonly kind: "correlator_ambiguous";
  readonly result?: AmbiguousCaptureResult;
  readonly correlation?: AmbiguousCaptureResult;
  readonly value?: AmbiguousCaptureResult;
  readonly reason?: CorrelatorAmbiguityReason;
  readonly submissionKey?: string;
}>;

type CorrelatorNoMatchInput = CaptureReducerInputBase & Readonly<{
  readonly kind: "correlator_no_match";
  readonly result?: NoMatchCaptureResult;
  readonly correlation?: NoMatchCaptureResult;
  readonly value?: NoMatchCaptureResult;
  readonly reason?: CorrelatorNoMatchReason;
  readonly requestId?: string;
  readonly submissionKey?: string;
}>;

type CorrelatorRejectedInput = CaptureReducerInputBase & Readonly<{
  readonly kind: "correlator_rejected";
  readonly result?: RejectedCaptureResult;
  readonly correlation?: RejectedCaptureResult;
  readonly value?: RejectedCaptureResult;
  readonly requestId?: string;
  readonly submissionKey?: string;
  readonly rejectionReason?: CorrelatorRejectionReason;
}>;

/**
 * Closed reducer input union.  The alternate `value`/`event` names are
 * deliberate compatibility spellings for callers at the V3/A3 boundaries;
 * no generic object escape hatch is provided.
 */
export type CaptureReducerInput =
  | V3SessionStartedInput
  | V3SubmissionObservedInput
  | V3VerdictObservedInput
  | V3SessionEndedInput
  | SafeEvidenceInput
  | CorrelatorCorrelatedInput
  | CorrelatorAmbiguousInput
  | CorrelatorNoMatchInput
  | CorrelatorRejectedInput;

// ---------------------------------------------------------------------------
// Internal immutable model
// ---------------------------------------------------------------------------

type WorkingState = {
  status: CaptureCanonicalState;
  focusKey: string | null;
  requests: CaptureRequestRecord[];
  records: CaptureSubmissionRecord[];
  pendingFinals: CapturePendingFinal[];
  session: CaptureSessionRecord | null;
};

type Runtime = {
  readonly working: WorkingState;
  readonly effects: CaptureEffect[];
  readonly clock: CaptureNowProvider;
  readonly inputMetadata: CaptureReducerMetadata;
};

const DEFAULT_NOW_PROVIDER: CaptureNowProvider = () => new Date(0).toISOString();
const DEFAULT_PARSER_VERSION = "v4-capture-state-machine@1";
const DEFAULT_ADAPTER_VERSION = "v4-adapter@1";
const DEFAULT_INSTALLATION_ID = "v4-installation";
const DEFAULT_PROVENANCE_LEVEL: CaptureProvenanceLevel = "extension_unpaired";
const DEFAULT_PROBLEM_TITLE = "Captured problem";

// ---------------------------------------------------------------------------
// Public reducer entry points
// ---------------------------------------------------------------------------

export function createCaptureStateMachineState(
  now: CaptureNowProvider = DEFAULT_NOW_PROVIDER,
): CaptureReducerState {
  return materializeState({
    status: "IDLE",
    focusKey: null,
    requests: [],
    records: [],
    pendingFinals: [],
    session: null,
  }, now);
}

export function reduceCaptureState(
  state: CaptureReducerState,
  input: CaptureReducerInput,
  now?: CaptureNowProvider,
): { readonly state: CaptureReducerState; readonly effects: readonly CaptureEffect[] } {
  const working: WorkingState = {
    status: state.status,
    focusKey: state.submissionKey ?? state.activeSubmissionKey,
    requests: [...state.requests],
    records: [...state.records],
    pendingFinals: [...state.pendingFinals],
    session: state.session,
  };
  const runtime: Runtime = {
    working,
    effects: [],
    clock: now ?? state.nowProvider ?? DEFAULT_NOW_PROVIDER,
    inputMetadata: inputMetadata(input),
  };

  const aliasConflict = detectAliasConflict(input);
  if (aliasConflict !== null) {
    emitIgnored(runtime, aliasConflict);
    const nextState = materializeState(runtime.working, state.nowProvider ?? DEFAULT_NOW_PROVIDER);
    const effects = deepFreeze([...runtime.effects]);
    return Object.freeze({ state: nextState, effects });
  }

  switch (input.kind) {
    case "v3_session_started":
      handleV3SessionStarted(runtime, input.event ?? input.value ?? input.v3Event);
      break;
    case "v3_submission_observed":
      handleV3SubmissionObserved(runtime, input.event ?? input.value ?? input.v3Event);
      break;
    case "v3_verdict_observed":
      handleV3VerdictObserved(runtime, input.event ?? input.value ?? input.v3Event);
      break;
    case "v3_session_ended":
      handleV3SessionEnded(runtime, input.event ?? input.value ?? input.v3Event);
      break;
    case "safe_evidence":
      handleSafeEvidence(runtime, evidenceValue(input));
      break;
    case "correlator_correlated":
      handleCorrelatorCorrelated(runtime, input, correlatedValue(input));
      break;
    case "correlator_ambiguous":
      handleCorrelatorAmbiguous(runtime, ambiguousValue(input), input);
      break;
    case "correlator_no_match":
      handleCorrelatorNoMatch(runtime, noMatchValue(input), input);
      break;
    case "correlator_rejected":
      handleCorrelatorRejected(runtime, rejectedValue(input), input);
      break;
  }

  const nextState = materializeState(runtime.working, state.nowProvider ?? DEFAULT_NOW_PROVIDER);
  const effects = deepFreeze([...runtime.effects]);
  return Object.freeze({ state: nextState, effects });
}

// ---------------------------------------------------------------------------
// Input normalization helpers
// ---------------------------------------------------------------------------

/**
 * Returns a string describing a mismatch between alias fields, or `null` when
 * the value is missing from every alias slot or when every non-missing alias
 * is structurally equal.  Used by every `handleX` switch arm to fail closed
 * on contradictory input without mutating state.
 */
function aliasConflictReason(
  present: ReadonlyArray<readonly [string, unknown]>,
): CaptureIgnoredReason | null {
  const defined: Array<readonly [string, unknown]> = present.filter(
    (entry) => entry[1] !== undefined,
  );
  if (defined.length < 2) return null;
  const [, firstValue] = defined[0] as [string, unknown];
  for (let index = 1; index < defined.length; index += 1) {
    const entry = defined[index] as [string, unknown];
    if (!deepEqual(firstValue, entry[1])) return "unsupported_v3_payload";
  }
  return null;
}

function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== typeof b) return false;
  if (a === null || b === null) return false;
  if (typeof a !== "object") return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    for (let index = 0; index < a.length; index += 1) {
      if (!deepEqual(a[index], b[index])) return false;
    }
    return true;
  }
  const aRecord = a as { readonly [key: string]: unknown };
  const bRecord = b as { readonly [key: string]: unknown };
  const aKeys = Object.keys(aRecord).sort();
  const bKeys = Object.keys(bRecord).sort();
  if (aKeys.length !== bKeys.length) return false;
  for (let index = 0; index < aKeys.length; index += 1) {
    if (aKeys[index] !== bKeys[index]) return false;
    if (!deepEqual(aRecord[aKeys[index] as string], bRecord[bKeys[index] as string])) {
      return false;
    }
  }
  return true;
}

function evidenceValue(input: SafeEvidenceInput): SafeEvidence | undefined {
  return input.evidence ?? input.safeEvidence ?? input.value;
}

/**
 * Inspect the alias fields on a reducer input.  When two or more alias
 * fields are present and they do not deep-equal, returns a closed ignored
 * reason so the caller can short-circuit and leave state unchanged.  The
 * `correlator_correlated` kind is special-cased: when the caller supplies
 * both a `result` (or one of its aliases) and a hand-built
 * `matchedE1`+`summary` pair, the canonical result is deep-compared against
 * a synthesized result built from the manual fields.  A disagreement means
 * the caller is reporting two different correlations; the reducer fails
 * closed with `identity_mismatch` and does not mutate state.  Pure
 * alias-only mismatches among the `result` family also short-circuit with
 * `unsupported_v3_payload`.
 */
function detectAliasConflict(input: CaptureReducerInput): CaptureIgnoredReason | null {
  switch (input.kind) {
    case "v3_session_started":
    case "v3_submission_observed":
    case "v3_verdict_observed":
    case "v3_session_ended":
      return aliasConflictReason([
        ["event", input.event],
        ["value", input.value],
        ["v3Event", input.v3Event],
      ]);
    case "safe_evidence":
      return aliasConflictReason([
        ["evidence", input.evidence],
        ["safeEvidence", input.safeEvidence],
        ["value", input.value],
      ]);
    case "correlator_correlated": {
      const aliasOnlyConflict = aliasConflictReason([
        ["result", input.result],
        ["correlation", input.correlation],
        ["correlatedResult", input.correlatedResult],
        ["value", input.value],
      ]);
      if (aliasOnlyConflict !== null) return aliasOnlyConflict;
      const canonicalResult = input.result ?? input.correlation
        ?? input.correlatedResult ?? input.value;
      if (canonicalResult !== undefined
        && input.matchedE1 !== undefined
        && input.summary !== undefined) {
        const synthetic: CorrelatedCaptureResult = {
          kind: "correlated",
          matchedE1: input.matchedE1,
          summary: input.summary,
          disambiguatedBy: "unique",
        };
        if (!deepEqual(canonicalResult, synthetic)) return "identity_mismatch";
      }
      if (canonicalResult === undefined
        && input.matchedE1 !== undefined
        && input.summary !== undefined) {
        const e2Conflict = aliasConflictReason([
          ["submissionEvidence", input.submissionEvidence],
          ["e2", input.e2],
        ]);
        if (e2Conflict !== null) return e2Conflict;
        const e3Conflict = aliasConflictReason([
          ["verdictEvidence", input.verdictEvidence],
          ["e3", input.e3],
        ]);
        if (e3Conflict !== null) return e3Conflict;
      }
      return null;
    }
    case "correlator_ambiguous":
      return aliasConflictReason([
        ["result", input.result],
        ["correlation", input.correlation],
        ["value", input.value],
      ]);
    case "correlator_no_match":
      return aliasConflictReason([
        ["result", input.result],
        ["correlation", input.correlation],
        ["value", input.value],
      ]);
    case "correlator_rejected":
      return aliasConflictReason([
        ["result", input.result],
        ["correlation", input.correlation],
        ["value", input.value],
      ]);
  }
}

function correlatedValue(input: CorrelatorCorrelatedInput): CorrelatedCaptureResult | undefined {
  const result = input.result ?? input.correlation ?? input.correlatedResult ?? input.value;
  if (result !== undefined) return result;
  if (input.matchedE1 === undefined || input.summary === undefined) return undefined;
  return {
    kind: "correlated",
    matchedE1: input.matchedE1,
    summary: input.summary,
    disambiguatedBy: "unique",
  };
}

function ambiguousValue(input: CorrelatorAmbiguousInput): AmbiguousCaptureResult | undefined {
  return input.result ?? input.correlation ?? input.value;
}

function noMatchValue(input: CorrelatorNoMatchInput): NoMatchCaptureResult | undefined {
  return input.result ?? input.correlation ?? input.value;
}

function rejectedValue(input: CorrelatorRejectedInput): RejectedCaptureResult | undefined {
  return input.result ?? input.correlation ?? input.value;
}

function inputMetadata(input: CaptureReducerInputBase): CaptureReducerMetadata {
  const metadata = input.metadata;
  const context = input.context;
  return freezeMetadata({
    ...metadata,
    ...context,
    installationId: input.installationId ?? context?.installationId ?? metadata?.installationId,
    captureSessionId: input.captureSessionId
      ?? input.sessionId
      ?? context?.captureSessionId
      ?? context?.sessionId
      ?? metadata?.captureSessionId
      ?? metadata?.sessionId,
    sessionId: input.sessionId ?? context?.sessionId ?? metadata?.sessionId,
    adapterVersion: input.adapterVersion ?? context?.adapterVersion ?? metadata?.adapterVersion,
    parserVersion: input.parserVersion ?? context?.parserVersion ?? metadata?.parserVersion,
    pageOrigin: input.pageOrigin ?? context?.pageOrigin ?? metadata?.pageOrigin,
    provenanceLevel: input.provenanceLevel ?? context?.provenanceLevel ?? metadata?.provenanceLevel,
    platform: input.platform ?? context?.platform ?? metadata?.platform,
    problemExternalId: input.problemExternalId ?? context?.problemExternalId ?? metadata?.problemExternalId,
    problemTitle: input.problemTitle ?? context?.problemTitle ?? metadata?.problemTitle,
    canonicalUrl: input.canonicalUrl ?? context?.canonicalUrl ?? metadata?.canonicalUrl,
    startedAt: input.startedAt
      ?? input.sessionStartedAt
      ?? context?.startedAt
      ?? context?.sessionStartedAt
      ?? metadata?.startedAt
      ?? metadata?.sessionStartedAt,
    endedAt: input.endedAt
      ?? input.sessionEndedAt
      ?? context?.endedAt
      ?? context?.sessionEndedAt
      ?? metadata?.endedAt
      ?? metadata?.sessionEndedAt,
  });
}

function freezeMetadata(value: CaptureReducerMetadata): CaptureReducerMetadata {
  return deepFreeze({ ...value });
}

// ---------------------------------------------------------------------------
// V3 historical event handlers
// ---------------------------------------------------------------------------

function handleV3SessionStarted(runtime: Runtime, event: SessionStartedEvent | undefined): void {
  if (event === undefined) {
    emitIgnored(runtime, "unsupported_v3_payload");
    return;
  }
  const cloned = cloneSessionStarted(event);
  const context = resolveContext(
    [runtime.inputMetadata, metadataFromV3(cloned)],
    cloned.platform,
    cloned.problemExternalId,
    cloned.canonicalUrl,
    cloned.captureSessionId,
    cloned.occurredAt,
    undefined,
  );
  const existing = runtime.working.session;
  if (existing !== null && existing.captureSessionId !== cloned.captureSessionId) {
    emitRejected(runtime, "malformed_response", null, true);
    return;
  }
  runtime.working.session = deepFreeze({
    captureSessionId: cloned.captureSessionId,
    installationId: cloned.installationId,
    startedAt: cloned.occurredAt,
    endedAt: existing?.endedAt ?? null,
    metadata: context,
    startedEvent: cloned,
    endedEvent: existing?.endedEvent ?? null,
  });
  if (runtime.working.status !== "FINALIZED") {
    runtime.working.status = "IDLE";
    runtime.working.focusKey = null;
  }
}

function handleV3SubmissionObserved(runtime: Runtime, event: SubmissionObservedEvent | undefined): void {
  if (event === undefined) {
    emitRejected(runtime, "malformed_response", null, false);
    return;
  }
  const cloned = cloneSubmissionObserved(event);
  const session = matchingSession(runtime.working.session, cloned);
  if (session === null) {
    emitRejected(runtime, "malformed_response", namespacedKey(cloned.platform, cloned.submissionId), false);
    return;
  }
  const key = namespacedKey(cloned.platform, cloned.submissionId);
  const existingIndex = findRecordIndex(runtime.working.records, key);
  if (existingIndex >= 0) {
    const existing = runtime.working.records[existingIndex];
    if (existing === undefined) {
      emitRejected(runtime, "malformed_response", key, false);
      return;
    }
    if (existing.status === "FINALIZED") {
      emitRejected(runtime, "malformed_response", key, true);
      return;
    }
    if (!legacyIdentityMatches(existing, cloned)) {
      emitRejected(runtime, "malformed_response", key, true);
      return;
    }
    runtime.working.status = existing.status === "REJECTED" ? "REJECTED" : "REQUEST_OBSERVED";
    runtime.working.focusKey = key;
    return;
  }

  const context = resolveContext(
    [runtime.inputMetadata, session.metadata, metadataFromV3(cloned)],
    cloned.platform,
    cloned.problemExternalId,
    cloned.canonicalUrl,
    cloned.captureSessionId,
    session.startedAt,
    undefined,
  );
  const record = newSubmissionRecord({
    submissionKey: key,
    platform: cloned.platform,
    externalSubmissionId: cloned.submissionId,
    problemExternalId: cloned.problemExternalId,
    status: "REQUEST_OBSERVED",
    phase: null,
    requestEvidenceId: null,
    requestId: null,
    e1: null,
    e2: null,
    e3: null,
    context,
    startedAt: session.startedAt,
    bundle: null,
    v3SessionStarted: session.startedEvent,
    v3SubmissionObserved: cloned,
    v3VerdictObserved: null,
    v3SessionEnded: session.endedEvent,
  });
  runtime.working.records.push(record);
  runtime.working.status = "REQUEST_OBSERVED";
  runtime.working.focusKey = key;
}

function handleV3VerdictObserved(runtime: Runtime, event: VerdictObservedEvent | undefined): void {
  if (event === undefined) {
    emitRejected(runtime, "malformed_response", null, false);
    return;
  }
  const cloned = cloneVerdictObserved(event);
  const key = namespacedKey(cloned.platform, cloned.submissionId);
  const session = matchingSession(runtime.working.session, cloned);
  const index = findRecordIndex(runtime.working.records, key);
  if (session === null || index < 0) {
    emitRejected(runtime, "malformed_response", key, false);
    return;
  }
  const record = runtime.working.records[index];
  if (record === undefined) {
    emitRejected(runtime, "malformed_response", key, false);
    return;
  }
  if (record.status === "FINALIZED" || record.v3VerdictObserved !== null) {
    emitRejected(runtime, "malformed_response", key, true);
    return;
  }
  if (!isFinalCaptureVerdict(cloned.payload.verdict)) {
    const rejected = replaceRecord(record, {
      status: "REJECTED",
      v3VerdictObserved: cloned,
    });
    runtime.working.records[index] = rejected;
    runtime.working.status = "REJECTED";
    runtime.working.focusKey = key;
    emitRejected(runtime, "malformed_response", key, true);
    return;
  }
  if (compareTimes(cloned.occurredAt, session.startedAt) < 0
    || compareTimes(cloned.occurredAt, record.v3SubmissionObserved?.occurredAt ?? session.startedAt) < 0) {
    emitRejected(runtime, "malformed_response", key, true);
    return;
  }
  const updated = replaceRecord(record, {
    status: "FINALIZED",
    v3VerdictObserved: cloned,
  });
  runtime.working.records[index] = updated;
  runtime.working.status = "FINALIZED";
  runtime.working.focusKey = key;
  if (updated.v3SessionEnded !== null) finalizeLegacyRecord(runtime, index);
}

function handleV3SessionEnded(runtime: Runtime, event: SessionEndedEvent | undefined): void {
  if (event === undefined) {
    emitRejected(runtime, "malformed_response", null, false);
    return;
  }
  const cloned = cloneSessionEnded(event);
  const session = matchingSession(runtime.working.session, cloned);
  if (session === null) {
    emitRejected(runtime, "malformed_response", null, false);
    return;
  }
  runtime.working.session = deepFreeze({
    ...session,
    endedAt: cloned.occurredAt,
    endedEvent: cloned,
  });

  let finalized = false;
  for (let index = 0; index < runtime.working.records.length; index += 1) {
    const record = runtime.working.records[index];
    if (record === undefined || record.context.captureSessionId !== cloned.captureSessionId) continue;
    const updated = replaceRecord(record, { v3SessionEnded: cloned });
    runtime.working.records[index] = updated;
    if (updated.v3VerdictObserved !== null && updated.status === "FINALIZED") {
      finalizeLegacyRecord(runtime, index);
      finalized = true;
    }
  }
  if (finalized) {
    runtime.working.status = "FINALIZED";
  } else if (runtime.working.status !== "REJECTED" && runtime.working.status !== "FINALIZED") {
    runtime.working.status = runtime.working.records.length === 0 ? "IDLE" : runtime.working.status;
  }
}

function finalizeLegacyRecord(runtime: Runtime, index: number): void {
  const record = runtime.working.records[index];
  if (record === undefined || record.bundle !== null) return;
  const started = record.v3SessionStarted;
  const submitted = record.v3SubmissionObserved;
  const verdict = record.v3VerdictObserved;
  const ended = record.v3SessionEnded;
  if (started === null || submitted === null || verdict === null || ended === null) return;
  if (compareTimes(started.occurredAt, submitted.occurredAt) > 0
    || compareTimes(submitted.occurredAt, verdict.occurredAt) > 0
    || compareTimes(verdict.occurredAt, ended.occurredAt) > 0) {
    emitRejected(runtime, "malformed_response", record.submissionKey, true);
    return;
  }
  const bundle = buildLegacyBundle(started, submitted, verdict, ended, record.submissionKey, runtime);
  if (bundle === null) {
    emitRejected(runtime, "malformed_response", record.submissionKey, true);
    return;
  }
  const finalized = replaceRecord(record, { status: "FINALIZED", bundle, phase: null });
  runtime.working.records[index] = finalized;
  emitBundle(runtime, bundle);
}

// ---------------------------------------------------------------------------
// Safe Evidence handlers
// ---------------------------------------------------------------------------

function handleSafeEvidence(runtime: Runtime, evidence: SafeEvidence | undefined): void {
  if (evidence === undefined) {
    emitIgnored(runtime, "missing_metadata");
    return;
  }
  switch (evidence.kind) {
    case "ui_hint":
      return;
    case "request_observed":
      handleE1(runtime, cloneE1(evidence));
      return;
    case "ambiguous_correlation":
      runtime.working.status = "AMBIGUOUS";
      emitAmbiguous(runtime, evidence.reason, null);
      return;
    case "request_rejected":
      handleRejectedEvidence(runtime, cloneRejectionEvidence(evidence));
      return;
    case "submission_confirmed":
      handleE2(runtime, cloneE2(evidence));
      return;
    case "final_verdict_confirmed":
      handleE3(runtime, cloneE3(evidence));
      return;
  }
}

function handleE1(runtime: Runtime, evidence: E1RequestObserved): void {
  const existingIndex = findRequestIndex(runtime.working.requests, evidence.evidenceId, evidence.requestId);
  const existing = existingIndex >= 0 ? runtime.working.requests[existingIndex] : undefined;
  if (existing !== undefined && (existing.requestId !== evidence.requestId
    || existing.platform !== evidence.platform
    || (existing.evidence !== null && !sameE1Identity(existing.evidence, evidence)))) {
    emitRejected(runtime, "malformed_response", null, true);
    return;
  }

  const legalReason = e1RejectionReason(evidence);
  if (existing !== undefined && existing.outcome !== "pending") {
    if (legalReason !== null && existing.rejectionReason === legalReason) return;
    if (existing.outcome === "matched") return;
  }

  const mergedEvidence = mergeE1(existing?.evidence ?? null, evidence);
  const outcome: E1LifecycleOutcome = legalReason === null ? (existing?.outcome ?? "pending") : "rejected";
  const rejectionReason = legalReason ?? existing?.rejectionReason ?? null;
  const request: CaptureRequestRecord = deepFreeze({
    evidenceId: existing?.evidenceId ?? mergedEvidence?.evidenceId ?? evidence.evidenceId,
    requestId: evidence.requestId,
    platform: evidence.platform,
    evidence: mergedEvidence,
    outcome,
    rejectionReason,
  });
  if (existingIndex >= 0) runtime.working.requests[existingIndex] = request;
  else runtime.working.requests.push(request);

  if (legalReason !== null) {
    runtime.working.status = "REJECTED";
    runtime.working.focusKey = null;
    emitRejected(runtime, legalReason, null, true);
    return;
  }
  if (existing?.outcome !== "matched") runtime.working.status = "REQUEST_OBSERVED";
}

function handleRejectedEvidence(runtime: Runtime, evidence: RejectionEvidence): void {
  const existingIndex = findRequestIndex(runtime.working.requests, evidence.evidenceId, evidence.requestId);
  const existing = existingIndex >= 0 ? runtime.working.requests[existingIndex] : undefined;
  if (existing?.outcome === "rejected" && existing.rejectionReason === evidence.rejectionReason) return;
  const request: CaptureRequestRecord = deepFreeze({
    evidenceId: existing?.evidenceId ?? evidence.evidenceId,
    requestId: evidence.requestId,
    platform: evidence.platform,
    evidence: existing?.evidence ?? null,
    outcome: "rejected",
    rejectionReason: evidence.rejectionReason,
  });
  if (existingIndex >= 0) runtime.working.requests[existingIndex] = request;
  else runtime.working.requests.push(request);
  runtime.working.status = "REJECTED";
  runtime.working.focusKey = null;
  const key = findRecordKeyForRequest(runtime.working.records, evidence.requestId);
  emitRejected(runtime, evidence.rejectionReason, key, true);
}

function handleE2(runtime: Runtime, evidence: E2SubmissionConfirmed): void {
  const externalId = nonempty(evidence.externalSubmissionId);
  if (externalId === undefined) {
    emitRejected(runtime, "malformed_response", null, false);
    return;
  }
  const key = namespacedKey(evidence.platform, externalId);
  if (nonempty(evidence.requestEvidenceId) === undefined
    || nonempty(evidence.problemExternalId) === undefined) {
    emitRejected(runtime, "malformed_response", key, false);
    return;
  }

  const recordIndex = findRecordIndex(runtime.working.records, key);
  const existingRecord = recordIndex >= 0 ? runtime.working.records[recordIndex] : undefined;
  const request = findRequestByReference(runtime.working.requests, evidence.requestEvidenceId);

  if (existingRecord !== undefined) {
    const referencesExistingRequest = existingRecord.requestEvidenceId === evidence.requestEvidenceId
      || existingRecord.requestId === evidence.requestEvidenceId;
    if (request === undefined && !referencesExistingRequest) {
      emitRejected(runtime, "malformed_response", key, true);
      return;
    }
    if (request !== undefined && request.outcome !== "pending" && request.outcome !== "matched") {
      const reason = request.rejectionReason ?? rejectionReasonForOutcome(request.outcome);
      emitRejected(runtime, reason, key, true);
      return;
    }
    if (existingRecord.problemExternalId !== evidence.problemExternalId
      || existingRecord.platform !== evidence.platform) {
      emitRejected(runtime, "malformed_response", key, true);
      return;
    }
    if (existingRecord.status === "FINALIZED") return;
    if (existingRecord.status === "REJECTED" || existingRecord.status === "EXPIRED") {
      const reason = request?.rejectionReason ?? rejectionReasonForOutcome(request?.outcome);
      emitRejected(runtime, reason, key, false);
      return;
    }
    const phase = evidence.phase ?? existingRecord.phase;
    const context = resolveContext(
      [runtime.inputMetadata, metadataFromE2(evidence), existingRecord.context],
      evidence.platform,
      evidence.problemExternalId,
      undefined,
      existingRecord.context.captureSessionId,
      existingRecord.startedAt,
      existingRecord.context,
    );
    const updated = replaceRecord(existingRecord, {
      status: "SUBMISSION_CONFIRMED",
      phase,
      e2: cloneE2(evidence),
      context,
    });
    runtime.working.records[recordIndex] = updated;
    if (request !== undefined && request.outcome === "pending") markRequestMatched(runtime, request);
    runtime.working.status = "SUBMISSION_CONFIRMED";
    runtime.working.focusKey = key;
    replayPendingFinal(runtime, recordIndex, key);
    return;
  }

  if (request === undefined || request.evidence === null) {
    emitRejected(runtime, "malformed_response", key, false);
    return;
  }
  if (request.platform !== evidence.platform) {
    emitRejected(runtime, "malformed_response", key, false);
    return;
  }
  if (request.outcome !== "pending" && request.outcome !== "matched") {
    const reason = request.rejectionReason ?? rejectionReasonForOutcome(request.outcome);
    if (request.outcome === "expired") {
      runtime.working.status = "EXPIRED";
      runtime.working.focusKey = key;
      emitRejected(runtime, reason, key, true);
    } else {
      emitRejected(runtime, reason, key, false);
    }
    return;
  }
  const existingForRequest = findRecordKeyForRequest(runtime.working.records, request.requestId);
  if (existingForRequest !== null && existingForRequest !== key) {
    emitRejected(runtime, "malformed_response", key, false);
    return;
  }

  const pending = findPendingFinal(runtime.working.pendingFinals, key);
  const context = resolveContext(
    [runtime.inputMetadata, pending?.metadata, metadataFromE2(evidence), metadataFromE1(request.evidence)],
    evidence.platform,
    evidence.problemExternalId,
    undefined,
    request.evidence.documentId,
    pending?.metadata.startedAt ?? request.evidence.receivedAt,
    undefined,
  );
  const record = newSubmissionRecord({
    submissionKey: key,
    platform: evidence.platform,
    externalSubmissionId: externalId,
    problemExternalId: evidence.problemExternalId,
    status: "SUBMISSION_CONFIRMED",
    phase: evidence.phase ?? null,
    requestEvidenceId: request.evidenceId,
    requestId: request.requestId,
    e1: request.evidence,
    e2: cloneE2(evidence),
    e3: null,
    context,
    startedAt: earliestTime(
      pending?.metadata.startedAt ?? runtime.inputMetadata.startedAt ?? request.evidence.receivedAt,
      request.evidence.receivedAt,
    ),
    bundle: null,
    v3SessionStarted: null,
    v3SubmissionObserved: null,
    v3VerdictObserved: null,
    v3SessionEnded: null,
  });
  runtime.working.records.push(record);
  if (request.outcome === "pending") markRequestMatched(runtime, request);
  runtime.working.status = "SUBMISSION_CONFIRMED";
  runtime.working.focusKey = key;
  replayPendingFinal(runtime, runtime.working.records.length - 1, key);
}

function handleE3(runtime: Runtime, evidence: E3FinalVerdictConfirmed): void {
  if (!isFinalCaptureVerdict(evidence.verdict)) {
    emitIgnored(runtime, "non_final_verdict");
    return;
  }
  const externalId = nonempty(evidence.externalSubmissionId);
  if (externalId === undefined) {
    emitIgnored(runtime, "missing_external_submission_id");
    return;
  }
  const key = namespacedKey(evidence.platform, externalId);
  const index = findRecordIndex(runtime.working.records, key);
  if (index < 0) {
    const conflicting = findConflictingRecord(runtime.working.records, evidence);
    if (conflicting !== null) {
      emitRejected(runtime, "malformed_response", key, true);
      return;
    }
    const pendingIndex = runtime.working.pendingFinals.findIndex((entry) => entry.submissionKey === key);
    if (pendingIndex >= 0) {
      const pending = runtime.working.pendingFinals[pendingIndex];
      if (pending !== undefined && pending.evidence.evidenceId === evidence.evidenceId) return;
      emitRejected(runtime, "malformed_response", key, true);
      return;
    }
    runtime.working.pendingFinals.push(deepFreeze({
      submissionKey: key,
      evidence: cloneE3(evidence),
      metadata: runtime.inputMetadata,
    }));
    return;
  }

  const record = runtime.working.records[index];
  if (record === undefined) return;
  if (record.status === "FINALIZED" || record.e3 !== null || record.bundle !== null) {
    emitRejected(runtime, "malformed_response", key, true);
    return;
  }
  if (record.status !== "SUBMISSION_CONFIRMED") {
    emitRejected(runtime, "malformed_response", key, true);
    return;
  }
  if (record.problemExternalId !== evidence.problemExternalId) {
    emitRejected(runtime, "malformed_response", key, true);
    return;
  }
  if (compareTimes(evidence.receivedAt, record.startedAt) < 0
    || (record.e2 !== null && compareTimes(evidence.receivedAt, record.e2.receivedAt) < 0)) {
    emitRejected(runtime, "malformed_response", key, true);
    return;
  }
  finalizeSafeRecord(runtime, index, cloneE3(evidence));
}

function replayPendingFinal(runtime: Runtime, recordIndex: number, key: string): void {
  const pendingIndex = runtime.working.pendingFinals.findIndex((entry) => entry.submissionKey === key);
  if (pendingIndex < 0) return;
  const pending = runtime.working.pendingFinals[pendingIndex];
  if (pending === undefined) return;
  runtime.working.pendingFinals.splice(pendingIndex, 1);
  const record = runtime.working.records[recordIndex];
  if (record === undefined) return;
  if (record.problemExternalId !== pending.evidence.problemExternalId
    || compareTimes(pending.evidence.receivedAt, record.startedAt) < 0
    || (record.e2 !== null && compareTimes(pending.evidence.receivedAt, record.e2.receivedAt) < 0)) {
    emitRejected(runtime, "malformed_response", key, true);
    return;
  }
  finalizeSafeRecord(runtime, recordIndex, pending.evidence);
}

function finalizeSafeRecord(runtime: Runtime, index: number, evidence: E3FinalVerdictConfirmed): void {
  const record = runtime.working.records[index];
  if (record === undefined || record.e1 === null || record.e2 === null) {
    emitRejected(runtime, "malformed_response", record?.submissionKey ?? null, false);
    return;
  }
  const bundle = buildSafeBundle(record, evidence, runtime);
  if (bundle === null) {
    // The rejected effect is only emitted for the chronology / null-evidence
    // cases; control-character identity failures are surfaced as `ignored`
    // by `buildSafeBundle` itself and the rejected path must not double-fire.
    if (containsIdentityControlChar(
      record.context.installationId,
      record.context.captureSessionId,
      record.submissionKey,
      record.context.adapterVersion,
      record.context.parserVersion,
    )) return;
    emitRejected(runtime, "malformed_response", record.submissionKey, true);
    return;
  }
  const finalized = replaceRecord(record, {
    status: "FINALIZED",
    phase: null,
    e3: evidence,
    bundle,
  });
  runtime.working.records[index] = finalized;
  runtime.working.status = "FINALIZED";
  runtime.working.focusKey = record.submissionKey;
  emitBundle(runtime, bundle);
}

// ---------------------------------------------------------------------------
// Correlator result handlers
// ---------------------------------------------------------------------------

function handleCorrelatorCorrelated(
  runtime: Runtime,
  input: CorrelatorCorrelatedInput,
  result: CorrelatedCaptureResult | undefined,
): void {
  if (result === undefined) {
    emitIgnored(runtime, "missing_metadata");
    return;
  }
  const matched = result.matchedE1;
  handleE1(runtime, cloneE1(matched));
  const correlatedInput = runtime.inputMetadata;
  const explicitE2 = input.submissionEvidence ?? input.e2;
  const externalId = explicitE2?.externalSubmissionId ?? result.summary.externalSubmissionId;
  const problemId = explicitE2?.problemExternalId
    ?? result.summary.problemExternalId
    ?? correlatedInput.problemExternalId;
  if (explicitE2 !== undefined) {
    handleE2(runtime, cloneE2(explicitE2));
  } else if (externalId !== undefined && problemId !== undefined) {
    const synthetic: E2SubmissionConfirmed = {
      schemaVersion: 1,
      evidenceId: `correlated-e2-${sha256Hex(`${matched.evidenceId}\u001f${result.summary.evidenceId}`)}`,
      platform: result.summary.platform,
      tier: "E2",
      kind: "submission_confirmed",
      receivedAt: result.summary.receivedAt,
      tabId: matched.tabId,
      frameId: matched.frameId,
      documentId: matched.documentId,
      adapterVersion: matched.adapterVersion,
      requestEvidenceId: matched.evidenceId,
      externalSubmissionId: externalId,
      problemExternalId: problemId,
    };
    handleE2(runtime, synthetic);
  } else {
    emitRejected(runtime, "malformed_response", null, false);
    return;
  }
  const explicitE3 = input.verdictEvidence ?? input.e3;
  if (explicitE3 !== undefined) handleE3(runtime, cloneE3(explicitE3));
}

function handleCorrelatorAmbiguous(
  runtime: Runtime,
  result: AmbiguousCaptureResult | undefined,
  input: CorrelatorAmbiguousInput,
): void {
  const reason = result?.reason ?? input.reason ?? "bridge_message_unmatched";
  const key = result?.summary.externalSubmissionId === undefined
    ? input.submissionKey ?? null
    : namespacedKey(result.summary.platform, result.summary.externalSubmissionId);
  runtime.working.status = "AMBIGUOUS";
  runtime.working.focusKey = key;
  emitAmbiguous(runtime, reason, key);
}

function handleCorrelatorNoMatch(
  runtime: Runtime,
  result: NoMatchCaptureResult | undefined,
  input: CorrelatorNoMatchInput,
): void {
  const reason = result?.reason ?? input.reason ?? "zero_candidates";
  const key = input.submissionKey ?? null;
  const requestId = input.requestId ?? solePendingRequestId(runtime.working.requests);
  if (reason === "expired") {
    markRequestTerminal(runtime, requestId, "expired", "timeout");
    runtime.working.status = "EXPIRED";
    runtime.working.focusKey = key;
    emitRejected(runtime, "timeout", key, true);
    return;
  }
  if (reason === "canceled" || reason === "error") {
    markRequestTerminal(runtime, requestId, reason, "network_error");
    runtime.working.status = "REJECTED";
    runtime.working.focusKey = key;
    emitRejected(runtime, "network_error", key, true);
    return;
  }
  emitIgnored(runtime, "non_final_phase_only");
}

function handleCorrelatorRejected(
  runtime: Runtime,
  result: RejectedCaptureResult | undefined,
  input: CorrelatorRejectedInput,
): void {
  const reason = result?.rejectionReason ?? input.rejectionReason ?? "malformed_response";
  const requestId = result?.requestId ?? input.requestId;
  const key = input.submissionKey ?? findRecordKeyForRequest(runtime.working.records, requestId ?? "");
  const request = requestId === undefined ? undefined : findRequestByReference(runtime.working.requests, requestId);
  if (request !== undefined && request.outcome !== "matched") {
    const index = findRequestIndex(runtime.working.requests, request.evidenceId, request.requestId);
    if (index >= 0) {
      runtime.working.requests[index] = deepFreeze({ ...request, outcome: "rejected", rejectionReason: reason });
    }
  }
  runtime.working.status = "REJECTED";
  runtime.working.focusKey = key;
  emitRejected(runtime, reason, key, true);
}

// ---------------------------------------------------------------------------
// State and record construction
// ---------------------------------------------------------------------------

function materializeState(
  working: WorkingState,
  nowProvider: CaptureNowProvider,
): CaptureReducerState {
  const records = deepFreeze([...working.records]);
  const requests = deepFreeze([...working.requests]);
  const pendingFinals = deepFreeze([...working.pendingFinals]);
  const waitingCount = records.filter((record) => record.status === "SUBMISSION_CONFIRMED").length;
  const focusRecord = working.focusKey === null
    ? undefined
    : working.records.find((record) => record.submissionKey === working.focusKey);
  const phase = working.status === "SUBMISSION_CONFIRMED" ? focusRecord?.phase ?? null : null;
  return deepFreeze({
    status: working.status,
    state: working.status,
    phase,
    submissionKey: working.focusKey,
    activeSubmissionKey: working.focusKey,
    waiting: waitingCount > 0,
    waitingCount,
    requests,
    records,
    pendingFinals,
    session: working.session,
    nowProvider,
  });
}

function newSubmissionRecord(input: {
  readonly submissionKey: string;
  readonly platform: Platform;
  readonly externalSubmissionId: string;
  readonly problemExternalId: string;
  readonly status: CaptureCanonicalState;
  readonly phase: CaptureSubmissionPhase | null;
  readonly requestEvidenceId: string | null;
  readonly requestId: string | null;
  readonly e1: E1RequestObserved | null;
  readonly e2: E2SubmissionConfirmed | null;
  readonly e3: E3FinalVerdictConfirmed | null;
  readonly context: CaptureBundleMetadata;
  readonly startedAt: string;
  readonly bundle: CaptureAttemptBundle | null;
  readonly v3SessionStarted: SessionStartedEvent | null;
  readonly v3SubmissionObserved: SubmissionObservedEvent | null;
  readonly v3VerdictObserved: VerdictObservedEvent | null;
  readonly v3SessionEnded: SessionEndedEvent | null;
}): CaptureSubmissionRecord {
  return deepFreeze({ ...input });
}

function replaceRecord(
  record: CaptureSubmissionRecord,
  patch: Partial<CaptureSubmissionRecord>,
): CaptureSubmissionRecord {
  return deepFreeze({ ...record, ...patch });
}

function markRequestMatched(runtime: Runtime, request: CaptureRequestRecord): void {
  const index = findRequestIndex(runtime.working.requests, request.evidenceId, request.requestId);
  if (index < 0) return;
  const current = runtime.working.requests[index];
  if (current === undefined || current.outcome !== "pending") return;
  runtime.working.requests[index] = deepFreeze({ ...current, outcome: "matched", rejectionReason: null });
}

function markRequestTerminal(
  runtime: Runtime,
  requestId: string | undefined,
  outcome: Exclude<E1LifecycleOutcome, "pending" | "matched" | "rejected">,
  rejectionReason: CorrelatorRejectionReason,
): void {
  if (requestId === undefined) return;
  const request = findRequestByReference(runtime.working.requests, requestId);
  if (request === undefined) return;
  const index = findRequestIndex(runtime.working.requests, request.evidenceId, request.requestId);
  if (index < 0) return;
  runtime.working.requests[index] = deepFreeze({ ...request, outcome, rejectionReason });
}

function matchingSession(
  session: CaptureSessionRecord | null,
  event: SessionStartedEvent | SubmissionObservedEvent | VerdictObservedEvent | SessionEndedEvent,
): CaptureSessionRecord | null {
  if (session === null) return null;
  return session.captureSessionId === event.captureSessionId && session.installationId === event.installationId
    ? session
    : null;
}

function legacyIdentityMatches(record: CaptureSubmissionRecord, event: SubmissionObservedEvent): boolean {
  return record.context.captureSessionId === event.captureSessionId
    && record.context.installationId === event.installationId
    && record.platform === event.platform
    && record.problemExternalId === event.problemExternalId;
}

// ---------------------------------------------------------------------------
// Context and bundle builders
// ---------------------------------------------------------------------------

function metadataFromV3(event: SessionStartedEvent | SubmissionObservedEvent | VerdictObservedEvent | SessionEndedEvent): CaptureReducerMetadata {
  return freezeMetadata({
    installationId: event.installationId,
    captureSessionId: event.captureSessionId,
    adapterVersion: event.adapterVersion,
    parserVersion: event.parserVersion,
    pageOrigin: event.pageOrigin,
    provenanceLevel: event.provenanceLevel,
    platform: event.platform,
    problemExternalId: event.problemExternalId,
    problemTitle: event.problemTitle,
    canonicalUrl: event.canonicalUrl,
    startedAt: event.occurredAt,
  });
}

function metadataFromE1(evidence: E1RequestObserved): CaptureReducerMetadata {
  return freezeMetadata({
    adapterVersion: evidence.adapterVersion,
    platform: evidence.platform,
    startedAt: evidence.receivedAt,
  });
}

function metadataFromE2(evidence: E2SubmissionConfirmed): CaptureReducerMetadata {
  return freezeMetadata({
    adapterVersion: evidence.adapterVersion,
    platform: evidence.platform,
    problemExternalId: evidence.problemExternalId,
    startedAt: evidence.receivedAt,
  });
}

function resolveContext(
  hints: readonly (CaptureReducerMetadata | undefined)[],
  platform: Platform,
  problemExternalId: string,
  canonicalUrlHint: string | undefined,
  sessionIdHint: string | undefined,
  startedAtHint: string | undefined,
  existing: CaptureBundleMetadata | undefined,
): CaptureBundleMetadata {
  const all = [...hints, existing === undefined ? undefined : contextMetadata(existing)];
  const installationId = firstNonempty(all.map((hint) => hint?.installationId)) ?? DEFAULT_INSTALLATION_ID;
  const sessionId = firstNonempty(all.map((hint) => hint?.captureSessionId ?? hint?.sessionId))
    ?? sessionIdHint
    ?? `session_${sha256Hex(`${installationId}\u001f${platform}\u001f${problemExternalId}`)}`;
  const adapterVersion = firstNonempty(all.map((hint) => hint?.adapterVersion)) ?? DEFAULT_ADAPTER_VERSION;
  const parserVersion = firstNonempty(all.map((hint) => hint?.parserVersion)) ?? DEFAULT_PARSER_VERSION;
  const provenanceLevel = firstDefinedProvenance(all.map((hint) => hint?.provenanceLevel)) ?? DEFAULT_PROVENANCE_LEVEL;
  const problemTitle = firstNonempty(all.map((hint) => hint?.problemTitle)) ?? DEFAULT_PROBLEM_TITLE;
  const canonicalCandidate = firstNonempty([
    canonicalUrlHint,
    ...all.map((hint) => hint?.canonicalUrl),
  ]);
  const canonicalUrl = validUrl(canonicalCandidate)
    ? canonicalCandidate
    : defaultCanonicalUrl(platform, problemExternalId);
  const pageOriginCandidate = firstNonempty(all.map((hint) => hint?.pageOrigin));
  const pageOrigin = validUrl(pageOriginCandidate)
    ? pageOriginCandidate
    : originOf(canonicalUrl);
  return deepFreeze({
    installationId,
    captureSessionId: sessionId,
    adapterVersion,
    parserVersion,
    pageOrigin,
    provenanceLevel,
    platform,
    problemExternalId,
    problemTitle,
    canonicalUrl,
  });
}

function contextMetadata(context: CaptureBundleMetadata): CaptureReducerMetadata {
  return freezeMetadata({
    installationId: context.installationId,
    captureSessionId: context.captureSessionId,
    adapterVersion: context.adapterVersion,
    parserVersion: context.parserVersion,
    pageOrigin: context.pageOrigin,
    provenanceLevel: context.provenanceLevel,
    platform: context.platform,
    problemExternalId: context.problemExternalId,
    problemTitle: context.problemTitle,
    canonicalUrl: context.canonicalUrl,
  });
}

function buildSafeBundle(
  record: CaptureSubmissionRecord,
  verdict: E3FinalVerdictConfirmed,
  runtime: Runtime | null,
): CaptureAttemptBundle | null {
  if (record.e2 === null || record.e1 === null) return null;
  if (compareTimes(record.startedAt, record.e2.receivedAt) > 0
    || compareTimes(record.e2.receivedAt, verdict.receivedAt) > 0) return null;
  if (containsIdentityControlChar(
    record.context.installationId,
    record.context.captureSessionId,
    record.submissionKey,
    record.context.adapterVersion,
    record.context.parserVersion,
  )) {
    if (runtime !== null) emitIgnored(runtime, "control_character_in_identity");
    return null;
  }
  const bundleId = deterministicBundleId(
    record.context.installationId,
    record.context.captureSessionId,
    record.submissionKey,
    record.context.adapterVersion,
    record.context.parserVersion,
  );
  const common = {
    schemaVersion: 2 as const,
    captureSessionId: record.context.captureSessionId,
    installationId: record.context.installationId,
    adapterVersion: record.context.adapterVersion,
    parserVersion: record.context.parserVersion,
    pageOrigin: record.context.pageOrigin,
    provenanceLevel: record.context.provenanceLevel,
    platform: record.context.platform,
    problemExternalId: record.context.problemExternalId,
    problemTitle: record.context.problemTitle,
    canonicalUrl: record.context.canonicalUrl,
  };
  const started: SessionStartedEvent = {
    ...common,
    id: `${bundleId}_started`,
    type: "SESSION_STARTED",
    occurredAt: record.startedAt,
    payload: { source: "content_script" },
  };
  const submitted: SubmissionObservedEvent = {
    ...common,
    id: `${bundleId}_submitted`,
    type: "SUBMISSION_OBSERVED",
    submissionId: record.externalSubmissionId,
    occurredAt: record.e2.receivedAt,
    payload: { action: "submission_confirmed" },
  };
  const observedVerdict: VerdictObservedEvent = {
    ...common,
    id: `${bundleId}_verdict`,
    type: "VERDICT_OBSERVED",
    submissionId: record.externalSubmissionId,
    occurredAt: verdict.receivedAt,
    payload: { verdict: verdict.verdict },
  };
  const ended: SessionEndedEvent = {
    ...common,
    id: `${bundleId}_ended`,
    type: "SESSION_ENDED",
    occurredAt: verdict.receivedAt,
    payload: { endReason: "capture_disabled" },
  };
  const events: [SessionStartedEvent, SubmissionObservedEvent, VerdictObservedEvent, SessionEndedEvent] = [
    started,
    submitted,
    observedVerdict,
    ended,
  ];
  return deepFreeze({ schemaVersion: 1, bundleId, events });
}

function buildLegacyBundle(
  started: SessionStartedEvent,
  submitted: SubmissionObservedEvent,
  verdict: VerdictObservedEvent,
  ended: SessionEndedEvent,
  submissionKey: string,
  runtime: Runtime | null,
): CaptureAttemptBundle | null {
  if (!isFinalCaptureVerdict(verdict.payload.verdict)) return null;
  if (!sameLegacyMetadata([started, submitted, verdict, ended])) return null;
  if (containsIdentityControlChar(
    started.installationId,
    started.captureSessionId,
    submissionKey,
    started.adapterVersion,
    started.parserVersion,
  )) {
    if (runtime !== null) emitIgnored(runtime, "control_character_in_identity");
    return null;
  }
  const bundleId = deterministicBundleId(
    started.installationId,
    started.captureSessionId,
    submissionKey,
    started.adapterVersion,
    started.parserVersion,
  );
  const events: [SessionStartedEvent, SubmissionObservedEvent, VerdictObservedEvent, SessionEndedEvent] = [
    cloneSessionStarted(started),
    cloneSubmissionObserved(submitted),
    cloneVerdictObserved(verdict),
    cloneSessionEnded(ended),
  ];
  return deepFreeze({ schemaVersion: 1, bundleId, events });
}

function containsIdentityControlChar(
  installationId: string,
  captureSessionId: string,
  submissionKey: string,
  adapterVersion: string,
  parserVersion: string,
): boolean {
  for (const field of [installationId, captureSessionId, submissionKey, adapterVersion, parserVersion]) {
    for (let index = 0; index < field.length; index += 1) {
      const code = field.charCodeAt(index);
      if (code < 0x20 || code === 0x7f) return true;
    }
  }
  return false;
}

function sameLegacyMetadata(
  events: readonly [SessionStartedEvent, SubmissionObservedEvent, VerdictObservedEvent, SessionEndedEvent],
): boolean {
  const [first] = events;
  if (first === undefined) return false;
  return events.every((event) => event.captureSessionId === first.captureSessionId
    && event.installationId === first.installationId
    && event.adapterVersion === first.adapterVersion
    && event.parserVersion === first.parserVersion
    && event.pageOrigin === first.pageOrigin
    && event.provenanceLevel === first.provenanceLevel
    && event.platform === first.platform
    && event.problemExternalId === first.problemExternalId
    && event.problemTitle === first.problemTitle
    && event.canonicalUrl === first.canonicalUrl)
    && events[1].submissionId === events[2].submissionId
    && compareTimes(events[0].occurredAt, events[1].occurredAt) <= 0
    && compareTimes(events[1].occurredAt, events[2].occurredAt) <= 0
    && compareTimes(events[2].occurredAt, events[3].occurredAt) <= 0;
}

function deterministicBundleId(
  installationId: string,
  captureSessionId: string,
  submissionKey: string,
  adapterVersion: string,
  parserVersion: string,
): string {
  const canonical = canonicalIdentityEncoding([
    installationId,
    captureSessionId,
    submissionKey,
    adapterVersion,
    parserVersion,
  ]);
  if (canonical instanceof Error) return `bundle_invalid_${canonical.message}`;
  return `bundle_${sha256HexBytes(canonical)}`;
}

/**
 * Canonical length-prefixed UTF-8 encoding for bundle identity.  Each field
 * is serialized as a 4-byte big-endian uint32 length prefix followed by its
 * UTF-8 bytes.  The total field count and order are part of the canonical
 * form, so two different field sets cannot collide.  An ASCII control
 * character (0x00-0x1F or 0x7F) in any field is rejected before encoding
 * because control characters would let two distinct fields decode to the
 * same byte sequence, defeating length prefixing.  Identity strings of
 * up to 2^32-1 UTF-8 bytes are accepted; longer strings are rejected
 * because uint32 cannot express their length and the encoding would
 * silently truncate.  Such a string is reported as
 * `identity_collision` so callers can detect the practical bound and
 * downsize the offending field.
 */
function canonicalIdentityEncoding(fields: readonly string[]): Uint8Array | Error {
  const parts: Uint8Array[] = [];
  for (const field of fields) {
    for (let index = 0; index < field.length; index += 1) {
      const code = field.charCodeAt(index);
      if (code < 0x20 || code === 0x7f) {
        return new Error("control_character_in_identity");
      }
    }
    const bytes = new TextEncoder().encode(field);
    if (bytes.length > 0xffffffff) {
      return new Error("identity_collision");
    }
    const lengthPrefix = new Uint8Array(4);
    lengthPrefix[0] = (bytes.length >>> 24) & 0xff;
    lengthPrefix[1] = (bytes.length >>> 16) & 0xff;
    lengthPrefix[2] = (bytes.length >>> 8) & 0xff;
    lengthPrefix[3] = bytes.length & 0xff;
    parts.push(lengthPrefix);
    parts.push(bytes);
  }
  return concatBytes(parts);
}

// ---------------------------------------------------------------------------
// Diagnostics/effects
// ---------------------------------------------------------------------------

function emitBundle(runtime: Runtime, bundle: CaptureAttemptBundle): void {
  runtime.effects.push(deepFreeze({
    kind: "bundle",
    bundle,
    observedAt: runtime.clock(),
  }));
}

function emitRejected(
  runtime: Runtime,
  reason: CorrelatorRejectionReason,
  submissionKey: string | null,
  preserveState: boolean,
): void {
  if (!preserveState) {
    runtime.working.status = "REJECTED";
    runtime.working.focusKey = submissionKey;
  }
  runtime.effects.push(deepFreeze({
    kind: "rejected",
    reason,
    submissionKey,
    observedAt: runtime.clock(),
  }));
}

function emitAmbiguous(runtime: Runtime, reason: CorrelatorAmbiguityReason, submissionKey: string | null): void {
  runtime.effects.push(deepFreeze({
    kind: "ambiguous",
    reason,
    submissionKey,
    observedAt: runtime.clock(),
  }));
}

function emitIgnored(runtime: Runtime, reason: CaptureIgnoredReason): void {
  runtime.effects.push(deepFreeze({
    kind: "ignored",
    reason,
    observedAt: runtime.clock(),
  }));
}

// ---------------------------------------------------------------------------
// Request/identity helpers
// ---------------------------------------------------------------------------

function findRequestIndex(
  requests: readonly CaptureRequestRecord[],
  evidenceId: string,
  requestId: string,
): number {
  return requests.findIndex((request) => request.evidenceId === evidenceId
    || request.requestId === requestId
    || request.evidence?.evidenceId === evidenceId);
}

function findRequestByReference(
  requests: readonly CaptureRequestRecord[],
  reference: string,
): CaptureRequestRecord | undefined {
  return requests.find((request) => request.evidenceId === reference
    || request.requestId === reference
    || request.evidence?.evidenceId === reference);
}

function findRecordIndex(records: readonly CaptureSubmissionRecord[], key: string): number {
  return records.findIndex((record) => record.submissionKey === key);
}

function findRecordKeyForRequest(
  records: readonly CaptureSubmissionRecord[],
  requestId: string,
): string | null {
  return records.find((record) => record.requestId === requestId)?.submissionKey ?? null;
}

function solePendingRequestId(requests: readonly CaptureRequestRecord[]): string | undefined {
  const pending = requests.filter((request) => request.outcome === "pending");
  return pending.length === 1 ? pending[0]?.requestId : undefined;
}

function findPendingFinal(
  pendingFinals: readonly CapturePendingFinal[],
  key: string,
): CapturePendingFinal | undefined {
  return pendingFinals.find((pending) => pending.submissionKey === key);
}

function findConflictingRecord(
  records: readonly CaptureSubmissionRecord[],
  evidence: E3FinalVerdictConfirmed,
): CaptureSubmissionRecord | null {
  const candidates = records.filter((record) => record.platform === evidence.platform
    && record.problemExternalId === evidence.problemExternalId
    && record.submissionKey !== namespacedKey(evidence.platform, evidence.externalSubmissionId)
    && record.status !== "REJECTED");
  return candidates.length === 1 ? candidates[0] ?? null : null;
}

function sameE1Identity(left: E1RequestObserved, right: E1RequestObserved): boolean {
  return left.platform === right.platform
    && left.tabId === right.tabId
    && left.frameId === right.frameId
    && left.documentId === right.documentId
    && left.method === right.method
    && left.endpointKey === right.endpointKey;
}

function mergeE1(
  existing: E1RequestObserved | null,
  incoming: E1RequestObserved,
): E1RequestObserved {
  if (existing === null) return cloneE1(incoming);
  const newer = incoming.apiTimeStamp >= existing.apiTimeStamp ? incoming : existing;
  const earliestReceivedAt = existing.receivedAt <= incoming.receivedAt ? existing.receivedAt : incoming.receivedAt;
  return cloneE1({ ...newer, receivedAt: earliestReceivedAt });
}

function e1RejectionReason(evidence: E1RequestObserved): CorrelatorRejectionReason | null {
  if (evidence.lifecycle === "error_occurred") return "network_error";
  if (evidence.statusCode === undefined || evidence.statusCode < 400) return null;
  if (evidence.statusCode === 401 || evidence.statusCode === 403) return "auth_required";
  if (evidence.statusCode === 429) return "rate_limited";
  if (evidence.statusCode >= 500) return "server_error";
  return "business_rejection";
}

function rejectionReasonForOutcome(outcome: E1LifecycleOutcome | undefined): CorrelatorRejectionReason {
  if (outcome === "expired") return "timeout";
  if (outcome === "canceled" || outcome === "error") return "network_error";
  if (outcome === "rejected") return "malformed_response";
  return "malformed_response";
}

function namespacedKey(platform: Platform, externalSubmissionId: string): string {
  return `${platform}:${externalSubmissionId}`;
}

// ---------------------------------------------------------------------------
// Cloning and validation helpers
// ---------------------------------------------------------------------------

function cloneE1(value: E1RequestObserved): E1RequestObserved {
  return deepFreeze({ ...value });
}

function cloneE2(value: E2SubmissionConfirmed): E2SubmissionConfirmed {
  return deepFreeze({ ...value });
}

function cloneE3(value: E3FinalVerdictConfirmed): E3FinalVerdictConfirmed {
  return deepFreeze({ ...value });
}

function cloneRejectionEvidence(value: RejectionEvidence): RejectionEvidence {
  return deepFreeze({ ...value });
}

function cloneSessionStarted(value: SessionStartedEvent): SessionStartedEvent {
  return deepFreeze({ ...value, payload: { ...value.payload } });
}

function cloneSubmissionObserved(value: SubmissionObservedEvent): SubmissionObservedEvent {
  return deepFreeze({ ...value, payload: { ...value.payload } });
}

function cloneVerdictObserved(value: VerdictObservedEvent): VerdictObservedEvent {
  return deepFreeze({ ...value, payload: { ...value.payload } });
}

function cloneSessionEnded(value: SessionEndedEvent): SessionEndedEvent {
  return deepFreeze({ ...value, payload: { ...value.payload } });
}

function nonempty(value: string | undefined | null): string | undefined {
  if (value === undefined || value === null) return undefined;
  const trimmed = value.trim();
  return trimmed.length === 0 ? undefined : trimmed;
}

function firstNonempty(values: readonly (string | undefined)[]): string | undefined {
  for (const value of values) {
    const normalized = nonempty(value);
    if (normalized !== undefined) return normalized;
  }
  return undefined;
}

function firstDefinedProvenance(
  values: readonly (CaptureProvenanceLevel | undefined)[],
): CaptureProvenanceLevel | undefined {
  for (const value of values) if (value !== undefined) return value;
  return undefined;
}

function validUrl(value: string | undefined): value is string {
  if (value === undefined) return false;
  try {
    const parsed = new URL(value);
    return parsed.href.length > 0;
  } catch {
    return false;
  }
}

function originOf(value: string): string {
  try {
    return new URL(value).origin;
  } catch {
    return "https://capture.invalid";
  }
}

function defaultCanonicalUrl(platform: Platform, problemExternalId: string): string {
  const encoded = encodeURIComponent(problemExternalId || "unknown");
  return `https://${platform}.invalid/problems/${encoded}`;
}

function compareTimes(left: string, right: string): number {
  const leftMs = Date.parse(left);
  const rightMs = Date.parse(right);
  if (Number.isFinite(leftMs) && Number.isFinite(rightMs)) return leftMs - rightMs;
  if (left === right) return 0;
  return left < right ? -1 : 1;
}

function earliestTime(left: string, right: string): string {
  return compareTimes(left, right) <= 0 ? left : right;
}

// ---------------------------------------------------------------------------
// Deterministic digest and deep immutability
// ---------------------------------------------------------------------------

/**
 * Returns the lowercase hex SHA-256 of a UTF-8 string.  Used for non-bundle
 * identity digests (e.g. session id derivation, synthetic E2 evidence id).
 * Bundle identity uses a separate length-prefixed encoding for collision
 * resistance against delimiter-mixing; see `canonicalIdentityEncoding`.
 *
 * Implementation note: the digest is computed by a module-local pure-JS
 * SHA-256 (see `sha256HexBytes`).  We deliberately avoid Node's `crypto`
 * module and the `Buffer` global so the file can be bundled into the Chrome
 * MV3 service worker under esbuild target `chrome120`.  The helper remains
 * synchronous so all existing call sites and tests keep their contract.
 */
function sha256Hex(value: string): string {
  return sha256HexBytes(new TextEncoder().encode(value));
}

/**
 * Concatenates a sequence of `Uint8Array` segments into a single
 * `Uint8Array`.  Pure-JS replacement for `Buffer.concat`; the Chrome MV3
 * service worker does not expose the `Buffer` global, but every other
 * runtime the extension can be tested in does.
 */
function concatBytes(parts: readonly Uint8Array[]): Uint8Array {
  let total = 0;
  for (const part of parts) total += part.length;
  const out = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

/**
 * Returns the lowercase hex SHA-256 of an arbitrary byte sequence.  Pure-JS
 * synchronous implementation of FIPS 180-4 SHA-256 with the standard initial
 * hash values and round constants; the output is byte-identical to Node's
 * `createHash("sha256").update(bytes).digest("hex")` (and to every other
 * conformant SHA-256 implementation), so bundle IDs and synthetic evidence
 * ids remain stable across runtimes.  Kept module-local on purpose: callers
 * should use `sha256Hex` for UTF-8 strings or pass already-encoded bytes
 * directly to this helper.
 */
function sha256HexBytes(bytes: Uint8Array): string {
  const K = SHA256_K;
  const H = new Uint32Array(SHA256_INITIAL_HASH);
  // Padding: append 0x80, pad with 0x00 until length ≡ 56 (mod 64), then
  // append the original bit length as a 64-bit big-endian integer.
  const bitLength = bytes.length * 8;
  const padLength = ((bytes.length + 9 + 63) >>> 6) << 6;
  const padded = new Uint8Array(padLength);
  padded.set(bytes);
  padded[bytes.length] = 0x80;
  const head = new DataView(padded.buffer);
  head.setUint32(padded.length - 8, Math.floor(bitLength / 0x100000000), false);
  head.setUint32(padded.length - 4, bitLength >>> 0, false);

  const W = new Uint32Array(64);
  for (let block = 0; block < padded.length; block += 64) {
    for (let i = 0; i < 16; i += 1) {
      W[i] = head.getUint32(block + (i * 4), false);
    }
    for (let i = 16; i < 64; i += 1) {
      const w15 = W[i - 15] as number;
      const w2 = W[i - 2] as number;
      const s0 = ((w15 >>> 7) | (w15 << 25))
        ^ ((w15 >>> 18) | (w15 << 14))
        ^ (w15 >>> 3);
      const s1 = ((w2 >>> 17) | (w2 << 15))
        ^ ((w2 >>> 19) | (w2 << 13))
        ^ (w2 >>> 10);
      W[i] = (((W[i - 16] as number) + s0 + (W[i - 7] as number) + s1) >>> 0);
    }
    let a = H[0] as number;
    let b = H[1] as number;
    let c = H[2] as number;
    let d = H[3] as number;
    let e = H[4] as number;
    let f = H[5] as number;
    let g = H[6] as number;
    let h = H[7] as number;
    for (let i = 0; i < 64; i += 1) {
      const bigS1 = ((e >>> 6) | (e << 26))
        ^ ((e >>> 11) | (e << 21))
        ^ ((e >>> 25) | (e << 7));
      const ch = ((e & f) ^ ((~e) & g)) >>> 0;
      const t1 = (h + bigS1 + ch + (K[i] as number) + (W[i] as number)) >>> 0;
      const bigS0 = ((a >>> 2) | (a << 30))
        ^ ((a >>> 13) | (a << 19))
        ^ ((a >>> 22) | (a << 10));
      const mj = (((a & b) ^ (a & c) ^ (b & c)) >>> 0);
      const t2 = (bigS0 + mj) >>> 0;
      h = g;
      g = f;
      f = e;
      e = (d + t1) >>> 0;
      d = c;
      c = b;
      b = a;
      a = (t1 + t2) >>> 0;
    }
    H[0] = (H[0] + a) >>> 0;
    H[1] = (H[1] + b) >>> 0;
    H[2] = (H[2] + c) >>> 0;
    H[3] = (H[3] + d) >>> 0;
    H[4] = (H[4] + e) >>> 0;
    H[5] = (H[5] + f) >>> 0;
    H[6] = (H[6] + g) >>> 0;
    H[7] = (H[7] + h) >>> 0;
  }

  const out = new Uint8Array(32);
  const tail = new DataView(out.buffer);
  for (let i = 0; i < 8; i += 1) {
    tail.setUint32(i * 4, H[i] as number, false);
  }
  let hex = "";
  for (let i = 0; i < out.length; i += 1) {
    const byte = out[i] as number;
    hex += ((byte >>> 4).toString(16)) + ((byte & 0x0f).toString(16));
  }
  return hex;
}

// SHA-256 round constants: first 32 bits of the fractional parts of the cube
// roots of the first 64 primes.  Defined as plain numbers rather than a
// Uint32Array constant so they share the same import-folding surface as the
// round body.
const SHA256_K: readonly number[] = [
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5,
  0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3,
  0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc,
  0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7,
  0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13,
  0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3,
  0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5,
  0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208,
  0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
];

// Initial hash values: first 32 bits of the fractional parts of the square
// roots of the first 8 primes.
const SHA256_INITIAL_HASH: readonly number[] = [
  0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a,
  0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19,
];

function deepFreeze<T>(value: T): T {
  if (typeof value !== "object" || value === null || Object.isFrozen(value)) return value;
  for (const key of Reflect.ownKeys(value)) deepFreeze(Reflect.get(value, key));
  Object.freeze(value);
  return value;
}
