import { describe, expect, it } from "vitest";

import {
  createCaptureStateMachineState,
  reduceCaptureState,
  type CaptureEffect,
  type CaptureReducerInput,
  type CaptureReducerMetadata,
  type CaptureReducerState,
} from "@/extension/src/captureStateMachine";
import type {
  E1RequestObserved,
  E2SubmissionConfirmed,
  E3FinalVerdictConfirmed,
  SafeEvidence,
} from "@/extension/src/evidence";
import type {
  CorrelationResult,
  MainBridgeSummary,
} from "@/extension/src/submissionCorrelator";
import { CaptureAttemptBundleSchema } from "@/lib/capture/attemptBundle";
import type {
  SessionEndedEvent,
  SessionStartedEvent,
  SubmissionObservedEvent,
  VerdictObservedEvent,
} from "@/lib/capture/protocol";

const fixedNow = () => "2026-07-24T12:30:00.000Z";

const metadata: CaptureReducerMetadata = {
  installationId: "install-a",
  captureSessionId: "session-a",
  adapterVersion: "adapter-a@1",
  parserVersion: "parser-a@1",
  pageOrigin: "https://leetcode.com",
  provenanceLevel: "extension_unpaired",
  problemExternalId: "two-sum",
  problemTitle: "Two Sum",
  canonicalUrl: "https://leetcode.com/problems/two-sum/",
  startedAt: "2026-07-24T12:00:00.000Z",
};

const e1: E1RequestObserved = {
  schemaVersion: 1,
  evidenceId: "e1-a",
  platform: "leetcode",
  tier: "E1",
  kind: "request_observed",
  receivedAt: "2026-07-24T12:00:01.000Z",
  tabId: 1,
  frameId: 0,
  documentId: "doc-a",
  adapterVersion: "adapter-a@1",
  apiTimeStamp: 1000,
  requestId: "request-a",
  method: "POST",
  endpointKey: "problems/two-sum/submit",
  resourceType: "xmlhttprequest",
  lifecycle: "completed",
  statusCode: 200,
};

function e2(overrides: Partial<E2SubmissionConfirmed> = {}): E2SubmissionConfirmed {
  return {
    schemaVersion: 1,
    evidenceId: "e2-a",
    platform: "leetcode",
    tier: "E2",
    kind: "submission_confirmed",
    receivedAt: "2026-07-24T12:00:02.000Z",
    tabId: 1,
    frameId: 0,
    documentId: "doc-a",
    adapterVersion: "adapter-a@1",
    requestEvidenceId: "e1-a",
    externalSubmissionId: "submission-a",
    problemExternalId: "two-sum",
    ...overrides,
  };
}

function e3(overrides: Partial<E3FinalVerdictConfirmed> = {}): E3FinalVerdictConfirmed {
  return {
    schemaVersion: 1,
    evidenceId: "e3-a",
    platform: "leetcode",
    tier: "E3",
    kind: "final_verdict_confirmed",
    receivedAt: "2026-07-24T12:00:03.000Z",
    tabId: 1,
    frameId: 0,
    documentId: "doc-a",
    adapterVersion: "adapter-a@1",
    externalSubmissionId: "submission-a",
    problemExternalId: "two-sum",
    verdict: "Accepted",
    ...overrides,
  };
}

function safe(evidence: SafeEvidence, extra: CaptureReducerMetadata = metadata): CaptureReducerInput {
  return { kind: "safe_evidence", evidence, metadata: extra };
}

function reduce(
  state: CaptureReducerState,
  input: CaptureReducerInput,
): ReturnType<typeof reduceCaptureState> {
  return reduceCaptureState(state, input, fixedNow);
}

function sequence(
  inputs: readonly CaptureReducerInput[],
  initial = createCaptureStateMachineState(fixedNow),
): { readonly state: CaptureReducerState; readonly effects: readonly CaptureEffect[] } {
  let state = initial;
  const effects: Array<ReturnType<typeof reduceCaptureState>["effects"][number]> = [];
  for (const input of inputs) {
    const result = reduce(state, input);
    state = result.state;
    effects.push(...result.effects);
  }
  return { state, effects };
}

function v3Started(overrides: Partial<SessionStartedEvent> = {}): SessionStartedEvent {
  return {
    schemaVersion: 2,
    id: "v3-start",
    captureSessionId: "session-a",
    installationId: "install-a",
    adapterVersion: "adapter-a@1",
    parserVersion: "parser-a@1",
    pageOrigin: "https://leetcode.com",
    provenanceLevel: "extension_unpaired",
    platform: "leetcode",
    problemExternalId: "two-sum",
    problemTitle: "Two Sum",
    canonicalUrl: "https://leetcode.com/problems/two-sum/",
    occurredAt: "2026-07-24T12:00:00.000Z",
    type: "SESSION_STARTED",
    payload: { source: "content_script" },
    ...overrides,
  };
}

function v3Submitted(overrides: Partial<SubmissionObservedEvent> = {}): SubmissionObservedEvent {
  return {
    ...v3Started(),
    id: "v3-submit",
    type: "SUBMISSION_OBSERVED",
    submissionId: "submission-a",
    occurredAt: "2026-07-24T12:00:01.000Z",
    payload: { action: "submit_clicked" },
    ...overrides,
  };
}

function v3Verdict(overrides: Partial<VerdictObservedEvent> = {}): VerdictObservedEvent {
  return {
    ...v3Submitted(),
    id: "v3-verdict",
    type: "VERDICT_OBSERVED",
    occurredAt: "2026-07-24T12:00:02.000Z",
    payload: { verdict: "Accepted" },
    ...overrides,
  };
}

function v3Ended(overrides: Partial<SessionEndedEvent> = {}): SessionEndedEvent {
  return {
    ...v3Started(),
    id: "v3-end",
    type: "SESSION_ENDED",
    occurredAt: "2026-07-24T12:00:03.000Z",
    payload: { endReason: "spa_navigation" },
    ...overrides,
  };
}

function v3Input(event: SessionStartedEvent | SubmissionObservedEvent | VerdictObservedEvent | SessionEndedEvent): CaptureReducerInput {
  if (event.type === "SESSION_STARTED") return { kind: "v3_session_started", event };
  if (event.type === "SUBMISSION_OBSERVED") return { kind: "v3_submission_observed", event };
  if (event.type === "VERDICT_OBSERVED") return { kind: "v3_verdict_observed", event };
  return { kind: "v3_session_ended", event };
}

function correlatedResult(): Extract<CorrelationResult, { readonly kind: "correlated" }> {
  const summary: MainBridgeSummary = {
    platform: "leetcode",
    tabId: 1,
    frameId: 0,
    documentId: "doc-a",
    method: "POST",
    endpointKey: "problems/two-sum/submit",
    apiTimeStamp: 1001,
    externalSubmissionId: "submission-a",
    problemExternalId: "two-sum",
    receivedAt: "2026-07-24T12:00:02.000Z",
    evidenceId: "summary-a",
  };
  return {
    kind: "correlated",
    matchedE1: e1,
    summary,
    disambiguatedBy: "unique",
  };
}

describe("capture state machine public contract", () => {
  it("keeps E0 in IDLE without an effect", () => {
    const hint: SafeEvidence = {
      schemaVersion: 1,
      evidenceId: "e0-a",
      platform: "leetcode",
      tier: "E0",
      kind: "ui_hint",
      receivedAt: "2026-07-24T12:00:00.500Z",
      tabId: 1,
      frameId: 0,
      documentId: "doc-a",
      adapterVersion: "adapter-a@1",
      problemExternalId: "two-sum",
    };
    const result = reduce(createCaptureStateMachineState(fixedNow), safe(hint));
    expect(result.state.status).toBe("IDLE");
    expect(result.effects).toEqual([]);
  });

  it("enters REQUEST_OBSERVED for E1 without creating waiting", () => {
    const result = reduce(createCaptureStateMachineState(fixedNow), safe(e1));
    expect(result.state.status).toBe("REQUEST_OBSERVED");
    expect(result.state.waitingCount).toBe(0);
    expect(result.effects).toEqual([]);
  });

  it.each([
    ["cancellation", "error_occurred" as const, undefined],
    ["4xx", "completed" as const, 400],
  ])("rejects %s E1", (_label, lifecycle, statusCode) => {
    const rejected: E1RequestObserved = {
      ...e1,
      evidenceId: `e1-${_label}`,
      requestId: `request-${_label}`,
      lifecycle,
      ...(statusCode === undefined ? {} : { statusCode }),
    };
    const result = reduce(createCaptureStateMachineState(fixedNow), safe(rejected));
    expect(result.state.status).toBe("REJECTED");
    expect(result.effects[0]?.kind).toBe("rejected");
  });

  it("rejects an adapter-declared business rejection", () => {
    const rejection: SafeEvidence = {
      schemaVersion: 1,
      evidenceId: "rejection-a",
      platform: "leetcode",
      tier: "E1",
      kind: "request_rejected",
      receivedAt: "2026-07-24T12:00:01.000Z",
      tabId: 1,
      frameId: 0,
      documentId: "doc-a",
      adapterVersion: "adapter-a@1",
      apiTimeStamp: 1001,
      requestId: "request-a",
      method: "POST",
      endpointKey: "problems/two-sum/submit",
      resourceType: "xmlhttprequest",
      lifecycle: "completed",
      rejectionReason: "business_rejection",
      statusCode: 200,
    };
    const result = reduce(createCaptureStateMachineState(fixedNow), safe(rejection));
    expect(result.state.status).toBe("REJECTED");
    expect(result.effects).toHaveLength(1);
    expect(result.effects[0]).toMatchObject({ kind: "rejected", reason: "business_rejection" });
  });

  it("rejects E2 without a legal referenced E1", () => {
    const result = reduce(createCaptureStateMachineState(fixedNow), safe(e2()));
    expect(result.state.status).toBe("REJECTED");
    expect(result.effects[0]?.kind).toBe("rejected");
    expect(result.effects.some((effect) => effect.kind === "bundle")).toBe(false);
  });

  it("confirms a legal E2 exactly once and contributes to waiting", () => {
    const first = reduce(createCaptureStateMachineState(fixedNow), safe(e1));
    const second = reduce(first.state, safe(e2()));
    const duplicate = reduce(second.state, safe(e2({ evidenceId: "e2-a-duplicate" })));
    expect(second.state.status).toBe("SUBMISSION_CONFIRMED");
    expect(second.state.waitingCount).toBe(1);
    expect(second.effects).toEqual([]);
    expect(duplicate.state.status).toBe("SUBMISSION_CONFIRMED");
    expect(duplicate.state.waitingCount).toBe(1);
    expect(duplicate.effects).toEqual([]);
    expect(duplicate.state.records).toHaveLength(1);
  });

  it.each(["queued", "judging", "running"] as const)("phase %s keeps the same submission", (phase) => {
    const confirmed = sequence([safe(e1), safe(e2({ phase: "queued" }))]);
    const next = reduce(confirmed.state, safe(e2({ evidenceId: `e2-${phase}`, phase })));
    expect(next.state.records[0]?.submissionKey).toBe("leetcode:submission-a");
    expect(next.state.status).toBe("SUBMISSION_CONFIRMED");
    expect(next.effects).toEqual([]);
  });

  it("rejects E2 when the referenced E1 window has expired", () => {
    const observed = reduce(createCaptureStateMachineState(fixedNow), safe(e1));
    const expired = reduce(observed.state, {
      kind: "correlator_no_match",
      result: { kind: "no_match", reason: "expired" },
    });
    const confirmed = reduce(expired.state, safe(e2()));
    expect(expired.state.status).toBe("EXPIRED");
    expect(confirmed.effects[0]).toMatchObject({ kind: "rejected", reason: "timeout" });
    expect(confirmed.effects.some((effect) => effect.kind === "bundle")).toBe(false);
  });

  it("ignores a non-final Safe Evidence verdict without changing state", () => {
    const confirmed = sequence([safe(e1), safe(e2())]);
    const nonFinal = e3();
    Reflect.set(nonFinal, "verdict", "Pending");
    const result = reduce(confirmed.state, safe(nonFinal));
    expect(result.state.status).toBe("SUBMISSION_CONFIRMED");
    expect(result.effects[0]).toMatchObject({ kind: "ignored", reason: "non_final_verdict" });
  });

  it("finalizes after matching E3 and emits one schema-shaped bundle", () => {
    const result = sequence([safe(e1), safe(e2()), safe(e3())]);
    expect(result.state.status).toBe("FINALIZED");
    expect(result.state.waitingCount).toBe(0);
    expect(result.effects).toHaveLength(1);
    const effect = result.effects[0];
    expect(effect?.kind).toBe("bundle");
    if (effect?.kind === "bundle") {
      expect(CaptureAttemptBundleSchema.parse(effect.bundle)).toEqual(effect.bundle);
      expect(effect.bundle.events.map((event) => event.type)).toEqual([
        "SESSION_STARTED",
        "SUBMISSION_OBSERVED",
        "VERDICT_OBSERVED",
        "SESSION_ENDED",
      ]);
    }
  });

  it("supports an immediate final verdict after E2", () => {
    const result = sequence([safe(e1), safe(e2()), safe(e3())]);
    expect(result.effects.filter((effect) => effect.kind === "bundle")).toHaveLength(1);
  });

  it("rejects an E3 earlier than the session start", () => {
    const early = e3({ receivedAt: "2026-07-23T12:00:00.000Z" });
    const result = sequence([safe(e1), safe(e2()), safe(early)]);
    expect(result.state.status).toBe("SUBMISSION_CONFIRMED");
    expect(result.effects.at(-1)?.kind).toBe("rejected");
    expect(result.effects.filter((effect) => effect.kind === "bundle")).toHaveLength(0);
  });

  it("does not finalize for mismatched problem or submission", () => {
    const problemMismatch = sequence([safe(e1), safe(e2()), safe(e3({ problemExternalId: "other" }))]);
    expect(problemMismatch.effects.filter((effect) => effect.kind === "bundle")).toHaveLength(0);
    const submissionMismatch = sequence([safe(e1), safe(e2()), safe(e3({ externalSubmissionId: "other" }))]);
    expect(submissionMismatch.effects.filter((effect) => effect.kind === "bundle")).toHaveLength(0);
  });

  it("rejects a duplicate E3 after finalization without a second bundle", () => {
    const finalized = sequence([safe(e1), safe(e2()), safe(e3())]);
    const duplicate = reduce(finalized.state, safe(e3({ evidenceId: "e3-duplicate" })));
    expect(duplicate.state.status).toBe("FINALIZED");
    expect(duplicate.effects).toHaveLength(1);
    expect(duplicate.effects[0]?.kind).toBe("rejected");
  });

  it("retains a stable E3 received before E2 and replays it", () => {
    const before = reduce(createCaptureStateMachineState(fixedNow), safe(e3()));
    expect(before.effects).toEqual([]);
    expect(before.state.pendingFinals).toHaveLength(1);
    const afterE1 = reduce(before.state, safe(e1));
    const afterE2 = reduce(afterE1.state, safe(e2()));
    expect(afterE2.state.status).toBe("FINALIZED");
    expect(afterE2.effects.filter((effect) => effect.kind === "bundle")).toHaveLength(1);
    const bundleEffect = afterE2.effects.find((effect) => effect.kind === "bundle");
    if (bundleEffect?.kind === "bundle") {
      expect(bundleEffect.bundle.events[2].payload.verdict).toBe("Accepted");
    }
  });

  it("does not retain an E3 without stable identity and emits an ignored effect", () => {
    const malformed = { ...e3(), externalSubmissionId: "" };
    const result = reduce(
      createCaptureStateMachineState(fixedNow),
      { kind: "safe_evidence", evidence: malformed, metadata },
    );
    expect(result.state.pendingFinals).toHaveLength(0);
    expect(result.effects).toEqual([
      { kind: "ignored", reason: "missing_external_submission_id", observedAt: "2026-07-24T12:30:00.000Z" },
    ]);
  });

  it("namespaces identical external IDs across platforms", () => {
    const atcoderE1: E1RequestObserved = { ...e1, platform: "atcoder", evidenceId: "e1-at", requestId: "request-at", documentId: "doc-at" };
    const atcoderE2: E2SubmissionConfirmed = { ...e2(), platform: "atcoder", evidenceId: "e2-at", requestEvidenceId: "e1-at", documentId: "doc-at", adapterVersion: "adapter-at@1" };
    const atcoderE3: E3FinalVerdictConfirmed = { ...e3(), platform: "atcoder", evidenceId: "e3-at", documentId: "doc-at", adapterVersion: "adapter-at@1" };
    const leetcode = sequence([safe(e1), safe(e2()), safe(e3())]);
    const atcoder = sequence([
      safe(atcoderE1, { ...metadata, platform: "atcoder", adapterVersion: "adapter-at@1" }),
      safe(atcoderE2, { ...metadata, adapterVersion: "adapter-at@1" }),
      safe(atcoderE3, { ...metadata, adapterVersion: "adapter-at@1" }),
    ]);
    const leetBundle = leetcode.effects.find((effect) => effect.kind === "bundle");
    const atBundle = atcoder.effects.find((effect) => effect.kind === "bundle");
    expect(leetBundle?.kind).toBe("bundle");
    expect(atBundle?.kind).toBe("bundle");
    if (leetBundle?.kind === "bundle" && atBundle?.kind === "bundle") {
      expect(leetBundle.bundle.bundleId).not.toBe(atBundle.bundle.bundleId);
      expect(leetBundle.bundle.events[1].submissionId).toBe(atBundle.bundle.events[1].submissionId);
      expect(leetBundle.bundle.events[0].platform).not.toBe(atBundle.bundle.events[0].platform);
    }
  });

  it("maps a correlated A3 result into E2 and accepts a downstream E3", () => {
    const correlated: CaptureReducerInput = {
      kind: "correlator_correlated",
      result: correlatedResult(),
      metadata,
    };
    const result = sequence([correlated, safe(e3())]);
    expect(result.state.status).toBe("FINALIZED");
    expect(result.effects.filter((effect) => effect.kind === "bundle")).toHaveLength(1);
  });

  it("surfaces correlator ambiguity and rejection without a bundle", () => {
    const ambiguous: Extract<CorrelationResult, { readonly kind: "ambiguous" }> = {
      kind: "ambiguous",
      reason: "multiple_e1_candidates",
      candidates: [e1],
      summary: correlatedResult().summary,
      candidateCount: 2,
    };
    const rejected: Extract<CorrelationResult, { readonly kind: "rejected" }> = {
      kind: "rejected",
      requestId: "request-a",
      rejectionReason: "auth_required",
    };
    const first = reduce(createCaptureStateMachineState(fixedNow), {
      kind: "correlator_ambiguous",
      result: ambiguous,
    });
    expect(first.state.status).toBe("AMBIGUOUS");
    expect(first.effects[0]).toMatchObject({ kind: "ambiguous", reason: "multiple_e1_candidates" });
    const second = reduce(first.state, { kind: "correlator_rejected", result: rejected });
    expect(second.state.status).toBe("REJECTED");
    expect(second.effects[0]).toMatchObject({ kind: "rejected", reason: "auth_required" });
  });
});

describe("V3 historical normalization", () => {
  it("builds one bundle from the four historical V3 events", () => {
    const result = sequence([
      v3Input(v3Started()),
      v3Input(v3Submitted()),
      v3Input(v3Verdict()),
      v3Input(v3Ended()),
    ]);
    expect(result.effects.filter((effect) => effect.kind === "bundle")).toHaveLength(1);
    expect(result.state.status).toBe("FINALIZED");
  });

  it("rejects a non-final V3 verdict", () => {
    const result = sequence([
      v3Input(v3Started()),
      v3Input(v3Submitted()),
      v3Input(v3Verdict({ payload: { verdict: "Pending" } })),
    ]);
    expect(result.effects.at(-1)?.kind).toBe("rejected");
    expect(result.effects.filter((effect) => effect.kind === "bundle")).toHaveLength(0);
  });

  it("rejects historical events when the session start is missing", () => {
    const result = sequence([v3Input(v3Submitted()), v3Input(v3Verdict()), v3Input(v3Ended())]);
    expect(result.effects.filter((effect) => effect.kind === "bundle")).toHaveLength(0);
    expect(result.effects.some((effect) => effect.kind === "rejected")).toBe(true);
  });
});

describe("state/effect purity and determinism", () => {
  it("deep-freezes state and effects and does not share mutable records", () => {
    const first = sequence([safe(e1), safe(e2())]);
    const second = reduce(first.state, safe(e3()));
    expect(Object.isFrozen(first.state)).toBe(true);
    expect(Object.isFrozen(first.state.records)).toBe(true);
    expect(Object.isFrozen(second.state)).toBe(true);
    expect(Object.isFrozen(second.effects)).toBe(true);
    expect(() => {
      Reflect.apply(Array.prototype.push, first.state.records, [first.state.records[0]]);
    }).toThrow();
    expect(second.state.records[0]?.status).toBe("FINALIZED");
  });

  it("uses the injected clock for every diagnostic effect", () => {
    const result = reduceCaptureState(
      createCaptureStateMachineState(),
      { kind: "safe_evidence", evidence: e3({ externalSubmissionId: "" }), metadata },
      () => "2026-07-24T23:59:59.000Z",
    );
    expect(result.effects).toEqual([
      {
        kind: "ignored",
        reason: "missing_external_submission_id",
        observedAt: "2026-07-24T23:59:59.000Z",
      },
    ]);

    const rejected = reduceCaptureState(
      createCaptureStateMachineState(),
      safe(e2()),
      () => "2026-07-24T23:59:59.000Z",
    );
    expect(rejected.effects[0]).toMatchObject({ observedAt: "2026-07-24T23:59:59.000Z" });
  });

  it("is deterministic for repeated inputs and allocates on no-op transitions", () => {
    const inputs = [safe(e1), safe(e2()), safe(e3())];
    const first = sequence(inputs);
    const second = sequence(inputs);
    expect(second.state).toEqual(first.state);
    expect(second.effects).toEqual(first.effects);
    const noOp = reduce(first.state, safe(e0Fixture()));
    expect(noOp.state).not.toBe(first.state);
  });
});

describe("bundle identity and high-risk reducer hardening", () => {
  it("emits the new `submission_confirmed` action for E2-driven bundles", () => {
    const result = sequence([safe(e1), safe(e2()), safe(e3())]);
    const effect = result.effects.find((entry) => entry.kind === "bundle");
    expect(effect?.kind).toBe("bundle");
    if (effect?.kind !== "bundle") return;
    expect(effect.observedAt).toBe("2026-07-24T12:30:00.000Z");
    const submitted = effect.bundle.events[1];
    expect(submitted.type).toBe("SUBMISSION_OBSERVED");
    expect(submitted.payload.action).toBe("submission_confirmed");
  });

  it("preserves the V3 `submit_clicked` action for historical normalization", () => {
    const result = sequence([
      v3Input(v3Started()),
      v3Input(v3Submitted()),
      v3Input(v3Verdict()),
      v3Input(v3Ended()),
    ]);
    const effect = result.effects.find((entry) => entry.kind === "bundle");
    expect(effect?.kind).toBe("bundle");
    if (effect?.kind !== "bundle") return;
    const submitted = effect.bundle.events[1];
    if (submitted.type !== "SUBMISSION_OBSERVED") throw new Error("expected submission event");
    expect(submitted.payload.action).toBe("submit_clicked");
  });

  it("yields an identical bundle id for identical canonical inputs", () => {
    const first = sequence([safe(e1), safe(e2()), safe(e3())]);
    const second = sequence([safe(e1), safe(e2()), safe(e3())]);
    const firstBundle = first.effects.find((entry) => entry.kind === "bundle");
    const secondBundle = second.effects.find((entry) => entry.kind === "bundle");
    expect(firstBundle?.kind).toBe("bundle");
    expect(secondBundle?.kind).toBe("bundle");
    if (firstBundle?.kind !== "bundle" || secondBundle?.kind !== "bundle") return;
    expect(firstBundle.bundle.bundleId).toBe(secondBundle.bundle.bundleId);
    // SHA-256 hex digest is 64 chars; the full id has a "bundle_" prefix.
    expect(firstBundle.bundle.bundleId).toMatch(/^bundle_[a-f0-9]{64}$/u);
  });

  it("keeps bundle ids distinct across platforms even when external ids collide", () => {
    const atcoderE1: E1RequestObserved = { ...e1, platform: "atcoder", evidenceId: "e1-at", requestId: "request-at", documentId: "doc-at" };
    const atcoderE2: E2SubmissionConfirmed = { ...e2(), platform: "atcoder", evidenceId: "e2-at", requestEvidenceId: "e1-at", documentId: "doc-at", adapterVersion: "adapter-at@1" };
    const atcoderE3: E3FinalVerdictConfirmed = { ...e3(), platform: "atcoder", evidenceId: "e3-at", documentId: "doc-at", adapterVersion: "adapter-at@1" };
    const leetcode = sequence([safe(e1), safe(e2()), safe(e3())]);
    const atcoder = sequence([
      safe(atcoderE1, { ...metadata, platform: "atcoder", adapterVersion: "adapter-at@1" }),
      safe(atcoderE2, { ...metadata, adapterVersion: "adapter-at@1" }),
      safe(atcoderE3, { ...metadata, adapterVersion: "adapter-at@1" }),
    ]);
    const leetBundle = leetcode.effects.find((entry) => entry.kind === "bundle");
    const atBundle = atcoder.effects.find((entry) => entry.kind === "bundle");
    if (leetBundle?.kind !== "bundle" || atBundle?.kind !== "bundle") {
      throw new Error("expected both bundles");
    }
    expect(leetBundle.bundle.bundleId).not.toBe(atBundle.bundle.bundleId);
  });

  it("rejects a control character in installationId and emits an ignored effect", () => {
    const result = sequence([
      safe(e1, { ...metadata, installationId: "install\u0000control" }),
      safe(e2(), { ...metadata, installationId: "install\u0000control" }),
      safe(e3(), { ...metadata, installationId: "install\u0000control" }),
    ]);
    expect(result.effects.some((entry) => entry.kind === "bundle")).toBe(false);
    const ignored = result.effects.find(
      (entry) => entry.kind === "ignored" && entry.reason === "control_character_in_identity",
    );
    expect(ignored).toBeDefined();
  });

  it("accepts identity fields whose UTF-8 length exceeds 255 bytes and produces a 64-char hex bundle id", () => {
    const longAdapterA = `adapter-${"a".repeat(400)}@1`;
    const longAdapterB = `adapter-${"b".repeat(400)}@1`;
    expect(Buffer.byteLength(longAdapterA, "utf8")).toBeGreaterThan(255);

    const first = sequence([
      safe(e1, { ...metadata, adapterVersion: longAdapterA }),
      safe(e2(), { ...metadata, adapterVersion: longAdapterA }),
      safe(e3(), { ...metadata, adapterVersion: longAdapterA }),
    ]);
    const firstBundle = first.effects.find((entry) => entry.kind === "bundle");
    expect(firstBundle?.kind).toBe("bundle");
    if (firstBundle?.kind !== "bundle") return;
    expect(firstBundle.bundle.bundleId).toMatch(/^bundle_[a-f0-9]{64}$/u);
    expect(first.state.status).toBe("FINALIZED");
    expect(
      first.effects.some(
        (entry) => entry.kind === "ignored" && entry.reason === "control_character_in_identity",
      ),
    ).toBe(false);

    const second = sequence([
      safe(e1, { ...metadata, adapterVersion: longAdapterB }),
      safe(e2(), { ...metadata, adapterVersion: longAdapterB }),
      safe(e3(), { ...metadata, adapterVersion: longAdapterB }),
    ]);
    const secondBundle = second.effects.find((entry) => entry.kind === "bundle");
    expect(secondBundle?.kind).toBe("bundle");
    if (secondBundle?.kind !== "bundle") return;
    expect(secondBundle.bundle.bundleId).not.toBe(firstBundle.bundle.bundleId);
    expect(secondBundle.bundle.bundleId).toMatch(/^bundle_[a-f0-9]{64}$/u);
  });
});

describe("reducer input alias conflict handling", () => {
  it("emits unsupported_v3_payload when safe_evidence aliases disagree", () => {
    const e0Hint: SafeEvidence = {
      schemaVersion: 1,
      evidenceId: "e0-conflict",
      platform: "leetcode",
      tier: "E0",
      kind: "ui_hint",
      receivedAt: "2026-07-24T12:00:00.500Z",
      tabId: 1,
      frameId: 0,
      documentId: "doc-a",
      adapterVersion: "adapter-a@1",
      problemExternalId: "two-sum",
    };
    const initial = createCaptureStateMachineState(fixedNow);
    const conflictInput: CaptureReducerInput = {
      kind: "safe_evidence",
      evidence: e0Hint,
      value: e2(),
    };
    const result = reduceCaptureState(initial, conflictInput, fixedNow);
    expect(result.effects).toEqual([
      {
        kind: "ignored",
        reason: "unsupported_v3_payload",
        observedAt: "2026-07-24T12:30:00.000Z",
      },
    ]);
    expect(result.state.records).toEqual(initial.records);
    expect(result.state.status).toBe(initial.status);
  });

  it("still mutates when alias fields deep-equal", () => {
    const first = reduce(createCaptureStateMachineState(fixedNow), safe(e1));
    const conflictInput: CaptureReducerInput = {
      kind: "safe_evidence",
      evidence: e2(),
      value: e2(),
    };
    const result = reduce(first.state, conflictInput);
    expect(result.state.status).toBe("SUBMISSION_CONFIRMED");
    expect(result.state.waitingCount).toBe(1);
  });

  it("emits unsupported_v3_payload when V3 aliases disagree", () => {
    const initial = createCaptureStateMachineState(fixedNow);
    const conflictInput: CaptureReducerInput = {
      kind: "v3_session_started",
      event: v3Started({ captureSessionId: "session-a" }),
      value: v3Started({ captureSessionId: "session-other" }),
    };
    const result = reduceCaptureState(initial, conflictInput, fixedNow);
    expect(result.effects).toEqual([
      {
        kind: "ignored",
        reason: "unsupported_v3_payload",
        observedAt: "2026-07-24T12:30:00.000Z",
      },
    ]);
    expect(result.state.records).toEqual(initial.records);
    expect(result.state.session).toBe(initial.session);
  });

  it("emits unsupported_v3_payload when correlator_correlated aliases disagree", () => {
    const initial = createCaptureStateMachineState(fixedNow);
    const conflictInput: CaptureReducerInput = {
      kind: "correlator_correlated",
      result: correlatedResult(),
      correlation: { ...correlatedResult(), matchedE1: { ...e1, evidenceId: "different" } },
    };
    const result = reduceCaptureState(initial, conflictInput, fixedNow);
    expect(result.effects).toEqual([
      {
        kind: "ignored",
        reason: "unsupported_v3_payload",
        observedAt: "2026-07-24T12:30:00.000Z",
      },
    ]);
    expect(result.state.records).toEqual(initial.records);
  });

  it("emits identity_mismatch when a correlator_correlated result disagrees with hand-built matchedE1+summary", () => {
    const initial = createCaptureStateMachineState(fixedNow);
    const canonical = correlatedResult();
    const conflictInput: CaptureReducerInput = {
      kind: "correlator_correlated",
      result: canonical,
      matchedE1: { ...e1, requestId: "request-conflicting" },
      summary: canonical.summary,
    };
    const result = reduceCaptureState(initial, conflictInput, fixedNow);
    expect(result.effects).toEqual([
      {
        kind: "ignored",
        reason: "identity_mismatch",
        observedAt: "2026-07-24T12:30:00.000Z",
      },
    ]);
    expect(result.state.records).toEqual(initial.records);
    expect(result.state.status).toBe(initial.status);
    expect(result.state.submissionKey).toBeNull();
  });

  it("accepts a correlator_correlated result that matches hand-built matchedE1+summary", () => {
    const initial = createCaptureStateMachineState(fixedNow);
    const canonical = correlatedResult();
    const result = reduceCaptureState(initial, {
      kind: "correlator_correlated",
      result: canonical,
      matchedE1: canonical.matchedE1,
      summary: canonical.summary,
      metadata,
    }, fixedNow);
    expect(result.effects.some((entry) => entry.kind === "ignored")).toBe(false);
    expect(result.state.records.length).toBeGreaterThan(0);
  });
});

function e0Fixture(): SafeEvidence {
  return {
    schemaVersion: 1,
    evidenceId: "e0-noop",
    platform: "leetcode",
    tier: "E0",
    kind: "ui_hint",
    receivedAt: "2026-07-24T12:00:00.500Z",
    tabId: 1,
    frameId: 0,
    documentId: "doc-a",
    adapterVersion: "adapter-a@1",
    problemExternalId: "two-sum",
  };
}
