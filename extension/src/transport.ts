import { z } from "zod";
import { CaptureEventSchema, type CaptureEvent } from "@/lib/capture/events";
import { AttemptResultSchema } from "@/lib/domain/training";

export const CAPTURE_QUEUE_LIMIT = 100;
export const MAX_RETRY_ATTEMPTS = 3;
export const DEFAULT_CAPTURE_ENDPOINT = "http://localhost:3000/api/capture/events";

export type CaptureMessage = { readonly type: "CAPTURE_EVENT"; readonly event: CaptureEvent };

export const CaptureQueueItemSchema = z.object({
  event: CaptureEventSchema,
  attempts: z.number().int().min(0),
});

export type CaptureQueueItem = z.infer<typeof CaptureQueueItemSchema>;

export const CaptureSuccessAckSchema = z.object({
  ok: z.literal(true),
  eventId: z.string().min(1),
  captureSessionId: z.string().min(1),
  attemptId: z.string().min(1).optional(),
  attemptStatus: AttemptResultSchema.optional(),
  replayed: z.boolean(),
}).strict().superRefine((ack, context) => {
  if ((ack.attemptId === undefined) !== (ack.attemptStatus === undefined)) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Attempt acknowledgement id and status must be present together",
    });
  }
});

export type CaptureSuccessAck = z.infer<typeof CaptureSuccessAckSchema>;

export type FlushResult =
  | { readonly status: 200; readonly ack: CaptureSuccessAck }
  | { readonly status: 401; readonly error: string }
  | { readonly status: 403; readonly error: string }
  | { readonly status: 400; readonly error: string }
  | { readonly status: 413; readonly error: string }
  | { readonly status: 415; readonly error: string }
  | { readonly status: 409; readonly error: string }
  | { readonly status: 500; readonly error: string }
  | { readonly status: "network_error"; readonly error: string };

export type QueuePlan = {
  readonly queue: readonly CaptureQueueItem[];
  readonly lastCaptureError?: string;
  readonly clearLastCaptureError?: boolean;
  readonly lastSuccessfulCaptureAt?: string;
  readonly lastDeliveredEventType?: CaptureEvent["type"];
  readonly lastDeliveredEventId?: string;
  readonly lastDeliveredEventOccurredAt?: string;
  readonly lastDeliveredAttemptId?: string;
  readonly lastDeliveredAttemptStatus?: CaptureSuccessAck["attemptStatus"];
  readonly lastDeliveredCreatedAttempt?: boolean;
  readonly clearLastDeliveredAttempt?: boolean;
};

export function parseCaptureSuccessAck(value: unknown): CaptureSuccessAck {
  return CaptureSuccessAckSchema.parse(value);
}

export function flushResultFromSuccessResponse(
  value: unknown,
  event: CaptureEvent,
): FlushResult {
  const parsed = CaptureSuccessAckSchema.safeParse(value);
  if (!parsed.success) {
    return {
      status: 500,
      error: `Success ACK validation failed: ${parsed.error.message}`,
    };
  }
  if (
    parsed.data.eventId !== event.id
    || parsed.data.captureSessionId !== event.captureSessionId
  ) {
    return {
      status: 500,
      error: "Success ACK validation failed: event identity did not match",
    };
  }
  return { status: 200, ack: parsed.data };
}

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

export function captureRequestHeaders(
  credential: unknown,
): Record<string, string> {
  const headers: Record<string, string> = {
    "content-type": "application/json",
  };
  if (typeof credential === "string" && credential.startsWith("capture_")) {
    headers.authorization = `Bearer ${credential}`;
  }
  return headers;
}

export function planQueueAfterFlush(
  queue: readonly CaptureQueueItem[],
  result: FlushResult,
  deliveredAt = new Date().toISOString(),
): QueuePlan {
  if (queue.length === 0) return { queue };

  const [head, ...rest] = queue;
  if (head === undefined) return { queue };

  if (result.status === 200) {
    const delivery = {
      queue: rest,
      clearLastCaptureError: true,
      lastSuccessfulCaptureAt: deliveredAt,
      lastDeliveredEventType: head.event.type,
      lastDeliveredEventId: head.event.id,
      lastDeliveredEventOccurredAt: head.event.occurredAt,
      lastDeliveredCreatedAttempt: result.ack.attemptId !== undefined,
    };
    if (result.ack.attemptId === undefined || result.ack.attemptStatus === undefined) {
      return { ...delivery, clearLastDeliveredAttempt: true };
    }
    return {
      ...delivery,
      lastDeliveredAttemptId: result.ack.attemptId,
      lastDeliveredAttemptStatus: result.ack.attemptStatus,
    };
  }

  if (result.status === 401 || result.status === 403) {
    const prefix = result.status === 401 ? "Pairing required" : "Origin rejected";
    return { queue, lastCaptureError: `${prefix}: ${result.error}` };
  }

  if (
    result.status === 400
    || result.status === 409
    || result.status === 413
    || result.status === 415
  ) {
    const prefix = result.status === 409 ? "Conflict" : "Validation error";
    return { queue: rest, lastCaptureError: `${prefix}: ${result.error}` };
  }

  const nextAttempts = head.attempts + 1;
  const shouldDrop = result.status === 500 && nextAttempts >= MAX_RETRY_ATTEMPTS;
  const nextQueue = shouldDrop ? rest : [{ ...head, attempts: nextAttempts }, ...rest];

  return { queue: nextQueue, lastCaptureError: result.error };
}
