import {
  observeSubmission,
  observeVerdict,
  type CaptureIdFactory,
} from "./captureSession";
import type { CaptureRuntimeContext } from "./installation";
import {
  closePageLifecycle,
  reconcilePageLifecycle,
  type CapturePageLifecycleState,
  type CapturePageTransition,
} from "./pageLifecycle";
import type {
  DetectedProblem,
  DetectedVerdict,
} from "./platforms";
import type { CaptureEvent } from "@/lib/capture/protocol";

export type CaptureContentRuntimeDependencies = {
  readonly context: CaptureRuntimeContext;
  readonly detectProblem: () => DetectedProblem | null;
  readonly detectVerdict: (
    platform: DetectedProblem["platform"],
  ) => DetectedVerdict | null;
  readonly sendEvent: (event: CaptureEvent) => void;
  readonly now: () => string;
  readonly createId: CaptureIdFactory;
};

export type CaptureContentRuntime = {
  readonly start: () => void;
  readonly locationObserved: () => void;
  readonly documentMutated: () => void;
  readonly submissionObserved: () => void;
  readonly pageHidden: () => void;
  readonly pageShown: () => void;
  readonly currentState: () => CapturePageLifecycleState;
};

export function createCaptureContentRuntime(
  dependencies: CaptureContentRuntimeDependencies,
): CaptureContentRuntime {
  let state: CapturePageLifecycleState = {};
  let suppressNextMutationVerdict = false;

  function applyTransition(transition: CapturePageTransition): boolean {
    state = transition.state;
    transition.events.forEach(dependencies.sendEvent);
    return transition.changed;
  }

  function reconcile(): boolean {
    return applyTransition(
      reconcilePageLifecycle(
        state,
        dependencies.detectProblem(),
        dependencies.context,
        dependencies.now(),
        dependencies.createId,
      ),
    );
  }

  function publishVerdict(): void {
    const active = state.active;
    if (active === undefined) return;

    const verdict = dependencies.detectVerdict(active.detected.platform);
    if (verdict === null) return;

    const observed = observeVerdict(
      active,
      verdict.verdict,
      dependencies.now(),
      dependencies.createId,
    );
    state = { active: observed.state };
    if (observed.event !== undefined) {
      dependencies.sendEvent(observed.event);
    }
  }

  return {
    start: () => {
      reconcile();
      publishVerdict();
    },
    locationObserved: () => {
      if (reconcile()) suppressNextMutationVerdict = true;
    },
    documentMutated: () => {
      if (reconcile()) {
        suppressNextMutationVerdict = false;
        return;
      }
      if (suppressNextMutationVerdict) {
        suppressNextMutationVerdict = false;
        return;
      }
      publishVerdict();
    },
    submissionObserved: () => {
      reconcile();
      suppressNextMutationVerdict = false;
      const active = state.active;
      if (active === undefined) return;

      const observed = observeSubmission(
        active,
        dependencies.now(),
        dependencies.createId,
      );
      state = { active: observed.state };
      dependencies.sendEvent(observed.event);
    },
    pageHidden: () => {
      suppressNextMutationVerdict = false;
      applyTransition(
        closePageLifecycle(
          state,
          "pagehide",
          dependencies.now(),
          dependencies.createId,
        ),
      );
    },
    pageShown: () => {
      suppressNextMutationVerdict = false;
      reconcile();
    },
    currentState: () => state,
  };
}
