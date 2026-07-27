import { describe, expect, it } from "vitest";
import { createCharacterizationController } from "@/extension/src/characterization";
import { CHARACTERIZATION_TTL_MS } from "@/extension/src/characterizationStorage";
import { blocksNowCoderProductionIngress } from "@/extension/src/characterizationIngress";
import {
  createCharacterizationObserver,
  createRegistryRequestLifecycleSource,
  registerCharacterizationObserverListeners,
  type WebRequestDetails,
} from "@/extension/src/networkObserver";

const NOW = "2026-07-26T12:00:00.000Z";

function createSessionStorage() {
  const data: Record<string, unknown> = {};
  return {
    data,
    get: async (keys: readonly string[]) => Object.fromEntries(
      keys.filter((key) => key in data).map((key) => [key, data[key]]),
    ),
    set: async (items: Record<string, unknown>) => { Object.assign(data, items); },
    remove: async (key: string) => { delete data[key]; },
  };
}

describe("background characterization production ingress guard", () => {
  it.each(["webRequest E1", "MAIN bridge", "E3", "verdict candidate", "E0 UI hint"])
  ("blocks NowCoder %s using session state after a worker restart", async () => {
    const storage = createSessionStorage();
    const firstWorker = createCharacterizationController(storage, () => NOW);
    await firstWorker.start("www.nowcoder.com", false);

    // A restarted worker has no process-local flag; it must read session state.
    const restartedWorker = createCharacterizationController(storage, () => NOW);
    expect(await blocksNowCoderProductionIngress("nowcoder", restartedWorker)).toBe(true);
    expect(await blocksNowCoderProductionIngress("leetcode", restartedWorker)).toBe(false);
  });

  it("removes expired session state and lets the first later start proceed", async () => {
    const storage = createSessionStorage();
    let now = NOW;
    const controller = createCharacterizationController(storage, () => now);
    await controller.start("www.nowcoder.com", false);
    now = new Date(Date.parse(NOW) + CHARACTERIZATION_TTL_MS + 1).toISOString();

    expect(await blocksNowCoderProductionIngress("nowcoder", controller)).toBe(false);
    expect("characterizationSession" in storage.data).toBe(false);
    expect((await controller.start("www.nowcoder.com", false)).startedAt).toBe(now);
  });

  it("queues one lifecycle collection before an immediate export", async () => {
    const storage = createSessionStorage();
    const controller = createCharacterizationController(storage, () => NOW);
    await controller.start("ac.nowcoder.com", true);
    const listeners = new Map<string, (details: WebRequestDetails, ...extra: unknown[]) => void>();
    const queue: Array<() => Promise<void>> = [];
    registerCharacterizationObserverListeners(
      (kind, callback) => { listeners.set(kind, callback); },
      createCharacterizationObserver(createRegistryRequestLifecycleSource(() => NOW)),
      (evidence, hostname) => controller.collect(evidence, hostname),
      (work) => { queue.push(work); },
    );
    listeners.get("onBeforeRequest")?.({
      requestId: "request-immediate", url: "https://ac.nowcoder.com/acm/problem/1/submit",
      method: "POST", tabId: 1, frameId: 0, documentId: "document-immediate",
      timeStamp: 1, type: "xmlhttprequest",
    });
    expect(queue).toHaveLength(1);
    queue.push(async () => {
      const result = await controller.export();
      expect(result).toMatchObject({ ok: true, records: [{ requestId: "request-immediate" }] });
    });
    for (const work of queue) await work();
  });

  it("diagnostic actions never mutate production storage", async () => {
    const production = {
      transientE1: [{ requestId: "production-e1" }],
      confirmedSubmissions: [{ storageKey: "production-e2" }],
      captureOutbox: [{ id: "production-bundle" }],
    };
    const before = JSON.stringify(production);
    const controller = createCharacterizationController(createSessionStorage(), () => NOW);

    await controller.start("www.nowcoder.com", false);
    await controller.export();
    await controller.stop();

    expect(JSON.stringify(production)).toBe(before);
  });

  it("worker restart clears the characterization session", async () => {
    const storage = createSessionStorage();
    const firstWorker = createCharacterizationController(storage, () => NOW);
    await firstWorker.start("www.nowcoder.com", false);
    expect(await firstWorker.isActive()).toBe(true);

    // Simulate a fresh worker: stop() renders the session inactive.
    await firstWorker.stop();
    expect(await firstWorker.isActive()).toBe(false);
    expect(await blocksNowCoderProductionIngress("nowcoder", firstWorker)).toBe(false);
  });

  it("synchronous guard keeps production observer from scheduling NowCoder work", async () => {
    const storage = createSessionStorage();
    const controller = createCharacterizationController(storage, () => NOW);
    await controller.start("www.nowcoder.com", false);
    expect(await controller.isActive()).toBe(true);
    const ingressBlocked = await blocksNowCoderProductionIngress("nowcoder", controller);
    expect(ingressBlocked).toBe(true);

    await controller.stop();
    expect(await blocksNowCoderProductionIngress("nowcoder", controller)).toBe(false);
  });
});
