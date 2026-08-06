import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import {
  applyExtensionInitializationSplit,
  extensionInitializationLocalStorage,
  planExtensionInitialization,
  type ExtensionInitializationAreaStorage,
  type ExtensionInitializationStorageSplit,
} from "@/extension/src/installation";
import {
  applyOrchestratorPersistence,
  createBackgroundOrchestrator,
} from "@/extension/src/backgroundOrchestrator";
import type { OrchestratorEffects } from "@/extension/src/backgroundOrchestrator";
import { persistEffectsBeforeCaching } from "@/extension/src/backgroundPersistence";
import { PLATFORM_ADAPTERS } from "@/extension/src/adapters/registry";
import {
  buildCaptureAttemptBundle,
  type CaptureOutboxItem,
  type CaptureQuarantineItem,
} from "@/extension/src/attemptStorage";
import type { PendingSubmissionIntent } from "@/extension/src/attemptCapture";
import {
  drainCaptureOutbox,
  persistCaptureOutboxPlan,
  type CaptureOutboxPlan,
} from "@/extension/src/outboxDrain";

const FIRST_RUN = "2026-08-03T00:00:00.000Z";
const SECOND_RUN = "2026-08-03T01:00:00.000Z";
const INSTALLATION_ID = "d1-installation";

type StorageAreaName = "local" | "session";
type FailureTarget =
  | "local.get"
  | "session.get"
  | "local.set"
  | "session.set"
  | "remove:pendingSubmissionIntents"
  | "remove:lastCaptureError"
  | "remove:eventQueue"
  | "remove:outbox"
  | "remove:quarantine";
type FailureMode = "before" | "after";

type FailureInjection = Readonly<{
  readonly target: FailureTarget;
  readonly mode: FailureMode;
}>;

type StorageHarness = Readonly<{
  readonly storage: ExtensionInitializationStorageSplit;
  readonly local: Record<string, unknown>;
  readonly session: Record<string, unknown>;
  readonly operations: readonly string[];
  readonly setFailure: (failure: FailureInjection | undefined) => void;
  readonly snapshot: () => {
    readonly local: Record<string, unknown>;
    readonly session: Record<string, unknown>;
  };
}>;

function clone<T>(value: T): T {
  return structuredClone(value);
}

function createStorageHarness(initial: {
  readonly local?: Record<string, unknown>;
  readonly session?: Record<string, unknown>;
} = {}): StorageHarness {
  const local = clone(initial.local ?? {});
  const session = clone(initial.session ?? {});
  const operations: string[] = [];
  let failure: FailureInjection | undefined;

  const failIfConfigured = (target: FailureTarget, mode: FailureMode): void => {
    if (failure?.target !== target || failure.mode !== mode) return;
    failure = undefined;
    throw new Error(`D1 injected failure at ${target} (${mode})`);
  };

  const createArea = (areaName: StorageAreaName): ExtensionInitializationAreaStorage => {
    const values = areaName === "local" ? local : session;
    return {
      get: async (keys): Promise<Record<string, unknown>> => {
        const target = `${areaName}.get` as FailureTarget;
        operations.push(target);
        failIfConfigured(target, "before");
        const result: Record<string, unknown> = {};
        for (const key of keys) {
          if (Object.hasOwn(values, key)) result[key] = clone(values[key]);
        }
        return result;
      },
      set: async (items): Promise<void> => {
        const target = `${areaName}.set` as FailureTarget;
        operations.push(target);
        failIfConfigured(target, "before");
        for (const [key, value] of Object.entries(items)) values[key] = clone(value);
        failIfConfigured(target, "after");
      },
      remove: async (key): Promise<void> => {
        const target = `remove:${key}` as FailureTarget;
        operations.push(target);
        failIfConfigured(target, "before");
        Reflect.deleteProperty(values, key);
        failIfConfigured(target, "after");
      },
    };
  };

  const storage = {
    local: createArea("local"),
    session: createArea("session"),
  } satisfies ExtensionInitializationStorageSplit;

  return {
    storage,
    local,
    session,
    operations,
    setFailure: (next) => { failure = next; },
    snapshot: () => ({ local: clone(local), session: clone(session) }),
  };
}

function createOutboxItem(id: string): CaptureOutboxItem {
  const intent: PendingSubmissionIntent = {
    installationId: INSTALLATION_ID,
    platform: "atcoder",
    problemExternalId: `problem-${id}`,
    problemTitle: `problem-${id}`,
    canonicalUrl: `https://atcoder.jp/contests/abc001/tasks/${id}`,
    captureSessionId: `session-${id}`,
    submissionId: id,
    occurredAt: FIRST_RUN,
    status: "active",
  };
  const bundle = buildCaptureAttemptBundle(intent, {
    installationId: INSTALLATION_ID,
    platform: "atcoder",
    problemExternalId: intent.problemExternalId,
    verdict: "Accepted",
    observedAt: SECOND_RUN,
    transitionEvidence: "exact_result_document",
  }, "extension_paired");
  return {
    id: bundle.bundleId,
    kind: "attempt_bundle",
    bundle,
    attempts: 0,
    createdAt: SECOND_RUN,
  };
}

function createQuarantineItem(item: CaptureOutboxItem): CaptureQuarantineItem {
  return {
    id: item.id,
    item,
    error: "HTTP 500",
    quarantinedAt: SECOND_RUN,
  };
}

const confirmedRecord = {
  schemaVersion: 1,
  status: "confirmed",
  platform: "atcoder",
  problemExternalId: "abc001_a",
  externalSubmissionId: "d1-confirmed",
  confirmedAt: FIRST_RUN,
  storageKey: "atcoder:d1-confirmed",
  lastE3At: FIRST_RUN,
};

const tombstoneRecord = {
  submissionKey: "atcoder:d1-finalized",
  finalizedAt: FIRST_RUN,
  expiresAt: "2026-09-02T00:00:00.000Z",
};

const durableOutbox = createOutboxItem("durable");
const durableQuarantine = createQuarantineItem(createOutboxItem("quarantine"));
const staleOutbox = createOutboxItem("stale-legacy");

function createCurrentV4State(): {
  readonly local: Record<string, unknown>;
  readonly session: Record<string, unknown>;
} {
  return {
    local: {
      captureProtocolVersion: 4,
      installationId: INSTALLATION_ID,
      captureCredential: "d1-paired-credential",
      captureCredentialVersion: 2,
      captureEnabled: true,
      captureEndpoint: "http://localhost:3000/api/capture/attempts",
      confirmedSubmissions: [confirmedRecord],
      confirmedSubmissionTombstones: [tombstoneRecord],
      captureOutbox: [durableOutbox],
      captureQuarantine: [durableQuarantine],
       lastCaptureError: "HTTP 500",
      lastSuccessfulCaptureAt: FIRST_RUN,
      lastDeliveredAttemptId: "retained-attempt",
      lastDeliveredAttemptStatus: "passed",
      pairedAt: FIRST_RUN,
      discardedPreBundleEventCount: 9,
      preBundleQueueDiscardedAt: FIRST_RUN,
      pendingSubmissionIntents: [{ status: "active", id: "legacy-pending" }],
      eventQueue: [{ id: "legacy-event" }],
      outbox: [staleOutbox],
      quarantine: [createQuarantineItem(staleOutbox)],
      unknownLocalSentinel: { owner: "D1", value: "preserve-local" },
    },
    session: {
      unknownSessionSentinel: { owner: "D1", value: "preserve-session" },
      contentIngressReady: [{ reason: "ready_record", tabId: 1, frameId: 0 }],
      contentIngressDiagnostics: [{ reason: "injection_failed" }],
      characterizationSession: { active: true, platform: "nowcoder" },
    },
  };
}

function createLegacyState(): {
  readonly local: Record<string, unknown>;
  readonly session: Record<string, unknown>;
} {
  return {
    local: {
      captureProtocolVersion: 3,
      installationId: INSTALLATION_ID,
      captureCredential: "d1-legacy-credential",
      captureCredentialVersion: 1,
      captureEnabled: true,
      captureEndpoint: "http://localhost:3000/api/capture/attempts",
      captureOutbox: [durableOutbox],
      captureQuarantine: [durableQuarantine],
      discardedPreBundleEventCount: 7,
      preBundleQueueDiscardedAt: FIRST_RUN,
      pendingSubmissionIntents: [
        { id: "active", status: "active" },
        { id: "superseded", status: "superseded" },
        { id: "expired", status: "expired" },
      ],
      eventQueue: [{ id: "legacy-event-1" }, { id: "legacy-event-2" }],
      outbox: [staleOutbox],
      quarantine: [createQuarantineItem(staleOutbox)],
      unknownLocalSentinel: { owner: "D1", value: "preserve-local" },
      pairedAt: FIRST_RUN,
       lastCaptureError: "HTTP 500",
      lastSuccessfulCaptureAt: FIRST_RUN,
      lastDeliveredAttemptId: "legacy-attempt",
      lastDeliveredAttemptStatus: "failed",
    },
    session: {
      unknownSessionSentinel: { owner: "D1", value: "preserve-session" },
      contentIngressReady: [{ reason: "ready_record", tabId: 1, frameId: 0 }],
    },
  };
}

function createV2State(): {
  readonly local: Record<string, unknown>;
  readonly session: Record<string, unknown>;
} {
  return {
    local: {
      captureProtocolVersion: 2,
      installationId: INSTALLATION_ID,
      captureCredential: "d1-v2-credential",
      captureEnabled: true,
      captureEndpoint: "http://localhost:3000/api/capture/attempts",
      eventQueue: [{ id: "v2-event-1" }, { id: "v2-event-2" }],
      outbox: [staleOutbox],
      quarantine: [createQuarantineItem(staleOutbox)],
      unknownLocalSentinel: { owner: "D1", value: "preserve-v2-local" },
    },
    session: {
      unknownSessionSentinel: { owner: "D1", value: "preserve-v2-session" },
    },
  };
}

function initializationPlan(harness: StorageHarness, now = FIRST_RUN) {
  return planExtensionInitialization({ ...harness.local, ...harness.session }, {
    now,
    createInstallationId: () => "d1-new-installation",
  });
}

async function applyInitialization(harness: StorageHarness, now = FIRST_RUN): Promise<void> {
  await applyExtensionInitializationSplit(harness.storage, initializationPlan(harness, now));
}

async function installProductionOrchestrator(harness: StorageHarness, now = FIRST_RUN): Promise<void> {
  const orchestrator = createBackgroundOrchestrator({
    storage: harness.storage,
    now: () => now,
    flushOutbox: async () => undefined,
  });
  await applyEffects(harness, await orchestrator.install());
}

async function applyEffects(harness: StorageHarness, effects: OrchestratorEffects): Promise<void> {
  await applyOrchestratorPersistence(harness.storage, effects.persistence);
}

function durableSnapshot(harness: StorageHarness): Record<string, unknown> {
  const keys = [
    "installationId",
    "captureCredential",
    "captureCredentialVersion",
    "captureEnabled",
    "captureEndpoint",
    "captureProtocolVersion",
    "confirmedSubmissions",
    "confirmedSubmissionTombstones",
    "captureOutbox",
    "captureQuarantine",
    "lastCaptureError",
    "lastSuccessfulCaptureAt",
    "lastDeliveredAttemptId",
    "lastDeliveredAttemptStatus",
    "pairedAt",
    "discardedPreBundleEventCount",
    "preBundleQueueDiscardedAt",
    "unknownLocalSentinel",
  ];
  const result: Record<string, unknown> = {};
  for (const key of keys) {
    if (Object.hasOwn(harness.local, key)) result[key] = clone(harness.local[key]);
  }
  return result;
}

function expectLegacyKeysRemoved(harness: StorageHarness): void {
  expect(harness.local).not.toHaveProperty("pendingSubmissionIntents");
  expect(harness.local).not.toHaveProperty("eventQueue");
  expect(harness.local).not.toHaveProperty("outbox");
  expect(harness.local).not.toHaveProperty("quarantine");
}

function semanticSnapshot(snapshot: ReturnType<StorageHarness["snapshot"]>): {
  readonly local: Record<string, unknown>;
  readonly session: Record<string, unknown>;
} {
  const session = clone(snapshot.session);
  for (const key of ["uiHints", "transientE1", "transientPageContexts", "transientUnmatchedE3", "transientVerdictCandidates", "transientAmbiguityDiagnostics"]) {
    if (Array.isArray(session[key]) && session[key].length === 0) delete session[key];
  }
  return { local: clone(snapshot.local), session };
}

function readinessStatuses(): Record<string, string> {
  const parsed: unknown = JSON.parse(readFileSync(
    resolve(process.cwd(), "docs", "superpowers", "specs", "v4-adapter-readiness.json"),
    "utf8",
  ));
  const records = parsed !== null && typeof parsed === "object" ? Reflect.get(parsed, "records") : undefined;
  if (!Array.isArray(records)) throw new Error("D1 readiness manifest records are not an array");
  const statuses: Record<string, string> = {};
  for (const record of records) {
    if (typeof record !== "object" || record === null) throw new Error("D1 readiness record is not an object");
    const platform = Reflect.get(record, "platform");
    const status = Reflect.get(record, "status");
    if (typeof platform !== "string" || typeof status !== "string") {
      throw new Error("D1 readiness record identity is malformed");
    }
    statuses[platform] = status;
  }
  return statuses;
}

describe("Phase D D1 V4 upgrade matrix", () => {
  it("keeps registry DOM status and readiness network status aligned", () => {
    const readiness = readinessStatuses();
    expect(readiness).toEqual({
      leetcode: "experimental",
      nowcoder: "experimental",
      atcoder: "blocked",
      codeforces: "blocked",
      luogu: "blocked",
    });
    for (const platform of ["leetcode", "nowcoder", "atcoder", "codeforces", "luogu"] as const) {
      expect(PLATFORM_ADAPTERS[platform].v4NetworkStatus).toBe(readiness[platform]);
    }
    expect(PLATFORM_ADAPTERS.atcoder.status).toBe("production");
    expect(PLATFORM_ADAPTERS.codeforces.status).toBe("experimental");
    expect(PLATFORM_ADAPTERS.luogu.status).toBe("experimental");
    for (const platform of ["atcoder", "codeforces", "luogu"] as const) {
      expect(Reflect.get(PLATFORM_ADAPTERS[platform], "networkPolicy")).toBeUndefined();
    }
  });

  it("initializes a fresh V4 profile without inventing legacy migration state", async () => {
    const harness = createStorageHarness();
    await applyInitialization(harness);

    expect(harness.local.captureProtocolVersion).toBe(4);
    expect(harness.local.captureOutbox).toEqual([]);
    expect(harness.local.captureQuarantine).toEqual([]);
    expect(harness.local).not.toHaveProperty("v4ClickIntentMigration");
    expect(harness.local).not.toHaveProperty("pendingSubmissionIntents");
    expect(harness.local).not.toHaveProperty("eventQueue");
  });

  it("retains retry-blocked outbox and quarantined identity across initialization", async () => {
    const blockedOutbox: CaptureOutboxItem = {
      ...durableOutbox,
      attempts: 3,
      nextAttemptAt: "2026-08-04T00:00:00.000Z",
      automaticRetryBlocked: true,
    };
    const blockedQuarantine = createQuarantineItem(blockedOutbox);
    const current = createCurrentV4State();
    const harness = createStorageHarness({
      local: {
        ...current.local,
        captureOutbox: [blockedOutbox],
        captureQuarantine: [blockedQuarantine],
      },
      session: current.session,
    });

    await applyInitialization(harness);
    expect(harness.local.captureOutbox).toEqual([blockedOutbox]);
    expect(harness.local.captureQuarantine).toEqual([blockedQuarantine]);
    const stable = semanticSnapshot(harness.snapshot());
    await applyInitialization(harness, SECOND_RUN);
    expect(semanticSnapshot(harness.snapshot())).toEqual(stable);
  });

  it.each([
    {
      name: "null events",
      bundle: { events: null },
    },
    {
      name: "null verdict payload",
      bundle: { events: [{}, {}, { payload: null }, {}] },
    },
    {
      name: "non-object event",
      bundle: { events: [{}, "not-an-event", {}, {}] },
    },
  ])("fails closed on a malformed retained quarantine bundle during rehydration ($name)", async ({ bundle }) => {
    const current = createCurrentV4State();
    const malformedQuarantine = [{
      id: "d1-malformed-quarantine",
      item: {
        id: "d1-malformed-quarantine",
        kind: "attempt_bundle",
        bundle,
        attempts: 1,
        createdAt: FIRST_RUN,
      },
      error: "malformed retained bundle",
      quarantinedAt: FIRST_RUN,
    }];
    const harness = createStorageHarness({
      local: {
        ...current.local,
        captureQuarantine: malformedQuarantine,
      },
      session: current.session,
    });
    const orchestrator = createBackgroundOrchestrator({
      storage: harness.storage,
      now: () => FIRST_RUN,
      flushOutbox: async () => undefined,
    });

    const effects = await orchestrator.install();
    expect(effects.state.quarantineCount).toBe(1);
    expect(effects.state.quarantineDetails).toEqual([
      {
        id: "d1-malformed-quarantine",
        summary: "? · ? · malformed quarantine bundle · d1-malformed-quarantine · malformed retained bundle",
        retryable: false,
        deletable: true,
        malformed: true,
      },
    ]);
    await applyEffects(harness, effects);
    expect(harness.local.captureQuarantine).toEqual([{
      id: "d1-malformed-quarantine",
      error: "malformed retained bundle",
      quarantinedAt: FIRST_RUN,
    }]);

    const recovered = createBackgroundOrchestrator({
      storage: harness.storage,
      now: () => SECOND_RUN,
      flushOutbox: async () => undefined,
    });
    const recoveredState = await recovered.snapshot();
    expect(recoveredState.quarantineCount).toBe(1);
    expect(recoveredState.quarantineDetails).toEqual(effects.state.quarantineDetails);
    expect(recoveredState.outboxCount).toBe(1);
    expect(recoveredState.finalizedCount).toBe(1);

    const retryEffects = await recovered.apply({
      kind: "user_action",
      action: { type: "RETRY_CAPTURE_OUTBOX" },
    });
    await applyEffects(harness, retryEffects);
    expect(harness.local.captureQuarantine).toEqual([{
      id: "d1-malformed-quarantine",
      error: "malformed retained bundle",
      quarantinedAt: FIRST_RUN,
    }]);
    expect(harness.local.captureOutbox).toHaveLength(1);
    expect(retryEffects.state.quarantineCount).toBe(1);
    expect(retryEffects.state.outboxCount).toBe(1);

    const deleteEffects = await recovered.apply({
      kind: "user_action",
      action: {
        type: "DELETE_QUARANTINED_CAPTURE",
        id: "d1-malformed-quarantine",
        malformed: true,
      },
    });
    await applyEffects(harness, deleteEffects);
    expect(harness.local.captureQuarantine).toEqual([]);
    expect(deleteEffects.state.quarantineCount).toBe(0);
  });

  it("retains malformed outbox records without promoting them into delivery", async () => {
    const current = createCurrentV4State();
    const malformedOutbox = {
      id: "d1-malformed-outbox",
      kind: "attempt_bundle",
      bundle: { events: null },
      attempts: 1,
      createdAt: FIRST_RUN,
    };
    const harness = createStorageHarness({
      local: {
        ...current.local,
        captureOutbox: [durableOutbox, malformedOutbox],
        captureQuarantine: [],
      },
      session: current.session,
    });
    const createOrchestrator = () => createBackgroundOrchestrator({
      storage: harness.storage,
      now: () => FIRST_RUN,
      flushOutbox: async () => undefined,
    });

    const installed = await createOrchestrator().install();
    expect(installed.state.outboxCount).toBe(2);
    expect(installed.executorSchedule).toHaveLength(1);
    expect(installed.state.quarantineDetails).toContainEqual(expect.objectContaining({
      id: "d1-malformed-outbox",
      retryable: false,
      deletable: false,
    }));
    await applyEffects(harness, installed);
    expect(harness.local.captureOutbox).toEqual([durableOutbox, { id: "d1-malformed-outbox" }]);

    const recovered = createOrchestrator();
    expect((await recovered.snapshot()).outboxCount).toBe(2);
    const retried = await recovered.apply({
      kind: "user_action",
      action: { type: "RETRY_CAPTURE_OUTBOX" },
    });
    await applyEffects(harness, retried);
    expect(harness.local.captureOutbox).toContainEqual({ id: "d1-malformed-outbox" });
    expect(retried.state.outboxCount).toBe(2);

    const cleared = await recovered.apply({
      kind: "user_action",
      action: { type: "CLEAR_CAPTURE_OUTBOX" },
    });
    await applyEffects(harness, cleared);
    expect(harness.local.captureOutbox).toEqual([]);
    expect(cleared.state.outboxCount).toBe(0);
  });

  it.each([
    {
      name: "bundle id mismatch",
      outbox: { ...durableOutbox, id: "d1-wrong-bundle-id" },
    },
    {
      name: "negative attempts",
      outbox: { ...durableOutbox, attempts: -1 },
    },
    {
      name: "invalid createdAt",
      outbox: { ...durableOutbox, createdAt: "not-a-timestamp" },
    },
    {
      name: "noncanonical timestamp",
      outbox: { ...durableOutbox, createdAt: "March 5, 2026" },
    },
    {
      name: "nonexistent calendar date",
      outbox: { ...durableOutbox, createdAt: "2026-02-30T00:00:00.000Z" },
    },
    {
      name: "noncanonical event timestamp",
      outbox: {
        ...durableOutbox,
        bundle: {
          ...durableOutbox.bundle,
          events: durableOutbox.bundle.events.map((event, index) =>
            index === 0 ? { ...event, occurredAt: "2026-03-05T00:00:00Z" } : event),
        },
      },
    },
  ])("keeps semantically malformed outbox diagnostics fail-closed ($name)", async ({ outbox }) => {
    const current = createCurrentV4State();
    const harness = createStorageHarness({
      local: { ...current.local, captureOutbox: [outbox], captureQuarantine: [] },
      session: current.session,
    });
    const createOrchestrator = () => createBackgroundOrchestrator({
      storage: harness.storage,
      now: () => FIRST_RUN,
      flushOutbox: async () => undefined,
    });

    const installed = await createOrchestrator().install();
    expect(installed.state.outboxCount).toBe(1);
    expect(installed.executorSchedule).toEqual([]);
    expect(installed.state.quarantineDetails).toContainEqual(expect.objectContaining({
      retryable: false,
      deletable: false,
    }));
    await applyEffects(harness, installed);
    expect(harness.local.captureOutbox).toEqual([{ id: outbox.id }]);

    const recovered = createOrchestrator();
    const retry = await recovered.apply({
      kind: "user_action",
      action: { type: "RETRY_CAPTURE_OUTBOX" },
    });
    await applyEffects(harness, retry);
    expect(harness.local.captureOutbox).toEqual([{ id: outbox.id }]);
    expect(retry.state.outboxCount).toBe(1);
  });

  it("keeps a quarantine identity mismatch diagnostic non-retryable but deletable", async () => {
    const current = createCurrentV4State();
    const malformedQuarantine = { ...durableQuarantine, id: "d1-wrong-quarantine-id" };
    const harness = createStorageHarness({
      local: { ...current.local, captureOutbox: [], captureQuarantine: [malformedQuarantine] },
      session: current.session,
    });
    const orchestrator = createBackgroundOrchestrator({
      storage: harness.storage,
      now: () => FIRST_RUN,
      flushOutbox: async () => undefined,
    });

    const installed = await orchestrator.install();
    expect(installed.state.quarantineCount).toBe(1);
    expect(installed.state.quarantineDetails).toContainEqual(expect.objectContaining({
      id: "d1-wrong-quarantine-id",
      retryable: false,
      deletable: true,
      malformed: true,
    }));
    await applyEffects(harness, installed);
    const retry = await orchestrator.apply({
      kind: "user_action",
      action: { type: "RETRY_CAPTURE_OUTBOX" },
    });
    await applyEffects(harness, retry);
    expect(harness.local.captureQuarantine).toEqual([{
      id: "d1-wrong-quarantine-id",
      error: "malformed retained bundle",
      quarantinedAt: SECOND_RUN,
    }]);
    const deleted = await orchestrator.apply({
      kind: "user_action",
      action: {
        type: "DELETE_QUARANTINED_CAPTURE",
        id: "d1-wrong-quarantine-id",
        malformed: true,
      },
    });
    await applyEffects(harness, deleted);
    expect(harness.local.captureQuarantine).toEqual([]);
  });

  it("deletes a malformed quarantine collision without deleting the valid entry", async () => {
    const current = createCurrentV4State();
    const collisionId = "bundle_collision";
    const validQuarantine = {
      ...durableQuarantine,
      id: collisionId,
      item: {
        ...durableQuarantine.item,
        id: collisionId,
        bundle: { ...durableQuarantine.item.bundle, bundleId: collisionId },
      },
    };
    const malformedQuarantine = {
      id: collisionId,
      item: {
        id: collisionId,
        kind: "attempt_bundle",
        bundle: { events: null },
        attempts: 1,
        createdAt: FIRST_RUN,
      },
      error: "collision malformed quarantine",
      quarantinedAt: FIRST_RUN,
    };
    const harness = createStorageHarness({
      local: { ...current.local, captureOutbox: [], captureQuarantine: [validQuarantine, malformedQuarantine] },
      session: current.session,
    });
    const orchestrator = createBackgroundOrchestrator({
      storage: harness.storage,
      now: () => FIRST_RUN,
      flushOutbox: async () => undefined,
    });

    const installed = await orchestrator.install();
    expect(installed.state.quarantineDetails).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: collisionId, retryable: true }),
      expect.objectContaining({ id: collisionId, retryable: false, malformed: true }),
    ]));
    await applyEffects(harness, installed);
    const deletedMalformed = await orchestrator.apply({
      kind: "user_action",
      action: { type: "DELETE_QUARANTINED_CAPTURE", id: collisionId, malformed: true },
    });
    await applyEffects(harness, deletedMalformed);
    expect(harness.local.captureQuarantine).toEqual([validQuarantine]);

    const deletedValid = await orchestrator.apply({
      kind: "user_action",
      action: { type: "DELETE_QUARANTINED_CAPTURE", id: collisionId },
    });
    await applyEffects(harness, deletedValid);
    expect(harness.local.captureQuarantine).toEqual([]);
  });

  it("applies authoritative writes before legacy cleanup in the production order", async () => {
    const harness = createStorageHarness({
      local: { eventQueue: [{ id: "legacy" }] },
      session: { transientE1: [{ id: "transient" }] },
    });

    await applyOrchestratorPersistence(harness.storage, {
      local: [{ key: "captureProtocolVersion", value: 4 }],
      localRemovals: ["eventQueue"],
      session: [{ key: "transientE1", value: [] }],
      sessionRemovals: ["transientE1"],
      outbox: [],
      quarantine: [],
      confirmed: [],
      tombstones: [],
      e0Hints: [],
      transientE1: [],
      pageContexts: [],
      unmatchedFinals: [],
      verdictCandidates: [],
      ambiguityDiagnostics: [],
    });

    expect(harness.operations).toEqual([
      "local.set",
      "session.set",
      "remove:eventQueue",
      "remove:transientE1",
    ]);
  });

  it("clears the cached snapshot when persistence fails and repopulates it after retry", async () => {
    const seed = createCurrentV4State();
    Reflect.deleteProperty(seed.local, "captureEnabled");
    const harness = createStorageHarness(seed);
    const orchestrator = createBackgroundOrchestrator({
      storage: harness.storage,
      now: () => FIRST_RUN,
      flushOutbox: async () => undefined,
    });
    const effects = await orchestrator.install();
    let cached: OrchestratorEffects["state"] | undefined = effects.state;
    const persist = async (persistence: OrchestratorEffects["persistence"]): Promise<void> => {
      await applyOrchestratorPersistence(harness.storage, persistence);
    };

    harness.setFailure({ target: "local.set", mode: "before" });
    await expect(persistEffectsBeforeCaching({
      effects,
      persist,
      setCachedSnapshot: (state) => { cached = state; },
    })).rejects.toThrow("D1 injected failure at local.set");
    expect(cached).toBeUndefined();

    harness.setFailure(undefined);
    await persistEffectsBeforeCaching({
      effects,
      persist,
      setCachedSnapshot: (state) => { cached = state; },
    });
    expect(cached).toEqual(effects.state);
    expect(harness.local.captureProtocolVersion).toBe(4);
  });

  it("production orchestrator reads and removes all legacy keys without resetting discard metadata", async () => {
    const seed = createLegacyState();
    const harness = createStorageHarness(seed);
    const orchestrator = createBackgroundOrchestrator({
      storage: harness.storage,
      now: () => FIRST_RUN,
      flushOutbox: async () => undefined,
    });

    const first = await orchestrator.install();
    expect(first.persistence.localRemovals).toEqual([
      "pendingSubmissionIntents",
      "eventQueue",
      "outbox",
      "quarantine",
    ]);
    expect(first.persistence.local).toContainEqual({
      key: "v4ClickIntentMigration",
      value: expect.objectContaining({
        removedActiveIntentCount: 1,
        migratedAt: FIRST_RUN,
      }),
    });
    expect(first.persistence.local).not.toContainEqual({
      key: "discardedPreBundleEventCount",
      value: 0,
    });
    expect(first.persistence.local).not.toContainEqual({
      key: "preBundleQueueDiscardedAt",
      value: SECOND_RUN,
    });

    await applyEffects(harness, first);
    expectLegacyKeysRemoved(harness);
    expect(harness.local.v4ClickIntentMigration).toEqual(expect.objectContaining({
      removedActiveIntentCount: 1,
      migratedAt: FIRST_RUN,
    }));
    expect(harness.local.discardedPreBundleEventCount).toBe(7);
    expect(harness.local.preBundleQueueDiscardedAt).toBe(FIRST_RUN);
    expect(harness.local.unknownLocalSentinel).toEqual({ owner: "D1", value: "preserve-local" });
    expect(harness.session.unknownSessionSentinel).toEqual({ owner: "D1", value: "preserve-session" });

    const stable = harness.snapshot();
    const second = await orchestrator.install();
    expect(second.persistence.localRemovals).toEqual([]);
    await applyEffects(harness, second);
    expect(harness.snapshot()).toEqual(stable);
  });

  it("recovers the production orchestrator from every initialization mutation boundary", async () => {
    const boundaries: readonly FailureTarget[] = [
      "local.set",
      "session.set",
      "remove:pendingSubmissionIntents",
      "remove:lastCaptureError",
      "remove:eventQueue",
      "remove:outbox",
      "remove:quarantine",
    ];

    for (const target of boundaries) {
      for (const mode of ["before", "after"] as const) {
        const seed = createCurrentV4State();
        if (target === "remove:lastCaptureError") {
          seed.local.lastCaptureError = { raw: "Authorization: Bearer secret" };
        }
        // Keep one authoritative initialization field absent so the local.set
        // boundary is exercised rather than optimized away as a no-op.
        Reflect.deleteProperty(seed.local, "captureEnabled");
        const harness = createStorageHarness(seed);
        const before = harness.snapshot();
        harness.setFailure({ target, mode });
        await expect(installProductionOrchestrator(harness)).rejects.toThrow(`D1 injected failure at ${target}`);

        expect(harness.local.captureOutbox).toEqual(before.local.captureOutbox);
        expect(harness.local.captureQuarantine).toEqual(before.local.captureQuarantine);
        if (target === "remove:lastCaptureError" && mode === "before") {
          expect(harness.local.lastCaptureError).toEqual(before.local.lastCaptureError);
        }
        if (target === "remove:lastCaptureError" && mode === "after") {
          expect(harness.local).not.toHaveProperty("lastCaptureError");
        }
        expect(harness.local.confirmedSubmissionTombstones)
          .toEqual(before.local.confirmedSubmissionTombstones);
        expect(harness.local.unknownLocalSentinel).toEqual(before.local.unknownLocalSentinel);
        expect(harness.session.unknownSessionSentinel).toEqual(before.session.unknownSessionSentinel);

        harness.setFailure(undefined);
        await installProductionOrchestrator(harness, SECOND_RUN);
        expect(harness.local.captureProtocolVersion).toBe(4);
        expect(harness.local.captureOutbox).toEqual(before.local.captureOutbox);
        expect(harness.local.captureQuarantine).toEqual(before.local.captureQuarantine);
        expect(harness.local.confirmedSubmissions).toEqual(before.local.confirmedSubmissions);
        expect(harness.local.confirmedSubmissionTombstones)
          .toEqual(before.local.confirmedSubmissionTombstones);
        expectLegacyKeysRemoved(harness);
        expect(harness.local.unknownLocalSentinel).toEqual(before.local.unknownLocalSentinel);
        expect(harness.session.unknownSessionSentinel).toEqual(before.session.unknownSessionSentinel);
        expect(harness.session.contentIngressReady).toEqual(before.session.contentIngressReady);
        expect(harness.session.contentIngressDiagnostics).toEqual(before.session.contentIngressDiagnostics);
        if (target === "remove:lastCaptureError") {
          expect(harness.local).not.toHaveProperty("lastCaptureError");
        }

        const stable = harness.snapshot();
        await installProductionOrchestrator(harness, "2026-08-03T02:00:00.000Z");
        expect(semanticSnapshot(harness.snapshot())).toEqual(semanticSnapshot(stable));
      }
    }
  });

  it("recovers V3 migration boundaries without recounting or promoting legacy intents", async () => {
    const boundaries: readonly FailureTarget[] = [
      "local.set",
      "remove:pendingSubmissionIntents",
      "remove:lastCaptureError",
      "remove:eventQueue",
      "remove:outbox",
      "remove:quarantine",
    ];

    for (const target of boundaries) {
      for (const mode of ["before", "after"] as const) {
        const harness = createStorageHarness(createLegacyState());
        if (target === "remove:lastCaptureError") {
          harness.local.lastCaptureError = { raw: "Authorization: Bearer secret" };
        }
        harness.setFailure({ target, mode });
        await expect(applyInitialization(harness)).rejects.toThrow(`D1 injected failure at ${target}`);

        if (target === "local.set" && mode === "before") {
          expect(harness.local).not.toHaveProperty("v4ClickIntentMigration");
        } else {
          expect(harness.local.v4ClickIntentMigration).toEqual(expect.objectContaining({
            removedActiveIntentCount: 1,
            migratedAt: FIRST_RUN,
          }));
        }
        if (target.startsWith("remove:") && mode === "before") {
          expect(harness.local).toHaveProperty(target.slice("remove:".length));
        }
        if (target === "remove:lastCaptureError" && mode === "after") {
          expect(harness.local).not.toHaveProperty("lastCaptureError");
        }

        harness.setFailure(undefined);
        await applyInitialization(harness, SECOND_RUN);
        expect(harness.local.captureProtocolVersion).toBe(4);
        expect(harness.local.captureOutbox).toEqual([durableOutbox]);
        expect(harness.local.captureQuarantine).toEqual([durableQuarantine]);
        if (target === "remove:lastCaptureError") {
          expect(harness.local).not.toHaveProperty("lastCaptureError");
        }
        expect(harness.local.v4ClickIntentMigration).toEqual(expect.objectContaining({
          removedActiveIntentCount: 1,
          migratedAt: target === "local.set" && mode === "before" ? SECOND_RUN : FIRST_RUN,
        }));
        expect(harness.local.discardedPreBundleEventCount).toBe(7);
        expect(harness.local.preBundleQueueDiscardedAt).toBe(FIRST_RUN);
        expectLegacyKeysRemoved(harness);
        expect(harness.local.unknownLocalSentinel).toEqual({ owner: "D1", value: "preserve-local" });
        expect(harness.session.unknownSessionSentinel).toEqual({ owner: "D1", value: "preserve-session" });

        const stable = harness.snapshot();
        await applyInitialization(harness, "2026-08-03T02:00:00.000Z");
        expect(semanticSnapshot(harness.snapshot())).toEqual(semanticSnapshot(stable));
      }
    }
  });

  it("recovers V2 queue cleanup boundaries without preserving stale V2 delivery keys", async () => {
    const boundaries: readonly FailureTarget[] = [
      "local.set",
      "remove:eventQueue",
      "remove:outbox",
      "remove:quarantine",
    ];

    for (const target of boundaries) {
      for (const mode of ["before", "after"] as const) {
        const harness = createStorageHarness(createV2State());
        harness.setFailure({ target, mode });
        await expect(applyInitialization(harness)).rejects.toThrow(`D1 injected failure at ${target}`);

        harness.setFailure(undefined);
        await applyInitialization(harness, SECOND_RUN);
        expect(harness.local.captureProtocolVersion).toBe(4);
        expect(harness.local.discardedPreBundleEventCount).toBe(2);
        expect(harness.local.preBundleQueueDiscardedAt)
          .toBe(target === "local.set" && mode === "before" ? SECOND_RUN : FIRST_RUN);
        expect(harness.local.captureOutbox).toEqual([]);
        expect(harness.local.captureQuarantine).toEqual([]);
        expectLegacyKeysRemoved(harness);
        expect(harness.local.unknownLocalSentinel).toEqual({ owner: "D1", value: "preserve-v2-local" });
        expect(harness.session.unknownSessionSentinel).toEqual({ owner: "D1", value: "preserve-v2-session" });

        const stable = harness.snapshot();
        await applyInitialization(harness, "2026-08-03T02:00:00.000Z");
        expect(semanticSnapshot(harness.snapshot())).toEqual(semanticSnapshot(stable));
      }
    }
  });

  it("treats local/session reads as a separate failure probe and retries without mutation", async () => {
    for (const target of ["local.get", "session.get"] as const) {
      const seed = createCurrentV4State();
      const harness = createStorageHarness(seed);
      const before = harness.snapshot();
      harness.setFailure({ target, mode: "before" });
      await expect(applyInitialization(harness)).rejects.toThrow(`D1 injected failure at ${target}`);
      expect(harness.snapshot()).toEqual(before);

      harness.setFailure(undefined);
      await applyInitialization(harness);
      expectLegacyKeysRemoved(harness);
    }
  });

  it("migrates V3 active, superseded, and expired intents once and preserves migratedAt", async () => {
    const seed = createLegacyState();
    const harness = createStorageHarness(seed);
    await applyInitialization(harness, FIRST_RUN);

    expect(harness.local.captureProtocolVersion).toBe(4);
    expect(harness.local.v4ClickIntentMigration).toEqual(expect.objectContaining({
      removedActiveIntentCount: 1,
      migratedAt: FIRST_RUN,
      sourceProtocolVersion: 3,
      targetProtocolVersion: 4,
    }));
    expect(harness.local.captureOutbox).toEqual([durableOutbox]);
    expect(harness.local.captureQuarantine).toEqual([durableQuarantine]);
    expect(harness.local.discardedPreBundleEventCount).toBe(7);
    expectLegacyKeysRemoved(harness);

    await applyInitialization(harness, SECOND_RUN);
    expect(harness.local.v4ClickIntentMigration).toEqual(expect.objectContaining({
      removedActiveIntentCount: 1,
      migratedAt: FIRST_RUN,
    }));
    expect(harness.local.discardedPreBundleEventCount).toBe(7);
    expectLegacyKeysRemoved(harness);
  });

  it("discards V2 queue exactly once and retains the discard audit on rerun", async () => {
    const harness = createStorageHarness({
      local: {
        captureProtocolVersion: 2,
        installationId: INSTALLATION_ID,
        eventQueue: [{ id: "one" }, { id: "two" }, { id: "three" }],
        unknownLocalSentinel: "keep",
      },
      session: { unknownSessionSentinel: "keep" },
    });

    await applyInitialization(harness, FIRST_RUN);
    expect(harness.local.captureProtocolVersion).toBe(4);
    expect(harness.local.discardedPreBundleEventCount).toBe(3);
    expect(harness.local.preBundleQueueDiscardedAt).toBe(FIRST_RUN);
    expect(harness.local).not.toHaveProperty("eventQueue");
    await applyInitialization(harness, SECOND_RUN);
    expect(harness.local.discardedPreBundleEventCount).toBe(3);
    expect(harness.local.preBundleQueueDiscardedAt).toBe(FIRST_RUN);
    expect(harness.local).not.toHaveProperty("eventQueue");
    expect(harness.local.unknownLocalSentinel).toBe("keep");
    expect(harness.session.unknownSessionSentinel).toBe("keep");
  });

  it("keeps local durable slices separate from session evidence and control-plane state", async () => {
    const seed = createCurrentV4State();
    const harness = createStorageHarness(seed);
    const plan = initializationPlan(harness);
    const localItems = extensionInitializationLocalStorage(plan);

    expect(localItems).toHaveProperty("confirmedSubmissions");
    expect(localItems).toHaveProperty("confirmedSubmissionTombstones");
    expect(localItems).toHaveProperty("captureOutbox");
    expect(localItems).toHaveProperty("captureQuarantine");
    expect(localItems).not.toHaveProperty("transientE1");
    expect(localItems).not.toHaveProperty("uiHints");

    await applyInitialization(harness);
    const beforeDurable = durableSnapshot(harness);
    expect(harness.session.contentIngressReady).toEqual(seed.session.contentIngressReady);
    expect(harness.session.contentIngressDiagnostics).toEqual(seed.session.contentIngressDiagnostics);
    expect(harness.session.characterizationSession).toEqual(seed.session.characterizationSession);

    await applyInitialization(harness, SECOND_RUN);
    expect(durableSnapshot(harness)).toEqual(beforeDurable);
  });

  it("keeps capture paused fail-closed while retaining durable state", () => {
    const seed = createCurrentV4State();
    const paused = planExtensionInitialization({
      ...seed.local,
      ...seed.session,
      captureEnabled: false,
    }, {
      now: FIRST_RUN,
      createInstallationId: () => "unused",
    });
    expect(paused.captureEnabled).toBe(false);
    expect(paused.confirmedSubmissions).toEqual([confirmedRecord]);
    expect(paused.confirmedSubmissionTombstones).toEqual([tombstoneRecord]);
    expect(paused.captureOutbox).toEqual([durableOutbox]);
    expect(paused.captureQuarantine).toEqual([durableQuarantine]);
  });

  it("drains one durable bundle and ignores a replayed ACK/API delivery", async () => {
    const item = createOutboxItem("replay-once");
    const state: { outbox: readonly CaptureOutboxItem[]; quarantine: readonly CaptureQuarantineItem[] } = {
      outbox: [item],
      quarantine: [],
    };
    let requestCount = 0;
    const storage = {
      values: state,
      set: async (items: Record<string, unknown>): Promise<void> => {
        const nextOutbox = items.captureOutbox;
        const nextQuarantine = items.captureQuarantine;
        if (!Array.isArray(nextOutbox) || !Array.isArray(nextQuarantine)) {
          throw new Error("D1 replay test received malformed storage update");
        }
        state.outbox = nextOutbox.filter((entry): entry is CaptureOutboxItem =>
          typeof entry === "object" && entry !== null,
        );
        state.quarantine = nextQuarantine.filter((entry): entry is CaptureQuarantineItem =>
          typeof entry === "object" && entry !== null,
        );
      },
      remove: async (): Promise<void> => undefined,
      readState: async (): Promise<CaptureOutboxPlan> => state,
    };
    const send = async (entry: CaptureOutboxItem) => {
      requestCount += 1;
      return {
        status: 200 as const,
        ack: {
          ok: true as const,
          bundleId: entry.id,
          captureSessionId: entry.bundle.events[0]?.captureSessionId ?? "missing",
          attemptId: "d1-attempt-once",
          attemptStatus: "passed" as const,
          replayed: requestCount > 1,
        },
      };
    };
    const dependencies = {
      readState: storage.readState,
      send,
      persist: async (plan: CaptureOutboxPlan): Promise<void> => {
        await persistCaptureOutboxPlan(storage, plan);
      },
    };

    await expect(drainCaptureOutbox(dependencies)).resolves.toEqual({ reason: "empty", processed: 1 });
    await expect(drainCaptureOutbox(dependencies)).resolves.toEqual({ reason: "empty", processed: 0 });
    expect(requestCount).toBe(1);
    expect(state.outbox).toEqual([]);
    expect(state.quarantine).toEqual([]);
  });
});
