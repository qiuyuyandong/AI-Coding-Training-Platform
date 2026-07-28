import { defineNetworkAdapterPolicy } from "@/extension/src/adapters/contract";
import type {
  E1RequestObserved,
  E2SubmissionConfirmed,
} from "@/extension/src/evidence";

export const NOWCODER_NETWORK_ADAPTER_VERSION = "v4-nowcoder-network-1";
export const NOWCODER_SUBMIT_ENDPOINT_KEY = "nowcoder/submit";
export const NOWCODER_STATUS_ENDPOINT_KEY = "nowcoder/status";
export const NOWCODER_CONFIRMATION_WINDOW_MS = 5_000;
const NOWCODER_PROBLEM_ID = "acm/contest/18839/1001";

const FORBIDDEN_INPUT_KEYS = new Set([
  "body", "rawBody", "responseBody", "responseText", "headers",
  "requestHeaders", "responseHeaders", "cookie", "authorization", "csrf",
  "token", "code", "source", "sourceCode", "username", "account", "email",
  "requestBody", "problemStatement", "fullStatement",
]);

export type NowCoderProblemCandidate = Readonly<{
  problemExternalId: string;
  observedAt: string;
  tabId: number;
  frameId: number;
  documentId: string;
}>;

export type NowCoderConfirmationInput = Readonly<{
  statusEvidence: E1RequestObserved;
  statusUrl: string;
  submitCandidates: readonly E1RequestObserved[];
  problemCandidates: readonly NowCoderProblemCandidate[];
  now: string;
}>;

export type NowCoderConfirmationResult =
  | {
    readonly kind: "confirmed";
    readonly evidence: E2SubmissionConfirmed;
    readonly matchedSubmitRequestId: string;
  }
  | {
    readonly kind: "no_match";
    readonly reason:
      | "invalid_status_evidence"
      | "missing_submission_id"
      | "malformed_submission_id"
      | "duplicate_submission_id"
      | "missing_submit"
      | "expired_submit"
      | "missing_problem";
  }
  | {
    readonly kind: "ambiguous";
    readonly reason: "multiple_submit_candidates" | "multiple_problem_candidates";
  };

export function normalizeNowCoderNetworkEndpoint(rawUrl: string): string | null {
  const parsed = parseOwnedUrl(rawUrl);
  if (parsed === null) return null;
  if (parsed.pathname === "/nccommon/submit_cd"
    && parsed.search === "" && parsed.hash === "") {
    return NOWCODER_SUBMIT_ENDPOINT_KEY;
  }
  if (parsed.pathname === "/nccommon/status" && parsed.hash === "") {
    return NOWCODER_STATUS_ENDPOINT_KEY;
  }
  return null;
}

export function selectNowCoderConfirmation(
  input: NowCoderConfirmationInput,
): NowCoderConfirmationResult {
  const status = input.statusEvidence;
  if (status.platform !== "nowcoder"
    || status.method !== "GET"
    || status.endpointKey !== NOWCODER_STATUS_ENDPOINT_KEY
    || status.resourceType !== "xmlhttprequest"
    || status.lifecycle !== "completed"
    || status.statusCode !== 200) {
    return { kind: "no_match", reason: "invalid_status_evidence" };
  }
  const submissionId = readStatusSubmissionId(input.statusUrl);
  if (submissionId.kind !== "valid") {
    return { kind: "no_match", reason: submissionId.reason };
  }

  const sameDocument = input.submitCandidates.filter((candidate) =>
    candidate.platform === "nowcoder"
    && candidate.method === "POST"
    && candidate.endpointKey === NOWCODER_SUBMIT_ENDPOINT_KEY
    && candidate.resourceType === "xmlhttprequest"
    && candidate.lifecycle === "completed"
    && candidate.statusCode === 200
    && candidate.tabId === status.tabId
    && candidate.frameId === status.frameId
    && candidate.documentId === status.documentId);
  const statusTime = Date.parse(status.receivedAt);
  const inWindow = sameDocument.filter((candidate) => {
    const submitTime = Date.parse(candidate.receivedAt);
    return Number.isFinite(statusTime) && Number.isFinite(submitTime)
      && submitTime <= statusTime
      && statusTime - submitTime <= NOWCODER_CONFIRMATION_WINDOW_MS;
  });
  if (inWindow.length === 0) {
    return {
      kind: "no_match",
      reason: sameDocument.length === 0 ? "missing_submit" : "expired_submit",
    };
  }
  if (inWindow.length > 1) {
    return { kind: "ambiguous", reason: "multiple_submit_candidates" };
  }

  const problems = input.problemCandidates.filter((problem) =>
    problem.problemExternalId === NOWCODER_PROBLEM_ID
    && problem.tabId === status.tabId
    && problem.frameId === status.frameId
    && problem.documentId === status.documentId
    && Date.parse(problem.observedAt) <= statusTime);
  if (problems.length === 0) return { kind: "no_match", reason: "missing_problem" };
  if (problems.length > 1) {
    return { kind: "ambiguous", reason: "multiple_problem_candidates" };
  }

  const evidence: E2SubmissionConfirmed = {
    schemaVersion: 1,
    evidenceId: `e2_nowcoder_${submissionId.value}`,
    platform: "nowcoder",
    tier: "E2",
    kind: "submission_confirmed",
    receivedAt: input.now,
    tabId: status.tabId,
    frameId: status.frameId,
    documentId: status.documentId,
    adapterVersion: NOWCODER_NETWORK_ADAPTER_VERSION,
    requestEvidenceId: status.evidenceId,
    externalSubmissionId: submissionId.value,
    problemExternalId: problems[0]?.problemExternalId ?? NOWCODER_PROBLEM_ID,
    phase: "queued",
  };
  return {
    kind: "confirmed",
    evidence,
    matchedSubmitRequestId: inWindow[0]?.requestId ?? "",
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
  const endpointKey = normalizeNowCoderNetworkEndpoint(url);
  if (endpointKey === null || resourceType !== "xmlhttprequest") return null;
  if ((endpointKey === NOWCODER_SUBMIT_ENDPOINT_KEY && method !== "POST")
    || (endpointKey === NOWCODER_STATUS_ENDPOINT_KEY && method !== "GET")) return null;
  const statusCodeValue = Reflect.get(input, "statusCode");
  if (statusCodeValue !== undefined
    && (typeof statusCodeValue !== "number" || !Number.isInteger(statusCodeValue)
      || statusCodeValue < 100 || statusCodeValue > 599)) return null;
  return {
    schemaVersion: 1,
    evidenceId: `e1_nowcoder_${requestId}`,
    platform: "nowcoder",
    tier: "E1",
    kind: "request_observed",
    receivedAt,
    tabId,
    frameId,
    documentId,
    adapterVersion: NOWCODER_NETWORK_ADAPTER_VERSION,
    requestId,
    method,
    endpointKey,
    resourceType,
    lifecycle,
    apiTimeStamp,
    ...(statusCodeValue === undefined ? {} : { statusCode: statusCodeValue }),
  };
}

function submissionEvidence(input: unknown): unknown {
  if (!isSafeInputObject(input) || Reflect.get(input, "kind") !== "confirmation") return null;
  const statusEvidence = Reflect.get(input, "statusEvidence");
  const statusUrl = readString(input, "statusUrl");
  const submitCandidates = Reflect.get(input, "submitCandidates");
  const problemCandidates = Reflect.get(input, "problemCandidates");
  const now = readString(input, "now");
  if (!isE1(statusEvidence) || statusUrl === null || !Array.isArray(submitCandidates)
    || !submitCandidates.every(isE1) || !Array.isArray(problemCandidates)
    || !problemCandidates.every(isProblemCandidate) || now === null) return null;
  const result = selectNowCoderConfirmation({
    statusEvidence,
    statusUrl,
    submitCandidates,
    problemCandidates,
    now,
  });
  return result.kind === "confirmed" ? result.evidence : null;
}

function verdictEvidence(input: unknown): unknown {
  if (!isSafeInputObject(input) || Reflect.get(input, "kind") !== "verdict") return null;
  const pageUrl = readString(input, "pageUrl");
  const problemExternalId = readString(input, "problemExternalId");
  const verdictText = readString(input, "verdictText");
  const documentId = readString(input, "documentId");
  const receivedAt = readString(input, "receivedAt");
  const tabId = readNonnegativeInteger(input, "tabId");
  const frameId = readNonnegativeInteger(input, "frameId");
  if (pageUrl === null || problemExternalId !== NOWCODER_PROBLEM_ID
    || verdictText === null || documentId === null || receivedAt === null
    || tabId === null || frameId === null) return null;
  const submissionId = readResultPageSubmissionId(pageUrl);
  const verdict = normalizeNowCoderVerdict(verdictText);
  if (submissionId === null || verdict === null) return null;
  return {
    schemaVersion: 1,
    evidenceId: `e3_nowcoder_${submissionId}`,
    platform: "nowcoder",
    tier: "E3",
    kind: "final_verdict_confirmed",
    receivedAt,
    tabId,
    frameId,
    documentId,
    adapterVersion: NOWCODER_NETWORK_ADAPTER_VERSION,
    externalSubmissionId: submissionId,
    problemExternalId,
    verdict,
  };
}

export const NOWCODER_NETWORK_POLICY = defineNetworkAdapterPolicy({
  requestEvidence,
  submissionEvidence,
  verdictEvidence,
});

function readStatusSubmissionId(
  rawUrl: string,
):
  | { readonly kind: "valid"; readonly value: string }
  | {
    readonly kind: "invalid";
    readonly reason: "missing_submission_id" | "malformed_submission_id" | "duplicate_submission_id";
  } {
  const parsed = parseOwnedUrl(rawUrl);
  if (parsed === null || parsed.pathname !== "/nccommon/status" || parsed.hash !== "") {
    return { kind: "invalid", reason: "missing_submission_id" };
  }
  const values = parsed.searchParams.getAll("submissionId");
  if (values.length === 0) return { kind: "invalid", reason: "missing_submission_id" };
  if (values.length > 1) return { kind: "invalid", reason: "duplicate_submission_id" };
  const value = values[0];
  return value !== undefined && /^[0-9]{1,20}$/u.test(value)
    ? { kind: "valid", value }
    : { kind: "invalid", reason: "malformed_submission_id" };
}

function readResultPageSubmissionId(rawUrl: string): string | null {
  const parsed = parseOwnedUrl(rawUrl);
  if (parsed === null || parsed.pathname !== "/acm/contest/view-submission"
    || parsed.hash !== "" || [...parsed.searchParams.keys()].some((key) => key !== "submissionId")) {
    return null;
  }
  const values = parsed.searchParams.getAll("submissionId");
  const value = values[0];
  return values.length === 1 && value !== undefined && /^[0-9]{1,20}$/u.test(value)
    ? value
    : null;
}

function normalizeNowCoderVerdict(value: string): string | null {
  const normalized = value.trim();
  const verdicts = new Map<string, string>([
    ["Accepted", "Accepted"],
    ["Wrong Answer", "Wrong Answer"],
    ["Compile Error", "Compile Error"],
    ["Runtime Error", "Runtime Error"],
    ["Time Limit Exceeded", "Time Limit Exceeded"],
    ["Memory Limit Exceeded", "Memory Limit Exceeded"],
    ["Output Limit Exceeded", "Output Limit Exceeded"],
    ["Partially Accepted", "Partially Accepted"],
    ["\u7b54\u6848\u6b63\u786e", "Accepted"],
    ["\u7b54\u6848\u9519\u8bef", "Wrong Answer"],
    ["\u7f16\u8bd1\u9519\u8bef", "Compile Error"],
    ["\u8fd0\u884c\u9519\u8bef", "Runtime Error"],
    ["\u65f6\u95f4\u8d85\u9650", "Time Limit Exceeded"],
    ["\u5185\u5b58\u8d85\u9650", "Memory Limit Exceeded"],
    ["\u8f93\u51fa\u8d85\u9650", "Output Limit Exceeded"],
    ["\u90e8\u5206\u901a\u8fc7", "Partially Accepted"],
  ]);
  return verdicts.get(normalized) ?? null;
}

function parseOwnedUrl(rawUrl: string): URL | null {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return null;
  }
  return parsed.protocol === "https:"
    && parsed.hostname === "ac.nowcoder.com"
    && parsed.username === ""
    && parsed.password === ""
    && parsed.port === ""
    ? parsed
    : null;
}

function isSafeInputObject(value: unknown): value is object {
  return typeof value === "object" && value !== null && !findForbiddenKey(value, new WeakSet<object>());
}

function findForbiddenKey(value: object, visited: WeakSet<object>): boolean {
  if (visited.has(value)) return false;
  visited.add(value);
  for (const [key, nested] of Object.entries(value)) {
    if (FORBIDDEN_INPUT_KEYS.has(key)) return true;
    if (typeof nested === "object" && nested !== null && findForbiddenKey(nested, visited)) return true;
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

function isE1(value: unknown): value is E1RequestObserved {
  return typeof value === "object" && value !== null
    && Reflect.get(value, "kind") === "request_observed"
    && Reflect.get(value, "tier") === "E1"
    && Reflect.get(value, "platform") === "nowcoder";
}

function isProblemCandidate(value: unknown): value is NowCoderProblemCandidate {
  return typeof value === "object" && value !== null
    && typeof Reflect.get(value, "problemExternalId") === "string"
    && typeof Reflect.get(value, "observedAt") === "string"
    && typeof Reflect.get(value, "tabId") === "number"
    && typeof Reflect.get(value, "frameId") === "number"
    && typeof Reflect.get(value, "documentId") === "string";
}
