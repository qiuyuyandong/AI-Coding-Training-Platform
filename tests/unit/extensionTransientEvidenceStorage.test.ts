import { describe, expect, it } from "vitest";
import {
  AMBIGUITY_TTL_MS,
  E1_LIFECYCLE_TTL_MS,
  PAGE_CONTEXT_TTL_MS,
  planTransientSessionEvidenceWrite,
  pruneTransientSessionEvidence,
  readTransientSessionEvidenceState,
  UNMATCHED_E3_TTL_MS,
  VERDICT_CANDIDATE_MAX_COUNT,
  VERDICT_CANDIDATE_TTL_MS,
  verdictCandidateIdentity,
  type TransientSessionEvidenceState,
} from "@/extension/src/transientEvidenceStorage";

const e1 = {
  schemaVersion: 1,
  evidenceId: "e1",
  platform: "atcoder",
  tier: "E1",
  kind: "request_observed",
  receivedAt: "2026-07-24T00:00:00.000Z",
  tabId: 1,
  frameId: 0,
  documentId: "doc",
  adapterVersion: "v1",
  apiTimeStamp: 1,
  requestId: "req",
  method: "POST",
  endpointKey: "submit",
  resourceType: "xmlhttprequest",
  lifecycle: "completed",
} as const;
const state: TransientSessionEvidenceState = Object.freeze({
  uiHints: Object.freeze([]),
  requestLifecycles: Object.freeze([
    Object.freeze({
      schemaVersion: 1,
      tier: "E1",
      kind: "request_lifecycle",
      evidence: e1,
      outcome: "pending",
      stableSubmissionId: null,
      rejectionReason: null,
      receivedAt: e1.receivedAt,
    }),
  ]),
  pageContexts: Object.freeze([
    Object.freeze({
      schemaVersion: 1,
      tier: "E0",
      kind: "page_context",
      platform: "atcoder",
      tabId: 1,
      frameId: 0,
      documentId: "doc",
      receivedAt: e1.receivedAt,
    }),
  ]),
  unmatchedE3: Object.freeze([]),
  verdictCandidates: Object.freeze([]),
  ambiguityDiagnostics: Object.freeze([]),
});

const candidate = Object.freeze({
  schemaVersion: 1 as const,
  tier: "E3" as const,
  kind: "verdict_candidate" as const,
  candidateId: "candidate_two-sum_740553045",
  platform: "leetcode" as const,
  problemExternalId: "two-sum",
  verdict: "Accepted",
  observedAt: "2026-07-24T00:00:01.000Z",
  tabId: 7,
  frameId: 0,
  documentId: "doc",
  transitionEvidence: "exact_result_document" as const,
  receivedAt: "2026-07-24T00:00:01.000Z",
});

describe("transient evidence storage", () => {
  it("round-trips all session slices and freezes the write plan", () => {
    const plan = planTransientSessionEvidenceWrite(state);
    expect(plan.items).toMatchObject({ transientE1: state.requestLifecycles, transientPageContexts: state.pageContexts });
    expect(Object.isFrozen(plan.items)).toBe(true);
    expect(Object.isFrozen(plan.items.transientE1)).toBe(true);
    expect(readTransientSessionEvidenceState(plan.items)).toEqual(state);
  });
  it("prunes each TTL and page contexts without a surviving E1", () => {
    const old = "2026-07-23T00:00:00.000Z";
    const oldState = Object.freeze({
      ...state,
      requestLifecycles: Object.freeze([]),
      pageContexts: Object.freeze([
        Object.freeze({ ...state.pageContexts[0], receivedAt: old }),
      ]),
      unmatchedE3: Object.freeze([]),
    });
    expect(pruneTransientSessionEvidence(oldState, "2026-07-24T00:00:00.000Z").pageContexts).toEqual([]);
    expect(pruneTransientSessionEvidence(state, "2026-07-24T00:04:00.000Z").requestLifecycles).toHaveLength(1);
    expect(pruneTransientSessionEvidence(state, "2026-07-24T00:06:00.000Z").requestLifecycles).toEqual([]);
  });
  it("drops malformed records and surfaces bounded diagnostics", () => {
    const parsed = readTransientSessionEvidenceState({
      transientE1: [{ schemaVersion: 99 }, { ...e1, tier: "E0" }],
      transientAmbiguityDiagnostics: [{ schemaVersion: 99 }],
    });
    expect(parsed.requestLifecycles).toEqual([]);
    expect(parsed.ambiguityDiagnostics.length).toBeLessThanOrEqual(3);
    // Each dropped record produces a closed-reason diagnostic
    expect(parsed.ambiguityDiagnostics.some((d) => d.reason === "schema_version_mismatch")).toBe(true);
    expect(parsed.ambiguityDiagnostics.some((d) => d.reason === "unknown_kind")).toBe(true);
    // No free-text detail; reason is a closed enum
    expect(parsed.ambiguityDiagnostics.every((d) => !("detail" in d))).toBe(true);
    expect(parsed.ambiguityDiagnostics.every((d) => typeof d.reason === "string")).toBe(true);
  });
});

describe("transient evidence TTL pruning", () => {
  it("prunes E1 lifecycles at 5 minutes", () => {
    expect(E1_LIFECYCLE_TTL_MS).toBe(5 * 60_000);
    expect(pruneTransientSessionEvidence(state, "2026-07-24T00:05:00.000Z").requestLifecycles).toEqual([]);
  });
  it("prunes page contexts at 30 minutes", () => {
    expect(PAGE_CONTEXT_TTL_MS).toBe(30 * 60_000);
    const stale = Object.freeze({ ...state, requestLifecycles: Object.freeze([]) });
    expect(pruneTransientSessionEvidence(stale, "2026-07-24T00:30:01.000Z").pageContexts).toEqual([]);
  });
  it("prunes unmatched E3 at 60 seconds", () => {
    expect(UNMATCHED_E3_TTL_MS).toBe(60_000);
    const e3Evidence = {
      schemaVersion: 1 as const, evidenceId: "e3", platform: "atcoder" as const,
      tier: "E3" as const, kind: "final_verdict_confirmed" as const,
      receivedAt: "2026-07-24T00:00:00.000Z",
      tabId: 1, frameId: 0, documentId: "doc", adapterVersion: "v1",
      externalSubmissionId: "42", problemExternalId: "abc_a", verdict: "Accepted" as const,
    };
    const withE3 = Object.freeze({
      ...state,
      unmatchedE3: Object.freeze([
        Object.freeze({
          schemaVersion: 1 as const,
          tier: "E3" as const,
          kind: "unmatched_final" as const,
          evidence: e3Evidence,
          receivedAt: "2026-07-24T00:00:00.000Z",
        }),
      ]),
    });
    expect(pruneTransientSessionEvidence(withE3, "2026-07-24T00:01:01.000Z").unmatchedE3).toEqual([]);
  });
  it("prunes ambiguity diagnostics at 24 hours", () => {
    expect(AMBIGUITY_TTL_MS).toBe(24 * 60 * 60_000);
    const old = Object.freeze({
      ...state,
      ambiguityDiagnostics: Object.freeze([
        Object.freeze({
          schemaVersion: 1, tier: "E1", kind: "ambiguity_diagnostic",
          reason: "multiple_e1_candidates" as const,
          receivedAt: "2026-07-23T00:00:00.000Z",
        }),
      ]),
    });
    expect(pruneTransientSessionEvidence(old, "2026-07-24T00:00:01.000Z").ambiguityDiagnostics).toEqual([]);
  });
});

describe("transient parseSafeEvidence strictness", () => {
  it("rejects E1 lifecycles carrying raw body / token / requestHeaders", () => {
    const polluted = Object.freeze({
      schemaVersion: 1, tier: "E1", kind: "request_lifecycle",
      evidence: { ...e1, body: "secret", token: "t0k", requestHeaders: { a: "1" } },
      outcome: "pending", stableSubmissionId: null, rejectionReason: null,
      receivedAt: e1.receivedAt,
    });
    const parsed = readTransientSessionEvidenceState({ transientE1: [polluted] });
    expect(parsed.requestLifecycles).toEqual([]);
    expect(parsed.ambiguityDiagnostics.some((d) => d.reason === "corrupt_record")).toBe(true);
  });
  it("rejects unmatched E3 carrying forbidden keys", () => {
    const pollutedE3 = Object.freeze({
      schemaVersion: 1 as const, tier: "E3" as const, kind: "unmatched_final" as const,
      evidence: {
        schemaVersion: 1 as const, evidenceId: "e3", platform: "atcoder" as const,
        tier: "E3" as const, kind: "final_verdict_confirmed" as const,
        receivedAt: "2026-07-24T00:00:00.000Z",
        tabId: 1, frameId: 0, documentId: "doc", adapterVersion: "v1",
        externalSubmissionId: "42", problemExternalId: "abc_a", verdict: "Accepted" as const,
        authorization: "Bearer secret",
      },
      receivedAt: "2026-07-24T00:00:00.000Z",
    });
    const parsed = readTransientSessionEvidenceState({ transientUnmatchedE3: [pollutedE3] });
    expect(parsed.unmatchedE3).toEqual([]);
  });
});

describe("transient ambiguity diagnostic round-trip", () => {
  it("preserves stored diagnostics across read/write cycles", () => {
    const now = "2026-07-24T00:00:00.000Z";
    const seed: TransientSessionEvidenceState = Object.freeze({
      ...state,
      ambiguityDiagnostics: Object.freeze([
        Object.freeze({
          schemaVersion: 1, tier: "E1", kind: "ambiguity_diagnostic",
          reason: "multiple_e1_candidates" as const,
          receivedAt: now,
        }),
        Object.freeze({
          schemaVersion: 1, tier: "E1", kind: "ambiguity_diagnostic",
          reason: "e1_window_expired" as const,
          receivedAt: now,
        }),
      ]),
    });
    const plan = planTransientSessionEvidenceWrite(seed);
    const rehydrated = readTransientSessionEvidenceState(plan.items);
    expect(rehydrated.ambiguityDiagnostics.length).toBe(2);
    expect(rehydrated.ambiguityDiagnostics[0]?.reason).toBe("multiple_e1_candidates");
    expect(rehydrated.ambiguityDiagnostics[1]?.reason).toBe("e1_window_expired");
  });
});

describe("transient verdict candidate storage", () => {
  it("round-trips a valid candidate through the write plan", () => {
    const withCandidate: TransientSessionEvidenceState = Object.freeze({
      ...state,
      verdictCandidates: Object.freeze([candidate]),
    });
    const plan = planTransientSessionEvidenceWrite(withCandidate);
    expect(plan.items.transientVerdictCandidates).toEqual([candidate]);
    const rehydrated = readTransientSessionEvidenceState(plan.items);
    expect(rehydrated.verdictCandidates).toEqual([candidate]);
  });

  it("rejects an unknown field on the candidate", () => {
    const parsed = readTransientSessionEvidenceState({
      transientVerdictCandidates: [Object.freeze({ ...candidate, url: "https://leetcode.cn" })],
    });
    expect(parsed.verdictCandidates).toEqual([]);
    expect(parsed.ambiguityDiagnostics.some((d) => d.reason === "unknown_field")).toBe(true);
  });

  it("rejects a malformed timestamp", () => {
    const parsed = readTransientSessionEvidenceState({
      transientVerdictCandidates: [
        Object.freeze({ ...candidate, observedAt: "not-a-date" }),
        Object.freeze({ ...candidate, receivedAt: "2026-99-99T00:00:00.000Z" }),
      ],
    });
    expect(parsed.verdictCandidates).toEqual([]);
    expect(parsed.ambiguityDiagnostics.some((d) => d.reason === "malformed_timestamp")).toBe(true);
  });

  it("rejects control characters in identity strings", () => {
    const parsed = readTransientSessionEvidenceState({
      transientVerdictCandidates: [
        Object.freeze({ ...candidate, problemExternalId: "two\u001fsum" }),
      ],
    });
    expect(parsed.verdictCandidates).toEqual([]);
    expect(parsed.ambiguityDiagnostics.some((d) => d.reason === "control_character_in_identity")).toBe(true);
  });

  it("rejects forbidden raw fields", () => {
    const parsed = readTransientSessionEvidenceState({
      transientVerdictCandidates: [
        Object.freeze({ ...candidate, code: "class Solution {}" }),
        Object.freeze({ ...candidate, token: "secret" }),
        Object.freeze({ ...candidate, pageUrl: "https://leetcode.cn" }),
      ],
    });
    expect(parsed.verdictCandidates).toEqual([]);
  });

  it("expires candidates at the E1 lifecycle TTL boundary deterministically", () => {
    expect(VERDICT_CANDIDATE_TTL_MS).toBe(E1_LIFECYCLE_TTL_MS);
    const withCandidate: TransientSessionEvidenceState = Object.freeze({
      ...state,
      verdictCandidates: Object.freeze([candidate]),
    });
    expect(pruneTransientSessionEvidence(withCandidate, "2026-07-24T00:04:59.999Z").verdictCandidates).toHaveLength(1);
    expect(pruneTransientSessionEvidence(withCandidate, "2026-07-24T00:05:00.999Z").verdictCandidates).toHaveLength(1);
    expect(pruneTransientSessionEvidence(withCandidate, "2026-07-24T00:05:01.000Z").verdictCandidates).toEqual([]);
    expect(pruneTransientSessionEvidence(withCandidate, "2026-07-23T00:00:00.000Z").verdictCandidates).toEqual([]);
  });

  it("caps the retained candidate count at 32", () => {
    expect(VERDICT_CANDIDATE_MAX_COUNT).toBe(32);
    const many = Object.freeze(Array.from({ length: 40 }, (_, i) => Object.freeze({
      ...candidate,
      candidateId: `candidate_${i}`,
      observedAt: new Date(Date.parse(candidate.observedAt) + i * 1000).toISOString(),
      receivedAt: new Date(Date.parse(candidate.receivedAt) + i * 1000).toISOString(),
    })));
    const withMany: TransientSessionEvidenceState = Object.freeze({ ...state, verdictCandidates: many });
    const pruned = pruneTransientSessionEvidence(withMany, "2026-07-24T00:05:00.000Z");
    expect(pruned.verdictCandidates).toHaveLength(32);
    expect(pruned.verdictCandidates[31]?.candidateId).toBe("candidate_39");
  });

  it("reads legacy storage without the key as an empty candidate array", () => {
    const parsed = readTransientSessionEvidenceState({});
    expect(parsed.verdictCandidates).toEqual([]);
  });

  it("computes a deterministic candidate identity", () => {
    expect(verdictCandidateIdentity(candidate)).toBe(
      "leetcode\u001f7\u001f0\u001fdoc\u001ftwo-sum\u001f2026-07-24T00:00:01.000Z",
    );
    expect(verdictCandidateIdentity(candidate)).toBe(
      verdictCandidateIdentity({
        platform: candidate.platform,
        tabId: candidate.tabId,
        frameId: candidate.frameId,
        documentId: candidate.documentId,
        problemExternalId: candidate.problemExternalId,
        observedAt: "2026-07-24T00:00:01.000Z",
      }),
    );
  });
});