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
  readonly markExactResultPage: (value: boolean) => void;
};

function createHarness(): Harness {
  let detected: DetectedProblem | null = twoSum;
  let verdict: string | null = null;
  let exact = false;
  let tick = 0;
  const runtime = createCaptureContentRuntime({
    detectProblem: () => detected,
    detectVerdict: () => ({ verdict, sourceDocumentId: "document_1" }),
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

  it("navigation away prevents later verdict output", () => {
    const harness = createHarness();
    harness.runtime.start();
    harness.setDetected(null);
    harness.runtime.locationObserved();
    harness.setVerdict("Accepted");

    expect(harness.runtime.documentMutated()).toEqual([]);
  });
});
