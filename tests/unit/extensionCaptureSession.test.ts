import { describe, expect, it } from "vitest";
import {
  endCaptureSession,
  observeSubmission,
  observeVerdict,
  startCaptureSession,
  type CaptureIdKind,
} from "@/extension/src/captureSession";
import type { DetectedProblem } from "@/extension/src/platforms";

const detected: DetectedProblem = {
  platform: "leetcode",
  problemExternalId: "two-sum",
  problemTitle: "Two Sum",
  canonicalUrl: "https://leetcode.com/problems/two-sum/",
};

const context = { installationId: "installation_1" };

function idFactory() {
  const counts = new Map<CaptureIdKind, number>();
  return (kind: CaptureIdKind): string => {
    const next = (counts.get(kind) ?? 0) + 1;
    counts.set(kind, next);
    return `${kind}_${next}`;
  };
}

describe("capture session event lifecycle", () => {
  it("creates a V2 session start event", () => {
    const started = startCaptureSession(
      detected,
      context,
      "2026-07-14T00:00:00.000Z",
      idFactory(),
    );

    expect(started.event).toMatchObject({
      schemaVersion: 2,
      id: "event_1",
      type: "SESSION_STARTED",
      captureSessionId: "session_1",
      installationId: "installation_1",
      pageOrigin: "https://leetcode.com",
    });
  });

  it("creates a distinct submission ID for each observed submit", () => {
    const createId = idFactory();
    const started = startCaptureSession(
      detected,
      context,
      "2026-07-14T00:00:00.000Z",
      createId,
    );
    const first = observeSubmission(
      started.state,
      "2026-07-14T00:01:00.000Z",
      createId,
    );
    const second = observeSubmission(
      first.state,
      "2026-07-14T00:02:00.000Z",
      createId,
    );

    expect(first.event.submissionId).toBe("submission_1");
    expect(second.event.submissionId).toBe("submission_2");
  });

  it("emits the same verdict again after a new submission", () => {
    const createId = idFactory();
    const started = startCaptureSession(
      detected,
      context,
      "2026-07-14T00:00:00.000Z",
      createId,
    );
    const firstSubmission = observeSubmission(
      started.state,
      "2026-07-14T00:01:00.000Z",
      createId,
    );
    const firstVerdict = observeVerdict(
      firstSubmission.state,
      "Wrong Answer",
      "2026-07-14T00:02:00.000Z",
      createId,
    );
    expect(firstVerdict.event?.submissionId).toBe("submission_1");

    const duplicate = observeVerdict(
      firstVerdict.state,
      "Wrong Answer",
      "2026-07-14T00:03:00.000Z",
      createId,
    );
    expect(duplicate.event).toBeUndefined();

    const secondSubmission = observeSubmission(
      duplicate.state,
      "2026-07-14T00:04:00.000Z",
      createId,
    );
    const secondVerdict = observeVerdict(
      secondSubmission.state,
      "Wrong Answer",
      "2026-07-14T00:05:00.000Z",
      createId,
    );
    expect(secondVerdict.event?.submissionId).toBe("submission_2");
  });

  it("creates a submission ID when verdict arrives first", () => {
    const createId = idFactory();
    const started = startCaptureSession(
      detected,
      context,
      "2026-07-14T00:00:00.000Z",
      createId,
    );
    const verdict = observeVerdict(
      started.state,
      "Accepted",
      "2026-07-14T00:01:00.000Z",
      createId,
    );

    expect(verdict.event).toMatchObject({
      type: "VERDICT_OBSERVED",
      submissionId: "submission_1",
      payload: { verdict: "Accepted" },
    });
  });

  it("ends the session without a submission ID", () => {
    const createId = idFactory();
    const started = startCaptureSession(
      detected,
      context,
      "2026-07-14T00:00:00.000Z",
      createId,
    );
    const ended = endCaptureSession(
      started.state,
      "pagehide",
      "2026-07-14T00:05:00.000Z",
      createId,
    );

    expect(ended).toMatchObject({
      type: "SESSION_ENDED",
      payload: { endReason: "pagehide" },
    });
    expect("submissionId" in ended).toBe(false);
  });
});
