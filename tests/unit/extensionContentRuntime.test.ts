import { describe, expect, it } from "vitest";
import {
  createCaptureContentRuntime,
  type CaptureContentRuntime,
} from "@/extension/src/contentRuntime";
import type { CaptureIdKind } from "@/extension/src/captureSession";
import type {
  DetectedProblem,
  DetectedVerdict,
} from "@/extension/src/platforms";
import type { CaptureEvent } from "@/lib/capture/protocol";

const twoSum: DetectedProblem = {
  platform: "leetcode",
  problemExternalId: "two-sum",
  problemTitle: "Two Sum",
  canonicalUrl: "https://leetcode.com/problems/two-sum/",
};

const twoSumSubmissions: DetectedProblem = {
  ...twoSum,
  canonicalUrl: "https://leetcode.com/problems/two-sum/submissions/",
};

const validParentheses: DetectedProblem = {
  platform: "leetcode",
  problemExternalId: "valid-parentheses",
  problemTitle: "Valid Parentheses",
  canonicalUrl: "https://leetcode.com/problems/valid-parentheses/",
};

type RuntimeHarness = {
  readonly runtime: CaptureContentRuntime;
  readonly events: CaptureEvent[];
  readonly setDetected: (value: DetectedProblem | null) => void;
  readonly setVerdict: (value: DetectedVerdict | null) => void;
};

function createHarness(): RuntimeHarness {
  let detected: DetectedProblem | null = twoSum;
  let verdict: DetectedVerdict | null = null;
  let tick = 0;
  const counts = new Map<CaptureIdKind, number>();
  const events: CaptureEvent[] = [];
  const runtime = createCaptureContentRuntime({
    context: { installationId: "installation_1" },
    detectProblem: () => detected,
    detectVerdict: () => verdict,
    sendEvent: (event) => events.push(event),
    now: () => {
      tick += 1;
      return `2026-07-14T04:${String(tick).padStart(2, "0")}:00.000Z`;
    },
    createId: (kind) => {
      const next = (counts.get(kind) ?? 0) + 1;
      counts.set(kind, next);
      return `${kind}_${next}`;
    },
  });

  return {
    runtime,
    events,
    setDetected: (value) => {
      detected = value;
    },
    setVerdict: (value) => {
      verdict = value;
    },
  };
}

describe("capture content runtime", () => {
  it("scans an already-visible verdict on initial startup", () => {
    const harness = createHarness();
    harness.setVerdict({ verdict: "Accepted" });

    harness.runtime.start();

    expect(harness.events.map((event) => event.type)).toEqual([
      "SESSION_STARTED",
      "VERDICT_OBSERVED",
    ]);
  });

  it("suppresses stale verdict after a location event changes problems", () => {
    const harness = createHarness();
    harness.runtime.start();
    harness.setDetected(validParentheses);
    harness.setVerdict({ verdict: "Wrong Answer" });

    harness.runtime.locationObserved();
    harness.runtime.documentMutated();

    expect(harness.events.slice(-2).map((event) => event.type)).toEqual([
      "SESSION_ENDED",
      "SESSION_STARTED",
    ]);
    expect(
      harness.events.some(
        (event) => event.type === "VERDICT_OBSERVED"
          && event.problemExternalId === "valid-parentheses",
      ),
    ).toBe(false);

    harness.runtime.documentMutated();
    expect(harness.events.at(-1)).toMatchObject({
      type: "VERDICT_OBSERVED",
      problemExternalId: "valid-parentheses",
    });
  });

  it("suppresses stale verdict when a mutation first observes the new problem", () => {
    const harness = createHarness();
    harness.runtime.start();
    harness.setDetected(validParentheses);
    harness.setVerdict({ verdict: "Wrong Answer" });

    harness.runtime.documentMutated();

    expect(harness.events.at(-1)).toMatchObject({ type: "SESSION_STARTED" });
    expect(harness.events).toHaveLength(3);

    harness.runtime.documentMutated();
    expect(harness.events.at(-1)).toMatchObject({
      type: "VERDICT_OBSERVED",
      problemExternalId: "valid-parentheses",
    });
  });

  it("keeps the session across same-problem route observations", () => {
    const harness = createHarness();
    harness.runtime.start();
    const sessionId = harness.runtime.currentState().active?.captureSessionId;
    harness.setDetected(twoSumSubmissions);

    harness.runtime.locationObserved();

    expect(harness.events).toHaveLength(1);
    expect(harness.runtime.currentState().active?.captureSessionId).toBe(
      sessionId,
    );
  });

  it("uses a submission as current-page evidence after navigation", () => {
    const harness = createHarness();
    harness.runtime.start();
    harness.setDetected(validParentheses);

    harness.runtime.locationObserved();
    harness.runtime.submissionObserved();
    harness.setVerdict({ verdict: "Accepted" });
    harness.runtime.documentMutated();

    expect(harness.events.slice(-2)).toMatchObject([
      {
        type: "SUBMISSION_OBSERVED",
        problemExternalId: "valid-parentheses",
      },
      {
        type: "VERDICT_OBSERVED",
        problemExternalId: "valid-parentheses",
      },
    ]);
  });

  it("emits nothing on an unsupported route after closing its session", () => {
    const harness = createHarness();
    harness.runtime.start();
    harness.setDetected(null);

    harness.runtime.locationObserved();
    const eventCount = harness.events.length;
    harness.runtime.submissionObserved();
    harness.runtime.documentMutated();

    expect(harness.events.at(-1)).toMatchObject({
      type: "SESSION_ENDED",
      payload: { endReason: "spa_navigation" },
    });
    expect(harness.events).toHaveLength(eventCount);
  });

  it("pagehide ends once and pageshow starts a fresh session without a verdict", () => {
    const harness = createHarness();
    harness.runtime.start();
    harness.runtime.pageHidden();
    harness.runtime.pageHidden();
    harness.setVerdict({ verdict: "Accepted" });

    harness.runtime.pageShown();

    expect(harness.events.map((event) => event.type)).toEqual([
      "SESSION_STARTED",
      "SESSION_ENDED",
      "SESSION_STARTED",
    ]);
    expect(harness.events.at(-1)).toMatchObject({
      captureSessionId: "session_2",
    });

    harness.runtime.documentMutated();
    expect(harness.events.at(-1)).toMatchObject({
      type: "VERDICT_OBSERVED",
      captureSessionId: "session_2",
    });
  });
});
