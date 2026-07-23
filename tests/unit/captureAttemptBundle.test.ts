import { describe, expect, it } from "vitest";
import {
  CaptureAttemptBundleSchema,
  CaptureAttemptAckSchema,
  buildCaptureAttemptAck,
  type CaptureAttemptBundle,
} from "@/lib/capture/attemptBundle";
import type {
  SessionEndedEvent,
  SessionStartedEvent,
  SubmissionObservedEvent,
  VerdictObservedEvent,
} from "@/lib/capture/protocol";

const base = {
  schemaVersion: 2 as const,
  captureSessionId: "session_bundle_1",
  installationId: "installation_bundle_1",
  adapterVersion: "atomic-bundle@0.1.0",
  parserVersion: "atomic-bundle@0.1.0",
  pageOrigin: "https://leetcode.com",
  provenanceLevel: "extension_paired" as const,
  platform: "leetcode" as const,
  problemExternalId: "two-sum",
  problemTitle: "Two Sum",
  canonicalUrl: "https://leetcode.cn/problems/two-sum/",
};

function startedEvent(): SessionStartedEvent {
  return {
    ...base,
    id: "event_started",
    type: "SESSION_STARTED",
    occurredAt: "2026-07-14T00:00:00.000Z",
    payload: { source: "content_script" },
  };
}

function submittedEvent(
  submissionId: string,
  overrides: Partial<SubmissionObservedEvent> = {},
): SubmissionObservedEvent {
  return {
    ...base,
    id: `event_${submissionId}`,
    type: "SUBMISSION_OBSERVED",
    submissionId,
    occurredAt: "2026-07-14T00:01:00.000Z",
    payload: { action: "submit_clicked" },
    ...overrides,
  };
}

function verdictEvent(
  submissionId: string,
  verdict: string,
  overrides: Partial<VerdictObservedEvent> = {},
): VerdictObservedEvent {
  return {
    ...base,
    id: `event_verdict_${submissionId}`,
    type: "VERDICT_OBSERVED",
    submissionId,
    occurredAt: "2026-07-14T00:02:00.000Z",
    payload: { verdict },
    ...overrides,
  };
}

function endedEvent(overrides: Partial<SessionEndedEvent> = {}): SessionEndedEvent {
  return {
    ...base,
    id: "event_end",
    type: "SESSION_ENDED",
    occurredAt: "2026-07-14T00:03:00.000Z",
    payload: { endReason: "spa_navigation" },
    ...overrides,
  };
}

function attemptBundle(overrides: Partial<{
  readonly submissionId: string;
  readonly verdict: string;
}> = {}): CaptureAttemptBundle {
  const submissionId = overrides.submissionId ?? "submission_bundle_1";
  const verdict = overrides.verdict ?? "Accepted";
  return {
    schemaVersion: 1,
    bundleId: `bundle_${submissionId}`,
    events: [
      startedEvent(),
      submittedEvent(submissionId),
      verdictEvent(submissionId, verdict),
      endedEvent(),
    ],
  };
}

describe("CaptureAttemptBundleSchema", () => {
  it("accepts an in-order, identity-consistent four-event tuple", () => {
    const bundle = attemptBundle();
    expect(CaptureAttemptBundleSchema.parse(bundle)).toEqual(bundle);
  });

  it("accepts the normalized cross-platform failure taxonomy", () => {
    for (const verdict of [
      "Output Limit Exceeded",
      "Presentation Error",
      "Idleness Limit Exceeded",
      "Judge Error",
      "Other Failure",
    ]) {
      const bundle = attemptBundle({ verdict });
      expect(CaptureAttemptBundleSchema.parse(bundle)).toEqual(bundle);
    }
  });

  it("rejects reordered events", () => {
    const bundle = attemptBundle();
    expect(() => CaptureAttemptBundleSchema.parse({
      ...bundle,
      events: [bundle.events[1], bundle.events[0], bundle.events[2], bundle.events[3]],
    })).toThrow();
  });

  it("rejects mismatched submissionId between submission and verdict events", () => {
    const bundle = attemptBundle();
    expect(() => CaptureAttemptBundleSchema.parse({
      ...bundle,
      events: [
        bundle.events[0],
        { ...bundle.events[1], submissionId: "submission_other" },
        bundle.events[2],
        bundle.events[3],
      ],
    })).toThrow();
  });

  it("rejects verdict timestamps that precede submission timestamps", () => {
    const bundle = attemptBundle();
    expect(() => CaptureAttemptBundleSchema.parse({
      ...bundle,
      events: [
        bundle.events[0],
        { ...bundle.events[1], occurredAt: "2026-07-14T00:05:00.000Z" },
        { ...bundle.events[2], occurredAt: "2026-07-14T00:02:00.000Z" },
        bundle.events[3],
      ],
    })).toThrow();
  });

  it("rejects session-ended timestamps that precede verdict timestamps", () => {
    const bundle = attemptBundle();
    expect(() => CaptureAttemptBundleSchema.parse({
      ...bundle,
      events: [
        bundle.events[0],
        bundle.events[1],
        { ...bundle.events[2], occurredAt: "2026-07-14T00:10:00.000Z" },
        { ...bundle.events[3], occurredAt: "2026-07-14T00:09:00.000Z" },
      ],
    })).toThrow();
  });

  it("rejects bundles whose events disagree on installation or platform", () => {
    const bundle = attemptBundle();
    expect(() => CaptureAttemptBundleSchema.parse({
      ...bundle,
      events: [
        bundle.events[0],
        bundle.events[1],
        bundle.events[2],
        { ...bundle.events[3], installationId: "installation_other" },
      ],
    })).toThrow();
  });

  it("rejects unknown bundle schema versions", () => {
    const bundle = attemptBundle();
    expect(() => CaptureAttemptBundleSchema.parse({ ...bundle, schemaVersion: 2 })).toThrow();
  });

  it("rejects unsupported final verdicts and mismatched canonical identity", () => {
    const bundle = attemptBundle();
    expect(() => CaptureAttemptBundleSchema.parse({
      ...bundle,
      events: [bundle.events[0], bundle.events[1], {
        ...bundle.events[2], payload: { verdict: "Pending" },
      }, bundle.events[3]],
    })).toThrow();
    expect(() => CaptureAttemptBundleSchema.parse({
      ...bundle,
      events: [bundle.events[0], bundle.events[1], bundle.events[2], {
        ...bundle.events[3], canonicalUrl: "https://leetcode.cn/problems/other/",
      }],
    })).toThrow();
  });
});

describe("CaptureAttemptAckSchema", () => {
  it("accepts an ACK with a verbatim attempt id and a success status", () => {
    const ack = buildCaptureAttemptAck({
      bundleId: "bundle_1",
      captureSessionId: "session_1",
      attemptId: "attempt_1",
      attemptStatus: "passed",
      replayed: false,
    });
    expect(CaptureAttemptAckSchema.parse(ack)).toEqual(ack);
  });

  it("replays report replayed=true with identical shape", () => {
    const ack = buildCaptureAttemptAck({
      bundleId: "bundle_1",
      captureSessionId: "session_1",
      attemptId: "attempt_1",
      attemptStatus: "passed",
      replayed: true,
    });
    expect(ack.replayed).toBe(true);
    expect(CaptureAttemptAckSchema.parse(ack)).toEqual(ack);
  });

  it("rejects ACKs missing required identity fields", () => {
    expect(() => CaptureAttemptAckSchema.parse({
      ok: true,
      bundleId: "",
      captureSessionId: "session_1",
      attemptId: "attempt_1",
      attemptStatus: "passed",
      replayed: false,
    })).toThrow();
    expect(() => CaptureAttemptAckSchema.parse({
      ok: true,
      bundleId: "bundle_1",
      captureSessionId: "",
      attemptId: "attempt_1",
      attemptStatus: "passed",
      replayed: false,
    })).toThrow();
    expect(() => CaptureAttemptAckSchema.parse({
      ok: true,
      bundleId: "bundle_1",
      captureSessionId: "session_1",
      attemptId: "",
      attemptStatus: "passed",
      replayed: false,
    })).toThrow();
  });

  it("rejects ACKs with widened status values", () => {
    expect(() => CaptureAttemptAckSchema.parse({
      ok: true,
      bundleId: "bundle_1",
      captureSessionId: "session_1",
      attemptId: "attempt_1",
      attemptStatus: "accepted",
      replayed: false,
    })).toThrow();
  });
});
