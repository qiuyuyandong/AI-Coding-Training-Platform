import { describe, expect, it } from "vitest";
import { createInitializationController } from "@/extension/src/initializationController";

describe("reentrant initialization controller", () => {
  it("shares one in-flight initialization and becomes ready once", async () => {
    let runs = 0;
    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const controller = createInitializationController(async () => {
      runs += 1;
      await gate;
    });
    const first = controller.ensure();
    const second = controller.ensure();
    expect(runs).toBe(1);
    expect(controller.status()).toBe("initializing");
    release();
    await Promise.all([first, second]);
    expect(controller.status()).toBe("ready");
    await controller.ensure();
    expect(runs).toBe(1);
  });

  it("returns to idle after failure so the next trusted event can recover", async () => {
    let runs = 0;
    const controller = createInitializationController(async () => {
      runs += 1;
      if (runs === 1) throw new Error("first initialization failed");
    });
    await expect(controller.ensure()).rejects.toThrow("first initialization failed");
    expect(controller.status()).toBe("idle");
    await expect(controller.ensure()).resolves.toBeUndefined();
    expect(controller.status()).toBe("ready");
    expect(runs).toBe(2);
  });

  it("allows an explicit recovery request to reset a ready controller", async () => {
    let runs = 0;
    const controller = createInitializationController(async () => { runs += 1; });
    await controller.ensure();
    controller.reset();
    expect(controller.status()).toBe("idle");
    await controller.ensure();
    expect(runs).toBe(2);
  });
});
