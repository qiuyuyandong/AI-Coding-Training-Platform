import { describe, expect, it, vi } from "vitest";
import {
  DEFAULT_CAPTURE_ENDPOINT,
  captureAttemptEndpoint,
  postCaptureAttemptBundle,
  readCaptureEndpoint,
} from "@/extension/src/captureTransport";
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
    expect(captureAttemptEndpoint("https://leetcode.com/api/capture/events"))
      .toBe("http://localhost:3000/api/capture/attempts");
    expect(readCaptureEndpoint("http://[::1]:4173/api/capture/events"))
      .toBe("http://[::1]:4173/api/capture/events");
    expect(readCaptureEndpoint("https://localhost:3000/api/capture/events"))
      .toBe(DEFAULT_CAPTURE_ENDPOINT);
  });

  it("never sends a bundle or credential to a configured remote OJ origin", async () => {
    const fetchImpl = vi.fn(async () => new Response("", { status: 500 }));
    await postCaptureAttemptBundle({
      bundle,
      endpoint: "https://leetcode.com/api/capture/events",
      credential: "capture_secret",
      fetchImpl,
    });
    expect(fetchImpl).toHaveBeenCalledWith(
      "http://localhost:3000/api/capture/attempts",
      expect.objectContaining({ headers: expect.objectContaining({ authorization: "Bearer capture_secret" }) }),
    );
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
      error: "ACK mismatch: bundle identity",
    });
  });

  it("classifies network and item errors without retaining response or exception text", async () => {
    const response = new Response(JSON.stringify({
      error: "token=secret; source code and full problem statement",
    }), { status: 400 });
    const json = vi.spyOn(response, "json");
    const bad = vi.fn(async () => response);
    expect(await postCaptureAttemptBundle({ bundle, endpoint: undefined, credential: undefined, fetchImpl: bad }))
      .toEqual({ status: 400, error: "HTTP 400" });
    expect(json).not.toHaveBeenCalled();
    const offline = vi.fn(async () => { throw new Error("token=secret"); });
    expect(await postCaptureAttemptBundle({ bundle, endpoint: undefined, credential: undefined, fetchImpl: offline }))
      .toEqual({ status: "network_error", error: "Network request failed" });
  });
});
