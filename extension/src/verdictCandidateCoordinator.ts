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
  | "expired";

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
    || record.problemExternalId !== candidate.problemExternalId) {
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
    if (parsed === null || parsed.problemSlug !== candidate.problemExternalId) continue;
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