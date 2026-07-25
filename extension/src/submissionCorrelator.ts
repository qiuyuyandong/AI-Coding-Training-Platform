/**
 * Strict Evidence Correlator (Phase A Task A3).
 *
 * This module is **pure**: it does not import any `chrome.*` API, does not
 * call `Date.now`/`Math.random`, does not access the DOM, does not perform
 * I/O, and has no side effects. It receives already-parsed Safe Evidence
 * plus a {@link CorrelationPolicy}, and emits correlation results.
 *
 * The correlator is the boundary between platform-observed E1 signals and
 * MAIN bridge summaries. It does **not** construct E2 evidence; when
 * correlation succeeds it returns the matched E1 plus the summary so that
 * the caller (the future Capture State Machine in Task A4) can mint an
 * E2 with a stable submission id. Avoiding E2 minting inside the
 * correlator prevents the module from holding forbidden raw-field
 * channels in scope and keeps E2 emission under caller control.
 *
 * Webrequest lifecycle: a single Chrome `requestId` is the key for one E1
 * record. Repeated signals (before_request / response_started / completed /
 * error_occurred / before_redirect) update the same record by `requestId`,
 * deduping on identity and taking the most recent `apiTimeStamp` while
 * preserving the earliest background `receivedAt`. Identity fields
 * (`platform`, `tabId`, `frameId`, `documentId`, `method`, `endpointKey`)
 * must be invariant under one `requestId`; an update that changes any of
 * these is rejected with a discriminated error.
 *
 * MAIN bridge summary to E1: the correlator filters pending records by
 * identity equality, the policy time window, and the cross-channel
 * monotonicity rule (`receivedAt` is monotonically non-decreasing across
 * channels). `apiTimeStamp` and `receivedAt` orderings are kept distinct;
 * `apiTimeStamp` is a Chrome-internal numeric clock, `receivedAt` is the
 * background-assigned ISO datetime string.
 *
 * Concurrency: two pending E1 candidates that satisfy the simple filter
 * stay `AMBIGUOUS` until a stronger per-platform signal (the summary's
 * `redirectEndpointKey` matching exactly one candidate's `redirectEndpointKey`,
 * or the summary's `externalSubmissionId` matching exactly one candidate's
 * recorded stable submission id via full `platform:externalSubmissionId`
 * equality) disambiguates them. There is no fuzzy nearest-request fallback;
 * missing disambiguation always returns `AMBIGUOUS` rather than guessing.
 *
 * Immutability: `CorrelatorState.records` is a frozen read-only wrapper
 * backed by a private Map. Public functions never expose the underlying
 * mutable map; state transitions and no-ops both return a new frozen
 * `CorrelatorState` whose contents compare equal to the input but differ
 * by object identity. `CorrelationRecord` values and the E1 evidence
 * they hold are also frozen on construction.
 */

import { parseSafeEvidence, type E1RequestObserved } from "@/extension/src/evidence";
import type { Platform } from "@/extension/src/adapters/contract";

// ---------------------------------------------------------------------------
// Closed enums
// ---------------------------------------------------------------------------

/**
 * Closed enum mirroring the A1 Safe Evidence `SAFE_AMBIGUITY_REASONS`. The
 * correlator never invents a new ambiguity reason; it only surfaces one of
 * the three values below.
 */
export const CORRELATOR_AMBIGUITY_REASONS = [
  "multiple_e1_candidates",
  "e1_window_expired",
  "bridge_message_unmatched",
] as const;
export type CorrelatorAmbiguityReason = typeof CORRELATOR_AMBIGUITY_REASONS[number];

/**
 * Closed enum mirroring the A1 Safe Evidence `SAFE_REJECTION_REASONS`.
 * Used when the correlator reports an E1 record that has been externally
 * rejected before it could form a correlation.
 */
export const CORRELATOR_REJECTION_REASONS = [
  "csrf_invalid",
  "csrf_expired",
  "auth_required",
  "auth_expired",
  "rate_limited",
  "business_rejection",
  "network_error",
  "timeout",
  "server_error",
  "malformed_response",
] as const;
export type CorrelatorRejectionReason = typeof CORRELATOR_REJECTION_REASONS[number];

/**
 * Closed enum of `markE1Outcome` values. Once an E1 record carries any of
 * these outcomes it can never correlate again.
 */
export const CORRELATOR_OUTCOMES = [
  "matched",
  "rejected",
  "expired",
  "canceled",
  "error",
] as const;
export type CorrelatorOutcome = typeof CORRELATOR_OUTCOMES[number];

/** All possible E1 lifecycle outcomes tracked by the correlator. */
export type E1LifecycleOutcome = "pending" | CorrelatorOutcome;

/**
 * Closed enum of `no_match` reasons. Distinct from ambiguity reasons; a
 * `no_match` is returned when zero candidates passed the filter.
 *
 * `error` is the diagnostic surface for an E1 record that the network layer
 * already marked terminal as a transport error; it is closed over the same
 * enum rather than overloading `expired` so callers can keep their dispatch
 * tables disjoint.
 */
export const CORRELATOR_NO_MATCH_REASONS = [
  "zero_candidates",
  "expired",
  "canceled",
  "error",
  "already_matched",
  "crossed_fields",
] as const;
export type CorrelatorNoMatchReason = typeof CORRELATOR_NO_MATCH_REASONS[number];

// ---------------------------------------------------------------------------
// Policy
// ---------------------------------------------------------------------------

/** Per-platform/per-call correlation policy. */
export type CorrelationPolicy = {
  /**
   * Maximum allowed absolute `apiTimeStamp` difference between a candidate
   * E1 and the MAIN bridge summary. Default `5000` ms.
   */
  readonly timeWindowMs: number;
  /**
   * Maximum candidate count the caller is willing to keep past the simple
   * filter before the correlator reports `AMBIGUOUS`. `Infinity` means no
   * cap.
   */
  readonly maxCandidateCount: number;
};

/** Default correlation policy: 5 second window, no candidate cap. */
export const DEFAULT_CORRELATION_POLICY: CorrelationPolicy = Object.freeze({
  timeWindowMs: 5000,
  maxCandidateCount: Number.POSITIVE_INFINITY,
});

/** Caller convenience: a `nowOrPolicy` parameter accepts either a policy or a bare ms window. */
export type NowOrPolicy = CorrelationPolicy | number;

function resolvePolicy(input: NowOrPolicy): CorrelationPolicy {
  if (typeof input === "number") {
    return { timeWindowMs: input, maxCandidateCount: Number.POSITIVE_INFINITY };
  }
  return input;
}

// ---------------------------------------------------------------------------
// Parse result type
// ---------------------------------------------------------------------------

export type ParseResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly reason: string };

// ---------------------------------------------------------------------------
// Summary schema + runtime validator
// ---------------------------------------------------------------------------

/**
 * Parsed summary from the MAIN bridge. The runtime bridge is owned by
 * Phase B; A3 only consumes summaries that already passed the parser.
 */
export type MainBridgeSummary = {
  readonly platform: Platform;
  readonly tabId: number;
  readonly frameId: number;
  readonly documentId: string;
  readonly method: string;
  readonly endpointKey: string;
  readonly apiTimeStamp: number;
  readonly externalSubmissionId?: string;
  readonly problemExternalId?: string;
  readonly redirectEndpointKey?: string;
  readonly receivedAt: string;
  readonly evidenceId: string;
};

/** Canonical UTC ISO datetime pattern enforced by the summary validator. */
const ISO_DATETIME_PATTERN
  = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])T([01]\d|2[0-3]):[0-5]\d:[0-5]\d(\.\d{3})?Z$/;

/**
 * Verifies the supplied datetime matches the canonical UTC ISO regex and
 * parses to the same instant after a `Date.parse` roundtrip, so that
 * non-existent Gregorian dates such as `2026-02-31` cannot slip past the
 * format-only check.
 */
function isCanonicalIsoUtc(value: string): boolean {
  if (!ISO_DATETIME_PATTERN.test(value)) return false;
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) return false;
  const canonical = value.includes(".") ? value : value.replace("Z", ".000Z");
  return new Date(parsed).toISOString() === canonical;
}

const KNOWN_PLATFORMS: ReadonlySet<string> = new Set([
  "leetcode",
  "nowcoder",
  "luogu",
  "codeforces",
  "atcoder",
]);

/**
 * Validate and normalize a candidate MAIN bridge summary. The validator
 * enforces canonical UTC ISO `receivedAt` (so lexicographic ordering equals
 * chronological ordering), finite nonnegative `apiTimeStamp`, non-empty
 * `evidenceId`, and a closed `platform` enum. The returned summary is
 * frozen and ready for the correlator.
 */
export function parseMainBridgeSummary(value: unknown): ParseResult<MainBridgeSummary> {
  if (typeof value !== "object" || value === null) {
    return { ok: false, reason: "summary must be a non-null object" };
  }
  const candidate = value as { readonly [key: string]: unknown };
  if (typeof candidate.platform !== "string" || !KNOWN_PLATFORMS.has(candidate.platform)) {
    return { ok: false, reason: `platform must be one of ${[...KNOWN_PLATFORMS].join("|")}` };
  }
  if (typeof candidate.tabId !== "number" || !Number.isInteger(candidate.tabId) || candidate.tabId < 0) {
    return { ok: false, reason: "tabId must be a non-negative integer" };
  }
  if (typeof candidate.frameId !== "number" || !Number.isInteger(candidate.frameId) || candidate.frameId < 0) {
    return { ok: false, reason: "frameId must be a non-negative integer" };
  }
  if (typeof candidate.documentId !== "string" || candidate.documentId.trim().length === 0) {
    return { ok: false, reason: "documentId must be a non-empty string" };
  }
  if (typeof candidate.method !== "string" || candidate.method.length === 0) {
    return { ok: false, reason: "method must be a non-empty string" };
  }
  if (typeof candidate.endpointKey !== "string" || candidate.endpointKey.length === 0) {
    return { ok: false, reason: "endpointKey must be a non-empty string" };
  }
  if (typeof candidate.apiTimeStamp !== "number"
    || !Number.isFinite(candidate.apiTimeStamp)
    || candidate.apiTimeStamp < 0) {
    return { ok: false, reason: "apiTimeStamp must be a finite nonnegative number" };
  }
  if (typeof candidate.receivedAt !== "string" || !isCanonicalIsoUtc(candidate.receivedAt)) {
    return { ok: false, reason: "receivedAt must be a canonical UTC ISO datetime (YYYY-MM-DDTHH:mm:ss.sssZ)" };
  }
  if (typeof candidate.evidenceId !== "string" || candidate.evidenceId.trim().length === 0) {
    return { ok: false, reason: "evidenceId must be a non-empty string" };
  }
  if (candidate.externalSubmissionId !== undefined
    && (typeof candidate.externalSubmissionId !== "string" || candidate.externalSubmissionId.trim().length === 0)) {
    return { ok: false, reason: "externalSubmissionId must be a non-empty string when present" };
  }
  if (candidate.problemExternalId !== undefined
    && (typeof candidate.problemExternalId !== "string" || candidate.problemExternalId.trim().length === 0)) {
    return { ok: false, reason: "problemExternalId must be a non-empty string when present" };
  }
  if (candidate.redirectEndpointKey !== undefined
    && (typeof candidate.redirectEndpointKey !== "string" || candidate.redirectEndpointKey.length === 0)) {
    return { ok: false, reason: "redirectEndpointKey must be a non-empty string when present" };
  }
  // KNOWN_PLATFORMS.has narrowed candidate.platform to a valid Platform union member.
  const platform = candidate.platform as Platform;
  const summary: MainBridgeSummary = Object.freeze({
    platform,
    tabId: candidate.tabId,
    frameId: candidate.frameId,
    documentId: candidate.documentId,
    method: candidate.method,
    endpointKey: candidate.endpointKey,
    apiTimeStamp: candidate.apiTimeStamp,
    receivedAt: candidate.receivedAt,
    evidenceId: candidate.evidenceId,
    ...(candidate.externalSubmissionId !== undefined
      ? { externalSubmissionId: candidate.externalSubmissionId }
      : {}),
    ...(candidate.problemExternalId !== undefined
      ? { problemExternalId: candidate.problemExternalId }
      : {}),
    ...(candidate.redirectEndpointKey !== undefined
      ? { redirectEndpointKey: candidate.redirectEndpointKey }
      : {}),
  });
  return { ok: true, value: summary };
}

// ---------------------------------------------------------------------------
// Identity / record / state
// ---------------------------------------------------------------------------

/** Identity fields that must remain invariant under one `requestId`. */
export type E1Identity = {
  readonly platform: Platform;
  readonly tabId: number;
  readonly frameId: number;
  readonly documentId: string;
  readonly method: string;
  readonly endpointKey: string;
};

/** One E1 lifecycle record inside the correlator state. */
export type CorrelationRecord = Readonly<{
  /** Most-recent merged E1 evidence for this `requestId`. */
  readonly evidence: E1RequestObserved;
  /** Terminal outcome that prevents further correlation. `pending` means still eligible. */
  readonly outcome: E1LifecycleOutcome;
  /** Stable submission id (`platform:externalSubmissionId`) once a prior correlation established it. */
  readonly stableSubmissionId: string | null;
  /** Reason recorded when `outcome === "rejected"`; null otherwise. */
  readonly rejectionReason: CorrelatorRejectionReason | null;
}>;

/**
 * Frozen lookup wrapper around the private record Map. Only read accessors
 * are exposed; there is no `set` / `clear` / `delete`, so callers cannot
 * mutate the underlying storage even if they hold a state reference.
 */
export interface ReadonlyCorrelatorRecords {
  readonly size: number;
  has(requestId: string): boolean;
  get(requestId: string): CorrelationRecord | undefined;
  keys(): IterableIterator<string>;
  values(): IterableIterator<CorrelationRecord>;
  entries(): IterableIterator<readonly [string, CorrelationRecord]>;
  [Symbol.iterator](): IterableIterator<readonly [string, CorrelationRecord]>;
}

/** Correlator state carried between calls. Frozen externally; records frozen internally. */
export type CorrelatorState = Readonly<{
  readonly records: ReadonlyCorrelatorRecords;
}>;

/** Identity-mismatch discriminated error returned by `mergeE1Lifecycle`. */
export type IdentityMismatchError = Readonly<{
  readonly kind: "identity_mismatch";
  readonly requestId: string;
  readonly expected: E1Identity;
  readonly observed: E1Identity;
}>;

/** Discriminated union returned by `mergeE1Lifecycle`. */
export type MergeE1Result =
  | { readonly kind: "merged"; readonly state: CorrelatorState }
  | { readonly kind: "identity_mismatch"; readonly error: IdentityMismatchError }
  | { readonly kind: "invalid_input"; readonly requestId: string; readonly reason: string };

/** Result of `correlateMainSummary`. */
export type CorrelationResult =
  | {
      readonly kind: "correlated";
      readonly matchedE1: E1RequestObserved;
      readonly summary: MainBridgeSummary;
      readonly disambiguatedBy: "unique" | "redirect_endpoint_key" | "external_submission_id";
    }
  | {
      readonly kind: "ambiguous";
      readonly reason: CorrelatorAmbiguityReason;
      readonly candidates: readonly E1RequestObserved[];
      readonly summary: MainBridgeSummary;
      readonly candidateCount: number;
    }
  | { readonly kind: "no_match"; readonly reason: CorrelatorNoMatchReason }
  | {
      readonly kind: "rejected";
      readonly requestId: string;
      readonly rejectionReason: CorrelatorRejectionReason;
    };

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function computeIdentity(evidence: E1RequestObserved): E1Identity {
  return {
    platform: evidence.platform,
    tabId: evidence.tabId,
    frameId: evidence.frameId,
    documentId: evidence.documentId,
    method: evidence.method,
    endpointKey: evidence.endpointKey,
  };
}

function identitiesEqual(a: E1Identity, b: E1Identity): boolean {
  return a.platform === b.platform
    && a.tabId === b.tabId
    && a.frameId === b.frameId
    && a.documentId === b.documentId
    && a.method === b.method
    && a.endpointKey === b.endpointKey;
}

/**
 * Run the safe-evidence parser on an already-typed E1 input and narrow to
 * the `E1RequestObserved` slice. The discriminated union narrows on both
 * `tier === "E1"` and `kind === "request_observed"` without an unsafe
 * cast: `parseSafeEvidence` returns `SafeEvidence`, and only
 * `E1RequestObserved` carries the `request_observed` kind literal.
 */
function validateE1Input(value: E1RequestObserved):
  | { readonly ok: true; readonly value: E1RequestObserved }
  | { readonly ok: false; readonly reason: string } {
  const parsed = parseSafeEvidence(value);
  if (!parsed.ok) return parsed;
  if (parsed.value.kind !== "request_observed") {
    return { ok: false, reason: `Expected kind request_observed, received "${parsed.value.kind}"` };
  }
  // `kind === "request_observed"` is unique to E1RequestObserved in the
  // SafeEvidence discriminated union, so TypeScript already narrows
  // `parsed.value` to E1RequestObserved without an unsafe cast.
  return { ok: true, value: parsed.value };
}

function freezeRecord(record: CorrelationRecord): CorrelationRecord {
  // Reuse already-frozen wrappers so state cloning preserves record
  // references and only the outer state identity changes.
  if (Object.isFrozen(record)) return record;
  return Object.freeze({
    evidence: freezeEvidence(record.evidence),
    outcome: record.outcome,
    stableSubmissionId: record.stableSubmissionId,
    rejectionReason: record.rejectionReason,
  });
}

function freezeEvidence(evidence: E1RequestObserved): E1RequestObserved {
  if (Object.isFrozen(evidence)) return evidence;
  // E1RequestObserved includes optional `statusCode` / `redirectEndpointKey`;
  // a shallow spread preserves their undefined-or-set shape while making the
  // resulting object non-extensible.
  return Object.freeze({ ...evidence });
}

/**
 * Build a frozen {@link ReadonlyCorrelatorRecords} backed by a private Map.
 * Every accessor is bound to the inner Map, which is never re-exposed; the
 * resulting wrapper object is itself frozen so callers cannot attach a
 * `set` method or replace existing ones.
 */
function buildRecords(
  entries: Iterable<readonly [string, CorrelationRecord]>,
): ReadonlyCorrelatorRecords {
  const map = new Map<string, CorrelationRecord>();
  for (const [k, v] of entries) map.set(k, freezeRecord(v));
  const wrapper = {
    size: map.size,
    has: (id: string): boolean => map.has(id),
    get: (id: string): CorrelationRecord | undefined => map.get(id),
    keys: (): IterableIterator<string> => map.keys(),
    values: (): IterableIterator<CorrelationRecord> => map.values(),
    entries: (): IterableIterator<readonly [string, CorrelationRecord]> => map.entries(),
    [Symbol.iterator]: (): IterableIterator<readonly [string, CorrelationRecord]> => map.entries(),
  };
  return Object.freeze(wrapper);
}

/**
 * Produce a new state whose records wrapper is a fresh private Map. Used
 * when no field-level change occurs but the caller still needs a fresh
 * reference (no-op transitions and unchanged merges).
 */
function cloneState(state: CorrelatorState): CorrelatorState {
  return Object.freeze({ records: buildRecords(state.records.entries()) });
}

/**
 * Produce a new state in which the record for `requestId` is replaced by
 * `record`. All other records are preserved.
 */
function setRecord(
  state: CorrelatorState,
  requestId: string,
  record: CorrelationRecord,
): CorrelatorState {
  return Object.freeze({ records: buildRecords(replaceEntry(state.records, requestId, record)) });
}

function* replaceEntry(
  records: ReadonlyCorrelatorRecords,
  requestId: string,
  record: CorrelationRecord,
): IterableIterator<readonly [string, CorrelationRecord]> {
  let replaced = false;
  for (const entry of records.entries()) {
    if (entry[0] === requestId) {
      yield [requestId, record];
      replaced = true;
      continue;
    }
    yield entry;
  }
  if (!replaced) yield [requestId, record];
}

/**
 * Pick a field that may be `undefined` between two lifecycle signals,
 * preferring the one from the LATER `apiTimeStamp` event. When only one
 * side has the value, that one is returned.
 */
function pickField<T>(
  existing: T | undefined,
  incoming: T | undefined,
  existingTs: number,
  incomingTs: number,
): T | undefined {
  const hasExisting = existing !== undefined;
  const hasIncoming = incoming !== undefined;
  if (hasExisting && hasIncoming) {
    return incomingTs >= existingTs ? incoming : existing;
  }
  if (hasIncoming) return incoming;
  if (hasExisting) return existing;
  return undefined;
}

/**
 * Merge two E1 evidence records for the same `requestId`. Caller is
 * responsible for proving identity equality first. Numeric ordering uses
 * `apiTimeStamp`; date-time ordering uses the lexicographic ISO format on
 * `receivedAt`. The two clocks are never mixed. The merged evidence is
 * frozen.
 */
function mergeE1Evidence(existing: E1RequestObserved, next: E1RequestObserved): E1RequestObserved {
  const apiTimeStamp = Math.max(existing.apiTimeStamp, next.apiTimeStamp);
  const receivedAt = existing.receivedAt <= next.receivedAt ? existing.receivedAt : next.receivedAt;
  const statusCode = pickField(existing.statusCode, next.statusCode, existing.apiTimeStamp, next.apiTimeStamp);
  const redirectEndpointKey = pickField(
    existing.redirectEndpointKey,
    next.redirectEndpointKey,
    existing.apiTimeStamp,
    next.apiTimeStamp,
  );

  // Lifecycle, evidenceId, and resourceType come from the latest observation.
  const latest = next.apiTimeStamp >= existing.apiTimeStamp ? next : existing;

  return Object.freeze({
    schemaVersion: 1 as const,
    evidenceId: latest.evidenceId,
    platform: latest.platform,
    tier: "E1" as const,
    kind: "request_observed" as const,
    receivedAt,
    tabId: latest.tabId,
    frameId: latest.frameId,
    documentId: latest.documentId,
    adapterVersion: latest.adapterVersion,
    requestId: latest.requestId,
    method: latest.method,
    endpointKey: latest.endpointKey,
    resourceType: latest.resourceType,
    lifecycle: latest.lifecycle,
    apiTimeStamp,
    ...(statusCode !== undefined ? { statusCode } : {}),
    ...(redirectEndpointKey !== undefined ? { redirectEndpointKey } : {}),
  });
}

function identityMatchesIdentity(record: CorrelationRecord, summary: MainBridgeSummary): boolean {
  const e = record.evidence;
  return e.platform === summary.platform
    && e.tabId === summary.tabId
    && e.frameId === summary.frameId
    && e.documentId === summary.documentId
    && e.method === summary.method
    && e.endpointKey === summary.endpointKey;
}

/**
 * The correlator never compares `apiTimeStamp` (Chrome-internal) against
 * `receivedAt` (background ISO). Window checks use `apiTimeStamp` only.
 */
function apiTimeStampWithinWindow(
  evidence: E1RequestObserved,
  summary: MainBridgeSummary,
  policy: CorrelationPolicy,
): boolean {
  if (!Number.isFinite(evidence.apiTimeStamp) || !Number.isFinite(summary.apiTimeStamp)) return false;
  const diff = Math.abs(evidence.apiTimeStamp - summary.apiTimeStamp);
  return Number.isFinite(diff) && diff <= policy.timeWindowMs;
}

/**
 * Background `receivedAt` strings are ISO-8601 in canonical UTC form, so
 * lexicographic comparison equals chronological comparison. The correlator
 * enforces monotonic non-decreasing order between E1 and the summary.
 */
function receivedAtMonotonicOrEqual(
  evidence: E1RequestObserved,
  summary: MainBridgeSummary,
): boolean {
  return evidence.receivedAt <= summary.receivedAt;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Initial empty correlator state.
 */
export function createCorrelatorState(): CorrelatorState {
  return Object.freeze({ records: buildRecords([]) });
}

/**
 * Merge a new E1 lifecycle event into the state.
 *
 * - Dedupes by `requestId`.
 * - Takes the most recent `apiTimeStamp`.
 * - Preserves the earliest background `receivedAt`.
 * - Rejects updates that change identity (`platform`/`tabId`/`frameId`/
 *   `documentId`/`method`/`endpointKey`) under the same `requestId` with
 *   a `kind: "identity_mismatch"` error.
 * - Rejects inputs that fail `parseSafeEvidence` with a `kind:
 *   "invalid_input"` error.
 *
 * The returned `state` is always a new immutable object; the input state
 * is never mutated.
 */
export function mergeE1Lifecycle(state: CorrelatorState, next: E1RequestObserved): MergeE1Result {
  const validated = validateE1Input(next);
  if (!validated.ok) {
    return { kind: "invalid_input", requestId: next.requestId, reason: validated.reason };
  }
  const incoming = validated.value;
  const existing = state.records.get(incoming.requestId);

  if (existing === undefined) {
    const fresh: CorrelationRecord = Object.freeze({
      evidence: freezeEvidence(incoming),
      outcome: "pending",
      stableSubmissionId: null,
      rejectionReason: null,
    });
    return {
      kind: "merged",
      state: setRecord(state, incoming.requestId, fresh),
    };
  }

  const expected = computeIdentity(existing.evidence);
  const observed = computeIdentity(incoming);
  if (!identitiesEqual(expected, observed)) {
    return {
      kind: "identity_mismatch",
      error: Object.freeze({
        kind: "identity_mismatch",
        requestId: incoming.requestId,
        expected: Object.freeze(expected),
        observed: Object.freeze(observed),
      }),
    };
  }

  const mergedEvidence = mergeE1Evidence(existing.evidence, incoming);
  const mergedRecord: CorrelationRecord = Object.freeze({
    evidence: mergedEvidence,
    outcome: existing.outcome,
    stableSubmissionId: existing.stableSubmissionId,
    rejectionReason: existing.rejectionReason,
  });
  return {
    kind: "merged",
    state: setRecord(state, incoming.requestId, mergedRecord),
  };
}

/**
 * Mark the lifecycle outcome of one E1 record. Records in any non-pending
 * terminal outcome can never be used for correlation again; subsequent
 * `correlateMainSummary` calls treat them as ineligible.
 *
 * Marking is idempotent and always returns a NEW state object; the input
 * state and its record map are never mutated.
 *
 * The `rejectionReason` argument is required when `outcome === "rejected"`
 * and must be omitted for every other outcome. The TypeScript overload
 * enforces this at compile time; the runtime implementation throws when
 * the constraint is violated by a dynamic caller.
 */
export function markE1Outcome(
  state: CorrelatorState,
  requestId: string,
  outcome: Exclude<CorrelatorOutcome, "rejected">,
): CorrelatorState;
export function markE1Outcome(
  state: CorrelatorState,
  requestId: string,
  outcome: "rejected",
  rejectionReason: CorrelatorRejectionReason,
): CorrelatorState;
export function markE1Outcome(
  state: CorrelatorState,
  requestId: string,
  outcome: CorrelatorOutcome,
  rejectionReason?: CorrelatorRejectionReason,
): CorrelatorState {
  const existing = state.records.get(requestId);
  if (existing === undefined) return cloneState(state);
  if (existing.outcome !== "pending") return cloneState(state);
  if (outcome === "rejected" && rejectionReason === undefined) {
    throw new Error("markE1Outcome with outcome 'rejected' requires a rejectionReason");
  }
  const reason: CorrelatorRejectionReason | null = outcome === "rejected" ? rejectionReason ?? null : null;
  const updated: CorrelationRecord = Object.freeze({
    evidence: existing.evidence,
    outcome,
    stableSubmissionId: existing.stableSubmissionId,
    rejectionReason: reason,
  });
  return setRecord(state, requestId, updated);
}

/**
 * Record a stable submission id on a previously-matched E1 record so
 * later correlations can disambiguate by `externalSubmissionId`.
 *
 * The supplied id must equal the platform-namespaced form
 * `${evidence.platform}:${externalSubmissionId}`. Callers that pass an
 * unprefixed id are normalized to the namespaced form; ids with a `:` that
 * do not start with the record's platform prefix are rejected as a no-op
 * (and still return a NEW state object). The function never mutates the
 * input state.
 */
export function recordStableIdentity(
  state: CorrelatorState,
  requestId: string,
  stableSubmissionId: string,
): CorrelatorState {
  const existing = state.records.get(requestId);
  if (existing === undefined) return cloneState(state);

  const prefix = `${existing.evidence.platform}:`;
  let normalized: string;
  if (stableSubmissionId.startsWith(prefix)) {
    normalized = stableSubmissionId;
  } else if (!stableSubmissionId.includes(":")) {
    normalized = `${prefix}${stableSubmissionId}`;
  } else {
    // Reject as a no-op: caller passed a namespaced id for a different
    // platform, which is a contract violation.
    return cloneState(state);
  }

  if (existing.stableSubmissionId === normalized) return cloneState(state);
  const updated: CorrelationRecord = Object.freeze({
    evidence: existing.evidence,
    outcome: existing.outcome,
    stableSubmissionId: normalized,
    rejectionReason: existing.rejectionReason,
  });
  return setRecord(state, requestId, updated);
}

/**
 * Correlate one parsed MAIN bridge summary against the current state.
 *
 * Returns a discriminated `CorrelationResult`:
 *
 * - `correlated` — exactly one legal candidate. The `matchedE1` field
 *   carries the surviving E1 evidence so the caller can mint an E2
 *   with its own submission id.
 * - `ambiguous` — two or more legal candidates, or one in-window plus
 *   one or more out-of-window candidates. The `reason` mirrors the A1
 *   Safe Evidence closed enum.
 * - `no_match` — zero candidates. The `reason` is closed over the six
 *   correlator outcomes plus the zero / crossed_fields diagnostics.
 * - `rejected` — a previously-rejected E1 candidate existed but
 *   provided no correlation path; the rejection reason mirrors the A1
 *   Safe Evidence `SAFE_REJECTION_REASONS` enum and is taken from the
 *   record itself rather than synthesized.
 *
 * The correlator enforces:
 *
 * - identity equality on `platform`/`tabId`/`frameId`/`documentId`/
 *   `method`/`endpointKey`;
 * - `apiTimeStamp` difference <= `policy.timeWindowMs`;
 * - `E1.receivedAt <= summary.receivedAt` (background monotonicity).
 *
 * Two clock orderings are never mixed: `apiTimeStamp` is numeric;
 * `receivedAt` is the lexicographic ordering of the ISO datetime strings.
 */
export function correlateMainSummary(
  state: CorrelatorState,
  summaryInput: MainBridgeSummary,
  nowOrPolicy: NowOrPolicy,
): CorrelationResult {
  const policy = resolvePolicy(nowOrPolicy);
  const validated = parseMainBridgeSummary(summaryInput);
  if (!validated.ok) {
    return { kind: "no_match", reason: "zero_candidates" };
  }
  const summary = validated.value;

  // Collect the E1 records that satisfy identity + window + monotonicity
  // and remain pending. We compute the result classes in priority order so
  // that a `no_match` can attribute failure to the most recent non-pending
  // record when nothing is eligible.
  const allRecords = [...state.records.values()];
  const pendingLegal: CorrelationRecord[] = [];
  const outOfWindowPending: CorrelationRecord[] = [];
  let lastRejected: CorrelationRecord | undefined;
  let lastExpired: CorrelationRecord | undefined;
  let lastCanceled: CorrelationRecord | undefined;
  let lastMatched: CorrelationRecord | undefined;
  let lastErrored: CorrelationRecord | undefined;
  let lastCrossedFields: CorrelationRecord | undefined;

  for (const record of allRecords) {
    const e = record.evidence;
    const sameIdentity = identityMatchesIdentity(record, summary);
    if (!sameIdentity) continue;
    const withinWindow = apiTimeStampWithinWindow(e, summary, policy);
    const monotonic = receivedAtMonotonicOrEqual(e, summary);

    if (!monotonic) {
      // Identity matches but receivedAt went backward — a crossed-field
      // signal. Track for diagnostic; never correlate.
      lastCrossedFields = record;
      continue;
    }
    if (!withinWindow) {
      if (record.outcome === "pending") outOfWindowPending.push(record);
      continue;
    }
    if (record.outcome === "rejected") {
      if (lastRejected === undefined) lastRejected = record;
      continue;
    }
    if (record.outcome === "expired") {
      if (lastExpired === undefined) lastExpired = record;
      continue;
    }
    if (record.outcome === "canceled") {
      if (lastCanceled === undefined) lastCanceled = record;
      continue;
    }
    if (record.outcome === "error") {
      if (lastErrored === undefined) lastErrored = record;
      continue;
    }
    if (record.outcome === "matched") {
      if (lastMatched === undefined) lastMatched = record;
      continue;
    }
    pendingLegal.push(record);
  }

  // Mixed in-window / out-of-window: surface the dangerous
  // `e1_window_expired` ambiguity before considering the in-window set.
  if (pendingLegal.length >= 1 && outOfWindowPending.length >= 1) {
    return {
      kind: "ambiguous",
      reason: "e1_window_expired",
      candidates: pendingLegal.map((r) => r.evidence),
      summary,
      candidateCount: pendingLegal.length,
    };
  }

  // Path: exactly one candidate. Correlate directly.
  if (pendingLegal.length === 1) {
    const [only] = pendingLegal;
    if (only === undefined) {
      // Defensive; pendingLegal.length === 1 guarantees this is reachable.
      return { kind: "no_match", reason: "zero_candidates" };
    }
    return {
      kind: "correlated",
      matchedE1: only.evidence,
      summary,
      disambiguatedBy: "unique",
    };
  }

  // Path: multiple candidates. Try disambiguation by per-platform redirect
  // or externalSubmissionId signal before falling back to AMBIGUOUS.
  if (pendingLegal.length >= 2) {
    const disambiguation = disambiguateBySummarySignals(pendingLegal, summary);
    if (disambiguation !== undefined) {
      return {
        kind: "correlated",
        matchedE1: disambiguation.record.evidence,
        summary,
        disambiguatedBy: disambiguation.signal,
      };
    }

    // Cap by policy maxCandidateCount when supplied.
    if (policy.maxCandidateCount !== Number.POSITIVE_INFINITY
      && pendingLegal.length > policy.maxCandidateCount) {
      return {
        kind: "ambiguous",
        reason: "multiple_e1_candidates",
        candidates: pendingLegal.slice(0, policy.maxCandidateCount).map((r) => r.evidence),
        summary,
        candidateCount: pendingLegal.length,
      };
    }

    return {
      kind: "ambiguous",
      reason: "multiple_e1_candidates",
      candidates: pendingLegal.map((r) => r.evidence),
      summary,
      candidateCount: pendingLegal.length,
    };
  }

  // Path: zero candidates. Distinguish reasons when state held a related
  // record that explains the absence. Rejected wins because a future
  // summary cannot un-reject; the A1 rejection taxonomy is preserved on
  // the record so the caller receives the real reason rather than a
  // fabricated one.
  if (lastRejected !== undefined) {
    return {
      kind: "rejected",
      requestId: lastRejected.evidence.requestId,
      rejectionReason: lastRejected.rejectionReason ?? "malformed_response",
    };
  }
  if (lastErrored !== undefined) {
    return { kind: "no_match", reason: "error" };
  }
  if (lastExpired !== undefined) {
    return { kind: "no_match", reason: "expired" };
  }
  if (lastCanceled !== undefined) {
    return { kind: "no_match", reason: "canceled" };
  }
  if (lastMatched !== undefined) {
    return { kind: "no_match", reason: "already_matched" };
  }
  if (lastCrossedFields !== undefined) {
    return { kind: "no_match", reason: "crossed_fields" };
  }
  return { kind: "no_match", reason: "zero_candidates" };
}

type Disambiguation =
  | { readonly signal: "redirect_endpoint_key"; readonly record: CorrelationRecord }
  | { readonly signal: "external_submission_id"; readonly record: CorrelationRecord };

function disambiguateBySummarySignals(
  candidates: readonly CorrelationRecord[],
  summary: MainBridgeSummary,
): Disambiguation | undefined {
  if (summary.redirectEndpointKey === undefined) {
    return disambiguateByExternalSubmissionId(candidates, summary);
  }
  const byRedirect = candidates.filter(
    (c) => c.evidence.redirectEndpointKey === summary.redirectEndpointKey,
  );
  if (byRedirect.length === 1) {
    const [only] = byRedirect;
    if (only === undefined) return undefined;
    return { signal: "redirect_endpoint_key", record: only };
  }
  if (byRedirect.length > 1) {
    // Several candidates saw the same redirect; try the external id signal.
    const byExternal = disambiguateByExternalSubmissionId(byRedirect, summary);
    if (byExternal !== undefined) return byExternal;
    return undefined;
  }
  // Zero candidates matched the redirect; fall back to the external id signal.
  return disambiguateByExternalSubmissionId(candidates, summary);
}

function disambiguateByExternalSubmissionId(
  candidates: readonly CorrelationRecord[],
  summary: MainBridgeSummary,
): Disambiguation | undefined {
  if (summary.externalSubmissionId === undefined) return undefined;
  // Full canonical equality: `${platform}:${externalSubmissionId}`. A
  // substring or endsWith comparison would silently correlate a summary
  // whose external id is a suffix of a previously-recorded namespaced
  // stable id, e.g. `"42"` matching `"leetcode:old:42"`.
  const expected = `${summary.platform}:${summary.externalSubmissionId}`;
  const byExternal = candidates.filter(
    (c) => c.stableSubmissionId !== null && c.stableSubmissionId === expected,
  );
  if (byExternal.length === 1) {
    const [only] = byExternal;
    if (only === undefined) return undefined;
    return { signal: "external_submission_id", record: only };
  }
  return undefined;
}

/**
 * Derive a deterministic `platform:externalSubmissionId` namespaced id
 * when the candidate (here: the summary) provides a submission id. The
 * namespacing guarantees submissions from different platforms cannot
 * collide when they reach the V3 atomic bundle / SQLite projection.
 *
 * Returns `null` when the summary does not carry an external submission
 * id. The function is referentially transparent: identical inputs yield
 * identical outputs.
 */
export function selectStableSubmissionIdentity(
  _state: CorrelatorState,
  summary: MainBridgeSummary,
): string | null {
  if (summary.externalSubmissionId === undefined) return null;
  const trimmed = summary.externalSubmissionId.trim();
  if (trimmed.length === 0) return null;
  return `${summary.platform}:${trimmed}`;
}

/**
 * Public aggregate namespace. Consumers may either import individual
 * functions or destructure the `evidenceCorrelator` namespace.
 */
export const evidenceCorrelator = Object.freeze({
  createCorrelatorState,
  mergeE1Lifecycle,
  markE1Outcome,
  recordStableIdentity,
  correlateMainSummary,
  selectStableSubmissionIdentity,
  parseMainBridgeSummary,
});