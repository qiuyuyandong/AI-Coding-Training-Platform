import { describe, expect, it } from "vitest";
import {
  CAPTURE_QUEUE_LIMIT,
  MAX_RETRY_ATTEMPTS,
  enqueueCaptureEvent,
  captureRequestHeaders,
  isCaptureMessage,
  isQueueItem,
  planQueueAfterFlush,
  readCaptureEndpoint,
  type CaptureQueueItem,
} from "@/extension/src/transport";
import type { CaptureEvent } from "@/lib/capture/events";

function event(id: string): CaptureEvent {
  return {
    schemaVersion: 2,
    id,
    type: "SESSION_STARTED",
    captureSessionId: "session_1",
    installationId: "installation_1",
    adapterVersion: "leetcode@0.1.0",
    parserVersion: "verdict@0.1.0",
    pageOrigin: "https://leetcode.com",
    provenanceLevel: "extension_unpaired",
    platform: "leetcode",
    problemExternalId: "two-sum",
    problemTitle: "Two Sum",
    canonicalUrl: "https://leetcode.com/problems/two-sum/",
    occurredAt: "2026-07-06T00:00:00.000Z",
    payload: { source: "content_script" },
  };
}

describe("isCaptureMessage", () => {
  it("accepts capture messages", () => {
    expect(isCaptureMessage({ type: "CAPTURE_EVENT", event: event("evt_1") })).toBe(true);
  });

  it("rejects malformed messages", () => {
    expect(isCaptureMessage({ type: "OTHER", event: event("evt_1") })).toBe(false);
    expect(isCaptureMessage(null)).toBe(false);
  });
});

describe("enqueueCaptureEvent", () => {
  it("keeps only the most recent queue items", () => {
    const existing = Array.from(
      { length: CAPTURE_QUEUE_LIMIT },
      (_, index): CaptureQueueItem => ({ event: event(`evt_${index}`), attempts: 0 }),
    );

    const next = enqueueCaptureEvent(existing, event("evt_new"));

    expect(next).toHaveLength(CAPTURE_QUEUE_LIMIT);
    expect(next.at(-1)?.event.id).toBe("evt_new");
    expect(next[0]?.event.id).toBe("evt_1");
  });
});

describe("readCaptureEndpoint", () => {
  it("uses localhost when no endpoint is configured", () => {
    expect(readCaptureEndpoint(undefined)).toBe("http://localhost:3000/api/capture/events");
  });

  it("uses configured HTTP endpoints", () => {
    expect(readCaptureEndpoint("http://127.0.0.1:3001/api/capture/events")).toBe("http://127.0.0.1:3001/api/capture/events");
  });

  it("falls back to localhost for malformed endpoints", () => {
    expect(readCaptureEndpoint("not a url")).toBe("http://localhost:3000/api/capture/events");
  });
});

describe("captureRequestHeaders", () => {
  it("adds bearer authorization only for capture credentials", () => {
    expect(captureRequestHeaders("capture_secret")).toEqual({
      "content-type": "application/json",
      authorization: "Bearer capture_secret",
    });
    expect(captureRequestHeaders(undefined)).toEqual({
      "content-type": "application/json",
    });
  });
});

describe("planQueueAfterFlush", () => {
  it("removes delivered events", () => {
    const result = planQueueAfterFlush([{ event: event("evt_1"), attempts: 0 }], { status: 200 });

    expect(result.queue).toEqual([]);
    expect(result.lastSuccessfulCaptureAt).toBeDefined();
  });

  it("drops validation errors", () => {
    const result = planQueueAfterFlush([{ event: event("evt_1"), attempts: 0 }], { status: 400, error: "bad payload" });

    expect(result.queue).toEqual([]);
    expect(result.lastCaptureError).toContain("bad payload");
  });

  it("retains authentication failures without consuming retry budget", () => {
    const queue = [{ event: event("evt_1"), attempts: 2 }];
    const result = planQueueAfterFlush(queue, {
      status: 401,
      error: "not authorized",
    });

    expect(result.queue).toEqual(queue);
    expect(result.queue[0]?.attempts).toBe(2);
    expect(result.lastCaptureError).toContain("Pairing required");
  });

  it("drops conflicting events instead of retrying them forever", () => {
    const result = planQueueAfterFlush(
      [{ event: event("evt_1"), attempts: 0 }],
      { status: 409, error: "event id conflicts with an existing payload" },
    );

    expect(result.queue).toEqual([]);
    expect(result.lastCaptureError).toContain("conflicts");
  });

  it("keeps retryable failures", () => {
    const result = planQueueAfterFlush([{ event: event("evt_1"), attempts: 0 }], { status: 500, error: "server failed" });

    expect(result.queue).toHaveLength(1);
    expect(result.queue[0]?.attempts).toBe(1);
  });

  it("keeps network_error retryable failures and increments attempts when below cap", () => {
    const result = planQueueAfterFlush(
      [{ event: event("evt_1"), attempts: 0 }],
      { status: "network_error", error: "fetch failed" },
    );

    expect(result.queue).toHaveLength(1);
    expect(result.queue[0]?.attempts).toBe(1);
    expect(result.queue[0]?.event.id).toBe("evt_1");
    expect(result.lastCaptureError).toBe("fetch failed");
  });

  it("keeps retryable failures when incremented attempts is below the cap", () => {
    const result = planQueueAfterFlush(
      [{ event: event("evt_1"), attempts: MAX_RETRY_ATTEMPTS - 2 }],
      { status: 500, error: "server failed" },
    );

    expect(result.queue).toHaveLength(1);
    expect(result.queue[0]?.attempts).toBe(MAX_RETRY_ATTEMPTS - 1);
    expect(result.lastCaptureError).toBe("server failed");
  });

  it("keeps network_error failures when incremented attempts is below the cap", () => {
    const result = planQueueAfterFlush(
      [{ event: event("evt_1"), attempts: MAX_RETRY_ATTEMPTS - 2 }],
      { status: "network_error", error: "fetch failed" },
    );

    expect(result.queue).toHaveLength(1);
    expect(result.queue[0]?.attempts).toBe(MAX_RETRY_ATTEMPTS - 1);
    expect(result.lastCaptureError).toBe("fetch failed");
  });

  it("drops 500 failures once the incremented attempts reaches the cap", () => {
    const result = planQueueAfterFlush(
      [{ event: event("evt_1"), attempts: MAX_RETRY_ATTEMPTS - 1 }],
      { status: 500, error: "server failed" },
    );

    expect(result.queue).toEqual([]);
    expect(result.lastCaptureError).toBe("server failed");
  });

  it("keeps network_error failures queued when the local app remains unavailable", () => {
    const result = planQueueAfterFlush(
      [{ event: event("evt_1"), attempts: MAX_RETRY_ATTEMPTS - 1 }],
      { status: "network_error", error: "fetch failed" },
    );

    expect(result.queue).toHaveLength(1);
    expect(result.queue[0]?.attempts).toBe(MAX_RETRY_ATTEMPTS);
    expect(result.lastCaptureError).toBe("fetch failed");
  });
});

describe("isQueueItem", () => {
  it("accepts a valid queue item", () => {
    expect(isQueueItem({ event: event("evt_1"), attempts: 0 })).toBe(true);
  });

  it("rejects null and non-object values", () => {
    expect(isQueueItem(null)).toBe(false);
    expect(isQueueItem(undefined)).toBe(false);
    expect(isQueueItem("evt_1")).toBe(false);
    expect(isQueueItem(42)).toBe(false);
  });

  it("rejects items missing the event field", () => {
    expect(isQueueItem({ attempts: 0 })).toBe(false);
  });

  it("rejects items with an invalid event payload", () => {
    expect(isQueueItem({ event: { id: "evt_1" }, attempts: 0 })).toBe(false);
  });

  it("rejects queued V1 events after the protocol cutover", () => {
    expect(isQueueItem({
      event: {
        id: "evt_v1",
        type: "PAGE_DETECTED",
        platform: "leetcode",
        problemExternalId: "two-sum",
        occurredAt: "2026-07-06T00:00:00.000Z",
        payload: {},
      },
      attempts: 0,
    })).toBe(false);
  });

  it("rejects items with non-number attempts", () => {
    expect(isQueueItem({ event: event("evt_1"), attempts: "0" })).toBe(false);
    expect(isQueueItem({ event: event("evt_1") })).toBe(false);
  });
});
