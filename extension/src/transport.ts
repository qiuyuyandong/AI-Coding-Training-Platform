import { CaptureEventSchema, type CaptureEvent } from "@/lib/capture/events";

export const CAPTURE_QUEUE_LIMIT = 100;

export type CaptureMessage = { readonly type: "CAPTURE_EVENT"; readonly event: CaptureEvent };

export type CaptureQueueItem = {
  readonly event: CaptureEvent;
  readonly attempts: number;
};

export type FlushResult =
  | { readonly status: 200 }
  | { readonly status: 400; readonly error: string }
  | { readonly status: 500; readonly error: string }
  | { readonly status: "network_error"; readonly error: string };

export type QueuePlan = {
  readonly queue: readonly CaptureQueueItem[];
  readonly lastCaptureError?: string;
  readonly lastSuccessfulCaptureAt?: string;
};

export function isCaptureMessage(value: unknown): value is CaptureMessage {
  return (
    typeof value === "object" &&
    value !== null &&
    "type" in value &&
    value.type === "CAPTURE_EVENT" &&
    "event" in value &&
    CaptureEventSchema.safeParse(value.event).success
  );
}

export function enqueueCaptureEvent(queue: readonly CaptureQueueItem[], event: CaptureEvent): readonly CaptureQueueItem[] {
  return [...queue, { event, attempts: 0 }].slice(-CAPTURE_QUEUE_LIMIT);
}

export function planQueueAfterFlush(queue: readonly CaptureQueueItem[], result: FlushResult): QueuePlan {
  if (queue.length === 0) return { queue };

  const [head, ...rest] = queue;

  if (result.status === 200) {
    return { queue: rest, lastSuccessfulCaptureAt: new Date().toISOString() };
  }

  if (result.status === 400) {
    return { queue: rest, lastCaptureError: `Validation error: ${result.error}` };
  }

  if (head === undefined) return { queue };

  return {
    queue: [{ ...head, attempts: head.attempts + 1 }, ...rest],
    lastCaptureError: result.error,
  };
}
