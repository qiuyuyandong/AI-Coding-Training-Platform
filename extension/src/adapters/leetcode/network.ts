import { defineNetworkAdapterPolicy } from "@/extension/src/adapters/contract";
import type {
  E1RequestObserved,
  E2SubmissionConfirmed,
  E3FinalVerdictConfirmed,
} from "@/extension/src/evidence";
import { normalizeTrustedVerdictText } from "@/lib/capture/verdictTaxonomy";

export const LEETCODE_NETWORK_ADAPTER_VERSION = "v4-leetcode-network-6";
export const LEETCODE_SUBMIT_ENDPOINT_PREFIX = "leetcode/submit";
export const LEETCODE_CHECK_ENDPOINT_PREFIX = "leetcode/check";
export const LEETCODE_RESULT_ENDPOINT_PREFIX = "leetcode/result";
export const LEETCODE_CONFIRMATION_WINDOW_MS = 5_000;
export const LEETCODE_ENDPOINT_DIAGNOSTIC_KEY = "leetcodeEndpointDiagnostics";
export const LEETCODE_ENDPOINT_DIAGNOSTIC_LIMIT = 20;

const FORBIDDEN_INPUT_KEYS = new Set([
  "body", "rawBody", "responseBody", "responseText", "headers",
  "requestHeaders", "responseHeaders", "cookie", "authorization", "csrf",
  "token", "code", "source", "sourceCode", "username", "account", "email",
  "requestBody", "problemStatement", "fullStatement",
]);

type LeetCodeHostScope = "cn" | "com";

type SubmitEndpoint = Readonly<{
  kind: "submit";
  scope: LeetCodeHostScope;
  problemSlug: string;
  endpointKey: string;
}>;

type CheckEndpoint = Readonly<{
  kind: "check";
  scope: LeetCodeHostScope;
  submissionId: string;
  endpointKey: string;
}>;

type ResultEndpoint = Readonly<{
  kind: "result";
  scope: LeetCodeHostScope;
  submissionId: string;
  endpointKey: string;
}>;

type LeetCodeEndpoint = SubmitEndpoint | CheckEndpoint | ResultEndpoint;

export type LeetCodeEndpointDiagnosticReason =
  | "unmatched_submit_path"
  | "unmatched_check_path";

export type LeetCodeEndpointDiagnostic = Readonly<{
  schemaVersion: 1;
  platform: "leetcode";
  adapterVersion: typeof LEETCODE_NETWORK_ADAPTER_VERSION;
  reason: LeetCodeEndpointDiagnosticReason;
  scope: LeetCodeHostScope;
  method: "GET" | "POST";
  pathname: string;
  lifecycle: "completed";
  statusCode: number;
  requestId: string;
  tabId: number;
  frameId: number;
  documentId: string;
  receivedAt: string;
}>;

export type LeetCodeEndpointDiagnosticInput = Readonly<{
  rawUrl: string;
  method: string;
  resourceType: string;
  statusCode: number;
  requestId: string;
  tabId: number;
  frameId: number;
  documentId: string | undefined;
  receivedAt: string;
}>;

export type LeetCodeConfirmationInput = Readonly<{
  checkEvidence: E1RequestObserved;
  submitCandidates: readonly E1RequestObserved[];
}>;

export type LeetCodeProblemCandidate = Readonly<{
  platform: "leetcode";
  problemExternalId: string;
  observedAt: string;
  tabId: number;
  frameId: number;
  documentId: string;
}>;

export type LeetCodeResultConfirmationInput = Readonly<{
  resultEvidence: E1RequestObserved;
  graphqlCandidates: readonly E1RequestObserved[];
  problemCandidates: readonly LeetCodeProblemCandidate[];
}>;

export type LeetCodeConfirmationResult =
  | {
    readonly kind: "confirmed";
    readonly evidence: E2SubmissionConfirmed;
    readonly matchedSubmitRequestId: string;
  }
  | {
    readonly kind: "no_match";
    readonly reason:
      | "invalid_check_evidence"
      | "missing_submit"
      | "expired_submit"
      | "crossed_identity";
  }
  | {
    readonly kind: "ambiguous";
    readonly reason: "multiple_submit_candidates";
  };

export type LeetCodeResultConfirmationResult =
  | {
    readonly kind: "confirmed";
    readonly evidence: E2SubmissionConfirmed;
    readonly matchedSubmitRequestId: string;
  }
  | {
    readonly kind: "no_match";
    readonly reason:
      | "invalid_result_evidence"
      | "missing_problem_hint"
      | "expired_problem_hint"
      | "missing_graphql";
  }
  | {
    readonly kind: "ambiguous";
    readonly reason: "multiple_problem_hints";
  };

export function normalizeLeetCodeNetworkEndpoint(rawUrl: string): string | null {
  return parseLeetCodeNetworkEndpoint(rawUrl)?.endpointKey ?? null;
}

/**
 * Produces a bounded, path-only diagnostic when an owned LeetCode request
 * looks like a submit/check lifecycle but does not match the characterized
 * adapter. Query, fragment, body, headers, cookies and code never enter the
 * record. This is control-plane evidence only and is never Safe Evidence.
 */
export function createLeetCodeEndpointDiagnostic(
  input: LeetCodeEndpointDiagnosticInput,
): LeetCodeEndpointDiagnostic | null {
  if (normalizeLeetCodeNetworkEndpoint(input.rawUrl) !== null
    || input.resourceType !== "xmlhttprequest"
    || input.documentId === undefined
    || input.documentId.length === 0
    || input.requestId.length === 0
    || !Number.isInteger(input.tabId)
    || input.tabId < 0
    || !Number.isInteger(input.frameId)
    || input.frameId < 0
    || !Number.isInteger(input.statusCode)
    || input.statusCode < 100
    || input.statusCode > 599
    || !isCanonicalUtcDateTime(input.receivedAt)) {
    return null;
  }
  const parsed = parseOwnedUrl(input.rawUrl);
  if (parsed === null || parsed.hash !== "" || !isSafeDiagnosticPathname(parsed.pathname)) {
    return null;
  }
  const scope = scopeForHostname(parsed.hostname);
  if (scope === null) return null;
  const lower = parsed.pathname.toLowerCase();
  const reason = input.method === "POST" && lower.includes("submit")
    ? "unmatched_submit_path"
    : input.method === "GET"
      && (lower.includes("check") || lower.includes("status") || lower.includes("submission"))
      ? "unmatched_check_path"
      : null;
  if (reason === null) return null;
  return Object.freeze({
    schemaVersion: 1,
    platform: "leetcode",
    adapterVersion: LEETCODE_NETWORK_ADAPTER_VERSION,
    reason,
    scope,
    method: reason === "unmatched_submit_path" ? "POST" : "GET",
    pathname: parsed.pathname,
    lifecycle: "completed",
    statusCode: input.statusCode,
    requestId: input.requestId,
    tabId: input.tabId,
    frameId: input.frameId,
    documentId: input.documentId,
    receivedAt: input.receivedAt,
  });
}

export function readLeetCodeEndpointDiagnostics(
  value: unknown,
): readonly LeetCodeEndpointDiagnostic[] {
  if (!Array.isArray(value)) return [];
  return Object.freeze(value.flatMap((candidate) => {
    const parsed = parseLeetCodeEndpointDiagnostic(candidate);
    return parsed === null ? [] : [parsed];
  }));
}

export function appendLeetCodeEndpointDiagnostic(
  existing: unknown,
  diagnostic: LeetCodeEndpointDiagnostic,
): readonly LeetCodeEndpointDiagnostic[] {
  const retained = readLeetCodeEndpointDiagnostics(existing).filter((candidate) =>
    candidate.requestId !== diagnostic.requestId);
  return Object.freeze(
    [...retained, diagnostic].slice(-LEETCODE_ENDPOINT_DIAGNOSTIC_LIMIT),
  );
}

export function normalizeLeetCodeProblemIdentity(
  pageUrl: string,
  problemExternalId: string,
): string | null {
  const page = parseProblemPage(pageUrl);
  return page === null || page.problemSlug !== problemExternalId
    ? null
    : page.problemSlug;
}

export function selectLeetCodeConfirmation(
  input: LeetCodeConfirmationInput,
): LeetCodeConfirmationResult {
  const check = input.checkEvidence;
  const checkEndpoint = parseEndpointKey(check.endpointKey);
  if (check.platform !== "leetcode"
    || checkEndpoint?.kind !== "check"
    || check.method !== "GET"
    || check.resourceType !== "xmlhttprequest"
    || check.lifecycle !== "completed"
    || check.statusCode !== 200) {
    return { kind: "no_match", reason: "invalid_check_evidence" };
  }

  const sameContext = input.submitCandidates.filter((candidate) => {
    const endpoint = parseEndpointKey(candidate.endpointKey);
    return candidate.platform === "leetcode"
      && endpoint?.kind === "submit"
      && endpoint.scope === checkEndpoint.scope
      && candidate.method === "POST"
      && candidate.resourceType === "xmlhttprequest"
      && candidate.lifecycle === "completed"
      && candidate.statusCode === 200
      && candidate.tabId === check.tabId
      && candidate.frameId === check.frameId
      && candidate.documentId === check.documentId;
  });
  if (sameContext.length === 0) {
    return { kind: "no_match", reason: "missing_submit" };
  }

  const checkTime = Date.parse(check.receivedAt);
  const inWindow = sameContext.filter((candidate) => {
    const submitTime = Date.parse(candidate.receivedAt);
    return Number.isFinite(checkTime)
      && Number.isFinite(submitTime)
      && submitTime <= checkTime
      && checkTime - submitTime <= LEETCODE_CONFIRMATION_WINDOW_MS;
  });
  if (inWindow.length === 0) {
    return { kind: "no_match", reason: "expired_submit" };
  }
  if (inWindow.length > 1) {
    return { kind: "ambiguous", reason: "multiple_submit_candidates" };
  }

  const matched = inWindow[0];
  if (matched === undefined) return { kind: "no_match", reason: "missing_submit" };
  const submitEndpoint = parseEndpointKey(matched.endpointKey);
  if (submitEndpoint?.kind !== "submit" || submitEndpoint.scope !== checkEndpoint.scope) {
    return { kind: "no_match", reason: "crossed_identity" };
  }

  const evidence: E2SubmissionConfirmed = {
    schemaVersion: 1,
    evidenceId: `e2_leetcode_${checkEndpoint.scope}_${checkEndpoint.submissionId}`,
    platform: "leetcode",
    tier: "E2",
    kind: "submission_confirmed",
    receivedAt: check.receivedAt,
    tabId: check.tabId,
    frameId: check.frameId,
    documentId: check.documentId,
    adapterVersion: LEETCODE_NETWORK_ADAPTER_VERSION,
    requestEvidenceId: check.evidenceId,
    externalSubmissionId: `${checkEndpoint.scope}/${checkEndpoint.submissionId}`,
    problemExternalId: submitEndpoint.problemSlug,
    phase: "judging",
  };
  return {
    kind: "confirmed",
    evidence,
    matchedSubmitRequestId: matched.requestId,
  };
}

/**
 * Confirms the current LeetCode GraphQL UI without inspecting its request
 * body. A trusted recent E0 supplies the problem identity, a completed
 * same-document GraphQL POST supplies the submission network witness, and
 * the exact result-distribution path supplies the stable submission ID.
 * Opening a historical result page has no E0 and therefore fails closed.
 */
export function selectLeetCodeResultConfirmation(
  input: LeetCodeResultConfirmationInput,
): LeetCodeResultConfirmationResult {
  const result = input.resultEvidence;
  const resultEndpoint = parseEndpointKey(result.endpointKey);
  if (result.platform !== "leetcode"
    || resultEndpoint?.kind !== "result"
    || result.method !== "GET"
    || result.resourceType !== "xmlhttprequest"
    || result.lifecycle !== "completed"
    || result.statusCode !== 200) {
    return { kind: "no_match", reason: "invalid_result_evidence" };
  }

  const resultTime = Date.parse(result.receivedAt);
  const sameContextHints = input.problemCandidates.filter((candidate) =>
    candidate.platform === "leetcode"
    && isProblemSlug(candidate.problemExternalId)
    && candidate.tabId === result.tabId
    && candidate.frameId === result.frameId
    && candidate.documentId === result.documentId);
  if (sameContextHints.length === 0) {
    return { kind: "no_match", reason: "missing_problem_hint" };
  }
  const recentHints = sameContextHints.filter((candidate) => {
    const hintTime = Date.parse(candidate.observedAt);
    return Number.isFinite(resultTime)
      && Number.isFinite(hintTime)
      && hintTime <= resultTime
      && resultTime - hintTime <= LEETCODE_CONFIRMATION_WINDOW_MS;
  });
  if (recentHints.length === 0) {
    return { kind: "no_match", reason: "expired_problem_hint" };
  }
  if (recentHints.length > 1) {
    return { kind: "ambiguous", reason: "multiple_problem_hints" };
  }
  const problem = recentHints[0];
  if (problem === undefined) {
    return { kind: "no_match", reason: "missing_problem_hint" };
  }

  const hintTime = Date.parse(problem.observedAt);
  const graphql = input.graphqlCandidates
    .filter((candidate) => {
      const candidateTime = Date.parse(candidate.receivedAt);
      return candidate.platform === "leetcode"
        && candidate.endpointKey === "graphql"
        && candidate.method === "POST"
        && candidate.resourceType === "xmlhttprequest"
        && candidate.lifecycle === "completed"
        && candidate.statusCode === 200
        && candidate.tabId === result.tabId
        && candidate.frameId === result.frameId
        && candidate.documentId === result.documentId
        && Number.isFinite(candidateTime)
        && Number.isFinite(hintTime)
        && Number.isFinite(resultTime)
        && hintTime <= candidateTime
        && candidateTime <= resultTime
        && resultTime - candidateTime <= LEETCODE_CONFIRMATION_WINDOW_MS;
    })
    .sort(compareEvidenceRecency)
    .at(-1);
  if (graphql === undefined) {
    return { kind: "no_match", reason: "missing_graphql" };
  }

  const evidence: E2SubmissionConfirmed = {
    schemaVersion: 1,
    evidenceId: `e2_leetcode_${resultEndpoint.scope}_${resultEndpoint.submissionId}`,
    platform: "leetcode",
    tier: "E2",
    kind: "submission_confirmed",
    receivedAt: result.receivedAt,
    tabId: result.tabId,
    frameId: result.frameId,
    documentId: result.documentId,
    adapterVersion: LEETCODE_NETWORK_ADAPTER_VERSION,
    requestEvidenceId: result.evidenceId,
    externalSubmissionId: `${resultEndpoint.scope}/${resultEndpoint.submissionId}`,
    problemExternalId: problem.problemExternalId,
    phase: "judging",
  };
  return {
    kind: "confirmed",
    evidence,
    matchedSubmitRequestId: graphql.requestId,
  };
}

/**
 * Constructs the LeetCode E3 final-verdict evidence from an exact, already
 * resolved verdict candidate. All identity fields are validated (external
 * submission scope, problem slug, canonical UTC time, non-negative
 * tab/frame, non-empty document ID, no control characters) and the verdict
 * text is normalized through the shared taxonomy. Returns `null` for any
 * malformed or non-final verdict.
 */
export function createLeetCodeFinalVerdictEvidence(
  input: Readonly<{
    problemExternalId: string;
    externalSubmissionId: string;
    verdictText: string;
    tabId: number;
    frameId: number;
    documentId: string;
    receivedAt: string;
  }>,
): E3FinalVerdictConfirmed | null {
  if (!isProblemSlug(input.problemExternalId)
    || !/^(?:cn|com)\/[0-9]{1,20}$/u.test(input.externalSubmissionId)
    || !isCanonicalUtcDateTime(input.receivedAt)
    || !Number.isInteger(input.tabId)
    || input.tabId < 0
    || !Number.isInteger(input.frameId)
    || input.frameId < 0
    || input.documentId.length === 0
    || /[\u0000-\u001f\u007f]/u.test(input.problemExternalId)
    || /[\u0000-\u001f\u007f]/u.test(input.externalSubmissionId)
    || /[\u0000-\u001f\u007f]/u.test(input.documentId)
    || /[\u0000-\u001f\u007f]/u.test(input.receivedAt)) {
    return null;
  }
  const verdict = normalizeTrustedVerdictText(input.verdictText);
  if (verdict === null || verdict === "Other Failure") return null;
  return {
    schemaVersion: 1,
    evidenceId: `e3_leetcode_${input.externalSubmissionId.replace("/", "_")}`,
    platform: "leetcode",
    tier: "E3",
    kind: "final_verdict_confirmed",
    receivedAt: input.receivedAt,
    tabId: input.tabId,
    frameId: input.frameId,
    documentId: input.documentId,
    adapterVersion: LEETCODE_NETWORK_ADAPTER_VERSION,
    externalSubmissionId: input.externalSubmissionId,
    problemExternalId: input.problemExternalId,
    verdict,
  };
}

function requestEvidence(input: unknown): unknown {
  if (!isSafeInputObject(input) || Reflect.get(input, "kind") !== "request") return null;
  const url = readString(input, "url");
  const requestId = readString(input, "requestId");
  const method = readString(input, "method");
  const resourceType = readString(input, "resourceType");
  const lifecycle = readString(input, "lifecycle");
  const documentId = readString(input, "documentId");
  const receivedAt = readString(input, "receivedAt");
  const tabId = readNonnegativeInteger(input, "tabId");
  const frameId = readNonnegativeInteger(input, "frameId");
  const apiTimeStamp = readNonnegativeFinite(input, "apiTimeStamp");
  if (url === null || requestId === null || method === null || resourceType === null
    || lifecycle === null || documentId === null || receivedAt === null
    || tabId === null || frameId === null || apiTimeStamp === null) return null;
  const endpoint = parseLeetCodeNetworkEndpoint(url);
  if (endpoint === null || resourceType !== "xmlhttprequest") return null;
  if ((endpoint.kind === "submit" && method !== "POST")
    || ((endpoint.kind === "check" || endpoint.kind === "result") && method !== "GET")) {
    return null;
  }
  const statusCodeValue = Reflect.get(input, "statusCode");
  if (statusCodeValue !== undefined
    && (typeof statusCodeValue !== "number" || !Number.isInteger(statusCodeValue)
      || statusCodeValue < 100 || statusCodeValue > 599)) return null;
  return {
    schemaVersion: 1,
    evidenceId: `e1_leetcode_${requestId}`,
    platform: "leetcode",
    tier: "E1",
    kind: "request_observed",
    receivedAt,
    tabId,
    frameId,
    documentId,
    adapterVersion: LEETCODE_NETWORK_ADAPTER_VERSION,
    requestId,
    method,
    endpointKey: endpoint.endpointKey,
    resourceType,
    lifecycle,
    apiTimeStamp,
    ...(statusCodeValue === undefined ? {} : { statusCode: statusCodeValue }),
  };
}

function submissionEvidence(input: unknown): unknown {
  if (!isSafeInputObject(input)) return null;
  if (Reflect.get(input, "kind") === "result_confirmation") {
    const resultEvidence = Reflect.get(input, "resultEvidence");
    const graphqlCandidates = Reflect.get(input, "graphqlCandidates");
    const problemCandidates = Reflect.get(input, "problemCandidates");
    if (!isLeetCodeE1(resultEvidence)
      || !Array.isArray(graphqlCandidates)
      || !graphqlCandidates.every(isLeetCodeE1)
      || !Array.isArray(problemCandidates)
      || !problemCandidates.every(isLeetCodeProblemCandidate)) return null;
    const result = selectLeetCodeResultConfirmation({
      resultEvidence,
      graphqlCandidates,
      problemCandidates,
    });
    return result.kind === "confirmed" ? result.evidence : null;
  }
  if (Reflect.get(input, "kind") !== "confirmation") return null;
  const checkEvidence = Reflect.get(input, "checkEvidence");
  const submitCandidates = Reflect.get(input, "submitCandidates");
  if (!isLeetCodeE1(checkEvidence) || !Array.isArray(submitCandidates)
    || !submitCandidates.every(isLeetCodeE1)) return null;
  const result = selectLeetCodeConfirmation({ checkEvidence, submitCandidates });
  return result.kind === "confirmed" ? result.evidence : null;
}

function verdictEvidence(input: unknown): unknown {
  if (!isSafeInputObject(input) || Reflect.get(input, "kind") !== "verdict") return null;
  const pageUrl = readString(input, "pageUrl");
  const candidateProblem = readString(input, "problemExternalId");
  const verdictText = readString(input, "verdictText");
  const confirmedSubmissionIds = Reflect.get(input, "confirmedSubmissionIds");
  const documentId = readString(input, "documentId");
  const receivedAt = readString(input, "receivedAt");
  const tabId = readNonnegativeInteger(input, "tabId");
  const frameId = readNonnegativeInteger(input, "frameId");
  if (pageUrl === null || candidateProblem === null || verdictText === null
    || !Array.isArray(confirmedSubmissionIds)
    || !confirmedSubmissionIds.every((value) => typeof value === "string")
    || confirmedSubmissionIds.length !== 1 || documentId === null || receivedAt === null
    || tabId === null || frameId === null) return null;
  const page = parseProblemPage(pageUrl);
  const problemIdentity = normalizeLeetCodeProblemIdentity(pageUrl, candidateProblem);
  if (page === null || problemIdentity === null) return null;
  const confirmedId = confirmedSubmissionIds[0];
  if (confirmedId === undefined
    || !new RegExp(`^${page.scope}/[0-9]{1,20}$`, "u").test(confirmedId)) return null;
  return createLeetCodeFinalVerdictEvidence({
    problemExternalId: problemIdentity,
    externalSubmissionId: confirmedId,
    verdictText,
    tabId,
    frameId,
    documentId,
    receivedAt,
  });
}

/**
 * Verdict candidates observed before the matching E2 confirmation is
 * persisted can be retried: the confirmed submission may be written by a
 * later executor stage than the one reading candidate state. Any other
 * failure (ambiguous multi-candidate, invalid verdict, identity mismatch)
 * is terminal and must fail closed.
 */
export function shouldRetryLeetCodeVerdictCandidate(
  confirmedSubmissionIds: readonly string[],
): boolean {
  return confirmedSubmissionIds.length === 0;
}

/**
 * True when a local-storage change contains the confirmed-submissions key.
 * A late E2 confirmation written after the bounded poll window may revive a
 * pending verdict candidate through the storage-change listener; the check
 * stays closed (key-existence only) so unrelated changes never retry.
 */
export function storageChangeRevivesVerdictCandidate(changes: unknown): boolean {
  return typeof changes === "object" && changes !== null
    && Object.hasOwn(changes, "confirmedSubmissions");
}

export const LEETCODE_NETWORK_POLICY = defineNetworkAdapterPolicy({
  requestEvidence,
  submissionEvidence,
  verdictEvidence,
});

function parseLeetCodeNetworkEndpoint(rawUrl: string): LeetCodeEndpoint | null {
  const parsed = parseOwnedUrl(rawUrl);
  // LeetCode attaches navigation/context query parameters to otherwise stable
  // submit and check endpoints. Query keys and values are deliberately ignored:
  // endpoint identity comes only from the exact owned HTTPS host + pathname,
  // and no query material enters Safe Evidence.
  if (parsed === null || parsed.hash !== "") return null;
  const scope = scopeForHostname(parsed.hostname);
  if (scope === null) return null;
  const submit = /^\/problems\/([a-z0-9](?:[a-z0-9-]{0,126}[a-z0-9])?)\/submit\/?$/u.exec(
    parsed.pathname,
  );
  const problemSlug = submit?.[1];
  if (problemSlug !== undefined) {
    return {
      kind: "submit",
      scope,
      problemSlug,
      endpointKey: `${LEETCODE_SUBMIT_ENDPOINT_PREFIX}/${scope}/${problemSlug}`,
    };
  }
  const check = /^\/submissions\/detail\/([0-9]{1,20})\/(?:v2\/)?check\/?$/u.exec(
    parsed.pathname,
  );
  const submissionId = check?.[1];
  if (submissionId !== undefined) {
    return {
      kind: "check",
      scope,
      submissionId,
      endpointKey: `${LEETCODE_CHECK_ENDPOINT_PREFIX}/${scope}/${submissionId}`,
    };
  }
  const result = /^\/submissions\/api\/(?:runtime|memory)_distribution\/([0-9]{1,20})\/?$/u.exec(
    parsed.pathname,
  );
  const resultSubmissionId = result?.[1];
  return resultSubmissionId === undefined
    ? null
    : {
      kind: "result",
      scope,
      submissionId: resultSubmissionId,
      endpointKey: `${LEETCODE_RESULT_ENDPOINT_PREFIX}/${scope}/${resultSubmissionId}`,
    };
}

function parseEndpointKey(endpointKey: string): LeetCodeEndpoint | null {
  const submit = /^leetcode\/submit\/(cn|com)\/([a-z0-9](?:[a-z0-9-]{0,126}[a-z0-9])?)$/u.exec(
    endpointKey,
  );
  const submitScope = submit?.[1];
  const problemSlug = submit?.[2];
  if ((submitScope === "cn" || submitScope === "com") && problemSlug !== undefined) {
    return { kind: "submit", scope: submitScope, problemSlug, endpointKey };
  }
  const check = /^leetcode\/check\/(cn|com)\/([0-9]{1,20})$/u.exec(endpointKey);
  const checkScope = check?.[1];
  const submissionId = check?.[2];
  if ((checkScope === "cn" || checkScope === "com") && submissionId !== undefined) {
    return { kind: "check", scope: checkScope, submissionId, endpointKey };
  }
  const result = /^leetcode\/result\/(cn|com)\/([0-9]{1,20})$/u.exec(endpointKey);
  const resultScope = result?.[1];
  const resultSubmissionId = result?.[2];
  if ((resultScope === "cn" || resultScope === "com")
    && resultSubmissionId !== undefined) {
    return {
      kind: "result",
      scope: resultScope,
      submissionId: resultSubmissionId,
      endpointKey,
    };
  }
  return null;
}

function compareEvidenceRecency(a: E1RequestObserved, b: E1RequestObserved): number {
  const timeDifference = Date.parse(a.receivedAt) - Date.parse(b.receivedAt);
  return timeDifference === 0 ? a.requestId.localeCompare(b.requestId) : timeDifference;
}

function isProblemSlug(value: string): boolean {
  return /^[a-z0-9](?:[a-z0-9-]{0,126}[a-z0-9])?$/u.test(value);
}

function isLeetCodeProblemCandidate(value: unknown): value is LeetCodeProblemCandidate {
  return typeof value === "object"
    && value !== null
    && Reflect.get(value, "platform") === "leetcode"
    && typeof Reflect.get(value, "problemExternalId") === "string"
    && isProblemSlug(String(Reflect.get(value, "problemExternalId")))
    && typeof Reflect.get(value, "observedAt") === "string"
    && isCanonicalUtcDateTime(String(Reflect.get(value, "observedAt")))
    && typeof Reflect.get(value, "tabId") === "number"
    && Number.isInteger(Reflect.get(value, "tabId"))
    && Number(Reflect.get(value, "tabId")) >= 0
    && typeof Reflect.get(value, "frameId") === "number"
    && Number.isInteger(Reflect.get(value, "frameId"))
    && Number(Reflect.get(value, "frameId")) >= 0
    && typeof Reflect.get(value, "documentId") === "string"
    && String(Reflect.get(value, "documentId")).length > 0;
}

function parseProblemPage(
  rawUrl: string,
): { readonly scope: LeetCodeHostScope; readonly problemSlug: string } | null {
  const parsed = parseOwnedUrl(rawUrl);
  if (parsed === null) return null;
  const scope = scopeForHostname(parsed.hostname);
  const match = /^\/problems\/([a-z0-9](?:[a-z0-9-]{0,126}[a-z0-9])?)(?:\/.*)?$/u.exec(
    parsed.pathname,
  );
  const problemSlug = match?.[1];
  return scope === null || problemSlug === undefined ? null : { scope, problemSlug };
}

function parseOwnedUrl(rawUrl: string): URL | null {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return null;
  }
  return parsed.protocol === "https:"
    && scopeForHostname(parsed.hostname) !== null
    && parsed.username === ""
    && parsed.password === ""
    && parsed.port === ""
    ? parsed
    : null;
}

function scopeForHostname(hostname: string): LeetCodeHostScope | null {
  if (hostname === "leetcode.cn") return "cn";
  if (hostname === "leetcode.com") return "com";
  return null;
}

function isSafeDiagnosticPathname(pathname: string): boolean {
  return pathname.length > 0
    && pathname.length <= 256
    && !pathname.includes("//")
    && !pathname.split("/").includes("..")
    && !/[\u0000-\u001f\u007f]/u.test(pathname)
    && pathname.startsWith("/");
}

function isCanonicalUtcDateTime(value: string): boolean {
  const match = /^([0-9]{4})-([0-9]{2})-([0-9]{2})T([0-9]{2}):([0-9]{2}):([0-9]{2})\.([0-9]{3})Z$/u.exec(
    value,
  );
  if (match === null) return false;
  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString() === value;
}

function parseLeetCodeEndpointDiagnostic(
  value: unknown,
): LeetCodeEndpointDiagnostic | null {
  if (typeof value !== "object" || value === null
    || Reflect.get(value, "schemaVersion") !== 1
    || Reflect.get(value, "platform") !== "leetcode"
    || Reflect.get(value, "adapterVersion") !== LEETCODE_NETWORK_ADAPTER_VERSION
    || Reflect.get(value, "lifecycle") !== "completed") {
    return null;
  }
  const reason = Reflect.get(value, "reason");
  const scope = Reflect.get(value, "scope");
  const method = Reflect.get(value, "method");
  const pathname = Reflect.get(value, "pathname");
  const statusCode = Reflect.get(value, "statusCode");
  const requestId = Reflect.get(value, "requestId");
  const tabId = Reflect.get(value, "tabId");
  const frameId = Reflect.get(value, "frameId");
  const documentId = Reflect.get(value, "documentId");
  const receivedAt = Reflect.get(value, "receivedAt");
  if ((reason !== "unmatched_submit_path" && reason !== "unmatched_check_path")
    || (scope !== "cn" && scope !== "com")
    || (method !== "GET" && method !== "POST")
    || typeof pathname !== "string"
    || !isSafeDiagnosticPathname(pathname)
    || typeof statusCode !== "number"
    || !Number.isInteger(statusCode)
    || statusCode < 100
    || statusCode > 599
    || typeof requestId !== "string"
    || requestId.length === 0
    || typeof tabId !== "number"
    || !Number.isInteger(tabId)
    || tabId < 0
    || typeof frameId !== "number"
    || !Number.isInteger(frameId)
    || frameId < 0
    || typeof documentId !== "string"
    || documentId.length === 0
    || typeof receivedAt !== "string"
    || !isCanonicalUtcDateTime(receivedAt)
    || (reason === "unmatched_submit_path" && method !== "POST")
    || (reason === "unmatched_check_path" && method !== "GET")) {
    return null;
  }
  return Object.freeze({
    schemaVersion: 1,
    platform: "leetcode",
    adapterVersion: LEETCODE_NETWORK_ADAPTER_VERSION,
    reason,
    scope,
    method,
    pathname,
    lifecycle: "completed",
    statusCode,
    requestId,
    tabId,
    frameId,
    documentId,
    receivedAt,
  });
}

function isSafeInputObject(value: unknown): value is object {
  return typeof value === "object"
    && value !== null
    && !findForbiddenKey(value, new WeakSet<object>());
}

function findForbiddenKey(value: object, visited: WeakSet<object>): boolean {
  if (visited.has(value)) return false;
  visited.add(value);
  for (const [key, nested] of Object.entries(value)) {
    if (FORBIDDEN_INPUT_KEYS.has(key)) return true;
    if (typeof nested === "object" && nested !== null && findForbiddenKey(nested, visited)) {
      return true;
    }
  }
  return false;
}

function readString(value: object, key: string): string | null {
  const field = Reflect.get(value, key);
  return typeof field === "string" && field.length > 0 ? field : null;
}

function readNonnegativeInteger(value: object, key: string): number | null {
  const field = Reflect.get(value, key);
  return typeof field === "number" && Number.isInteger(field) && field >= 0 ? field : null;
}

function readNonnegativeFinite(value: object, key: string): number | null {
  const field = Reflect.get(value, key);
  return typeof field === "number" && Number.isFinite(field) && field >= 0 ? field : null;
}

function isLeetCodeE1(value: unknown): value is E1RequestObserved {
  return typeof value === "object"
    && value !== null
    && Reflect.get(value, "kind") === "request_observed"
    && Reflect.get(value, "tier") === "E1"
    && Reflect.get(value, "platform") === "leetcode";
}
