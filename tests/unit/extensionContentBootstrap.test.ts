import { describe, expect, it } from "vitest";

import { bootstrapContentRuntime } from "@/extension/src/contentBootstrap";

describe("content bootstrap", () => {
  it("installs once and announces readiness after installation", async () => {
    const isolatedGlobal = {};
    const calls: string[] = [];

    await expect(bootstrapContentRuntime({
      isolatedGlobal,
      install: async (announceReady) => {
        calls.push("install");
        announceReady();
        return true;
      },
      reannounceReady: () => calls.push("ready"),
    })).resolves.toBe("installed");

    expect(calls).toEqual(["install", "ready"]);
  });

  it("reannounces but does not install a duplicate runtime", async () => {
    const isolatedGlobal = {};
    let installs = 0;
    let ready = 0;
    const dependencies = {
      isolatedGlobal,
      install: async (announceReady: () => void) => {
        installs += 1;
        announceReady();
        return true;
      },
      reannounceReady: () => { ready += 1; },
    };

    await bootstrapContentRuntime(dependencies);
    await expect(bootstrapContentRuntime(dependencies)).resolves.toBe("reannounced");

    expect(installs).toBe(1);
    expect(ready).toBe(2);
  });

  it("does not announce readiness while the first installation is incomplete", async () => {
    const isolatedGlobal = {};
    let finishInstall: (() => void) | undefined;
    let ready = 0;
    const first = bootstrapContentRuntime({
      isolatedGlobal,
      install: () => new Promise<boolean>((resolve) => {
        finishInstall = () => resolve(true);
      }),
      reannounceReady: () => { ready += 1; },
    });

    await expect(bootstrapContentRuntime({
      isolatedGlobal,
      install: async () => true,
      reannounceReady: () => { ready += 1; },
    })).resolves.toBe("installing");
    expect(ready).toBe(0);

    finishInstall?.();
    await expect(first).resolves.toBe("installed");
  });

  it("does not retain readiness when capture is inactive", async () => {
    const isolatedGlobal = {};
    let installs = 0;
    const dependencies = {
      isolatedGlobal,
      install: async () => {
        installs += 1;
        return false;
      },
      reannounceReady: () => undefined,
    };

    await expect(bootstrapContentRuntime(dependencies)).resolves.toBe("inactive");
    await expect(bootstrapContentRuntime(dependencies)).resolves.toBe("inactive");
    expect(installs).toBe(2);
  });
});
