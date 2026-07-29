import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  consumeVerdictCandidate,
  recordSubmissionIntent,
} from "@/extension/src/attemptStorage";
import { createCaptureContentRuntime } from "@/extension/src/contentRuntime";
import type {
  SubmissionIntentDraft,
  VerdictCandidateMessage,
} from "@/extension/src/attemptCapture";
import type { DetectedProblem } from "@/extension/src/platforms";
import {
  INITIAL_STATE,
  isContentRuntimeReadyMessage,
  reduceIngress,
} from "@/extension/src/contentIngress";

const problem: DetectedProblem = {
  platform: "atcoder",
  problemExternalId: "abc100_a",
  problemTitle: "A",
  canonicalUrl: "https://atcoder.jp/contests/abc100/tasks/abc100_a",
};

const legacyDraft: SubmissionIntentDraft = {
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

describe("V4 Phase 0 background message boundary", () => {
  it("keeps the exact NowCoder result route in the production manifest", () => {
    const manifest = JSON.parse(readFileSync(
      resolve(process.cwd(), "extension", "manifest.json"),
      "utf8",
    )) as { readonly content_scripts?: readonly { readonly matches?: readonly string[] }[] };
    expect(manifest.content_scripts?.[0]?.matches).toContain(
      "https://ac.nowcoder.com/acm/contest/view-submission*",
    );
  });

  it("treats the closed ready handshake as control plane, not capture state", () => {
    const ready = { type: "CONTENT_RUNTIME_READY", schemaVersion: 1, purpose: "capture" };
    expect(isContentRuntimeReadyMessage(ready)).toBe(true);
    const result = reduceIngress(INITIAL_STATE, {
      kind: "ready",
      tabId: 1,
      frameId: 0,
      documentId: "document_1",
    });
    expect(result.effects).toEqual([{
      type: "ready_record",
      tabId: 1,
      frameId: 0,
      documentId: "document_1",
    }]);
    expect(result.state.committed.size).toBe(0);
  });

  it("emits E0 instead of a click-created submission intent", () => {
    const runtime = createCaptureContentRuntime({
      detectProblem: () => problem,
      detectVerdict: () => ({ verdict: null }),
      exactResultPage: () => false,
      now: () => "2026-07-24T00:00:00.000Z",
    });
    runtime.start();

    const messages = runtime.uiHintObserved();
    expect(messages[0]?.type).toBe("UI_HINT_OBSERVED");
    expect(messages.some((message) =>
      String(Reflect.get(message, "type")) === "SUBMISSION_INTENT_OBSERVED"))
      .toBe(false);
  });

  it("cannot consume E0 or add an outbox item without a stored intent", () => {
    const result = consumeVerdictCandidate({
      intents: [],
      candidate,
      installationId: "installation_1",
      provenanceLevel: "extension_paired",
    });

    expect(result.intents).toEqual([]);
    expect(result.outboxItem).toBeUndefined();
  });

  it("preserves historical V3 bundle construction for already durable state", () => {
    const intents = recordSubmissionIntent([], legacyDraft, "task_document");
    const result = consumeVerdictCandidate({
      intents,
      candidate,
      installationId: "installation_1",
      provenanceLevel: "extension_paired",
    });

    expect(result.intents).toEqual([]);
    expect(result.outboxItem?.bundle.events.map((event) => event.type)).toEqual([
      "SESSION_STARTED",
      "SUBMISSION_OBSERVED",
      "VERDICT_OBSERVED",
      "SESSION_ENDED",
    ]);
  });

  it("does not match a historical candidate observed before the legacy intent", () => {
    const intents = recordSubmissionIntent([], legacyDraft, "task_document");
    const result = consumeVerdictCandidate({
      intents,
      candidate: { ...candidate, observedAt: "2026-07-20T23:59:59.000Z" },
      installationId: "installation_1",
      provenanceLevel: "extension_paired",
    });

    expect(result.outboxItem).toBeUndefined();
    expect(result.intents[0]?.status).toBe("active");
  });
});
