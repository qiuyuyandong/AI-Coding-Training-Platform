import type { DetectedProblem } from "./platforms";
import {
  type AttemptCaptureRuntimeMessage,
  problemIdentityKey,
} from "./attemptCapture";
import type { UiHintMessage } from "./uiHint";

export type CaptureContentRuntimeDependencies = {
  readonly detectProblem: () => DetectedProblem | null;
  readonly detectVerdict: () =>
    | { readonly verdict: string | null; readonly sourceDocumentId?: string }
    | null
    | undefined;
  readonly exactResultPage: (
    detected: DetectedProblem,
  ) => boolean;
  readonly now: () => string;
  readonly activeDocumentId?: string;
};

export type CaptureContentRuntime = {
  readonly start: () => readonly AttemptCaptureRuntimeMessage[];
  readonly locationObserved: () => readonly AttemptCaptureRuntimeMessage[];
  readonly documentMutated: () => readonly AttemptCaptureRuntimeMessage[];
  readonly uiHintObserved: () => readonly UiHintMessage[];
  readonly pageHidden: () => readonly AttemptCaptureRuntimeMessage[];
  readonly pageShown: () => readonly AttemptCaptureRuntimeMessage[];
};

type RuntimeState = {
  readonly detected: DetectedProblem | null;
  // The verdict span most recently observed by `detectVerdict`. `null`
  // records an explicit Waiting/Judging/null phase (transition evidence).
  readonly lastVerdictSnapshot?:
    | { readonly verdict: string | null; readonly observedAt: string };
  // Whether the last observed page state was an exact result document.
  // Used to recognize a real transition when the document identity flips.
  readonly lastExactResultActive?: boolean;
  readonly lastExactResultVerdict?: string;
};

/**
 * Verdict-gated capture runtime.
 *
 * Per the V0 capture-repair spec:
 *
 *   * Page open/close, route changes, editor interactions, debug runs, and
 *     direct opens of historical result pages do not emit any server-bound
 *     message.
 *   * A qualifying click emits only an E0 UI hint. It cannot create waiting
 *     state, a pending submission, a bundle, or server traffic.
 *   * Visible final verdict candidates remain passive detector output for
 *     compatibility, but Phase 0 has no path that can pair them with a new
 *     submission intent.
 */
export function createCaptureContentRuntime(
  dependencies: CaptureContentRuntimeDependencies,
): CaptureContentRuntime {
  let state: RuntimeState = { detected: null };

  function observeDetectedProblem(): void {
    const detected = dependencies.detectProblem();
    if (detected === null) {
      state = { ...state, detected: null, lastExactResultActive: undefined };
      return;
    }
    const same = state.detected !== null
      && problemIdentityKey(detected) === problemIdentityKey(state.detected);
    if (!same) state = { ...state, detected, lastExactResultActive: undefined };
  }

  function currentVerdictSnapshot(): { readonly verdict: string | null; readonly sourceDocumentId?: string } | null {
    const verdict = dependencies.detectVerdict();
    if (verdict === null || verdict === undefined) return null;
    return {
      verdict: verdict.verdict,
      ...(verdict.sourceDocumentId === undefined ? {} : { sourceDocumentId: verdict.sourceDocumentId }),
    };
  }

  function recordUiHint(): readonly UiHintMessage[] {
    const detected = state.detected;
    if (detected === null) return [];
    return [{
      type: "UI_HINT_OBSERVED",
      hint: {
        schemaVersion: 1,
        tier: "E0",
        kind: "ui_hint",
        platform: detected.platform,
        problemExternalId: detected.problemExternalId,
        observedAt: dependencies.now(),
      },
    }];
  }

  function clearVerdictTransitions(): void {
    state = {
      ...state,
      lastExactResultActive: undefined,
      lastExactResultVerdict: undefined,
    };
  }

  function evaluateVerdictCandidate(): readonly AttemptCaptureRuntimeMessage[] {
    if (state.detected === null) return [];
    const detected = state.detected;
    const snapshot = currentVerdictSnapshot();
    const exactResult = dependencies.exactResultPage(state.detected);

    // Null/Waiting/Judging phase: always recorded as a transition witness.
    if (snapshot === null || snapshot.verdict === null) {
      if (exactResult === false) {
        state = { ...state, lastVerdictSnapshot: snapshot === null
          ? undefined
          : { verdict: snapshot.verdict, observedAt: dependencies.now() } };
        return [];
      }
      // Exact-result-doc navigation with cleared verdict span: still a real
      // transition because the document just appeared. Do not emit a null
      // candidate; the next non-null verdict reuses this transition.
      state = {
        ...state,
        lastVerdictSnapshot: snapshot === null
          ? undefined
          : { verdict: snapshot.verdict, observedAt: dependencies.now() },
        lastExactResultActive: exactResult,
        lastExactResultVerdict: undefined,
      };
      return [];
    }

    // Exact result documents may already contain the final verdict on their
    // first observable frame. Emit a candidate immediately; the background
    // remains responsible for proving intent, identity, time, and document
    // continuity before constructing a bundle.
    if (exactResult === true && state.lastExactResultActive !== true) {
      state = {
        ...state,
        lastExactResultActive: true,
        lastExactResultVerdict: snapshot.verdict,
        lastVerdictSnapshot: { verdict: snapshot.verdict, observedAt: dependencies.now() },
      };
      return [{
        type: "VERDICT_CANDIDATE_OBSERVED",
        candidate: {
          installationId: "runtime",
          platform: detected.platform,
          problemExternalId: detected.problemExternalId,
          verdict: snapshot.verdict,
          observedAt: dependencies.now(),
          transitionEvidence: "exact_result_document",
          ...(snapshot.sourceDocumentId === undefined && dependencies.activeDocumentId === undefined
            ? {}
            : { sourceDocumentId: snapshot.sourceDocumentId ?? dependencies.activeDocumentId ?? "" }),
        },
      }];
    }

    if (exactResult === true
      && state.lastExactResultVerdict !== snapshot.verdict
      && state.lastVerdictSnapshot?.verdict === null) {
      state = {
        ...state,
        lastExactResultActive: true,
        lastExactResultVerdict: snapshot.verdict,
        lastVerdictSnapshot: { verdict: snapshot.verdict, observedAt: dependencies.now() },
      };
      return [{
        type: "VERDICT_CANDIDATE_OBSERVED",
        candidate: {
          installationId: "runtime",
          platform: detected.platform,
          problemExternalId: detected.problemExternalId,
          verdict: snapshot.verdict,
          observedAt: dependencies.now(),
          transitionEvidence: "exact_result_document",
          ...(snapshot.sourceDocumentId === undefined && dependencies.activeDocumentId === undefined
            ? {}
            : { sourceDocumentId: snapshot.sourceDocumentId ?? dependencies.activeDocumentId ?? "" }),
        },
      }];
    }

    // Same-document transition: requires either a different non-null
    // verdict OR a previously observed null phase between the baseline
    // and the current snapshot.
    if (state.lastExactResultActive === true) {
      // We've been on the exact result document; further mutations within
      // that document do not produce additional candidates.
      state = { ...state, lastVerdictSnapshot: { verdict: snapshot.verdict, observedAt: dependencies.now() } };
      return [];
    }

    const last = state.lastVerdictSnapshot;
    if (last === undefined) {
      // Never observed a verdict and no intent-recording happened; this is
      // a direct page-open historical snapshot. The runtime does not emit
      // a candidate because there is no local submit intent; the
      // background can still drop it on receipt if it cannot find a
      // matching intent. We never silently invent a training record.
      state = { ...state, lastVerdictSnapshot: { verdict: snapshot.verdict, observedAt: dependencies.now() } };
      return [];
    }

    if (last.verdict === snapshot.verdict) {
      // Same text as the last observed verdict does not by itself prove a
      // transition. The null-phase branch above has already discharged any
      // transition evidence, so emit nothing here.
      return [];
    }

    // Different non-null verdict observed since the last recorded snapshot:
    // a real post-submit transition.
    state = {
      ...state,
      lastVerdictSnapshot: { verdict: snapshot.verdict, observedAt: dependencies.now() },
    };
    return [{
      type: "VERDICT_CANDIDATE_OBSERVED",
      candidate: {
        installationId: "runtime",
        platform: detected.platform,
        problemExternalId: detected.problemExternalId,
        verdict: snapshot.verdict,
        observedAt: dependencies.now(),
        transitionEvidence: "same_document_transition",
        ...(snapshot.sourceDocumentId === undefined && dependencies.activeDocumentId === undefined
          ? {}
          : { sourceDocumentId: snapshot.sourceDocumentId ?? dependencies.activeDocumentId ?? "" }),
      },
    }];
  }

  return {
    start: () => {
      observeDetectedProblem();
      clearVerdictTransitions();
      return evaluateVerdictCandidate();
    },
    locationObserved: () => {
      observeDetectedProblem();
      clearVerdictTransitions();
      state = {
        ...state,
        lastVerdictSnapshot: undefined,
      };
      return evaluateVerdictCandidate();
    },
    documentMutated: () => {
      observeDetectedProblem();
      return evaluateVerdictCandidate();
    },
    uiHintObserved: () => recordUiHint(),
    pageHidden: () => {
      clearVerdictTransitions();
      state = { ...state, lastVerdictSnapshot: undefined };
      return [];
    },
    pageShown: () => {
      observeDetectedProblem();
      clearVerdictTransitions();
      state = { ...state, lastVerdictSnapshot: undefined };
      return evaluateVerdictCandidate();
    },
  };
}
