import { describe, expect, it } from "vitest";
import {
  reconcileVerdictCandidates,
  selectLeetCodeConfirmedEpochReplays,
  type VerdictCandidateResolution,
} from "@/extension/src/verdictCandidateCoordinator";
import type {
  TransientE1Lifecycle,
  TransientVerdictCandidate,
} from "@/extension/src/transientEvidenceStorage";
import type { ConfirmedSubmissionRecord } from "@/extension/src/confirmedSubmissionStorage";

const SUBMIT_ENDPOINT = "leetcode/submit/cn/two-sum";
const DOCUMENT_ID = "docA";
const NOW = "2026-08-06T11:22:00.000Z";

const lifecycle = (overrides: Partial<TransientE1Lifecycle> = {}): TransientE1Lifecycle => ({
  schemaVersion: 1,
  tier: "E1",
  kind: "request_lifecycle",
  evidence: {
    schemaVersion: 1,
    evidenceId: "e1_leetcode_840",
    platform: "leetcode",
    tier: "E1",
    kind: "request_observed",
    receivedAt: "2026-08-06T11:20:01.000Z",
    tabId: 7,
    frameId: 0,
    documentId: DOCUMENT_ID,
    adapterVersion: "v4-leetcode-network-6",
    apiTimeStamp: 1000.5,
    requestId: "840",
    method: "POST",
    endpointKey: SUBMIT_ENDPOINT,
    resourceType: "xmlhttprequest",
    lifecycle: "completed",
    statusCode: 200,
  },
  outcome: "matched",
  stableSubmissionId: "leetcode:cn:920",
  rejectionReason: null,
  receivedAt: "2026-08-06T11:20:01.500Z",
  ...overrides,
});

const candidate = (overrides: Partial<TransientVerdictCandidate> = {}): TransientVerdictCandidate => ({
  schemaVersion: 1,
  tier: "E3",
  kind: "verdict_candidate",
  candidateId: "cand_1",
  platform: "leetcode",
  problemExternalId: "two-sum",
  verdict: "Accepted",
  observedAt: "2026-08-06T11:21:00.000Z",
  tabId: 7,
  frameId: 0,
  documentId: DOCUMENT_ID,
  transitionEvidence: "same_document_transition",
  receivedAt: "2026-08-06T11:20:30.000Z",
  ...overrides,
});

const confirmedRecord = (overrides: Partial<ConfirmedSubmissionRecord> = {}): ConfirmedSubmissionRecord => ({
  schemaVersion: 1,
  status: "confirmed",
  platform: "leetcode",
  problemExternalId: "two-sum",
  externalSubmissionId: "cn/920",
  confirmedAt: "2026-08-06T11:20:02.000Z",
  storageKey: "leetcode:cn:920",
  lastE3At: "2026-08-06T11:20:00.000Z",
  ...overrides,
});

describe("verdictCandidateCoordinator", () => {
  it("restart replay selects only an exact matched lifecycle for an unfinalized E2", () => {
    const result = selectLeetCodeConfirmedEpochReplays({
      requestLifecycles: [lifecycle()],
      confirmed: [confirmedRecord()],
      now: NOW,
    });
    expect(result).toEqual([{
      platform: "leetcode",
      problemExternalId: "two-sum",
      submitRequestId: "840",
      confirmedAt: "2026-08-06T11:20:02.000Z",
      tabId: 7,
      frameId: 0,
      documentId: DOCUMENT_ID,
    }]);
  });

  it("restart replay fails closed when the exact E1 document identity is malformed", () => {
    const result = selectLeetCodeConfirmedEpochReplays({
      requestLifecycles: [lifecycle({ evidence: { ...lifecycle().evidence, documentId: "" } })],
      confirmed: [confirmedRecord()],
      now: NOW,
    });
    expect(result).toEqual([]);
  });

  it("restart replay does not synthesize a request when the E1 lifecycle is absent", () => {
    const result = selectLeetCodeConfirmedEpochReplays({
      requestLifecycles: [],
      confirmed: [confirmedRecord()],
      now: NOW,
    });
    expect(result).toEqual([]);
  });

  it("restart replay omits a confirmed record finalized by candidate E3 recovery", () => {
    const result = selectLeetCodeConfirmedEpochReplays({
      requestLifecycles: [lifecycle()],
      confirmed: [confirmedRecord({ finalizedAt: "2026-08-06T11:22:00.000Z" })],
      now: NOW,
    });
    expect(result).toEqual([]);
  });
  it("new armed candidate binds only the exact submit request id", () => {
    const armed = Object.assign(candidate(), { submitRequestId: "840" });
    const unrelatedNewer = lifecycle({
      evidence: {
        ...lifecycle().evidence,
        evidenceId: "e1_leetcode_841",
        requestId: "841",
        receivedAt: "2026-08-06T11:20:30.000Z",
        apiTimeStamp: 1030,
      },
      receivedAt: "2026-08-06T11:20:30.000Z",
      stableSubmissionId: "leetcode:cn/921",
    });
    const result = reconcileVerdictCandidates({
      candidates: [armed],
      requestLifecycles: [unrelatedNewer, lifecycle()],
      confirmed: [confirmedRecord()],
      now: NOW,
    });
    expect(result.resolutions).toHaveLength(1);
    expect(result.resolutions[0]?.externalSubmissionId).toBe("cn/920");
    expect(result.terminal).toEqual([]);
  });

  it("armed duplicate request ids with conflicting timestamps fail closed", () => {
    const conflicting = lifecycle({
      evidence: {
        ...lifecycle().evidence,
        receivedAt: "2026-08-06T11:20:01.100Z",
        apiTimeStamp: 1001.5,
      },
    });
    const result = reconcileVerdictCandidates({
      candidates: [Object.assign(candidate(), { submitRequestId: "840" })],
      requestLifecycles: [lifecycle(), conflicting],
      confirmed: [confirmedRecord()],
      now: NOW,
    });
    expect(result.resolutions).toEqual([]);
    expect(result.pending).toEqual([]);
    expect(result.terminal[0]?.reason).toBe("identity_mismatch");
  });

  it("armed candidate does not fall back to a latest lifecycle when its request id is absent", () => {
    const armed = Object.assign(candidate(), { submitRequestId: "missing-request" });
    const result = reconcileVerdictCandidates({
      candidates: [armed],
      requestLifecycles: [lifecycle()],
      confirmed: [confirmedRecord()],
      now: NOW,
    });
    expect(result.resolutions).toEqual([]);
    expect(result.terminal).toEqual([]);
    expect(result.pending).toHaveLength(1);
  });

  it("historical legacy candidate terminalizes when a later lifecycle is visible", () => {
    const later = lifecycle({
      evidence: {
        ...lifecycle().evidence,
        evidenceId: "e1_leetcode_841",
        requestId: "841",
        receivedAt: "2026-08-06T11:20:30.000Z",
        apiTimeStamp: 1030,
      },
      receivedAt: "2026-08-06T11:20:30.000Z",
      stableSubmissionId: "leetcode:cn/921",
    });
    const armed = Object.assign(candidate({ candidateId: "armed" }), { submitRequestId: "840" });
    const result = reconcileVerdictCandidates({
      candidates: [candidate({ candidateId: "legacy", observedAt: "2026-08-06T11:20:20.000Z", receivedAt: "2026-08-06T11:20:20.000Z" }), armed],
      requestLifecycles: [lifecycle(), later],
      confirmed: [confirmedRecord()],
      now: NOW,
    });
    const legacyTerminal = result.terminal.find((entry) => entry.candidateId === "legacy");
    expect(legacyTerminal?.reason).toBe("chronology_mismatch");
    expect(result.resolutions.map((entry) => entry.candidateId)).toEqual(["armed"]);
  });
  it("latest pending submit prevents stale older confirmed record from resolving", () => {
    const stale = lifecycle({ receivedAt: "2026-08-06T11:20:01.500Z" });
    const newerPending = lifecycle({
      receivedAt: "2026-08-06T11:20:20.000Z",
      outcome: "pending",
      stableSubmissionId: null,
    });
    const result = reconcileVerdictCandidates({
      candidates: [candidate()],
      requestLifecycles: [newerPending, stale],
      confirmed: [confirmedRecord()],
      now: NOW,
    });
    expect(result.resolutions).toHaveLength(0);
    expect(result.terminal).toHaveLength(0);
    expect(result.pending).toHaveLength(1);
  });

  it("exact latest matched submit resolves", () => {
    const result = reconcileVerdictCandidates({
      candidates: [candidate()],
      requestLifecycles: [lifecycle()],
      confirmed: [confirmedRecord()],
      now: NOW,
    });
    expect(result.pending).toHaveLength(0);
    expect(result.terminal).toHaveLength(0);
    expect(result.resolutions).toHaveLength(1);
    const resolution = result.resolutions[0] as VerdictCandidateResolution;
    expect(resolution.candidateId).toBe("cand_1");
    expect(resolution.externalSubmissionId).toBe("cn/920");
    expect(resolution.verdict).toBe("Accepted");
    expect(resolution.platform).toBe("leetcode");
    expect(resolution.problemExternalId).toBe("two-sum");
  });

  it("unrelated tab/frame/document/problem does not resolve", () => {
    const result = reconcileVerdictCandidates({
      candidates: [candidate({ problemExternalId: "reverse-integer" })],
      requestLifecycles: [lifecycle()],
      confirmed: [confirmedRecord()],
      now: NOW,
    });
    expect(result.resolutions).toHaveLength(0);
    expect(result.pending).toHaveLength(1);
  });

  it("two latest equal candidates fail closed", () => {
    const first = lifecycle();
    const second = lifecycle({
      receivedAt: "2026-08-06T11:20:01.500Z",
      outcome: "matched",
      stableSubmissionId: "leetcode:cn:920",
      evidence: {
        ...lifecycle().evidence,
        evidenceId: "e1_leetcode_839",
        requestId: "839",
        receivedAt: "2026-08-06T11:20:01.000Z",
        apiTimeStamp: 1000.5,
      },
    });
    const result = reconcileVerdictCandidates({
      candidates: [candidate()],
      requestLifecycles: [first, second],
      confirmed: [confirmedRecord()],
      now: NOW,
    });
    expect(result.resolutions).toHaveLength(0);
    expect(result.pending).toHaveLength(0);
    expect(result.terminal).toHaveLength(1);
    expect(result.terminal[0]?.reason).toBe("ambiguous_latest_submit");
  });

  it("candidate earlier than confirmed evidence fails chronology", () => {
    const result = reconcileVerdictCandidates({
      candidates: [candidate({ observedAt: "2026-08-06T11:20:01.000Z" })],
      requestLifecycles: [lifecycle()],
      confirmed: [confirmedRecord()],
      now: NOW,
    });
    expect(result.resolutions).toHaveLength(0);
    expect(result.terminal).toHaveLength(1);
    expect(result.terminal[0]?.reason).toBe("chronology_mismatch");
  });

  it("candidate survives zero-match reconciliation", () => {
    const result = reconcileVerdictCandidates({
      candidates: [candidate()],
      requestLifecycles: [],
      confirmed: [confirmedRecord()],
      now: NOW,
    });
    expect(result.resolutions).toHaveLength(0);
    expect(result.terminal).toHaveLength(0);
    expect(result.pending).toHaveLength(1);
  });

  it("expiry produces terminal result", () => {
    const result = reconcileVerdictCandidates({
      candidates: [
        candidate({ receivedAt: "2026-08-06T11:15:00.000Z" }),
      ],
      requestLifecycles: [lifecycle()],
      confirmed: [confirmedRecord()],
      now: NOW,
    });
    expect(result.resolutions).toHaveLength(0);
    expect(result.terminal).toHaveLength(1);
    expect(result.terminal[0]?.reason).toBe("expired");
  });

  it("identity mismatch produces terminal result", () => {
    const result = reconcileVerdictCandidates({
      candidates: [candidate({ problemExternalId: "reverse-integer" })],
      requestLifecycles: [
        lifecycle({
          evidence: {
            ...lifecycle().evidence,
            endpointKey: "leetcode/submit/cn/reverse-integer",
          },
        }),
      ],
      confirmed: [confirmedRecord()],
      now: NOW,
    });
    expect(result.resolutions).toHaveLength(0);
    expect(result.terminal).toHaveLength(1);
    expect(result.terminal[0]?.reason).toBe("identity_mismatch");
  });

  it("graphql submit lifecycle resolves (v2 result-distribution flow)", () => {
    const graphqlSubmit = lifecycle({
      evidence: {
        ...lifecycle().evidence,
        evidenceId: "e1_leetcode_graphql",
        requestId: "graphql-1",
        receivedAt: "2026-08-06T11:20:01.000Z",
        apiTimeStamp: 1001,
        endpointKey: "graphql",
      },
      stableSubmissionId: "leetcode:cn:920",
    });
    const result = reconcileVerdictCandidates({
      candidates: [candidate()],
      requestLifecycles: [graphqlSubmit],
      confirmed: [confirmedRecord()],
      now: NOW,
    });
    expect(result.pending).toHaveLength(0);
    expect(result.terminal).toHaveLength(0);
    expect(result.resolutions).toHaveLength(1);
    const resolution = result.resolutions[0] as VerdictCandidateResolution;
    expect(resolution.candidateId).toBe("cand_1");
    expect(resolution.externalSubmissionId).toBe("cn/920");
  });

  it("graphql submit lifecycle stays pending until matched", () => {
    const graphqlSubmit = lifecycle({
      evidence: {
        ...lifecycle().evidence,
        evidenceId: "e1_leetcode_graphql",
        requestId: "graphql-1",
        receivedAt: "2026-08-06T11:20:01.000Z",
        apiTimeStamp: 1001,
        endpointKey: "graphql",
      },
      outcome: "pending",
      stableSubmissionId: null,
    });
    const result = reconcileVerdictCandidates({
      candidates: [candidate()],
      requestLifecycles: [graphqlSubmit],
      confirmed: [confirmedRecord()],
      now: NOW,
    });
    expect(result.resolutions).toHaveLength(0);
    expect(result.terminal).toHaveLength(0);
    expect(result.pending).toHaveLength(1);
  });

  it("unrelated newer graphql POST never shadows the matched submit", () => {
    const matchedSubmit = lifecycle({
      receivedAt: "2026-08-06T11:20:10.000Z",
      evidence: {
        ...lifecycle().evidence,
        evidenceId: "e1_leetcode_graphql_submit",
        requestId: "graphql-submit",
        receivedAt: "2026-08-06T11:20:10.000Z",
        apiTimeStamp: 1100,
        endpointKey: "graphql",
      },
    });
    const unrelatedGraphql = lifecycle({
      receivedAt: "2026-08-06T11:20:15.000Z",
      outcome: "pending",
      stableSubmissionId: null,
      evidence: {
        ...lifecycle().evidence,
        evidenceId: "e1_leetcode_graphql_other",
        requestId: "graphql-other",
        receivedAt: "2026-08-06T11:20:15.000Z",
        apiTimeStamp: 1150,
        endpointKey: "graphql",
      },
    });
    const result = reconcileVerdictCandidates({
      candidates: [candidate()],
      requestLifecycles: [unrelatedGraphql, matchedSubmit],
      confirmed: [confirmedRecord()],
      now: NOW,
    });
    expect(result.pending).toHaveLength(0);
    expect(result.terminal).toHaveLength(0);
    expect(result.resolutions).toHaveLength(1);
    const resolution = result.resolutions[0] as VerdictCandidateResolution;
    expect(resolution.candidateId).toBe("cand_1");
    expect(resolution.externalSubmissionId).toBe("cn/920");
  });

  it("two independent tabs resolve independently", () => {
    const result = reconcileVerdictCandidates({
      candidates: [
        candidate({ candidateId: "cand_a", tabId: 7 }),
        candidate({
          candidateId: "cand_b",
          tabId: 8,
          documentId: "docB",
          receivedAt: "2026-08-06T11:20:40.000Z",
        }),
      ],
      requestLifecycles: [
        lifecycle(),
        lifecycle({
          receivedAt: "2026-08-06T11:20:41.000Z",
          evidence: {
            ...lifecycle().evidence,
            evidenceId: "e1_leetcode_841",
            requestId: "841",
            receivedAt: "2026-08-06T11:20:40.000Z",
            apiTimeStamp: 1001,
            tabId: 8,
            documentId: "docB",
          },
          stableSubmissionId: "leetcode:cn:921",
        }),
      ],
      confirmed: [
        confirmedRecord(),
        confirmedRecord({
          storageKey: "leetcode:cn:921",
          externalSubmissionId: "cn/921",
        }),
      ],
      now: NOW,
    });
    expect(result.resolutions).toHaveLength(2);
    expect(result.pending).toHaveLength(0);
  });

  it("result ordering is deterministic", () => {
    const inputs = {
      candidates: [
        candidate({ candidateId: "cand_2" }),
        candidate({ candidateId: "cand_1" }),
      ],
      requestLifecycles: [lifecycle()],
      confirmed: [confirmedRecord()],
      now: NOW,
    };
    const first = reconcileVerdictCandidates(inputs);
    const second = reconcileVerdictCandidates(inputs);
    expect(first.resolutions.map((r) => r.candidateId)).toEqual(
      second.resolutions.map((r) => r.candidateId),
    );
    expect(first.resolutions.map((r) => r.candidateId)).toEqual(["cand_2", "cand_1"]);
  });
});
