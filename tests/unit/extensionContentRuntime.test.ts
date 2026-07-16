import { describe, expect, it } from "vitest";
import { createCaptureContentRuntime, type CaptureContentRuntime } from "@/extension/src/contentRuntime";
import type { CaptureIdKind } from "@/extension/src/captureSession";
import type { DetectedProblem, DetectedVerdict } from "@/extension/src/platforms";
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

const atcoderAgc040dTask: DetectedProblem = {
  platform: "atcoder",
  problemExternalId: "agc040_d",
  problemTitle: "D",
  canonicalUrl: "https://atcoder.jp/contests/agc040/tasks/agc040_d",
};

const atcoderAgc040dSubmission: DetectedProblem = {
  platform: "atcoder",
  problemExternalId: "agc040_d",
  problemTitle: "D - Balance Beam",
  canonicalUrl: "https://atcoder.jp/contests/agc040/tasks/agc040_d",
};

const atcoderAbc164e: DetectedProblem = {
  platform: "atcoder",
  problemExternalId: "abc164_e",
  problemTitle: "E",
  canonicalUrl: "https://atcoder.jp/contests/abc164/tasks/abc164_e",
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
    context: { installationId: "installation_1", captureEnabled: true, provenanceLevel: "extension_unpaired" },
    detectProblem: () => detected,
    detectVerdict: () => verdict,
    sendEvent: (event) => events.push(event),
    now: () => { tick += 1; return `2026-07-14T04:${String(tick).padStart(2, "0")}:00.000Z`; },
    createId: (kind) => { const next = (counts.get(kind) ?? 0) + 1; counts.set(kind, next); return `${kind}_${next}`; },
  });
  return { runtime, events, setDetected: (value) => { detected = value; }, setVerdict: (value) => { verdict = value; } };
}

function getSubmissionId(event: CaptureEvent): string | undefined {
  return event.type === "SUBMISSION_OBSERVED" ? event.submissionId : undefined;
}

describe("capture content runtime", () => {
  it("scans an already-visible verdict on initial startup", () => {
    const harness = createHarness();
    harness.setVerdict({ verdict: "Accepted" });
    harness.runtime.start();
    expect(harness.events.map((e) => e.type)).toEqual(["SESSION_STARTED", "VERDICT_OBSERVED"]);
  });

  it("suppresses stale verdict after a location event changes problems", () => {
    const harness = createHarness();
    harness.runtime.start();
    harness.setDetected(validParentheses);
    harness.setVerdict({ verdict: "Wrong Answer" });
    harness.runtime.locationObserved();
    harness.runtime.documentMutated();
    expect(harness.events.slice(-2).map((e) => e.type)).toEqual(["SESSION_ENDED", "SESSION_STARTED"]);
    expect(harness.events.some((e) => e.type === "VERDICT_OBSERVED" && e.problemExternalId === "valid-parentheses")).toBe(false);
    harness.runtime.documentMutated();
    expect(harness.events.at(-1)).toMatchObject({ type: "VERDICT_OBSERVED", problemExternalId: "valid-parentheses" });
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
    expect(harness.events.at(-1)).toMatchObject({ type: "VERDICT_OBSERVED", problemExternalId: "valid-parentheses" });
  });

  it("keeps the session across same-problem route observations", () => {
    const harness = createHarness();
    harness.runtime.start();
    const sessionId = harness.runtime.currentState().active?.captureSessionId;
    harness.setDetected(twoSumSubmissions);
    harness.runtime.locationObserved();
    expect(harness.events).toHaveLength(1);
    expect(harness.runtime.currentState().active?.captureSessionId).toBe(sessionId);
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
      { type: "SUBMISSION_OBSERVED", problemExternalId: "valid-parentheses" },
      { type: "VERDICT_OBSERVED", problemExternalId: "valid-parentheses" },
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
    expect(harness.events.at(-1)).toMatchObject({ type: "SESSION_ENDED", payload: { endReason: "spa_navigation" } });
    expect(harness.events).toHaveLength(eventCount);
  });

  it("pagehide ends once and pageshow starts a fresh session without a verdict", () => {
    const harness = createHarness();
    harness.runtime.start();
    harness.runtime.pageHidden();
    harness.runtime.pageHidden();
    harness.setVerdict({ verdict: "Accepted" });
    harness.runtime.pageShown();
    expect(harness.events.map((e) => e.type)).toEqual(["SESSION_STARTED", "SESSION_ENDED", "SESSION_STARTED"]);
    expect(harness.events.at(-1)).toMatchObject({ captureSessionId: "session_2" });
    harness.runtime.documentMutated();
    expect(harness.events.at(-1)).toMatchObject({ type: "VERDICT_OBSERVED", captureSessionId: "session_2" });
  });

  // T5.1: atcoder same-identity task→submission with submit-click, Accepted verdict
  it("atcoder: task→submit-click→same-identity submission page keeps one session and carries submission ID into verdict", () => {
    const { runtime, events, setDetected, setVerdict } = createHarness();
    setDetected(atcoderAgc040dTask);
    runtime.start();
    runtime.submissionObserved();
    const subId = getSubmissionId(events[1]);
    expect(subId).toBe("submission_1");
    setDetected(atcoderAgc040dSubmission);
    runtime.locationObserved();
    expect(runtime.currentState().active?.captureSessionId).toBe("session_1");
    expect(events.map((e) => e.type)).toEqual(["SESSION_STARTED", "SUBMISSION_OBSERVED"]);
    setVerdict({ verdict: "Accepted" });
    runtime.documentMutated();
    expect(events.map((e) => e.type)).toEqual(["SESSION_STARTED", "SUBMISSION_OBSERVED", "VERDICT_OBSERVED"]);
    expect(events[2]).toMatchObject({
      type: "VERDICT_OBSERVED",
      platform: "atcoder",
      problemExternalId: "agc040_d",
      canonicalUrl: "https://atcoder.jp/contests/agc040/tasks/agc040_d",
      captureSessionId: "session_1",
      submissionId: "submission_1",
    });
  });

  // T5.2: atcoder direct-open submission page with visible Accepted
  it("atcoder: direct-open submission page with visible Accepted starts one session and one verdict-created submission", () => {
    const { runtime, events, setDetected, setVerdict } = createHarness();
    setDetected(atcoderAgc040dSubmission);
    setVerdict({ verdict: "Accepted" });
    runtime.start();
    expect(events.map((e) => e.type)).toEqual(["SESSION_STARTED", "VERDICT_OBSERVED"]);
    expect(events[0]).toMatchObject({ type: "SESSION_STARTED", platform: "atcoder", problemExternalId: "agc040_d" });
    expect(events[1]).toMatchObject({
      type: "VERDICT_OBSERVED",
      platform: "atcoder",
      problemExternalId: "agc040_d",
      canonicalUrl: "https://atcoder.jp/contests/agc040/tasks/agc040_d",
      captureSessionId: "session_1",
      submissionId: "submission_1",
    });
    expect(runtime.currentState().active?.activeSubmissionId).toBe("submission_1");
  });

  // T5.3: atcoder unresolvable submission page
  it("atcoder: unresolvable submission page leaves no active session before verdict", () => {
    const { runtime, events, setDetected, setVerdict } = createHarness();
    setDetected(atcoderAgc040dTask);
    runtime.start();
    expect(events.at(-1)).toMatchObject({ type: "SESSION_STARTED", problemExternalId: "agc040_d" });
    setDetected(null);
    setVerdict({ verdict: "Accepted" });
    runtime.locationObserved();
    expect(events.at(-1)).toMatchObject({ type: "SESSION_ENDED", payload: { endReason: "spa_navigation" } });
    expect(runtime.currentState().active).toBeUndefined();
    runtime.documentMutated();
    expect(events).toHaveLength(2);
    runtime.documentMutated();
    expect(events).toHaveLength(2);
    runtime.submissionObserved();
    expect(events).toHaveLength(2);
  });

  // T5.4: atcoder mismatched submission identity
  it("atcoder: mismatched submission identity ends old session and attributes verdict to correct problem only", () => {
    const { runtime, events, setDetected, setVerdict } = createHarness();
    setDetected(atcoderAgc040dTask);
    runtime.start();
    runtime.submissionObserved();
    const oldSubId = getSubmissionId(events[1]);
    expect(oldSubId).toBe("submission_1");
    setDetected(atcoderAbc164e);
    runtime.locationObserved();
    expect(events.map((e) => e.type)).toEqual(["SESSION_STARTED", "SUBMISSION_OBSERVED", "SESSION_ENDED", "SESSION_STARTED"]);
    expect(events[2]).toMatchObject({ type: "SESSION_ENDED", captureSessionId: "session_1", payload: { endReason: "spa_navigation" } });
    expect(events[3]).toMatchObject({ type: "SESSION_STARTED", problemExternalId: "abc164_e", captureSessionId: "session_2" });
    expect(runtime.currentState().active?.captureSessionId).toBe("session_2");
    expect(runtime.currentState().active?.activeSubmissionId).toBeUndefined();
    setVerdict({ verdict: "Accepted" });
    runtime.documentMutated();
    expect(events).toHaveLength(4);
    runtime.documentMutated();
    expect(events.map((e) => e.type)).toEqual(["SESSION_STARTED", "SUBMISSION_OBSERVED", "SESSION_ENDED", "SESSION_STARTED", "VERDICT_OBSERVED"]);
    expect(events[4]).toMatchObject({
      type: "VERDICT_OBSERVED",
      platform: "atcoder",
      problemExternalId: "abc164_e",
      captureSessionId: "session_2",
      submissionId: "submission_2",
    });
    expect(events.some((e) => e.type === "VERDICT_OBSERVED" && e.problemExternalId === "agc040_d")).toBe(false);
  });
});
