import { describe, expect, it } from "vitest";
import {
  CaptureEventSchema,
  pageDetectedEventToAttemptDraft,
  submissionEventToAttemptUpdate,
  type CaptureEvent,
} from "@/lib/capture/events";

function event(overrides: Partial<CaptureEvent> = {}): CaptureEvent {
  return {
    id: "evt_1",
    type: "PAGE_DETECTED",
    platform: "leetcode",
    problemExternalId: "two-sum",
    problemTitle: "Two Sum",
    canonicalUrl: "https://leetcode.com/problems/two-sum/",
    occurredAt: "2026-07-06T00:00:00.000Z",
    payload: {},
    ...overrides,
  };
}

describe("CaptureEventSchema", () => {
  it("accepts a page detected event", () => {
    const parsed = CaptureEventSchema.parse({
      id: "evt_1",
      type: "PAGE_DETECTED",
      platform: "leetcode",
      problemExternalId: "two-sum",
      problemTitle: "Two Sum",
      canonicalUrl: "https://leetcode.com/problems/two-sum/",
      occurredAt: "2026-07-05T00:00:00.000Z",
      payload: { source: "content_script" },
    });

    expect(parsed.type).toBe("PAGE_DETECTED");
  });
});

describe("capture event attempt conversion", () => {
  it("creates attempt drafts from page detection events", () => {
    const draft = pageDetectedEventToAttemptDraft(event());

    expect(draft).toEqual({
      result: "draft",
      platform: "leetcode",
      problemExternalId: "two-sum",
      problemTitle: "Two Sum",
      canonicalUrl: "https://leetcode.com/problems/two-sum/",
      startedAt: "2026-07-06T00:00:00.000Z",
    });
  });

  it("marks accepted verdicts as passed", () => {
    const update = submissionEventToAttemptUpdate(
      event({ type: "VERDICT_UPDATED", payload: { verdict: "Accepted", language: "TypeScript" } }),
    );

    expect(update).toEqual({
      result: "passed",
      verdict: "Accepted",
      language: "TypeScript",
      endedAt: "2026-07-06T00:00:00.000Z",
    });
  });

  it("marks non-accepted verdicts as failed", () => {
    const update = submissionEventToAttemptUpdate(
      event({ type: "SUBMISSION_DETECTED", payload: { verdict: "Wrong Answer" } }),
    );

    expect(update).toEqual({
      result: "failed",
      verdict: "Wrong Answer",
      endedAt: "2026-07-06T00:00:00.000Z",
    });
  });

  it("marks runtime-like verdicts as partial progress", () => {
    const update = submissionEventToAttemptUpdate(
      event({ type: "VERDICT_UPDATED", payload: { verdict: "Time Limit Exceeded" } }),
    );

    expect(update).toEqual({
      result: "partial",
      verdict: "Time Limit Exceeded",
      endedAt: "2026-07-06T00:00:00.000Z",
    });
  });

  it("uses an explicit payload result when the detector supplies one", () => {
    const update = submissionEventToAttemptUpdate(
      event({ type: "VERDICT_UPDATED", payload: { verdict: "Partially Accepted", result: "partial" } }),
    );

    expect(update).toEqual({
      result: "partial",
      verdict: "Partially Accepted",
      endedAt: "2026-07-06T00:00:00.000Z",
    });
  });

  it("uses Unknown when a verdict payload is missing", () => {
    const update = submissionEventToAttemptUpdate(
      event({ type: "VERDICT_UPDATED", payload: {} }),
    );

    expect(update).toEqual({
      result: "failed",
      verdict: "Unknown",
      endedAt: "2026-07-06T00:00:00.000Z",
    });
  });
});
