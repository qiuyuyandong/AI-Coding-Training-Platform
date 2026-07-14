import {
  endCaptureSession,
  startCaptureSession,
  type CaptureIdFactory,
  type CaptureSessionState,
} from "./captureSession";
import type { CaptureRuntimeContext } from "./installation";
import type { DetectedProblem } from "./platforms";
import type {
  SessionEndedEvent,
  SessionStartedEvent,
} from "@/lib/capture/protocol";

export type CapturePageLifecycleState = {
  readonly active?: CaptureSessionState;
};

export type CapturePageTransition = {
  readonly state: CapturePageLifecycleState;
  readonly events: readonly (SessionStartedEvent | SessionEndedEvent)[];
  readonly changed: boolean;
};

export function reconcilePageLifecycle(
  state: CapturePageLifecycleState,
  detected: DetectedProblem | null,
  context: CaptureRuntimeContext,
  occurredAt: string,
  createId: CaptureIdFactory,
): CapturePageTransition {
  if (
    state.active !== undefined
    && detected !== null
    && isSameProblem(state.active, detected)
  ) {
    return { state, events: [], changed: false };
  }

  const ended: readonly SessionEndedEvent[] = state.active === undefined
    ? []
    : [
        endCaptureSession(
          state.active,
          "spa_navigation",
          occurredAt,
          createId,
        ),
      ];

  if (detected === null) {
    return {
      state: {},
      events: ended,
      changed: ended.length > 0,
    };
  }

  const started = startCaptureSession(
    detected,
    context,
    occurredAt,
    createId,
  );
  return {
    state: { active: started.state },
    events: [...ended, started.event],
    changed: true,
  };
}

export function closePageLifecycle(
  state: CapturePageLifecycleState,
  reason: SessionEndedEvent["payload"]["endReason"],
  occurredAt: string,
  createId: CaptureIdFactory,
): CapturePageTransition {
  if (state.active === undefined) {
    return { state: {}, events: [], changed: false };
  }

  return {
    state: {},
    events: [
      endCaptureSession(state.active, reason, occurredAt, createId),
    ],
    changed: true,
  };
}

function isSameProblem(
  active: CaptureSessionState,
  detected: DetectedProblem,
): boolean {
  return active.detected.platform === detected.platform
    && active.detected.problemExternalId === detected.problemExternalId;
}
