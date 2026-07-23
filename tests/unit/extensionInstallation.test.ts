import { describe, expect, it } from "vitest";
import {
  applyExtensionInitialization,
  CAPTURE_PROTOCOL_VERSION,
  planExtensionInitialization,
  restrictStorageToTrustedContexts,
  runtimeContextFromPlan,
} from "@/extension/src/installation";
import {
  buildCaptureAttemptBundle,
  type CaptureOutboxItem,
} from "@/extension/src/attemptStorage";
import {
  drainCaptureOutbox,
  persistCaptureOutboxPlan,
  type CaptureOutboxPlan,
} from "@/extension/src/outboxDrain";
import type { PendingSubmissionIntent } from "@/extension/src/attemptCapture";

const options = {
  now: "2026-07-21T00:00:00.000Z",
  createInstallationId: () => "installation_new",
};

describe("extension storage access compatibility", () => {
  it("restricts storage when the browser exposes setAccessLevel", async () => {
    const calls: string[] = [];

    await expect(restrictStorageToTrustedContexts({
      setAccessLevel: async ({ accessLevel }) => { calls.push(accessLevel); },
    })).resolves.toBe(true);
    expect(calls).toEqual(["TRUSTED_CONTEXTS"]);
  });

  it("keeps initialization available when setAccessLevel is unsupported", async () => {
    await expect(restrictStorageToTrustedContexts({})).resolves.toBe(false);
  });
});

function outboxItem(id: string): CaptureOutboxItem {
  const intent: PendingSubmissionIntent = {
    installationId: "installation_existing",
    platform: "atcoder",
    problemExternalId: id,
    problemTitle: id,
    canonicalUrl: `https://atcoder.jp/contests/abc100/tasks/${id}`,
    captureSessionId: `session_${id}`,
    submissionId: id,
    occurredAt: "2026-07-21T00:00:00.000Z",
    status: "active",
  };
  const bundle = buildCaptureAttemptBundle(intent, {
    installationId: "installation_existing",
    platform: "atcoder",
    problemExternalId: id,
    verdict: "Accepted",
    observedAt: "2026-07-21T00:01:00.000Z",
    transitionEvidence: "exact_result_document",
  }, "extension_paired");
  return {
    id: bundle.bundleId,
    kind: "attempt_bundle",
    bundle,
    attempts: 0,
    createdAt: "2026-07-21T00:01:00.000Z",
  };
}

describe("planExtensionInitialization V3", () => {
  it("removes all 32 actual V2 queue entries and initializes bundle storage", () => {
    const eventQueue = Array.from({ length: 32 }, (_value, index) => ({
      event: { id: `event_${index}` },
      attempts: 0,
    }));
    const plan = planExtensionInitialization({
      captureProtocolVersion: 2,
      installationId: "installation_existing",
      eventQueue,
    }, options);
    expect(plan).toMatchObject({
      installationId: "installation_existing",
      captureProtocolVersion: CAPTURE_PROTOCOL_VERSION,
      pendingSubmissionIntents: [],
      captureOutbox: [],
      captureQuarantine: [],
      discardedPreBundleEventCount: 32,
      preBundleQueueDiscardedAt: options.now,
      shouldRemoveLegacyEventQueue: true,
    });
    expect("eventQueue" in plan).toBe(false);
  });

  it("durably writes V3 state before removing the legacy key", async () => {
    const plan = planExtensionInitialization({
      captureProtocolVersion: 2,
      eventQueue: Array.from({ length: 32 }, (_value, index) => ({ id: index })),
    }, options);
    const operations: string[] = [];
    let written: Record<string, unknown> = {};
    await applyExtensionInitialization({
      set: async (items) => { written = items; operations.push("set"); },
      remove: async (key) => { operations.push(`remove:${key}`); },
    }, plan);
    expect(operations).toEqual([
      "set",
      "remove:eventQueue",
      "remove:outbox",
      "remove:quarantine",
    ]);
    expect(written).toMatchObject({
      captureProtocolVersion: 3,
      discardedPreBundleEventCount: 32,
      captureOutbox: [],
      captureQuarantine: [],
    });
    expect("eventQueue" in written).toBe(false);
  });

  it("preserves the authoritative V3 bundle before deleting stale keys and drains it once", async () => {
    const authoritative = outboxItem("authoritative");
    const stale = outboxItem("stale");
    const values: Record<string, unknown> = {
      captureProtocolVersion: 3,
      installationId: "installation_existing",
      captureOutbox: [authoritative],
      captureQuarantine: [],
      pendingSubmissionIntents: [],
      discardedPreBundleEventCount: 32,
      preBundleQueueDiscardedAt: "2026-07-20T00:00:00.000Z",
      outbox: [stale],
      quarantine: [{ id: stale.id, item: stale }],
    };
    const operations: string[] = [];
    const storage = {
      set: async (items: Record<string, unknown>) => {
        for (const [key, value] of Object.entries(items)) values[key] = value;
        operations.push("set");
      },
      remove: async (key: string) => {
        Reflect.deleteProperty(values, key);
        operations.push(`remove:${key}`);
      },
    };
    const plan = planExtensionInitialization(values, options);

    expect(plan.captureOutbox).toEqual([authoritative]);
    expect(plan.captureQuarantine).toEqual([]);
    await applyExtensionInitialization(storage, plan);

    expect(operations).toEqual(["set", "remove:outbox", "remove:quarantine"]);
    expect(values.captureOutbox).toEqual([authoritative]);
    expect(values.captureQuarantine).toEqual([]);
    expect(values).not.toHaveProperty("outbox");
    expect(values).not.toHaveProperty("quarantine");

    let requestCount = 0;
    const dependencies = {
      readState: async () => ({
        outbox: values.captureOutbox as readonly CaptureOutboxItem[],
        quarantine: values.captureQuarantine as CaptureOutboxPlan["quarantine"],
      }),
      send: async (entry: CaptureOutboxItem) => {
        requestCount += 1;
        return {
          status: 200 as const,
          ack: {
            ok: true as const,
            bundleId: entry.id,
            captureSessionId: entry.bundle.events[0].captureSessionId,
            attemptId: `attempt_${entry.id}`,
            attemptStatus: "passed" as const,
            replayed: false,
          },
        };
      },
      persist: async (next: CaptureOutboxPlan) => {
        await persistCaptureOutboxPlan(storage, next);
      },
    };

    expect(await drainCaptureOutbox(dependencies))
      .toEqual({ reason: "empty", processed: 1 });
    expect(requestCount).toBe(1);
    expect(values.captureOutbox).toEqual([]);
    expect(await drainCaptureOutbox(dependencies))
      .toEqual({ reason: "empty", processed: 0 });
    expect(requestCount).toBe(1);
  });

  it("is idempotent and preserves V3 outbox without recounting", () => {
    const captureOutbox = [{ id: "bundle_1", kind: "attempt_bundle", bundle: {}, attempts: 0 }];
    const plan = planExtensionInitialization({
      captureProtocolVersion: 3,
      installationId: "installation_existing",
      captureOutbox,
      captureQuarantine: [],
      pendingSubmissionIntents: [],
      discardedPreBundleEventCount: 32,
      preBundleQueueDiscardedAt: "2026-07-20T00:00:00.000Z",
    }, options);
    expect(plan.captureOutbox).toEqual(captureOutbox);
    expect(plan.discardedPreBundleEventCount).toBe(32);
    expect(plan.preBundleQueueDiscardedAt).toBe("2026-07-20T00:00:00.000Z");
    expect(plan.shouldRemoveLegacyEventQueue).toBe(false);
  });

  it("safely initializes when no legacy queue exists", () => {
    const plan = planExtensionInitialization({}, options);
    expect(plan.installationId).toBe("installation_new");
    expect(plan.discardedPreBundleEventCount).toBe(0);
    expect(plan.captureOutbox).toEqual([]);
  });

  it("preserves capture settings and reports pairing provenance", () => {
    const paired = planExtensionInitialization({
      captureCredential: "capture_secret",
      captureEnabled: false,
      captureEndpoint: "http://127.0.0.1:3000/api/capture/events",
    }, options);
    expect(runtimeContextFromPlan(paired)).toEqual({
      installationId: "installation_new",
      captureEnabled: false,
      provenanceLevel: "extension_paired",
    });
  });
});
