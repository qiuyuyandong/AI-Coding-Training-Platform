import type { DetectedProblem } from "./platforms";
import {
  type AttemptCaptureRuntimeMessage,
  type SubmissionIntentDraft,
  problemIdentityKey,
} from "./attemptCapture";

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
  readonly createSessionId: () => string;
  readonly createSubmissionIntentId: () => string;
  readonly activeDocumentId?: string;
};

export type CaptureContentRuntime = {
  readonly start: () => readonly AttemptCaptureRuntimeMessage[];
  readonly locationObserved: () => readonly AttemptCaptureRuntimeMessage[];
  readonly documentMutated: () => readonly AttemptCaptureRuntimeMessage[];
  readonly submissionObserved: () => readonly AttemptCaptureRuntimeMessage[];
  readonly pageHidden: () => readonly AttemptCaptureRuntimeMessage[];
  readonly pageShown: () => readonly AttemptCaptureRuntimeMessage[];
  readonly currentBaselineVerdict: () => string | undefined;
};

type RuntimeState = {
  readonly detected: DetectedProblem | null;
  readonly baselineVerdict?: string;
  // The verdict span most recently observed by `detectVerdict`. `null`
  // records an explicit Waiting/Judging/null phase (transition evidence).
  readonly lastVerdictSnapshot?:
    | { readonly verdict: string | null; readonly observedAt: string };
  // Whether the last observed page state was an exact result document.
  // Used to recognize a real transition when the document identity flips.
  readonly lastExactResultActive?: boolean;
  readonly lastExactResultVerdict?: string;
  // Local causality witness retained across same-document SPA navigation.
  // A fresh document cannot inherit this value and therefore still relies on
  // the background worker's stored intent + Chrome document identity checks.
  readonly awaitingProblemKey?: string;
};

/**
 * Verdict-gated capture runtime.
 *
 * Per the V0 capture-repair spec:
 *
 *   * Page open/close, route changes, editor interactions, debug runs, and
 *     direct opens of historical result pages do not emit any server-bound
 *     message.
 *   * Only an exact submit click writes one intent message; only a fresh
 *     final verdict (distinct text, explicit null phase, or navigation to
 *     an exact result document) observed after that intent emits one
 *     verdict-candidate message.
 *   * The background worker is the only place that may construct a
 *     `PendingSubmissionIntent` with `sender.documentId`; this runtime
 *     never fakes document identity.
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

  function recordSubmissionIntent(): readonly AttemptCaptureRuntimeMessage[] {
    const detected = state.detected;
    if (detected === null) return [];
    const snapshot = currentVerdictSnapshot();
    const baseline = snapshot?.verdict ?? undefined;
    const intent: SubmissionIntentDraft = {
      installationId: "runtime",
      platform: detected.platform,
      problemExternalId: detected.problemExternalId,
      problemTitle: detected.problemTitle,
      canonicalUrl: detected.canonicalUrl,
      captureSessionId: dependencies.createSessionId(),
      submissionId: dependencies.createSubmissionIntentId(),
      occurredAt: dependencies.now(),
      ...(baseline === undefined ? {} : { baselineVerdict: baseline }),
    };
    state = {
      ...state,
      baselineVerdict: baseline,
      awaitingProblemKey: problemIdentityKey(detected),
      lastVerdictSnapshot: snapshot === null
        ? undefined
        : { verdict: snapshot.verdict, observedAt: dependencies.now() },
    };
    return [{
      type: "SUBMISSION_INTENT_OBSERVED",
      intent,
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
      const hasLocalSubmitCausality = state.awaitingProblemKey === problemIdentityKey(detected);
      state = {
        ...state,
        lastExactResultActive: true,
        lastExactResultVerdict: snapshot.verdict,
        lastVerdictSnapshot: { verdict: snapshot.verdict, observedAt: dependencies.now() },
        awaitingProblemKey: undefined,
      };
      return [{
        type: "VERDICT_CANDIDATE_OBSERVED",
        candidate: {
          installationId: "runtime",
          platform: detected.platform,
          problemExternalId: detected.problemExternalId,
          verdict: snapshot.verdict,
          observedAt: dependencies.now(),
          transitionEvidence: hasLocalSubmitCausality
            ? "same_document_transition"
            : "exact_result_document",
          ...(snapshot.sourceDocumentId === undefined && dependencies.activeDocumentId === undefined
            ? {}
            : { sourceDocumentId: snapshot.sourceDocumentId ?? dependencies.activeDocumentId ?? "" }),
        },
      }];
    }

    if (exactResult === true
      && state.lastExactResultVerdict !== snapshot.verdict
      && state.lastVerdictSnapshot?.verdict === null) {
      const hasLocalSubmitCausality = state.awaitingProblemKey === problemIdentityKey(detected);
      state = {
        ...state,
        lastExactResultActive: true,
        lastExactResultVerdict: snapshot.verdict,
        lastVerdictSnapshot: { verdict: snapshot.verdict, observedAt: dependencies.now() },
        awaitingProblemKey: undefined,
      };
      return [{
        type: "VERDICT_CANDIDATE_OBSERVED",
        candidate: {
          installationId: "runtime",
          platform: detected.platform,
          problemExternalId: detected.problemExternalId,
          verdict: snapshot.verdict,
          observedAt: dependencies.now(),
          transitionEvidence: hasLocalSubmitCausality
            ? "same_document_transition"
            : "exact_result_document",
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
      awaitingProblemKey: undefined,
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
      const awaitingProblemKey = state.awaitingProblemKey;
      observeDetectedProblem();
      clearVerdictTransitions();
      const samePendingProblem = state.detected !== null
        && awaitingProblemKey === problemIdentityKey(state.detected);
      state = {
        ...state,
        awaitingProblemKey: samePendingProblem ? awaitingProblemKey : undefined,
        // A same-problem route change after a local submit is real transition
        // evidence even when the OJ keeps the same Chrome document alive.
        lastVerdictSnapshot: samePendingProblem
          ? { verdict: null, observedAt: dependencies.now() }
          : undefined,
      };
      return evaluateVerdictCandidate();
    },
    documentMutated: () => {
      observeDetectedProblem();
      return evaluateVerdictCandidate();
    },
    submissionObserved: () => recordSubmissionIntent(),
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
    currentBaselineVerdict: () => state.baselineVerdict,
  };
}
