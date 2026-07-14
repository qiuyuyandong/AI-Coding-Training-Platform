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

  it("recovers from initialization failure", async () => {
    const errors: unknown[] = [];
    const completed: string[] = [];
    const executor = createSerializedWorkExecutor(
      Promise.reject(new Error("initialization failed")),
      (error) => errors.push(error),
    );

    executor.schedule(async () => {
      completed.push("after-init");
    });
    await executor.idle();

    expect(errors).toHaveLength(1);
    expect(completed).toEqual(["after-init"]);
  });
});
