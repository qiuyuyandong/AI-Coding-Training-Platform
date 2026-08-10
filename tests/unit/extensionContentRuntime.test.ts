import { describe, expect, it } from "vitest";

import {
  createCaptureContentRuntime,
  type CaptureContentRuntime,
} from "@/extension/src/contentRuntime";
import type { AttemptCaptureRuntimeMessage } from "@/extension/src/attemptCapture";
import type { DetectedProblem } from "@/extension/src/platforms";

const twoSum: DetectedProblem = {
  platform: "leetcode",
  problemExternalId: "two-sum",
  problemTitle: "Two Sum",
  canonicalUrl: "https://leetcode.cn/problems/two-sum/",
};

type Harness = {
  readonly runtime: CaptureContentRuntime;
  readonly setDetected: (value: DetectedProblem | null) => void;
  readonly setVerdict: (value: string | null) => void;
  readonly setVerdictSurface: (value: Element | null) => void;
  readonly markExactResultPage: (value: boolean) => void;
};

type LeetCodeSubmitEpochControlMessage = Readonly<{
  type: "LEETCODE_SUBMIT_EPOCH_STARTED" | "LEETCODE_SUBMIT_EPOCH_CONFIRMED";
  schemaVersion: 1;
  platform: "leetcode";
  problemExternalId: string;
  submitRequestId: string;
  receivedAt?: string;
  confirmedAt?: string;
}>;

function deliverControlMessage(
  runtime: CaptureContentRuntime,
  message: LeetCodeSubmitEpochControlMessage,
): unknown {
  if (!("controlMessageReceived" in runtime)
    || typeof runtime.controlMessageReceived !== "function") {
    throw new Error("expected the reviewed submit-epoch control plane");
  }
  return runtime.controlMessageReceived(message);
}

function createHarness(): Harness {
  let detected: DetectedProblem | null = twoSum;
  let verdict: string | null = null;
  let verdictSurface: Element | null = null;
  let exact = false;
  let tick = 0;
  const detectVerdict = () => ({
    verdict,
    sourceDocumentId: "document_1",
    verdictSurface,
  });
  const runtime = createCaptureContentRuntime({
    detectProblem: () => detected,
    detectVerdict,
    exactResultPage: () => exact,
    now: () => {
      tick += 1;
      return `2026-07-24T00:00:${String(tick).padStart(2, "0")}.000Z`;
    },
    activeDocumentId: "document_1",
  });
  return {
    runtime,
    setDetected: (value) => { detected = value; },
    setVerdict: (value) => { verdict = value; },
    setVerdictSurface: (value) => { verdictSurface = value; },
    markExactResultPage: (value) => { exact = value; },
  };
}

function types(messages: readonly AttemptCaptureRuntimeMessage[]): readonly string[] {
  return messages.map((message) => message.type);
}

describe("V4 Phase 0 capture content runtime", () => {
  it("page lifecycle activity emits no submission message", () => {
    const harness = createHarness();
    const messages = [
      ...harness.runtime.start(),
      ...harness.runtime.locationObserved(),
      ...harness.runtime.documentMutated(),
      ...harness.runtime.pageHidden(),
    ];

    expect(types(messages)).not.toContain("SUBMISSION_INTENT_OBSERVED");
    expect(messages).toHaveLength(0);
  });

  it("a qualifying click produces one E0 hint and no submission intent", () => {
    const harness = createHarness();
    harness.runtime.start();

    expect(harness.runtime.uiHintObserved()).toEqual([{
      type: "UI_HINT_OBSERVED",
      hint: {
        schemaVersion: 1,
        tier: "E0",
        kind: "ui_hint",
        platform: "leetcode",
        problemExternalId: "two-sum",
        observedAt: "2026-07-24T00:00:02.000Z",
      },
    }]);
  });

  it("does not emit a hint outside a supported problem page", () => {
    const harness = createHarness();
    harness.setDetected(null);
    harness.runtime.locationObserved();

    expect(harness.runtime.uiHintObserved()).toEqual([]);
  });

  it("a UI hint cannot create submit causality for a later exact result", () => {
    const harness = createHarness();
    harness.runtime.start();
    harness.runtime.uiHintObserved();
    harness.markExactResultPage(true);
    harness.setVerdict("Accepted");

    const messages = harness.runtime.locationObserved();
    expect(messages).toHaveLength(1);
    expect(messages[0]).toMatchObject({
      type: "VERDICT_CANDIDATE_OBSERVED",
      candidate: { transitionEvidence: "exact_result_document" },
    });
    expect(types(messages)).not.toContain("SUBMISSION_INTENT_OBSERVED");
  });

  it("a direct historical exact result remains a passive candidate", () => {
    const harness = createHarness();
    harness.markExactResultPage(true);
    harness.setVerdict("Time Limit Exceeded");

    expect(harness.runtime.start()[0]).toMatchObject({
      type: "VERDICT_CANDIDATE_OBSERVED",
      candidate: {
        problemExternalId: "two-sum",
        verdict: "Time Limit Exceeded",
        transitionEvidence: "exact_result_document",
      },
    });
  });

  it("RED: emits a new candidate when a same-problem repeat submission keeps the historical verdict text", () => {
    const harness = createHarness();
    const historicalSurface = document.createElement("div");
    const repeatedSubmissionSurface = document.createElement("div");
    harness.runtime.start();

    // Observation 9 first restored a residual Accepted panel after a null
    // phase. That historical transition was observed before the real submit
    // E1 and therefore cannot legally resolve the later submission.
    harness.setVerdict("Accepted");
    harness.setVerdictSurface(historicalSurface);
    const historical = harness.runtime.documentMutated();
    expect(historical).toHaveLength(1);
    expect(historical[0]).toMatchObject({
      type: "VERDICT_CANDIDATE_OBSERVED",
      candidate: {
        verdict: "Accepted",
        observedAt: "2026-07-24T00:00:03.000Z",
        transitionEvidence: "same_document_transition",
      },
    });

    const started = {
      type: "LEETCODE_SUBMIT_EPOCH_STARTED",
      schemaVersion: 1,
      platform: "leetcode",
      problemExternalId: "two-sum",
      submitRequestId: "submit-request-2",
      receivedAt: "2026-07-24T00:00:03.500Z",
    } as const;
    const confirmed = {
      type: "LEETCODE_SUBMIT_EPOCH_CONFIRMED",
      schemaVersion: 1,
      platform: "leetcode",
      problemExternalId: "two-sum",
      submitRequestId: "submit-request-2",
      confirmedAt: "2026-07-24T00:00:04.500Z",
    } as const;

    // Only exact E1 STARTED may arm the epoch and take the stable DOM-node
    // baseline. Duplicate STARTED is idempotent, a generic mutation on the
    // same node is not evidence, and a different request's E2 fails closed.
    expect(deliverControlMessage(harness.runtime, started)).toEqual([]);
    expect(deliverControlMessage(harness.runtime, started)).toEqual([]);
    expect(harness.runtime.documentMutated()).toEqual([]);
    expect(deliverControlMessage(harness.runtime, {
      ...confirmed,
      submitRequestId: "unrelated-request",
    })).toEqual([]);

    // The real result surface then renders the same Accepted text on a
    // distinct, stable DOM node. The post-E1 transition is remembered, but
    // no candidate may exist until exact E2 confirmation arrives.
    harness.setVerdictSurface(repeatedSubmissionSurface);
    expect(harness.runtime.documentMutated()).toEqual([]);

    const repeated = deliverControlMessage(harness.runtime, confirmed);
    expect(Array.isArray(repeated)).toBe(true);
    if (!Array.isArray(repeated)) {
      throw new Error("expected an array of runtime messages");
    }
    expect(repeated).toHaveLength(1);
    const repeatedCandidate = repeated[0];
    if (repeatedCandidate === undefined) {
      throw new Error("expected one post-E1 verdict candidate");
    }
    expect(repeatedCandidate).toMatchObject({
      type: "VERDICT_CANDIDATE_OBSERVED",
      candidate: {
        verdict: "Accepted",
        submitRequestId: "submit-request-2",
        transitionEvidence: "same_document_transition",
      },
    });
    if (repeatedCandidate.type !== "VERDICT_CANDIDATE_OBSERVED") {
      throw new Error("expected a verdict candidate message");
    }
    expect(Date.parse(repeatedCandidate.candidate.observedAt)).toBeGreaterThan(
      Date.parse(started.receivedAt),
    );
    expect(Date.parse(repeatedCandidate.candidate.observedAt)).toBeGreaterThanOrEqual(
      Date.parse(confirmed.confirmedAt),
    );
    expect(deliverControlMessage(harness.runtime, confirmed)).toEqual([]);
  });

  it("navigation away prevents later verdict output", () => {
    const harness = createHarness();
    harness.runtime.start();
    harness.setDetected(null);
    harness.runtime.locationObserved();
    harness.setVerdict("Accepted");

    expect(harness.runtime.documentMutated()).toEqual([]);
  });
});
