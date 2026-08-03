import {
  MAX_RETRY_ATTEMPTS,
  type CaptureAttemptFlushResult,
} from "./captureTransport";
import type {
  CaptureOutboxItem,
  CaptureQuarantineItem,
} from "./attemptStorage";
import { retryQuarantined } from "./attemptStorage";
import {
  safeStoredCaptureError,
  sanitizeCaptureOutboxRecords,
  sanitizeCaptureQuarantineRecords,
} from "./captureErrorPrivacy";

export const MAX_DRAIN_BATCH_SIZE = 25;
const ACK_RETRY_BASE_MS = 30_000;
const ACK_RETRY_MAX_MS = 120_000;

export type CaptureOutboxState = {
  readonly outbox: readonly CaptureOutboxItem[];
  readonly quarantine: readonly CaptureQuarantineItem[];
  readonly malformedOutbox?: readonly unknown[];
  readonly malformedQuarantine?: readonly unknown[];
};

export type CaptureOutboxPlan = CaptureOutboxState & {
  readonly lastCaptureError?: string;
  readonly clearLastCaptureError?: boolean;
  readonly lastSuccessfulCaptureAt?: string;
  readonly lastDeliveredAttemptId?: string;
  readonly lastDeliveredAttemptStatus?: string;
};

export type CaptureOutboxStorageUpdate = Omit<
  CaptureOutboxPlan,
  "outbox" | "quarantine" | "clearLastCaptureError"
> & {
  readonly captureOutbox: readonly unknown[];
  readonly captureQuarantine: readonly unknown[];
};

export type CaptureOutboxStorage = {
  readonly set: (items: Record<string, unknown>) => Promise<void>;
  readonly remove: (key: string) => Promise<void>;
};

export function captureOutboxStorageUpdate(
  plan: CaptureOutboxPlan,
): CaptureOutboxStorageUpdate {
  const lastCaptureError = safeStoredCaptureError(plan.lastCaptureError);
  return {
    ...(lastCaptureError === undefined
      ? {}
      : { lastCaptureError }),
    ...(plan.lastSuccessfulCaptureAt === undefined
      ? {}
      : { lastSuccessfulCaptureAt: plan.lastSuccessfulCaptureAt }),
    ...(plan.lastDeliveredAttemptId === undefined
      ? {}
      : { lastDeliveredAttemptId: plan.lastDeliveredAttemptId }),
    ...(plan.lastDeliveredAttemptStatus === undefined
      ? {}
      : { lastDeliveredAttemptStatus: plan.lastDeliveredAttemptStatus }),
    captureOutbox: sanitizeCaptureOutboxRecords([
      ...plan.outbox,
      ...(plan.malformedOutbox ?? []),
    ]),
    captureQuarantine: sanitizeCaptureQuarantineRecords([
      ...plan.quarantine,
      ...(plan.malformedQuarantine ?? []),
    ]),
  };
}

export async function persistCaptureOutboxPlan(
  storage: CaptureOutboxStorage,
  plan: CaptureOutboxPlan,
): Promise<void> {
  await storage.set(captureOutboxStorageUpdate(plan));
  if (plan.clearLastCaptureError === true) {
    await storage.remove("lastCaptureError");
  }
}

export function retryAllCaptureStorageUpdate(
  state: CaptureOutboxState,
): {
  readonly captureOutbox: readonly CaptureOutboxItem[];
  readonly captureQuarantine: readonly CaptureQuarantineItem[];
  readonly malformedOutbox?: readonly unknown[];
  readonly malformedQuarantine?: readonly unknown[];
} {
  const pending = state.outbox.map((item) => ({
    ...item,
    attempts: 0,
    nextAttemptAt: undefined,
    automaticRetryBlocked: undefined,
  }));
  const retried = state.quarantine.map((entry) => ({
    ...entry.item,
    attempts: 0,
    nextAttemptAt: undefined,
    automaticRetryBlocked: undefined,
  }));
  return {
    captureOutbox: [...pending, ...retried],
    captureQuarantine: [],
    malformedOutbox: state.malformedOutbox,
    malformedQuarantine: state.malformedQuarantine,
  };
}

export function retryQuarantinedCaptureStorageUpdate(
  state: CaptureOutboxState,
  id: string,
): {
  readonly captureOutbox: readonly CaptureOutboxItem[];
  readonly captureQuarantine: readonly CaptureQuarantineItem[];
  readonly malformedOutbox?: readonly unknown[];
  readonly malformedQuarantine?: readonly unknown[];
} {
  const retried = retryQuarantined(state.outbox, state.quarantine, id);
  return {
    captureOutbox: retried.outbox,
    captureQuarantine: retried.quarantine,
    malformedOutbox: state.malformedOutbox,
    malformedQuarantine: state.malformedQuarantine,
  };
}

export function planOutboxAfterFlush(
  state: CaptureOutboxState,
  sent: CaptureOutboxItem,
  result: CaptureAttemptFlushResult,
  now = new Date().toISOString(),
): CaptureOutboxPlan {
  const current = state.outbox.find((item) => item.id === sent.id);
  if (current === undefined) return state;
  if (result.status === 200) {
    return {
      outbox: state.outbox.filter((item) => item.id !== sent.id),
      quarantine: state.quarantine,
      malformedOutbox: state.malformedOutbox,
      malformedQuarantine: state.malformedQuarantine,
      clearLastCaptureError: true,
      lastSuccessfulCaptureAt: now,
      lastDeliveredAttemptId: result.ack.attemptId,
      lastDeliveredAttemptStatus: result.ack.attemptStatus,
    };
  }
  const safeError = captureFlushError(result);
  if (result.status === "network_error" || result.status === 401 || result.status === 403) {
    const prefix = result.status === 401
      ? "Pairing required"
      : result.status === 403
        ? "Origin rejected"
        : "Network unavailable";
    return { ...state, lastCaptureError: `${prefix}: ${safeError}` };
  }
  if (result.status === "ack_error") {
    const attempts = Math.min(current.attempts + 1, MAX_RETRY_ATTEMPTS);
    const retryDelayMs = Math.min(
      ACK_RETRY_BASE_MS * (2 ** Math.max(0, attempts - 1)),
      ACK_RETRY_MAX_MS,
    );
    return {
      ...state,
      outbox: state.outbox.map((item) => item.id === current.id
        ? {
            ...item,
            attempts,
            nextAttemptAt: new Date(Date.parse(now) + retryDelayMs).toISOString(),
            automaticRetryBlocked: attempts >= MAX_RETRY_ATTEMPTS,
          }
        : item),
      lastCaptureError: safeError,
    };
  }
  const attempts = current.attempts + 1;
  const permanent = result.status !== 500 || attempts >= MAX_RETRY_ATTEMPTS;
  if (!permanent) {
    return {
      ...state,
      outbox: state.outbox.map((item) =>
        item.id === current.id ? { ...item, attempts } : item),
      lastCaptureError: safeError,
    };
  }
  return {
    outbox: state.outbox.filter((item) => item.id !== sent.id),
    quarantine: [...state.quarantine, {
      id: sent.id,
      item: { ...current, attempts },
      error: safeError,
      quarantinedAt: now,
    }],
    malformedOutbox: state.malformedOutbox,
    malformedQuarantine: state.malformedQuarantine,
    lastCaptureError: `Isolated result: ${safeError}`,
  };
}

function captureFlushError(result: Exclude<CaptureAttemptFlushResult, { readonly status: 200 }>): string {
  if (result.status === "network_error") return "Network request failed";
  if (result.status === "ack_error") return "ACK mismatch: invalid response";
  return `HTTP ${result.status}`;
}

export type OutboxDrainDependencies = {
  readonly readState: () => Promise<CaptureOutboxState>;
  readonly send: (item: CaptureOutboxItem) => Promise<CaptureAttemptFlushResult>;
  readonly persist: (plan: CaptureOutboxPlan) => Promise<void>;
};

export async function drainCaptureOutbox(
  dependencies: OutboxDrainDependencies,
  batchSize = MAX_DRAIN_BATCH_SIZE,
  now: () => string = () => new Date().toISOString(),
): Promise<{ readonly reason: "empty" | "global_blocked" | "deferred" | "batch_limit"; readonly processed: number }> {
  if (!Number.isInteger(batchSize) || batchSize < 1) {
    throw new RangeError("Capture outbox batch size must be a positive integer");
  }
  let processed = 0;
  while (processed < batchSize) {
    const before = await dependencies.readState();
    const item = before.outbox[0];
    if (item === undefined) return { reason: "empty", processed };
    if (item.automaticRetryBlocked === true) {
      return { reason: "deferred", processed };
    }
    if (item.nextAttemptAt !== undefined && item.nextAttemptAt > now()) {
      return { reason: "deferred", processed };
    }
    const result = await dependencies.send(item);
    const latest = await dependencies.readState();
    await dependencies.persist(planOutboxAfterFlush(latest, item, result, now()));
    processed += 1;
    if (result.status === "network_error" || result.status === 401 || result.status === 403) {
      return { reason: "global_blocked", processed };
    }
    if (result.status === "ack_error") {
      return { reason: "deferred", processed };
    }
    if (result.status === 500 && item.attempts + 1 < MAX_RETRY_ATTEMPTS) {
      return { reason: "global_blocked", processed };
    }
  }
  const remaining = await dependencies.readState();
  return remaining.outbox.length === 0
    ? { reason: "empty", processed }
    : { reason: "batch_limit", processed };
}
