import { describe, expect, it } from "vitest";

import { createCaptureContentRuntime } from "@/extension/src/contentRuntime";
import {
  deliverLeetCodeSubmitEpochControl,
  isSubmitEpochControlResponse,
  parseLeetCodeSubmitEpochControlMessage,
  persistThenDeliverSubmitEpochConfirmed,
  type LeetCodeSubmitEpochControlMessage,
  type SubmitEpochDiagnostic,
} from "@/extension/src/submitEpochControl";
import type { DetectedProblem } from "@/extension/src/platforms";
import { detectVerdictObservationFromDocument } from "@/extension/src/platforms";

const problem: DetectedProblem = {
  platform: "leetcode",
  problemExternalId: "two-sum",
  problemTitle: "Two Sum",
  canonicalUrl: "https://leetcode.cn/problems/two-sum/",
};

const otherProblem: DetectedProblem = {
  platform: "leetcode",
  problemExternalId: "add-two-numbers",
  problemTitle: "Add Two Numbers",
  canonicalUrl: "https://leetcode.cn/problems/add-two-numbers/",
};

const started = (requestId: string, receivedAt = "2026-08-10T00:00:00.600Z") => ({
  type: "LEETCODE_SUBMIT_EPOCH_STARTED",
  schemaVersion: 1,
  platform: "leetcode",
  problemExternalId: "two-sum",
  submitRequestId: requestId,
  receivedAt,
} as const);

const confirmed = (
  requestId: string,
  confirmedAt = "2026-08-10T00:00:01.000Z",
  actionObservedAt?: string,
  baselineSubmissionIds: readonly string[] = ["cn/739040550"],
) => ({
  type: "LEETCODE_SUBMIT_EPOCH_CONFIRMED",
  schemaVersion: 1,
  platform: "leetcode",
  problemExternalId: "two-sum",
  submitRequestId: requestId,
  confirmedAt,
  ...(actionObservedAt === undefined ? {} : { actionObservedAt, baselineSubmissionIds }),
} as const);

function createHarness() {
  let now = "2026-08-10T00:00:00.500Z";
  let detected: DetectedProblem | null = problem;
  let verdict: string | null = "Accepted";
  let surface: Element | null = document.createElement("div");
  const runtime = createCaptureContentRuntime({
    detectProblem: () => detected,
    detectVerdict: () => ({ verdict, verdictSurface: surface }),
    exactResultPage: () => false,
    now: () => now,
  });
  runtime.start();
  return {
    runtime,
    setNow: (value: string) => { now = value; },
    setDetected: (value: DetectedProblem | null) => { detected = value; },
    setVerdict: (value: string | null) => { verdict = value; },
    setSurface: (value: Element | null) => { surface = value; },
  };
}

function deliver(runtime: ReturnType<typeof createHarness>["runtime"], message: LeetCodeSubmitEpochControlMessage | unknown): readonly unknown[] {
  return runtime.controlMessageReceived(message);
}

describe("LeetCode submit epoch control plane", () => {
  it("strictly rejects unknown keys, control characters, and non-canonical timestamps", () => {
    expect(parseLeetCodeSubmitEpochControlMessage({
      ...started("request-1"),
      extra: true,
    }).ok).toBe(false);
    expect(parseLeetCodeSubmitEpochControlMessage({
      ...started("request-1"),
      problemExternalId: "two-sum\n",
    }).ok).toBe(false);
    expect(parseLeetCodeSubmitEpochControlMessage({
      ...started("request-1"),
      receivedAt: "2026-02-29T00:00:00.000Z",
    }).ok).toBe(false);
    expect(parseLeetCodeSubmitEpochControlMessage(confirmed(
      "request-result",
      "2026-08-10T00:00:02.000Z",
      "2026-08-10T00:00:00.500Z",
    )).ok).toBe(true);
    expect(parseLeetCodeSubmitEpochControlMessage(confirmed(
      "request-result",
      "2026-08-10T00:00:02.000Z",
      "2026-08-10T00:00:03.000Z",
    )).ok).toBe(false);
    const resultRoot = confirmed(
      "request-result",
      "2026-08-10T00:00:02.000Z",
      "2026-08-10T00:00:00.500Z",
    );
    const { baselineSubmissionIds: _baselineSubmissionIds, ...missingBaseline } = resultRoot;
    expect(_baselineSubmissionIds).toEqual(["cn/739040550"]);
    expect(parseLeetCodeSubmitEpochControlMessage(missingBaseline).ok).toBe(false);
    expect(parseLeetCodeSubmitEpochControlMessage({
      ...resultRoot,
      baselineSubmissionIds: ["cn/739040550", "cn/739040550"],
    }).ok).toBe(false);
  });

  it("promotes the exact trusted ActionEpoch into a result-root submit epoch", () => {
    const harness = createHarness();
    const historicalSurface = document.createElement("div");
    const freshSurface = document.createElement("div");
    harness.setSurface(historicalSurface);
    const hints = harness.runtime.uiHintObserved();
    expect(hints).toMatchObject([{
      type: "UI_HINT_OBSERVED",
      hint: { observedAt: "2026-08-10T00:00:00.500Z", problemExternalId: "two-sum" },
    }]);
    harness.setSurface(freshSurface);
    expect(harness.runtime.documentMutated()).toEqual([]);
    harness.setNow("2026-08-10T00:00:02.000Z");
    const messages = deliver(harness.runtime, confirmed(
      "result-request-842",
      "2026-08-10T00:00:01.500Z",
      "2026-08-10T00:00:00.500Z",
    ));
    expect(messages).toHaveLength(1);
    expect(messages[0]).toMatchObject({
      type: "VERDICT_CANDIDATE_OBSERVED",
      candidate: { submitRequestId: "result-request-842", verdict: "Accepted" },
    });
    expect(harness.runtime.takeControlDiagnostic()).toBeUndefined();
  });

  it("never promotes a missing, crossed, or baseline-free ActionEpoch", () => {
    const missing = createHarness();
    deliver(missing.runtime, confirmed(
      "result-request-842",
      "2026-08-10T00:00:01.500Z",
      "2026-08-10T00:00:00.500Z",
    ));
    expect(missing.runtime.takeControlDiagnostic()).toBe("epoch_started_missing");

    const crossed = createHarness();
    crossed.runtime.uiHintObserved();
    deliver(crossed.runtime, confirmed(
      "result-request-842",
      "2026-08-10T00:00:01.500Z",
      "2026-08-10T00:00:00.600Z",
    ));
    expect(crossed.runtime.takeControlDiagnostic()).toBe("epoch_identity_conflict");

    let now = "2026-08-10T00:00:00.500Z";
    const baselineFree = createCaptureContentRuntime({
      detectProblem: () => problem,
      detectVerdict: () => null,
      exactResultPage: () => false,
      now: () => now,
    });
    baselineFree.start();
    baselineFree.uiHintObserved();
    now = "2026-08-10T00:00:02.000Z";
    deliver(baselineFree, confirmed(
      "result-request-842",
      "2026-08-10T00:00:01.500Z",
      "2026-08-10T00:00:00.500Z",
    ));
    expect(baselineFree.takeControlDiagnostic()).toBe("epoch_baseline_missing");
  });

  it("rejects a result root when more than one ActionEpoch exists", () => {
    const harness = createHarness();
    harness.runtime.uiHintObserved();
    harness.setNow("2026-08-10T00:00:00.600Z");
    harness.runtime.uiHintObserved();
    harness.setSurface(document.createElement("div"));
    harness.setNow("2026-08-10T00:00:02.000Z");

    expect(deliver(harness.runtime, confirmed(
      "result-request-842",
      "2026-08-10T00:00:01.500Z",
      "2026-08-10T00:00:00.600Z",
    ))).toEqual([]);
    expect(harness.runtime.takeControlDiagnostic()).toBe("epoch_identity_conflict");
  });

  it("rejects an existing result surface without a proven stable-ID baseline", () => {
    const harness = createHarness();
    harness.runtime.uiHintObserved();
    harness.setSurface(document.createElement("div"));
    harness.setNow("2026-08-10T00:00:02.000Z");

    expect(deliver(harness.runtime, confirmed(
      "result-request-842",
      "2026-08-10T00:00:01.500Z",
      "2026-08-10T00:00:00.500Z",
      [],
    ))).toEqual([]);
    expect(harness.runtime.takeControlDiagnostic()).toBe("epoch_baseline_missing");
  });

  it("requires exactly one ActionEpoch for the legacy REST STARTED path", () => {
    const missing = createHarness();
    deliver(missing.runtime, started("request-missing"));
    expect(missing.runtime.takeControlDiagnostic()).toBe("epoch_started_missing");

    // The E0 dedup collapses same-problem hints inside the TTL window into
    // one ActionEpoch, so a same-timestamp seed+click pair arms cleanly.
    const sameTimestamp = createHarness();
    sameTimestamp.runtime.uiHintObserved();
    sameTimestamp.runtime.uiHintObserved();
    deliver(sameTimestamp.runtime, started("request-conflict"));
    expect(sameTimestamp.runtime.takeControlDiagnostic()).toBeUndefined();

    // A different problem owns its own epoch and never conflicts with the
    // requested problem's eligible set.
    const differentProblems = createHarness();
    differentProblems.runtime.uiHintObserved();
    differentProblems.setDetected(otherProblem);
    differentProblems.runtime.uiHintObserved();
    differentProblems.setDetected(problem);
    deliver(differentProblems.runtime, started("request-conflict-two-problems"));
    expect(differentProblems.runtime.takeControlDiagnostic()).toBeUndefined();

    const expired = createHarness();
    expired.runtime.uiHintObserved();
    expired.setNow("2026-08-10T00:05:00.500Z");
    expired.runtime.start();
    deliver(expired.runtime, started("request-expired", "2026-08-10T00:05:00.600Z"));
    expect(expired.runtime.takeControlDiagnostic()).toBe("epoch_started_missing");

    for (const expireThrough of ["location", "mutation"] as const) {
      const actionOnly = createHarness();
      actionOnly.runtime.uiHintObserved();
      actionOnly.setNow("2026-08-10T00:05:00.500Z");
      if (expireThrough === "location") actionOnly.runtime.locationObserved();
      else actionOnly.runtime.documentMutated();
      deliver(actionOnly.runtime, started(
        `request-expired-${expireThrough}`,
        "2026-08-10T00:05:00.600Z",
      ));
      expect(actionOnly.runtime.takeControlDiagnostic()).toBe("epoch_started_missing");
    }
  });

  it("keeps duplicate controls idempotent and conflicts fail closed", () => {
    const harness = createHarness();
    harness.runtime.uiHintObserved();
    expect(deliver(harness.runtime, started("request-1"))).toEqual([]);
    expect(harness.runtime.takeControlDiagnostic()).toBeUndefined();
    expect(deliver(harness.runtime, started("request-1"))).toEqual([]);
    expect(harness.runtime.takeControlDiagnostic()).toBeUndefined();
    deliver(harness.runtime, { ...started("request-1"), problemExternalId: "valid-problem" });
    expect(harness.runtime.takeControlDiagnostic()).toBe("epoch_identity_conflict");
    deliver(harness.runtime, { ...started("request-1"), receivedAt: "2026-08-10T00:00:00.100Z" });
    expect(harness.runtime.takeControlDiagnostic()).toBe("epoch_timestamp_conflict");
  });

  it("rejects E2-before-E1 and timestamp inversion", () => {
    const harness = createHarness();
    deliver(harness.runtime, confirmed("request-1"));
    expect(harness.runtime.takeControlDiagnostic()).toBe("epoch_started_missing");
    harness.runtime.uiHintObserved();
    deliver(harness.runtime, started("request-1"));
    deliver(harness.runtime, confirmed("request-1", "2026-08-09T23:59:59.000Z"));
    expect(harness.runtime.takeControlDiagnostic()).toBe("epoch_timestamp_conflict");
  });

  it("requires a real narrow node replacement and emits once after E2", () => {
    const harness = createHarness();
    const firstSurface = document.createElement("div");
    const secondSurface = document.createElement("div");
    harness.setSurface(firstSurface);
    harness.runtime.uiHintObserved();
    deliver(harness.runtime, started("request-1"));
    harness.setSurface(firstSurface);
    expect(harness.runtime.documentMutated()).toEqual([]);
    harness.setSurface(secondSurface);
    expect(harness.runtime.documentMutated()).toEqual([]);
    harness.setNow("2026-08-10T00:00:02.000Z");
    const messages = deliver(harness.runtime, confirmed("request-1"));
    expect(messages).toHaveLength(1);
    expect(messages[0]).toMatchObject({
      type: "VERDICT_CANDIDATE_OBSERVED",
      candidate: { submitRequestId: "request-1", verdict: "Accepted" },
    });
    const observedAt = messages[0] as { readonly candidate?: { readonly observedAt?: string } };
    expect(Date.parse(observedAt.candidate?.observedAt ?? "")).toBeGreaterThanOrEqual(
      Date.parse("2026-08-10T00:00:01.000Z"),
    );
    expect(deliver(harness.runtime, confirmed("request-1"))).toEqual([]);
  });

  it("makes same-problem epochs exclusive and never revives a superseded A", () => {
    const harness = createHarness();
    const surfaceA = document.createElement("div");
    const surfaceB = document.createElement("div");
    harness.setSurface(surfaceA);
    harness.runtime.uiHintObserved();
    deliver(harness.runtime, started("request-a"));

    // B starts from the same historical surface and takes exclusive
    // ownership; replacing that node is evidence for B only.
    harness.runtime.uiHintObserved();
    deliver(harness.runtime, started("request-b"));
    harness.setSurface(surfaceB);
    expect(harness.runtime.documentMutated()).toEqual([]);

    deliver(harness.runtime, confirmed("request-a"));
    expect(harness.runtime.takeControlDiagnostic()).toBe("epoch_started_missing");
    // A's delayed duplicate STARTED is idempotent and cannot resurrect it.
    expect(deliver(harness.runtime, started("request-a"))).toEqual([]);
    expect(harness.runtime.takeControlDiagnostic()).toBeUndefined();
    deliver(harness.runtime, confirmed("request-a"));
    expect(harness.runtime.takeControlDiagnostic()).toBe("epoch_started_missing");

    harness.setNow("2026-08-10T00:00:02.000Z");
    const bMessages = deliver(harness.runtime, confirmed("request-b"));
    expect(bMessages).toHaveLength(1);
    expect(bMessages[0]).toMatchObject({
      type: "VERDICT_CANDIDATE_OBSERVED",
      candidate: { submitRequestId: "request-b" },
    });
  });

  it("does not treat same-node generic mutation or body identity as proof", () => {
    const harness = createHarness();
    const surface = document.createElement("div");
    harness.setSurface(surface);
    harness.runtime.uiHintObserved();
    deliver(harness.runtime, started("request-1"));
    harness.setVerdict("Accepted");
    expect(harness.runtime.documentMutated()).toEqual([]);
    deliver(harness.runtime, confirmed("request-1"));
    expect(harness.runtime.takeControlDiagnostic()).toBe("epoch_result_surface_unchanged");

    const bodyHarness = createHarness();
    bodyHarness.setSurface(document.body);
    bodyHarness.runtime.uiHintObserved();
    deliver(bodyHarness.runtime, started("request-body"));
    expect(bodyHarness.runtime.takeControlDiagnostic()).toBe("epoch_baseline_missing");
  });

  it("returns the exact first-party selector Element and rejects DTO/wrapper/html surfaces", () => {
    const page = new DOMParser().parseFromString(
      '<div data-e2e-locator="submission-result">Accepted</div>',
      "text/html",
    );
    const selected = page.querySelector('[data-e2e-locator="submission-result"]');
    if (selected === null) throw new Error("selector surface missing");
    const observation = detectVerdictObservationFromDocument("leetcode", page);
    expect(observation?.verdictSurface).toBe(selected);

    let surface: unknown = selected;
    const runtime = createCaptureContentRuntime({
      detectProblem: () => problem,
      detectVerdict: () => ({ verdict: "Accepted", verdictSurface: surface }),
      exactResultPage: () => false,
      now: () => "2026-08-10T00:00:02.000Z",
    });
    runtime.start();
    runtime.uiHintObserved();
    deliver(runtime, started("request-dto", "2026-08-10T00:00:02.100Z"));
    surface = { node: selected };
    expect(runtime.documentMutated()).toEqual([]);
    deliver(runtime, confirmed("request-dto", "2026-08-10T00:00:03.000Z"));
    expect(runtime.takeControlDiagnostic()).toBe("epoch_result_surface_unchanged");

    let genericSurface: Element | null = document.documentElement;
    const genericRuntime = createCaptureContentRuntime({
      detectProblem: () => problem,
      detectVerdict: () => ({ verdict: "Accepted", verdictSurface: genericSurface }),
      exactResultPage: () => false,
      now: () => "2026-08-10T00:00:02.000Z",
    });
    genericRuntime.start();
    genericRuntime.uiHintObserved();
    deliver(genericRuntime, started("request-html", "2026-08-10T00:00:02.100Z"));
    expect(genericRuntime.takeControlDiagnostic()).toBe("epoch_baseline_missing");
    genericSurface = document.body;
    expect(genericRuntime.documentMutated()).toEqual([]);
  });

  it("bounds entries at 32, expires lazily at five minutes, and clears on identity-invalidating navigation", () => {
    const harness = createHarness();
    for (let i = 0; i < 32; i += 1) {
      harness.runtime.uiHintObserved();
      deliver(harness.runtime, started(`request-${i}`));
    }
    harness.runtime.uiHintObserved();
    deliver(harness.runtime, started("request-over-capacity"));
    expect(harness.runtime.takeControlDiagnostic()).toBe("epoch_capacity_exceeded");

    // Capacity rejection must not leave the previous same-problem epoch
    // armed to absorb a later surface transition.
    harness.setSurface(document.createElement("div"));
    expect(harness.runtime.documentMutated()).toEqual([]);
    // A delayed duplicate cannot revive the superseded A marker.
    expect(deliver(harness.runtime, started("request-31"))).toEqual([]);
    expect(harness.runtime.takeControlDiagnostic()).toBeUndefined();
    deliver(harness.runtime, confirmed("request-31"));
    expect(harness.runtime.takeControlDiagnostic()).toBe("epoch_started_missing");

    harness.setNow("2026-08-10T00:05:00.000Z");
    harness.runtime.documentMutated();
    deliver(harness.runtime, confirmed("request-0"));
    expect(harness.runtime.takeControlDiagnostic()).toBe("epoch_started_missing");

    const navigation = createHarness();
    navigation.runtime.uiHintObserved();
    deliver(navigation.runtime, started("request-nav"));
    navigation.setDetected(null);
    navigation.runtime.locationObserved();
    deliver(navigation.runtime, confirmed("request-nav"));
    expect(navigation.runtime.takeControlDiagnostic()).toBe("epoch_started_missing");
  });

  it("keeps the response closed and identity-free", () => {
    const harness = createHarness();
    deliver(harness.runtime, { type: "LEETCODE_SUBMIT_EPOCH_STARTED" });
    expect(isSubmitEpochControlResponse(harness.runtime.controlMessageResponse())).toBe(true);
    expect(harness.runtime.controlMessageResponse()).toEqual({ ok: true });
  });

  it("delivers exactly once to the exact tab/frame/document target", async () => {
    const calls: Array<{
      readonly tabId: number;
      readonly message: LeetCodeSubmitEpochControlMessage;
      readonly options: Readonly<{ readonly frameId: number; readonly documentId: string }>;
    }> = [];
    const diagnostics: SubmitEpochDiagnostic[] = [];
    const result = await deliverLeetCodeSubmitEpochControl(
      { tabId: 7, frameId: 2, documentId: "document-7" },
      started("request-7"),
      {
        sendMessage: async (tabId, message, options) => {
          calls.push({ tabId, message, options });
          return { ok: true };
        },
        recordDiagnostic: (reason) => { diagnostics.push(reason); },
      },
    );
    expect(result).toBe("delivered");
    expect(calls).toHaveLength(1);
    expect(calls[0]).toEqual({
      tabId: 7,
      message: started("request-7"),
      options: { frameId: 2, documentId: "document-7" },
    });
    expect(diagnostics).toEqual([]);
  });

  it("does not retry/fallback on throw or invalid/diagnostic response", async () => {
    const outcomes: Array<{ readonly response: unknown; readonly expected: SubmitEpochDiagnostic }> = [
      { response: undefined, expected: "epoch_target_delivery_failed" },
      { response: { ok: true, diagnostic: "epoch_started_missing" }, expected: "epoch_target_delivery_failed" },
      { response: { ok: false, diagnostic: "epoch_baseline_missing" }, expected: "epoch_baseline_missing" },
    ];
    for (const outcome of outcomes) {
      let calls = 0;
      const diagnostics: SubmitEpochDiagnostic[] = [];
      const result = await deliverLeetCodeSubmitEpochControl(
        { tabId: 7, frameId: 0, documentId: "document-7" },
        started("request-7"),
        {
          sendMessage: async () => {
            calls += 1;
            return outcome.response;
          },
          recordDiagnostic: (reason) => { diagnostics.push(reason); },
        },
      );
      expect(result).toBe("diagnostic");
      expect(calls).toBe(1);
      expect(diagnostics).toEqual([outcome.expected]);
    }

    let calls = 0;
    const diagnostics: SubmitEpochDiagnostic[] = [];
    const result = await deliverLeetCodeSubmitEpochControl(
      { tabId: 7, frameId: 0, documentId: "document-7" },
      started("request-7"),
      {
        sendMessage: async () => {
          calls += 1;
          throw new Error("delivery failed");
        },
        recordDiagnostic: (reason) => { diagnostics.push(reason); },
      },
    );
    expect(result).toBe("diagnostic");
    expect(calls).toBe(1);
    expect(diagnostics).toEqual(["epoch_target_delivery_failed"]);
  });

  it("does not send CONFIRMED before the persistence effect is complete", async () => {
    let calls = 0;
    const result = await persistThenDeliverSubmitEpochConfirmed({
      persist: async () => false,
      deliver: async () => {
        calls += 1;
      },
    });
    expect(result).toBe("skipped_persistence");
    expect(calls).toBe(0);
  });
});
