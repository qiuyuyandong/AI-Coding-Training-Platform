import { describe, expect, it } from "vitest";
import {
  drainCaptureQueue,
  type QueueDrainDependencies,
} from "@/extension/src/queueDrain";
import { createSerializedWorkExecutor } from "@/extension/src/serializedWork";
import {
  MAX_RETRY_ATTEMPTS,
  enqueueCaptureEvent,
  type CaptureQueueItem,
  type FlushResult,
  type QueuePlan,
} from "@/extension/src/transport";
import type { CaptureEvent } from "@/lib/capture/protocol";

function event(id: string): CaptureEvent {
  return {
    schemaVersion: 2,
    id,
    type: "SESSION_STARTED",
    captureSessionId: `session_${id}`,
    installationId: "installation_1",
    adapterVersion: "test@0.2.0",
    parserVersion: "test@0.2.0",
    pageOrigin: "https://leetcode.com",
    provenanceLevel: "extension_unpaired",
    platform: "leetcode",
    problemExternalId: id,
    problemTitle: id,
    canonicalUrl: `https://leetcode.com/problems/${id}/`,
    occurredAt: "2026-07-14T05:00:00.000Z",
    payload: { source: "content_script" },
  };
}

function item(id: string, attempts = 0): CaptureQueueItem {
  return { event: event(id), attempts };
}

type DrainHarness = {
  readonly dependencies: QueueDrainDependencies;
  readonly sent: string[];
  readonly queue: () => readonly CaptureQueueItem[];
};

function createHarness(
  initial: readonly CaptureQueueItem[],
  results: readonly FlushResult[],
): DrainHarness {
  let queue = initial;
  const pendingResults = [...results];
  const sent: string[] = [];
  return {
    dependencies: {
      readQueue: async () => queue,
      send: async (captureEvent) => {
        sent.push(captureEvent.id);
        return pendingResults.shift() ?? { status: 200 };
      },
      persist: async (plan: QueuePlan) => {
        queue = plan.queue;
      },
    },
    sent,
    queue: () => queue,
  };
}

describe("capture queue drain", () => {
  it("delivers queued events in FIFO order until empty", async () => {
    const harness = createHarness([item("evt_1"), item("evt_2"), item("evt_3")], []);

    const outcome = await drainCaptureQueue(harness.dependencies);

    expect(outcome).toEqual({ reason: "empty", processed: 3 });
    expect(harness.sent).toEqual(["evt_1", "evt_2", "evt_3"]);
    expect(harness.queue()).toEqual([]);
  });

  it("drops permanent failures and continues draining", async () => {
    const harness = createHarness(
      [item("evt_1"), item("evt_2"), item("evt_3")],
      [
        { status: 400, error: "invalid" },
        { status: 409, error: "conflict" },
        { status: 200 },
      ],
    );

    const outcome = await drainCaptureQueue(harness.dependencies);

    expect(outcome).toEqual({ reason: "empty", processed: 3 });
    expect(harness.sent).toEqual(["evt_1", "evt_2", "evt_3"]);
    expect(harness.queue()).toEqual([]);
  });

  it("stops behind a retryable server failure", async () => {
    const harness = createHarness(
      [item("evt_1"), item("evt_2")],
      [{ status: 500, error: "server failed" }],
    );

    const outcome = await drainCaptureQueue(harness.dependencies);

    expect(outcome).toEqual({ reason: "blocked", processed: 1 });
    expect(harness.sent).toEqual(["evt_1"]);
    expect(harness.queue()[0]).toMatchObject({ attempts: 1 });
    expect(harness.queue()[1]?.event.id).toBe("evt_2");
  });

  it("drops a capped server failure and continues", async () => {
    const harness = createHarness(
      [item("evt_1", MAX_RETRY_ATTEMPTS - 1), item("evt_2")],
      [{ status: 500, error: "server failed" }, { status: 200 }],
    );

    const outcome = await drainCaptureQueue(harness.dependencies);

    expect(outcome).toEqual({ reason: "empty", processed: 2 });
    expect(harness.sent).toEqual(["evt_1", "evt_2"]);
    expect(harness.queue()).toEqual([]);
  });

  it("retains the head and stops on network failure", async () => {
    const harness = createHarness(
      [item("evt_1"), item("evt_2")],
      [{ status: "network_error", error: "offline" }],
    );

    const outcome = await drainCaptureQueue(harness.dependencies);

    expect(outcome).toEqual({ reason: "blocked", processed: 1 });
    expect(harness.sent).toEqual(["evt_1"]);
    expect(harness.queue()[0]).toMatchObject({ attempts: 1 });
  });

  it("returns batch_limit with later events still queued", async () => {
    const harness = createHarness([item("evt_1"), item("evt_2"), item("evt_3")], []);

    const outcome = await drainCaptureQueue(harness.dependencies, 2);

    expect(outcome).toEqual({ reason: "batch_limit", processed: 2 });
    expect(harness.sent).toEqual(["evt_1", "evt_2"]);
    expect(harness.queue().map((queued) => queued.event.id)).toEqual(["evt_3"]);
  });

  it("does not overwrite an event scheduled while drain is awaiting delivery", async () => {
    let queue: readonly CaptureQueueItem[] = [item("evt_1")];
    let releaseSend: () => void = () => undefined;
    let markSendStarted: () => void = () => undefined;
    const sendGate = new Promise<void>((resolve) => {
      releaseSend = resolve;
    });
    const sendStarted = new Promise<void>((resolve) => {
      markSendStarted = resolve;
    });
    const sent: string[] = [];
    const dependencies: QueueDrainDependencies = {
      readQueue: async () => queue,
      send: async (captureEvent) => {
        sent.push(captureEvent.id);
        if (captureEvent.id === "evt_1") {
          markSendStarted();
          await sendGate;
        }
        return { status: 200 };
      },
      persist: async (plan) => {
        queue = plan.queue;
      },
    };
    const executor = createSerializedWorkExecutor(
      Promise.resolve(),
      () => undefined,
    );

    executor.schedule(async () => {
      await drainCaptureQueue(dependencies);
    });
    await sendStarted;
    executor.schedule(async () => {
      queue = enqueueCaptureEvent(queue, event("evt_2"));
      await drainCaptureQueue(dependencies);
    });
    releaseSend();
    await executor.idle();

    expect(sent).toEqual(["evt_1", "evt_2"]);
    expect(queue).toEqual([]);
  });
});
