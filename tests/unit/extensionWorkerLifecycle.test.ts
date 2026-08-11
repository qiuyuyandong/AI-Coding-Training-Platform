// @vitest-environment node

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { resolveExtensionWorkerLifecycle } from "@/tests/extension-e2e/extensionWorkerLifecycle";

interface FakeWorker {
  readonly id: string;
}

interface Deferred<T> {
  readonly promise: Promise<T>;
  readonly resolve: (value: T | PromiseLike<T>) => void;
  readonly reject: (reason: unknown) => void;
}

function createDeferred<T>(): Deferred<T> {
  let resolvePromise: Deferred<T>["resolve"] = () => {
    throw new Error("deferred resolve was not initialized");
  };
  let rejectPromise: Deferred<T>["reject"] = () => {
    throw new Error("deferred reject was not initialized");
  };
  const promise = new Promise<T>((resolveValue, rejectValue) => {
    resolvePromise = resolveValue;
    rejectPromise = rejectValue;
  });
  return { promise, resolve: resolvePromise, reject: rejectPromise };
}

async function nextEventLoopTurn(): Promise<void> {
  await new Promise<void>((resolveTurn) => setImmediate(resolveTurn));
}

describe("extension worker lifecycle", () => {
  it("returns a worker discovered before waiter installation without creating an orphan waiter", async () => {
    const existing = { id: "existing" } satisfies FakeWorker;
    let waiterCalls = 0;
    let popupCalls = 0;

    const result = await resolveExtensionWorkerLifecycle({
      readExisting: () => existing,
      waitForStarted: () => {
        waiterCalls += 1;
        return Promise.resolve({ id: "unexpected" });
      },
      openPopup: () => {
        popupCalls += 1;
        return Promise.resolve();
      },
    });

    expect(result).toBe(existing);
    expect(waiterCalls).toBe(0);
    expect(popupCalls).toBe(0);
  });

  it("installs one waiter before opening the popup and returns the event worker", async () => {
    const sequence: string[] = [];
    const started = { id: "started" } satisfies FakeWorker;

    const result = await resolveExtensionWorkerLifecycle({
      readExisting: () => undefined,
      waitForStarted: () => {
        sequence.push("wait");
        return Promise.resolve(started);
      },
      openPopup: () => {
        sequence.push("popup");
        return Promise.resolve();
      },
    });

    expect(result).toBe(started);
    expect(sequence).toEqual(["wait", "popup"]);
  });

  it("handles a teardown waiter rejection after the popup has already rejected", async () => {
    const waiter = createDeferred<FakeWorker>();
    const popup = createDeferred<void>();
    const unhandled: unknown[] = [];
    const recordUnhandled = (reason: unknown): void => { unhandled.push(reason); };
    process.on("unhandledRejection", recordUnhandled);
    try {
      const result = resolveExtensionWorkerLifecycle({
        readExisting: () => undefined,
        waitForStarted: () => waiter.promise,
        openPopup: () => popup.promise,
      });

      popup.reject(new Error("popup failed"));
      await expect(result).rejects.toThrow("popup failed");
      waiter.reject(new Error("teardown waiter failed"));
      await nextEventLoopTurn();

      expect(unhandled).toEqual([]);
    } finally {
      process.off("unhandledRejection", recordUnhandled);
    }
  });

  it("handles a later popup rejection after the waiter has already rejected", async () => {
    const waiter = createDeferred<FakeWorker>();
    const popup = createDeferred<void>();
    const unhandled: unknown[] = [];
    const recordUnhandled = (reason: unknown): void => { unhandled.push(reason); };
    process.on("unhandledRejection", recordUnhandled);
    try {
      const result = resolveExtensionWorkerLifecycle({
        readExisting: () => undefined,
        waitForStarted: () => waiter.promise,
        openPopup: () => popup.promise,
      });

      waiter.reject(new Error("waiter failed"));
      await expect(result).rejects.toThrow("waiter failed");
      popup.reject(new Error("late popup failed"));
      await nextEventLoopTurn();

      expect(unhandled).toEqual([]);
    } finally {
      process.off("unhandledRejection", recordUnhandled);
    }
  });

  it("keeps the pure helper free of retry, timer, DOM, Chrome, network, and wall-clock dependencies", () => {
    const source = readFileSync(
      resolve(process.cwd(), "tests/extension-e2e/extensionWorkerLifecycle.ts"),
      "utf8",
    );

    for (const forbidden of ["setTimeout", "setInterval", "Date.", "chrome.", "document.", "fetch(", "Promise.race"]) {
      expect(source).not.toContain(forbidden);
    }
  });
});
