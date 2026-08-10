import {
  pruneUiHints,
  readStoredUiHints,
  type StoredUiHint,
} from "./uiHint";
import {
  parseSafeEvidence,
  type E1RequestObserved,
  type E3FinalVerdictConfirmed,
} from "./evidence";
import type { Platform } from "./platforms";

export const E1_LIFECYCLE_TTL_MS = 5 * 60_000;
export const UNMATCHED_E3_TTL_MS = 60_000;
export const PAGE_CONTEXT_TTL_MS = 30 * 60_000;
export const AMBIGUITY_TTL_MS = 24 * 60 * 60_000;
export const VERDICT_CANDIDATE_TTL_MS = E1_LIFECYCLE_TTL_MS;
export const VERDICT_CANDIDATE_MAX_COUNT = 32;

export type TransientE1Lifecycle = Readonly<{
  schemaVersion: 1;
  tier: "E1";
  kind: "request_lifecycle";
  evidence: E1RequestObserved;
  outcome: "pending" | "matched" | "rejected" | "expired" | "canceled" | "error";
  stableSubmissionId: string | null;
  rejectionReason: string | null;
  receivedAt: string;
}>;

export type TransientPageContext = Readonly<{
  schemaVersion: 1;
  tier: "E0";
  kind: "page_context";
  platform: Platform;
  tabId: number;
  frameId: number;
  documentId: string;
  problemExternalId?: string;
  receivedAt: string;
}>;

export type TransientUnmatchedFinal = Readonly<{
  schemaVersion: 1;
  tier: "E3";
  kind: "unmatched_final";
  evidence: E3FinalVerdictConfirmed;
  receivedAt: string;
}>;

export type TransientVerdictCandidate = Readonly<{
  schemaVersion: 1;
  tier: "E3";
  kind: "verdict_candidate";
  candidateId: string;
  platform: "leetcode";
  problemExternalId: string;
  verdict: string;
  observedAt: string;
  tabId: number;
  frameId: number;
  documentId: string;
  transitionEvidence:
    | "same_document_transition"
    | "exact_result_document";
  receivedAt: string;
  /**
   * Additive binding for candidates emitted by an armed LeetCode submit
   * epoch.  Omitted on legacy passive candidates; the compatibility path is
   * intentionally request-unbound and never fabricates this value.
   */
  submitRequestId?: string;
}>;

export type TransientAmbiguityDiagnosticReason =
  | "multiple_e1_candidates"
  | "e1_window_expired"
  | "bridge_message_unmatched"
  | "corrupt_record"
  | "schema_version_mismatch"
  | "unknown_kind"
  | "unknown_field"
  | "malformed_timestamp"
  | "control_character_in_identity";

/**
 * Stable identity fields attached to a diagnostic so dedupe can pivot on the
 * originating bridge input rather than only on `receivedAt`. Each field is
 * independently optional; a record may carry any subset. Field bounds match
 * the existing parser contract:
 *
 *  - `evidenceId` / `documentId` are identifier strings (1-128 chars,
 *    no control characters).
 *  - `tabId` / `frameId` are non-negative integers.
 *  - `endpointKey` is a 1-256 char string (no URL pattern requirement so a
 *    malformed legacy value can still survive a write/read cycle).
 */
export type TransientAmbiguityDiagnosticIdentity = Readonly<{
  readonly evidenceId?: string;
  readonly tabId?: number;
  readonly frameId?: number;
  readonly documentId?: string;
  readonly endpointKey?: string;
}>;

export type TransientAmbiguityDiagnostic = Readonly<{
  schemaVersion: 1;
  tier: "E1";
  kind: "ambiguity_diagnostic";
  reason: TransientAmbiguityDiagnosticReason;
  receivedAt: string;
  evidenceId?: string;
  tabId?: number;
  frameId?: number;
  documentId?: string;
  endpointKey?: string;
}>;

export type TransientSessionEvidenceState = Readonly<{
  uiHints: readonly StoredUiHint[];
  requestLifecycles: readonly TransientE1Lifecycle[];
  pageContexts: readonly TransientPageContext[];
  unmatchedE3: readonly TransientUnmatchedFinal[];
  verdictCandidates: readonly TransientVerdictCandidate[];
  ambiguityDiagnostics: readonly TransientAmbiguityDiagnostic[];
}>;

export interface TransientEvidenceStorage {
  get(keys: readonly string[]): Promise<Record<string, unknown>>;
  set(items: Record<string, unknown>): Promise<void>;
}

const EMPTY = Object.freeze([]) as readonly never[];

export const emptyTransientSessionEvidenceState = (): TransientSessionEvidenceState => Object.freeze({
  uiHints: EMPTY as readonly StoredUiHint[],
  requestLifecycles: EMPTY as readonly TransientE1Lifecycle[],
  pageContexts: EMPTY as readonly TransientPageContext[],
  unmatchedE3: EMPTY as readonly TransientUnmatchedFinal[],
  verdictCandidates: EMPTY as readonly TransientVerdictCandidate[],
  ambiguityDiagnostics: EMPTY as readonly TransientAmbiguityDiagnostic[],
});

/**
 * Deterministic pure candidate identity. The parser rejects raw control
 * characters before storage, so the identity must be a printable string too:
 * JSON.stringify escapes any control character as \uXXXX, keeping the joined
 * result control-free while remaining collision-free and order-deterministic.
 */
export function verdictCandidateIdentity(
  candidate: Pick<
    TransientVerdictCandidate,
    | "platform"
    | "tabId"
    | "frameId"
    | "documentId"
    | "problemExternalId"
    | "observedAt"
    | "submitRequestId"
  >,
): string {
  const fields = [
    candidate.platform,
    String(candidate.tabId),
    String(candidate.frameId),
    candidate.documentId,
    candidate.problemExternalId,
    candidate.observedAt,
  ];
  return candidate.submitRequestId === undefined
    ? JSON.stringify(fields)
    : JSON.stringify([...fields, candidate.submitRequestId]);
}

const ISO_DATE_PATTERN = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])T([01]\d|2[0-3]):[0-5]\d:[0-5]\d(\.\d{3})?Z$/;
const CONTROL_CHAR_PATTERN = /[\x00-\x1f\x7f]/;

const PLATFORMS = new Set<string>(["leetcode", "nowcoder", "luogu", "codeforces", "atcoder"]);

const objectRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null;
const nonempty = (v: unknown): v is string => typeof v === "string" && v.length > 0;
const integer = (v: unknown): v is number => typeof v === "number" && Number.isInteger(v);
const isoDatetime = (v: unknown): v is string =>
  typeof v === "string" && ISO_DATE_PATTERN.test(v) && Number.isFinite(Date.parse(v));
const hasOnly = (v: Record<string, unknown>, keys: readonly string[]): boolean =>
  Object.keys(v).every((k) => keys.includes(k));
const freezeArray = <T>(v: readonly T[]): readonly T[] => Object.freeze([...v]);
const diagnostic = (
  reason: TransientAmbiguityDiagnosticReason,
  now: string,
): TransientAmbiguityDiagnostic =>
  Object.freeze({
    schemaVersion: 1,
    tier: "E1",
    kind: "ambiguity_diagnostic",
    reason,
    receivedAt: now,
  });

/**
 * Build a diagnostic with optional stable identity fields. Optional fields
 * are only attached when defined; undefined values are dropped so the
 * resulting object never carries an explicit `undefined` key. The returned
 * object is frozen.
 *
 * Callers that only need `reason` + `receivedAt` should keep using the
 * internal `diagnostic` helper to avoid constructing an empty identity.
 */
export function createDiagnostic(
  reason: TransientAmbiguityDiagnosticReason,
  now: string,
  identity?: TransientAmbiguityDiagnosticIdentity,
): TransientAmbiguityDiagnostic {
  const value: {
    schemaVersion: 1;
    tier: "E1";
    kind: "ambiguity_diagnostic";
    reason: TransientAmbiguityDiagnosticReason;
    receivedAt: string;
    evidenceId?: string;
    tabId?: number;
    frameId?: number;
    documentId?: string;
    endpointKey?: string;
  } = {
    schemaVersion: 1,
    tier: "E1",
    kind: "ambiguity_diagnostic",
    reason,
    receivedAt: now,
  };
  if (identity?.evidenceId !== undefined) value.evidenceId = identity.evidenceId;
  if (identity?.tabId !== undefined) value.tabId = identity.tabId;
  if (identity?.frameId !== undefined) value.frameId = identity.frameId;
  if (identity?.documentId !== undefined) value.documentId = identity.documentId;
  if (identity?.endpointKey !== undefined) value.endpointKey = identity.endpointKey;
  return Object.freeze(value);
}

type LifecycleOutcome = TransientE1Lifecycle["outcome"];

const LIFECYCLE_OUTCOMES: readonly LifecycleOutcome[] = [
  "pending",
  "matched",
  "rejected",
  "expired",
  "canceled",
  "error",
];

const DIAGNOSTIC_REASONS: readonly TransientAmbiguityDiagnosticReason[] = [
  "multiple_e1_candidates",
  "e1_window_expired",
  "bridge_message_unmatched",
  "corrupt_record",
  "schema_version_mismatch",
  "unknown_kind",
  "unknown_field",
  "malformed_timestamp",
  "control_character_in_identity",
];

const LIFECYCLE_KEYS: readonly string[] = [
  "schemaVersion",
  "tier",
  "kind",
  "evidence",
  "outcome",
  "stableSubmissionId",
  "rejectionReason",
  "receivedAt",
];

const PAGE_CONTEXT_KEYS: readonly string[] = [
  "schemaVersion",
  "tier",
  "kind",
  "platform",
  "tabId",
  "frameId",
  "documentId",
  "problemExternalId",
  "receivedAt",
];

const UNMATCHED_FINAL_KEYS: readonly string[] = [
  "schemaVersion",
  "tier",
  "kind",
  "evidence",
  "receivedAt",
];

const VERDICT_CANDIDATE_KEYS: readonly string[] = [
  "schemaVersion",
  "tier",
  "kind",
  "candidateId",
  "platform",
  "problemExternalId",
  "verdict",
  "observedAt",
  "tabId",
  "frameId",
  "documentId",
  "transitionEvidence",
  "receivedAt",
  "submitRequestId",
];

const DIAGNOSTIC_KEYS: readonly string[] = [
  "schemaVersion",
  "tier",
  "kind",
  "reason",
  "receivedAt",
  "evidenceId",
  "tabId",
  "frameId",
  "documentId",
  "endpointKey",
];

function parseLifecycle(
  v: unknown,
): { readonly value?: TransientE1Lifecycle; readonly reason: TransientAmbiguityDiagnosticReason } {
  if (!objectRecord(v)) return { reason: "corrupt_record" };
  if (v.schemaVersion !== 1) return { reason: "schema_version_mismatch" };
  if (v.tier !== "E1") return { reason: "unknown_kind" };
  if (v.kind !== "request_lifecycle") return { reason: "unknown_kind" };
  if (!hasOnly(v, LIFECYCLE_KEYS)) return { reason: "unknown_field" };
  if (!isoDatetime(v.receivedAt)) return { reason: "malformed_timestamp" };
  const evidenceResult = parseSafeEvidence(v.evidence);
  if (!evidenceResult.ok) return { reason: "corrupt_record" };
  if (evidenceResult.value.tier !== "E1") return { reason: "unknown_kind" };
  if (evidenceResult.value.kind !== "request_observed") return { reason: "unknown_kind" };
  const outcome = v.outcome;
  if (typeof outcome !== "string" || !LIFECYCLE_OUTCOMES.includes(outcome as LifecycleOutcome)) {
    return { reason: "unknown_field" };
  }
  if (v.stableSubmissionId !== null && (typeof v.stableSubmissionId !== "string" || v.stableSubmissionId.length === 0)) {
    return { reason: "unknown_field" };
  }
  if (v.rejectionReason !== null && (typeof v.rejectionReason !== "string" || v.rejectionReason.length === 0)) {
    return { reason: "unknown_field" };
  }
  if (typeof v.stableSubmissionId === "string" && CONTROL_CHAR_PATTERN.test(v.stableSubmissionId)) {
    return { reason: "control_character_in_identity" };
  }
  if (typeof v.rejectionReason === "string" && CONTROL_CHAR_PATTERN.test(v.rejectionReason)) {
    return { reason: "control_character_in_identity" };
  }
  return {
    value: Object.freeze({
      schemaVersion: 1,
      tier: "E1",
      kind: "request_lifecycle",
      evidence: evidenceResult.value,
      outcome: outcome as LifecycleOutcome,
      stableSubmissionId: v.stableSubmissionId as string | null,
      rejectionReason: v.rejectionReason as string | null,
      receivedAt: v.receivedAt,
    }),
    reason: "corrupt_record",
  };
}

function parsePage(
  v: unknown,
): { readonly value?: TransientPageContext; readonly reason: TransientAmbiguityDiagnosticReason } {
  if (!objectRecord(v)) return { reason: "corrupt_record" };
  if (v.schemaVersion !== 1) return { reason: "schema_version_mismatch" };
  if (v.tier !== "E0") return { reason: "unknown_kind" };
  if (v.kind !== "page_context") return { reason: "unknown_kind" };
  if (!hasOnly(v, PAGE_CONTEXT_KEYS)) return { reason: "unknown_field" };
  if (typeof v.platform !== "string" || !PLATFORMS.has(v.platform)) return { reason: "unknown_field" };
  if (!integer(v.tabId) || !integer(v.frameId)) return { reason: "unknown_field" };
  if (!nonempty(v.documentId)) return { reason: "unknown_field" };
  if (!isoDatetime(v.receivedAt)) return { reason: "malformed_timestamp" };
  if (v.problemExternalId !== undefined && !nonempty(v.problemExternalId)) {
    return { reason: "unknown_field" };
  }
  if (typeof v.documentId === "string" && CONTROL_CHAR_PATTERN.test(v.documentId)) {
    return { reason: "control_character_in_identity" };
  }
  return {
    value: Object.freeze({
      schemaVersion: 1,
      tier: "E0",
      kind: "page_context",
      platform: v.platform as Platform,
      tabId: v.tabId,
      frameId: v.frameId,
      documentId: v.documentId,
      ...(v.problemExternalId === undefined ? {} : { problemExternalId: v.problemExternalId }),
      receivedAt: v.receivedAt,
    }),
    reason: "corrupt_record",
  };
}

function parseFinal(
  v: unknown,
): { readonly value?: TransientUnmatchedFinal; readonly reason: TransientAmbiguityDiagnosticReason } {
  if (!objectRecord(v)) return { reason: "corrupt_record" };
  if (v.schemaVersion !== 1) return { reason: "schema_version_mismatch" };
  if (v.tier !== "E3") return { reason: "unknown_kind" };
  if (v.kind !== "unmatched_final") return { reason: "unknown_kind" };
  if (!hasOnly(v, UNMATCHED_FINAL_KEYS)) return { reason: "unknown_field" };
  if (!isoDatetime(v.receivedAt)) return { reason: "malformed_timestamp" };
  const evidenceResult = parseSafeEvidence(v.evidence);
  if (!evidenceResult.ok) return { reason: "corrupt_record" };
  if (evidenceResult.value.tier !== "E3") return { reason: "unknown_kind" };
  if (evidenceResult.value.kind !== "final_verdict_confirmed") return { reason: "unknown_kind" };
  return {
    value: Object.freeze({
      schemaVersion: 1,
      tier: "E3",
      kind: "unmatched_final",
      evidence: evidenceResult.value,
      receivedAt: v.receivedAt,
    }),
    reason: "corrupt_record",
  };
}

function parseVerdictCandidate(
  v: unknown,
): { readonly value?: TransientVerdictCandidate; readonly reason: TransientAmbiguityDiagnosticReason } {
  if (!objectRecord(v)) return { reason: "corrupt_record" };
  if (v.schemaVersion !== 1) return { reason: "schema_version_mismatch" };
  if (v.tier !== "E3") return { reason: "unknown_kind" };
  if (v.kind !== "verdict_candidate") return { reason: "unknown_kind" };
  if (!hasOnly(v, VERDICT_CANDIDATE_KEYS)) return { reason: "unknown_field" };
  if (v.platform !== "leetcode") return { reason: "unknown_kind" };
  if (!nonempty(v.candidateId) || !nonempty(v.problemExternalId) || !nonempty(v.verdict)) {
    return { reason: "unknown_field" };
  }
  if (!nonempty(v.documentId)) return { reason: "unknown_field" };
  if (!integer(v.tabId) || !integer(v.frameId)) return { reason: "unknown_field" };
  if (!isoDatetime(v.observedAt) || !isoDatetime(v.receivedAt)) return { reason: "malformed_timestamp" };
  if (v.transitionEvidence !== "same_document_transition" && v.transitionEvidence !== "exact_result_document") {
    return { reason: "unknown_field" };
  }
  const identityStrings = [
    v.candidateId,
    v.problemExternalId,
    v.verdict,
    v.documentId,
    v.submitRequestId,
  ];
  for (const value of identityStrings) {
    if (typeof value === "string" && CONTROL_CHAR_PATTERN.test(value)) {
      return { reason: "control_character_in_identity" };
    }
  }
  if (v.submitRequestId !== undefined
    && (typeof v.submitRequestId !== "string"
      || !/^[A-Za-z0-9][A-Za-z0-9._:/-]{0,199}$/u.test(v.submitRequestId))) {
    return { reason: CONTROL_CHAR_PATTERN.test(String(v.submitRequestId))
      ? "control_character_in_identity"
      : "unknown_field" };
  }
  if (v.submitRequestId !== undefined
    && v.candidateId !== verdictCandidateIdentity({
      platform: "leetcode",
      tabId: v.tabId,
      frameId: v.frameId,
      documentId: v.documentId,
      problemExternalId: v.problemExternalId,
      observedAt: v.observedAt,
      submitRequestId: v.submitRequestId,
    })) {
    // Armed candidates are accepted only with the identity generated from
    // their complete request-bound tuple.  A legacy candidate without the
    // additive field remains compatible and is intentionally not recomputed.
    return { reason: "unknown_field" };
  }
  const parsed: {
    schemaVersion: 1;
    tier: "E3";
    kind: "verdict_candidate";
    candidateId: string;
    platform: "leetcode";
    problemExternalId: string;
    verdict: string;
    observedAt: string;
    tabId: number;
    frameId: number;
    documentId: string;
    transitionEvidence: TransientVerdictCandidate["transitionEvidence"];
    receivedAt: string;
    submitRequestId?: string;
  } = {
      schemaVersion: 1,
      tier: "E3",
      kind: "verdict_candidate",
      candidateId: v.candidateId,
      platform: "leetcode",
      problemExternalId: v.problemExternalId,
      verdict: v.verdict,
      observedAt: v.observedAt,
      tabId: v.tabId,
      frameId: v.frameId,
      documentId: v.documentId,
      transitionEvidence: v.transitionEvidence,
      receivedAt: v.receivedAt,
  };
  if (v.submitRequestId !== undefined) parsed.submitRequestId = v.submitRequestId;
  return {
    value: Object.freeze(parsed),
    reason: "corrupt_record",
  };
}

function parseDiagnostic(
  v: unknown,
): { readonly value?: TransientAmbiguityDiagnostic; readonly reason: TransientAmbiguityDiagnosticReason } {
  if (!objectRecord(v)) return { reason: "corrupt_record" };
  if (v.schemaVersion !== 1) return { reason: "schema_version_mismatch" };
  if (v.tier !== "E1") return { reason: "unknown_kind" };
  if (v.kind !== "ambiguity_diagnostic") return { reason: "unknown_kind" };
  if (!hasOnly(v, DIAGNOSTIC_KEYS)) return { reason: "unknown_field" };
  if (!isoDatetime(v.receivedAt)) return { reason: "malformed_timestamp" };
  if (typeof v.reason !== "string" || !DIAGNOSTIC_REASONS.includes(v.reason as TransientAmbiguityDiagnosticReason)) {
    return { reason: "unknown_field" };
  }
  // Optional identity fields. Invalid values are dropped silently so the
  // surrounding diagnostic record still survives a read/write cycle.
  const candidate: {
    schemaVersion: 1;
    tier: "E1";
    kind: "ambiguity_diagnostic";
    reason: TransientAmbiguityDiagnosticReason;
    receivedAt: string;
    evidenceId?: string;
    tabId?: number;
    frameId?: number;
    documentId?: string;
    endpointKey?: string;
  } = {
    schemaVersion: 1,
    tier: "E1",
    kind: "ambiguity_diagnostic",
    reason: v.reason as TransientAmbiguityDiagnosticReason,
    receivedAt: v.receivedAt,
  };
  if (v.evidenceId !== undefined) {
    if (typeof v.evidenceId === "string"
      && v.evidenceId.length >= 1
      && v.evidenceId.length <= 128
      && !CONTROL_CHAR_PATTERN.test(v.evidenceId)) {
      candidate.evidenceId = v.evidenceId;
    }
  }
  if (v.tabId !== undefined && integer(v.tabId)) {
    candidate.tabId = v.tabId;
  }
  if (v.frameId !== undefined && integer(v.frameId)) {
    candidate.frameId = v.frameId;
  }
  if (v.documentId !== undefined) {
    if (typeof v.documentId === "string"
      && v.documentId.length >= 1
      && v.documentId.length <= 128
      && !CONTROL_CHAR_PATTERN.test(v.documentId)) {
      candidate.documentId = v.documentId;
    }
  }
  if (v.endpointKey !== undefined) {
    if (typeof v.endpointKey === "string"
      && v.endpointKey.length >= 1
      && v.endpointKey.length <= 256) {
      candidate.endpointKey = v.endpointKey;
    }
  }
  return {
    value: Object.freeze(candidate),
    reason: "corrupt_record",
  };
}

export function readTransientSessionEvidenceState(
  stored: Record<string, unknown>,
): TransientSessionEvidenceState {
  const diagnostics: TransientAmbiguityDiagnostic[] = [];
  const now = new Date(0).toISOString();
  const read = <T>(
    value: unknown,
    parser: (v: unknown) => { readonly value?: T; readonly reason: TransientAmbiguityDiagnosticReason },
  ): T[] => {
    if (!Array.isArray(value)) return [];
    return value.flatMap((v) => {
      const result = parser(v);
      if (result.value !== undefined) return [result.value];
      diagnostics.push(diagnostic(result.reason, now));
      return [];
    });
  };
  const existingDiagnostics = read(stored.transientAmbiguityDiagnostics, parseDiagnostic);
  for (const d of existingDiagnostics) diagnostics.push(d);
  return Object.freeze({
    uiHints: freezeArray(readStoredUiHints(stored.uiHints)),
    requestLifecycles: freezeArray(read(stored.transientE1, parseLifecycle)),
    pageContexts: freezeArray(read(stored.transientPageContexts, parsePage)),
    unmatchedE3: freezeArray(read(stored.transientUnmatchedE3, parseFinal)),
    verdictCandidates: freezeArray(read(stored.transientVerdictCandidates, parseVerdictCandidate)),
    ambiguityDiagnostics: freezeArray(diagnostics.slice(-32)),
  });
}

function sessionItems(state: TransientSessionEvidenceState): Record<string, unknown> {
  return Object.freeze({
    uiHints: state.uiHints,
    transientE1: state.requestLifecycles,
    transientPageContexts: state.pageContexts,
    transientUnmatchedE3: state.unmatchedE3,
    transientVerdictCandidates: state.verdictCandidates,
    transientAmbiguityDiagnostics: state.ambiguityDiagnostics,
  });
}

export function planTransientSessionEvidenceWrite(
  state: TransientSessionEvidenceState,
): { readonly items: Record<string, unknown> } {
  return Object.freeze({ items: sessionItems(state) });
}

const expired = (at: string, now: string, ttl: number): boolean => {
  const a = Date.parse(at);
  const n = Date.parse(now);
  return !Number.isFinite(a) || !Number.isFinite(n) || a > n || n - a >= ttl;
};

export function pruneTransientSessionEvidence(
  state: TransientSessionEvidenceState,
  now: string,
): TransientSessionEvidenceState {
  const docs = new Set(
    state.requestLifecycles
      .filter((r) => !expired(r.receivedAt, now, E1_LIFECYCLE_TTL_MS))
      .map((r) => r.evidence.documentId),
  );
  return Object.freeze({
    uiHints: freezeArray(pruneUiHints(state.uiHints, now)),
    requestLifecycles: freezeArray(
      state.requestLifecycles.filter((r) => !expired(r.receivedAt, now, E1_LIFECYCLE_TTL_MS)),
    ),
    pageContexts: freezeArray(
      state.pageContexts.filter(
        (p) => !expired(p.receivedAt, now, PAGE_CONTEXT_TTL_MS) && docs.has(p.documentId),
      ),
    ),
    unmatchedE3: freezeArray(
      state.unmatchedE3.filter((r) => !expired(r.receivedAt, now, UNMATCHED_E3_TTL_MS)),
    ),
    verdictCandidates: freezeArray(
      state.verdictCandidates
        .filter((c) => !expired(c.receivedAt, now, VERDICT_CANDIDATE_TTL_MS))
        .slice(-VERDICT_CANDIDATE_MAX_COUNT),
    ),
    ambiguityDiagnostics: freezeArray(
      state.ambiguityDiagnostics.filter((r) => !expired(r.receivedAt, now, AMBIGUITY_TTL_MS)),
    ),
  });
}

export function planTransientSessionEvidencePrune(
  state: TransientSessionEvidenceState,
  now: string,
): { readonly items: Record<string, unknown> } {
  return planTransientSessionEvidenceWrite(pruneTransientSessionEvidence(state, now));
}

export async function pruneAndWriteTransientSessionEvidence(
  storage: TransientEvidenceStorage,
  now: string = new Date(0).toISOString(),
): Promise<TransientSessionEvidenceState> {
  const current = readTransientSessionEvidenceState(
    await storage.get(["uiHints", "transientE1", "transientPageContexts", "transientUnmatchedE3", "transientVerdictCandidates", "transientAmbiguityDiagnostics"]),
  );
  const next = pruneTransientSessionEvidence(current, now);
  if (JSON.stringify(current) !== JSON.stringify(next)) await storage.set(sessionItems(next));
  return next;
}
