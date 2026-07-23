import type { APIRequestContext } from "@playwright/test";
import type { CaptureEvent } from "../../lib/capture/protocol";
import type { CaptureAttemptBundle } from "../../lib/capture/attemptBundle";
import type { Platform } from "../../extension/src/platforms";
import { E2E_CAPTURE_CREDENTIAL } from "./database";

export type CaptureProblemFixture = {
  readonly captureSessionId: string;
  readonly platform: Platform;
  readonly problemExternalId: string;
  readonly problemTitle: string;
  readonly canonicalUrl: string;
};

type CaptureFixtureInput =
  | {
      readonly type: "SESSION_STARTED";
      readonly eventId: string;
      readonly occurredAt: string;
    }
  | {
      readonly type: "SUBMISSION_OBSERVED";
      readonly eventId: string;
      readonly submissionId: string;
      readonly occurredAt: string;
    }
  | {
      readonly type: "VERDICT_OBSERVED";
      readonly eventId: string;
      readonly submissionId: string;
      readonly verdict: string;
      readonly occurredAt: string;
    }
  | {
      readonly type: "SESSION_ENDED";
      readonly eventId: string;
       readonly endReason: "spa_navigation" | "pagehide" | "capture_disabled";
      readonly occurredAt: string;
    };

export function captureEvent(
  problem: CaptureProblemFixture,
  input: CaptureFixtureInput,
): CaptureEvent {
  const base = {
    schemaVersion: 2 as const,
    id: input.eventId,
    captureSessionId: problem.captureSessionId,
    installationId: "installation_e2e",
    adapterVersion: "e2e@0.2.0",
    parserVersion: "e2e-visible-verdict@0.2.0",
    pageOrigin: new URL(problem.canonicalUrl).origin,
    provenanceLevel: "extension_paired" as const,
    platform: problem.platform,
    problemExternalId: problem.problemExternalId,
    problemTitle: problem.problemTitle,
    canonicalUrl: problem.canonicalUrl,
    occurredAt: input.occurredAt,
  };

  if (input.type === "SESSION_STARTED") {
    return {
      ...base,
      type: input.type,
      payload: { source: "content_script" },
    };
  }
  if (input.type === "SUBMISSION_OBSERVED") {
    return {
      ...base,
      type: input.type,
      submissionId: input.submissionId,
      payload: { action: "submit_clicked" },
    };
  }
  if (input.type === "SESSION_ENDED") {
    return {
      ...base,
      type: input.type,
      payload: { endReason: input.endReason },
    };
  }
  return {
    ...base,
    type: input.type,
    submissionId: input.submissionId,
    payload: { verdict: input.verdict },
  };
}

export function captureAttemptBundle(
  problem: CaptureProblemFixture,
  input: {
    readonly bundleId: string;
    readonly submissionId: string;
    readonly verdict: string;
    readonly submittedAt: string;
    readonly verdictAt: string;
  },
): CaptureAttemptBundle {
  const started = captureEvent(problem, {
    type: "SESSION_STARTED",
    eventId: `${input.bundleId}_started`,
    occurredAt: input.submittedAt,
  });
  const submitted = captureEvent(problem, {
    type: "SUBMISSION_OBSERVED",
    eventId: `${input.bundleId}_submitted`,
    submissionId: input.submissionId,
    occurredAt: input.submittedAt,
  });
  const verdict = captureEvent(problem, {
    type: "VERDICT_OBSERVED",
    eventId: `${input.bundleId}_verdict`,
    submissionId: input.submissionId,
    verdict: input.verdict,
    occurredAt: input.verdictAt,
  });
  const ended = captureEvent(problem, {
    type: "SESSION_ENDED",
    eventId: `${input.bundleId}_ended`,
    endReason: "capture_disabled",
    occurredAt: input.verdictAt,
  });
  if (started.type !== "SESSION_STARTED" || submitted.type !== "SUBMISSION_OBSERVED"
    || verdict.type !== "VERDICT_OBSERVED" || ended.type !== "SESSION_ENDED") {
    throw new Error("Capture attempt fixture produced an invalid event order");
  }
  return {
    schemaVersion: 1,
    bundleId: input.bundleId,
    events: [started, submitted, verdict, ended],
  };
}

export async function postCaptureAttempt(
  request: APIRequestContext,
  bundle: CaptureAttemptBundle,
) {
  return request.post("/api/capture/attempts", {
    data: bundle,
    headers: { authorization: `Bearer ${E2E_CAPTURE_CREDENTIAL}` },
  });
}

export async function postCaptureEvents(
  request: APIRequestContext,
  events: readonly CaptureEvent[],
): Promise<void> {
  for (const event of events) {
    const response = await request.post("/api/capture/events", {
      data: event,
      headers: { authorization: `Bearer ${E2E_CAPTURE_CREDENTIAL}` },
    });
    if (!response.ok()) {
      throw new Error(
        `Capture event ${event.id} failed with ${response.status()}: ${await response.text()}`,
      );
    }
  }
}
