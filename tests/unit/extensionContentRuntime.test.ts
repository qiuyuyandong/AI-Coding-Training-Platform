import { describe, expect, it } from "vitest";
import {
  createCaptureContentRuntime,
  type CaptureContentRuntime,
} from "@/extension/src/contentRuntime";
import type { DetectedProblem } from "@/extension/src/platforms";
import {
  type AttemptCaptureRuntimeMessage,
  type SubmissionIntentDraft,
  type VerdictCandidateMessage,
  type SubmissionIntentMessage,
} from "@/extension/src/attemptCapture";

const twoSum: DetectedProblem = {
  platform: "leetcode",
  problemExternalId: "two-sum",
  problemTitle: "Two Sum",
  canonicalUrl: "https://leetcode.cn/problems/two-sum/",
};

const validParentheses: DetectedProblem = {
  platform: "leetcode",
  problemExternalId: "valid-parentheses",
  problemTitle: "Valid Parentheses",
  canonicalUrl: "https://leetcode.cn/problems/valid-parentheses/",
};

const atcoderAgc040dSubmission: DetectedProblem = {
  platform: "atcoder",
  problemExternalId: "agc040_d",
  problemTitle: "D - Balance Beam",
  canonicalUrl: "https://atcoder.jp/contests/agc040/tasks/agc040_d",
};

type Harness = {
  readonly runtime: CaptureContentRuntime;
  readonly messages: AttemptCaptureRuntimeMessage[];
  readonly setDetected: (value: DetectedProblem | null) => void;
  readonly setVerdict: (value: string | null, options?: { readonly sourceDocumentId?: string }) => void;
  readonly markExactResultPage: (value: boolean) => void;
};

function createHarness(): Harness {
  let detected: DetectedProblem | null = twoSum;
  let verdict: string | null = null;
  let exact = false;
  let sourceDocumentId = "doc_1";
  let sessionTick = 0;
  let submissionTick = 0;
  const messages: AttemptCaptureRuntimeMessage[] = [];
  const runtime = createCaptureContentRuntime({
    detectProblem: () => detected,
    detectVerdict: () => ({ verdict, sourceDocumentId }),
    exactResultPage: () => exact,
    now: () => {
      sessionTick += 1;
      return `2026-07-14T04:${String(sessionTick).padStart(2, "0")}:00.000Z`;
    },
    createSessionId: () => {
      sessionTick += 1;
      return `session_${sessionTick}`;
    },
    createSubmissionIntentId: () => {
      submissionTick += 1;
      return `submission_${submissionTick}`;
    },
    activeDocumentId: "doc_1",
  });
  return {
    runtime,
    messages,
    setDetected: (value) => { detected = value; },
    setVerdict: (value, options) => {
      verdict = value;
      if (options?.sourceDocumentId !== undefined) {
        sourceDocumentId = options.sourceDocumentId;
      }
    },
    markExactResultPage: (value) => { exact = value; },
  };
}

function recordMessages<T extends readonly AttemptCaptureRuntimeMessage[]>(
  harness: Harness,
  messages: T,
): T {
  harness.messages.push(...messages);
  return messages;
}

function latestIntent(harness: Harness): SubmissionIntentDraft {
  const intent = [...harness.messages].reverse().find(
    (message): message is SubmissionIntentMessage => message.type === "SUBMISSION_INTENT_OBSERVED",
  );
  if (intent === undefined) throw new Error("No intent message was emitted");
  return intent.intent;
}

function latestCandidate(harness: Harness): Extract<VerdictCandidateMessage, { readonly type: "VERDICT_CANDIDATE_OBSERVED" }>["candidate"] | undefined {
  const candidate = [...harness.messages].reverse().find(
    (message): message is VerdictCandidateMessage => message.type === "VERDICT_CANDIDATE_OBSERVED",
  );
  return candidate?.candidate;
}

describe("verdict-gated capture content runtime", () => {
  it("page open followed by page close emits no messages", () => {
    const harness = createHarness();
    recordMessages(harness, harness.runtime.start());
    recordMessages(harness, harness.runtime.locationObserved());
    recordMessages(harness, harness.runtime.documentMutated());
    recordMessages(harness, harness.runtime.pageHidden());
    expect(harness.messages).toHaveLength(0);
  });

  it("running or debugging code without an exact submit emits no messages", () => {
    const harness = createHarness();
    recordMessages(harness, harness.runtime.start());
    recordMessages(harness, harness.runtime.documentMutated());
    recordMessages(harness, harness.runtime.documentMutated());
    recordMessages(harness, harness.runtime.locationObserved());
    recordMessages(harness, harness.runtime.documentMutated());
    expect(harness.messages).toHaveLength(0);
  });

  it("exact submit click records exactly one intent and stays quiet about verdict", () => {
    const harness = createHarness();
    recordMessages(harness, harness.runtime.start());
    const messages = recordMessages(harness, harness.runtime.submissionObserved());
    expect(messages).toHaveLength(1);
    expect(messages[0]?.type).toBe("SUBMISSION_INTENT_OBSERVED");
    expect(latestIntent(harness).submissionId).toBe("submission_1");
  });

  it("exact submit followed by a different final verdict emits one intent then one candidate", () => {
    const harness = createHarness();
    recordMessages(harness, harness.runtime.start());
    recordMessages(harness, harness.runtime.submissionObserved());
    harness.setVerdict("Accepted");
    const messages = recordMessages(harness, harness.runtime.documentMutated());
    expect(messages.map((message) => message.type)).toEqual([
      "VERDICT_CANDIDATE_OBSERVED",
    ]);
    expect(messages).toHaveLength(1);
    expect(latestCandidate(harness)?.verdict).toBe("Accepted");
    expect(latestCandidate(harness)?.transitionEvidence).toBe("same_document_transition");
  });

  it("may emit an internal historical candidate that requires background intent matching", () => {
    const harness = createHarness();
    recordMessages(harness, harness.runtime.start());
    harness.setVerdict("Accepted");
    const messages = recordMessages(harness, harness.runtime.documentMutated());
    expect(messages).toHaveLength(1);
    expect(latestCandidate(harness)?.verdict).toBe("Accepted");
  });

  it("a stale same-text verdict after an exact submit must require a transition first", () => {
    const harness = createHarness();
    recordMessages(harness, harness.runtime.start());
    harness.setVerdict("Accepted");
    recordMessages(harness, harness.runtime.submissionObserved());

    // Same text as the submit-time baseline is stale; runtime records the
    // baseline but emits no candidate.
    expect(recordMessages(harness, harness.runtime.documentMutated())).toHaveLength(0);

    // Verdict spans disappears (null), then returns with the same text:
    // that proves a real transition away from the submit-time baseline.
    harness.setVerdict(null);
    recordMessages(harness, harness.runtime.documentMutated());
    harness.setVerdict("Accepted");
    const messages = recordMessages(harness, harness.runtime.documentMutated());
    expect(messages).toHaveLength(1);
    expect(latestCandidate(harness)?.transitionEvidence).toBe("same_document_transition");
  });

  it("emits a candidate when a new exact result document first renders Accepted", () => {
    const harness = createHarness();
    recordMessages(harness, harness.runtime.start());
    recordMessages(harness, harness.runtime.submissionObserved());
    harness.markExactResultPage(true);
    harness.setDetected(atcoderAgc040dSubmission);
    harness.setVerdict("Accepted", { sourceDocumentId: "doc_2" });
    recordMessages(harness, harness.runtime.locationObserved());
    expect(harness.messages.map((message) => message.type)).toEqual([
      "SUBMISSION_INTENT_OBSERVED",
      "VERDICT_CANDIDATE_OBSERVED",
    ]);
    expect(latestCandidate(harness)?.transitionEvidence).toBe("exact_result_document");
    expect(latestCandidate(harness)?.problemExternalId).toBe("agc040_d");
  });

  it("emits a historical result candidate for background intent filtering", () => {
    const harness = createHarness();
    harness.markExactResultPage(true);
    harness.setDetected(atcoderAgc040dSubmission);
    harness.setVerdict("Accepted");
    const messages = recordMessages(harness, harness.runtime.start());
    expect(messages).toHaveLength(1);
    expect(latestCandidate(harness)?.transitionEvidence).toBe("exact_result_document");
  });

  it("does not require a problem-page null snapshot before an exact-result candidate", () => {
    const harness = createHarness();
    recordMessages(harness, harness.runtime.start());
    recordMessages(harness, harness.runtime.submissionObserved());
    harness.markExactResultPage(true);
    harness.setDetected(atcoderAgc040dSubmission);
    harness.setVerdict("Accepted");
    const messages = recordMessages(harness, harness.runtime.locationObserved());
    expect(messages).toHaveLength(1);
  });

  it("keeps submit causality across a same-document SPA result route", () => {
    const harness = createHarness();
    recordMessages(harness, harness.runtime.start());
    recordMessages(harness, harness.runtime.submissionObserved());

    // LeetCode can switch from the task route to a result route without
    // creating a new Chrome document. That route transition is still backed
    // by the local submit observed by this runtime, so it must not be labelled
    // as a cross-document historical result.
    harness.markExactResultPage(true);
    harness.setVerdict("Time Limit Exceeded");
    const messages = recordMessages(harness, harness.runtime.locationObserved());

    expect(messages).toHaveLength(1);
    expect(latestCandidate(harness)).toMatchObject({
      verdict: "Time Limit Exceeded",
      transitionEvidence: "same_document_transition",
      sourceDocumentId: "doc_1",
    });
  });

  it("emits the exact-result candidate after BFCache restoration without requiring null", () => {
    const harness = createHarness();
    recordMessages(harness, harness.runtime.start());
    recordMessages(harness, harness.runtime.submissionObserved());
    recordMessages(harness, harness.runtime.pageHidden());
    harness.markExactResultPage(true);
    harness.setDetected(atcoderAgc040dSubmission);
    harness.setVerdict("Accepted");
    recordMessages(harness, harness.runtime.pageShown());
    expect(latestCandidate(harness)?.transitionEvidence).toBe("exact_result_document");
  });

  it("verdict emission after navigating away from the intent page targets the new problem, leaving the original intent intact", () => {
    const harness = createHarness();
    recordMessages(harness, harness.runtime.start());
    recordMessages(harness, harness.runtime.submissionObserved());
    harness.setDetected(validParentheses);
    recordMessages(harness, harness.runtime.locationObserved());
    harness.setVerdict("Accepted");
    recordMessages(harness, harness.runtime.documentMutated());
    expect(latestCandidate(harness)?.problemExternalId).toBe("valid-parentheses");
    expect(latestIntent(harness).problemExternalId).toBe("two-sum");
  });

  it("verdict emission for the same problem after navigation to a non-problem route stays quiet", () => {
    const harness = createHarness();
    recordMessages(harness, harness.runtime.start());
    recordMessages(harness, harness.runtime.submissionObserved());
    harness.setDetected(null);
    recordMessages(harness, harness.runtime.locationObserved());
    harness.setVerdict("Accepted");
    expect(recordMessages(harness, harness.runtime.documentMutated())).toHaveLength(0);
  });
});
