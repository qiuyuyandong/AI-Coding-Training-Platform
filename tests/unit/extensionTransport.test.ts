import { describe, expect, it } from "vitest";
import {
  CAPTURE_QUEUE_LIMIT,
  enqueueCaptureEvent,
  isCaptureMessage,
  planQueueAfterFlush,
  type CaptureQueueItem,
} from "@/extension/src/transport";
import type { CaptureEvent } from "@/lib/capture/events";

function event(id: string): CaptureEvent {
  return {
    id,
    type: "PAGE_DETECTED",
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

  it("keeps retryable failures", () => {
    const result = planQueueAfterFlush([{ event: event("evt_1"), attempts: 0 }], { status: 500, error: "server failed" });

    expect(result.queue).toHaveLength(1);
    expect(result.queue[0]?.attempts).toBe(1);
  });
});
