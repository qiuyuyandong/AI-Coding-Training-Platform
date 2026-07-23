import { describe, expect, it } from "vitest";
import { verdictEventToAttemptUpdate } from "@/lib/capture/events";
import { captureEventFingerprint } from "@/lib/capture/fingerprint";
import {
  CaptureEventSchema,
  type SessionStartedEvent,
  type SubmissionObservedEvent,
  type VerdictObservedEvent,
} from "@/lib/capture/protocol";

const baseEvent = {
  schemaVersion: 2 as const,
  id: "evt_1",
  captureSessionId: "session_1",
  installationId: "installation_1",
  adapterVersion: "leetcode@0.1.0",
  parserVersion: "verdict@0.1.0",
  pageOrigin: "https://leetcode.com",
  provenanceLevel: "extension_unpaired" as const,
  platform: "leetcode" as const,
  problemExternalId: "two-sum",
  problemTitle: "Two Sum",
  canonicalUrl: "https://leetcode.com/problems/two-sum/",
  occurredAt: "2026-07-14T00:00:00.000Z",
};

function sessionStartedEvent(): SessionStartedEvent {
  return {
    ...baseEvent,
    type: "SESSION_STARTED",
    payload: { source: "content_script" },
  };
}

function submissionObservedEvent(): SubmissionObservedEvent {
  return {
    ...baseEvent,
    id: "evt_submission_1",
    type: "SUBMISSION_OBSERVED",
    submissionId: "submission_1",
    payload: { action: "submit_clicked" },
  };
}

function verdictObservedEvent(
  overrides: Partial<VerdictObservedEvent> = {},
): VerdictObservedEvent {
  return {
    ...baseEvent,
    id: "evt_verdict_1",
    type: "VERDICT_OBSERVED",
    submissionId: "submission_1",
    payload: { verdict: "Accepted", language: "C++" },
    ...overrides,
  };
}

describe("CaptureEventSchema V2", () => {
  it("accepts all V2 event variants", () => {
    const events = [
      sessionStartedEvent(),
      submissionObservedEvent(),
      verdictObservedEvent(),
      {
        ...baseEvent,
        id: "evt_end_1",
        type: "SESSION_ENDED",
        payload: { endReason: "pagehide" },
      },
    ];

    expect(events.map((event) => CaptureEventSchema.parse(event).type)).toEqual([
      "SESSION_STARTED",
      "SUBMISSION_OBSERVED",
      "VERDICT_OBSERVED",
      "SESSION_ENDED",
    ]);
  });

  it("rejects V1 events", () => {
    expect(() =>
      CaptureEventSchema.parse({
        id: "evt_v1",
        type: "PAGE_DETECTED",
        platform: "leetcode",
        problemExternalId: "two-sum",
        problemTitle: "Two Sum",
        canonicalUrl: "https://leetcode.com/problems/two-sum/",
        occurredAt: "2026-07-14T00:00:00.000Z",
        payload: {},
      }),
    ).toThrow();
  });

  it("rejects submission IDs on session-only events", () => {
    expect(() =>
      CaptureEventSchema.parse({
        ...sessionStartedEvent(),
        submissionId: "submission_1",
      }),
    ).toThrow();
  });

  it("requires submission IDs on submission events", () => {
    const { submissionId: omitted, ...withoutSubmissionId } = submissionObservedEvent();
    expect(omitted).toBe("submission_1");
    expect(() => CaptureEventSchema.parse(withoutSubmissionId)).toThrow();
  });

  it("requires a non-empty verdict", () => {
    expect(() =>
      CaptureEventSchema.parse(
        verdictObservedEvent({ payload: { verdict: "" } }),
      ),
    ).toThrow();
  });
});

describe("capture event fingerprint", () => {
  it("is stable across payload key ordering", () => {
    const first = verdictObservedEvent();
    const reordered = verdictObservedEvent({
      payload: { language: "C++", verdict: "Accepted" },
    });

    expect(captureEventFingerprint(first)).toBe(captureEventFingerprint(reordered));
    expect(captureEventFingerprint(first)).toMatch(/^[a-f0-9]{64}$/u);
  });

  it("changes when the normalized payload changes", () => {
    expect(captureEventFingerprint(verdictObservedEvent())).not.toBe(
      captureEventFingerprint(
        verdictObservedEvent({ payload: { verdict: "Wrong Answer", language: "C++" } }),
      ),
    );
  });
});

describe("verdictEventToAttemptUpdate", () => {
  it("classifies accepted verdicts", () => {
    expect(verdictEventToAttemptUpdate(verdictObservedEvent())).toEqual({
      result: "passed",
      verdict: "Accepted",
      language: "C++",
      endedAt: "2026-07-14T00:00:00.000Z",
    });
  });

  it("classifies runtime-like verdicts as partial", () => {
    expect(
      verdictEventToAttemptUpdate(
        verdictObservedEvent({ payload: { verdict: "Time Limit Exceeded" } }),
      ),
    ).toEqual({
      result: "partial",
      verdict: "Time Limit Exceeded",
      endedAt: "2026-07-14T00:00:00.000Z",
    });
  });

  it("classifies judge failures as stuck and unknown final failures as failed", () => {
    expect(verdictEventToAttemptUpdate(
      verdictObservedEvent({ payload: { verdict: "Judge Error" } }),
    ).result).toBe("stuck");
    expect(verdictEventToAttemptUpdate(
      verdictObservedEvent({ payload: { verdict: "Other Failure" } }),
    ).result).toBe("failed");
  });

  it("uses an explicit detector result", () => {
    expect(
      verdictEventToAttemptUpdate(
        verdictObservedEvent({
          payload: { verdict: "Partially Accepted", result: "partial" },
        }),
      ).result,
    ).toBe("partial");
  });
});
