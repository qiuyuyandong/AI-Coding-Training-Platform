import type { APIRequestContext } from "@playwright/test";
import type { CaptureEvent } from "../../lib/capture/protocol";
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
