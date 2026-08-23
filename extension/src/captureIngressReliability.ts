export const CAPTURE_INGRESS_RETRY_DELAYS_MS = Object.freeze([250, 1_000, 4_000] as const);
export const MAX_CAPTURE_INGRESS_QUEUE_SIZE = 8;

export type CaptureIngressAck =
  | Readonly<{ readonly schemaVersion: 1; readonly ok: true; readonly status: "persisted" | "paused" }>
  | Readonly<{
      readonly schemaVersion: 1;
      readonly ok: false;
      readonly error: "initialization_failed" | "persistence_failed";
    }>;

export function isCaptureIngressAck(value: unknown): value is CaptureIngressAck {
  if (typeof value !== "object" || value === null) return false;
  if (Reflect.get(value, "schemaVersion") !== 1 || typeof Reflect.get(value, "ok") !== "boolean") {
    return false;
  }
  const ok = Reflect.get(value, "ok");
  if (ok === true) {
    const status = Reflect.get(value, "status");
    return (status === "persisted" || status === "paused")
      && Reflect.ownKeys(value).length === 3;
  }
  const error = Reflect.get(value, "error");
  return (error === "initialization_failed" || error === "persistence_failed")
    && Reflect.ownKeys(value).length === 3;
}

export type CaptureIngressQueue<Message extends object> = Readonly<{
  readonly enqueue: (message: Message) => boolean;
  readonly idle: () => Promise<void>;
  readonly size: () => number;
  readonly stopped: () => boolean;
}>;

export function createCaptureIngressQueue<Message extends object>(dependencies: Readonly<{
  readonly send: (message: Message) => Promise<unknown>;
  readonly wait: (milliseconds: number) => Promise<void>;
  readonly isContextInvalidated: (error: unknown) => boolean;
  readonly onDeliveryBlocked: (reason: "initialization_failed" | "persistence_failed") => void;
}>): CaptureIngressQueue<Message> {
  const pending: Message[] = [];
  let active: Promise<void> | undefined;
  let contextInvalidated = false;
  let deliveryBlocked = false;

  async function deliver(message: Message): Promise<boolean> {
    let blockedReason: "initialization_failed" | "persistence_failed" = "persistence_failed";
    for (const delay of CAPTURE_INGRESS_RETRY_DELAYS_MS) {
      try {
        await dependencies.wait(delay);
        const response = await dependencies.send(message);
        if (!isCaptureIngressAck(response)) {
          blockedReason = "persistence_failed";
          continue;
        }
        if (response.ok) return true;
        blockedReason = response.error;
      } catch (error) {
        if (dependencies.isContextInvalidated(error)) {
          contextInvalidated = true;
          pending.splice(0, pending.length);
          return false;
        }
        blockedReason = "persistence_failed";
      }
    }
    dependencies.onDeliveryBlocked(blockedReason);
    deliveryBlocked = true;
    return false;
  }

  async function drain(): Promise<void> {
    while (!contextInvalidated) {
      const message = pending[0];
      if (message === undefined) return;
      const delivered = await deliver(message);
      if (contextInvalidated) return;
      if (!delivered) return;
      pending.shift();
    }
  }

  function startDrain(): void {
    if (active !== undefined || contextInvalidated) return;
    const running = drain();
    active = running.finally(() => {
      active = undefined;
      if (pending.length > 0 && !contextInvalidated && !deliveryBlocked) startDrain();
    });
  }

  return Object.freeze({
    enqueue: (message) => {
      if (contextInvalidated || deliveryBlocked || pending.length >= MAX_CAPTURE_INGRESS_QUEUE_SIZE) {
        return false;
      }
      pending.push(message);
      startDrain();
      return true;
    },
    idle: async () => {
      while (active !== undefined) await active;
    },
    size: () => pending.length,
    stopped: () => contextInvalidated,
  });
}
