import { describe, expect, it } from "vitest";
import {
  NOWCODER_CONFIRMATION_WINDOW_MS,
  NOWCODER_NETWORK_POLICY,
  NOWCODER_STATUS_ENDPOINT_KEY,
  NOWCODER_SUBMIT_ENDPOINT_KEY,
  normalizeNowCoderNetworkEndpoint,
  selectNowCoderConfirmation,
} from "@/extension/src/adapters/nowcoder/network";
import type { E1RequestObserved } from "@/extension/src/evidence";

const NOW = "2026-07-28T07:50:06.802Z";
const DOCUMENT_ID = "doc-nowcoder-1";

function request(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    kind: "request",
    url: "https://ac.nowcoder.com/nccommon/submit_cd",
    requestId: "submit-1",
    method: "POST",
    resourceType: "xmlhttprequest",
    lifecycle: "completed",
    statusCode: 200,
    tabId: 7,
    frameId: 0,
    documentId: DOCUMENT_ID,
    receivedAt: "2026-07-28T07:50:05.231Z",
    apiTimeStamp: 1000.5,
    ...overrides,
  };
}

function e1(overrides: Partial<E1RequestObserved> = {}): E1RequestObserved {
  return {
    schemaVersion: 1,
    evidenceId: "e1_nowcoder_submit-1",
    platform: "nowcoder",
    tier: "E1",
    kind: "request_observed",
    receivedAt: "2026-07-28T07:50:05.231Z",
    tabId: 7,
    frameId: 0,
    documentId: DOCUMENT_ID,
    adapterVersion: "v4-nowcoder-network-1",
    requestId: "submit-1",
    method: "POST",
    endpointKey: NOWCODER_SUBMIT_ENDPOINT_KEY,
    resourceType: "xmlhttprequest",
    lifecycle: "completed",
    apiTimeStamp: 1000.5,
    statusCode: 200,
    ...overrides,
  };
}

describe("NowCoder request policy", () => {
  it.each([
    ["https://ac.nowcoder.com/nccommon/submit_cd", NOWCODER_SUBMIT_ENDPOINT_KEY],
    ["https://ac.nowcoder.com/nccommon/status?submissionId=84257292", NOWCODER_STATUS_ENDPOINT_KEY],
  ])("normalizes %s", (url, expected) => {
    expect(normalizeNowCoderNetworkEndpoint(url)).toBe(expected);
  });

  it.each([
    "https://www.nowcoder.com/nccommon/submit_cd",
    "http://ac.nowcoder.com/nccommon/submit_cd",
    "https://ac.nowcoder.com/nccommon/submit_cd/extra",
    "https://ac.nowcoder.com.evil.example/nccommon/status?submissionId=1",
  ])("rejects an uncharacterized URL %s", (url) => {
    expect(normalizeNowCoderNetworkEndpoint(url)).toBeNull();
  });

  it("produces exact E1 for the characterized submit request", () => {
    expect(NOWCODER_NETWORK_POLICY.requestEvidence(request())).toMatchObject({
      platform: "nowcoder",
      tier: "E1",
      kind: "request_observed",
      requestId: "submit-1",
      method: "POST",
      endpointKey: NOWCODER_SUBMIT_ENDPOINT_KEY,
      lifecycle: "completed",
      statusCode: 200,
    });
  });

  it.each([
    { method: "GET" },
    { resourceType: "main_frame" },
    { body: "forbidden" },
  ])("rejects wrong or unsafe submit input %#", (override) => {
    expect(NOWCODER_NETWORK_POLICY.requestEvidence(request(override))).toBeNull();
  });

  it.each([{ statusCode: 500 }, { lifecycle: "error_occurred" }])(
    "retains failed E1 diagnostics without confirming them %#",
    (override) => {
      expect(NOWCODER_NETWORK_POLICY.requestEvidence(request(override))).toMatchObject(override);
    },
  );
});

describe("NowCoder E2 confirmation policy", () => {
  const status = e1({
    evidenceId: "e1_nowcoder_status-1",
    requestId: "status-1",
    method: "GET",
    endpointKey: NOWCODER_STATUS_ENDPOINT_KEY,
    receivedAt: "2026-07-28T07:50:06.797Z",
    apiTimeStamp: 2000.25,
  });
  const problem = {
    problemExternalId: "acm/contest/18839/1001",
    observedAt: "2026-07-28T07:50:04.800Z",
    tabId: 7,
    frameId: 0,
    documentId: DOCUMENT_ID,
  };

  it("confirms one exact submit/status/problem chain", () => {
    const result = selectNowCoderConfirmation({
      statusEvidence: status,
      statusUrl: "https://ac.nowcoder.com/nccommon/status?_=x&subTagId=x&submissionId=84257292&tagId=x",
      submitCandidates: [e1()],
      problemCandidates: [problem],
      now: NOW,
    });
    expect(result).toMatchObject({
      kind: "confirmed",
      matchedSubmitRequestId: "submit-1",
      evidence: {
        tier: "E2",
        kind: "submission_confirmed",
        requestEvidenceId: "e1_nowcoder_status-1",
        externalSubmissionId: "84257292",
        problemExternalId: "acm/contest/18839/1001",
      },
    });
  });

  it.each([
    ["missing_submit", []],
    ["multiple_submit_candidates", [e1(), e1({ requestId: "submit-2", evidenceId: "e1_nowcoder_submit-2" })]],
  ] as const)("fails closed for %s", (reason, submitCandidates) => {
    expect(selectNowCoderConfirmation({
      statusEvidence: status,
      statusUrl: "https://ac.nowcoder.com/nccommon/status?submissionId=84257292",
      submitCandidates,
      problemCandidates: [problem],
      now: NOW,
    })).toMatchObject({ kind: reason === "missing_submit" ? "no_match" : "ambiguous", reason });
  });

  it.each([
    ["missing_submission_id", "https://ac.nowcoder.com/nccommon/status"],
    ["malformed_submission_id", "https://ac.nowcoder.com/nccommon/status?submissionId=abc"],
    ["duplicate_submission_id", "https://ac.nowcoder.com/nccommon/status?submissionId=1&submissionId=2"],
  ])("rejects %s", (reason, statusUrl) => {
    expect(selectNowCoderConfirmation({
      statusEvidence: status,
      statusUrl,
      submitCandidates: [e1()],
      problemCandidates: [problem],
      now: NOW,
    })).toMatchObject({ kind: "no_match", reason });
  });

  it("rejects a submit outside the five-second window", () => {
    const expiredAt = new Date(
      Date.parse(status.receivedAt) - NOWCODER_CONFIRMATION_WINDOW_MS - 1,
    ).toISOString();
    expect(selectNowCoderConfirmation({
      statusEvidence: status,
      statusUrl: "https://ac.nowcoder.com/nccommon/status?submissionId=84257292",
      submitCandidates: [e1({ receivedAt: expiredAt })],
      problemCandidates: [problem],
      now: NOW,
    })).toMatchObject({ kind: "no_match", reason: "expired_submit" });
  });

  it("rejects crossed document and missing problem identity", () => {
    expect(selectNowCoderConfirmation({
      statusEvidence: status,
      statusUrl: "https://ac.nowcoder.com/nccommon/status?submissionId=84257292",
      submitCandidates: [e1({ documentId: "other-doc" })],
      problemCandidates: [],
      now: NOW,
    }).kind).toBe("no_match");
  });
});

describe("NowCoder E3 policy", () => {
  it("produces a matching final Wrong Answer verdict", () => {
    const evidence = NOWCODER_NETWORK_POLICY.verdictEvidence({
      kind: "verdict",
      pageUrl: "https://ac.nowcoder.com/acm/contest/view-submission?submissionId=84257292",
      problemExternalId: "acm/contest/18839/1001",
      verdictText: "\u7b54\u6848\u9519\u8bef",
      tabId: 8,
      frameId: 0,
      documentId: "doc-result-1",
      receivedAt: NOW,
    });
    expect(evidence).toMatchObject({
      tier: "E3",
      kind: "final_verdict_confirmed",
      externalSubmissionId: "84257292",
      problemExternalId: "acm/contest/18839/1001",
      verdict: "Wrong Answer",
    });
  });

  it.each([
    { pageUrl: "https://ac.nowcoder.com/acm/contest/view-submission?submissionId=other" },
    { pageUrl: "https://ac.nowcoder.com/acm/contest/view-submission?submissionId=1&submissionId=2" },
    { verdictText: "\u8bc4\u6d4b\u4e2d" },
    { problemExternalId: "other/problem" },
    { token: "forbidden" },
  ])("rejects unmatched, pending, or unsafe verdict input %#", (override) => {
    expect(NOWCODER_NETWORK_POLICY.verdictEvidence({
      kind: "verdict",
      pageUrl: "https://ac.nowcoder.com/acm/contest/view-submission?submissionId=84257292",
      problemExternalId: "acm/contest/18839/1001",
      verdictText: "\u7b54\u6848\u9519\u8bef",
      tabId: 8,
      frameId: 0,
      documentId: "doc-result-1",
      receivedAt: NOW,
      ...override,
    })).toBeNull();
  });
});
