import { describe, expect, it } from "vitest";
import {
  appendLeetCodeEndpointDiagnostic,
  createLeetCodeEndpointDiagnostic,
  createLeetCodeFinalVerdictEvidence,
  LEETCODE_CHECK_ENDPOINT_PREFIX,
  LEETCODE_CONFIRMATION_WINDOW_MS,
  LEETCODE_ENDPOINT_DIAGNOSTIC_LIMIT,
  LEETCODE_NETWORK_POLICY,
  LEETCODE_RESULT_ENDPOINT_PREFIX,
  LEETCODE_SUBMIT_ENDPOINT_PREFIX,
  normalizeLeetCodeNetworkEndpoint,
  readLeetCodeEndpointDiagnostics,
  selectLeetCodeConfirmation,
  selectLeetCodeResultConfirmation,
} from "@/extension/src/adapters/leetcode/network";
import type { E1RequestObserved } from "@/extension/src/evidence";
import { parseSafeEvidence } from "@/extension/src/evidence";

const NOW = "2026-07-30T08:40:11.300Z";
const DOCUMENT_ID = "8C588C1A68D0E6D2F798877E4292FB05";

function request(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    kind: "request",
    url: "https://leetcode.cn/problems/add-two-numbers/submit/",
    requestId: "840",
    method: "POST",
    resourceType: "xmlhttprequest",
    lifecycle: "completed",
    statusCode: 200,
    tabId: 7,
    frameId: 0,
    documentId: DOCUMENT_ID,
    receivedAt: "2026-07-30T08:40:11.020Z",
    apiTimeStamp: 1000.5,
    ...overrides,
  };
}

function submit(overrides: Partial<E1RequestObserved> = {}): E1RequestObserved {
  return {
    schemaVersion: 1,
    evidenceId: "e1_leetcode_840",
    platform: "leetcode",
    tier: "E1",
    kind: "request_observed",
    receivedAt: "2026-07-30T08:40:11.020Z",
    tabId: 7,
    frameId: 0,
    documentId: DOCUMENT_ID,
    adapterVersion: "v4-leetcode-network-6",
    requestId: "840",
    method: "POST",
    endpointKey: `${LEETCODE_SUBMIT_ENDPOINT_PREFIX}/cn/add-two-numbers`,
    resourceType: "xmlhttprequest",
    lifecycle: "completed",
    apiTimeStamp: 1000.5,
    statusCode: 200,
    ...overrides,
  };
}

function check(overrides: Partial<E1RequestObserved> = {}): E1RequestObserved {
  return {
    schemaVersion: 1,
    evidenceId: "e1_leetcode_841",
    platform: "leetcode",
    tier: "E1",
    kind: "request_observed",
    receivedAt: "2026-07-30T08:40:11.264Z",
    tabId: 7,
    frameId: 0,
    documentId: DOCUMENT_ID,
    adapterVersion: "v4-leetcode-network-6",
    requestId: "841",
    method: "GET",
    endpointKey: `${LEETCODE_CHECK_ENDPOINT_PREFIX}/cn/739040551`,
    resourceType: "xmlhttprequest",
    lifecycle: "completed",
    apiTimeStamp: 2000.25,
    statusCode: 200,
    ...overrides,
  };
}

function result(overrides: Partial<E1RequestObserved> = {}): E1RequestObserved {
  return {
    schemaVersion: 1,
    evidenceId: "e1_leetcode_842",
    platform: "leetcode",
    tier: "E1",
    kind: "request_observed",
    receivedAt: "2026-07-30T08:40:11.264Z",
    tabId: 7,
    frameId: 0,
    documentId: DOCUMENT_ID,
    adapterVersion: "v4-leetcode-network-6",
    requestId: "842",
    method: "GET",
    endpointKey: `${LEETCODE_RESULT_ENDPOINT_PREFIX}/cn/739040551`,
    resourceType: "xmlhttprequest",
    lifecycle: "completed",
    apiTimeStamp: 2000.5,
    statusCode: 200,
    ...overrides,
  };
}

function graphql(overrides: Partial<E1RequestObserved> = {}): E1RequestObserved {
  return {
    schemaVersion: 1,
    evidenceId: "e1_leetcode_graphql_841",
    platform: "leetcode",
    tier: "E1",
    kind: "request_observed",
    receivedAt: "2026-07-30T08:40:11.120Z",
    tabId: 7,
    frameId: 0,
    documentId: DOCUMENT_ID,
    adapterVersion: "v4-leetcode-network-6",
    requestId: "graphql-841",
    method: "POST",
    endpointKey: "graphql",
    resourceType: "xmlhttprequest",
    lifecycle: "completed",
    apiTimeStamp: 1500.25,
    statusCode: 200,
    ...overrides,
  };
}

function problemHint(overrides: Record<string, unknown> = {}) {
  return {
    platform: "leetcode" as const,
    problemExternalId: "add-two-numbers",
    observedAt: "2026-07-30T08:40:11.000Z",
    tabId: 7,
    frameId: 0,
    documentId: DOCUMENT_ID,
    ...overrides,
  };
}

describe("LeetCode characterized request policy", () => {
  it.each([
    [
      "https://leetcode.cn/problems/add-two-numbers/submit/",
      `${LEETCODE_SUBMIT_ENDPOINT_PREFIX}/cn/add-two-numbers`,
    ],
    [
      "https://leetcode.cn/submissions/detail/739040551/v2/check/",
      `${LEETCODE_CHECK_ENDPOINT_PREFIX}/cn/739040551`,
    ],
    [
      "https://leetcode.com/problems/two-sum/submit/",
      `${LEETCODE_SUBMIT_ENDPOINT_PREFIX}/com/two-sum`,
    ],
    [
      "https://leetcode.com/submissions/detail/42/check/",
      `${LEETCODE_CHECK_ENDPOINT_PREFIX}/com/42`,
    ],
    [
      "https://leetcode.cn/problems/roman-to-integer/submit/?envType=problem-list-v2&envId=top-interview-150",
      `${LEETCODE_SUBMIT_ENDPOINT_PREFIX}/cn/roman-to-integer`,
    ],
    [
      "https://leetcode.cn/submissions/detail/739065807/check/?envType=problem-list-v2",
      `${LEETCODE_CHECK_ENDPOINT_PREFIX}/cn/739065807`,
    ],
    [
      "https://leetcode.cn/problems/roman-to-integer/submit?envType=problem-list-v2",
      `${LEETCODE_SUBMIT_ENDPOINT_PREFIX}/cn/roman-to-integer`,
    ],
    [
      "https://leetcode.cn/submissions/detail/739065807/check?envType=problem-list-v2",
      `${LEETCODE_CHECK_ENDPOINT_PREFIX}/cn/739065807`,
    ],
    [
      "https://leetcode.cn/submissions/api/runtime_distribution/739065807/",
      `${LEETCODE_RESULT_ENDPOINT_PREFIX}/cn/739065807`,
    ],
    [
      "https://leetcode.com/submissions/api/memory_distribution/42?envType=problem-list-v2",
      `${LEETCODE_RESULT_ENDPOINT_PREFIX}/com/42`,
    ],
  ])("normalizes %s", (url, expected) => {
    expect(normalizeLeetCodeNetworkEndpoint(url)).toBe(expected);
  });

  it.each([
    "http://leetcode.cn/problems/add-two-numbers/submit/",
    "https://leetcode.cn.evil.example/problems/add-two-numbers/submit/",
    "https://leetcode.cn/submissions/detail/not-numeric/v2/check/",
    "https://leetcode.cn/submissions/detail/739040551/v3/check/",
    "https://leetcode.cn/graphql/",
  ])("rejects an uncharacterized URL %s", (url) => {
    expect(normalizeLeetCodeNetworkEndpoint(url)).toBeNull();
  });

  it("produces exact E1 for submit, check, and result-distribution requests", () => {
    expect(LEETCODE_NETWORK_POLICY.requestEvidence(request())).toMatchObject({
      platform: "leetcode",
      endpointKey: `${LEETCODE_SUBMIT_ENDPOINT_PREFIX}/cn/add-two-numbers`,
      method: "POST",
      lifecycle: "completed",
      statusCode: 200,
    });
    expect(LEETCODE_NETWORK_POLICY.requestEvidence(request({
      url: "https://leetcode.cn/submissions/detail/739040551/v2/check/?token=never-retained",
      method: "GET",
      requestId: "841",
    }))).toMatchObject({
      endpointKey: `${LEETCODE_CHECK_ENDPOINT_PREFIX}/cn/739040551`,
      method: "GET",
    });
    expect(LEETCODE_NETWORK_POLICY.requestEvidence(request({
      url: "https://leetcode.cn/submissions/api/runtime_distribution/739040551/?token=never-retained",
      method: "GET",
      requestId: "842",
    }))).toMatchObject({
      endpointKey: `${LEETCODE_RESULT_ENDPOINT_PREFIX}/cn/739040551`,
      method: "GET",
    });
    expect(JSON.stringify(LEETCODE_NETWORK_POLICY.requestEvidence(request({
      url: "https://leetcode.cn/problems/add-two-numbers/submit/?token=never-retained",
    })))).not.toContain("never-retained");
  });

  it.each([
    { method: "GET" },
    { resourceType: "main_frame" },
    { body: "forbidden" },
    { token: "forbidden" },
  ])("rejects wrong or unsafe submit input %#", (override) => {
    expect(LEETCODE_NETWORK_POLICY.requestEvidence(request(override))).toBeNull();
  });
});

describe("LeetCode unmatched endpoint diagnostics", () => {
  function diagnostic(overrides: Record<string, unknown> = {}) {
    return {
      rawUrl: "https://leetcode.cn/api/problems/roman-to-integer/submit-result?token=never-retained",
      method: "POST",
      resourceType: "xmlhttprequest",
      statusCode: 200,
      requestId: "516",
      tabId: 7,
      frameId: 0,
      documentId: DOCUMENT_ID,
      receivedAt: NOW,
      ...overrides,
    };
  }

  it("retains only the owned pathname for an unmatched submit-like request", () => {
    const result = createLeetCodeEndpointDiagnostic(diagnostic());
    expect(result).toMatchObject({
      reason: "unmatched_submit_path",
      method: "POST",
      pathname: "/api/problems/roman-to-integer/submit-result",
      statusCode: 200,
      requestId: "516",
    });
    expect(JSON.stringify(result)).not.toContain("never-retained");
  });

  it("records an unmatched check-like GET but not a characterized endpoint", () => {
    expect(createLeetCodeEndpointDiagnostic(diagnostic({
      rawUrl: "https://leetcode.cn/api/submissions/739065807/status?token=never-retained",
      method: "GET",
      requestId: "526",
    }))).toMatchObject({
      reason: "unmatched_check_path",
      pathname: "/api/submissions/739065807/status",
    });
    expect(createLeetCodeEndpointDiagnostic(diagnostic({
      rawUrl: "https://leetcode.cn/submissions/detail/739065807/check",
      method: "GET",
    }))).toBeNull();
  });

  it.each([
    { rawUrl: "https://leetcode.cn.evil.example/api/submit" },
    { rawUrl: "http://leetcode.cn/api/submit" },
    { rawUrl: "https://leetcode.cn/api//secret/submit" },
    { rawUrl: "https://leetcode.cn/graphql", method: "POST" },
    { resourceType: "main_frame" },
    { documentId: undefined },
    { statusCode: 99 },
    { receivedAt: "not-a-date" },
  ])("rejects an unsafe or unrelated diagnostic input %#", (override) => {
    expect(createLeetCodeEndpointDiagnostic(diagnostic(override))).toBeNull();
  });

  it("accepts bounded path punctuation used by owned API routes while dropping query", () => {
    const result = createLeetCodeEndpointDiagnostic(diagnostic({
      rawUrl:
        "https://leetcode.cn/api.v2/submissions/status-check%20result?token=never-retained",
      method: "GET",
    }));
    expect(result).toMatchObject({
      reason: "unmatched_check_path",
      pathname: "/api.v2/submissions/status-check%20result",
    });
    expect(JSON.stringify(result)).not.toContain("never-retained");
  });

  it("filters corrupt session values, deduplicates request IDs, and bounds to 20", () => {
    let records: readonly unknown[] = [{ token: "forbidden" }];
    for (let index = 0; index < LEETCODE_ENDPOINT_DIAGNOSTIC_LIMIT + 2; index += 1) {
      const next = createLeetCodeEndpointDiagnostic(diagnostic({
        requestId: String(index),
        receivedAt: `2026-07-30T08:40:${String(index).padStart(2, "0")}.300Z`,
      }));
      expect(next).not.toBeNull();
      if (next !== null) records = appendLeetCodeEndpointDiagnostic(records, next);
    }
    expect(records).toHaveLength(LEETCODE_ENDPOINT_DIAGNOSTIC_LIMIT);
    expect(records[0]).toMatchObject({ requestId: "2" });
    expect(readLeetCodeEndpointDiagnostics([
      ...records,
      {
        schemaVersion: 1,
        platform: "leetcode",
        adapterVersion: "stale",
        reason: "unmatched_submit_path",
        scope: "cn",
        method: "POST",
        pathname: "/api/submit",
        lifecycle: "completed",
        statusCode: 200,
        requestId: "stale",
        tabId: 7,
        frameId: 0,
        documentId: DOCUMENT_ID,
        receivedAt: NOW,
      },
    ])).toHaveLength(LEETCODE_ENDPOINT_DIAGNOSTIC_LIMIT);

    const replacement = createLeetCodeEndpointDiagnostic(diagnostic({
      requestId: "21",
      rawUrl: "https://leetcode.cn/api/retry/submit",
      receivedAt: "2026-07-30T08:40:22.300Z",
    }));
    expect(replacement).not.toBeNull();
    if (replacement !== null) {
      const deduplicated = appendLeetCodeEndpointDiagnostic(records, replacement);
      expect(deduplicated).toHaveLength(LEETCODE_ENDPOINT_DIAGNOSTIC_LIMIT);
      expect(deduplicated.at(-1)).toMatchObject({
        requestId: "21",
        pathname: "/api/retry/submit",
      });
    }
  });
});

describe("LeetCode E2 confirmation policy", () => {
  it("confirms the observed submit -> stable check path", () => {
    expect(selectLeetCodeConfirmation({
      checkEvidence: check(),
      submitCandidates: [submit()],
          })).toMatchObject({
      kind: "confirmed",
      matchedSubmitRequestId: "840",
      evidence: {
        kind: "submission_confirmed",
        externalSubmissionId: "cn/739040551",
        problemExternalId: "add-two-numbers",
        requestEvidenceId: "e1_leetcode_841",
      },
    });
  });

  it.each([
    ["missing_submit", []],
    [
      "multiple_submit_candidates",
      [submit(), submit({ requestId: "839", evidenceId: "e1_leetcode_839" })],
    ],
  ] as const)("fails closed for %s", (reason, candidates) => {
    expect(selectLeetCodeConfirmation({
      checkEvidence: check(),
      submitCandidates: candidates,
          })).toMatchObject({
      kind: reason === "missing_submit" ? "no_match" : "ambiguous",
      reason,
    });
  });

  it.each([
    ["crossed_host", check({ endpointKey: `${LEETCODE_CHECK_ENDPOINT_PREFIX}/com/739040551` }), submit()],
    ["crossed_document", check(), submit({ documentId: "other-document" })],
    ["failed_submit", check(), submit({ statusCode: 400 })],
    ["failed_check", check({ statusCode: 500 }), submit()],
  ] as const)("rejects %s", (_reason, checkEvidence, submitEvidence) => {
    expect(selectLeetCodeConfirmation({
      checkEvidence,
      submitCandidates: [submitEvidence],
          }).kind).toBe("no_match");
  });

  it("rejects a submit outside the five-second window", () => {
    const expiredAt = new Date(
      Date.parse(check().receivedAt) - LEETCODE_CONFIRMATION_WINDOW_MS - 1,
    ).toISOString();
    expect(selectLeetCodeConfirmation({
      checkEvidence: check(),
      submitCandidates: [submit({ receivedAt: expiredAt })],
          })).toMatchObject({ kind: "no_match", reason: "expired_submit" });
  });

  it("RED: preserves the check evidence time as E2 receivedAt (executor clock must not leak in)", () => {
    const result = selectLeetCodeConfirmation({
      checkEvidence: check({
        receivedAt: "2026-08-06T11:20:02.500Z",
        evidenceId: "e1_leetcode_841",
        requestId: "841",
      }),
      submitCandidates: [submit({
        receivedAt: "2026-08-06T11:20:00.000Z",
        evidenceId: "e1_leetcode_840",
        requestId: "840",
      })],
    });
    expect(result.kind).toBe("confirmed");
    if (result.kind === "confirmed") {
      expect(result.evidence.receivedAt).toBe("2026-08-06T11:20:02.500Z");
      expect(result.evidence.receivedAt).not.toBe("2026-08-06T11:20:03.065Z");
    }
  });
});

describe("LeetCode GraphQL result E2 confirmation policy", () => {
  it("confirms a recent trusted problem hint plus GraphQL and exact result path", () => {
    expect(selectLeetCodeResultConfirmation({
      resultEvidence: result(),
      graphqlCandidates: [graphql()],
      problemCandidates: [problemHint()],
          })).toMatchObject({
      kind: "confirmed",
      matchedSubmitRequestId: "graphql-841",
      evidence: {
        externalSubmissionId: "cn/739040551",
        problemExternalId: "add-two-numbers",
        requestEvidenceId: "e1_leetcode_842",
      },
    });
  });

  it("uses the latest qualifying GraphQL request without retaining its body", () => {
    const latest = graphql({
      evidenceId: "e1_leetcode_graphql_843",
      requestId: "graphql-843",
      receivedAt: "2026-07-30T08:40:11.200Z",
    });
    expect(selectLeetCodeResultConfirmation({
      resultEvidence: result(),
      graphqlCandidates: [latest, graphql()],
      problemCandidates: [problemHint()],
          })).toMatchObject({
      kind: "confirmed",
      matchedSubmitRequestId: "graphql-843",
    });
  });

  it.each([
    ["historical result without E0", [], [graphql()], "missing_problem_hint"],
    [
      "expired E0",
      [problemHint({ observedAt: new Date(
        Date.parse(result().receivedAt) - LEETCODE_CONFIRMATION_WINDOW_MS - 1,
      ).toISOString() })],
      [graphql()],
      "expired_problem_hint",
    ],
    ["missing GraphQL witness", [problemHint()], [], "missing_graphql"],
    [
      "cross-document GraphQL",
      [problemHint()],
      [graphql({ documentId: "other-document" })],
      "missing_graphql",
    ],
    [
      "GraphQL before the trusted click",
      [problemHint()],
      [graphql({ receivedAt: "2026-07-30T08:40:10.999Z" })],
      "missing_graphql",
    ],
  ] as const)("fails closed for %s", (_name, hints, graphqlCandidates, reason) => {
    expect(selectLeetCodeResultConfirmation({
      resultEvidence: result(),
      graphqlCandidates,
      problemCandidates: hints,
          })).toMatchObject({ kind: "no_match", reason });
  });

  it("rejects ambiguous trusted clicks and a failed result witness", () => {
    expect(selectLeetCodeResultConfirmation({
      resultEvidence: result(),
      graphqlCandidates: [graphql()],
      problemCandidates: [
        problemHint(),
        problemHint({ observedAt: "2026-07-30T08:40:11.001Z" }),
      ],
          })).toMatchObject({ kind: "ambiguous", reason: "multiple_problem_hints" });
    expect(selectLeetCodeResultConfirmation({
      resultEvidence: result({ statusCode: 500 }),
      graphqlCandidates: [graphql()],
      problemCandidates: [problemHint()],
          })).toMatchObject({ kind: "no_match", reason: "invalid_result_evidence" });
  });

  it("RED: preserves the result evidence time as E2 receivedAt (executor clock must not leak in)", () => {
    const confirmationResult = selectLeetCodeResultConfirmation({
      resultEvidence: result({
        receivedAt: "2026-08-06T11:20:02.500Z",
      }),
      graphqlCandidates: [graphql({
        receivedAt: "2026-08-06T11:20:02.200Z",
        requestId: "graphql-841",
      })],
      problemCandidates: [problemHint({
        observedAt: "2026-08-06T11:20:02.000Z",
      })],
    });
    expect(confirmationResult.kind).toBe("confirmed");
    if (confirmationResult.kind === "confirmed") {
      expect(confirmationResult.evidence.receivedAt).toBe("2026-08-06T11:20:02.500Z");
      expect(confirmationResult.evidence.receivedAt).not.toBe("2026-08-06T11:20:03.065Z");
    }
  });

  it("exposes the modern confirmation through the policy without accepting forbidden fields", () => {
    expect(LEETCODE_NETWORK_POLICY.submissionEvidence({
      kind: "result_confirmation",
      resultEvidence: result(),
      graphqlCandidates: [graphql()],
      problemCandidates: [problemHint()],
          })).toMatchObject({
      externalSubmissionId: "cn/739040551",
      problemExternalId: "add-two-numbers",
    });
    expect(LEETCODE_NETWORK_POLICY.submissionEvidence({
      kind: "result_confirmation",
      resultEvidence: result(),
      graphqlCandidates: [graphql()],
      problemCandidates: [problemHint()],
            body: "forbidden",
    })).toBeNull();
  });
});

describe("LeetCode E3 policy", () => {
  it("produces E3 only for one exact confirmed identity", () => {
    expect(LEETCODE_NETWORK_POLICY.verdictEvidence({
      kind: "verdict",
      pageUrl: "https://leetcode.cn/problems/add-two-numbers/submissions/739040551/",
      problemExternalId: "add-two-numbers",
      verdictText: "Accepted",
      confirmedSubmissionIds: ["cn/739040551"],
      tabId: 7,
      frameId: 0,
      documentId: DOCUMENT_ID,
      receivedAt: NOW,
    })).toMatchObject({
      kind: "final_verdict_confirmed",
      externalSubmissionId: "cn/739040551",
      problemExternalId: "add-two-numbers",
      verdict: "Accepted",
    });
  });

  it.each([
    { confirmedSubmissionIds: [] },
    { confirmedSubmissionIds: ["cn/1", "cn/2"] },
    { confirmedSubmissionIds: ["com/739040551"] },
    { pageUrl: "https://leetcode.com/problems/add-two-numbers/" },
    { problemExternalId: "two-sum" },
    { verdictText: "Judging" },
    { verdictText: "Other Failure" },
    { code: "forbidden" },
  ])("rejects ambiguous, crossed, pending, or unsafe verdict input %#", (override) => {
    expect(LEETCODE_NETWORK_POLICY.verdictEvidence({
      kind: "verdict",
      pageUrl: "https://leetcode.cn/problems/add-two-numbers/",
      problemExternalId: "add-two-numbers",
      verdictText: "Wrong Answer",
      confirmedSubmissionIds: ["cn/739040551"],
      tabId: 7,
      frameId: 0,
      documentId: DOCUMENT_ID,
      receivedAt: NOW,
      ...override,
    })).toBeNull();
  });
});

describe("createLeetCodeFinalVerdictEvidence", () => {
  const baseInput = {
    problemExternalId: "add-two-numbers",
    externalSubmissionId: "cn/739040551",
    verdictText: "Accepted",
    tabId: 7,
    frameId: 0,
    documentId: DOCUMENT_ID,
    receivedAt: NOW,
  };

  it("produces valid cn evidence with the shared identity convention", () => {
    const e3 = createLeetCodeFinalVerdictEvidence(baseInput);
    expect(e3).toMatchObject({
      schemaVersion: 1,
      evidenceId: "e3_leetcode_cn_739040551",
      platform: "leetcode",
      tier: "E3",
      kind: "final_verdict_confirmed",
      externalSubmissionId: "cn/739040551",
      problemExternalId: "add-two-numbers",
      verdict: "Accepted",
      receivedAt: NOW,
      tabId: 7,
      frameId: 0,
      documentId: DOCUMENT_ID,
    });
  });

  it("produces valid com evidence", () => {
    const e3 = createLeetCodeFinalVerdictEvidence({
      ...baseInput,
      externalSubmissionId: "com/739040551",
    });
    expect(e3).not.toBeNull();
    expect(e3?.evidenceId).toBe("e3_leetcode_com_739040551");
    expect(e3?.externalSubmissionId).toBe("com/739040551");
  });

  it.each([
    { externalSubmissionId: "us/739040551" },
    { externalSubmissionId: "leetcode.cn/739040551" },
  ])("rejects invalid scope %#", (override) => {
    expect(createLeetCodeFinalVerdictEvidence({ ...baseInput, ...override })).toBeNull();
  });

  it.each([
    { externalSubmissionId: "cn/abc" },
    { externalSubmissionId: "cn/" },
    { externalSubmissionId: "cn/739040551/2" },
    { externalSubmissionId: "cn/123456789012345678901" },
    { problemExternalId: "AddTwoNumbers" },
    { problemExternalId: "" },
  ])("rejects malformed identity %#", (override) => {
    expect(createLeetCodeFinalVerdictEvidence({ ...baseInput, ...override })).toBeNull();
  });

  it.each([
    { verdictText: "Judging" },
    { verdictText: "Other Failure" },
    { verdictText: "Waiting" },
    { verdictText: "" },
  ])("rejects pending or non-final verdict %#", (override) => {
    expect(createLeetCodeFinalVerdictEvidence({ ...baseInput, ...override })).toBeNull();
  });

  it.each([
    { receivedAt: "2026-07-30T08:40:11.3Z" },
    { receivedAt: "2026-13-30T08:40:11.300Z" },
    { receivedAt: "not a time" },
    { receivedAt: "" },
  ])("rejects malformed time %#", (override) => {
    expect(createLeetCodeFinalVerdictEvidence({ ...baseInput, ...override })).toBeNull();
  });

  it.each([
    { problemExternalId: "two-sum\u0000" },
    { externalSubmissionId: "cn/739040551\u0001" },
    { documentId: "doc\u0000id" },
    { receivedAt: `${NOW}\n` },
  ])("rejects control-character identity %#", (override) => {
    expect(createLeetCodeFinalVerdictEvidence({ ...baseInput, ...override })).toBeNull();
  });

  it("output remains parseable as Safe Evidence", () => {
    const e3 = createLeetCodeFinalVerdictEvidence(baseInput);
    expect(e3).not.toBeNull();
    const parsed = parseSafeEvidence(e3 as object);
    expect(parsed.ok).toBe(true);
    if (parsed.ok) expect(parsed.value.kind).toBe("final_verdict_confirmed");
  });
});
