import { describe, expect, it } from "vitest";
import {
  consumeVerdictCandidate,
  recordSubmissionIntent,
} from "@/extension/src/attemptStorage";
import { createCaptureContentRuntime } from "@/extension/src/contentRuntime";
import {
  detectProblemFromPage,
  detectVerdictFromDocument,
  isExactSubmissionResultPage,
  type DetectableLocation,
  type DetectedProblem,
} from "@/extension/src/platforms";
import type {
  PendingSubmissionIntent,
  SubmissionIntentDraft,
  VerdictCandidateMessage,
} from "@/extension/src/attemptCapture";

const draft: SubmissionIntentDraft = {
  installationId: "installation_1",
  platform: "atcoder",
  problemExternalId: "abc100_a",
  problemTitle: "A",
  canonicalUrl: "https://atcoder.jp/contests/abc100/tasks/abc100_a",
  captureSessionId: "session_1",
  submissionId: "submission_1",
  occurredAt: "2026-07-21T00:00:00.000Z",
};

const candidate: VerdictCandidateMessage["candidate"] = {
  installationId: "installation_1",
  platform: "atcoder",
  problemExternalId: "abc100_a",
  verdict: "Accepted",
  observedAt: "2026-07-21T00:01:00.000Z",
  transitionEvidence: "exact_result_document",
  sourceDocumentId: "result_document",
};

function asLocation(url: string): DetectableLocation {
  const parsed = new URL(url);
  return { href: parsed.href, hostname: parsed.hostname, pathname: parsed.pathname };
}

function asDocument(html: string): Document {
  return new DOMParser().parseFromString(html, "text/html");
}

describe("background message ordering", () => {
  it("creates a bundle for intent then new document with first-frame Accepted", () => {
    const problem: DetectedProblem = {
      platform: "atcoder",
      problemExternalId: "abc100_a",
      problemTitle: "A",
      canonicalUrl: "https://atcoder.jp/contests/abc100/tasks/abc100_a",
    };
    const taskRuntime = createCaptureContentRuntime({
      detectProblem: () => problem,
      detectVerdict: () => ({ verdict: null, sourceDocumentId: "task_document" }),
      exactResultPage: () => false,
      now: () => "2026-07-21T00:00:00.000Z",
      createSessionId: () => "session_1",
      createSubmissionIntentId: () => "submission_1",
    });
    taskRuntime.start();
    const intentMessage = taskRuntime.submissionObserved()[0];
    if (intentMessage?.type !== "SUBMISSION_INTENT_OBSERVED") {
      throw new Error("Submit did not produce an intent");
    }
    const intents = recordSubmissionIntent([], {
      ...intentMessage.intent,
      installationId: "installation_1",
    }, "task_document");

    const resultRuntime = createCaptureContentRuntime({
      detectProblem: () => problem,
      detectVerdict: () => ({ verdict: "Accepted", sourceDocumentId: "result_document" }),
      exactResultPage: () => true,
      now: () => "2026-07-21T00:01:00.000Z",
      createSessionId: () => "unused_session",
      createSubmissionIntentId: () => "unused_submission",
    });
    const candidateMessage = resultRuntime.start()[0];
    if (candidateMessage?.type !== "VERDICT_CANDIDATE_OBSERVED") {
      throw new Error("First-frame final verdict did not produce a candidate");
    }
    const result = consumeVerdictCandidate({
      intents,
      candidate: { ...candidateMessage.candidate, installationId: "installation_1" },
      installationId: "installation_1",
      provenanceLevel: "extension_paired",
    });
    expect(result.outboxItem?.bundle.events[2].payload.verdict).toBe("Accepted");
    expect(result.intents).toEqual([]);
  });

  it("consumes a LeetCode.cn intent when the result document says 执行出错", () => {
    const problem: DetectedProblem = {
      platform: "leetcode",
      problemExternalId: "find-the-prefix-common-array-of-two-arrays",
      problemTitle: "Find the Prefix Common Array of Two Arrays",
      canonicalUrl: "https://leetcode.cn/problems/find-the-prefix-common-array-of-two-arrays/",
    };
    const taskRuntime = createCaptureContentRuntime({
      detectProblem: () => problem,
      detectVerdict: () => ({ verdict: null, sourceDocumentId: "task_document" }),
      exactResultPage: () => false,
      now: () => "2026-07-22T01:00:00.000Z",
      createSessionId: () => "session_leetcode_runtime_error",
      createSubmissionIntentId: () => "submission_leetcode_runtime_error",
    });
    taskRuntime.start();
    const intentMessage = taskRuntime.submissionObserved()[0];
    if (intentMessage?.type !== "SUBMISSION_INTENT_OBSERVED") {
      throw new Error("LeetCode.cn submit did not produce an intent");
    }
    const intents = recordSubmissionIntent([], {
      ...intentMessage.intent,
      installationId: "installation_1",
    }, "task_document");

    document.body.innerHTML = [
      '<a href="/problems/find-the-prefix-common-array-of-two-arrays/">',
      "Find the Prefix Common Array of Two Arrays</a>",
      '<div data-e2e-locator="submission-result">执行出错</div>',
    ].join("");
    const resultRuntime = createCaptureContentRuntime({
      detectProblem: () => problem,
      detectVerdict: () => {
        const verdict = detectVerdictFromDocument("leetcode", document);
        return verdict === null
          ? { verdict: null, sourceDocumentId: "result_document" }
          : { verdict: verdict.verdict, sourceDocumentId: "result_document" };
      },
      exactResultPage: () => true,
      now: () => "2026-07-22T01:01:00.000Z",
      createSessionId: () => "unused_session",
      createSubmissionIntentId: () => "unused_submission",
    });
    const candidateMessage = resultRuntime.start()[0];
    if (candidateMessage?.type !== "VERDICT_CANDIDATE_OBSERVED") {
      throw new Error("LeetCode.cn 执行出错 did not produce a verdict candidate");
    }
    const result = consumeVerdictCandidate({
      intents,
      candidate: { ...candidateMessage.candidate, installationId: "installation_1" },
      installationId: "installation_1",
      provenanceLevel: "extension_paired",
    });

    expect(result.intents).toEqual([]);
    expect(result.outboxItem?.bundle.events[2].payload.verdict).toBe("Runtime Error");
  });

  it("consumes a LeetCode.cn TLE after a same-document SPA result transition", () => {
    const problem: DetectedProblem = {
      platform: "leetcode",
      problemExternalId: "two-sum",
      problemTitle: "Two Sum",
      canonicalUrl: "https://leetcode.cn/problems/two-sum/",
    };
    let exactResultPage = false;
    let verdictText: string | null = null;
    const runtime = createCaptureContentRuntime({
      detectProblem: () => problem,
      detectVerdict: () => {
        if (verdictText === null) return { verdict: null, sourceDocumentId: "shared_document" };
        document.body.innerHTML = `<div data-e2e-locator="submission-result">${verdictText}</div>`;
        const verdict = detectVerdictFromDocument("leetcode", document);
        return verdict === null
          ? { verdict: null, sourceDocumentId: "shared_document" }
          : { verdict: verdict.verdict, sourceDocumentId: "shared_document" };
      },
      exactResultPage: () => exactResultPage,
      now: () => exactResultPage
        ? "2026-07-23T00:01:00.000Z"
        : "2026-07-23T00:00:00.000Z",
      createSessionId: () => "session_leetcode_tle",
      createSubmissionIntentId: () => "submission_leetcode_tle",
      activeDocumentId: "shared_document",
    });

    runtime.start();
    const intentMessage = runtime.submissionObserved()[0];
    if (intentMessage?.type !== "SUBMISSION_INTENT_OBSERVED") {
      throw new Error("LeetCode.cn submit did not produce an intent");
    }
    const intents = recordSubmissionIntent([], {
      ...intentMessage.intent,
      installationId: "installation_1",
    }, "shared_document");

    exactResultPage = true;
    verdictText = "超出时间限制";
    const candidateMessage = runtime.locationObserved()[0];
    if (candidateMessage?.type !== "VERDICT_CANDIDATE_OBSERVED") {
      throw new Error("LeetCode.cn SPA TLE did not produce a verdict candidate");
    }
    expect(candidateMessage.candidate.transitionEvidence).toBe("same_document_transition");

    const result = consumeVerdictCandidate({
      intents,
      candidate: { ...candidateMessage.candidate, installationId: "installation_1" },
      installationId: "installation_1",
      provenanceLevel: "extension_paired",
    });
    expect(result.intents).toEqual([]);
    expect(result.outboxItem?.bundle.events[2].payload.verdict).toBe("Time Limit Exceeded");
  });

  it("consumes first-frame TLE from the real problem-scoped LeetCode.cn result route", () => {
    const taskLocation = asLocation("https://leetcode.cn/problems/two-sum/");
    const taskDocument = asDocument("<!doctype html><title>两数之和 - 力扣</title>");
    const taskProblem = detectProblemFromPage(taskLocation, taskDocument);
    if (taskProblem === null) throw new Error("Task route did not resolve two-sum");
    const taskRuntime = createCaptureContentRuntime({
      detectProblem: () => taskProblem,
      detectVerdict: () => ({ verdict: null, sourceDocumentId: "task_document" }),
      exactResultPage: () => false,
      now: () => "2026-07-23T01:00:00.000Z",
      createSessionId: () => "session_leetcode_real_route",
      createSubmissionIntentId: () => "submission_leetcode_real_route",
      activeDocumentId: "task_document",
    });
    taskRuntime.start();
    const intentMessage = taskRuntime.submissionObserved()[0];
    if (intentMessage?.type !== "SUBMISSION_INTENT_OBSERVED") {
      throw new Error("LeetCode.cn submit did not produce an intent");
    }
    const intents = recordSubmissionIntent([], {
      ...intentMessage.intent,
      installationId: "installation_1",
    }, "task_document");

    const resultLocation = asLocation(
      "https://leetcode.cn/problems/two-sum/submissions/737484505/",
    );
    const resultDocument = asDocument([
      "<!doctype html><title>两数之和 - 力扣</title>",
      '<div data-e2e-locator="submission-result">超出时间限制</div>',
    ].join(""));
    const resultRuntime = createCaptureContentRuntime({
      detectProblem: () => detectProblemFromPage(resultLocation, resultDocument),
      detectVerdict: () => {
        const problem = detectProblemFromPage(resultLocation, resultDocument);
        if (problem === null) return null;
        const verdict = detectVerdictFromDocument(problem.platform, resultDocument);
        return verdict === null
          ? { verdict: null, sourceDocumentId: "result_document" }
          : { verdict: verdict.verdict, sourceDocumentId: "result_document" };
      },
      exactResultPage: (problem) => isExactSubmissionResultPage(
        resultLocation,
        resultDocument,
        problem,
      ),
      now: () => "2026-07-23T01:01:00.000Z",
      createSessionId: () => "unused_session",
      createSubmissionIntentId: () => "unused_submission",
      activeDocumentId: "result_document",
    });
    const candidateMessage = resultRuntime.start()[0];
    if (candidateMessage?.type !== "VERDICT_CANDIDATE_OBSERVED") {
      throw new Error("Real LeetCode.cn result route did not produce a candidate");
    }
    const result = consumeVerdictCandidate({
      intents,
      candidate: { ...candidateMessage.candidate, installationId: "installation_1" },
      installationId: "installation_1",
      provenanceLevel: "extension_paired",
    });

    expect(candidateMessage.candidate.transitionEvidence).toBe("exact_result_document");
    expect(result.intents).toEqual([]);
    expect(result.outboxItem?.bundle.events[2].payload.verdict).toBe("Time Limit Exceeded");
  });

  it("recovers a stored LeetCode.cn intent from the selected submission-detail tab on the restored problem URL", () => {
    const taskLocation = asLocation("https://leetcode.cn/problems/two-sum/");
    const taskDocument = asDocument("<!doctype html><title>两数之和 - 力扣</title>");
    const taskProblem = detectProblemFromPage(taskLocation, taskDocument);
    if (taskProblem === null) throw new Error("Task route did not resolve two-sum");
    const intents = recordSubmissionIntent([], {
      installationId: "installation_1",
      platform: "leetcode",
      problemExternalId: "two-sum",
      problemTitle: "两数之和",
      canonicalUrl: "https://leetcode.cn/problems/two-sum/",
      captureSessionId: "session_leetcode_restored_tab",
      submissionId: "submission_leetcode_restored_tab",
      occurredAt: "2026-07-23T02:00:00.000Z",
    }, "task_document");

    const resultDocument = asDocument([
      "<!doctype html><title>两数之和 - 力扣</title>",
      '<div id="submission-detail_tabbar_outer">',
      '  <div class="flexlayout__tab_button flexlayout__tab_button--selected">',
      '    <div id="submission-detail_tab">',
      '      <div class="relative">',
      '        <div>超出时间限制</div>',
      '        <div>超出时间限制</div>',
      "      </div>",
      "    </div>",
      "  </div>",
      "</div>",
    ].join(""));
    const resultProblem = detectProblemFromPage(taskLocation, resultDocument);
    if (resultProblem === null) throw new Error("Restored result surface did not resolve two-sum");
    const verdict = detectVerdictFromDocument("leetcode", resultDocument);
    if (verdict === null) throw new Error("Restored result surface did not expose a verdict");
    const resultRuntime = createCaptureContentRuntime({
      detectProblem: () => resultProblem,
      detectVerdict: () => ({ verdict: verdict.verdict, sourceDocumentId: "restored_document" }),
      exactResultPage: (problem) => isExactSubmissionResultPage(
        taskLocation,
        resultDocument,
        problem,
      ),
      now: () => "2026-07-23T02:01:00.000Z",
      createSessionId: () => "unused_session",
      createSubmissionIntentId: () => "unused_submission",
      activeDocumentId: "restored_document",
    });
    const candidateMessage = resultRuntime.start()[0];
    if (candidateMessage?.type !== "VERDICT_CANDIDATE_OBSERVED") {
      throw new Error("Restored LeetCode.cn result surface did not produce a candidate");
    }
    const consumed = consumeVerdictCandidate({
      intents,
      candidate: { ...candidateMessage.candidate, installationId: "installation_1" },
      installationId: "installation_1",
      provenanceLevel: "extension_paired",
    });

    expect(candidateMessage.candidate.transitionEvidence).toBe("exact_result_document");
    expect(consumed.intents).toEqual([]);
    expect(consumed.outboxItem?.bundle.events[2].payload.verdict).toBe("Time Limit Exceeded");
  });

  it("recovers when a cross-document verdict candidate is delivered before its intent", () => {
    const early = consumeVerdictCandidate({
      intents: [],
      candidate,
      installationId: "installation_1",
      provenanceLevel: "extension_paired",
    });
    expect(early.outboxItem).toBeUndefined();

    const intents = recordSubmissionIntent(
      early.intents,
      draft,
      "task_document",
    ) as readonly PendingSubmissionIntent[];
    const recovered = consumeVerdictCandidate({
      intents,
      candidate,
      installationId: "installation_1",
      provenanceLevel: "extension_paired",
    });
    expect(recovered.intents).toEqual([]);
    expect(recovered.outboxItem?.bundle.bundleId).toBe("bundle_submission_1");
  });

  it("does not match a historical candidate observed before the submit", () => {
    const intents = recordSubmissionIntent([], draft, "task_document");
    const result = consumeVerdictCandidate({
      intents,
      candidate: { ...candidate, observedAt: "2026-07-20T23:59:59.000Z" },
      installationId: "installation_1",
      provenanceLevel: "extension_paired",
    });
    expect(result.outboxItem).toBeUndefined();
    expect(result.intents[0]?.status).toBe("active");
  });

  it("preserves trusted document identity when rematching an early same-document candidate", () => {
    const intents = recordSubmissionIntent([], draft, "intent_document");
    const result = consumeVerdictCandidate({
      intents,
      candidate: {
        ...candidate,
        transitionEvidence: "same_document_transition",
        sourceDocumentId: "candidate_document",
      },
      installationId: "installation_1",
      provenanceLevel: "extension_paired",
    });
    expect(result.outboxItem).toBeUndefined();
    expect(result.intents[0]?.status).toBe("active");
  });

  it("rejects an exact-result candidate from the submit document or after 24 hours", () => {
    const intents = recordSubmissionIntent([], draft, "task_document");
    expect(consumeVerdictCandidate({
      intents,
      candidate: { ...candidate, sourceDocumentId: "task_document" },
      installationId: "installation_1",
      provenanceLevel: "extension_paired",
    }).outboxItem).toBeUndefined();
    expect(consumeVerdictCandidate({
      intents,
      candidate: { ...candidate, observedAt: "2026-07-22T00:00:01.000Z" },
      installationId: "installation_1",
      provenanceLevel: "extension_paired",
    }).outboxItem).toBeUndefined();
  });
});
