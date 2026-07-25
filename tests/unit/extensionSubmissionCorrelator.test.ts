/**
 * Phase A Task A3 — strict Evidence Correlator unit tests.
 *
 * These tests pin the contract for `extension/src/submissionCorrelator.ts`.
 * The correlator is a pure module: it does not touch chrome.* APIs, the DOM,
 * a real clock, or I/O. Every test exercises a transformation from
 * (state, input) to (state, result). All E1 inputs pass through the same
 * `parseSafeEvidence` boundary the production pipeline uses, so a forbidden
 * raw field lands the test in an `invalid_input` branch — never in a
 * correlated branch.
 */
import { describe, expect, it } from "vitest";

import {
  CORRELATOR_AMBIGUITY_REASONS,
  CORRELATOR_NO_MATCH_REASONS,
  CORRELATOR_OUTCOMES,
  CORRELATOR_REJECTION_REASONS,
  DEFAULT_CORRELATION_POLICY,
  createCorrelatorState,
  evidenceCorrelator,
  markE1Outcome,
  mergeE1Lifecycle,
  recordStableIdentity,
  correlateMainSummary,
  parseMainBridgeSummary,
  selectStableSubmissionIdentity,
  type CorrelatorOutcome,
  type CorrelatorRejectionReason,
  type CorrelatorState,
  type MainBridgeSummary,
} from "@/extension/src/submissionCorrelator";
import type { E1RequestObserved } from "@/extension/src/evidence";
import { parseSafeEvidence } from "@/extension/src/evidence";

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

const BASE_EVIDENCE = {
  schemaVersion: 1 as const,
  evidenceId: "ev_e1_base",
  platform: "leetcode" as const,
  receivedAt: "2026-07-24T12:00:00.000Z",
  tabId: 11,
  frameId: 0,
  documentId: "doc_test_001",
  adapterVersion: "v4-contract-1",
};

function e1Draft(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    ...BASE_EVIDENCE,
    tier: "E1",
    kind: "request_observed",
    requestId: "req_e1_001",
    method: "POST",
    endpointKey: "problems/two-sum/submit",
    resourceType: "xmlhttprequest",
    lifecycle: "before_request",
    apiTimeStamp: 1_753_363_200_000,
    ...overrides,
  };
}

function parseE1(value: Record<string, unknown>): E1RequestObserved {
  // The parser is the source of truth: any Safe Evidence input must already
  // satisfy the schema. If a test fixture fails to parse, it is a fixture
  // bug, not a correlator bug.
  const result = parseSafeEvidence(value);
  if (!result.ok || result.value.kind !== "request_observed") {
    throw new Error(`E1 fixture failed to parse: ${result.ok ? "wrong kind" : result.reason}`);
  }
  // SafeEvidence is a discriminated union by `kind`; only E1RequestObserved
  // carries `kind === "request_observed"`, so TS already narrowed the value.
  return result.value;
}

function baseSummary(overrides: Partial<MainBridgeSummary> = {}): MainBridgeSummary {
  return {
    platform: "leetcode",
    tabId: 11,
    frameId: 0,
    documentId: "doc_test_001",
    method: "POST",
    endpointKey: "problems/two-sum/submit",
    apiTimeStamp: 1_753_363_201_000,
    receivedAt: "2026-07-24T12:00:01.000Z",
    evidenceId: "ev_summary_001",
    ...overrides,
  };
}

// stateFrom reserved for tests that want to construct a multi-record state
// directly. The current test fixtures all build from createCorrelatorState
// + mergeE1Lifecycle.

// ---------------------------------------------------------------------------
// Closed enum exhaustiveness
// ---------------------------------------------------------------------------

describe("closed enum exhaustiveness (Phase A Task A3)", () => {
  it("CORRELATOR_AMBIGUITY_REASONS contains exactly three closed values", () => {
    expect(CORRELATOR_AMBIGUITY_REASONS).toEqual([
      "multiple_e1_candidates",
      "e1_window_expired",
      "bridge_message_unmatched",
    ]);
    expect(new Set(CORRELATOR_AMBIGUITY_REASONS).size).toBe(CORRELATOR_AMBIGUITY_REASONS.length);
  });

  it("CORRELATOR_NO_MATCH_REASONS contains exactly six closed values", () => {
    expect(CORRELATOR_NO_MATCH_REASONS).toEqual([
      "zero_candidates",
      "expired",
      "canceled",
      "error",
      "already_matched",
      "crossed_fields",
    ]);
    expect(new Set(CORRELATOR_NO_MATCH_REASONS).size).toBe(CORRELATOR_NO_MATCH_REASONS.length);
    expect(new Set(CORRELATOR_NO_MATCH_REASONS).size).toBe(6);
  });

  it("CORRELATOR_REJECTION_REASONS contains exactly ten closed values", () => {
    expect(CORRELATOR_REJECTION_REASONS).toHaveLength(10);
    const expected: readonly CorrelatorRejectionReason[] = [
      "csrf_invalid",
      "csrf_expired",
      "auth_required",
      "auth_expired",
      "rate_limited",
      "business_rejection",
      "network_error",
      "timeout",
      "server_error",
      "malformed_response",
    ];
    expect(CORRELATOR_REJECTION_REASONS).toEqual(expected);
    expect(new Set(CORRELATOR_REJECTION_REASONS).size).toBe(CORRELATOR_REJECTION_REASONS.length);
  });

  it("CORRELATOR_OUTCOMES contains exactly five closed values", () => {
    expect(CORRELATOR_OUTCOMES).toEqual(["matched", "rejected", "expired", "canceled", "error"]);
    expect(new Set(CORRELATOR_OUTCOMES).size).toBe(CORRELATOR_OUTCOMES.length);
  });

  it("DEFAULT_CORRELATION_POLICY is frozen and matches the spec default 5000 ms window", () => {
    expect(Object.isFrozen(DEFAULT_CORRELATION_POLICY)).toBe(true);
    expect(DEFAULT_CORRELATION_POLICY.timeWindowMs).toBe(5000);
  });
});

// ---------------------------------------------------------------------------
// Pure-module boundary: no chrome / clock / DOM / side effects
// ---------------------------------------------------------------------------

describe("strict pure-module boundary (Phase A Task A3)", () => {
  it("createCorrelatorState returns a frozen state with empty records", () => {
    const state = createCorrelatorState();
    expect(state.records.size).toBe(0);
    expect(Object.isFrozen(state)).toBe(true);
  });

  it("evidenceCorrelator namespace is frozen and exposes the same function references", () => {
    expect(Object.isFrozen(evidenceCorrelator)).toBe(true);
    expect(evidenceCorrelator.mergeE1Lifecycle).toBe(mergeE1Lifecycle);
    expect(evidenceCorrelator.markE1Outcome).toBe(markE1Outcome);
    expect(evidenceCorrelator.correlateMainSummary).toBe(correlateMainSummary);
    expect(evidenceCorrelator.selectStableSubmissionIdentity).toBe(selectStableSubmissionIdentity);
    expect(evidenceCorrelator.recordStableIdentity).toBe(recordStableIdentity);
    expect(evidenceCorrelator.createCorrelatorState).toBe(createCorrelatorState);
  });
});

// ---------------------------------------------------------------------------
// mergeE1Lifecycle — dedupe, ordering, identity invariant
// ---------------------------------------------------------------------------

describe("mergeE1Lifecycle — same requestId lifecycle (Phase A Task A3 acceptance bullet 1)", () => {
  it("keyed by requestId: one record survives across response/redirect/completion/error signals", () => {
    const state0 = createCorrelatorState();
    const lifecycleSteps: ReadonlyArray<{
      readonly kind: E1RequestObserved["lifecycle"];
      readonly apiTimeStamp: number;
      readonly receivedAt: string;
      readonly statusCode?: number;
    }> = [
      { kind: "before_request", apiTimeStamp: 1_753_363_200_000, receivedAt: "2026-07-24T12:00:00.000Z" },
      { kind: "response_started", apiTimeStamp: 1_753_363_200_500, receivedAt: "2026-07-24T12:00:00.500Z", statusCode: 200 },
      { kind: "before_redirect", apiTimeStamp: 1_753_363_200_700, receivedAt: "2026-07-24T12:00:00.700Z", statusCode: 302 },
      { kind: "completed", apiTimeStamp: 1_753_363_201_000, receivedAt: "2026-07-24T12:00:01.000Z", statusCode: 200 },
    ];

    let state: CorrelatorState = state0;
    for (const step of lifecycleSteps) {
      const draft: Record<string, unknown> = e1Draft({
        apiTimeStamp: step.apiTimeStamp,
        receivedAt: step.receivedAt,
        lifecycle: step.kind,
        ...(step.statusCode !== undefined ? { statusCode: step.statusCode } : {}),
      });
      const result = mergeE1Lifecycle(state, parseE1(draft));
      if (result.kind !== "merged") {
        throw new Error(`merge failed at ${step.kind}: ${result.kind}`);
      }
      state = result.state;
      expect(state.records.size).toBe(1);
    }

    const record = state.records.get("req_e1_001");
    expect(record).toBeDefined();
    if (record === undefined) throw new Error("record missing");
    expect(record.outcome).toBe("pending");
    expect(record.evidence.apiTimeStamp).toBe(1_753_363_201_000);
    expect(record.evidence.receivedAt).toBe("2026-07-24T12:00:00.000Z");
    expect(record.evidence.lifecycle).toBe("completed");
    expect(record.evidence.statusCode).toBe(200);
  });

  it("most recent apiTimeStamp wins, even when the later event carries a smaller payload", () => {
    const base = parseE1(e1Draft({ apiTimeStamp: 1_753_363_200_000 }));
    const first = mergeE1Lifecycle(createCorrelatorState(), base);
    if (first.kind !== "merged") throw new Error("first merge failed");
    const later = parseE1(e1Draft({ apiTimeStamp: 1_753_363_205_000, statusCode: 204 }));
    const second = mergeE1Lifecycle(first.state, later);
    if (second.kind !== "merged") throw new Error("second merge failed");
    const record = second.state.records.get("req_e1_001");
    expect(record).toBeDefined();
    if (record === undefined) throw new Error("record missing");
    expect(record.evidence.apiTimeStamp).toBe(1_753_363_205_000);
    expect(record.evidence.statusCode).toBe(204);
  });

  it("earliest receivedAt is preserved even when later events arrive", () => {
    const base = parseE1(e1Draft({ apiTimeStamp: 1_753_363_200_000, receivedAt: "2026-07-24T12:00:00.000Z" }));
    const first = mergeE1Lifecycle(createCorrelatorState(), base);
    if (first.kind !== "merged") throw new Error("first merge failed");
    const later = parseE1(e1Draft({ apiTimeStamp: 1_753_363_201_000, receivedAt: "2026-07-24T12:00:01.000Z" }));
    const second = mergeE1Lifecycle(first.state, later);
    if (second.kind !== "merged") throw new Error("second merge failed");
    const record = second.state.records.get("req_e1_001");
    if (record === undefined) throw new Error("record missing");
    expect(record.evidence.receivedAt).toBe("2026-07-24T12:00:00.000Z");
  });

  it("statusCode carries the latest event with statusCode and is undefined when none provide it", () => {
    const base = parseE1(e1Draft({ apiTimeStamp: 1_753_363_200_000 }));
    const first = mergeE1Lifecycle(createCorrelatorState(), base);
    if (first.kind !== "merged") throw new Error("first merge failed");
    const record1 = first.state.records.get("req_e1_001");
    if (record1 === undefined) throw new Error("record missing");
    expect(record1.evidence.statusCode).toBeUndefined();
    const later = parseE1(e1Draft({ apiTimeStamp: 1_753_363_201_000, statusCode: 200 }));
    const second = mergeE1Lifecycle(first.state, later);
    if (second.kind !== "merged") throw new Error("second merge failed");
    const record2 = second.state.records.get("req_e1_001");
    if (record2 === undefined) throw new Error("record missing");
    expect(record2.evidence.statusCode).toBe(200);
  });
});

// ---------------------------------------------------------------------------
// mergeE1Lifecycle — identity mismatch rejection
// ---------------------------------------------------------------------------

describe("mergeE1Lifecycle — identity mismatch (Phase A Task A3 acceptance bullet 5)", () => {
  it("returns identity_mismatch when tabId differs by one and leaves the record untouched", () => {
    const base = parseE1(e1Draft({ tabId: 11, apiTimeStamp: 1_753_363_200_000 }));
    const first = mergeE1Lifecycle(createCorrelatorState(), base);
    if (first.kind !== "merged") throw new Error("first merge failed");
    const beforeState = first.state;

    const conflicting = parseE1(e1Draft({ tabId: 12, apiTimeStamp: 1_753_363_201_000 }));
    const second = mergeE1Lifecycle(beforeState, conflicting);

    expect(second.kind).toBe("identity_mismatch");
    if (second.kind !== "identity_mismatch") throw new Error("not identity_mismatch");
    expect(second.error.requestId).toBe("req_e1_001");
    expect(second.error.expected.tabId).toBe(11);
    expect(second.error.observed.tabId).toBe(12);
    expect(second.error.expected.platform).toBe("leetcode");
    expect(second.error.observed.platform).toBe("leetcode");
    // State must be untouched — same record references, no record replacement.
    expect(beforeState.records.get("req_e1_001")?.evidence.tabId).toBe(11);
  });

  it("rejects tabId, frameId, documentId, method, endpointKey, and platform mismatches individually", () => {
    const base = parseE1(e1Draft({
      tabId: 11, frameId: 0, documentId: "doc_a", method: "POST", endpointKey: "submit", platform: "leetcode",
    }));
    const first = mergeE1Lifecycle(createCorrelatorState(), base);
    if (first.kind !== "merged") throw new Error("first merge failed");

    const cases: ReadonlyArray<readonly [string, Record<string, unknown>]> = [
      ["tabId differs", { tabId: 99 }],
      ["frameId differs", { frameId: 99 }],
      ["documentId differs", { documentId: "doc_zzz" }],
      ["method differs", { method: "GET" }],
      ["endpointKey differs", { endpointKey: "submit/alt" }],
      ["platform differs", { platform: "atcoder" }],
    ];

    for (const [label, override] of cases) {
      const conflicting = parseE1(e1Draft({ apiTimeStamp: 1_753_363_202_000, ...override }));
      const result = mergeE1Lifecycle(first.state, conflicting);
      expect(result.kind, label).toBe("identity_mismatch");
      if (result.kind !== "identity_mismatch") throw new Error(`expected mismatch for ${label}`);
    }
  });
});

// ---------------------------------------------------------------------------
// markE1Outcome — terminal outcomes block correlation
// ---------------------------------------------------------------------------

describe("markE1Outcome — terminal outcomes (Phase A Task A3 acceptance bullet 6)", () => {
  it("flips a record to 'matched' and prevents further correlation", () => {
    const base = parseE1(e1Draft({ apiTimeStamp: 1_753_363_200_000 }));
    const first = mergeE1Lifecycle(createCorrelatorState(), base);
    if (first.kind !== "merged") throw new Error("first merge failed");
    const matched = markE1Outcome(first.state, "req_e1_001", "matched");
    expect(matched.records.get("req_e1_001")?.outcome).toBe("matched");

    const result = correlateMainSummary(matched, baseSummary(), DEFAULT_CORRELATION_POLICY);
    expect(result.kind).toBe("no_match");
    if (result.kind === "no_match") {
      expect(result.reason).toBe("already_matched");
    }
  });

  it.each(CORRELATOR_OUTCOMES.filter((o) => o !== "rejected"))(
    "flips a record to '%s' (without rejection reason)",
    (outcome: Exclude<CorrelatorOutcome, "rejected">) => {
      const base = parseE1(e1Draft({ apiTimeStamp: 1_753_363_200_000 }));
      const first = mergeE1Lifecycle(createCorrelatorState(), base);
      if (first.kind !== "merged") throw new Error("first merge failed");
      const next = markE1Outcome(first.state, "req_e1_001", outcome);
      expect(next.records.get("req_e1_001")?.outcome).toBe(outcome);
      expect(next.records.get("req_e1_001")?.rejectionReason).toBeNull();
    },
  );

  it("flips a record to 'rejected' and stores the supplied rejectionReason", () => {
    const base = parseE1(e1Draft({ apiTimeStamp: 1_753_363_200_000 }));
    const first = mergeE1Lifecycle(createCorrelatorState(), base);
    if (first.kind !== "merged") throw new Error("first merge failed");
    const next = markE1Outcome(first.state, "req_e1_001", "rejected", "auth_required");
    expect(next.records.get("req_e1_001")?.outcome).toBe("rejected");
    expect(next.records.get("req_e1_001")?.rejectionReason).toBe("auth_required");
  });

  it("markE1Outcome with 'rejected' but no rejectionReason throws at runtime", () => {
    const base = parseE1(e1Draft({ apiTimeStamp: 1_753_363_200_000 }));
    const first = mergeE1Lifecycle(createCorrelatorState(), base);
    if (first.kind !== "merged") throw new Error("first merge failed");
    expect(() => {
      // Force-call the runtime signature with a missing rejection reason.
      (markE1Outcome as unknown as (
        s: CorrelatorState,
        id: string,
        o: "rejected",
        r?: undefined,
      ) => CorrelatorState)(first.state, "req_e1_001", "rejected", undefined);
    }).toThrow(/rejectionReason/);
  });

  it("re-marking an already-marked record is a no-op", () => {
    const base = parseE1(e1Draft({ apiTimeStamp: 1_753_363_200_000 }));
    const first = mergeE1Lifecycle(createCorrelatorState(), base);
    if (first.kind !== "merged") throw new Error("first merge failed");
    const matched = markE1Outcome(first.state, "req_e1_001", "matched");
    const stillMatched = markE1Outcome(matched, "req_e1_001", "rejected", "malformed_response");
    expect(stillMatched.records.get("req_e1_001")?.outcome).toBe("matched");
  });

  it("ignores markE1Outcome for unknown requestIds", () => {
    const base = parseE1(e1Draft({ apiTimeStamp: 1_753_363_200_000 }));
    const first = mergeE1Lifecycle(createCorrelatorState(), base);
    if (first.kind !== "merged") throw new Error("first merge failed");
    const state = markE1Outcome(first.state, "req_unknown", "matched");
    expect(state.records.size).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// correlateMainSummary — exact match
// ---------------------------------------------------------------------------

describe("correlateMainSummary — exact one-E1 correlation (Phase A Task A3 acceptance bullet 2)", () => {
  it("returns correlated when exactly one E1 candidate matches the summary", () => {
    const e1A = parseE1(e1Draft({ requestId: "req_A", apiTimeStamp: 1_753_363_200_000 }));
    const first = mergeE1Lifecycle(createCorrelatorState(), e1A);
    if (first.kind !== "merged") throw new Error("first merge failed");
    const result = correlateMainSummary(first.state, baseSummary(), DEFAULT_CORRELATION_POLICY);
    expect(result.kind).toBe("correlated");
    if (result.kind === "correlated") {
      expect(result.matchedE1.requestId).toBe("req_A");
      expect(result.disambiguatedBy).toBe("unique");
    }
  });

  it("accepts a number for nowOrPolicy and treats it as the policy's timeWindowMs", () => {
    const e1A = parseE1(e1Draft({ requestId: "req_A", apiTimeStamp: 1_753_363_200_000 }));
    const first = mergeE1Lifecycle(createCorrelatorState(), e1A);
    if (first.kind !== "merged") throw new Error("first merge failed");
    const result = correlateMainSummary(first.state, baseSummary(), 10_000);
    expect(result.kind).toBe("correlated");
  });
});

// ---------------------------------------------------------------------------
// correlateMainSummary — zero candidates
// ---------------------------------------------------------------------------

describe("correlateMainSummary — zero candidates (Phase A Task A3 acceptance bullet 3)", () => {
  it("returns no_match with zero_candidates when the state holds no E1 records", () => {
    const result = correlateMainSummary(createCorrelatorState(), baseSummary(), DEFAULT_CORRELATION_POLICY);
    expect(result.kind).toBe("no_match");
    if (result.kind === "no_match") {
      expect(result.reason).toBe("zero_candidates");
    }
  });

  it("returns no_match with zero_candidates when only unrelated records exist", () => {
    const unrelated = parseE1(e1Draft({
      requestId: "req_unrelated",
      endpointKey: "problems/two-sum/result",
      apiTimeStamp: 1_753_363_200_000,
    }));
    const first = mergeE1Lifecycle(createCorrelatorState(), unrelated);
    if (first.kind !== "merged") throw new Error("first merge failed");
    const result = correlateMainSummary(first.state, baseSummary(), DEFAULT_CORRELATION_POLICY);
    expect(result.kind).toBe("no_match");
    if (result.kind === "no_match") {
      expect(result.reason).toBe("zero_candidates");
    }
  });
});

// ---------------------------------------------------------------------------
// correlateMainSummary — ambiguity and disambiguation
// ---------------------------------------------------------------------------

describe("correlateMainSummary — ambiguity + redirect disambiguation (Phase A Task A3 acceptance bullet 4, 7, 8)", () => {
  it("two pending candidates yield AMBIGUOUS with multiple_e1_candidates reason", () => {
    const e1A = parseE1(e1Draft({ requestId: "req_A", apiTimeStamp: 1_753_363_200_000 }));
    const e1B = parseE1(e1Draft({ requestId: "req_B", apiTimeStamp: 1_753_363_200_500 }));
    let state: CorrelatorState = createCorrelatorState();
    for (const e1 of [e1A, e1B]) {
      const result = mergeE1Lifecycle(state, e1);
      if (result.kind !== "merged") throw new Error("merge failed");
      state = result.state;
    }

    const result = correlateMainSummary(state, baseSummary(), DEFAULT_CORRELATION_POLICY);
    expect(result.kind).toBe("ambiguous");
    if (result.kind === "ambiguous") {
      expect(result.reason).toBe("multiple_e1_candidates");
      expect(result.candidateCount).toBe(2);
      const ids = result.candidates.map((c) => c.requestId).slice().sort();
      expect(ids).toEqual(["req_A", "req_B"]);
    }
  });

  it("two concurrent submissions stay AMBIGUOUS until redirect disambiguates one", () => {
    const e1A = parseE1(e1Draft({
      requestId: "req_A",
      apiTimeStamp: 1_753_363_200_000,
    }));
    const e1B = parseE1(e1Draft({
      requestId: "req_B",
      apiTimeStamp: 1_753_363_200_500,
    }));
    let state: CorrelatorState = createCorrelatorState();
    for (const e1 of [e1A, e1B]) {
      const result = mergeE1Lifecycle(state, e1);
      if (result.kind !== "merged") throw new Error("merge failed");
      state = result.state;
    }

    // Without redirect info: AMBIGUOUS.
    const ambiguous = correlateMainSummary(state, baseSummary(), DEFAULT_CORRELATION_POLICY);
    expect(ambiguous.kind).toBe("ambiguous");
    if (ambiguous.kind !== "ambiguous") throw new Error("expected ambiguous");

    // Add a redirect to candidate A only via later lifecycle signal.
    const redirectedA = parseE1(e1Draft({
      requestId: "req_A",
      apiTimeStamp: 1_753_363_201_000,
      lifecycle: "before_redirect",
      redirectEndpointKey: "problems/two-sum/result_page",
    }));
    const updated = mergeE1Lifecycle(state, redirectedA);
    if (updated.kind !== "merged") throw new Error("merge failed");

    const correlated = correlateMainSummary(
      updated.state,
      baseSummary({
        evidenceId: "ev_summary_redirect",
        redirectEndpointKey: "problems/two-sum/result_page",
        receivedAt: "2026-07-24T12:00:01.500Z",
      }),
      DEFAULT_CORRELATION_POLICY,
    );
    expect(correlated.kind).toBe("correlated");
    if (correlated.kind === "correlated") {
      expect(correlated.matchedE1.requestId).toBe("req_A");
      expect(correlated.disambiguatedBy).toBe("redirect_endpoint_key");
    }
  });

  it("redirectEndpointKey + externalSubmissionId on only one candidate resolves AMBIGUOUS", () => {
    // Both A and B carry the same redirect endpoint key; only B has a
    // recorded stable submission id matching the summary. The correlator
    // first filters by redirectEndpointKey (2 candidates), then falls
    // back to the externalSubmissionId signal to disambiguate to B.
    const e1A = parseE1(e1Draft({
      requestId: "req_A",
      apiTimeStamp: 1_753_363_200_000,
      redirectEndpointKey: "problems/two-sum/result_page",
    }));
    const e1B = parseE1(e1Draft({
      requestId: "req_B",
      apiTimeStamp: 1_753_363_200_500,
      redirectEndpointKey: "problems/two-sum/result_page",
    }));
    let state: CorrelatorState = createCorrelatorState();
    for (const e1 of [e1A, e1B]) {
      const result = mergeE1Lifecycle(state, e1);
      if (result.kind !== "merged") throw new Error("merge failed");
      state = result.state;
    }

    // Mark B with a known stable submission id (simulating a prior E2).
    const stableB = recordStableIdentity(state, "req_B", "leetcode:LC_sub_999");
    if (stableB.records.get("req_B") === undefined) throw new Error("stableB missing");

    const result = correlateMainSummary(
      stableB,
      baseSummary({
        evidenceId: "ev_summary_external",
        redirectEndpointKey: "problems/two-sum/result_page",
        externalSubmissionId: "LC_sub_999",
        receivedAt: "2026-07-24T12:00:01.500Z",
      }),
      DEFAULT_CORRELATION_POLICY,
    );
    expect(result.kind).toBe("correlated");
    if (result.kind === "correlated") {
      expect(result.matchedE1.requestId).toBe("req_B");
      expect(result.disambiguatedBy).toBe("external_submission_id");
    }
  });
});

// ---------------------------------------------------------------------------
// correlateMainSummary — cross-tab / cross-frame / cross-document / cross-method / cross-endpoint rejection
// ---------------------------------------------------------------------------

describe("correlateMainSummary — cross-tab/frame/document/method/endpoint rejection (Phase A Task A3 acceptance bullet 5)", () => {
  it.each([
    ["tabId", { tabId: 22 }],
    ["frameId", { frameId: 7 }],
    ["documentId", { documentId: "doc_other_001" }],
    ["method", { method: "GET" }],
    ["endpointKey", { endpointKey: "problems/two-sum/result" }],
    ["platform", { platform: "atcoder" as const }],
  ])("never correlates across %s mismatches", (_name, override) => {
    const e1A = parseE1(e1Draft({ apiTimeStamp: 1_753_363_200_000 }));
    const first = mergeE1Lifecycle(createCorrelatorState(), e1A);
    if (first.kind !== "merged") throw new Error("merge failed");

    const result = correlateMainSummary(first.state, baseSummary(override), DEFAULT_CORRELATION_POLICY);
    expect(result.kind).toBe("no_match");
    if (result.kind === "no_match") {
      expect(result.reason).toBe("zero_candidates");
    }
  });
});

// ---------------------------------------------------------------------------
// correlateMainSummary — expired candidate policy
// ---------------------------------------------------------------------------

describe("correlateMainSummary — expired candidate rejected (Phase A Task A3 acceptance bullet 6)", () => {
  it("returns expired when only an expired E1 is present", () => {
    const tooEarly = parseE1(e1Draft({
      apiTimeStamp: 1_753_363_200_000,
    }));
    const first = mergeE1Lifecycle(createCorrelatorState(), tooEarly);
    if (first.kind !== "merged") throw new Error("merge failed");
    const expired = markE1Outcome(first.state, "req_e1_001", "expired");

    const result = correlateMainSummary(expired, baseSummary(), DEFAULT_CORRELATION_POLICY);
    expect(result.kind).toBe("no_match");
    if (result.kind === "no_match") {
      expect(result.reason).toBe("expired");
    }
  });

  it("returns canceled when only a canceled E1 is present", () => {
    const base = parseE1(e1Draft({ apiTimeStamp: 1_753_363_200_000 }));
    const first = mergeE1Lifecycle(createCorrelatorState(), base);
    if (first.kind !== "merged") throw new Error("merge failed");
    const canceled = markE1Outcome(first.state, "req_e1_001", "canceled");

    const result = correlateMainSummary(canceled, baseSummary(), DEFAULT_CORRELATION_POLICY);
    expect(result.kind).toBe("no_match");
    if (result.kind === "no_match") {
      expect(result.reason).toBe("canceled");
    }
  });

  it("pure out-of-window set with zero in-window candidates returns no_match zero_candidates", () => {
    const outside1 = parseE1(e1Draft({
      requestId: "req_o1",
      apiTimeStamp: 1_753_363_100_000,
      receivedAt: "2026-07-24T11:00:00.000Z",
    }));
    const outside2 = parseE1(e1Draft({
      requestId: "req_o2",
      apiTimeStamp: 1_753_363_100_500,
      receivedAt: "2026-07-24T11:00:00.500Z",
    }));
    let state: CorrelatorState = createCorrelatorState();
    for (const ev of [outside1, outside2]) {
      const result = mergeE1Lifecycle(state, ev);
      if (result.kind !== "merged") throw new Error("merge failed");
      state = result.state;
    }
    const result = correlateMainSummary(state, baseSummary(), DEFAULT_CORRELATION_POLICY);
    expect(result.kind).toBe("no_match");
    if (result.kind === "no_match") {
      expect(result.reason).toBe("zero_candidates");
    }
  });

  it("one in-window + one out-of-window candidate returns ambiguous e1_window_expired", () => {
    const inside = parseE1(e1Draft({
      requestId: "req_inside",
      apiTimeStamp: 1_753_363_201_000,
    }));
    const outside = parseE1(e1Draft({
      requestId: "req_outside",
      apiTimeStamp: 1_753_363_100_000,
      receivedAt: "2026-07-24T11:00:00.000Z",
    }));
    let state: CorrelatorState = createCorrelatorState();
    for (const ev of [inside, outside]) {
      const result = mergeE1Lifecycle(state, ev);
      if (result.kind !== "merged") throw new Error("merge failed");
      state = result.state;
    }
    const result = correlateMainSummary(state, baseSummary(), DEFAULT_CORRELATION_POLICY);
    expect(result.kind).toBe("ambiguous");
    if (result.kind === "ambiguous") {
      expect(result.reason).toBe("e1_window_expired");
      expect(result.candidateCount).toBe(1);
      expect(result.candidates[0]?.requestId).toBe("req_inside");
    }
  });

  it("two in-window + one out-of-window still returns e1_window_expired", () => {
    const insideA = parseE1(e1Draft({ requestId: "req_A", apiTimeStamp: 1_753_363_200_000 }));
    const insideB = parseE1(e1Draft({ requestId: "req_B", apiTimeStamp: 1_753_363_200_500 }));
    const outside = parseE1(e1Draft({
      requestId: "req_C",
      apiTimeStamp: 1_753_363_100_000,
      receivedAt: "2026-07-24T11:00:00.000Z",
    }));
    let state: CorrelatorState = createCorrelatorState();
    for (const ev of [insideA, insideB, outside]) {
      const result = mergeE1Lifecycle(state, ev);
      if (result.kind !== "merged") throw new Error("merge failed");
      state = result.state;
    }
    const result = correlateMainSummary(state, baseSummary(), DEFAULT_CORRELATION_POLICY);
    expect(result.kind).toBe("ambiguous");
    if (result.kind === "ambiguous") {
      expect(result.reason).toBe("e1_window_expired");
      expect(result.candidateCount).toBe(2);
    }
  });

  it("no_match error when only an errored E1 is present", () => {
    const e1 = parseE1(e1Draft({ apiTimeStamp: 1_753_363_200_000 }));
    const first = mergeE1Lifecycle(createCorrelatorState(), e1);
    if (first.kind !== "merged") throw new Error("merge failed");
    const errored = markE1Outcome(first.state, "req_e1_001", "error");
    const result = correlateMainSummary(errored, baseSummary(), DEFAULT_CORRELATION_POLICY);
    expect(result.kind).toBe("no_match");
    if (result.kind === "no_match") {
      expect(result.reason).toBe("error");
    }
  });

  it("rejected record surfaces rejection with auth_required reason (not malformed_response)", () => {
    const e1 = parseE1(e1Draft({ requestId: "req_x", apiTimeStamp: 1_753_363_200_000 }));
    const first = mergeE1Lifecycle(createCorrelatorState(), e1);
    if (first.kind !== "merged") throw new Error("merge failed");
    const rejected = markE1Outcome(first.state, "req_x", "rejected", "auth_required");
    const result = correlateMainSummary(rejected, baseSummary(), DEFAULT_CORRELATION_POLICY);
    expect(result.kind).toBe("rejected");
    if (result.kind === "rejected") {
      expect(result.requestId).toBe("req_x");
      expect(result.rejectionReason).toBe("auth_required");
    }
  });

  it("rejected record surfaces rejection with csrf_invalid reason", () => {
    const e1 = parseE1(e1Draft({ requestId: "req_x", apiTimeStamp: 1_753_363_200_000 }));
    const first = mergeE1Lifecycle(createCorrelatorState(), e1);
    if (first.kind !== "merged") throw new Error("merge failed");
    const rejected = markE1Outcome(first.state, "req_x", "rejected", "csrf_invalid");
    const result = correlateMainSummary(rejected, baseSummary(), DEFAULT_CORRELATION_POLICY);
    expect(result.kind).toBe("rejected");
    if (result.kind === "rejected") {
      expect(result.rejectionReason).toBe("csrf_invalid");
    }
  });
});

// ---------------------------------------------------------------------------
// correlateMainSummary — apiTimeStamp & receivedAt ordering rules
// ---------------------------------------------------------------------------

describe("correlateMainSummary — apiTimeStamp vs receivedAt (Phase A Task A3 acceptance bullets 5, 6)", () => {
  it("apiTimeStamp ordering: a later apiTimeStamp on the same requestId wins the merge", () => {
    const early = parseE1(e1Draft({ apiTimeStamp: 1_753_363_200_000, statusCode: 100 }));
    const first = mergeE1Lifecycle(createCorrelatorState(), early);
    if (first.kind !== "merged") throw new Error("first merge failed");
    const later = parseE1(e1Draft({ apiTimeStamp: 1_753_363_205_000, statusCode: 200 }));
    const second = mergeE1Lifecycle(first.state, later);
    if (second.kind !== "merged") throw new Error("second merge failed");
    const record = second.state.records.get("req_e1_001");
    if (record === undefined) throw new Error("record missing");
    expect(record.evidence.apiTimeStamp).toBe(1_753_363_205_000);
    expect(record.evidence.statusCode).toBe(200);
  });

  it("receivedAt monotonicity: summary earlier than E1 receivedAt → no_match crossed_fields", () => {
    const future = parseE1(e1Draft({
      apiTimeStamp: 1_753_363_200_000,
      receivedAt: "2026-07-24T12:00:05.000Z",
    }));
    const first = mergeE1Lifecycle(createCorrelatorState(), future);
    if (first.kind !== "merged") throw new Error("merge failed");
    const result = correlateMainSummary(
      first.state,
      baseSummary({ receivedAt: "2026-07-24T12:00:00.000Z" }),
      DEFAULT_CORRELATION_POLICY,
    );
    expect(result.kind).toBe("no_match");
    if (result.kind === "no_match") {
      expect(result.reason).toBe("crossed_fields");
    }
  });

  it("receivedAt equals summary.receivedAt correlates normally", () => {
    const equal = parseE1(e1Draft({
      apiTimeStamp: 1_753_363_200_000,
      receivedAt: "2026-07-24T12:00:01.000Z",
    }));
    const first = mergeE1Lifecycle(createCorrelatorState(), equal);
    if (first.kind !== "merged") throw new Error("merge failed");
    const result = correlateMainSummary(
      first.state,
      baseSummary({ receivedAt: "2026-07-24T12:00:01.000Z" }),
      DEFAULT_CORRELATION_POLICY,
    );
    expect(result.kind).toBe("correlated");
  });
});

// ---------------------------------------------------------------------------
// selectStableSubmissionIdentity — determinism
// ---------------------------------------------------------------------------

describe("selectStableSubmissionIdentity — deterministic namespaced id (Phase A Task A3 acceptance bullet)", () => {
  it("returns null when the summary has no externalSubmissionId", () => {
    const result = selectStableSubmissionIdentity(createCorrelatorState(), baseSummary());
    expect(result).toBeNull();
  });

  it("returns null when the summary's externalSubmissionId is whitespace", () => {
    const result = selectStableSubmissionIdentity(
      createCorrelatorState(),
      baseSummary({ externalSubmissionId: "   " }),
    );
    expect(result).toBeNull();
  });

  it("derives platform:externalSubmissionId when a value is provided", () => {
    const state = createCorrelatorState();
    const summary = baseSummary({
      platform: "atcoder",
      externalSubmissionId: "AC_sub_42",
    });
    expect(selectStableSubmissionIdentity(state, summary)).toBe("atcoder:AC_sub_42");
  });

  it("same input twice yields the same id (determinism)", () => {
    const state = createCorrelatorState();
    const summary = baseSummary({
      platform: "nowcoder",
      externalSubmissionId: "NC_xyz_42",
    });
    const first = selectStableSubmissionIdentity(state, summary);
    const second = selectStableSubmissionIdentity(state, summary);
    expect(first).toBe(second);
    expect(first).toBe("nowcoder:NC_xyz_42");
  });

  it("independent calls with state mutation still produce deterministic output from the summary alone", () => {
    const stateA = createCorrelatorState();
    const stateB: CorrelatorState = (() => {
      let s = stateA;
      const e1 = parseE1(e1Draft({ requestId: "req_other", apiTimeStamp: 1000 }));
      const merged = mergeE1Lifecycle(s, e1);
      if (merged.kind !== "merged") throw new Error("merge failed");
      s = merged.state;
      s = markE1Outcome(s, "req_other", "rejected", "malformed_response");
      return s;
    })();
    const summary = baseSummary({ externalSubmissionId: "sub_same" });
    expect(selectStableSubmissionIdentity(stateA, summary)).toBe("leetcode:sub_same");
    expect(selectStableSubmissionIdentity(stateB, summary)).toBe("leetcode:sub_same");
  });
});

// ---------------------------------------------------------------------------
// Structural minimal check
// ---------------------------------------------------------------------------

describe("structural minimal check via parseSafeEvidence (Phase A Task A3)", () => {
  it("rejects an E1 whose record carries a forbidden body field at merge time", () => {
    const forbidden: Record<string, unknown> = e1Draft({ requestId: "req_x", body: "secret" });
    const result = parseSafeEvidence(forbidden);
    expect(result.ok).toBe(false);
    const passedThrough = result.ok ? (result.value as E1RequestObserved) : undefined;
    const merged = passedThrough === undefined
      ? null
      : mergeE1Lifecycle(createCorrelatorState(), passedThrough);
    expect(merged).toBeNull();
  });

  it("rejects an E1 whose endpointKey looks like a URL (URL-shaped endpoint keys are unsafe)", () => {
    const draft: Record<string, unknown> = e1Draft({ endpointKey: "https://evil.example/submit" });
    const result = parseSafeEvidence(draft);
    expect(result.ok).toBe(false);
  });

  it("every E1 record the correlator ingests must conform to the Safe Evidence schema", () => {
    const valid = parseE1(e1Draft({ apiTimeStamp: 1_753_363_200_000 }));
    const result = mergeE1Lifecycle(createCorrelatorState(), valid);
    expect(result.kind).toBe("merged");
  });
});

// ---------------------------------------------------------------------------
// Forbidden chrome.* path prevention
// ---------------------------------------------------------------------------

describe("forbidden chrome.* path prevention (Phase A Task A3)", () => {
  it("rejects an E1 with a chrome.* path field even when otherwise well-formed", () => {
    const draft = e1Draft({
      chromeStorageKey: "user-token",
    });
    const result = parseSafeEvidence(draft);
    expect(result.ok).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Final summarize: happy-path full lifecycle
// ---------------------------------------------------------------------------

describe("full correlation lifecycle (Phase A Task A3 acceptance bullet 1..8)", () => {
  it("supports a complete request→response→bridge→submission lifecycle deterministically", () => {
    const before = parseE1(e1Draft({
      requestId: "req_lifecycle",
      apiTimeStamp: 1_753_363_200_000,
      receivedAt: "2026-07-24T12:00:00.000Z",
      lifecycle: "before_request",
    }));
    let state: CorrelatorState = createCorrelatorState();
    const mergedBefore = mergeE1Lifecycle(state, before);
    if (mergedBefore.kind !== "merged") throw new Error("merge failed");
    state = mergedBefore.state;

    const response = parseE1(e1Draft({
      requestId: "req_lifecycle",
      apiTimeStamp: 1_753_363_200_400,
      receivedAt: "2026-07-24T12:00:00.400Z",
      lifecycle: "response_started",
      statusCode: 200,
    }));
    const mergedResponse = mergeE1Lifecycle(state, response);
    if (mergedResponse.kind !== "merged") throw new Error("merge failed");
    state = mergedResponse.state;

    const completed = parseE1(e1Draft({
      requestId: "req_lifecycle",
      apiTimeStamp: 1_753_363_200_900,
      receivedAt: "2026-07-24T12:00:00.900Z",
      lifecycle: "completed",
      statusCode: 200,
      redirectEndpointKey: "problems/two-sum/result_page",
    }));
    const mergedCompleted = mergeE1Lifecycle(state, completed);
    if (mergedCompleted.kind !== "merged") throw new Error("merge failed");
    state = mergedCompleted.state;

    const correlated = correlateMainSummary(
      state,
      baseSummary({
        evidenceId: "ev_summary_full_lifecycle",
        apiTimeStamp: 1_753_363_201_100,
        redirectEndpointKey: "problems/two-sum/result_page",
        externalSubmissionId: "LC_sub_full",
        receivedAt: "2026-07-24T12:00:01.500Z",
      }),
      DEFAULT_CORRELATION_POLICY,
    );
    expect(correlated.kind).toBe("correlated");
    if (correlated.kind === "correlated") {
      expect(correlated.matchedE1.requestId).toBe("req_lifecycle");
      expect(correlated.matchedE1.apiTimeStamp).toBe(1_753_363_200_900);
      expect(correlated.matchedE1.receivedAt).toBe("2026-07-24T12:00:00.000Z");
      expect(correlated.matchedE1.statusCode).toBe(200);
      expect(correlated.matchedE1.redirectEndpointKey).toBe("problems/two-sum/result_page");
      // Single candidate — disambiguated by uniqueness alone. The
      // redirectEndpointKey and externalSubmissionId summary signals are
      // recorded for downstream E2 minting but not consumed here.
      expect(correlated.disambiguatedBy).toBe("unique");
      expect(selectStableSubmissionIdentity(state, correlated.summary)).toBe(
        "leetcode:LC_sub_full",
      );
    }
  });
});

// ---------------------------------------------------------------------------
// State immutability
// ---------------------------------------------------------------------------

describe("state immutability (Phase A Task A3)", () => {
  it("createCorrelatorState returns a frozen state whose records wrapper is also frozen", () => {
    const state = createCorrelatorState();
    expect(Object.isFrozen(state)).toBe(true);
    expect(Object.isFrozen(state.records)).toBe(true);
    // Records wrapper exposes no mutating API.
    expect((state.records as unknown as { set?: unknown }).set).toBeUndefined();
    expect((state.records as unknown as { clear?: unknown }).clear).toBeUndefined();
    expect((state.records as unknown as { delete?: unknown }).delete).toBeUndefined();
  });

  it("mergeE1Lifecycle returns a new state with a different object identity", () => {
    const before = createCorrelatorState();
    const result = mergeE1Lifecycle(before, parseE1(e1Draft({ apiTimeStamp: 1_753_363_200_000 })));
    if (result.kind !== "merged") throw new Error("merge failed");
    expect(result.state).not.toBe(before);
    expect(Object.isFrozen(result.state)).toBe(true);
    expect(Object.isFrozen(result.state.records)).toBe(true);
    // The returned record and its evidence are frozen.
    const record = result.state.records.get("req_e1_001");
    if (record === undefined) throw new Error("record missing");
    expect(Object.isFrozen(record)).toBe(true);
    expect(Object.isFrozen(record.evidence)).toBe(true);
  });

  it("markE1Outcome on an unknown requestId returns a NEW state object with equal contents", () => {
    const before = createCorrelatorState();
    const seeded = mergeE1Lifecycle(before, parseE1(e1Draft({ apiTimeStamp: 1_753_363_200_000 })));
    if (seeded.kind !== "merged") throw new Error("seed failed");
    const start = seeded.state;
    const after = markE1Outcome(start, "req_unknown", "matched");
    expect(after).not.toBe(start);
    expect(after.records.size).toBe(start.records.size);
    expect(after.records.get("req_e1_001")).toBe(start.records.get("req_e1_001"));
  });

  it("markE1Outcome on an already-marked record returns a NEW state object", () => {
    const seeded = mergeE1Lifecycle(createCorrelatorState(), parseE1(e1Draft({ apiTimeStamp: 1_753_363_200_000 })));
    if (seeded.kind !== "merged") throw new Error("seed failed");
    const marked = markE1Outcome(seeded.state, "req_e1_001", "matched");
    const stillMarked = markE1Outcome(marked, "req_e1_001", "rejected", "malformed_response");
    expect(stillMarked).not.toBe(marked);
    expect(stillMarked.records.get("req_e1_001")?.outcome).toBe("matched");
  });

  it("recordStableIdentity on an unknown requestId returns a NEW state object", () => {
    const seeded = mergeE1Lifecycle(createCorrelatorState(), parseE1(e1Draft({ apiTimeStamp: 1_753_363_200_000 })));
    if (seeded.kind !== "merged") throw new Error("seed failed");
    const after = recordStableIdentity(seeded.state, "req_unknown", "leetcode:sub");
    expect(after).not.toBe(seeded.state);
    expect(after.records.size).toBe(seeded.state.records.size);
  });

  it("recordStableIdentity with an unprefixed id is normalized to the platform-namespaced form", () => {
    const seeded = mergeE1Lifecycle(createCorrelatorState(), parseE1(e1Draft({ apiTimeStamp: 1_753_363_200_000 })));
    if (seeded.kind !== "merged") throw new Error("seed failed");
    const after = recordStableIdentity(seeded.state, "req_e1_001", "LC_sub_42");
    expect(after.records.get("req_e1_001")?.stableSubmissionId).toBe("leetcode:LC_sub_42");
  });

  it("recordStableIdentity rejects an id with a foreign platform prefix as a no-op", () => {
    const seeded = mergeE1Lifecycle(createCorrelatorState(), parseE1(e1Draft({ apiTimeStamp: 1_753_363_200_000 })));
    if (seeded.kind !== "merged") throw new Error("seed failed");
    const after = recordStableIdentity(seeded.state, "req_e1_001", "atcoder:foo");
    // Reject = NEW state, same contents, stableSubmissionId remains null.
    expect(after).not.toBe(seeded.state);
    expect(after.records.get("req_e1_001")?.stableSubmissionId).toBeNull();
  });

  it("correlateMainSummary result.matchedE1 and summary are frozen", () => {
    const seeded = mergeE1Lifecycle(createCorrelatorState(), parseE1(e1Draft({ requestId: "req_A", apiTimeStamp: 1_753_363_200_000 })));
    if (seeded.kind !== "merged") throw new Error("seed failed");
    const result = correlateMainSummary(seeded.state, baseSummary(), DEFAULT_CORRELATION_POLICY);
    if (result.kind !== "correlated") throw new Error("expected correlated");
    expect(Object.isFrozen(result.matchedE1)).toBe(true);
    expect(Object.isFrozen(result.summary)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// External submission id exact match (no endsWith fallback)
// ---------------------------------------------------------------------------

describe("external submission id disambiguation uses full platform-namespaced equality (Phase A Task A3)", () => {
  it("candidate with stableSubmissionId 'leetcode:old:42' does NOT match summary id '42'", () => {
    const e1A = parseE1(e1Draft({
      requestId: "req_A",
      apiTimeStamp: 1_753_363_200_000,
      redirectEndpointKey: "problems/two-sum/result_page",
    }));
    const e1B = parseE1(e1Draft({
      requestId: "req_B",
      apiTimeStamp: 1_753_363_200_500,
      redirectEndpointKey: "problems/two-sum/result_page",
    }));
    let state: CorrelatorState = createCorrelatorState();
    for (const ev of [e1A, e1B]) {
      const r = mergeE1Lifecycle(state, ev);
      if (r.kind !== "merged") throw new Error("merge failed");
      state = r.state;
    }
    // A deliberately carries a stable id whose endsWith(":" + "42") would
    // match a substring-fallback comparator. Full equality rejects it.
    const stable = recordStableIdentity(state, "req_A", "leetcode:old:42");
    const result = correlateMainSummary(
      stable,
      baseSummary({
        redirectEndpointKey: "problems/two-sum/result_page",
        externalSubmissionId: "42",
        receivedAt: "2026-07-24T12:00:01.500Z",
      }),
      DEFAULT_CORRELATION_POLICY,
    );
    expect(result.kind).toBe("ambiguous");
  });

  it("full canonical equality resolves AMBIGUOUS when summary asks for 'LC_sub_999'", () => {
    const e1A = parseE1(e1Draft({
      requestId: "req_A",
      apiTimeStamp: 1_753_363_200_000,
      redirectEndpointKey: "problems/two-sum/result_page",
    }));
    const e1B = parseE1(e1Draft({
      requestId: "req_B",
      apiTimeStamp: 1_753_363_200_500,
      redirectEndpointKey: "problems/two-sum/result_page",
    }));
    let state: CorrelatorState = createCorrelatorState();
    for (const ev of [e1A, e1B]) {
      const r = mergeE1Lifecycle(state, ev);
      if (r.kind !== "merged") throw new Error("merge failed");
      state = r.state;
    }
    const stable = recordStableIdentity(state, "req_B", "leetcode:LC_sub_999");
    const result = correlateMainSummary(
      stable,
      baseSummary({
        redirectEndpointKey: "problems/two-sum/result_page",
        externalSubmissionId: "LC_sub_999",
        receivedAt: "2026-07-24T12:00:01.500Z",
      }),
      DEFAULT_CORRELATION_POLICY,
    );
    expect(result.kind).toBe("correlated");
    if (result.kind === "correlated") {
      expect(result.matchedE1.requestId).toBe("req_B");
      expect(result.disambiguatedBy).toBe("external_submission_id");
    }
  });
});

// ---------------------------------------------------------------------------
// parseMainBridgeSummary runtime validation
// ---------------------------------------------------------------------------

describe("parseMainBridgeSummary (Phase A Task A3)", () => {
  it("accepts a valid summary", () => {
    const r = parseMainBridgeSummary(baseSummary());
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(Object.isFrozen(r.value)).toBe(true);
    }
  });

  it("rejects non-canonical receivedAt", () => {
    const r = parseMainBridgeSummary(baseSummary({ receivedAt: "2026-07-24 12:00:00Z" }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/receivedAt/);
  });

  it("rejects non-finite apiTimeStamp", () => {
    const r = parseMainBridgeSummary(baseSummary({ apiTimeStamp: Number.POSITIVE_INFINITY }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/apiTimeStamp/);
  });

  it("rejects negative apiTimeStamp", () => {
    const r = parseMainBridgeSummary(baseSummary({ apiTimeStamp: -1 }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/apiTimeStamp/);
  });

  it("rejects non-existent calendar dates in receivedAt", () => {
    const r1 = parseMainBridgeSummary(baseSummary({ receivedAt: "2026-02-31T12:00:00.000Z" }));
    expect(r1.ok).toBe(false);
    const r2 = parseMainBridgeSummary(baseSummary({ receivedAt: "2025-02-29T12:00:00.000Z" }));
    expect(r2.ok).toBe(false);
  });

  it("accepts receivedAt on a leap day", () => {
    const r = parseMainBridgeSummary(baseSummary({ receivedAt: "2024-02-29T12:00:00.000Z" }));
    expect(r.ok).toBe(true);
  });

  it("rejects empty evidenceId", () => {
    const r = parseMainBridgeSummary(baseSummary({ evidenceId: "   " }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/evidenceId/);
  });

  it("rejects unknown platform", () => {
    const r = parseMainBridgeSummary({ ...baseSummary(), platform: "foobar" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/platform/);
  });

  it("rejects null / non-object inputs", () => {
    expect(parseMainBridgeSummary(null).ok).toBe(false);
    expect(parseMainBridgeSummary(undefined).ok).toBe(false);
    expect(parseMainBridgeSummary("not-a-summary").ok).toBe(false);
  });

  it("correlateMainSummary rejects invalid summaries with no_match zero_candidates", () => {
    const result = correlateMainSummary(
      createCorrelatorState(),
      // Cast through unknown to bypass the strict MainBridgeSummary type.
      { ...baseSummary(), receivedAt: "2026-07-24 12:00:00Z" } as unknown as MainBridgeSummary,
      DEFAULT_CORRELATION_POLICY,
    );
    expect(result.kind).toBe("no_match");
    if (result.kind === "no_match") {
      expect(result.reason).toBe("zero_candidates");
    }
  });
});

// ---------------------------------------------------------------------------
// Disambiguation priority
// ---------------------------------------------------------------------------

describe("disambiguation priority (Phase A Task A3)", () => {
  it("redirectEndpointKey alone resolves AMBIGUOUS when only one candidate carries it", () => {
    const e1A = parseE1(e1Draft({ requestId: "req_A", apiTimeStamp: 1_753_363_200_000 }));
    const e1B = parseE1(e1Draft({
      requestId: "req_B",
      apiTimeStamp: 1_753_363_200_500,
      redirectEndpointKey: "problems/two-sum/result_page",
    }));
    let state: CorrelatorState = createCorrelatorState();
    for (const ev of [e1A, e1B]) {
      const r = mergeE1Lifecycle(state, ev);
      if (r.kind !== "merged") throw new Error("merge failed");
      state = r.state;
    }
    const result = correlateMainSummary(
      state,
      baseSummary({
        redirectEndpointKey: "problems/two-sum/result_page",
        receivedAt: "2026-07-24T12:00:01.500Z",
      }),
      DEFAULT_CORRELATION_POLICY,
    );
    expect(result.kind).toBe("correlated");
    if (result.kind === "correlated") {
      expect(result.matchedE1.requestId).toBe("req_B");
      expect(result.disambiguatedBy).toBe("redirect_endpoint_key");
    }
  });

  it("redirect tie + externalSubmissionId win returns external_submission_id signal", () => {
    const e1A = parseE1(e1Draft({
      requestId: "req_A",
      apiTimeStamp: 1_753_363_200_000,
      redirectEndpointKey: "problems/two-sum/result_page",
    }));
    const e1B = parseE1(e1Draft({
      requestId: "req_B",
      apiTimeStamp: 1_753_363_200_500,
      redirectEndpointKey: "problems/two-sum/result_page",
    }));
    let state: CorrelatorState = createCorrelatorState();
    for (const ev of [e1A, e1B]) {
      const r = mergeE1Lifecycle(state, ev);
      if (r.kind !== "merged") throw new Error("merge failed");
      state = r.state;
    }
    const stable = recordStableIdentity(state, "req_B", "leetcode:LC_sub_999");
    const result = correlateMainSummary(
      stable,
      baseSummary({
        redirectEndpointKey: "problems/two-sum/result_page",
        externalSubmissionId: "LC_sub_999",
        receivedAt: "2026-07-24T12:00:01.500Z",
      }),
      DEFAULT_CORRELATION_POLICY,
    );
    expect(result.kind).toBe("correlated");
    if (result.kind === "correlated") {
      expect(result.matchedE1.requestId).toBe("req_B");
      expect(result.disambiguatedBy).toBe("external_submission_id");
    }
  });

  it("both summary signals absent with unique in-window candidate returns disambiguatedBy 'unique'", () => {
    const seeded = mergeE1Lifecycle(createCorrelatorState(), parseE1(e1Draft({ apiTimeStamp: 1_753_363_200_000 })));
    if (seeded.kind !== "merged") throw new Error("seed failed");
    const result = correlateMainSummary(seeded.state, baseSummary(), DEFAULT_CORRELATION_POLICY);
    expect(result.kind).toBe("correlated");
    if (result.kind === "correlated") {
      expect(result.disambiguatedBy).toBe("unique");
    }
  });
});
