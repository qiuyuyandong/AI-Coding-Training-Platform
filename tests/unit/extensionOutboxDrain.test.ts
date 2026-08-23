import { describe, expect, it } from "vitest";
import { buildCaptureAttemptBundle, type CaptureOutboxItem } from "@/extension/src/attemptStorage";
import {
  captureOutboxStorageUpdate,
  drainCaptureOutbox,
  persistCaptureOutboxPlan,
  planOutboxAfterFlush,
  retryAllCaptureStorageUpdate,
  retryQuarantinedCaptureStorageUpdate,
  type CaptureOutboxPlan,
  type CaptureOutboxState,
} from "@/extension/src/outboxDrain";
import { classifyQuarantineEntry, presentPopupState } from "@/extension/src/popup";
import type { PendingSubmissionIntent } from "@/extension/src/attemptCapture";
import type { CaptureAttemptFlushResult } from "@/extension/src/captureTransport";

function item(id: string): CaptureOutboxItem {
  const intent: PendingSubmissionIntent = {
    installationId: "installation_1", platform: "atcoder", problemExternalId: id,
    problemTitle: id, canonicalUrl: `https://atcoder.jp/contests/abc100/tasks/${id}`,
    captureSessionId: `session_${id}`, submissionId: id,
    occurredAt: "2026-07-21T00:00:00.000Z", status: "active",
  };
  const bundle = buildCaptureAttemptBundle(intent, {
    installationId: "installation_1", platform: "atcoder", problemExternalId: id,
    verdict: "Accepted", observedAt: "2026-07-21T00:01:00.000Z",
    transitionEvidence: "exact_result_document",
  }, "extension_paired");
  return { id: bundle.bundleId, kind: "attempt_bundle", bundle, attempts: 0, createdAt: "2026-07-21T00:01:00.000Z" };
}

function success(entry: CaptureOutboxItem): CaptureAttemptFlushResult {
  return { status: 200, ack: {
    ok: true, bundleId: entry.id, captureSessionId: entry.bundle.events[0].captureSessionId,
    attemptId: `attempt_${entry.id}`, attemptStatus: "passed", replayed: false,
  } };
}

function fakeStorage(initial: {
  readonly captureOutbox: readonly CaptureOutboxItem[];
  readonly captureQuarantine: CaptureOutboxPlan["quarantine"];
  readonly lastCaptureError?: string;
}) {
  const values: Record<string, unknown> = { ...initial };
  return {
    values,
    set: async (items: Record<string, unknown>) => {
      for (const [key, value] of Object.entries(items)) values[key] = value;
    },
    remove: async (key: string) => {
      Reflect.deleteProperty(values, key);
    },
    readState: async () => ({
      outbox: values.captureOutbox as readonly CaptureOutboxItem[],
      quarantine: values.captureQuarantine as CaptureOutboxPlan["quarantine"],
    }),
  };
}

describe("capture outbox drain", () => {
  it("sanitizes direct persistence inputs at the storage boundary", () => {
    const update = captureOutboxStorageUpdate({
      outbox: [],
      quarantine: [],
      lastCaptureError: "Authorization: Bearer secret",
      malformedOutbox: [{ id: "bad", accessToken: "secret", nested: { api_key: "key" } }],
      malformedQuarantine: [{
        id: "bad-quarantine",
        error: "session_token=secret",
        nested: { credential: "secret" },
        quarantinedAt: "2026-07-21T00:00:00.000Z",
      }],
    });
    expect(update.lastCaptureError).toBe("Retained capture error");
    expect(update.captureOutbox).toEqual([{ id: "bad" }]);
    expect(update.captureQuarantine).toEqual([{
      id: "bad-quarantine",
      error: "malformed retained bundle",
      quarantinedAt: "2026-07-21T00:00:00.000Z",
    }]);
    expect(JSON.stringify(update)).not.toContain("secret");
  });

  it("never persists transport-provided raw error text", () => {
    const first = item("one");
    const plan = planOutboxAfterFlush(
      { outbox: [first], quarantine: [] },
      first,
      { status: 400, error: "token=secret; submitted source code" },
      "2026-07-21T00:02:00.000Z",
    );
    expect(JSON.stringify(plan)).not.toContain("secret");
    expect(JSON.stringify(plan)).not.toContain("source code");
    expect(plan.lastCaptureError).toBe("Isolated result: HTTP 400");
    expect(plan.quarantine[0]?.error).toBe("HTTP 400");
  });

  it("sends one matching ACK exactly once, clears captureOutbox, and stays empty on the next timer", async () => {
    const first = item("one");
    const storage = fakeStorage({
      captureOutbox: [first],
      captureQuarantine: [],
      lastCaptureError: "previous error",
    });
    let requestCount = 0;
    const dependencies = {
      readState: storage.readState,
      send: async (entry: CaptureOutboxItem) => {
        requestCount += 1;
        return success(entry);
      },
      persist: async (plan: CaptureOutboxPlan) => {
        await persistCaptureOutboxPlan(storage, plan);
      },
    };

    expect(await drainCaptureOutbox(dependencies)).toEqual({ reason: "empty", processed: 1 });
    expect(requestCount).toBe(1);
    expect(storage.values.captureOutbox).toEqual([]);
    expect(storage.values).not.toHaveProperty("lastCaptureError");
    expect(storage.values).not.toHaveProperty("outbox");
    expect(storage.values).not.toHaveProperty("quarantine");
    expect(await drainCaptureOutbox(dependencies)).toEqual({ reason: "empty", processed: 0 });
    expect(requestCount).toBe(1);
  });

  it("retains a mismatched ACK, backs off, and exposes a popup error", async () => {
    const first = item("one");
    const storage = fakeStorage({ captureOutbox: [first], captureQuarantine: [] });
    let requestCount = 0;
    const dependencies = {
      readState: storage.readState,
      send: async () => {
        requestCount += 1;
        return {
          status: "ack_error" as const,
          error: "ACK mismatch: expected bundle_one, received bundle_other",
        };
      },
      persist: async (plan: CaptureOutboxPlan) => {
        await persistCaptureOutboxPlan(storage, plan);
      },
    };
    const now = () => "2026-07-21T00:00:00.000Z";

    expect(await drainCaptureOutbox(dependencies, 25, now))
      .toEqual({ reason: "deferred", processed: 1 });
    expect(storage.values.captureOutbox).toHaveLength(1);
    expect(requestCount).toBe(1);
    expect(await drainCaptureOutbox(dependencies, 25, now))
      .toEqual({ reason: "deferred", processed: 0 });
    expect(requestCount).toBe(1);
    expect(presentPopupState(storage.values).blockingReasonText)
      .toBe("阻塞原因：ACK 身份不匹配：invalid response");
  });

  it("retains and blocks an outbox item when the configured endpoint is unsupported", async () => {
    const first = item("one");
    const storage = fakeStorage({ captureOutbox: [first], captureQuarantine: [] });
    let requestCount = 0;
    const dependencies = {
      readState: storage.readState,
      send: async () => {
        requestCount += 1;
        return { status: "endpoint_error" as const, error: "unsupported_capture_endpoint" as const };
      },
      persist: async (plan: CaptureOutboxPlan) => {
        await persistCaptureOutboxPlan(storage, plan);
      },
    };

    expect(await drainCaptureOutbox(dependencies))
      .toEqual({ reason: "global_blocked", processed: 1 });
    expect(requestCount).toBe(1);
    expect(storage.values.captureOutbox).toEqual([first]);
    expect(storage.values.captureQuarantine).toEqual([]);
    expect(storage.values.lastCaptureError).toBe("unsupported_capture_endpoint");
    expect(await drainCaptureOutbox(dependencies))
      .toEqual({ reason: "global_blocked", processed: 1 });
    expect(requestCount).toBe(2);
  });

  it("persists manual retry reset before allowing another request", async () => {
    const blocked = {
      ...item("one"),
      attempts: 3,
      nextAttemptAt: "2026-07-21T01:00:00.000Z",
      automaticRetryBlocked: true,
    };
    const storage = fakeStorage({ captureOutbox: [blocked], captureQuarantine: [] });
    await storage.set(retryAllCaptureStorageUpdate(await storage.readState()));
    const persisted = storage.values.captureOutbox as readonly CaptureOutboxItem[];
    expect(persisted[0]).toMatchObject({ attempts: 0 });
    expect(persisted[0]?.nextAttemptAt).toBeUndefined();
    expect(persisted[0]?.automaticRetryBlocked).toBeUndefined();
  });

  it("retries one quarantined item through capture storage and removes it after one matching ACK", async () => {
    const blocked = {
      ...item("one"),
      attempts: 3,
      nextAttemptAt: "2026-07-21T01:00:00.000Z",
      automaticRetryBlocked: true,
    };
    const storage = fakeStorage({
      captureOutbox: [],
      captureQuarantine: [{
        id: blocked.id,
        item: blocked,
        error: "invalid",
        quarantinedAt: "2026-07-21T00:01:00.000Z",
      }],
    });

    await storage.set(retryQuarantinedCaptureStorageUpdate(
      await storage.readState(),
      blocked.id,
    ));

    const retried = storage.values.captureOutbox as readonly CaptureOutboxItem[];
    expect(retried).toHaveLength(1);
    expect(retried[0]).toMatchObject({ id: blocked.id, attempts: 0 });
    expect(retried[0]?.nextAttemptAt).toBeUndefined();
    expect(retried[0]?.automaticRetryBlocked).toBeUndefined();
    expect(storage.values.captureQuarantine).toEqual([]);
    expect(storage.values).not.toHaveProperty("outbox");
    expect(storage.values).not.toHaveProperty("quarantine");

    let requestCount = 0;
    expect(await drainCaptureOutbox({
      readState: storage.readState,
      send: async (entry) => {
        requestCount += 1;
        return success(entry);
      },
      persist: async (plan) => {
        await persistCaptureOutboxPlan(storage, plan);
      },
    })).toEqual({ reason: "empty", processed: 1 });
    expect(requestCount).toBe(1);
    expect(storage.values.captureOutbox).toEqual([]);
    expect(storage.values.captureQuarantine).toEqual([]);
    expect(storage.values).not.toHaveProperty("outbox");
    expect(storage.values).not.toHaveProperty("quarantine");
  });

  it("stops automatic ACK retries after the bounded retry budget", async () => {
    let state = {
      outbox: [item("one")] as readonly CaptureOutboxItem[],
      quarantine: [] as CaptureOutboxPlan["quarantine"],
    };
    let requestCount = 0;
    const dependencies = {
      readState: async () => state,
      send: async () => {
        requestCount += 1;
        return { status: "ack_error" as const, error: "ACK mismatch: invalid response" };
      },
      persist: async (plan: CaptureOutboxPlan) => {
        state = { outbox: plan.outbox, quarantine: plan.quarantine };
      },
    };
    const times = [
      "2026-07-21T00:00:00.000Z",
      "2026-07-21T00:00:31.000Z",
      "2026-07-21T00:01:32.000Z",
      "2026-07-21T00:10:00.000Z",
    ];
    for (const time of times) {
      await drainCaptureOutbox(dependencies, 25, () => time);
    }
    expect(requestCount).toBe(3);
    expect(state.outbox[0]).toMatchObject({
      attempts: 3,
      automaticRetryBlocked: true,
    });
  });

  it("isolates one bad bundle and continues with the next", async () => {
    let state = { outbox: [item("bad"), item("good")], quarantine: [] as CaptureOutboxPlan["quarantine"] };
    const sent: string[] = [];
    const result = await drainCaptureOutbox({
      readState: async () => state,
      send: async (entry) => {
        sent.push(entry.id);
        return entry.id === "bundle_bad" ? { status: 400, error: "invalid" } : success(entry);
      },
      persist: async (plan) => { state = { outbox: [...plan.outbox], quarantine: [...plan.quarantine] }; },
    });
    expect(result).toEqual({ reason: "empty", processed: 2 });
    expect(sent).toEqual(["bundle_bad", "bundle_good"]);
    expect(state.outbox).toEqual([]);
    expect(state.quarantine.map((entry) => entry.id)).toEqual(["bundle_bad"]);
  });

  it("retains a malformed quarantine record through permanent outbox failure persistence", async () => {
    const malformed = {
      id: "malformed-retained",
      item: {
        id: "malformed-retained",
        kind: "attempt_bundle",
        bundle: { events: null },
        attempts: 1,
        createdAt: "2026-07-21T00:00:00.000Z",
      },
      error: "malformed retained bundle",
      quarantinedAt: "2026-07-21T00:00:00.000Z",
    };
    let state: CaptureOutboxState = {
      outbox: [item("bad")],
      quarantine: [],
      malformedQuarantine: [malformed],
    };
    const sanitizedMalformed = {
      id: malformed.id,
      error: malformed.error,
      quarantinedAt: malformed.quarantinedAt,
    };
    let persistedQuarantine: readonly unknown[] = [];
    const storage = {
      set: async (items: Record<string, unknown>): Promise<void> => {
        const next = items.captureQuarantine;
        if (!Array.isArray(next)) throw new Error("missing persisted quarantine");
        persistedQuarantine = next;
      },
      remove: async (): Promise<void> => undefined,
    };

    const result = await drainCaptureOutbox({
      readState: async () => state,
      send: async () => ({ status: 400 as const, error: "invalid bundle" }),
      persist: async (plan) => {
        await persistCaptureOutboxPlan(storage, plan);
        state = {
          outbox: plan.outbox,
          quarantine: plan.quarantine,
          malformedQuarantine: [sanitizedMalformed],
        };
      },
    });

    expect(result).toEqual({ reason: "empty", processed: 1 });
    expect(persistedQuarantine).toContainEqual(sanitizedMalformed);
    expect(state.malformedQuarantine).toEqual([sanitizedMalformed]);
    expect(state.quarantine.map((entry) => entry.id)).toEqual(["bundle_bad"]);
  });

  it("retains a malformed outbox record through successful delivery persistence", async () => {
    const malformed = {
      id: "malformed-outbox",
      kind: "attempt_bundle",
      bundle: { events: null },
      attempts: 1,
      createdAt: "2026-07-21T00:00:00.000Z",
    };
    let state: CaptureOutboxState = {
      outbox: [item("good")],
      quarantine: [],
      malformedOutbox: [malformed],
    };
    const sanitizedMalformed = { id: malformed.id };
    let persistedOutbox: readonly unknown[] = [];
    const storage = {
      set: async (items: Record<string, unknown>): Promise<void> => {
        const next = items.captureOutbox;
        if (!Array.isArray(next)) throw new Error("missing persisted outbox");
        persistedOutbox = next;
      },
      remove: async (): Promise<void> => undefined,
    };

    const result = await drainCaptureOutbox({
      readState: async () => state,
      send: async (entry) => success(entry),
      persist: async (plan) => {
        await persistCaptureOutboxPlan(storage, plan);
        state = {
          outbox: plan.outbox,
          quarantine: plan.quarantine,
          malformedOutbox: [sanitizedMalformed],
          malformedQuarantine: plan.malformedQuarantine,
        };
      },
    });

    expect(result).toEqual({ reason: "empty", processed: 1 });
    expect(persistedOutbox).toContainEqual(sanitizedMalformed);
    expect(state.malformedOutbox).toEqual([sanitizedMalformed]);
    expect(state.outbox).toEqual([]);
  });

  it("shows malformed fallback quarantine as a diagnostic without retry controls", () => {
    const malformed = {
      id: "malformed-popup",
      item: {
        id: "malformed-popup",
        kind: "attempt_bundle",
        bundle: { events: null },
        attempts: 1,
        createdAt: "2026-07-21T00:00:00.000Z",
      },
      error: "malformed retained bundle",
      quarantinedAt: "2026-07-21T00:00:00.000Z",
    };
    expect(classifyQuarantineEntry(malformed)).toEqual({
      summary: "? · ? · malformed quarantine bundle · malformed-popup · malformed retained bundle",
      retryable: false,
      deletable: true,
      malformed: true,
      id: "malformed-popup",
    });
    expect(presentPopupState({ captureQuarantine: [malformed] }).quarantineDetails).toEqual([
      "? · ? · malformed quarantine bundle · malformed-popup · malformed retained bundle",
    ]);
    expect(classifyQuarantineEntry(null)).toEqual({
      summary: "? · ? · malformed quarantine record · unrecognized retained value",
      retryable: false,
      deletable: false,
      malformed: true,
    });
    expect(presentPopupState({ captureQuarantine: [null, "broken"] }).quarantineDetails).toEqual([
      "? · ? · malformed quarantine record · unrecognized retained value",
      "? · ? · malformed quarantine record · unrecognized retained value",
    ]);
    expect(classifyQuarantineEntry({
      id: "valid-quarantine",
      summary: "atcoder · abc · Accepted · time · error",
      retryable: true,
      deletable: true,
    })).toEqual({
      id: "valid-quarantine",
      summary: "Retained quarantine diagnostic",
      retryable: true,
      deletable: true,
    });
    expect(presentPopupState({
      captureOutbox: [{ id: "malformed-outbox", bundle: { events: null } }],
    }).quarantineDetails).toEqual([
      "? · ? · malformed outbox bundle · malformed-outbox · retained without delivery",
    ]);
  });

  it("never displays retained legacy error bodies through the popup fallback", () => {
    const legacy = {
      id: item("legacy").id,
      item: item("legacy"),
      error: "token=secret; source code and request body",
      quarantinedAt: "2026-07-21T00:02:00.000Z",
    };
    const presentation = presentPopupState({
      lastCaptureError: "Authorization: Bearer secret",
      captureQuarantine: [legacy, {
        id: "malformed",
        error: "accessToken=secret",
      }, {
        id: "structured",
        summary: "token=secret · source code · body=secret · time · HTTP 400",
        retryable: false,
        deletable: true,
      }],
    });
    expect(JSON.stringify(presentation)).not.toContain("secret");
    expect(presentation.blockingReasonText).toBe("阻塞原因：Retained capture error");
    expect(presentation.quarantineDetails.every((detail) =>
      !detail.includes("source code") && !detail.includes("request body"))).toBe(true);
    expect(presentation.quarantineDetails).toContain("Retained quarantine diagnostic");
  });

  it("retains all results during a network outage", async () => {
    let state = { outbox: [item("one"), item("two")], quarantine: [] as CaptureOutboxPlan["quarantine"] };
    const result = await drainCaptureOutbox({
      readState: async () => state,
      send: async () => ({ status: "network_error", error: "offline" }),
      persist: async (plan) => { state = { outbox: [...plan.outbox], quarantine: [...plan.quarantine] }; },
    });
    expect(result.reason).toBe("global_blocked");
    expect(state.outbox).toHaveLength(2);
    expect(state.quarantine).toEqual([]);
  });
});
