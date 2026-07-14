import {
  planQueueAfterFlush,
  type CaptureQueueItem,
  type FlushResult,
  type QueuePlan,
} from "./transport";

export const MAX_DRAIN_BATCH_SIZE = 25;

export type QueueDrainOutcome = {
  readonly reason: "empty" | "blocked" | "batch_limit";
  readonly processed: number;
};

export type QueueDrainDependencies = {
  readonly readQueue: () => Promise<readonly CaptureQueueItem[]>;
  readonly send: (
    event: CaptureQueueItem["event"],
  ) => Promise<FlushResult>;
  readonly persist: (plan: QueuePlan) => Promise<void>;
};

export async function drainCaptureQueue(
  dependencies: QueueDrainDependencies,
  batchSize = MAX_DRAIN_BATCH_SIZE,
): Promise<QueueDrainOutcome> {
  if (!Number.isInteger(batchSize) || batchSize < 1) {
    throw new RangeError("Capture queue batch size must be a positive integer");
  }

  let processed = 0;
  while (processed < batchSize) {
    const queue = await dependencies.readQueue();
    const [head] = queue;
    if (head === undefined) return { reason: "empty", processed };

    const result = await dependencies.send(head.event);
    const plan = planQueueAfterFlush(queue, result);
    await dependencies.persist(plan);
    processed += 1;

    if (isRetryBlocked(queue, plan, result)) {
      return { reason: "blocked", processed };
    }
  }

  const remaining = await dependencies.readQueue();
  return remaining.length === 0
    ? { reason: "empty", processed }
    : { reason: "batch_limit", processed };
}

function isRetryBlocked(
  previousQueue: readonly CaptureQueueItem[],
  plan: QueuePlan,
  result: FlushResult,
): boolean {
  if (result.status === "network_error") return true;
  return result.status === 500 && plan.queue.length === previousQueue.length;
}
