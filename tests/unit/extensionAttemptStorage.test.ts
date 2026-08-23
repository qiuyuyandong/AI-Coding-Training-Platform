import { describe, expect, it } from "vitest";
import {
  buildCaptureAttemptBundle,
  consumeVerdictCandidate,
  expireSubmissionIntents,
  recordSubmissionIntent,
} from "@/extension/src/attemptStorage";
import type { PendingSubmissionIntent, SubmissionIntentDraft } from "@/extension/src/attemptCapture";

function draft(submissionId = "submission_1"): SubmissionIntentDraft {
  return {
    installationId: "installation_1",
    platform: "atcoder",
    problemExternalId: "abc100_a",
    problemTitle: "A",
    canonicalUrl: "https://atcoder.jp/contests/abc100/tasks/abc100_a",
    captureSessionId: `session_${submissionId}`,
    submissionId,
    occurredAt: "2026-07-21T00:00:00.000Z",
    baselineVerdict: "Accepted",
  };
}

function active(submissionId = "submission_1"): PendingSubmissionIntent {
  return { ...draft(submissionId), sourceDocumentId: "doc_1", status: "active" };
}

const candidate = {
  installationId: "installation_1",
  platform: "atcoder" as const,
  problemExternalId: "abc100_a",
  verdict: "Accepted",
  observedAt: "2026-07-21T00:01:00.000Z",
  transitionEvidence: "same_document_transition" as const,
  sourceDocumentId: "doc_1",
};

describe("attempt storage", () => {
  it("supersedes an older active intent for the same problem", () => {
    const result = recordSubmissionIntent([active()], draft("submission_2"), "doc_1");
    expect(result.map((intent) => intent.status)).toEqual(["superseded", "active"]);
  });

  it("ignores unmatched, old, and cross-document same-page verdicts", () => {
    expect(consumeVerdictCandidate({
      intents: [active()], candidate: { ...candidate, problemExternalId: "other" },
      installationId: "installation_1", provenanceLevel: "extension_paired",
    }).outboxItem).toBeUndefined();
    expect(consumeVerdictCandidate({
      intents: [active()], candidate: { ...candidate, observedAt: "2026-07-20T23:59:00.000Z" },
      installationId: "installation_1", provenanceLevel: "extension_paired",
    }).outboxItem).toBeUndefined();
    expect(consumeVerdictCandidate({
      intents: [active()], candidate: { ...candidate, sourceDocumentId: "doc_2" },
      installationId: "installation_1", provenanceLevel: "extension_paired",
    }).outboxItem).toBeUndefined();
  });

  it("consumes one intent into one stable ordered bundle", () => {
    const first = consumeVerdictCandidate({
      intents: [active()], candidate,
      installationId: "installation_1", provenanceLevel: "extension_paired",
    });
    expect(first.intents).toEqual([]);
    expect(first.outboxItem?.bundle.events.map((event) => event.type)).toEqual([
      "SESSION_STARTED", "SUBMISSION_OBSERVED", "VERDICT_OBSERVED", "SESSION_ENDED",
    ]);
    expect(first.outboxItem?.bundle.events[3].payload.endReason).toBe("capture_disabled");
    expect(buildCaptureAttemptBundle(active(), candidate, "extension_paired"))
      .toEqual(first.outboxItem?.bundle);
  });

  it("expires active intents after 24 hours", () => {
    expect(expireSubmissionIntents([active()], "2026-07-22T00:00:01.000Z")[0]?.status)
      .toBe("expired");
  });

});
