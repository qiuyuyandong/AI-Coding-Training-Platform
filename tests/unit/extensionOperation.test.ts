import { describe, expect, it } from "vitest";
import {
  createExtensionContextGuard,
  isExtensionContextInvalidatedError,
  settleExtensionOperation,
} from "@/extension/src/extensionOperation";

describe("extension operation boundary", () => {
  it("resolves successful Chrome operations", async () => {
    const errors: unknown[] = [];

    await expect(
      settleExtensionOperation(
        async () => ({ ok: true }),
        (error) => errors.push(error),
      ),
    ).resolves.toBe(true);
    expect(errors).toEqual([]);
  });

  it("turns rejected Chrome operations into reported failures", async () => {
    const errors: unknown[] = [];
    const failure = new Error("Extension context invalidated.");

    await expect(
      settleExtensionOperation(
        async () => {
          throw failure;
        },
        (error) => errors.push(error),
      ),
    ).resolves.toBe(false);
    expect(errors).toEqual([failure]);
  });
});

describe("content-script context guard", () => {
  it("recognizes the Chrome invalidation error without relying on an Error instance", () => {
    expect(
      isExtensionContextInvalidatedError(
        new Error("Extension context invalidated."),
      ),
    ).toBe(true);
    expect(
      isExtensionContextInvalidatedError(
        "Uncaught Error: Extension context invalidated.",
      ),
    ).toBe(true);
    expect(
      isExtensionContextInvalidatedError(
        new Error("Receiving end does not exist."),
      ),
    ).toBe(false);
  });

  it("silently retires an invalidated content-script runtime", () => {
    const errors: unknown[] = [];
    const calls: string[] = [];
    const guard = createExtensionContextGuard((error) => errors.push(error));

    guard.run(() => {
      calls.push("first");
      throw new Error("Extension context invalidated.");
    });
    guard.run(() => {
      calls.push("must-not-run");
    });

    expect(guard.isActive()).toBe(false);
    expect(calls).toEqual(["first"]);
    expect(errors).toEqual([]);
  });

  it("reports one unexpected callback failure and stops later callbacks", () => {
    const failure = new Error("detector failed");
    const errors: unknown[] = [];
    const guard = createExtensionContextGuard((error) => errors.push(error));

    guard.run(() => {
      throw failure;
    });
    guard.run(() => {
      throw new Error("must not run");
    });

    expect(guard.isActive()).toBe(false);
    expect(errors).toEqual([failure]);
  });
});
