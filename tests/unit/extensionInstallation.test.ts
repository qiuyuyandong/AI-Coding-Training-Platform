import { describe, expect, it } from "vitest";
import {
  applyExtensionInitialization,
  applyExtensionInitializationSplit,
  CAPTURE_PROTOCOL_VERSION,
  extensionInitializationLocalStorage,
  extensionInitializationSessionStorage,
  extensionInitializationStorage,
  LOCAL_INITIALIZATION_KEYS,
  planExtensionInitialization,
  restrictStorageToTrustedContexts,
  runtimeContextFromPlan,
  SESSION_INITIALIZATION_KEYS,
  type ExtensionInitializationAreaStorage,
  type ExtensionInitializationStorageSplit,
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

describe("planExtensionInitialization V4", () => {
  it("clears every V3 intent without promoting one to a confirmed submission", () => {
    const pendingSubmissionIntents = [
      { ...outboxIntent("active"), status: "active" as const },
      { ...outboxIntent("superseded"), status: "superseded" as const },
      { ...outboxIntent("expired"), status: "expired" as const },
    ];
    const plan = planExtensionInitialization({
      captureProtocolVersion: 3,
      pendingSubmissionIntents,
    }, options);

    expect(plan.captureProtocolVersion).toBe(4);
    expect(plan.confirmedSubmissions).toEqual([]);
    expect(plan.v4ClickIntentMigration).toEqual({
      removedActiveIntentCount: 1,
      migratedAt: options.now,
      sourceProtocolVersion: 3,
      targetProtocolVersion: 4,
      reason: "click_only_intents_not_server_confirmed",
    });
    expect(plan.shouldRemovePendingSubmissionIntents).toBe(true);
  });

  it("preserves durable V3 delivery, pairing, and endpoint values", () => {
    const captureOutbox = [outboxItem("preserved")];
    const captureQuarantine = [{
      id: captureOutbox[0].id,
      item: captureOutbox[0],
      error: "HTTP 500",
      quarantinedAt: options.now,
    }];
    const plan = planExtensionInitialization({
      captureProtocolVersion: 3,
      installationId: "installation_existing",
      captureCredential: "credential_existing",
      captureEndpoint: "http://localhost:3000/api/capture/attempts",
      captureOutbox,
      captureQuarantine,
      pendingSubmissionIntents: [{ ...outboxIntent("active"), status: "active" }],
      discardedPreBundleEventCount: 32,
      preBundleQueueDiscardedAt: "2026-07-20T00:00:00.000Z",
    }, options);

    expect(plan).toMatchObject({
      installationId: "installation_existing",
      captureCredential: "credential_existing",
      captureEndpoint: "http://localhost:3000/api/capture/attempts",
      captureOutbox,
      captureQuarantine,
      discardedPreBundleEventCount: 32,
      preBundleQueueDiscardedAt: "2026-07-20T00:00:00.000Z",
    });
  });

  it("resumes after the V4 authoritative write without recounting or changing time", () => {
    const first = planExtensionInitialization({
      captureProtocolVersion: 3,
      pendingSubmissionIntents: [{ ...outboxIntent("active"), status: "active" }],
    }, options);
    const interrupted = {
      captureProtocolVersion: first.captureProtocolVersion,
      confirmedSubmissions: first.confirmedSubmissions,
      v4ClickIntentMigration: first.v4ClickIntentMigration,
      pendingSubmissionIntents: [{ ...outboxIntent("active"), status: "active" }],
    };

    const resumed = planExtensionInitialization(interrupted, {
      ...options,
      now: "2026-07-24T01:00:00.000Z",
    });

    expect(resumed.v4ClickIntentMigration).toEqual(first.v4ClickIntentMigration);
    expect(resumed.confirmedSubmissions).toEqual([]);
    expect(resumed.shouldRemovePendingSubmissionIntents).toBe(true);
  });

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
      captureOutbox: [],
      captureQuarantine: [],
      discardedPreBundleEventCount: 32,
      preBundleQueueDiscardedAt: options.now,
      shouldRemoveLegacyEventQueue: true,
    });
    expect("eventQueue" in plan).toBe(false);
  });

  it("durably writes V4 state before removing the legacy key", async () => {
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
      captureProtocolVersion: 4,
      confirmedSubmissions: [],
      discardedPreBundleEventCount: 32,
      captureOutbox: [],
      captureQuarantine: [],
    });
    expect("eventQueue" in written).toBe(false);
    expect("pendingSubmissionIntents" in written).toBe(false);
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

    expect(operations).toEqual([
      "set",
      "remove:pendingSubmissionIntents",
      "remove:outbox",
      "remove:quarantine",
    ]);
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
    expect(plan.captureOutbox).toEqual([{ id: "bundle_1" }]);
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
  it("carries V4 transient and confirmed state across idempotent migration", () => {
    const confirmed = {
      schemaVersion: 1, status: "confirmed", platform: "atcoder", problemExternalId: "abc_a",
      externalSubmissionId: "42", confirmedAt: options.now, storageKey: "atcoder:42", lastE3At: options.now,
    };
    const values = {
      captureProtocolVersion: 4,
      uiHints: [], transientE1: [], transientPageContexts: [], transientUnmatchedE3: [], transientAmbiguityDiagnostics: [],
      confirmedSubmissions: [confirmed], confirmedSubmissionTombstones: [],
      captureOutbox: [{ id: "durable" }], captureQuarantine: [{ id: "q" }], captureCredential: "paired",
    };
    const first = planExtensionInitialization(values, options);
    const second = planExtensionInitialization(extensionInitializationStorage(first), options);
    expect(first.transientSessionEvidence).toBeDefined();
    expect(first.confirmedSubmissions).toEqual(second.confirmedSubmissions);
    expect(first.confirmedSubmissionTombstones).toEqual(second.confirmedSubmissionTombstones);
    expect(second.captureOutbox).toEqual(values.captureOutbox);
    expect(second.captureQuarantine).toEqual([{ id: "q", error: "malformed retained bundle" }]);
  });
});

describe("planExtensionInitialization local/session split", () => {
  it("exposes local items and session items as separate helpers", () => {
    const plan = planExtensionInitialization({
      captureProtocolVersion: 4,
      installationId: "installation_existing",
      captureCredential: "paired",
      captureOutbox: [{ id: "durable" }],
      captureQuarantine: [{ id: "q" }],
      confirmedSubmissions: [{ schemaVersion: 1, status: "confirmed", platform: "atcoder", problemExternalId: "abc_a", externalSubmissionId: "42", confirmedAt: options.now, storageKey: "atcoder:42", lastE3At: options.now }],
      confirmedSubmissionTombstones: [],
      discardedPreBundleEventCount: 32,
      preBundleQueueDiscardedAt: options.now,
      uiHints: [], transientE1: [], transientPageContexts: [], transientUnmatchedE3: [], transientAmbiguityDiagnostics: [],
    }, options);
    const local = extensionInitializationLocalStorage(plan);
    const session = extensionInitializationSessionStorage(plan);
    expect(local).toHaveProperty("captureOutbox");
    expect(local).toHaveProperty("captureQuarantine");
    expect(local).toHaveProperty("captureCredential");
    expect(local).not.toHaveProperty("uiHints");
    expect(local).not.toHaveProperty("transientE1");
    expect(session).toHaveProperty("uiHints");
    expect(session).toHaveProperty("transientE1");
    expect(session).not.toHaveProperty("captureOutbox");
    expect(session).not.toHaveProperty("captureCredential");
  });

  it("LOCAL_INITIALIZATION_KEYS and SESSION_INITIALIZATION_KEYS do not overlap", () => {
    const overlap = LOCAL_INITIALIZATION_KEYS.filter((k) => SESSION_INITIALIZATION_KEYS.includes(k));
    expect(overlap).toEqual([]);
    expect(LOCAL_INITIALIZATION_KEYS).toContain("confirmedSubmissionTombstones");
    expect(SESSION_INITIALIZATION_KEYS).toContain("transientAmbiguityDiagnostics");
  });
});

describe("applyExtensionInitializationSplit", () => {
  it("writes transient evidence to session and durable delivery to local", async () => {
    const spy = createSplitSpy();
    const stored = {
      captureProtocolVersion: 4,
      installationId: "installation_existing",
      captureCredential: "paired",
      captureEndpoint: "http://localhost:3000/api/capture/attempts",
      captureOutbox: [{ id: "durable" }],
      captureQuarantine: [{ id: "q" }],
      confirmedSubmissions: [],
      confirmedSubmissionTombstones: [],
      discardedPreBundleEventCount: 32,
      preBundleQueueDiscardedAt: options.now,
      uiHints: [],
      transientE1: [],
      transientPageContexts: [],
      transientUnmatchedE3: [],
      transientAmbiguityDiagnostics: [],
    };
    const plan = planExtensionInitialization(stored, options);
    await applyExtensionInitializationSplit(spy, plan);

    expect(spy.localSpy.writes.length).toBeGreaterThan(0);
    expect(spy.sessionSpy.writes.length).toBeGreaterThan(0);
    const localWriteKeys = Object.keys(spy.localSpy.writes[0] ?? {});
    expect(localWriteKeys).toContain("captureProtocolVersion");
    expect(localWriteKeys).toContain("captureOutbox");
    expect(localWriteKeys).toContain("captureCredential");
    const sessionWriteKeys = Object.keys(spy.sessionSpy.writes[0] ?? {});
    expect(sessionWriteKeys).not.toContain("captureOutbox");
    expect(sessionWriteKeys).not.toContain("captureCredential");
  });

  it("does not rewrite captureOutbox / captureQuarantine / captureCredential when only transient/tombstone state changes", async () => {
    const existing = {
      captureProtocolVersion: 4,
      installationId: "installation_existing",
      captureCredential: "paired",
      captureEndpoint: "http://localhost:3000/api/capture/attempts",
      captureOutbox: [{ id: "durable_outbox" }],
       captureQuarantine: [],
      confirmedSubmissions: [{ schemaVersion: 1, status: "confirmed", platform: "atcoder", problemExternalId: "abc_a", externalSubmissionId: "42", confirmedAt: options.now, storageKey: "atcoder:42", lastE3At: options.now }],
      confirmedSubmissionTombstones: [{ submissionKey: "atcoder:42", finalizedAt: options.now, expiresAt: "2026-08-20T00:00:00.000Z" }],
      discardedPreBundleEventCount: 32,
      preBundleQueueDiscardedAt: options.now,
      uiHints: [],
      transientE1: [],
      transientPageContexts: [],
      transientUnmatchedE3: [],
      transientAmbiguityDiagnostics: [],
    };
    const plan = planExtensionInitialization(existing, options);
    expect(plan.captureProtocolVersion).toBe(4);
    const spy = createSplitSpy();
    // Pre-seed prior state in spy storage so diff is computed against it
    await spy.local.set(existing);
    await spy.session.set({
      uiHints: [], transientE1: [], transientPageContexts: [],
      transientUnmatchedE3: [], transientAmbiguityDiagnostics: [],
    });
    spy.localSpy.writes.length = 0;
    spy.sessionSpy.writes.length = 0;
    spy.localSpy.removes.length = 0;

    // Second migration: plan reads from prior = existing, then add a new transient diagnostic
    const rehydratedStored = {
      ...existing,
      transientAmbiguityDiagnostics: [
        { schemaVersion: 1, tier: "E1", kind: "ambiguity_diagnostic", reason: "multiple_e1_candidates", receivedAt: options.now },
      ],
    };
    const plan2 = planExtensionInitialization(rehydratedStored, options);
    await applyExtensionInitializationSplit(spy, plan2);

    const localWriteKeys = spy.localSpy.writes.flatMap((w) => Object.keys(w));
    expect(localWriteKeys).not.toContain("captureOutbox");
    expect(localWriteKeys).not.toContain("captureQuarantine");
    expect(localWriteKeys).not.toContain("captureCredential");
    // Legacy keys "outbox" / "quarantine" cleanup is still issued by the apply
    expect(spy.localSpy.removes).toEqual(["outbox", "quarantine"]);
    expect(spy.sessionSpy.writes.length).toBe(1);
  });

  it("preserves durable fields after a simulated browser restart (session wiped, local retained)", () => {
    const localStored = {
      captureProtocolVersion: 4,
      installationId: "installation_existing",
      captureCredential: "paired",
      captureEndpoint: "http://localhost:3000/api/capture/attempts",
      captureOutbox: [{ id: "durable" }],
       captureQuarantine: [{ id: "q" }],
      confirmedSubmissions: [{ schemaVersion: 1, status: "confirmed", platform: "atcoder", problemExternalId: "abc_a", externalSubmissionId: "42", confirmedAt: options.now, storageKey: "atcoder:42", lastE3At: options.now }],
      confirmedSubmissionTombstones: [{ submissionKey: "atcoder:42", finalizedAt: options.now, expiresAt: "2026-08-20T00:00:00.000Z" }],
      discardedPreBundleEventCount: 32,
      preBundleQueueDiscardedAt: options.now,
    };
    // Browser restart: session storage is empty
    const mergedAfterRestart = {
      ...localStored,
      uiHints: [], transientE1: [], transientPageContexts: [],
      transientUnmatchedE3: [], transientAmbiguityDiagnostics: [],
    };
    const plan = planExtensionInitialization(mergedAfterRestart, options);
    expect(plan.captureOutbox).toEqual([{ id: "durable" }]);
    expect(plan.captureQuarantine).toEqual([{ id: "q", error: "malformed retained bundle" }]);
    expect(plan.captureCredential).toBe("paired");
    expect(plan.confirmedSubmissions).toHaveLength(1);
    expect(plan.confirmedSubmissionTombstones).toHaveLength(1);
    expect(plan.transientSessionEvidence?.requestLifecycles).toEqual([]);
  });

  it("never silently drops an existing confirmedSubmissionTombstones array", async () => {
    const existing = {
      captureProtocolVersion: 4,
      installationId: "installation_existing",
      captureCredential: "paired",
      captureOutbox: [],
      captureQuarantine: [],
      confirmedSubmissions: [],
      confirmedSubmissionTombstones: [
        { submissionKey: "atcoder:1", finalizedAt: "2026-07-01T00:00:00.000Z", expiresAt: "2026-08-01T00:00:00.000Z" },
        { submissionKey: "atcoder:2", finalizedAt: "2026-07-02T00:00:00.000Z", expiresAt: "2026-08-02T00:00:00.000Z" },
      ],
      discardedPreBundleEventCount: 0,
    };
    // Caller forgot to pass tombstones into the plan input; they should still be preserved.
    const planInput = {
      captureProtocolVersion: 4,
      installationId: "installation_existing",
      captureCredential: "paired",
      captureOutbox: [],
      captureQuarantine: [],
      confirmedSubmissions: [],
      discardedPreBundleEventCount: 0,
    };
    const plan = planExtensionInitialization(planInput, options);
    const spy = createSplitSpy();
    // Pre-seed prior state with tombstones that the caller forgot to include
    await spy.local.set(existing);
    spy.localSpy.writes.length = 0;
    await applyExtensionInitializationSplit(spy, plan);
    const mergedWrite = spy.localSpy.writes.reduce<Record<string, unknown>>((acc, w) => ({ ...acc, ...w }), {});
    // The tombstone slice is preserved on disk even though the caller omitted it from the plan input.
    const finalStorage = await spy.local.get(["confirmedSubmissionTombstones"]);
    expect(finalStorage.confirmedSubmissionTombstones).toEqual(existing.confirmedSubmissionTombstones);
    expect(mergedWrite.confirmedSubmissionTombstones ?? finalStorage.confirmedSubmissionTombstones).toEqual(
      existing.confirmedSubmissionTombstones,
    );
  });

  it("writes nothing to local when the V4 plan matches prior state exactly", async () => {
    const existing = {
      captureProtocolVersion: 4,
      installationId: "installation_existing",
      captureCredential: "paired",
      captureEnabled: true,
      captureEndpoint: "http://localhost:3000/api/capture/attempts",
      captureOutbox: [{ id: "durable" }],
       captureQuarantine: [],
      confirmedSubmissions: [{ schemaVersion: 1, status: "confirmed", platform: "atcoder", problemExternalId: "abc_a", externalSubmissionId: "42", confirmedAt: options.now, storageKey: "atcoder:42", lastE3At: options.now }],
      confirmedSubmissionTombstones: [],
      discardedPreBundleEventCount: 32,
      preBundleQueueDiscardedAt: options.now,
      uiHints: [], transientE1: [], transientPageContexts: [],
      transientUnmatchedE3: [], transientAmbiguityDiagnostics: [],
    };
    const plan = planExtensionInitialization(existing, options);
    const spy = createSplitSpy();
    await spy.local.set(existing);
    await spy.session.set({
      uiHints: [], transientE1: [], transientPageContexts: [],
      transientUnmatchedE3: [], transientVerdictCandidates: [], transientAmbiguityDiagnostics: [],
    });
    spy.localSpy.writes.length = 0;
    spy.sessionSpy.writes.length = 0;
    await applyExtensionInitializationSplit(spy, plan);
    expect(spy.localSpy.writes).toEqual([]);
    expect(spy.sessionSpy.writes).toEqual([]);
  });

  it("writes only the changed tombstone slice when a new E2 is finalized", async () => {
    const now = "2026-07-24T01:00:00.000Z";
    const existing = {
      captureProtocolVersion: 4,
      installationId: "installation_existing",
      captureCredential: "paired",
      captureEndpoint: "http://localhost:3000/api/capture/attempts",
      captureOutbox: [{ id: "durable" }],
      captureQuarantine: [],
      confirmedSubmissions: [],
      confirmedSubmissionTombstones: [],
      discardedPreBundleEventCount: 32,
      preBundleQueueDiscardedAt: options.now,
      uiHints: [], transientE1: [], transientPageContexts: [],
      transientUnmatchedE3: [], transientAmbiguityDiagnostics: [],
    };
    const spy = createSplitSpy();
    await spy.local.set(existing);
    await spy.session.set({
      uiHints: [], transientE1: [], transientPageContexts: [],
      transientUnmatchedE3: [], transientAmbiguityDiagnostics: [],
    });
    spy.localSpy.writes.length = 0;
    // Re-plan after adding a new confirmed + tombstone (simulated in-memory)
    const planInput = {
      ...existing,
      confirmedSubmissions: [{ schemaVersion: 1, status: "confirmed", platform: "atcoder", problemExternalId: "abc_a", externalSubmissionId: "42", confirmedAt: now, storageKey: "atcoder:42", lastE3At: now }],
      confirmedSubmissionTombstones: [{ submissionKey: "atcoder:42", finalizedAt: now, expiresAt: "2026-08-23T01:00:00.000Z" }],
    };
    const plan = planExtensionInitialization(planInput, options);
    await applyExtensionInitializationSplit(spy, plan);
    const mergedWrite = spy.localSpy.writes.reduce<Record<string, unknown>>((acc, w) => ({ ...acc, ...w }), {});
    expect(mergedWrite).toHaveProperty("confirmedSubmissions");
    expect(mergedWrite).toHaveProperty("confirmedSubmissionTombstones");
    expect(mergedWrite).not.toHaveProperty("captureOutbox");
    expect(mergedWrite).not.toHaveProperty("captureCredential");
  });
});

function outboxIntent(submissionId: string): Omit<PendingSubmissionIntent, "status"> {
  return {
    installationId: "installation_existing",
    platform: "atcoder",
    problemExternalId: submissionId,
    problemTitle: submissionId,
    canonicalUrl: `https://atcoder.jp/contests/abc100/tasks/${submissionId}`,
    captureSessionId: `session_${submissionId}`,
    submissionId,
    occurredAt: "2026-07-21T00:00:00.000Z",
  };
}

function createAreaSpy(): ExtensionInitializationAreaStorage & {
  readonly writes: Record<string, unknown>[];
  readonly removes: string[];
} {
  const store: Record<string, unknown> = {};
  const writes: Record<string, unknown>[] = [];
  const removes: string[] = [];
  return {
    writes,
    removes,
    get: async (keys) => {
      const out: Record<string, unknown> = {};
      for (const k of keys) out[k] = store[k];
      return out;
    },
    set: async (items) => {
      for (const [k, v] of Object.entries(items)) store[k] = v;
      writes.push({ ...items });
    },
    remove: async (key) => {
      Reflect.deleteProperty(store, key);
      removes.push(key);
    },
  };
}

function createSplitSpy(): ExtensionInitializationStorageSplit & {
  readonly localSpy: ReturnType<typeof createAreaSpy>;
  readonly sessionSpy: ReturnType<typeof createAreaSpy>;
  readonly localReads: number;
  readonly sessionReads: number;
} {
  const localSpy = createAreaSpy();
  const sessionSpy = createAreaSpy();
  let localReads = 0;
  let sessionReads = 0;
  const wrap = <T extends ExtensionInitializationAreaStorage>(spy: T, bump: () => void): T => ({
    ...spy,
    get: async (keys) => {
      bump();
      return spy.get(keys);
    },
  });
  return {
    localSpy,
    sessionSpy,
    get localReads() { return localReads; },
    get sessionReads() { return sessionReads; },
    local: wrap(localSpy, () => { localReads += 1; }),
    session: wrap(sessionSpy, () => { sessionReads += 1; }),
  };
}
