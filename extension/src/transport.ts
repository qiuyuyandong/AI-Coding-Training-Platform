import { z } from "zod";
import { CaptureEventSchema, type CaptureEvent } from "@/lib/capture/events";

export const CAPTURE_QUEUE_LIMIT = 100;
export const MAX_RETRY_ATTEMPTS = 3;
export const DEFAULT_CAPTURE_ENDPOINT = "http://localhost:3000/api/capture/events";

export type CaptureMessage = { readonly type: "CAPTURE_EVENT"; readonly event: CaptureEvent };

export const CaptureQueueItemSchema = z.object({
  event: CaptureEventSchema,
  attempts: z.number().int().min(0),
});

export type CaptureQueueItem = z.infer<typeof CaptureQueueItemSchema>;

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

export function isQueueItem(value: unknown): value is CaptureQueueItem {
  return CaptureQueueItemSchema.safeParse(value).success;
}

export function enqueueCaptureEvent(queue: readonly CaptureQueueItem[], event: CaptureEvent): readonly CaptureQueueItem[] {
  return [...queue, { event, attempts: 0 }].slice(-CAPTURE_QUEUE_LIMIT);
}

export function readCaptureEndpoint(value: unknown): string {
  if (typeof value !== "string") return DEFAULT_CAPTURE_ENDPOINT;

  try {
    const url = new URL(value);
    if (url.protocol !== "http:" && url.protocol !== "https:") return DEFAULT_CAPTURE_ENDPOINT;
    return url.toString();
  } catch (error) {
    if (error instanceof TypeError) return DEFAULT_CAPTURE_ENDPOINT;
    throw error;
  }
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

  const nextAttempts = head.attempts + 1;
  const shouldDrop = result.status === 500 && nextAttempts >= MAX_RETRY_ATTEMPTS;
  const nextQueue = shouldDrop ? rest : [{ ...head, attempts: nextAttempts }, ...rest];

  return { queue: nextQueue, lastCaptureError: result.error };
}
