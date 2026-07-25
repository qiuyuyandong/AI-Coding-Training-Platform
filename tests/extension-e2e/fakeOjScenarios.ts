/**
 * Phase A Task A9 — Fake OJ scenario catalogue.
 *
 * Pure data file. Each scenario describes a single Fake OJ exercise: the
 * synthetic request/response flow, the expected MAIN bridge summary, and the
 * post-orchestrator storage expectations. Scenarios never execute anything
 * by themselves; the spec is the only consumer and is responsible for
 * driving {@link createFakeOjPage} with the right plan.
 *
 * Strict TypeScript: no `any`, `as any`, `as unknown`, `@ts-ignore`,
 * `@ts-expect-error`, or non-null assertion operators.
 */

import type { FinalCaptureVerdict } from "@/lib/capture/verdictTaxonomy";

import {
  CODEFORCES_SUBMIT_URL,
  FAKE_OJ_DEFAULT_VERDICT,
  LEETCODE_SUBMIT_URL,
  LUOGU_SUBMIT_URL,
  NOWCODER_RESULT_URL,
  NOWCODER_SUBMIT_URL,
  deriveStableDocumentId,
  deriveStableProblemId,
  deriveStableSubmissionId,
  type FakeOjExpectedBridgeSummary,
  type FakeOjExpectedCall,
  type FakeOjPlatform,
  type FakeOjRequestResponse,
  type FakeOjRoutePlan,
  type FakeOjStorageExpectation,
} from "./fakeOj";

// ---------------------------------------------------------------------------
// Scenario description
// ---------------------------------------------------------------------------

export type FakeOjVerificationMode = "seed_then_e3" | "page_capture_only" | "e1_only";

/**
 * Full description of one Fake OJ scenario. The shape is a frozen record
 * so the spec can pattern-match on every field without defensive guards.
 */
export type FakeOjScenario = Readonly<{
  /** Stable scenario slug used as a fixture file name. */
  readonly name: string;
  /** Human-readable description used as the test title. */
  readonly description: string;
  /** Which OJ platform the Fake OJ impersonates. */
  readonly platform: FakeOjPlatform;
  /** Synthetic submit URL the page will fetch. */
  readonly submitUrl: string;
  /** Optional synthetic result URL used by redirect/SPA scenarios. */
  readonly resultUrl: string | null;
  /** Response plan the Fake OJ installs for the synthetic URLs. */
  readonly routePlans: FakeOjRoutePlan;
  /** Expected webRequest calls the orchestrator will observe. */
  readonly expectedWebRequestCalls: readonly FakeOjExpectedCall[];
  /** Expected MAIN bridge summary the test will post to the page. */
  readonly expectedBridgeSummary: FakeOjExpectedBridgeSummary;
  /** Whether this scenario uses Option B, relay-only capture, or E1-only verification. */
  readonly verificationMode: FakeOjVerificationMode;
  /** Whether the scenario must deliver a final E3 verdict (via worker context). */
  readonly requiresFinalVerdict: boolean;
  /** Optional verdict value when {@link requiresFinalVerdict} is true. */
  readonly finalVerdict?: FinalCaptureVerdict;
  /** Storage expectations checked after the orchestrator settles. */
  readonly expectedStorage: FakeOjStorageExpectation;
}>;

// ---------------------------------------------------------------------------
// Helpers used by every scenario
// ---------------------------------------------------------------------------

function problemIdFor(scenarioName: string): string {
  return deriveStableProblemId(scenarioName);
}

function submissionIdFor(scenarioName: string): string {
  return deriveStableSubmissionId(scenarioName);
}

function documentIdFor(scenarioName: string): string {
  return deriveStableDocumentId(scenarioName);
}

function jsonPlan(status: number, body: unknown): FakeOjRequestResponse {
  return Object.freeze({
    kind: "http",
    status,
    body: JSON.stringify(body),
    contentType: "application/json",
  });
}

function htmlPlan(status: number, body: string): FakeOjRequestResponse {
  return Object.freeze({
    kind: "http",
    status,
    body,
    contentType: "text/html; charset=utf-8",
  });
}

function redirectPlan(location: string, status?: number): FakeOjRequestResponse {
  return Object.freeze({
    kind: "redirect",
    location,
    ...(status === undefined ? {} : { status }),
  });
}

function abortPlan(reason?: string): FakeOjRequestResponse {
  return Object.freeze({
    kind: "abort",
    ...(reason === undefined ? {} : { reason }),
  });
}

function spaPlan(path: string): FakeOjRequestResponse {
  return Object.freeze({
    kind: "spaNavigation",
    path,
  });
}

// ---------------------------------------------------------------------------
// Scenario 1 — success JSON with stable submission ID (default happy path)
// ---------------------------------------------------------------------------

const successJsonScenario: FakeOjScenario = Object.freeze({
  name: "success-json-stable-submission-id",
  description: "NowCoder submit returns a 200 JSON body with a stable submission id",
  platform: "nowcoder",
  submitUrl: NOWCODER_SUBMIT_URL,
  resultUrl: NOWCODER_RESULT_URL,
  routePlans: new Map<string, FakeOjRequestResponse>([
    [NOWCODER_SUBMIT_URL, jsonPlan(200, { status: "accepted", submissionId: submissionIdFor("success-json-stable-submission-id") })],
  ]),
  expectedWebRequestCalls: Object.freeze([
    Object.freeze({
      url: NOWCODER_SUBMIT_URL,
      method: "POST",
      statusCode: 200,
      producesWebRequestMarker: false,
    }),
  ]),
  expectedBridgeSummary: Object.freeze({
    platform: "nowcoder",
    method: "POST",
    endpointKey: "submit",
    externalSubmissionId: submissionIdFor("success-json-stable-submission-id"),
    problemExternalId: problemIdFor("success-json-stable-submission-id"),
  }),
  verificationMode: "seed_then_e3",
  requiresFinalVerdict: true,
  finalVerdict: FAKE_OJ_DEFAULT_VERDICT,
  expectedStorage: Object.freeze({
    webRequestMarkerCount: 0,
    transientE1Count: 1,
    finalTransientE1Count: 0,
    unmatchedE3Count: 0,
    ambiguityDiagnosticCount: 0,
    outboxCount: 1,
    confirmedSubmissionCount: 0,
    tombstoneCount: 1,
    expectedFinalVerdict: FAKE_OJ_DEFAULT_VERDICT,
  }),
});

// ---------------------------------------------------------------------------
// Scenario 2 — 302 result redirect
// ---------------------------------------------------------------------------

const redirect302Scenario: FakeOjScenario = Object.freeze({
  name: "redirect-302-result",
  description: "NowCoder submit returns 302 redirect to a result URL",
  platform: "nowcoder",
  submitUrl: NOWCODER_SUBMIT_URL,
  resultUrl: NOWCODER_RESULT_URL,
  routePlans: new Map<string, FakeOjRequestResponse>([
    [NOWCODER_SUBMIT_URL, redirectPlan(NOWCODER_RESULT_URL, 302)],
    [NOWCODER_RESULT_URL, htmlPlan(200, "<!doctype html><title>result</title>")],
  ]),
  expectedWebRequestCalls: Object.freeze([
    Object.freeze({ url: NOWCODER_SUBMIT_URL, method: "POST", statusCode: 302, producesWebRequestMarker: false }),
    Object.freeze({ url: NOWCODER_RESULT_URL, method: "GET", statusCode: 200, producesWebRequestMarker: false }),
  ]),
  expectedBridgeSummary: Object.freeze({
    platform: "nowcoder",
    method: "POST",
    endpointKey: "submit",
    externalSubmissionId: submissionIdFor("redirect-302-result"),
    problemExternalId: problemIdFor("redirect-302-result"),
    redirectEndpointKey: "result",
  }),
  verificationMode: "page_capture_only",
  requiresFinalVerdict: false,
  expectedStorage: Object.freeze({
    webRequestMarkerCount: 0,
    transientE1Count: 1,
    finalTransientE1Count: 1,
    unmatchedE3Count: 0,
    ambiguityDiagnosticCount: 0,
    outboxCount: 0,
    confirmedSubmissionCount: 0,
    tombstoneCount: 0,
  }),
});

// ---------------------------------------------------------------------------
// Scenario 3 — SPA result URL
// ---------------------------------------------------------------------------

const spaResultScenario: FakeOjScenario = Object.freeze({
  name: "spa-result-url",
  description: "NowCoder submit returns 200 and the page performs an SPA history pushState",
  platform: "nowcoder",
  submitUrl: NOWCODER_SUBMIT_URL,
  resultUrl: NOWCODER_RESULT_URL,
  routePlans: new Map<string, FakeOjRequestResponse>([
    [NOWCODER_SUBMIT_URL, spaPlan("/fake-oj/spa-result")],
    [NOWCODER_RESULT_URL, htmlPlan(200, "<!doctype html><title>spa</title>")],
  ]),
  expectedWebRequestCalls: Object.freeze([
    Object.freeze({ url: NOWCODER_SUBMIT_URL, method: "POST", statusCode: 200, producesWebRequestMarker: false }),
  ]),
  expectedBridgeSummary: Object.freeze({
    platform: "nowcoder",
    method: "POST",
    endpointKey: "submit",
    externalSubmissionId: submissionIdFor("spa-result-url"),
    problemExternalId: problemIdFor("spa-result-url"),
  }),
  verificationMode: "seed_then_e3",
  requiresFinalVerdict: true,
  finalVerdict: "Wrong Answer",
  expectedStorage: Object.freeze({
    webRequestMarkerCount: 0,
    transientE1Count: 1,
    finalTransientE1Count: 0,
    unmatchedE3Count: 0,
    ambiguityDiagnosticCount: 0,
    outboxCount: 1,
    confirmedSubmissionCount: 0,
    tombstoneCount: 1,
    expectedFinalVerdict: "Wrong Answer",
  }),
});

// ---------------------------------------------------------------------------
// Scenario 4 — HTTP 200 business rejection
// ---------------------------------------------------------------------------

const businessRejectionScenario: FakeOjScenario = Object.freeze({
  name: "http-200-business-rejection",
  description: "NowCoder submit returns 200 OK but the body reports a business rejection",
  platform: "nowcoder",
  submitUrl: NOWCODER_SUBMIT_URL,
  resultUrl: null,
  routePlans: new Map<string, FakeOjRequestResponse>([
    [NOWCODER_SUBMIT_URL, jsonPlan(200, { error: "business_rejection", reason: "empty_code" })],
  ]),
  expectedWebRequestCalls: Object.freeze([
    Object.freeze({ url: NOWCODER_SUBMIT_URL, method: "POST", statusCode: 200, producesWebRequestMarker: false }),
  ]),
  expectedBridgeSummary: Object.freeze({
    platform: "nowcoder",
    method: "POST",
    endpointKey: "submit",
    externalSubmissionId: submissionIdFor("http-200-business-rejection"),
    problemExternalId: problemIdFor("http-200-business-rejection"),
  }),
  verificationMode: "page_capture_only",
  requiresFinalVerdict: false,
  expectedStorage: Object.freeze({
    webRequestMarkerCount: 0,
    transientE1Count: 1,
    finalTransientE1Count: 1,
    unmatchedE3Count: 0,
    ambiguityDiagnosticCount: 0,
    outboxCount: 0,
    confirmedSubmissionCount: 0,
    tombstoneCount: 0,
  }),
});

// ---------------------------------------------------------------------------
// Scenario 5 — HTTP 4xx
// ---------------------------------------------------------------------------

const http4xxScenario: FakeOjScenario = Object.freeze({
  name: "http-4xx",
  description: "NowCoder submit returns HTTP 400 (CSRF expired)",
  platform: "nowcoder",
  submitUrl: NOWCODER_SUBMIT_URL,
  resultUrl: null,
  routePlans: new Map<string, FakeOjRequestResponse>([
    [NOWCODER_SUBMIT_URL, jsonPlan(400, { error: "csrf_expired" })],
  ]),
  expectedWebRequestCalls: Object.freeze([
    Object.freeze({ url: NOWCODER_SUBMIT_URL, method: "POST", statusCode: 400, producesWebRequestMarker: false }),
  ]),
  expectedBridgeSummary: Object.freeze({
    platform: "nowcoder",
    method: "POST",
    endpointKey: "submit",
    externalSubmissionId: submissionIdFor("http-4xx"),
    problemExternalId: problemIdFor("http-4xx"),
  }),
  verificationMode: "page_capture_only",
  requiresFinalVerdict: false,
  expectedStorage: Object.freeze({
    webRequestMarkerCount: 0,
    transientE1Count: 1,
    finalTransientE1Count: 1,
    unmatchedE3Count: 0,
    ambiguityDiagnosticCount: 0,
    outboxCount: 0,
    confirmedSubmissionCount: 0,
    tombstoneCount: 0,
  }),
});

// ---------------------------------------------------------------------------
// Scenario 6 — cancellation/network error
// ---------------------------------------------------------------------------

const cancellationScenario: FakeOjScenario = Object.freeze({
  name: "cancellation-network-error",
  description: "NowCoder submit is aborted by the Fake OJ before the response completes",
  platform: "nowcoder",
  submitUrl: NOWCODER_SUBMIT_URL,
  resultUrl: null,
  routePlans: new Map<string, FakeOjRequestResponse>([
    [NOWCODER_SUBMIT_URL, abortPlan("failed")],
  ]),
  expectedWebRequestCalls: Object.freeze([
    Object.freeze({ url: NOWCODER_SUBMIT_URL, method: "POST", statusCode: 0, producesWebRequestMarker: false }),
  ]),
  expectedBridgeSummary: Object.freeze({
    platform: "nowcoder",
    method: "POST",
    endpointKey: "submit",
    externalSubmissionId: submissionIdFor("cancellation-network-error"),
    problemExternalId: problemIdFor("cancellation-network-error"),
  }),
  verificationMode: "page_capture_only",
  requiresFinalVerdict: false,
  expectedStorage: Object.freeze({
    webRequestMarkerCount: 0,
    transientE1Count: 1,
    finalTransientE1Count: 1,
    unmatchedE3Count: 0,
    ambiguityDiagnosticCount: 0,
    outboxCount: 0,
    confirmedSubmissionCount: 0,
    tombstoneCount: 0,
  }),
});

// ---------------------------------------------------------------------------
// Scenario 7 — judging then final
// ---------------------------------------------------------------------------

const judgingThenFinalScenario: FakeOjScenario = Object.freeze({
  name: "judging-then-final",
  description: "NowCoder returns judging status, then a final verdict via E3",
  platform: "nowcoder",
  submitUrl: NOWCODER_SUBMIT_URL,
  resultUrl: NOWCODER_RESULT_URL,
  routePlans: new Map<string, FakeOjRequestResponse>([
    [NOWCODER_SUBMIT_URL, jsonPlan(200, { status: "judging", submissionId: submissionIdFor("judging-then-final") })],
    [NOWCODER_RESULT_URL, htmlPlan(200, "<!doctype html><title>judging</title>")],
  ]),
  expectedWebRequestCalls: Object.freeze([
    Object.freeze({ url: NOWCODER_SUBMIT_URL, method: "POST", statusCode: 200, producesWebRequestMarker: false }),
  ]),
  expectedBridgeSummary: Object.freeze({
    platform: "nowcoder",
    method: "POST",
    endpointKey: "submit",
    externalSubmissionId: submissionIdFor("judging-then-final"),
    problemExternalId: problemIdFor("judging-then-final"),
  }),
  verificationMode: "seed_then_e3",
  requiresFinalVerdict: true,
  finalVerdict: "Accepted",
  expectedStorage: Object.freeze({
    webRequestMarkerCount: 0,
    transientE1Count: 1,
    finalTransientE1Count: 0,
    unmatchedE3Count: 0,
    ambiguityDiagnosticCount: 0,
    outboxCount: 1,
    confirmedSubmissionCount: 0,
    tombstoneCount: 1,
    expectedFinalVerdict: "Accepted",
  }),
});

// ---------------------------------------------------------------------------
// Scenario 8 — immediate final
// ---------------------------------------------------------------------------

const immediateFinalScenario: FakeOjScenario = Object.freeze({
  name: "immediate-final",
  description: "NowCoder returns the final verdict in the same response as the submission",
  platform: "nowcoder",
  submitUrl: NOWCODER_SUBMIT_URL,
  resultUrl: null,
  routePlans: new Map<string, FakeOjRequestResponse>([
    [NOWCODER_SUBMIT_URL, jsonPlan(200, {
      status: "accepted",
      submissionId: submissionIdFor("immediate-final"),
      verdict: "Accepted",
    })],
  ]),
  expectedWebRequestCalls: Object.freeze([
    Object.freeze({ url: NOWCODER_SUBMIT_URL, method: "POST", statusCode: 200, producesWebRequestMarker: false }),
  ]),
  expectedBridgeSummary: Object.freeze({
    platform: "nowcoder",
    method: "POST",
    endpointKey: "submit",
    externalSubmissionId: submissionIdFor("immediate-final"),
    problemExternalId: problemIdFor("immediate-final"),
  }),
  verificationMode: "seed_then_e3",
  requiresFinalVerdict: true,
  finalVerdict: "Accepted",
  expectedStorage: Object.freeze({
    webRequestMarkerCount: 0,
    transientE1Count: 1,
    finalTransientE1Count: 0,
    unmatchedE3Count: 0,
    ambiguityDiagnosticCount: 0,
    outboxCount: 1,
    confirmedSubmissionCount: 0,
    tombstoneCount: 1,
    expectedFinalVerdict: "Accepted",
  }),
});

// ---------------------------------------------------------------------------
// Scenario 9 — rapid same-problem resubmission
// ---------------------------------------------------------------------------

const rapidResubmitScenario: FakeOjScenario = Object.freeze({
  name: "rapid-same-problem-resubmission",
  description: "NowCoder receives two rapid submissions for the same problem",
  platform: "nowcoder",
  submitUrl: NOWCODER_SUBMIT_URL,
  resultUrl: null,
  routePlans: new Map<string, FakeOjRequestResponse>([
    [NOWCODER_SUBMIT_URL, jsonPlan(200, { status: "accepted" })],
  ]),
  expectedWebRequestCalls: Object.freeze([
    Object.freeze({ url: NOWCODER_SUBMIT_URL, method: "POST", statusCode: 200, producesWebRequestMarker: false }),
    Object.freeze({ url: NOWCODER_SUBMIT_URL, method: "POST", statusCode: 200, producesWebRequestMarker: false }),
  ]),
  expectedBridgeSummary: Object.freeze({
    platform: "nowcoder",
    method: "POST",
    endpointKey: "submit",
    externalSubmissionId: submissionIdFor("rapid-same-problem-resubmission-1"),
    problemExternalId: problemIdFor("rapid-same-problem-resubmission"),
  }),
  verificationMode: "e1_only",
  requiresFinalVerdict: false,
  expectedStorage: Object.freeze({
    webRequestMarkerCount: 0,
    transientE1Count: 2,
    finalTransientE1Count: 2,
    unmatchedE3Count: 0,
    ambiguityDiagnosticCount: 0,
    outboxCount: 0,
    confirmedSubmissionCount: 0,
    tombstoneCount: 0,
  }),
});

// ---------------------------------------------------------------------------
// Scenario 10 — two concurrent submissions
// ---------------------------------------------------------------------------

const concurrentSubmissionsScenario: FakeOjScenario = Object.freeze({
  name: "two-concurrent-submissions",
  description: "NowCoder receives two concurrent submissions issued in parallel",
  platform: "nowcoder",
  submitUrl: NOWCODER_SUBMIT_URL,
  resultUrl: null,
  routePlans: new Map<string, FakeOjRequestResponse>([
    [NOWCODER_SUBMIT_URL, jsonPlan(200, { status: "accepted" })],
  ]),
  expectedWebRequestCalls: Object.freeze([
    Object.freeze({ url: NOWCODER_SUBMIT_URL, method: "POST", statusCode: 200, producesWebRequestMarker: false }),
    Object.freeze({ url: NOWCODER_SUBMIT_URL, method: "POST", statusCode: 200, producesWebRequestMarker: false }),
  ]),
  expectedBridgeSummary: Object.freeze({
    platform: "nowcoder",
    method: "POST",
    endpointKey: "submit",
    externalSubmissionId: submissionIdFor("two-concurrent-submissions-a"),
    problemExternalId: problemIdFor("two-concurrent-submissions"),
  }),
  verificationMode: "e1_only",
  requiresFinalVerdict: false,
  expectedStorage: Object.freeze({
    webRequestMarkerCount: 0,
    transientE1Count: 2,
    finalTransientE1Count: 2,
    unmatchedE3Count: 0,
    ambiguityDiagnosticCount: 0,
    outboxCount: 0,
    confirmedSubmissionCount: 0,
    tombstoneCount: 0,
  }),
});

// ---------------------------------------------------------------------------
// Scenario 11 — duplicate submission ID
// ---------------------------------------------------------------------------

const duplicateSubmissionScenario: FakeOjScenario = Object.freeze({
  name: "duplicate-submission-id",
  description: "NowCoder is observed twice with the exact same external submission id",
  platform: "nowcoder",
  submitUrl: NOWCODER_SUBMIT_URL,
  resultUrl: null,
  routePlans: new Map<string, FakeOjRequestResponse>([
    [NOWCODER_SUBMIT_URL, jsonPlan(200, { status: "accepted", submissionId: "duplicate-42" })],
  ]),
  expectedWebRequestCalls: Object.freeze([
    Object.freeze({ url: NOWCODER_SUBMIT_URL, method: "POST", statusCode: 200, producesWebRequestMarker: false }),
    Object.freeze({ url: NOWCODER_SUBMIT_URL, method: "POST", statusCode: 200, producesWebRequestMarker: false }),
  ]),
  expectedBridgeSummary: Object.freeze({
    platform: "nowcoder",
    method: "POST",
    endpointKey: "submit",
    externalSubmissionId: "duplicate-42",
    problemExternalId: problemIdFor("duplicate-submission-id"),
  }),
  verificationMode: "seed_then_e3",
  requiresFinalVerdict: true,
  finalVerdict: "Accepted",
  expectedStorage: Object.freeze({
    webRequestMarkerCount: 0,
    transientE1Count: 2,
    finalTransientE1Count: 1,
    unmatchedE3Count: 0,
    ambiguityDiagnosticCount: 0,
    outboxCount: 1,
    confirmedSubmissionCount: 0,
    tombstoneCount: 1,
    expectedFinalVerdict: "Accepted",
  }),
});

// ---------------------------------------------------------------------------
// Scenario 12 — forged bridge summary
// ---------------------------------------------------------------------------

const forgedBridgeScenario: FakeOjScenario = Object.freeze({
  name: "forged-bridge-summary",
  description: "Page posts a synthetic bridge summary whose values exceed the A1 envelope",
  platform: "nowcoder",
  submitUrl: NOWCODER_SUBMIT_URL,
  resultUrl: null,
  routePlans: new Map<string, FakeOjRequestResponse>([
    [NOWCODER_SUBMIT_URL, jsonPlan(200, { status: "accepted", submissionId: submissionIdFor("forged-bridge-summary") })],
  ]),
  expectedWebRequestCalls: Object.freeze([
    Object.freeze({ url: NOWCODER_SUBMIT_URL, method: "POST", statusCode: 200, producesWebRequestMarker: false }),
  ]),
  expectedBridgeSummary: Object.freeze({
    platform: "nowcoder",
    method: "POST",
    endpointKey: "submit",
    externalSubmissionId: submissionIdFor("forged-bridge-summary"),
    problemExternalId: problemIdFor("forged-bridge-summary"),
  }),
  verificationMode: "page_capture_only",
  requiresFinalVerdict: false,
  expectedStorage: Object.freeze({
    webRequestMarkerCount: 0,
    transientE1Count: 1,
    finalTransientE1Count: 1,
    unmatchedE3Count: 0,
    ambiguityDiagnosticCount: 0,
    outboxCount: 0,
    confirmedSubmissionCount: 0,
    tombstoneCount: 0,
  }),
});

// ---------------------------------------------------------------------------
// Scenario 13 — one summary matching multiple E1 candidates
// ---------------------------------------------------------------------------

const multipleE1CandidatesScenario: FakeOjScenario = Object.freeze({
  name: "one-summary-multiple-e1-candidates",
  description: "Two NowCoder POST requests share the same identity window as one bridge summary",
  platform: "nowcoder",
  submitUrl: NOWCODER_SUBMIT_URL,
  resultUrl: null,
  routePlans: new Map<string, FakeOjRequestResponse>([
    [NOWCODER_SUBMIT_URL, jsonPlan(200, { status: "accepted" })],
  ]),
  expectedWebRequestCalls: Object.freeze([
    Object.freeze({ url: NOWCODER_SUBMIT_URL, method: "POST", statusCode: 200, producesWebRequestMarker: false }),
    Object.freeze({ url: NOWCODER_SUBMIT_URL, method: "POST", statusCode: 200, producesWebRequestMarker: false }),
  ]),
  expectedBridgeSummary: Object.freeze({
    platform: "nowcoder",
    method: "POST",
    endpointKey: "submit",
    externalSubmissionId: submissionIdFor("one-summary-multiple-e1-candidates"),
    problemExternalId: problemIdFor("one-summary-multiple-e1-candidates"),
  }),
  verificationMode: "page_capture_only",
  requiresFinalVerdict: false,
  expectedStorage: Object.freeze({
    webRequestMarkerCount: 0,
    transientE1Count: 2,
    finalTransientE1Count: 2,
    unmatchedE3Count: 0,
    ambiguityDiagnosticCount: 0,
    outboxCount: 0,
    confirmedSubmissionCount: 0,
    tombstoneCount: 0,
  }),
});

// ---------------------------------------------------------------------------
// Scenario 14 — cross-tab/frame/document result
// ---------------------------------------------------------------------------

const crossTabScenario: FakeOjScenario = Object.freeze({
  name: "cross-tab-frame-document-result",
  description: "Bridge summary posted with a documentId that does not match the captured document",
  platform: "nowcoder",
  submitUrl: NOWCODER_SUBMIT_URL,
  resultUrl: null,
  routePlans: new Map<string, FakeOjRequestResponse>([
    [NOWCODER_SUBMIT_URL, jsonPlan(200, { status: "accepted", submissionId: submissionIdFor("cross-tab-frame-document-result") })],
  ]),
  expectedWebRequestCalls: Object.freeze([
    Object.freeze({ url: NOWCODER_SUBMIT_URL, method: "POST", statusCode: 200, producesWebRequestMarker: false }),
  ]),
  expectedBridgeSummary: Object.freeze({
    platform: "nowcoder",
    method: "POST",
    endpointKey: "submit",
    externalSubmissionId: submissionIdFor("cross-tab-frame-document-result"),
    problemExternalId: problemIdFor("cross-tab-frame-document-result"),
  }),
  verificationMode: "page_capture_only",
  requiresFinalVerdict: false,
  expectedStorage: Object.freeze({
    webRequestMarkerCount: 0,
    transientE1Count: 1,
    finalTransientE1Count: 1,
    unmatchedE3Count: 0,
    ambiguityDiagnosticCount: 0,
    outboxCount: 0,
    confirmedSubmissionCount: 0,
    tombstoneCount: 0,
  }),
});

/**
 * Override documentId for the cross-tab scenario. The override is applied
 * at spec time so the page posts a summary whose `documentId` does not
 * match the captured document. The helper is exported as a constant rather
 * than baked into the scenario object so consumers can pass it through
 * `createFakeOjMainScenario` directly.
 */
export const CROSS_TAB_FAKE_OJ_DOCUMENT_ID = "fake-oj-foreign-doc-cross-tab";

// ---------------------------------------------------------------------------
// Scenario 15 — service-worker restart between every major state
// ---------------------------------------------------------------------------

const workerRestartScenario: FakeOjScenario = Object.freeze({
  name: "service-worker-restart-between-states",
  description: "NowCoder submission followed by a service-worker stop+reawaken cycle",
  platform: "nowcoder",
  submitUrl: NOWCODER_SUBMIT_URL,
  resultUrl: null,
  routePlans: new Map<string, FakeOjRequestResponse>([
    [NOWCODER_SUBMIT_URL, jsonPlan(200, { status: "accepted", submissionId: submissionIdFor("service-worker-restart-between-states") })],
  ]),
  expectedWebRequestCalls: Object.freeze([
    Object.freeze({ url: NOWCODER_SUBMIT_URL, method: "POST", statusCode: 200, producesWebRequestMarker: false }),
    Object.freeze({ url: NOWCODER_SUBMIT_URL, method: "POST", statusCode: 200, producesWebRequestMarker: false }),
  ]),
  expectedBridgeSummary: Object.freeze({
    platform: "nowcoder",
    method: "POST",
    endpointKey: "submit",
    externalSubmissionId: submissionIdFor("service-worker-restart-between-states"),
    problemExternalId: problemIdFor("service-worker-restart-between-states"),
  }),
  verificationMode: "e1_only",
  requiresFinalVerdict: false,
  expectedStorage: Object.freeze({
    webRequestMarkerCount: 0,
    transientE1Count: 2,
    finalTransientE1Count: 2,
    unmatchedE3Count: 0,
    ambiguityDiagnosticCount: 0,
    outboxCount: 0,
    confirmedSubmissionCount: 0,
    tombstoneCount: 0,
  }),
});

// ---------------------------------------------------------------------------
// Scenario 16 — browser restart after E1 and after E2
// ---------------------------------------------------------------------------

const browserRestartScenario: FakeOjScenario = Object.freeze({
  name: "browser-restart-after-e1-and-after-e2",
  description: "NowCoder submission followed by a fresh BrowserContext reusing the profile",
  platform: "nowcoder",
  submitUrl: NOWCODER_SUBMIT_URL,
  resultUrl: null,
  routePlans: new Map<string, FakeOjRequestResponse>([
    [NOWCODER_SUBMIT_URL, jsonPlan(200, { status: "accepted", submissionId: submissionIdFor("browser-restart-after-e1-and-after-e2") })],
  ]),
  expectedWebRequestCalls: Object.freeze([
    Object.freeze({ url: NOWCODER_SUBMIT_URL, method: "POST", statusCode: 200, producesWebRequestMarker: false }),
  ]),
  expectedBridgeSummary: Object.freeze({
    platform: "nowcoder",
    method: "POST",
    endpointKey: "submit",
    externalSubmissionId: submissionIdFor("browser-restart-after-e1-and-after-e2"),
    problemExternalId: problemIdFor("browser-restart-after-e1-and-after-e2"),
  }),
  verificationMode: "seed_then_e3",
  requiresFinalVerdict: true,
  finalVerdict: "Accepted",
  expectedStorage: Object.freeze({
    webRequestMarkerCount: 0,
    transientE1Count: 1,
    finalTransientE1Count: 0,
    unmatchedE3Count: 0,
    ambiguityDiagnosticCount: 0,
    outboxCount: 1,
    confirmedSubmissionCount: 0,
    tombstoneCount: 1,
    expectedFinalVerdict: "Accepted",
  }),
});

// ---------------------------------------------------------------------------
// Scenario 17 — direct historical result page
// ---------------------------------------------------------------------------

const historicalResultScenario: FakeOjScenario = Object.freeze({
  name: "direct-historical-result-page",
  description: "NowCoder page is opened directly at a historical result URL with no preceding submission",
  platform: "nowcoder",
  submitUrl: NOWCODER_RESULT_URL,
  resultUrl: NOWCODER_RESULT_URL,
  routePlans: new Map<string, FakeOjRequestResponse>([
    [NOWCODER_RESULT_URL, htmlPlan(200, "<!doctype html><title>historical</title>")],
  ]),
  expectedWebRequestCalls: Object.freeze([
    Object.freeze({ url: NOWCODER_RESULT_URL, method: "GET", statusCode: 200, producesWebRequestMarker: false }),
  ]),
  expectedBridgeSummary: Object.freeze({
    platform: "nowcoder",
    method: "GET",
    endpointKey: "result",
    externalSubmissionId: submissionIdFor("direct-historical-result-page"),
    problemExternalId: problemIdFor("direct-historical-result-page"),
  }),
  verificationMode: "page_capture_only",
  requiresFinalVerdict: false,
  expectedStorage: Object.freeze({
    webRequestMarkerCount: 0,
    transientE1Count: 1,
    finalTransientE1Count: 1,
    unmatchedE3Count: 0,
    ambiguityDiagnosticCount: 0,
    outboxCount: 0,
    confirmedSubmissionCount: 0,
    tombstoneCount: 0,
  }),
});

// ---------------------------------------------------------------------------
// Scenario 18 — duplicate verdict
// ---------------------------------------------------------------------------

const duplicateVerdictScenario: FakeOjScenario = Object.freeze({
  name: "duplicate-verdict",
  description: "NowCoder submission receives the same final verdict twice via E3",
  platform: "nowcoder",
  submitUrl: NOWCODER_SUBMIT_URL,
  resultUrl: null,
  routePlans: new Map<string, FakeOjRequestResponse>([
    [NOWCODER_SUBMIT_URL, jsonPlan(200, { status: "accepted", submissionId: submissionIdFor("duplicate-verdict") })],
  ]),
  expectedWebRequestCalls: Object.freeze([
    Object.freeze({ url: NOWCODER_SUBMIT_URL, method: "POST", statusCode: 200, producesWebRequestMarker: false }),
  ]),
  expectedBridgeSummary: Object.freeze({
    platform: "nowcoder",
    method: "POST",
    endpointKey: "submit",
    externalSubmissionId: submissionIdFor("duplicate-verdict"),
    problemExternalId: problemIdFor("duplicate-verdict"),
  }),
  verificationMode: "seed_then_e3",
  requiresFinalVerdict: true,
  finalVerdict: "Accepted",
  expectedStorage: Object.freeze({
    webRequestMarkerCount: 0,
    transientE1Count: 1,
    finalTransientE1Count: 0,
    unmatchedE3Count: 1,
    ambiguityDiagnosticCount: 0,
    outboxCount: 1,
    confirmedSubmissionCount: 0,
    tombstoneCount: 1,
    expectedFinalVerdict: "Accepted",
  }),
});

// ---------------------------------------------------------------------------
// Cross-platform coverage scenarios (alternate OJ hosts)
// ---------------------------------------------------------------------------

const leetcodeScenario: FakeOjScenario = Object.freeze({
  name: "leetcode-success",
  description: "LeetCode submit returns 200 JSON with stable submission id",
  platform: "leetcode",
  submitUrl: LEETCODE_SUBMIT_URL,
  resultUrl: null,
  routePlans: new Map<string, FakeOjRequestResponse>([
    [LEETCODE_SUBMIT_URL, jsonPlan(200, { status: "accepted", submissionId: submissionIdFor("leetcode-success") })],
  ]),
  expectedWebRequestCalls: Object.freeze([
    Object.freeze({ url: LEETCODE_SUBMIT_URL, method: "POST", statusCode: 200, producesWebRequestMarker: false }),
  ]),
  expectedBridgeSummary: Object.freeze({
    platform: "leetcode",
    method: "POST",
    endpointKey: "submit",
    externalSubmissionId: submissionIdFor("leetcode-success"),
    problemExternalId: problemIdFor("leetcode-success"),
  }),
  verificationMode: "e1_only",
  requiresFinalVerdict: false,
  expectedStorage: Object.freeze({
    webRequestMarkerCount: 0,
    transientE1Count: 1,
    finalTransientE1Count: 1,
    unmatchedE3Count: 0,
    ambiguityDiagnosticCount: 0,
    outboxCount: 0,
    confirmedSubmissionCount: 0,
    tombstoneCount: 0,
  }),
});

const codeforcesScenario: FakeOjScenario = Object.freeze({
  name: "codeforces-success",
  description: "Codeforces submit returns 200 JSON with stable submission id",
  platform: "codeforces",
  submitUrl: CODEFORCES_SUBMIT_URL,
  resultUrl: null,
  routePlans: new Map<string, FakeOjRequestResponse>([
    [CODEFORCES_SUBMIT_URL, jsonPlan(200, { status: "accepted", submissionId: submissionIdFor("codeforces-success") })],
  ]),
  expectedWebRequestCalls: Object.freeze([
    Object.freeze({ url: CODEFORCES_SUBMIT_URL, method: "POST", statusCode: 200, producesWebRequestMarker: false }),
  ]),
  expectedBridgeSummary: Object.freeze({
    platform: "codeforces",
    method: "POST",
    endpointKey: "submit",
    externalSubmissionId: submissionIdFor("codeforces-success"),
    problemExternalId: problemIdFor("codeforces-success"),
  }),
  verificationMode: "e1_only",
  requiresFinalVerdict: false,
  expectedStorage: Object.freeze({
    webRequestMarkerCount: 0,
    transientE1Count: 1,
    finalTransientE1Count: 1,
    unmatchedE3Count: 0,
    ambiguityDiagnosticCount: 0,
    outboxCount: 0,
    confirmedSubmissionCount: 0,
    tombstoneCount: 0,
  }),
});

const luoguScenario: FakeOjScenario = Object.freeze({
  name: "luogu-success",
  description: "Luogu submit returns 200 JSON with stable submission id",
  platform: "luogu",
  submitUrl: LUOGU_SUBMIT_URL,
  resultUrl: null,
  routePlans: new Map<string, FakeOjRequestResponse>([
    [LUOGU_SUBMIT_URL, jsonPlan(200, { status: "accepted", submissionId: submissionIdFor("luogu-success") })],
  ]),
  expectedWebRequestCalls: Object.freeze([
    Object.freeze({ url: LUOGU_SUBMIT_URL, method: "POST", statusCode: 200, producesWebRequestMarker: false }),
  ]),
  expectedBridgeSummary: Object.freeze({
    platform: "luogu",
    method: "POST",
    endpointKey: "submit",
    externalSubmissionId: submissionIdFor("luogu-success"),
    problemExternalId: problemIdFor("luogu-success"),
  }),
  verificationMode: "e1_only",
  requiresFinalVerdict: false,
  expectedStorage: Object.freeze({
    webRequestMarkerCount: 0,
    transientE1Count: 1,
    finalTransientE1Count: 1,
    unmatchedE3Count: 0,
    ambiguityDiagnosticCount: 0,
    outboxCount: 0,
    confirmedSubmissionCount: 0,
    tombstoneCount: 0,
  }),
});

// ---------------------------------------------------------------------------
// Public catalog (ordered, frozen)
// ---------------------------------------------------------------------------

/**
 * Full scenario catalog. The first 18 entries exercise the Fake OJ acceptance
 * matrix; the final three are cross-platform E1 smoke cases. The spec runs
 * them independently in parallel so one failure cannot skip later coverage.
 */
export const FAKE_OJ_SCENARIOS: readonly FakeOjScenario[] = Object.freeze([
  successJsonScenario,
  redirect302Scenario,
  spaResultScenario,
  businessRejectionScenario,
  http4xxScenario,
  cancellationScenario,
  judgingThenFinalScenario,
  immediateFinalScenario,
  rapidResubmitScenario,
  concurrentSubmissionsScenario,
  duplicateSubmissionScenario,
  forgedBridgeScenario,
  multipleE1CandidatesScenario,
  crossTabScenario,
  workerRestartScenario,
  browserRestartScenario,
  historicalResultScenario,
  duplicateVerdictScenario,
  leetcodeScenario,
  codeforcesScenario,
  luoguScenario,
]);

/** Map from scenario name to scenario for direct lookup. */
export const FAKE_OJ_SCENARIOS_BY_NAME: ReadonlyMap<string, FakeOjScenario> = new Map(
  FAKE_OJ_SCENARIOS.map((scenario) => [scenario.name, scenario]),
);

// Re-export helpers that the spec uses to derive safe scenario data.
export {
  documentIdFor,
  problemIdFor,
  submissionIdFor,
};