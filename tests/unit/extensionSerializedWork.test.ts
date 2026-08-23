import { describe, expect, it } from "vitest";
import { createSerializedWorkExecutor } from "@/extension/src/serializedWork";

describe("serialized extension work", () => {
  it("runs scheduled jobs strictly in order", async () => {
    let releaseGate: () => void = () => undefined;
    let markFirstStarted: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => {
      releaseGate = resolve;
    });
    const firstStarted = new Promise<void>((resolve) => {
      markFirstStarted = resolve;
    });
    const order: string[] = [];
    const executor = createSerializedWorkExecutor(
      Promise.resolve(),
      () => undefined,
    );

    executor.schedule(async () => {
      order.push("first:start");
      markFirstStarted();
      await gate;
      order.push("first:end");
    });
    executor.schedule(async () => {
      order.push("second");
    });
    await firstStarted;
    expect(order).toEqual(["first:start"]);

    releaseGate();
    await executor.idle();
    expect(order).toEqual(["first:start", "first:end", "second"]);
  });

  it("reports a rejected job and continues with later work", async () => {
    const errors: unknown[] = [];
    const completed: string[] = [];
    const executor = createSerializedWorkExecutor(
      Promise.resolve(),
      (error) => errors.push(error),
    );

    executor.schedule(async () => {
      throw new Error("first failed");
    });
    executor.schedule(async () => {
      completed.push("second");
    });
    await executor.idle();

    expect(errors).toHaveLength(1);
    expect(errors[0]).toBeInstanceOf(Error);
    expect(completed).toEqual(["second"]);
  });

  it("does not run work after initialization failure and retries on the next trusted job", async () => {
    const errors: unknown[] = [];
    const completed: string[] = [];
    let attempts = 0;
    const executor = createSerializedWorkExecutor(
      async () => {
        attempts += 1;
        if (attempts === 1) throw new Error("initialization failed");
      },
      (error) => errors.push(error),
    );

    executor.schedule(async () => {
      completed.push("must-not-run");
    });
    executor.schedule(async () => {
      completed.push("recovered");
    });
    await executor.idle();

    expect(errors).toHaveLength(1);
    expect(completed).toEqual(["recovered"]);
    expect(attempts).toBe(2);
  });

  it("identifies initialization versus work failures for ACK callers", async () => {
    let initializationAttempts = 0;
    const failures: string[] = [];
    const executor = createSerializedWorkExecutor(async () => {
      initializationAttempts += 1;
      if (initializationAttempts === 1) throw new Error("init");
    }, () => undefined);
    executor.schedule(async () => undefined, (stage) => { failures.push(stage); });
    executor.schedule(async () => { throw new Error("work"); }, (stage) => { failures.push(stage); });
    await executor.idle();
    expect(failures).toEqual(["initialization", "work"]);
  });
});
