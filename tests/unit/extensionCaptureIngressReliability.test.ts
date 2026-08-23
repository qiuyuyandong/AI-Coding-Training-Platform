import { describe, expect, it } from "vitest";
import {
  CAPTURE_INGRESS_RETRY_DELAYS_MS,
  createCaptureIngressQueue,
  isCaptureIngressAck,
} from "@/extension/src/captureIngressReliability";

describe("capture ingress acknowledgement", () => {
  it("accepts only the closed persisted, paused, and fixed failure shapes", () => {
    expect(isCaptureIngressAck({ schemaVersion: 1, ok: true, status: "persisted" })).toBe(true);
    expect(isCaptureIngressAck({ schemaVersion: 1, ok: true, status: "paused" })).toBe(true);
    expect(isCaptureIngressAck({ schemaVersion: 1, ok: false, error: "initialization_failed" })).toBe(true);
    expect(isCaptureIngressAck({ schemaVersion: 1, ok: false, error: "persistence_failed" })).toBe(true);
    expect(isCaptureIngressAck({ schemaVersion: 1, ok: true, status: "persisted", detail: "raw" })).toBe(false);
    expect(isCaptureIngressAck({ schemaVersion: 1, ok: false, error: "raw exception" })).toBe(false);
  });

  it("keeps FIFO order and the original message identity across three bounded attempts", async () => {
    const first = Object.freeze({ type: "first", id: "stable_1" });
    const second = Object.freeze({ type: "second", id: "stable_2" });
    const sent: object[] = [];
    const waits: number[] = [];
    let firstAttempts = 0;
    const queue = createCaptureIngressQueue<object>({
      send: async (message) => {
        sent.push(message);
        if (message === first) {
          firstAttempts += 1;
          if (firstAttempts === 1) {
            return { schemaVersion: 1, ok: false, error: "initialization_failed" };
          }
          if (firstAttempts === 2) {
            return { schemaVersion: 1, ok: false, error: "persistence_failed" };
          }
          return { schemaVersion: 1, ok: true, status: "persisted" };
        }
        return { schemaVersion: 1, ok: true, status: "paused" };
      },
      wait: async (milliseconds) => { waits.push(milliseconds); },
      isContextInvalidated: () => false,
      onDeliveryBlocked: () => undefined,
    });

    expect(queue.enqueue(first)).toBe(true);
    expect(queue.enqueue(second)).toBe(true);
    await queue.idle();

    expect(sent).toEqual([first, first, first, second]);
    expect(sent.slice(0, 3).every((message) => message === first)).toBe(true);
    expect(waits).toEqual([250, 1_000, 4_000, 250]);
    expect(CAPTURE_INGRESS_RETRY_DELAYS_MS).toEqual([250, 1_000, 4_000]);
    expect(queue.size()).toBe(0);
  });

  it("bounds the in-memory queue at eight and never persists an overflow", async () => {
    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const queue = createCaptureIngressQueue<{ readonly id: number }>({
      send: async () => ({ schemaVersion: 1, ok: true, status: "persisted" }),
      wait: async () => gate,
      isContextInvalidated: () => false,
      onDeliveryBlocked: () => undefined,
    });
    for (let id = 0; id < 8; id += 1) expect(queue.enqueue({ id })).toBe(true);
    expect(queue.enqueue({ id: 8 })).toBe(false);
    expect(queue.size()).toBe(8);
    release();
    await queue.idle();
    expect(queue.size()).toBe(0);
  });

  it("stops retries and clears transient work when the extension context is invalidated", async () => {
    const blocked: string[] = [];
    const queued = [{ id: 1 }, { id: 2 }];
    const queue = createCaptureIngressQueue<object>({
      send: async () => { throw new Error("context gone"); },
      wait: async () => undefined,
      isContextInvalidated: () => true,
      onDeliveryBlocked: (reason) => { blocked.push(reason); },
    });
    expect(queue.enqueue(queued[0])).toBe(true);
    expect(queue.enqueue(queued[1])).toBe(true);
    await queue.idle();
    expect(blocked).toEqual([]);
    expect(queue.stopped()).toBe(true);
    expect(queue.size()).toBe(0);
  });

  it("retains the original candidate after three fixed failures and stops automatic retries", async () => {
    const candidate = Object.freeze({ id: "candidate_1" });
    const sent: object[] = [];
    const blocked: string[] = [];
    const queue = createCaptureIngressQueue<object>({
      send: async (message) => {
        sent.push(message);
        return { schemaVersion: 1, ok: false, error: "persistence_failed" };
      },
      wait: async () => undefined,
      isContextInvalidated: () => false,
      onDeliveryBlocked: (reason) => { blocked.push(reason); },
    });

    expect(queue.enqueue(candidate)).toBe(true);
    await queue.idle();

    expect(sent).toEqual([candidate, candidate, candidate]);
    expect(blocked).toEqual(["persistence_failed"]);
    expect(queue.size()).toBe(1);
    expect(queue.stopped()).toBe(false);
    expect(queue.enqueue({ id: "candidate_2" })).toBe(false);
    await queue.idle();
    expect(sent).toHaveLength(3);
  });
});
