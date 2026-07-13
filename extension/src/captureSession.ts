import type {
  CaptureEvent,
  SessionEndedEvent,
  SessionStartedEvent,
  SubmissionObservedEvent,
  VerdictObservedEvent,
} from "@/lib/capture/protocol";
import type { CaptureRuntimeContext } from "./installation";
import type { DetectedProblem } from "./platforms";

export const ADAPTER_VERSION = "multi-platform@0.2.0";
export const PARSER_VERSION = "visible-verdict@0.2.0";
export const PROVENANCE_LEVEL = "extension_unpaired" as const;

export type CaptureIdKind = "event" | "session" | "submission";
export type CaptureIdFactory = (kind: CaptureIdKind) => string;

export type CaptureSessionState = {
  readonly detected: DetectedProblem;
  readonly installationId: string;
  readonly captureSessionId: string;
  readonly activeSubmissionId?: string;
  readonly lastVerdict?: string;
};

export function startCaptureSession(
  detected: DetectedProblem,
  context: CaptureRuntimeContext,
  occurredAt: string,
  createId: CaptureIdFactory,
): { readonly state: CaptureSessionState; readonly event: SessionStartedEvent } {
  const state: CaptureSessionState = {
    detected,
    installationId: context.installationId,
    captureSessionId: createId("session"),
  };
  return {
    state,
    event: {
      ...eventBase(state, occurredAt, createId),
      type: "SESSION_STARTED",
      payload: { source: "content_script" },
    },
  };
}

export function observeSubmission(
  state: CaptureSessionState,
  occurredAt: string,
  createId: CaptureIdFactory,
): {
  readonly state: CaptureSessionState;
  readonly event: SubmissionObservedEvent;
} {
  const submissionId = createId("submission");
  const nextState: CaptureSessionState = {
    detected: state.detected,
    installationId: state.installationId,
    captureSessionId: state.captureSessionId,
    activeSubmissionId: submissionId,
  };
  return {
    state: nextState,
    event: {
      ...eventBase(nextState, occurredAt, createId),
      type: "SUBMISSION_OBSERVED",
      submissionId,
      payload: { action: "submit_clicked" },
    },
  };
}

export function observeVerdict(
  state: CaptureSessionState,
  verdict: string,
  occurredAt: string,
  createId: CaptureIdFactory,
): {
  readonly state: CaptureSessionState;
  readonly event?: VerdictObservedEvent;
} {
  if (state.activeSubmissionId !== undefined && state.lastVerdict === verdict) {
    return { state };
  }

  const submissionId = state.activeSubmissionId ?? createId("submission");
  const nextState: CaptureSessionState = {
    ...state,
    activeSubmissionId: submissionId,
    lastVerdict: verdict,
  };
  return {
    state: nextState,
    event: {
      ...eventBase(nextState, occurredAt, createId),
      type: "VERDICT_OBSERVED",
      submissionId,
      payload: { verdict },
    },
  };
}

export function endCaptureSession(
  state: CaptureSessionState,
  endReason: SessionEndedEvent["payload"]["endReason"],
  occurredAt: string,
  createId: CaptureIdFactory,
): SessionEndedEvent {
  return {
    ...eventBase(state, occurredAt, createId),
    type: "SESSION_ENDED",
    payload: { endReason },
  };
}

function eventBase(
  state: CaptureSessionState,
  occurredAt: string,
  createId: CaptureIdFactory,
): Omit<CaptureEvent, "type" | "payload" | "submissionId"> {
  return {
    schemaVersion: 2,
    id: createId("event"),
    captureSessionId: state.captureSessionId,
    installationId: state.installationId,
    adapterVersion: ADAPTER_VERSION,
    parserVersion: PARSER_VERSION,
    pageOrigin: new URL(state.detected.canonicalUrl).origin,
    provenanceLevel: PROVENANCE_LEVEL,
    platform: state.detected.platform,
    problemExternalId: state.detected.problemExternalId,
    problemTitle: state.detected.problemTitle,
    canonicalUrl: state.detected.canonicalUrl,
    occurredAt,
  };
}
