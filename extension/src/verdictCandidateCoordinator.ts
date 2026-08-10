import {
  VERDICT_CANDIDATE_TTL_MS,
  type TransientE1Lifecycle,
  type TransientVerdictCandidate,
} from "./transientEvidenceStorage";
import type { ConfirmedSubmissionRecord } from "./confirmedSubmissionStorage";

export type VerdictCandidateResolution = Readonly<{
  candidateId: string;
  platform: "leetcode";
  problemExternalId: string;
  externalSubmissionId: string;
  verdict: string;
  observedAt: string;
  tabId: number;
  frameId: number;
  documentId: string;
}>;

export type VerdictCandidateTerminalReason =
  | "ambiguous_latest_submit"
  | "identity_mismatch"
  | "chronology_mismatch"
  | "expired"
  | "adapter";

export type VerdictCandidateTerminal = Readonly<{
  candidateId: string;
  platform: "leetcode";
  problemExternalId: string;
  reason: VerdictCandidateTerminalReason;
}>;

export type VerdictCandidateReconciliation = Readonly<{
  pending: readonly TransientVerdictCandidate[];
  resolutions: readonly VerdictCandidateResolution[];
  terminal: readonly VerdictCandidateTerminal[];
}>;

/**
 * Exact control-plane replay target used during service-worker initialization.
 * This is deliberately smaller than E2 Safe Evidence: the background sends
 * only these reviewed scalars to the surviving content document and never
 * synthesizes a request lifecycle or a DOM baseline.
 */
export type LeetCodeConfirmedEpochReplay = Readonly<{
  platform: "leetcode";
  problemExternalId: string;
  submitRequestId: string;
  confirmedAt: string;
  tabId: number;
  frameId: number;
  documentId: string;
}>;

/**
 * Select restart-time CONFIRMED controls only when an unfinalized confirmed
 * record has exactly one matched LeetCode submit lifecycle.  No lifecycle,
 * no stable identity, chronology inversion, context mismatch or duplicate
 * legal lifecycle is replayed.  The caller still delivers to Chrome's exact
 * tab/frame/document target; a missing live document is reported by that
 * existing fail-closed delivery path.
 */
export function selectLeetCodeConfirmedEpochReplays(input: Readonly<{
  requestLifecycles: readonly TransientE1Lifecycle[];
  confirmed: readonly ConfirmedSubmissionRecord[];
  now: string;
}>): readonly LeetCodeConfirmedEpochReplay[] {
  const nowMs = Date.parse(input.now);
  if (!Number.isFinite(nowMs)) return [];
  const replays: LeetCodeConfirmedEpochReplay[] = [];
  for (const record of input.confirmed) {
    if (record.platform !== "leetcode" || record.finalizedAt !== undefined) continue;
    const confirmedMs = Date.parse(record.confirmedAt);
    if (!Number.isFinite(confirmedMs) || confirmedMs > nowMs) continue;
    // The persisted storage key is the authoritative stable identity.  Do
    // not reconstruct it from externalSubmissionId: legacy records may carry
    // the historical colon namespace while current records use the exact
    // platform-prefixed key produced at E2 recording.
    const stableKey = record.storageKey;
    const matches = input.requestLifecycles.filter((lifecycle) =>
      lifecycle.outcome === "matched"
      && lifecycle.stableSubmissionId === stableKey
      && lifecycle.evidence.platform === "leetcode"
      && lifecycle.evidence.method === "POST"
      && lifecycle.evidence.resourceType === "xmlhttprequest"
      && lifecycle.evidence.lifecycle === "completed"
      && lifecycle.evidence.statusCode === 200
      && lifecycle.evidence.documentId.length > 0
      && isEndpointForCandidate(lifecycle.evidence.endpointKey, record.problemExternalId)
      && lifecycle.evidence.receivedAt <= record.confirmedAt
      && Date.parse(lifecycle.evidence.receivedAt) <= confirmedMs
      && Date.parse(lifecycle.evidence.receivedAt) <= nowMs
      && lifecycle.evidence.requestId.length > 0);
    if (matches.length !== 1) continue;
    const lifecycle = matches[0];
    if (lifecycle === undefined) continue;
    replays.push(Object.freeze({
      platform: "leetcode",
      problemExternalId: record.problemExternalId,
      submitRequestId: lifecycle.evidence.requestId,
      confirmedAt: record.confirmedAt,
      tabId: lifecycle.evidence.tabId,
      frameId: lifecycle.evidence.frameId,
      documentId: lifecycle.evidence.documentId,
    }));
  }
  return Object.freeze(replays);
}

/**
 * Pure verdict-candidate coordinator. Joins an observed final-verdict
 * candidate with the exact matched submit lifecycle and the confirmed
 * submission record, then emits either an exact resolution or a closed
 * terminal reason. No chrome.* / DOM / wall-clock / I/O.
 */
export function reconcileVerdictCandidates(input: Readonly<{
  candidates: readonly TransientVerdictCandidate[];
  requestLifecycles: readonly TransientE1Lifecycle[];
  confirmed: readonly ConfirmedSubmissionRecord[];
  now: string;
}>): VerdictCandidateReconciliation {
  const nowMs = Date.parse(input.now);
  const pending: TransientVerdictCandidate[] = [];
  const resolutions: VerdictCandidateResolution[] = [];
  const terminal: VerdictCandidateTerminal[] = [];

  for (const candidate of input.candidates) {
    const outcome = reconcileOne(candidate, input, nowMs);
    if (outcome.kind === "pending") {
      pending.push(candidate);
    } else if (outcome.kind === "resolution") {
      resolutions.push(outcome.resolution);
    } else {
      terminal.push(outcome.terminal);
    }
  }

  return Object.freeze({
    pending: Object.freeze(pending),
    resolutions: Object.freeze(resolutions),
    terminal: Object.freeze(terminal),
  });
}

type ReconciliationOutcome =
  | { readonly kind: "pending" }
  | { readonly kind: "resolution"; readonly resolution: VerdictCandidateResolution }
  | { readonly kind: "terminal"; readonly terminal: VerdictCandidateTerminal };

function reconcileOne(
  candidate: TransientVerdictCandidate,
  input: Readonly<{
    requestLifecycles: readonly TransientE1Lifecycle[];
    confirmed: readonly ConfirmedSubmissionRecord[];
    now: string;
  }>,
  nowMs: number,
): ReconciliationOutcome {
  const receivedMs = Date.parse(candidate.receivedAt);
  const expired = !Number.isFinite(receivedMs)
    || !Number.isFinite(nowMs)
    || receivedMs > nowMs
    || nowMs - receivedMs >= VERDICT_CANDIDATE_TTL_MS;
  if (expired) {
    return terminalResult(candidate, "expired");
  }

  // New candidates emitted by an armed submit epoch are request-bound.  They
  // must never fall back to the historical latest-by-time compatibility path:
  // an executor restart or a same-problem repeat submit may otherwise pair a
  // verdict with the wrong E1 lifecycle.
  if (candidate.submitRequestId !== undefined) {
    return reconcileArmedCandidate(candidate, input, nowMs);
  }

  // Legacy passive candidates have no request identity and remain accepted
  // only by the bounded compatibility path until TTL.  Once a later matching
  // submit lifecycle is visible, however, retaining the historical candidate
  // would let it consume the old confirmed record after the later E1.  Close
  // that chronology immediately without touching the confirmed slice.
  if (hasLaterMatchingSubmitLifecycle(input.requestLifecycles, candidate, input.confirmed)) {
    return terminalResult(candidate, "chronology_mismatch");
  }

  const eligible = selectEligibleSubmitLifecycles(input.requestLifecycles, candidate);
  if (eligible.length === 0) {
    return { kind: "pending" };
  }

  const latest = selectLatestSubmit(eligible);
  if (latest.kind === "ambiguous") {
    return terminalResult(candidate, "ambiguous_latest_submit");
  }
  const latestLifecycle = latest.submit;
  if (latestLifecycle.outcome !== "matched" || latestLifecycle.stableSubmissionId === null) {
    return { kind: "pending" };
  }

  const join = joinConfirmedRecord(input.confirmed, latestLifecycle.stableSubmissionId);
  if (join.kind === "pending") {
    return { kind: "pending" };
  }
  if (join.kind === "ambiguous") {
    return terminalResult(candidate, "ambiguous_latest_submit");
  }
  const record = join.record;
  if (record.platform !== candidate.platform
    || record.problemExternalId !== candidate.problemExternalId
    || latestLifecycle.stableSubmissionId !== record.storageKey) {
    return terminalResult(candidate, "identity_mismatch");
  }

  if (Date.parse(candidate.observedAt) < Date.parse(record.confirmedAt)) {
    return terminalResult(candidate, "chronology_mismatch");
  }

  return {
    kind: "resolution",
    resolution: Object.freeze({
      candidateId: candidate.candidateId,
      platform: candidate.platform,
      problemExternalId: candidate.problemExternalId,
      externalSubmissionId: record.externalSubmissionId,
      verdict: candidate.verdict,
      observedAt: candidate.observedAt,
      tabId: candidate.tabId,
      frameId: candidate.frameId,
      documentId: candidate.documentId,
    }),
  };
}

/**
 * Resolve a candidate carrying the additive submit request id.  Every field
 * that can affect the E1/E2 join is revalidated at this boundary, including
 * the request's context, endpoint and completion status.  A request that has
 * not arrived yet remains pending; an arrived but contradictory request is a
 * terminal identity failure rather than an invitation to guess another E1.
 */
function reconcileArmedCandidate(
  candidate: TransientVerdictCandidate,
  input: Readonly<{
    requestLifecycles: readonly TransientE1Lifecycle[];
    confirmed: readonly ConfirmedSubmissionRecord[];
    now: string;
  }>,
  nowMs: number,
): ReconciliationOutcome {
  const observedMs = Date.parse(candidate.observedAt);
  const exact = input.requestLifecycles.filter((lifecycle) =>
    lifecycle.evidence.requestId === candidate.submitRequestId);
  if (exact.length === 0) return { kind: "pending" };

  // A duplicate request id with contradictory E1 context is ambiguous.  Do
  // not select one based on processing order or receivedAt.
  const first = exact[0];
  if (first === undefined) return { kind: "pending" };
  if (exact.some((lifecycle) => !sameSubmitIdentity(lifecycle, first))) {
    return terminalResult(candidate, "identity_mismatch");
  }
  const lifecycle = first;
  const evidence = lifecycle.evidence;
  const receivedMs = Date.parse(evidence.receivedAt);
  if (!Number.isFinite(receivedMs) || !Number.isFinite(observedMs) || receivedMs > observedMs) {
    return terminalResult(candidate, "chronology_mismatch");
  }
  if (!sameCandidateContext(evidence, candidate)
    || evidence.method !== "POST"
    || evidence.resourceType !== "xmlhttprequest"
    || !isEndpointForCandidate(evidence.endpointKey, candidate.problemExternalId)) {
    return terminalResult(candidate, "identity_mismatch");
  }
  // The exact request may still be at its pre-request/response lifecycle
  // while E3 is being persisted.  Keep it pending until the same requestId
  // reaches the accepted completed/200 state; never select a different E1.
  if (evidence.lifecycle !== "completed" || evidence.statusCode !== 200) {
    return { kind: "pending" };
  }
  if (lifecycle.outcome !== "matched" || lifecycle.stableSubmissionId === null) {
    return { kind: "pending" };
  }

  const join = joinConfirmedRecord(input.confirmed, lifecycle.stableSubmissionId);
  if (join.kind === "pending") return { kind: "pending" };
  if (join.kind === "ambiguous") return terminalResult(candidate, "ambiguous_latest_submit");
  const record = join.record;
  if (record.platform !== candidate.platform
    || record.problemExternalId !== candidate.problemExternalId
    || record.storageKey !== lifecycle.stableSubmissionId) {
    return terminalResult(candidate, "identity_mismatch");
  }
  if (Date.parse(record.confirmedAt) > observedMs) {
    return terminalResult(candidate, "chronology_mismatch");
  }
  // `nowMs` is already validated by the candidate TTL check. Keep the
  // argument in the signature so this branch cannot accidentally reintroduce
  // a wall-clock read or a processing-time timestamp.
  void nowMs;
  return {
    kind: "resolution",
    resolution: Object.freeze({
      candidateId: candidate.candidateId,
      platform: candidate.platform,
      problemExternalId: candidate.problemExternalId,
      externalSubmissionId: record.externalSubmissionId,
      verdict: candidate.verdict,
      observedAt: candidate.observedAt,
      tabId: candidate.tabId,
      frameId: candidate.frameId,
      documentId: candidate.documentId,
    }),
  };
}

function sameSubmitIdentity(
  left: TransientE1Lifecycle,
  right: TransientE1Lifecycle,
): boolean {
  const a = left.evidence;
  const b = right.evidence;
  return a.requestId === b.requestId
    && a.platform === b.platform
    && a.tabId === b.tabId
    && a.frameId === b.frameId
    && a.documentId === b.documentId
    && a.method === b.method
    && a.endpointKey === b.endpointKey
    && a.resourceType === b.resourceType
    && a.lifecycle === b.lifecycle
    && a.statusCode === b.statusCode
    && a.receivedAt === b.receivedAt
    && a.apiTimeStamp === b.apiTimeStamp
    && left.stableSubmissionId === right.stableSubmissionId;
}

function sameCandidateContext(
  evidence: TransientE1Lifecycle["evidence"],
  candidate: TransientVerdictCandidate,
): boolean {
  return evidence.platform === candidate.platform
    && evidence.tabId === candidate.tabId
    && evidence.frameId === candidate.frameId
    && evidence.documentId === candidate.documentId;
}

function isEndpointForCandidate(endpointKey: string, problemExternalId: string): boolean {
  if (endpointKey === "graphql") return true;
  const parsed = parseSubmitEndpointKey(endpointKey);
  return parsed?.problemSlug === problemExternalId;
}

function hasLaterMatchingSubmitLifecycle(
  requestLifecycles: readonly TransientE1Lifecycle[],
  candidate: TransientVerdictCandidate,
  confirmed: readonly ConfirmedSubmissionRecord[],
): boolean {
  const observedMs = Date.parse(candidate.observedAt);
  if (!Number.isFinite(observedMs)) return false;
  return requestLifecycles.some((lifecycle) => {
    const evidence = lifecycle.evidence;
    const receivedMs = Date.parse(evidence.receivedAt);
    return Number.isFinite(receivedMs)
      && receivedMs > observedMs
      && sameCandidateContext(evidence, candidate)
      && isSubmitLifecycleShape(evidence)
      && isLaterLifecycleForCandidate(lifecycle, candidate, confirmed);
  });
}

function isLaterLifecycleForCandidate(
  lifecycle: TransientE1Lifecycle,
  candidate: TransientVerdictCandidate,
  confirmed: readonly ConfirmedSubmissionRecord[],
): boolean {
  const endpoint = lifecycle.evidence.endpointKey;
  if (endpoint !== "graphql") {
    const parsed = parseSubmitEndpointKey(endpoint);
    return parsed?.problemSlug === candidate.problemExternalId;
  }
  // GraphQL carries no problem identity in the privacy-safe endpoint key. A
  // later GraphQL lifecycle therefore qualifies as this candidate's successor
  // only when its already-matched stable id points to the same confirmed
  // problem. An unrelated GraphQL POST must not terminalize a legacy candidate
  // merely because it shares a tab/document and arrived later.
  if (lifecycle.outcome !== "matched" || lifecycle.stableSubmissionId === null) return false;
  return confirmed.some((record) =>
    record.platform === candidate.platform
    && record.problemExternalId === candidate.problemExternalId
    && record.storageKey === lifecycle.stableSubmissionId);
}

function isSubmitLifecycleShape(
  evidence: TransientE1Lifecycle["evidence"],
): boolean {
  return evidence.method === "POST" && evidence.resourceType === "xmlhttprequest";
}

function terminalResult(
  candidate: TransientVerdictCandidate,
  reason: VerdictCandidateTerminalReason,
): { readonly kind: "terminal"; readonly terminal: VerdictCandidateTerminal } {
  return {
    kind: "terminal",
    terminal: Object.freeze({
      candidateId: candidate.candidateId,
      platform: candidate.platform,
      problemExternalId: candidate.problemExternalId,
      reason,
    }),
  };
}

/**
 * Step A: hashmap keyed by requestId holds the latest lifecycle for each
 * request. A lifecycle is eligible only when all context and request
 * identity fields match the candidate and the request predates it.
 */
function selectEligibleSubmitLifecycles(
  requestLifecycles: readonly TransientE1Lifecycle[],
  candidate: TransientVerdictCandidate,
): readonly TransientE1Lifecycle[] {
  const byRequest = new Map<string, TransientE1Lifecycle>();
  for (const lifecycle of requestLifecycles) {
    const evidence = lifecycle.evidence;
    if (evidence.platform !== "leetcode") continue;
    if (evidence.tabId !== candidate.tabId) continue;
    if (evidence.frameId !== candidate.frameId) continue;
    if (evidence.documentId !== candidate.documentId) continue;
    const parsed = parseSubmitEndpointKey(evidence.endpointKey);
    if (parsed === null && evidence.endpointKey !== "graphql") continue;
    if (parsed !== null && parsed.problemSlug !== candidate.problemExternalId) continue;
    // The `graphql` endpoint carries no problem identity, so recency alone can
    // never tell an unrelated same-document POST /graphql from the actual
    // submission. Only the lifecycle already matched to the confirmed E2 is a
    // trustworthy candidate; an unmatched graph lifecycle must not shadow or
    // outrank the real submit on receivedAt ordering.
    if (evidence.endpointKey === "graphql"
      && (lifecycle.outcome !== "matched" || lifecycle.stableSubmissionId === null)) continue;
    if (evidence.method !== "POST") continue;
    if (evidence.resourceType !== "xmlhttprequest") continue;
    if (evidence.lifecycle !== "completed") continue;
    if (evidence.statusCode !== 200) continue;
    const observed = Date.parse(candidate.observedAt);
    const received = Date.parse(evidence.receivedAt);
    if (!Number.isFinite(received) || !Number.isFinite(observed) || received > observed) continue;
    const existing = byRequest.get(lifecycle.evidence.requestId);
    if (existing === undefined || receivedMsAfter(lifecycle, existing)) {
      byRequest.set(lifecycle.evidence.requestId, lifecycle);
    }
  }
  return [...byRequest.values()];
}

function receivedMsAfter(candidate: TransientE1Lifecycle, existing: TransientE1Lifecycle): boolean {
  const a = Date.parse(candidate.evidence.receivedAt);
  const b = Date.parse(existing.evidence.receivedAt);
  if (a !== b) return a > b;
  const at = candidate.evidence.apiTimeStamp;
  const bt = existing.evidence.apiTimeStamp;
  return at > bt;
}

function parseSubmitEndpointKey(endpointKey: string): Readonly<{
  problemSlug: string;
}> | null {
  const match = /^leetcode\/submit\/(cn|com)\/([a-z0-9](?:[a-z0-9-]{0,126}[a-z0-9])?)$/u.exec(
    endpointKey,
  );
  return match?.[2] === undefined ? null : { problemSlug: match[2] };
}

type LatestSubmit =
  | { readonly kind: "single"; readonly submit: TransientE1Lifecycle }
  | { readonly kind: "ambiguous" };

/**
 * Step B: select the latest submit attempt. Only lifecycles at the latest
 * receivedAt (with apiTimeStamp / requestId as deterministic tie-break) are
 * candidates. More than one distinct latest submit fails closed.
 */
function selectLatestSubmit(
  eligible: readonly TransientE1Lifecycle[],
): LatestSubmit {
  let maxReceived = -Infinity;
  for (const lifecycle of eligible) {
    const received = Date.parse(lifecycle.evidence.receivedAt);
    if (received > maxReceived) maxReceived = received;
  }
  const maxApiLifecycles = eligible.filter(
    (lifecycle) => Date.parse(lifecycle.evidence.receivedAt) === maxReceived,
  );
  if (maxApiLifecycles.length === 0) {
    return { kind: "single", submit: eligible[0] as TransientE1Lifecycle };
  }
  let maxApi = -Infinity;
  for (const lifecycle of maxApiLifecycles) {
    if (lifecycle.evidence.apiTimeStamp > maxApi) maxApi = lifecycle.evidence.apiTimeStamp;
  }
  const latest = maxApiLifecycles
    .filter((lifecycle) => lifecycle.evidence.apiTimeStamp === maxApi)
    .sort((a, b) => a.evidence.requestId.localeCompare(b.evidence.requestId));
  const distinctRequestIds = new Set(
    latest.map((lifecycle) => lifecycle.evidence.requestId),
  );
  if (distinctRequestIds.size > 1) {
    return { kind: "ambiguous" };
  }
  return { kind: "single", submit: latest[0] as TransientE1Lifecycle };
}

type JoinResult =
  | { readonly kind: "pending" }
  | { readonly kind: "ambiguous" }
  | { readonly kind: "record"; readonly record: ConfirmedSubmissionRecord };

/**
 * Step C: join the exact confirmed record by storage key. A record with
 * `finalizedAt === undefined` is the live un-finalized confirmation.
 */
function joinConfirmedRecord(
  confirmed: readonly ConfirmedSubmissionRecord[],
  stableSubmissionId: string,
): JoinResult {
  const live = confirmed.filter(
    (record) => record.storageKey === stableSubmissionId && record.finalizedAt === undefined,
  );
  if (live.length === 0) {
    return { kind: "pending" };
  }
  if (live.length > 1) {
    return { kind: "ambiguous" };
  }
  return { kind: "record", record: live[0] as ConfirmedSubmissionRecord };
}
