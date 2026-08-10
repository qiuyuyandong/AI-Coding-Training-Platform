import type { DetectedProblem, DetectedVerdict, Platform } from "./platforms";

export const ADAPTER_VERSION = "atomic-bundle@0.1.0";
export const PARSER_VERSION = "atomic-bundle-verdict@0.2.0";

export type SubmissionIntentDraft = {
  readonly installationId: string;
  readonly platform: Platform;
  readonly problemExternalId: string;
  readonly problemTitle: string;
  readonly canonicalUrl: string;
  readonly captureSessionId: string;
  readonly submissionId: string;
  readonly occurredAt: string;
  readonly baselineVerdict?: string;
};

export type PendingSubmissionIntent = SubmissionIntentDraft & {
  readonly sourceDocumentId?: string;
  readonly status: "active" | "superseded" | "expired";
};

export type VerdictTransitionEvidence =
  | "same_document_transition"
  | "exact_result_document";

export type VerdictCandidateMessage = {
  readonly type: "VERDICT_CANDIDATE_OBSERVED";
  readonly candidate: {
    readonly installationId: string;
    readonly platform: Platform;
    readonly problemExternalId: string;
    readonly verdict: string;
    readonly observedAt: string;
    readonly transitionEvidence: VerdictTransitionEvidence;
    readonly sourceDocumentId?: string;
    /**
     * Runtime-only submit binding.  It is intentionally not part of the
     * transientVerdictCandidates storage shape; Task 14 owns persistence and
     * coordinator binding.  Legacy passive candidates omit this field.
     */
    readonly submitRequestId?: string;
  };
};

export function isVerdictCandidateMessage(value: unknown): value is VerdictCandidateMessage {
  if (typeof value !== "object" || value === null) return false;
  if (!("type" in value) || value.type !== "VERDICT_CANDIDATE_OBSERVED") return false;
  if (!("candidate" in value) || typeof value.candidate !== "object" || value.candidate === null) {
    return false;
  }
  const candidate = value.candidate;
  const submitRequestId = Reflect.get(candidate, "submitRequestId");
  const requestBindingValid = submitRequestId === undefined
    ? true
    : Reflect.get(candidate, "platform") === "leetcode"
      && typeof submitRequestId === "string"
      && /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,199}$/u.test(submitRequestId)
      && !/[\u0000-\u001f\u007f]/u.test(submitRequestId);
  return requestBindingValid
    && hasString(candidate, "installationId")
    && hasPlatform(candidate, "platform")
    && hasString(candidate, "problemExternalId")
    && hasString(candidate, "verdict")
    && hasString(candidate, "observedAt")
    && "transitionEvidence" in candidate
    && (candidate.transitionEvidence === "same_document_transition"
      || candidate.transitionEvidence === "exact_result_document");
}

function hasString(value: object, key: string): boolean {
  return key in value && typeof Reflect.get(value, key) === "string"
    && String(Reflect.get(value, key)).length > 0;
}

function hasPlatform(value: object, key: string): boolean {
  if (!(key in value)) return false;
  const platform = Reflect.get(value, key);
  return platform === "leetcode" || platform === "nowcoder" || platform === "luogu"
    || platform === "codeforces" || platform === "atcoder";
}

export type DetectedVerdictSnapshot = {
  readonly verdict: DetectedVerdict | null;
  readonly sourceDocumentId?: string;
};

export type AttemptCaptureRuntimeInputs = {
  readonly detectedProblem: DetectedProblem | null;
  readonly detectedVerdict: DetectedVerdictSnapshot;
};

export type AttemptCaptureRuntimeMessage = VerdictCandidateMessage;

export type AttemptCaptureRuntimeResult = {
  readonly messages: readonly AttemptCaptureRuntimeMessage[];
  readonly baselineVerdict?: string;
};

/**
 * Strict identity used to compare two detected problems — the runtime must
 * keep its state across same-problem visits and close it on a real change.
 */
export function problemIdentityKey(problem: DetectedProblem): string {
  return `${problem.platform}:${problem.problemExternalId}`;
}

export const SUPERSESSION_TIMESTAMP_SENTINEL = "__supersede_only__";
