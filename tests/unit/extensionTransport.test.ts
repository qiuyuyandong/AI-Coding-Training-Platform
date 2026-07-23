import { describe, expect, it, vi } from "vitest";
import { captureAttemptEndpoint, postCaptureAttemptBundle } from "@/extension/src/captureTransport";
import { buildCaptureAttemptBundle } from "@/extension/src/attemptStorage";
import type { PendingSubmissionIntent } from "@/extension/src/attemptCapture";

const intent: PendingSubmissionIntent = {
  installationId: "installation_1", platform: "atcoder", problemExternalId: "abc100_a",
  problemTitle: "A", canonicalUrl: "https://atcoder.jp/contests/abc100/tasks/abc100_a",
  captureSessionId: "session_1", submissionId: "submission_1",
  occurredAt: "2026-07-21T00:00:00.000Z", status: "active",
};
const bundle = buildCaptureAttemptBundle(intent, {
  installationId: "installation_1", platform: "atcoder", problemExternalId: "abc100_a",
  verdict: "Accepted", observedAt: "2026-07-21T00:01:00.000Z",
  transitionEvidence: "exact_result_document",
}, "extension_paired");

describe("capture attempt transport", () => {
  it("derives only the local attempts endpoint", () => {
    expect(captureAttemptEndpoint("http://127.0.0.1:3001/api/capture/events"))
      .toBe("http://127.0.0.1:3001/api/capture/attempts");
    expect(captureAttemptEndpoint("https://evil.example/upload"))
      .toBe("http://localhost:3000/api/capture/attempts");
  });

  it("validates successful ACK identity", async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({
      ok: true, bundleId: bundle.bundleId, captureSessionId: "session_1",
      attemptId: "attempt_1", attemptStatus: "passed", replayed: false,
    }), { status: 200, headers: { "content-type": "application/json" } }));
    expect(await postCaptureAttemptBundle({ bundle, endpoint: undefined, credential: "capture_secret", fetchImpl }))
      .toMatchObject({ status: 200, ack: { bundleId: bundle.bundleId } });
  });

  it("classifies a mismatched HTTP 200 ACK without treating it as success", async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({
      ok: true, bundleId: "bundle_other", captureSessionId: "session_1",
      attemptId: "attempt_1", attemptStatus: "passed", replayed: true,
    }), { status: 200, headers: { "content-type": "application/json" } }));
    expect(await postCaptureAttemptBundle({
      bundle, endpoint: undefined, credential: "capture_secret", fetchImpl,
    })).toEqual({
      status: "ack_error",
      error: `ACK mismatch: expected bundle ${bundle.bundleId}, received bundle_other`,
    });
  });

  it("classifies network and item errors", async () => {
    const bad = vi.fn(async () => new Response(JSON.stringify({ error: "bad" }), { status: 400 }));
    expect(await postCaptureAttemptBundle({ bundle, endpoint: undefined, credential: undefined, fetchImpl: bad }))
      .toEqual({ status: 400, error: "bad" });
    const offline = vi.fn(async () => { throw new Error("offline"); });
    expect(await postCaptureAttemptBundle({ bundle, endpoint: undefined, credential: undefined, fetchImpl: offline }))
      .toEqual({ status: "network_error", error: "offline" });
  });
});
