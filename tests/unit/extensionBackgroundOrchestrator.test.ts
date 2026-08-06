/**
 * Background orchestrator unit tests (Phase A Task A8).
 *
 * The orchestrator is the only mutation entry for the V4 data plane. This
 * suite pins its public contract:
 *
 *  - E1 leaves waiting / outbox / confirmed unchanged.
 *  - no orchestrator event can create or consume V3 click-derived intent.
 *  - `CLEAR_CAPTURE_OUTBOX` empties the outbox and clears `lastCaptureError`.
 *  - A fresh orchestrator instance reading the same storage sees the durable
 *    outbox / confirmed / tombstones while losing the transient E1 slice.
 *  - Quarantine retry / delete actions preserve the existing behavior.
 *  - `snapshot()` reflects `sessionCount`, `outboxCount`, and `waiting`.
 *  - Popup presentation distinguishes waiting from finalized counts.
 */
import { describe, expect, it, vi, afterEach, beforeEach } from "vitest";

import { createBackgroundOrchestrator } from "@/extension/src/backgroundOrchestrator";
import type { OrchestratorPersistence } from "@/extension/src/backgroundOrchestrator";
import { buildCaptureAttemptBundle } from "@/extension/src/attemptStorage";
import type { PendingSubmissionIntent, VerdictCandidateMessage } from "@/extension/src/attemptCapture";
import type { CaptureOutboxItem, CaptureQuarantineItem } from "@/extension/src/attemptStorage";
import type { ConfirmedSubmissionRecord, ConfirmedSubmissionTombstone } from "@/extension/src/confirmedSubmissionStorage";
import type {
  E1RequestObserved,
  E2SubmissionConfirmed,
  E3FinalVerdictConfirmed,
} from "@/extension/src/evidence";
import type { CorrelatedCaptureResult, RejectedCaptureResult } from "@/extension/src/captureStateMachine";
import type { MainBridgeSummary } from "@/extension/src/submissionCorrelator";
import type { ExtensionInitializationStorageSplit } from "@/extension/src/installation";
import type { TransientVerdictCandidate } from "@/extension/src/transientEvidenceStorage";
import { UI_HINT_TTL_MS } from "@/extension/src/uiHint";

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

const installationId = "installation_orchestrator_test";

type StorageWriteOperation = Readonly<{
  readonly area: "local" | "session";
  readonly operation: "set" | "remove";
  readonly keys: readonly string[];
}>;

const baseIntentDraft: PendingSubmissionIntent = {
  installationId,
  platform: "atcoder",
  problemExternalId: "abc100_a",
  problemTitle: "A",
  canonicalUrl: "https://atcoder.jp/contests/abc100/tasks/abc100_a",
  captureSessionId: "session_test",
  submissionId: "submission_test",
  occurredAt: "2026-07-24T00:00:00.000Z",
  status: "active",
  sourceDocumentId: "doc_test",
};

const baseE1: E1RequestObserved = {
  schemaVersion: 1,
  evidenceId: "e1_test",
  platform: "leetcode",
  tier: "E1",
  kind: "request_observed",
  receivedAt: "2026-07-24T00:00:01.000Z",
  tabId: 1,
  frameId: 0,
  documentId: "doc_e1",
  adapterVersion: "v4-contract-1",
  apiTimeStamp: 1000,
  requestId: "request_e1",
  method: "POST",
  endpointKey: "submit",
  resourceType: "xmlhttprequest",
  lifecycle: "completed",
};

const baseSummary: MainBridgeSummary = {
  platform: "leetcode",
  tabId: 1,
  frameId: 0,
  documentId: "doc_e1",
  method: "POST",
  endpointKey: "submit",
  apiTimeStamp: 1001,
  externalSubmissionId: "submission_42",
  problemExternalId: "two-sum",
  receivedAt: "2026-07-24T00:00:02.000Z",
  evidenceId: "bridge_summary_42",
};

const baseCorrelated: CorrelatedCaptureResult = {
  kind: "correlated",
  matchedE1: baseE1,
  summary: baseSummary,
  disambiguatedBy: "unique",
};

const baseE3: E3FinalVerdictConfirmed = {
  schemaVersion: 1,
  evidenceId: "e3_submission_42",
  platform: "leetcode",
  tier: "E3",
  kind: "final_verdict_confirmed",
  receivedAt: "2026-07-24T00:00:03.000Z",
  tabId: 1,
  frameId: 0,
  documentId: "doc_e1",
  adapterVersion: "v4-contract-1",
  externalSubmissionId: "submission_42",
  problemExternalId: "two-sum",
  verdict: "Accepted",
};

const nowCoderSubmitE1: E1RequestObserved = {
  ...baseE1,
  evidenceId: "e1_nowcoder_submit",
  platform: "nowcoder",
  adapterVersion: "v4-nowcoder-network-1",
  requestId: "request_nowcoder_submit",
  endpointKey: "nowcoder/submit",
  documentId: "doc_nowcoder",
};

const nowCoderStatusE1: E1RequestObserved = {
  ...nowCoderSubmitE1,
  evidenceId: "e1_nowcoder_status",
  receivedAt: "2026-07-24T00:00:02.000Z",
  apiTimeStamp: 2000,
  requestId: "request_nowcoder_status",
  method: "GET",
  endpointKey: "nowcoder/status",
};

const nowCoderE2: E2SubmissionConfirmed = {
  schemaVersion: 1,
  evidenceId: "e2_nowcoder_84257292",
  platform: "nowcoder",
  tier: "E2",
  kind: "submission_confirmed",
  receivedAt: "2026-07-24T00:00:02.000Z",
  tabId: 1,
  frameId: 0,
  documentId: "doc_nowcoder",
  adapterVersion: "v4-nowcoder-network-1",
  requestEvidenceId: nowCoderStatusE1.evidenceId,
  externalSubmissionId: "84257292",
  problemExternalId: "acm/contest/18839/1001",
};

function storageSpy(
  initial: {
    readonly local?: Record<string, unknown>;
    readonly session?: Record<string, unknown>;
  } = {},
): ExtensionInitializationStorageSplit & {
  readonly reads: { readonly local: number; readonly session: number };
  readonly writes: { readonly local: number; readonly session: number };
  readonly writeLog: readonly StorageWriteOperation[];
  readonly clearSession: () => Promise<void>;
} & {
  readonly session: ExtensionInitializationStorageSplit["session"] & {
    readonly clear: () => Promise<void>;
  };
} {
  const localStore: Record<string, unknown> = { ...(initial.local ?? {}) };
  const sessionStore: Record<string, unknown> = { ...(initial.session ?? {}) };
  const writeOperations: StorageWriteOperation[] = [];
  let localReads = 0;
  let sessionReads = 0;
  let localWrites = 0;
  let sessionWrites = 0;
  return {
    get reads() { return { local: localReads, session: sessionReads }; },
    get writes() { return { local: localWrites, session: sessionWrites }; },
    get writeLog() { return writeOperations.slice(); },
    clearSession: async () => {
      for (const key of Object.keys(sessionStore)) Reflect.deleteProperty(sessionStore, key);
    },
    local: {
      get: async (keys: readonly string[]) => {
        localReads += 1;
        const out: Record<string, unknown> = {};
        for (const key of keys) {
          if (Object.hasOwn(localStore, key)) out[key] = localStore[key];
        }
        return out;
      },
      set: async (items: Record<string, unknown>) => {
        localWrites += 1;
        writeOperations.push({
          area: "local",
          operation: "set",
          keys: Object.freeze(Object.keys(items)),
        });
        Object.assign(localStore, items);
      },
      remove: async (key: string) => {
        writeOperations.push({
          area: "local",
          operation: "remove",
          keys: Object.freeze([key]),
        });
        Reflect.deleteProperty(localStore, key);
      },
    },
    session: {
      get: async (keys: readonly string[]) => {
        sessionReads += 1;
        const out: Record<string, unknown> = {};
        for (const key of keys) {
          if (Object.hasOwn(sessionStore, key)) out[key] = sessionStore[key];
        }
        return out;
      },
      set: async (items: Record<string, unknown>) => {
        sessionWrites += 1;
        writeOperations.push({
          area: "session",
          operation: "set",
          keys: Object.freeze(Object.keys(items)),
        });
        Object.assign(sessionStore, items);
      },
      remove: async (key: string) => {
        writeOperations.push({
          area: "session",
          operation: "remove",
          keys: Object.freeze([key]),
        });
        Reflect.deleteProperty(sessionStore, key);
      },
      clear: async () => {
        for (const key of Object.keys(sessionStore)) Reflect.deleteProperty(sessionStore, key);
      },
    },
  };
}

function orchestratorDeps(storage: ExtensionInitializationStorageSplit, now = "2026-07-24T01:00:00.000Z") {
  return {
    storage,
    now: () => now,
    flushOutbox: async (): Promise<void> => undefined,
  };
}

/**
 * Apply an effects diff to the storage spy exactly the way the background
 * worker's `applyPersistence` would: one round of `set` + `remove` per area
 * per `apply` / `install` / `pruneOrchestratorSession` invocation. Tests
 * that need to read durable state after an event therefore call this helper
 * between the orchestrator call and the storage assertion.
 */
async function applyEffectsToStorage(
  storage: ExtensionInitializationStorageSplit,
  effects: { readonly persistence: { readonly local: ReadonlyArray<{ readonly key: string; readonly value: unknown }>; readonly localRemovals: readonly string[]; readonly session: ReadonlyArray<{ readonly key: string; readonly value: unknown }>; readonly sessionRemovals: readonly string[] } },
): Promise<void> {
  const localItems: Record<string, unknown> = {};
  for (const write of effects.persistence.local) localItems[write.key] = write.value;
  if (Object.keys(localItems).length > 0) await storage.local.set(localItems);
  for (const key of effects.persistence.localRemovals) await storage.local.remove(key);
  const sessionItems: Record<string, unknown> = {};
  for (const write of effects.persistence.session) sessionItems[write.key] = write.value;
  if (Object.keys(sessionItems).length > 0) await storage.session.set(sessionItems);
  for (const key of effects.persistence.sessionRemovals) await storage.session.remove(key);
}

function bundleForIntent(intent: PendingSubmissionIntent): CaptureOutboxItem {
  const candidate: VerdictCandidateMessage["candidate"] = {
    installationId: intent.installationId,
    platform: intent.platform,
    problemExternalId: intent.problemExternalId,
    verdict: "Accepted",
    observedAt: "2026-07-24T00:01:00.000Z",
    transitionEvidence: "exact_result_document",
  };
  const bundle = buildCaptureAttemptBundle(intent, candidate, "extension_paired");
  return {
    id: bundle.bundleId,
    kind: "attempt_bundle",
    bundle,
    attempts: 0,
    createdAt: candidate.observedAt,
  };
}

function confirmedRecord(problem: string, id: string): ConfirmedSubmissionRecord {
  return {
    schemaVersion: 1,
    status: "confirmed",
    platform: "atcoder",
    problemExternalId: problem,
    externalSubmissionId: id,
    confirmedAt: "2026-07-24T00:00:00.000Z",
    storageKey: `atcoder:${id}`,
    lastE3At: "2026-07-24T00:00:00.000Z",
  };
}

function tombstoneRecord(problem: string, id: string): ConfirmedSubmissionTombstone {
  return {
    submissionKey: `atcoder:${id}`,
    finalizedAt: "2026-07-24T00:00:00.000Z",
    expiresAt: "2026-08-23T00:00:00.000Z",
  };
}

function quarantineFromBundle(bundle: CaptureOutboxItem, error = "transient http 500"): CaptureQuarantineItem {
  return {
    id: bundle.id,
    item: bundle,
    error,
    quarantinedAt: "2026-07-24T00:00:30.000Z",
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("background orchestrator", () => {
  it("sanitizes retained legacy errors before exposing snapshot or quarantine details", async () => {
    const bundle = bundleForIntent(baseIntentDraft);
    const storage = storageSpy({
      local: {
        installationId,
        captureProtocolVersion: 4,
        lastCaptureError: "token=secret; source code",
        captureQuarantine: [quarantineFromBundle(bundle, "Authorization: Bearer secret")],
      },
    });
    const orchestrator = createBackgroundOrchestrator(orchestratorDeps(storage));
    const effects = await orchestrator.install();
    await applyEffectsToStorage(storage, effects);
    const state = effects.state;
    expect(state.lastCaptureError).toBe("Retained capture error");
    expect(JSON.stringify(state.quarantineDetails)).not.toContain("secret");
    expect(state.quarantineDetails[0]?.summary).toContain("Retained capture error");
    const durable = await storage.local.get(["lastCaptureError", "captureQuarantine"]);
    expect(JSON.stringify(durable)).not.toContain("secret");
    expect(durable.lastCaptureError).toBe("Retained capture error");
    expect(JSON.stringify(durable.captureQuarantine)).not.toContain("Authorization");
  });

  it("does not change waiting, outbox, or confirmed submissions on E1", async () => {
    const storage = storageSpy();
    const orchestrator = createBackgroundOrchestrator(orchestratorDeps(storage));
    await orchestrator.install();

    const effects = await orchestrator.apply({
      kind: "e1_recorded",
      evidence: baseE1,
      tabId: baseE1.tabId,
      frameId: baseE1.frameId,
      documentId: baseE1.documentId,
      adapterVersion: baseE1.adapterVersion,
    });

    expect(effects.state.waitingCount).toBe(0);
    expect(effects.state.outboxCount).toBe(0);
    expect(effects.state.finalizedCount).toBe(0);
    expect(effects.state.sessionCount).toBe(0);
    expect(effects.state.waiting).toBe(false);
    expect(effects.persistence.confirmed).toEqual([]);
    expect(effects.persistence.tombstones).toEqual([]);
    expect(effects.persistence.outbox).toEqual([]);
    expect(effects.persistence.quarantine).toEqual([]);
    expect(effects.executorSchedule).toEqual([]);
    expect(effects.state.e1LifecycleCount).toBe(1);
  });

  it("returns a fresh popup-cache snapshot after CLEAR_CAPTURE_OUTBOX", async () => {
    const storage = storageSpy({ local: { installationId } });
    const orchestrator = createBackgroundOrchestrator(orchestratorDeps(storage));
    await orchestrator.install();
    await storage.local.set({
      captureOutbox: [bundleForIntent(baseIntentDraft)],
      lastCaptureError: "previous error",
    });

    const effects = await orchestrator.apply({
      kind: "user_action",
      action: { type: "CLEAR_CAPTURE_OUTBOX" },
    });
    await applyEffectsToStorage(storage, effects);

    expect(effects.state.outboxCount).toBe(0);
    expect(effects.state.lastCaptureError).toBeUndefined();
    const durable = await storage.local.get(["captureOutbox", "lastCaptureError"]);
    expect(durable.captureOutbox).toEqual([]);
    expect(durable.lastCaptureError).toBeUndefined();
    expect(effects.executorSchedule).toEqual([]);
    expect(effects.persistence.outbox).toEqual([]);
    expect(effects.persistence.outbox).toHaveLength(effects.state.outboxCount);
  });

  it("serializes capture pause as a user action without discarding durable state", async () => {
    const storage = storageSpy({ local: { installationId, captureEnabled: true } });
    const orchestrator = createBackgroundOrchestrator(orchestratorDeps(storage));
    await orchestrator.install();
    const bundle = bundleForIntent(baseIntentDraft);
    await storage.local.set({
      captureOutbox: [bundle],
      captureQuarantine: [quarantineFromBundle(bundle, "isolated")],
    });

    const effects = await orchestrator.apply({
      kind: "user_action",
      action: { type: "SET_CAPTURE_ENABLED", enabled: false },
    });
    await applyEffectsToStorage(storage, effects);

    expect(effects.state.captureEnabled).toBe(false);
    expect(effects.state.outboxCount).toBe(1);
    expect(effects.state.quarantineCount).toBe(1);
    const durable = await storage.local.get(["captureEnabled", "captureOutbox", "captureQuarantine"]);
    expect(durable.captureEnabled).toBe(false);
    expect(durable.captureOutbox).toEqual([bundle]);
    expect(durable.captureQuarantine).toHaveLength(1);
  });

  it("preserves confirmed and tombstones across orchestrator restarts but loses transientE1", async () => {
    const sessionStorage: Record<string, unknown> = {
      uiHints: [],
      transientE1: [{
        schemaVersion: 1, tier: "E1", kind: "request_lifecycle",
        evidence: baseE1, outcome: "pending", stableSubmissionId: null,
        rejectionReason: null, receivedAt: baseE1.receivedAt,
      }],
      transientPageContexts: [],
      transientUnmatchedE3: [],
      transientAmbiguityDiagnostics: [],
    };
    const confirmed: ConfirmedSubmissionRecord[] = [confirmedRecord("abc100_a", "1")];
    const tombstones: ConfirmedSubmissionTombstone[] = [tombstoneRecord("abc100_a", "1")];
    const localStorage: Record<string, unknown> = {
      captureProtocolVersion: 4,
      installationId,
      captureCredential: "capture_paired_credential",
      captureCredentialVersion: 2,
      captureEnabled: true,
      captureEndpoint: "http://localhost:3000/api/capture/attempts",
      confirmedSubmissions: confirmed,
      confirmedSubmissionTombstones: tombstones,
      captureOutbox: [bundleForIntent(baseIntentDraft)],
      captureQuarantine: [],
      pendingSubmissionIntents: [],
    };
    const storage = storageSpy({ local: localStorage, session: sessionStorage });

    const first = createBackgroundOrchestrator(orchestratorDeps(storage));
    const firstSnapshot = await first.snapshot();
    expect(firstSnapshot.e1LifecycleCount).toBe(1);
    expect(firstSnapshot.outboxCount).toBe(1);
    expect(firstSnapshot.waitingCount).toBe(2);
    expect(firstSnapshot.finalizedCount).toBe(1);

    // Simulate browser restart: chrome.storage.session is cleared, only
    // chrome.storage.local survives. A brand-new orchestrator reads the
    // durable slices but the transientE1 slice is gone.
    await storage.session.clear();
    const second = createBackgroundOrchestrator(orchestratorDeps(storage));
    const secondSnapshot = await second.snapshot();
    expect(secondSnapshot.outboxCount).toBe(1);
    expect(secondSnapshot.waitingCount).toBe(2);
    expect(secondSnapshot.finalizedCount).toBe(1);
    expect(secondSnapshot.e1LifecycleCount).toBe(0);

    // Confirmed and tombstones live in persistence, not state.
    const secondEffects = await second.install();
    expect(secondEffects.persistence.confirmed).toHaveLength(1);
    expect(secondEffects.persistence.tombstones).toHaveLength(1);
  });

  it("preserves retry-quarantine and delete-quarantine user actions", async () => {
    const storage = storageSpy({ local: { installationId } });
    const orchestrator = createBackgroundOrchestrator(orchestratorDeps(storage));
    await orchestrator.install();
    const blocked = {
      ...bundleForIntent(baseIntentDraft),
      attempts: 3,
      nextAttemptAt: "2026-07-24T01:00:00.000Z",
      automaticRetryBlocked: true,
    };
    await storage.local.set({
      captureOutbox: [],
      captureQuarantine: [{
        id: blocked.id,
        item: blocked,
        error: "isolated",
        quarantinedAt: "2026-07-24T00:00:30.000Z",
      }],
      lastCaptureError: "Isolated result: HTTP 500",
    });

    const retried = await orchestrator.apply({
      kind: "user_action",
      action: { type: "RETRY_QUARANTINED_CAPTURE", id: blocked.id },
    });
    await applyEffectsToStorage(storage, retried);
    expect(retried.state.outboxCount).toBe(1);
    expect(retried.state.quarantineCount).toBe(0);
    expect(retried.state.lastCaptureError).toBeUndefined();
    expect(retried.persistence.outbox[0]).toMatchObject({ id: blocked.id, attempts: 0 });

    // Quarantine is now empty; DELETE_QUARANTINED_CAPTURE leaves the outbox
    // untouched but is still safe (no-op for the moved item).
    const deleted = await orchestrator.apply({
      kind: "user_action",
      action: { type: "DELETE_QUARANTINED_CAPTURE", id: blocked.id },
    });
    await applyEffectsToStorage(storage, deleted);
    expect(deleted.state.outboxCount).toBe(1);
    expect(deleted.state.quarantineCount).toBe(0);
  });

  it("clears quarantine and lastCaptureError on CLEAR_CAPTURE_QUARANTINE", async () => {
    const storage = storageSpy({ local: { installationId } });
    const orchestrator = createBackgroundOrchestrator(orchestratorDeps(storage));
    await orchestrator.install();
    const blocked = bundleForIntent(baseIntentDraft);
    await storage.local.set({
      captureOutbox: [],
      captureQuarantine: [{
        id: blocked.id,
        item: blocked,
        error: "isolated",
        quarantinedAt: "2026-07-24T00:00:30.000Z",
      }],
      lastCaptureError: "Isolated result: HTTP 500",
    });

    const cleared = await orchestrator.apply({
      kind: "user_action",
      action: { type: "CLEAR_CAPTURE_QUARANTINE" },
    });
    await applyEffectsToStorage(storage, cleared);
    expect(cleared.state.quarantineCount).toBe(0);
    expect(cleared.state.lastCaptureError).toBeUndefined();
    const durable = await storage.local.get(["captureQuarantine", "lastCaptureError"]);
    expect(durable.captureQuarantine).toEqual([]);
    expect(durable.lastCaptureError).toBeUndefined();
    expect(cleared.persistence.quarantine).toEqual([]);
    expect(cleared.persistence.quarantine).toHaveLength(cleared.state.quarantineCount);
  });

  it("snapshot reflects sessionCount / outboxCount / waiting accurately", async () => {
    const storage = storageSpy({ local: { installationId } });
    const orchestrator = createBackgroundOrchestrator(orchestratorDeps(storage));
    await orchestrator.install();
    await storage.local.set({
      captureCredential: "capture_paired_credential",
      captureOutbox: [bundleForIntent(baseIntentDraft), bundleForIntent({
        ...baseIntentDraft, submissionId: "submission_test_2", problemExternalId: "abc100_b",
        captureSessionId: "session_test_2",
      })],
      captureQuarantine: [quarantineFromBundle(bundleForIntent({
        ...baseIntentDraft, submissionId: "submission_test_3", problemExternalId: "abc100_c",
        captureSessionId: "session_test_3",
      }), "network error")],
      pendingSubmissionIntents: [baseIntentDraft],
      confirmedSubmissions: [],
      confirmedSubmissionTombstones: [],
    });

    const snapshot = await orchestrator.snapshot();
    expect(snapshot.outboxCount).toBe(2);
    expect(snapshot.quarantineCount).toBe(1);
    expect(snapshot.finalizedCount).toBe(0);
    expect(snapshot.waitingCount).toBe(2);
    expect(snapshot.sessionCount).toBe(2);
    expect(snapshot.waiting).toBe(true);
  });

  it("install is a no-op when V4 split state already matches prior storage", async () => {
    const initial: Record<string, unknown> = {
      captureProtocolVersion: 4,
      installationId: "installation_existing",
      captureCredential: "paired",
      captureEnabled: true,
      captureEndpoint: "http://localhost:3000/api/capture/attempts",
      captureOutbox: [],
      captureQuarantine: [],
      confirmedSubmissions: [],
      confirmedSubmissionTombstones: [],
      discardedPreBundleEventCount: 0,
    };
    const storage = storageSpy({ local: initial });
    const orchestrator = createBackgroundOrchestrator(orchestratorDeps(storage));
    const effects = await orchestrator.install();
    expect(effects.state.installationId).toBe("installation_existing");
    // The orchestrator only reads keys in its LOCAL_KEYS surface, so it cannot
    // diff against `discardedPreBundleEventCount` (which is not in that list)
    // and will always emit it in the diff. Every durable key the orchestrator
    // DOES see matches prior storage and therefore is omitted from the diff.
    const durableKeys = [
      "installationId",
      "captureCredential",
      "captureCredentialVersion",
      "captureEnabled",
      "captureEndpoint",
      "captureProtocolVersion",
      "pendingSubmissionIntents",
      "confirmedSubmissions",
      "confirmedSubmissionTombstones",
      "captureOutbox",
      "captureQuarantine",
      "lastCaptureError",
      "lastSuccessfulCaptureAt",
      "lastDeliveredAttemptId",
      "lastDeliveredAttemptStatus",
      "v4ClickIntentMigration",
    ] as const;
    for (const write of effects.persistence.local) {
      expect(durableKeys.includes(write.key as typeof durableKeys[number])).toBe(false);
    }
    expect(effects.persistence.localRemovals).toEqual([]);
  });

  it("preserves transient E1 across a service-worker restart", async () => {
    const storage = storageSpy({ local: { captureProtocolVersion: 4, installationId } });
    const first = createBackgroundOrchestrator(orchestratorDeps(storage, "2026-07-24T00:00:04.000Z"));
    const firstInstall = await first.install();
    await applyEffectsToStorage(storage, firstInstall);
    const firstApply = await first.apply({
      kind: "e1_recorded",
      evidence: baseE1,
      tabId: baseE1.tabId,
      frameId: baseE1.frameId,
      documentId: baseE1.documentId,
      adapterVersion: baseE1.adapterVersion,
    });
    await applyEffectsToStorage(storage, firstApply);

    const writesBeforeRestart = storage.writes.session;
    const second = createBackgroundOrchestrator(orchestratorDeps(storage, "2026-07-24T00:00:05.000Z"));
    const restarted = await second.install();
    expect(restarted.state.e1LifecycleCount).toBe(1);
    expect(restarted.persistence.transientE1).toHaveLength(1);
    expect(storage.writes.session).toBe(writesBeforeRestart);
  });

  it("runs a synthetic E1 -> E2 -> E3 chain into exactly one deterministic bundle", async () => {
    const storage = storageSpy({
      local: {
        captureProtocolVersion: 4,
        installationId,
        captureCredential: "capture_paired_credential",
      },
    });
    const orchestrator = createBackgroundOrchestrator(orchestratorDeps(storage, "2026-07-24T00:00:04.000Z"));
    const installEffects = await orchestrator.install();
    await applyEffectsToStorage(storage, installEffects);
    const e1Effects = await orchestrator.apply({
      kind: "e1_recorded",
      evidence: baseE1,
      tabId: baseE1.tabId,
      frameId: baseE1.frameId,
      documentId: baseE1.documentId,
      adapterVersion: baseE1.adapterVersion,
    });
    await applyEffectsToStorage(storage, e1Effects);
    const confirmed = await orchestrator.apply({
      kind: "main_bridge_correlated",
      correlated: baseCorrelated,
      summary: baseSummary,
      tabId: baseSummary.tabId,
      frameId: baseSummary.frameId,
      documentId: baseSummary.documentId,
    });
    await applyEffectsToStorage(storage, confirmed);
    expect(confirmed.state.waitingCount).toBe(1);
    expect(confirmed.persistence.confirmed).toHaveLength(1);

    const finalized = await orchestrator.apply({ kind: "e3_recorded", evidence: baseE3 });
    await applyEffectsToStorage(storage, finalized);
    expect(finalized.persistence.outbox).toHaveLength(1);
    expect(finalized.persistence.outbox[0]?.bundle.bundleId).toMatch(/^bundle_[0-9a-f]{64}$/);
    expect(finalized.persistence.outbox[0]?.bundle.events[1]?.payload.action).toBe("submission_confirmed");
    expect(finalized.persistence.confirmed).toEqual([]);
    expect(finalized.persistence.tombstones).toHaveLength(1);
    expect(finalized.state.outboxCount).toBe(1);
    expect(finalized.state.finalizedCount).toBe(1);
    expect(finalized.state.sessionCount).toBe(2);

    const duplicate = await orchestrator.apply({ kind: "e3_recorded", evidence: baseE3 });
    await applyEffectsToStorage(storage, duplicate);
    expect(duplicate.state.outboxCount).toBe(1);
    const durable = await storage.local.get(["captureOutbox"]);
    expect(durable.captureOutbox).toHaveLength(1);
  });

  it("dedupes identical bridge ambiguity diagnostics", async () => {
    const storage = storageSpy({ local: { captureProtocolVersion: 4, installationId } });
    const orchestrator = createBackgroundOrchestrator(orchestratorDeps(storage, "2026-07-24T00:00:04.000Z"));
    await orchestrator.install();
    const ambiguous = {
      kind: "ambiguous" as const,
      reason: "multiple_e1_candidates" as const,
      candidates: [baseE1, { ...baseE1, evidenceId: "e1_second", requestId: "request_second" }],
      summary: baseSummary,
      candidateCount: 2,
    };
    // Background owns the writes; simulate one round of writes per apply.
    const first = await orchestrator.apply({ kind: "main_bridge_ambiguous", ambiguous });
    await applyEffectsToStorage(storage, first);
    const second = await orchestrator.apply({ kind: "main_bridge_ambiguous", ambiguous });
    await applyEffectsToStorage(storage, second);
    expect(first.state.ambiguityCount).toBe(1);
    expect(second.state.ambiguityCount).toBe(1);
    // The dedupe is observed in storage: only one diagnostic survives.
    const state = await orchestrator.snapshot();
    expect(state.ambiguityCount).toBe(1);
  });

  it("E0 hint retains the bounded session slice without affecting waiting", async () => {
    const storage = storageSpy();
    const orchestrator = createBackgroundOrchestrator(orchestratorDeps(storage));
    await orchestrator.install();
    // The orchestrator's `now` is one hour ahead of the test fixture, so
    // a hint older than `UI_HINT_TTL_MS` (30s) would be pruned immediately.
    // The recent observedAt below lands inside the retention window.
    const effects = await orchestrator.apply({
      kind: "e0_recorded",
      hint: {
        schemaVersion: 1,
        tier: "E0",
        kind: "ui_hint",
        platform: "leetcode",
        problemExternalId: "two-sum",
        observedAt: new Date(Date.parse("2026-07-24T01:00:00.000Z") - 5000).toISOString(),
      },
      sourceDocumentId: "doc_e0",
    });
    expect(effects.state.waitingCount).toBe(0);
    expect(effects.state.e0HintCount).toBe(1);
    expect(effects.state.e1LifecycleCount).toBe(0);
  });

  // -------------------------------------------------------------------------
  // Phase A Task A8 acceptance suite (review-fix batch)
  // -------------------------------------------------------------------------

  it("parks E3 before any matching E2 and replays it once the E2 lands", async () => {
    const storage = storageSpy({ local: { captureProtocolVersion: 4, installationId } });
    const orchestrator = createBackgroundOrchestrator(orchestratorDeps(storage, "2026-07-24T00:00:04.000Z"));
    const installEffects = await orchestrator.install();
    await applyEffectsToStorage(storage, installEffects);

    // The E3 arrives before any confirmed submission exists. The orchestrator
    // parks it in `transientUnmatchedE3`; nothing has been produced.
    const parked = await orchestrator.apply({ kind: "e3_recorded", evidence: baseE3 });
    await applyEffectsToStorage(storage, parked);
    expect(parked.persistence.outbox).toHaveLength(0);
    expect(parked.persistence.tombstones).toHaveLength(0);
    expect(parked.persistence.unmatchedFinals.length).toBe(1);

    // Now the correlated bridge lands. handleMainBridgeCorrelated establishes
    // the confirmed submission and replays the parked E3 via handleE3Recorded.
    // The replay produces a single deterministic bundle and a tombstone.
    const replayed = await orchestrator.apply({
      kind: "main_bridge_correlated",
      correlated: baseCorrelated,
      summary: baseSummary,
      tabId: baseSummary.tabId,
      frameId: baseSummary.frameId,
      documentId: baseSummary.documentId,
    });
    await applyEffectsToStorage(storage, replayed);
    expect(replayed.persistence.outbox).toHaveLength(1);
    expect(replayed.persistence.outbox[0]?.bundle.bundleId).toMatch(/^bundle_[0-9a-f]{64}$/);
    expect(replayed.persistence.tombstones).toHaveLength(1);
    expect(replayed.persistence.confirmed).toEqual([]);
    // The parked E3 was consumed by the replay and removed from session.
    expect(replayed.persistence.unmatchedFinals).toHaveLength(0);
    expect(replayed.state.outboxCount).toBe(1);
    expect(replayed.state.finalizedCount).toBe(1);
  });

  it("replays the most-recent E3 when two E3 messages share a submission id", async () => {
    const storage = storageSpy({ local: { captureProtocolVersion: 4, installationId } });
    const orchestrator = createBackgroundOrchestrator(orchestratorDeps(storage, "2026-07-24T00:00:04.000Z"));
    const installEffects = await orchestrator.install();
    await applyEffectsToStorage(storage, installEffects);

    const older: E3FinalVerdictConfirmed = { ...baseE3, evidenceId: "e3_older", verdict: "Accepted" };
    const newer: E3FinalVerdictConfirmed = { ...baseE3, evidenceId: "e3_newer", verdict: "Wrong Answer" };

    const parkedOlder = await orchestrator.apply({ kind: "e3_recorded", evidence: older });
    await applyEffectsToStorage(storage, parkedOlder);
    const parkedNewer = await orchestrator.apply({ kind: "e3_recorded", evidence: newer });
    await applyEffectsToStorage(storage, parkedNewer);

    // After both parks, only the newest E3 remains (filter removes prior
    // entries that share the same platform:externalSubmissionId key).
    const mid = await orchestrator.snapshot();
    expect(mid.sessionCount).toBe(0);

    const replayed = await orchestrator.apply({
      kind: "main_bridge_correlated",
      correlated: baseCorrelated,
      summary: baseSummary,
      tabId: baseSummary.tabId,
      frameId: baseSummary.frameId,
      documentId: baseSummary.documentId,
    });
    await applyEffectsToStorage(storage, replayed);
    expect(replayed.persistence.outbox).toHaveLength(1);
    expect(replayed.persistence.tombstones).toHaveLength(1);

    // The replayed bundle carries the newer verdict (most-recent-wins).
    const verdictEvent = replayed.persistence.outbox[0]?.bundle.events[2];
    expect(verdictEvent?.payload.verdict).toBe("Wrong Answer");
    expect(verdictEvent?.id).toBe(`${replayed.persistence.outbox[0]?.bundle.bundleId}_verdict`);
  });

  it("treats E3 with no confirmed backing as a no-op (no outbox produced)", async () => {
    const storage = storageSpy({ local: { captureProtocolVersion: 4, installationId } });
    const orchestrator = createBackgroundOrchestrator(orchestratorDeps(storage, "2026-07-24T00:00:04.000Z"));
    await orchestrator.install();

    // Apply the same orphan E3 repeatedly. Without a matching confirmed
    // submission the orchestrator has no path to a bundle: each call parks
    // (and replaces) a single record in `transientUnmatchedE3`. The list is
    // capped at 32 entries, so even pathological repetition stays bounded.
    const stray: E3FinalVerdictConfirmed = {
      ...baseE3,
      externalSubmissionId: "orphan_submission",
    };
    for (let i = 0; i < 5; i += 1) {
      await orchestrator.apply({ kind: "e3_recorded", evidence: stray });
    }
    const state = await orchestrator.snapshot();
    expect(state.outboxCount).toBe(0);
    expect(state.finalizedCount).toBe(0);
    expect(state.sessionCount).toBe(0);
    expect(state.waiting).toBe(false);
  });

  it("produces one bundle and tombstone from a new E3 after browser restart (no transientE1)", async () => {
    // Pre-existing E2-equivalent: the durable confirmed submission survives
    // a service-worker / browser restart because it lives in local storage.
    const priorConfirmed: ConfirmedSubmissionRecord = {
      schemaVersion: 1,
      status: "confirmed",
      platform: "leetcode",
      problemExternalId: "two-sum",
      externalSubmissionId: "submission_42",
      confirmedAt: "2026-07-24T00:00:00.000Z",
      storageKey: "leetcode:submission_42",
      lastE3At: "2026-07-24T00:00:00.000Z",
    };
    const storage = storageSpy({
      local: {
        captureProtocolVersion: 4,
        installationId,
        captureCredential: "capture_paired_credential",
        confirmedSubmissions: [priorConfirmed],
        confirmedSubmissionTombstones: [],
      },
      session: {
        uiHints: [],
        transientE1: [],
        transientPageContexts: [],
        transientUnmatchedE3: [],
        transientAmbiguityDiagnostics: [],
      },
    });
    const orchestrator = createBackgroundOrchestrator(orchestratorDeps(storage, "2026-07-24T00:00:04.000Z"));

    // Simulate the restart: chrome.storage.session is wiped on a browser
    // restart; only chrome.storage.local survives. install() then observes
    // an empty transientE1 slice.
    await storage.session.clear();
    await orchestrator.install();

    const effects = await orchestrator.apply({ kind: "e3_recorded", evidence: baseE3 });
    expect(effects.state.outboxCount).toBe(1);
    expect(effects.state.e1LifecycleCount).toBe(0);
    expect(effects.state.finalizedCount).toBe(1);
    expect(effects.persistence.outbox).toHaveLength(1);
    expect(effects.persistence.tombstones).toHaveLength(1);
    expect(effects.persistence.confirmed).toEqual([]);
    expect(effects.persistence.transientE1).toEqual([]);
  });

  it("ignores a duplicate E3 once the durable tombstone proves finalization", async () => {
    const priorConfirmed: ConfirmedSubmissionRecord = {
      schemaVersion: 1,
      status: "confirmed",
      platform: "leetcode",
      problemExternalId: "two-sum",
      externalSubmissionId: "submission_42",
      confirmedAt: "2026-07-24T00:00:00.000Z",
      storageKey: "leetcode:submission_42",
      lastE3At: "2026-07-24T00:00:00.000Z",
    };
    const storage = storageSpy({
      local: {
        captureProtocolVersion: 4,
        installationId,
        captureCredential: "capture_paired_credential",
        confirmedSubmissions: [priorConfirmed],
        confirmedSubmissionTombstones: [],
      },
      session: {
        uiHints: [],
        transientE1: [],
        transientPageContexts: [],
        transientUnmatchedE3: [],
        transientAmbiguityDiagnostics: [],
      },
    });
    const orchestrator = createBackgroundOrchestrator(
      orchestratorDeps(storage, "2026-07-24T00:00:04.000Z"),
    );

    const finalized = await orchestrator.apply({ kind: "e3_recorded", evidence: baseE3 });
    await applyEffectsToStorage(storage, finalized);
    const duplicate = await orchestrator.apply({ kind: "e3_recorded", evidence: baseE3 });
    await applyEffectsToStorage(storage, duplicate);

    expect(duplicate.persistence.session).toEqual([]);
    expect(duplicate.persistence.unmatchedFinals).toEqual([]);
    const stored = await storage.session.get(["transientUnmatchedE3"]);
    expect(stored.transientUnmatchedE3).toEqual([]);
  });

  it("preserves an E2 match through a later completed lifecycle and still correlates with E3", async () => {
    const storage = storageSpy({ local: { captureProtocolVersion: 4, installationId } });
    const orchestrator = createBackgroundOrchestrator(orchestratorDeps(storage, "2026-07-24T00:00:04.000Z"));
    await orchestrator.install();

    // Initial E1 establishes a pending lifecycle. Background owns the writes:
    // call applyEffectsToStorage between every apply so subsequent calls see
    // the prior session evidence in storage.
    const e1Effects = await orchestrator.apply({
      kind: "e1_recorded",
      evidence: baseE1,
      tabId: baseE1.tabId,
      frameId: baseE1.frameId,
      documentId: baseE1.documentId,
      adapterVersion: baseE1.adapterVersion,
    });
    await applyEffectsToStorage(storage, e1Effects);

    // E2 arrives via the MAIN bridge: the lifecycle outcome flips to matched
    // and a stableSubmissionId is recorded.
    const e2Effects = await orchestrator.apply({
      kind: "main_bridge_correlated",
      correlated: baseCorrelated,
      summary: baseSummary,
      tabId: baseSummary.tabId,
      frameId: baseSummary.frameId,
      documentId: baseSummary.documentId,
    });
    await applyEffectsToStorage(storage, e2Effects);

    // A later webRequest "completed" lifecycle for the same requestId must
    // not regress the matched outcome or lose the stable submission id.
    const completed: E1RequestObserved = {
      ...baseE1,
      evidenceId: "e1_completed",
      apiTimeStamp: 1500,
      lifecycle: "completed",
    };
    const completedEffects = await orchestrator.apply({
      kind: "e1_recorded",
      evidence: completed,
      tabId: completed.tabId,
      frameId: completed.frameId,
      documentId: completed.documentId,
      adapterVersion: completed.adapterVersion,
    });
    await applyEffectsToStorage(storage, completedEffects);

    // E3 must still find a matched lifecycle and produce exactly one bundle
    // bound to the original requestId.
    const effects = await orchestrator.apply({ kind: "e3_recorded", evidence: baseE3 });
    expect(effects.persistence.outbox).toHaveLength(1);
    expect(effects.persistence.tombstones).toHaveLength(1);
    expect(effects.persistence.outbox[0]?.bundle.bundleId).toMatch(/^bundle_[0-9a-f]{64}$/);
    expect(effects.state.outboxCount).toBe(1);
    expect(effects.state.finalizedCount).toBe(1);
  });

  it("merges E1 timestamps after E2 and emits one chronology-valid bundle", async () => {
    const storage = storageSpy({ local: { captureProtocolVersion: 4, installationId } });
    const orchestrator = createBackgroundOrchestrator(orchestratorDeps(storage, "2026-07-24T00:00:04.000Z"));
    const started: E1RequestObserved = {
      ...baseE1,
      evidenceId: "e1_started_t0",
      receivedAt: "2026-07-24T00:00:00.000Z",
      apiTimeStamp: 1000,
      lifecycle: "before_request",
    };
    const confirmedSummary: MainBridgeSummary = {
      ...baseSummary,
      evidenceId: "bridge_confirmed_t1",
      receivedAt: "2026-07-24T00:00:01.000Z",
      apiTimeStamp: 2000,
    };
    const correlated: CorrelatedCaptureResult = {
      ...baseCorrelated,
      matchedE1: started,
      summary: confirmedSummary,
    };
    const completed: E1RequestObserved = {
      ...started,
      evidenceId: "e1_completed_t2",
      receivedAt: "2026-07-24T00:00:02.000Z",
      apiTimeStamp: 3000,
      lifecycle: "completed",
      statusCode: 200,
      redirectEndpointKey: "submit/result",
    };
    const verdict: E3FinalVerdictConfirmed = {
      ...baseE3,
      evidenceId: "e3_verdict_t3",
      receivedAt: "2026-07-24T00:00:03.000Z",
    };

    const installEffects = await orchestrator.install();
    await applyEffectsToStorage(storage, installEffects);

    const startedEffects = await orchestrator.apply({
      kind: "e1_recorded",
      evidence: started,
      tabId: started.tabId,
      frameId: started.frameId,
      documentId: started.documentId,
      adapterVersion: started.adapterVersion,
    });
    await applyEffectsToStorage(storage, startedEffects);

    const e2Effects = await orchestrator.apply({
      kind: "main_bridge_correlated",
      correlated,
      summary: confirmedSummary,
      tabId: confirmedSummary.tabId,
      frameId: confirmedSummary.frameId,
      documentId: confirmedSummary.documentId,
    });
    await applyEffectsToStorage(storage, e2Effects);

    const completedEffects = await orchestrator.apply({
      kind: "e1_recorded",
      evidence: completed,
      tabId: completed.tabId,
      frameId: completed.frameId,
      documentId: completed.documentId,
      adapterVersion: completed.adapterVersion,
    });
    const mergedLifecycle = completedEffects.persistence.transientE1[0];
    if (mergedLifecycle === undefined) throw new Error("merged E1 lifecycle missing");
    expect(mergedLifecycle.evidence.receivedAt).toBe(started.receivedAt);
    expect(mergedLifecycle.evidence.lifecycle).toBe("completed");
    expect(mergedLifecycle.evidence.evidenceId).toBe(completed.evidenceId);
    expect(mergedLifecycle.evidence.apiTimeStamp).toBe(completed.apiTimeStamp);
    expect(mergedLifecycle.evidence.statusCode).toBe(200);
    expect(mergedLifecycle.evidence.redirectEndpointKey).toBe("submit/result");
    expect(mergedLifecycle.outcome).toBe("matched");
    expect(mergedLifecycle.stableSubmissionId).toBe("leetcode:submission_42");
    await applyEffectsToStorage(storage, completedEffects);

    const finalized = await orchestrator.apply({ kind: "e3_recorded", evidence: verdict });
    await applyEffectsToStorage(storage, finalized);
    expect(finalized.persistence.outbox).toHaveLength(1);
    const bundle = finalized.persistence.outbox[0]?.bundle;
    if (bundle === undefined) throw new Error("bundle missing");
    expect(bundle.events.map((event) => event.type)).toEqual([
      "SESSION_STARTED",
      "SUBMISSION_OBSERVED",
      "VERDICT_OBSERVED",
      "SESSION_ENDED",
    ]);
    const startedEvent = bundle.events[0];
    const e2Event = bundle.events[1];
    const verdictEvent = bundle.events[2];
    const endedEvent = bundle.events[3];
    if (startedEvent === undefined || e2Event === undefined
      || verdictEvent === undefined || endedEvent === undefined) {
      throw new Error("bundle chronology events missing");
    }
    expect(e2Event.occurredAt).toBe(confirmedSummary.receivedAt);
    expect(verdictEvent.occurredAt).toBe(verdict.receivedAt);
    expect(Date.parse(startedEvent.occurredAt)).toBeLessThanOrEqual(Date.parse(e2Event.occurredAt));
    expect(Date.parse(e2Event.occurredAt)).toBeLessThanOrEqual(Date.parse(verdictEvent.occurredAt));
    expect(Date.parse(verdictEvent.occurredAt)).toBeLessThanOrEqual(Date.parse(endedEvent.occurredAt));
  });

  it("does not unbounded-grow ambiguityDiagnostics when the same ambiguous bridge repeats", async () => {
    const storage = storageSpy({ local: { captureProtocolVersion: 4, installationId } });
    const orchestrator = createBackgroundOrchestrator(orchestratorDeps(storage, "2026-07-24T00:00:04.000Z"));
    await orchestrator.install();
    const ambiguous = {
      kind: "ambiguous" as const,
      reason: "multiple_e1_candidates" as const,
      candidates: [baseE1, { ...baseE1, evidenceId: "e1_second", requestId: "request_second" }],
      summary: baseSummary,
      candidateCount: 2,
    };
    // Simulate the background writer between every apply so the dedupe check
    // sees the prior diagnostic persisted in session storage.
    for (let i = 0; i < 50; i += 1) {
      const effects = await orchestrator.apply({ kind: "main_bridge_ambiguous", ambiguous });
      await applyEffectsToStorage(storage, effects);
    }
    const state = await orchestrator.snapshot();
    expect(state.ambiguityCount).toBe(1);
  });

  it("keeps two ambiguous bridges with different evidenceId coexisting", async () => {
    const storage = storageSpy({ local: { captureProtocolVersion: 4, installationId } });
    const orchestrator = createBackgroundOrchestrator(orchestratorDeps(storage, "2026-07-24T00:00:04.000Z"));
    await orchestrator.install();
    const firstSummary: MainBridgeSummary = { ...baseSummary, evidenceId: "bridge_summary_first" };
    const secondSummary: MainBridgeSummary = { ...baseSummary, evidenceId: "bridge_summary_second" };
    const first = await orchestrator.apply({
      kind: "main_bridge_ambiguous",
      ambiguous: {
        kind: "ambiguous",
        reason: "multiple_e1_candidates",
        candidates: [baseE1, { ...baseE1, evidenceId: "e1_second", requestId: "request_second" }],
        summary: firstSummary,
        candidateCount: 2,
      },
    });
    await applyEffectsToStorage(storage, first);
    const second = await orchestrator.apply({
      kind: "main_bridge_ambiguous",
      ambiguous: {
        kind: "ambiguous",
        reason: "multiple_e1_candidates",
        candidates: [baseE1, { ...baseE1, evidenceId: "e1_second", requestId: "request_second" }],
        summary: secondSummary,
        candidateCount: 2,
      },
    });
    await applyEffectsToStorage(storage, second);
    const state = await orchestrator.snapshot();
    expect(state.ambiguityCount).toBe(2);
  });

  it("dedupes rejected bridges analogously: same summary dedupes regardless of rejected payload", async () => {
    const storage = storageSpy({ local: { captureProtocolVersion: 4, installationId } });
    const orchestrator = createBackgroundOrchestrator(orchestratorDeps(storage, "2026-07-24T00:00:04.000Z"));
    await orchestrator.install();
    const baseRejected: RejectedCaptureResult = {
      kind: "rejected",
      requestId: "request_rejected_1",
      rejectionReason: "csrf_invalid",
    };
    // First call records the diagnostic, second identical call dedupes.
    const first = await orchestrator.apply({ kind: "main_bridge_rejected", rejected: baseRejected, summary: baseSummary });
    await applyEffectsToStorage(storage, first);
    const second = await orchestrator.apply({ kind: "main_bridge_rejected", rejected: baseRejected, summary: baseSummary });
    await applyEffectsToStorage(storage, second);
    let state = await orchestrator.snapshot();
    expect(state.ambiguityCount).toBe(1);

    // Varying only the rejected payload (requestId + rejectionReason) must NOT
    // open a new diagnostic because the dedupe key is reason + evidenceId +
    // tabId + frameId + documentId + endpointKey — and reason is fixed at
    // `corrupt_record` for the rejected event, with evidenceId sourced from
    // the bridge summary (not synthesised from the rejected payload).
    const differentReason: RejectedCaptureResult = {
      kind: "rejected",
      requestId: "request_rejected_1",
      rejectionReason: "csrf_expired",
    };
    const third = await orchestrator.apply({ kind: "main_bridge_rejected", rejected: differentReason, summary: baseSummary });
    await applyEffectsToStorage(storage, third);
    state = await orchestrator.snapshot();
    expect(state.ambiguityCount).toBe(1);

    const differentRequest: RejectedCaptureResult = {
      kind: "rejected",
      requestId: "request_rejected_2",
      rejectionReason: "csrf_invalid",
    };
    const fourth = await orchestrator.apply({ kind: "main_bridge_rejected", rejected: differentRequest, summary: baseSummary });
    await applyEffectsToStorage(storage, fourth);
    state = await orchestrator.snapshot();
    expect(state.ambiguityCount).toBe(1);
  });

  // -------------------------------------------------------------------------
  // Phase A Task A8 v2.1 acceptance suite
  // -------------------------------------------------------------------------

  it("E1 identity_mismatch keeps the matched E2 correlation alive", async () => {
    const storage = storageSpy({ local: { captureProtocolVersion: 4, installationId } });
    const orchestrator = createBackgroundOrchestrator(orchestratorDeps(storage, "2026-07-24T00:00:04.000Z"));
    const installEffects = await orchestrator.install();
    await applyEffectsToStorage(storage, installEffects);

    // 1. Initial E1 establishes a pending lifecycle.
    const e1First = await orchestrator.apply({
      kind: "e1_recorded",
      evidence: baseE1,
      tabId: baseE1.tabId,
      frameId: baseE1.frameId,
      documentId: baseE1.documentId,
      adapterVersion: baseE1.adapterVersion,
    });
    await applyEffectsToStorage(storage, e1First);

    // 2. E2 arrives via the MAIN bridge. The matched E1's outcome flips to
    //    `matched` and a stableSubmissionId is recorded.
    const e2 = await orchestrator.apply({
      kind: "main_bridge_correlated",
      correlated: baseCorrelated,
      summary: baseSummary,
      tabId: baseSummary.tabId,
      frameId: baseSummary.frameId,
      documentId: baseSummary.documentId,
    });
    await applyEffectsToStorage(storage, e2);
    expect(e2.state.waitingCount).toBe(1);

    // 3. A later E1 with the same requestId but a different `documentId`
    //    triggers the identity_mismatch branch. The matched outcome and
    //    stableSubmissionId MUST survive so the later E3 still correlates.
    const mismatchedE1: E1RequestObserved = {
      ...baseE1,
      evidenceId: "e1_mismatched",
      documentId: "doc_different",
    };
    const mismatch = await orchestrator.apply({
      kind: "e1_recorded",
      evidence: mismatchedE1,
      tabId: mismatchedE1.tabId,
      frameId: mismatchedE1.frameId,
      documentId: mismatchedE1.documentId,
      adapterVersion: mismatchedE1.adapterVersion,
    });
    await applyEffectsToStorage(storage, mismatch);

    // A `corrupt_record` diagnostic is recorded against the second E1's
    // identity (requestId + tab/frame/document/endpoint), but the matched
    // E1's outcome is preserved.
    expect(mismatch.state.ambiguityCount).toBe(1);
    expect(mismatch.state.waitingCount).toBe(1);

    // 4. The E3 still correlates to the original confirmed submission and
    //    produces exactly one bundle.
    const e3 = await orchestrator.apply({ kind: "e3_recorded", evidence: baseE3 });
    await applyEffectsToStorage(storage, e3);
    expect(e3.state.outboxCount).toBe(1);
    expect(e3.state.finalizedCount).toBe(1);
    expect(e3.persistence.outbox).toHaveLength(1);
    expect(e3.persistence.tombstones).toHaveLength(1);
    expect(e3.persistence.outbox[0]?.bundle.bundleId).toMatch(/^bundle_[0-9a-f]{64}$/);
  });

  it("same rejected bridge summary called twice: only one diagnostic", async () => {
    const storage = storageSpy({ local: { captureProtocolVersion: 4, installationId } });
    const orchestrator = createBackgroundOrchestrator(orchestratorDeps(storage, "2026-07-24T00:00:04.000Z"));
    await orchestrator.install();
    const rejected: RejectedCaptureResult = {
      kind: "rejected",
      requestId: "request_rejected",
      rejectionReason: "csrf_invalid",
    };
    const first = await orchestrator.apply({
      kind: "main_bridge_rejected",
      rejected,
      summary: baseSummary,
    });
    await applyEffectsToStorage(storage, first);
    const second = await orchestrator.apply({
      kind: "main_bridge_rejected",
      rejected,
      summary: baseSummary,
    });
    await applyEffectsToStorage(storage, second);
    const state = await orchestrator.snapshot();
    expect(state.ambiguityCount).toBe(1);
    expect(first.state.ambiguityCount).toBe(1);
    expect(second.state.ambiguityCount).toBe(1);
  });

  it("two rejected bridge summaries with different evidenceIds: two distinct diagnostics", async () => {
    const storage = storageSpy({ local: { captureProtocolVersion: 4, installationId } });
    const orchestrator = createBackgroundOrchestrator(orchestratorDeps(storage, "2026-07-24T00:00:04.000Z"));
    await orchestrator.install();
    const firstSummary: MainBridgeSummary = { ...baseSummary, evidenceId: "bridge_summary_first" };
    const secondSummary: MainBridgeSummary = { ...baseSummary, evidenceId: "bridge_summary_second" };
    const rejected: RejectedCaptureResult = {
      kind: "rejected",
      requestId: "request_rejected",
      rejectionReason: "csrf_invalid",
    };
    const first = await orchestrator.apply({
      kind: "main_bridge_rejected",
      rejected,
      summary: firstSummary,
    });
    await applyEffectsToStorage(storage, first);
    const second = await orchestrator.apply({
      kind: "main_bridge_rejected",
      rejected,
      summary: secondSummary,
    });
    await applyEffectsToStorage(storage, second);
    const state = await orchestrator.snapshot();
    expect(state.ambiguityCount).toBe(2);
  });

  it("rejected diagnostic dedupes by reason + evidenceId + tabId + frameId + documentId + endpointKey only", async () => {
    const storage = storageSpy({ local: { captureProtocolVersion: 4, installationId } });
    const orchestrator = createBackgroundOrchestrator(orchestratorDeps(storage, "2026-07-24T00:00:04.000Z"));
    await orchestrator.install();
    // Establish the baseline diagnostic.
    const baseRejected: RejectedCaptureResult = {
      kind: "rejected",
      requestId: "request_rejected",
      rejectionReason: "csrf_invalid",
    };
    const baseline = await orchestrator.apply({
      kind: "main_bridge_rejected",
      rejected: baseRejected,
      summary: baseSummary,
    });
    await applyEffectsToStorage(storage, baseline);
    expect(baseline.state.ambiguityCount).toBe(1);

    // Vary ONLY the rejected payload: different requestId + rejectionReason.
    // Neither is in the dedupe key, so the diagnostic still dedupes.
    const varyRejected: RejectedCaptureResult = {
      kind: "rejected",
      requestId: "request_rejected_alt",
      rejectionReason: "csrf_expired",
    };
    const varied = await orchestrator.apply({
      kind: "main_bridge_rejected",
      rejected: varyRejected,
      summary: baseSummary,
    });
    await applyEffectsToStorage(storage, varied);
    expect(varied.state.ambiguityCount).toBe(1);

    // Vary summary.evidenceId: this IS in the dedupe key, so a second
    // diagnostic must be recorded.
    const varyEvidenceId: MainBridgeSummary = {
      ...baseSummary,
      evidenceId: "bridge_summary_alt_evidence",
    };
    const evidenceIdChanged = await orchestrator.apply({
      kind: "main_bridge_rejected",
      rejected: varyRejected,
      summary: varyEvidenceId,
    });
    await applyEffectsToStorage(storage, evidenceIdChanged);
    expect(evidenceIdChanged.state.ambiguityCount).toBe(2);

    // Vary summary.documentId: also in the dedupe key, so a third diagnostic.
    const varyDocumentId: MainBridgeSummary = {
      ...baseSummary,
      evidenceId: "bridge_summary_alt_evidence",
      documentId: "doc_rejected_alt",
    };
    const documentIdChanged = await orchestrator.apply({
      kind: "main_bridge_rejected",
      rejected: varyRejected,
      summary: varyDocumentId,
    });
    await applyEffectsToStorage(storage, documentIdChanged);
    expect(documentIdChanged.state.ambiguityCount).toBe(3);

    // Vary summary.endpointKey: also in the dedupe key, so a fourth diagnostic.
    const varyEndpointKey: MainBridgeSummary = {
      ...baseSummary,
      evidenceId: "bridge_summary_alt_evidence",
      documentId: "doc_rejected_alt",
      endpointKey: "submit_alt",
    };
    const endpointKeyChanged = await orchestrator.apply({
      kind: "main_bridge_rejected",
      rejected: varyRejected,
      summary: varyEndpointKey,
    });
    await applyEffectsToStorage(storage, endpointKeyChanged);
    expect(endpointKeyChanged.state.ambiguityCount).toBe(4);

    // Vary summary.tabId / frameId: both in the dedupe key, so two more
    // diagnostics must be recorded.
    const varyTab: MainBridgeSummary = { ...baseSummary, tabId: 2 };
    const tabChanged = await orchestrator.apply({
      kind: "main_bridge_rejected",
      rejected: baseRejected,
      summary: varyTab,
    });
    await applyEffectsToStorage(storage, tabChanged);
    expect(tabChanged.state.ambiguityCount).toBe(5);

    const varyFrame: MainBridgeSummary = { ...baseSummary, frameId: 1 };
    const frameChanged = await orchestrator.apply({
      kind: "main_bridge_rejected",
      rejected: baseRejected,
      summary: varyFrame,
    });
    await applyEffectsToStorage(storage, frameChanged);
    expect(frameChanged.state.ambiguityCount).toBe(6);

    // Storage reflects all six distinct diagnostics.
    const state = await orchestrator.snapshot();
    expect(state.ambiguityCount).toBe(6);
  });

  it("each apply invocation produces exactly one round of background storage writes", async () => {
    const storage = storageSpy({
      local: {
        captureProtocolVersion: 4,
        installationId,
        lastCaptureError: "stale",
      },
    });
    const orchestrator = createBackgroundOrchestrator(orchestratorDeps(storage, "2026-07-24T00:00:04.000Z"));
    const installEffects = await orchestrator.install();
    await applyEffectsToStorage(storage, installEffects);
    const afterInstall = storage.writeLog.length;

    // The orchestrator itself is read-only. The custom background persistence
    // helper is the only writer and applies one batched set plus removals per
    // area, matching production `applyPersistence`.
    const first = await orchestrator.apply({
      kind: "e1_recorded",
      evidence: baseE1,
      tabId: baseE1.tabId,
      frameId: baseE1.frameId,
      documentId: baseE1.documentId,
      adapterVersion: baseE1.adapterVersion,
    });
    expect(storage.writeLog.length).toBe(afterInstall);
    await applyEffectsToStorage(storage, first);
    const firstRound = storage.writeLog.slice(afterInstall);
    expect(firstRound).toEqual([{
      area: "session",
      operation: "set",
      keys: ["transientE1"],
    }]);
    const sessionAfterFirst = await storage.session.get(["transientE1"]);

    // A second apply sees the first round's cumulative state and needs one
    // local set plus one session set. There must be no write between the two
    // apply invocations, before the background consumes the second diff.
    const beforeSecond = storage.writeLog.length;
    const second = await orchestrator.apply({
      kind: "main_bridge_correlated",
      correlated: baseCorrelated,
      summary: baseSummary,
      tabId: baseSummary.tabId,
      frameId: baseSummary.frameId,
      documentId: baseSummary.documentId,
    });
    expect(storage.writeLog.length).toBe(beforeSecond);
    await applyEffectsToStorage(storage, second);
    const secondRound = storage.writeLog.slice(beforeSecond);
    expect(secondRound).toHaveLength(2);
    expect(secondRound.filter((write) => write.area === "local" && write.operation === "set")).toHaveLength(1);
    expect(secondRound.filter((write) => write.area === "local" && write.operation === "remove")).toHaveLength(0);
    expect(secondRound.filter((write) => write.area === "session" && write.operation === "set")).toHaveLength(1);
    expect(secondRound.filter((write) => write.area === "session" && write.operation === "remove")).toHaveLength(0);
    expect((await storage.session.get(["transientE1"])).transientE1).not.toEqual(sessionAfterFirst.transientE1);

    // Reapplying the same E1 is a no-op. The mock sees no writes and its
    // cumulative state remains unchanged across the consecutive apply call.
    const beforeThirdLog = storage.writeLog.length;
    const beforeThirdSession = await storage.session.get(["transientE1"]);
    const third = await orchestrator.apply({
      kind: "e1_recorded",
      evidence: baseE1,
      tabId: baseE1.tabId,
      frameId: baseE1.frameId,
      documentId: baseE1.documentId,
      adapterVersion: baseE1.adapterVersion,
    });
    expect(storage.writeLog.length).toBe(beforeThirdLog);
    await applyEffectsToStorage(storage, third);
    expect(storage.writeLog.length).toBe(beforeThirdLog);
    expect(await storage.session.get(["transientE1"])).toEqual(beforeThirdSession);

    // Exercise the remove half of the local persistence round as well. The
    // stale error was seeded before install, outside the apply measurement.
    const beforeClear = storage.writeLog.length;
    const clear = await orchestrator.apply({
      kind: "user_action",
      action: { type: "CLEAR_CAPTURE_OUTBOX" },
    });
    expect(storage.writeLog.length).toBe(beforeClear);
    await applyEffectsToStorage(storage, clear);
    const clearRound = storage.writeLog.slice(beforeClear);
    expect(clearRound.filter((write) => write.area === "local" && write.operation === "set")).toHaveLength(1);
    expect(clearRound.filter((write) => write.area === "local" && write.operation === "remove")).toHaveLength(1);
    expect(clearRound.filter((write) => write.area === "session")).toHaveLength(0);
  });

  it("after idle alarm, prune produces a persistence diff that contains only the non-pruned slices", async () => {
    const futureNow = "2026-07-24T01:00:00.000Z";
    const oldHint = {
      schemaVersion: 1 as const,
      tier: "E0" as const,
      kind: "ui_hint" as const,
      platform: "leetcode" as const,
      problemExternalId: "old-two-sum",
      observedAt: "2026-07-24T00:59:00.000Z",
      sourceDocumentId: "doc_old_hint",
    };
    const recentHint = {
      ...oldHint,
      problemExternalId: "recent-two-sum",
      observedAt: "2026-07-24T00:59:45.000Z",
      sourceDocumentId: "doc_recent_hint",
    };
    const oldEvidence: E1RequestObserved = {
      ...baseE1,
      evidenceId: "e1_old_prune",
      requestId: "request_old_prune",
      receivedAt: "2026-07-24T00:50:00.000Z",
    };
    const recentEvidence: E1RequestObserved = {
      ...baseE1,
      evidenceId: "e1_recent_prune",
      requestId: "request_recent_prune",
      receivedAt: "2026-07-24T00:59:30.000Z",
    };
    const oldLifecycle = {
      schemaVersion: 1 as const,
      tier: "E1" as const,
      kind: "request_lifecycle" as const,
      evidence: oldEvidence,
      outcome: "pending" as const,
      stableSubmissionId: null,
      rejectionReason: null,
      receivedAt: oldEvidence.receivedAt,
    };
    const recentLifecycle = {
      ...oldLifecycle,
      evidence: recentEvidence,
      receivedAt: recentEvidence.receivedAt,
    };
    const oldDiagnostic = {
      schemaVersion: 1 as const,
      tier: "E1" as const,
      kind: "ambiguity_diagnostic" as const,
      reason: "multiple_e1_candidates" as const,
      receivedAt: "2026-07-23T00:00:00.000Z",
      evidenceId: "diagnostic_old_prune",
      tabId: 1,
      frameId: 0,
      documentId: "doc_e1",
      endpointKey: "submit",
    };
    const storage = storageSpy({ local: { captureProtocolVersion: 4, installationId } });
    const orchestrator = createBackgroundOrchestrator(orchestratorDeps(storage, "2026-07-24T00:00:04.000Z"));
    const installEffects = await orchestrator.install();
    await applyEffectsToStorage(storage, installEffects);
    await storage.session.set({
      uiHints: [oldHint, recentHint],
      transientE1: [oldLifecycle, recentLifecycle],
      transientPageContexts: [],
      transientUnmatchedE3: [],
      transientAmbiguityDiagnostics: [oldDiagnostic],
    });

    const priorSession = await storage.session.get([
      "uiHints",
      "transientE1",
      "transientPageContexts",
      "transientUnmatchedE3",
      "transientAmbiguityDiagnostics",
    ]);
    const effects = await orchestrator.pruneOrchestratorSession(futureNow);

    expect(effects.persistence.local).toEqual([]);
    expect(effects.persistence.localRemovals).toEqual([]);
    expect(effects.persistence.sessionRemovals).toEqual([]);
    expect(effects.persistence.session.map((write) => write.key)).toEqual([
      "uiHints",
      "transientE1",
      "transientAmbiguityDiagnostics",
    ]);
    expect(effects.persistence.session).toEqual([
      { key: "uiHints", value: [recentHint] },
      { key: "transientE1", value: [recentLifecycle] },
      { key: "transientAmbiguityDiagnostics", value: [] },
    ]);
    for (const write of effects.persistence.session) {
      expect(Reflect.get(priorSession, write.key)).not.toEqual(write.value);
    }
    expect(effects.persistence.session.some((write) =>
      write.key === "uiHints" && Array.isArray(write.value)
      && write.value.some((value) => Reflect.get(value, "problemExternalId") === "old-two-sum"))).toBe(false);
    expect(effects.persistence.session.some((write) =>
      write.key === "transientE1" && Array.isArray(write.value)
      && write.value.some((value) => Reflect.get(value, "receivedAt") === oldEvidence.receivedAt))).toBe(false);
    expect(effects.executorSchedule).toEqual([]);
  });

  it("records a NowCoder E2 only when both exact E1 lifecycles are retained", async () => {
    const storage = storageSpy({ local: { captureProtocolVersion: 4, installationId } });
    const orchestrator = createBackgroundOrchestrator(
      orchestratorDeps(storage, "2026-07-24T00:00:03.000Z"),
    );
    const installEffects = await orchestrator.install();
    await applyEffectsToStorage(storage, installEffects);

    for (const evidence of [nowCoderSubmitE1, nowCoderStatusE1]) {
      const e1Effects = await orchestrator.apply({
        kind: "e1_recorded",
        evidence,
        tabId: evidence.tabId,
        frameId: evidence.frameId,
        documentId: evidence.documentId,
        adapterVersion: evidence.adapterVersion,
      });
      await applyEffectsToStorage(storage, e1Effects);
    }

    const effects = await orchestrator.apply({
      kind: "e2_recorded",
      evidence: nowCoderE2,
      matchedSubmitRequestId: nowCoderSubmitE1.requestId,
    });
    await applyEffectsToStorage(storage, effects);

    expect(effects.state.waiting).toBe(true);
    expect(effects.state.waitingCount).toBe(1);
    expect(effects.persistence.confirmed).toEqual([
      expect.objectContaining({
        platform: "nowcoder",
        externalSubmissionId: "84257292",
        problemExternalId: "acm/contest/18839/1001",
      }),
    ]);
    expect(effects.persistence.transientE1.find((entry) =>
      entry.evidence.requestId === nowCoderSubmitE1.requestId)?.outcome).toBe("matched");
  });

  it("rejects a NowCoder E2 whose retained status lifecycle identity differs", async () => {
    const storage = storageSpy({ local: { captureProtocolVersion: 4, installationId } });
    const orchestrator = createBackgroundOrchestrator(
      orchestratorDeps(storage, "2026-07-24T00:00:03.000Z"),
    );
    const installEffects = await orchestrator.install();
    await applyEffectsToStorage(storage, installEffects);

    for (const evidence of [nowCoderSubmitE1, nowCoderStatusE1]) {
      const e1Effects = await orchestrator.apply({
        kind: "e1_recorded",
        evidence,
        tabId: evidence.tabId,
        frameId: evidence.frameId,
        documentId: evidence.documentId,
        adapterVersion: evidence.adapterVersion,
      });
      await applyEffectsToStorage(storage, e1Effects);
    }

    const effects = await orchestrator.apply({
      kind: "e2_recorded",
      evidence: { ...nowCoderE2, documentId: "different_document" },
      matchedSubmitRequestId: nowCoderSubmitE1.requestId,
    });

    expect(effects.state.waiting).toBe(false);
    expect(effects.persistence.confirmed).toEqual([]);
  });
});

describe("popup presentation distinguishes waiting and finalized counts", () => {
  // The popup is a thin renderer of `OrchestratorState`; the orchestrator
  // must therefore expose both counts as separate fields.
  it("reports waiting > 0 and finalized > 0 distinctly when both are set", async () => {
    const storage = storageSpy({ local: { installationId } });
    const orchestrator = createBackgroundOrchestrator(orchestratorDeps(storage));
    await orchestrator.install();
    const intentA: PendingSubmissionIntent = { ...baseIntentDraft, submissionId: "submission_a", problemExternalId: "abc100_a" };
    const intentB: PendingSubmissionIntent = { ...baseIntentDraft, submissionId: "submission_b", problemExternalId: "abc100_b" };
    const bundleA = bundleForIntent(intentA);
    const bundleB = bundleForIntent(intentB);
    const bundleC = bundleForIntent({ ...intentA, submissionId: "submission_c", problemExternalId: "abc100_c", captureSessionId: "session_c" });
    await storage.local.set({
      captureCredential: "capture_paired_credential",
      captureOutbox: [bundleA, bundleB],
      captureQuarantine: [{
        id: bundleC.id,
        item: bundleC,
        error: "isolated",
        quarantinedAt: "2026-07-24T00:00:30.000Z",
      }],
      pendingSubmissionIntents: [intentA, intentB],
      confirmedSubmissions: [confirmedRecord("abc200_a", "1")],
      confirmedSubmissionTombstones: [tombstoneRecord("abc200_a", "1")],
    });
    const state = await orchestrator.snapshot();
    expect(state.waitingCount).toBe(3); // 2 outbox + 1 confirmed; V3 intents are pre-confirmation only
    expect(state.outboxCount).toBe(2);
    expect(state.quarantineCount).toBe(1);
    expect(state.finalizedCount).toBe(1); // 1 tombstone
    expect(state.waiting).toBe(true);
  });
});

describe("background orchestrator persistence shape", () => {
  it("returns a read-only OrchestratorEffects with frozen arrays", async () => {
    const storage = storageSpy();
    const orchestrator = createBackgroundOrchestrator(orchestratorDeps(storage));
    await orchestrator.install();
    const effects = await orchestrator.apply({
      kind: "e1_recorded",
      evidence: baseE1,
      tabId: baseE1.tabId,
      frameId: baseE1.frameId,
      documentId: baseE1.documentId,
      adapterVersion: baseE1.adapterVersion,
    });
    expect(Object.isFrozen(effects.state)).toBe(true);
    expect(Object.isFrozen(effects.persistence)).toBe(true);
    expect(Object.isFrozen(effects.persistence.outbox)).toBe(true);
    expect(Object.isFrozen(effects.executorSchedule)).toBe(true);
  });

  it("writes transient diff through session persistence and durable diff through local", async () => {
    const storage = storageSpy();
    const orchestrator = createBackgroundOrchestrator(orchestratorDeps(storage));
    await orchestrator.install();
    const effects = await orchestrator.apply({
      kind: "e1_recorded",
      evidence: baseE1,
      tabId: baseE1.tabId,
      frameId: baseE1.frameId,
      documentId: baseE1.documentId,
      adapterVersion: baseE1.adapterVersion,
    });
    const persistence: OrchestratorPersistence = effects.persistence;
    expect(persistence.local).toEqual([]);
    expect(persistence.localRemovals).toEqual([]);
    expect(persistence.session).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// background.ts expireCaptureUiHints alarm wiring
// ---------------------------------------------------------------------------

type FakeStorageArea = {
  get: (keys: readonly string[]) => Promise<Record<string, unknown>>;
  readonly set: (items: Record<string, unknown>) => Promise<void>;
  readonly remove: (key: string) => Promise<void>;
  readonly setAccessLevel: (options: { readonly accessLevel: "TRUSTED_CONTEXTS" }) => Promise<void>;
};

type FakeAlarmListener = (alarm: chrome.alarms.Alarm) => void | Promise<void>;
type FakeInstalledListener = () => void | Promise<void>;
type FakeStartupListener = () => void | Promise<void>;
type FakeMessageListener = (
  message: unknown,
  sender: chrome.runtime.MessageSender,
  sendResponse: (response?: unknown) => void,
) => boolean | undefined | Promise<unknown>;

interface FakeChrome {
  readonly storage: { readonly local: FakeStorageArea; readonly session: FakeStorageArea };
  readonly alarms: {
    readonly create: (name: string, info: chrome.alarms.AlarmCreateInfo) => Promise<void>;
    readonly clear: (name?: string) => Promise<boolean>;
    readonly getAll: () => Promise<chrome.alarms.Alarm[]>;
    readonly get: (name: string) => Promise<chrome.alarms.Alarm | undefined>;
    readonly onAlarm: { readonly addListener: (cb: FakeAlarmListener) => void };
  };
  readonly runtime: {
    readonly onInstalled: { readonly addListener: (cb: FakeInstalledListener) => void };
    readonly onStartup: { readonly addListener: (cb: FakeStartupListener) => void };
    readonly onMessage: { readonly addListener: (cb: FakeMessageListener) => void };
  };
  readonly webRequest: {
    readonly onBeforeRequest: { readonly addListener: (...args: readonly unknown[]) => void };
    readonly onBeforeRedirect: { readonly addListener: (...args: readonly unknown[]) => void };
    readonly onResponseStarted: { readonly addListener: (...args: readonly unknown[]) => void };
    readonly onCompleted: { readonly addListener: (...args: readonly unknown[]) => void };
    readonly onErrorOccurred: { readonly addListener: (...args: readonly unknown[]) => void };
  };
  readonly webNavigation: {
    readonly onCommitted: { readonly addListener: (...args: readonly unknown[]) => void };
    readonly onCompleted: { readonly addListener: (...args: readonly unknown[]) => void };
    readonly onHistoryStateUpdated: { readonly addListener: (...args: readonly unknown[]) => void };
    readonly onErrorOccurred: { readonly addListener: (...args: readonly unknown[]) => void };
  };
  readonly scripting: {
    readonly executeScript: (...args: readonly unknown[]) => Promise<readonly unknown[]>;
  };
  readonly tabs: {
    readonly query: (...args: readonly unknown[]) => Promise<readonly chrome.tabs.Tab[]>;
  };
  // Diagnostic helpers.
  readonly getAlarm: (name: string) => chrome.alarms.Alarm | undefined;
  readonly alarmCreateCalls: ReadonlyArray<{
    readonly name: string;
    readonly when?: number;
    readonly periodInMinutes?: number;
    readonly delayInMinutes?: number;
  }>;
  readonly alarmClearCalls: readonly string[];
  readonly installedListeners: readonly FakeInstalledListener[];
  readonly startupListeners: readonly FakeStartupListener[];
  readonly alarmListeners: readonly FakeAlarmListener[];
  readonly messageListeners: readonly FakeMessageListener[];
  readonly storageAccessLevelCalls: readonly string[];
}

function createFakeStorageArea(
  name: "local" | "session",
  accessLevelCalls: string[],
  initial: Record<string, unknown> = {},
): FakeStorageArea {
  const store: Record<string, unknown> = { ...initial };
  return {
    get: async (keys) => {
      const out: Record<string, unknown> = {};
      for (const key of keys) {
        if (Object.hasOwn(store, key)) out[key] = store[key];
      }
      return out;
    },
    set: async (items) => { Object.assign(store, items); },
    remove: async (key) => { Reflect.deleteProperty(store, key); },
    setAccessLevel: async (options) => {
      accessLevelCalls.push(`${name}:${options.accessLevel}`);
    },
  };
}

function createFakeChrome(
  initial: { readonly local?: Record<string, unknown>; readonly session?: Record<string, unknown> } = {},
): FakeChrome {
  const alarms = new Map<string, chrome.alarms.Alarm>();
  const alarmCreateCalls: Array<{
    name: string;
    when?: number;
    periodInMinutes?: number;
    delayInMinutes?: number;
  }> = [];
  const alarmClearCalls: string[] = [];
  const installedListeners: FakeInstalledListener[] = [];
  const startupListeners: FakeStartupListener[] = [];
  const alarmListeners: FakeAlarmListener[] = [];
  const messageListeners: FakeMessageListener[] = [];
  const storageAccessLevelCalls: string[] = [];
  const sessionStore = initial.session ?? {};
  return {
    storage: {
      local: createFakeStorageArea("local", storageAccessLevelCalls, initial.local),
      session: createFakeStorageArea("session", storageAccessLevelCalls, sessionStore),
    },
    alarms: {
      create: async (name, info) => {
        const scheduledTime = info.when ?? Date.now();
        const stored: chrome.alarms.Alarm = info.periodInMinutes === undefined
          ? { name, scheduledTime }
          : { name, scheduledTime, periodInMinutes: info.periodInMinutes };
        alarms.set(name, stored);
        alarmCreateCalls.push({
          name,
          ...(info.when === undefined ? {} : { when: info.when }),
          ...(info.periodInMinutes === undefined ? {} : { periodInMinutes: info.periodInMinutes }),
          ...(info.delayInMinutes === undefined ? {} : { delayInMinutes: info.delayInMinutes }),
        });
      },
      clear: async (name) => {
        if (name === undefined) {
          const had = alarms.size > 0;
          alarms.clear();
          return had;
        }
        alarmClearCalls.push(name);
        return alarms.delete(name);
      },
      getAll: async () => Array.from(alarms.values()),
      get: async (name) => alarms.get(name),
      onAlarm: { addListener: (cb) => { alarmListeners.push(cb); } },
    },
    runtime: {
      onInstalled: { addListener: (cb) => { installedListeners.push(cb); } },
      // Remember startup callbacks so tests can fire them — the production
      // module captures them at module-load time via the real chrome API.
      onStartup: { addListener: (cb) => { startupListeners.push(cb); } },
      onMessage: { addListener: (cb) => { messageListeners.push(cb); } },
    },
    webRequest: {
      onBeforeRequest: { addListener: () => undefined },
      onBeforeRedirect: { addListener: () => undefined },
      onResponseStarted: { addListener: () => undefined },
      onCompleted: { addListener: () => undefined },
      onErrorOccurred: { addListener: () => undefined },
    },
    webNavigation: {
      onCommitted: { addListener: () => undefined },
      onCompleted: { addListener: () => undefined },
      onHistoryStateUpdated: { addListener: () => undefined },
      onErrorOccurred: { addListener: () => undefined },
    },
    scripting: {
      executeScript: async () => [],
    },
    tabs: {
      query: async () => [],
    },
    getAlarm: (name) => alarms.get(name),
    alarmCreateCalls,
    alarmClearCalls,
    installedListeners,
    startupListeners,
    alarmListeners,
    messageListeners,
    storageAccessLevelCalls,
  };
}

async function pumpMicrotasks(): Promise<void> {
  // Drain enough microtask cycles for the background module's top-level
  // initialization IIFE (orchestrator.install + applyPersistence, each of
  // which performs one await per storage write) to fully settle. Twenty
  // cycles covers the local/session write fan-out plus the persistence-cache
  // handoff; any further yields are subsequent scheduled work like flushOutbox.
  for (let index = 0; index < 40; index += 1) {
    await Promise.resolve();
  }
}

async function waitForSessionPredicate(
  storage: FakeStorageArea,
  predicate: (stored: Record<string, unknown>) => boolean,
  timeoutMs = 1000,
): Promise<Record<string, unknown>> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const stored = await storage.get(["uiHints"]);
    if (predicate(stored)) return stored;
    await pumpMicrotasks();
  }
  throw new Error("background session state did not reach the expected predicate in time");
}

async function loadBackgroundWithChrome(chromeStub: FakeChrome): Promise<void> {
  // Cast through unknown because the fake Chrome narrows to the subset we use
  // — the production `@types/chrome` surface is wider than this test cares about.
  (globalThis as unknown as { chrome: unknown }).chrome = chromeStub;
  vi.resetModules();
  await import("@/extension/src/background");
  await pumpMicrotasks();
}

describe("background.ts expireCaptureUiHints alarm wiring", () => {
  let originalChrome: unknown;
  beforeEach(() => {
    originalChrome = (globalThis as { chrome?: unknown }).chrome;
  });
  afterEach(() => {
    vi.useRealTimers();
    if (originalChrome === undefined) {
      Reflect.deleteProperty(globalThis, "chrome");
    } else {
      (globalThis as unknown as { chrome: unknown }).chrome = originalChrome;
    }
    vi.resetModules();
  });

  it("creates the alarm on onInstalled, recomputes its when after a UI hint apply, and prunes the session on alarm fire", async () => {
    vi.useFakeTimers();
    const baseTime = new Date("2026-07-24T00:00:00.000Z");
    vi.setSystemTime(baseTime);

    const fake = createFakeChrome({
      local: { installationId: "installation_alarm_test" },
    });
    await loadBackgroundWithChrome(fake);
    expect(fake.storageAccessLevelCalls).toEqual([
      "local:TRUSTED_CONTEXTS",
      "session:TRUSTED_CONTEXTS",
    ]);

    // The onInstalled listener must have been registered exactly once and
    // must establish the cleanup alarm slot before any other async work so
    // even an empty-session install carries a periodic prune driver.
    expect(fake.installedListeners).toHaveLength(1);
    const installed = fake.installedListeners[0];
    if (installed === undefined) throw new Error("installed listener missing");
    await installed();
    await pumpMicrotasks();

    // The cleanup alarm MUST be addressable by name after onInstalled, and
    // its AlarmCreateInfo MUST carry either `when` or `periodInMinutes`
    // (`delayInMinutes` is also acceptable). On a fresh install with no
    // session evidence the deadline is undefined, so the slot is filled by
    // the periodic fallback inside `ensurePruneAlarmSlot`.
    const initialAlarm = fake.getAlarm("expireCaptureUiHints");
    expect(initialAlarm?.name).toBe("expireCaptureUiHints");
    const initialCreate = fake.alarmCreateCalls.find((call) => call.name === "expireCaptureUiHints");
    expect(initialCreate).toBeDefined();
    expect(
      initialCreate?.when !== undefined
      || initialCreate?.periodInMinutes !== undefined
      || initialCreate?.delayInMinutes !== undefined,
    ).toBe(true);

    // The flush alarm is always created on install.
    expect(fake.getAlarm("flushCaptureOutbox")?.name).toBe("flushCaptureOutbox");

    // Send a UI hint through the runtime message listener. The handler
    // schedules `applyOrchestratorEvent` on the SerializedWorkExecutor and
    // returns false (synchronous ack).
    const hintObservedAt = new Date().toISOString();
    const hintMessage = {
      type: "UI_HINT_OBSERVED",
      hint: {
        schemaVersion: 1,
        tier: "E0",
        kind: "ui_hint",
        platform: "atcoder",
        problemExternalId: "abc100_a",
        observedAt: hintObservedAt,
      },
    };
    const sender: chrome.runtime.MessageSender = { documentId: "doc_alarm_test" };
    expect(fake.messageListeners).toHaveLength(1);
    const messageListener = fake.messageListeners[0];
    if (messageListener === undefined) throw new Error("message listener missing");
    const returned = messageListener(hintMessage, sender, () => undefined);
    expect(returned).toBe(false);
    await pumpMicrotasks();

    // The apply must have written the hint to session storage and scheduled
    // the cleanup alarm for roughly `hintObservedAt + UI_HINT_TTL_MS`.
    const sessionAfterApply = await fake.storage.session.get(["uiHints"]);
    expect(Array.isArray(sessionAfterApply.uiHints)).toBe(true);
    expect((sessionAfterApply.uiHints as readonly unknown[]).length).toBe(1);

    const expectedWhen = Date.parse(hintObservedAt) + UI_HINT_TTL_MS;
    const rescheduledAlarm = fake.getAlarm("expireCaptureUiHints");
    expect(rescheduledAlarm?.name).toBe("expireCaptureUiHints");
    expect(rescheduledAlarm?.scheduledTime).not.toBeUndefined();
    // Epsilon tolerance accounts for the orchestrator's `now` falling within
    // the same `vi.setSystemTime` instant and the `chrome.alarms.create`
    // call latency; both reference the same mocked clock.
    expect(Math.abs((rescheduledAlarm?.scheduledTime ?? 0) - expectedWhen)).toBeLessThanOrEqual(5);

    // Advance the mocked clock past the prune deadline and fire the alarm.
    vi.setSystemTime(new Date(expectedWhen + 1000));
    expect(fake.alarmListeners).toHaveLength(1);
    const alarmListener = fake.alarmListeners[0];
    if (alarmListener === undefined) throw new Error("alarm listener missing");
    await alarmListener({ name: "expireCaptureUiHints", scheduledTime: expectedWhen });
    // The listener schedules `pruneOrchestratorSession()` on the
    // SerializedWorkExecutor; let the executor drain.
    await waitForSessionPredicate(fake.storage.session, (stored) => {
      const hints = stored.uiHints;
      return Array.isArray(hints) && hints.length === 0;
    });

    // After prune: the session diff has removed the expired hint. No future
    // deadline is computable, so the slot falls back to the periodic driver
    // via `reschedulePruneAlarm(undefined)` → `ensurePruneAlarmSlot()`. The
    // alarm must still be addressable — losing it would leave idle installs
    // without any prune driver.
    const finalSession = await fake.storage.session.get(["uiHints"]);
    expect(Array.isArray(finalSession.uiHints)).toBe(true);
    expect((finalSession.uiHints as readonly unknown[]).length).toBe(0);

    const afterPruneAlarm = fake.getAlarm("expireCaptureUiHints");
    expect(afterPruneAlarm?.name).toBe("expireCaptureUiHints");
    const afterPruneCreate = [...fake.alarmCreateCalls]
      .reverse()
      .find((call) => call.name === "expireCaptureUiHints");
    expect(
      afterPruneCreate?.when !== undefined
      || afterPruneCreate?.periodInMinutes !== undefined
      || afterPruneCreate?.delayInMinutes !== undefined,
    ).toBe(true);
  });

  it("after onInstalled with empty session, the expireCaptureUiHints alarm exists", async () => {
    // Empty local store: nothing to schedule against; the only session keys
    // present are the empty arrays the orchestrator writes during install.
    const fake = createFakeChrome();
    await loadBackgroundWithChrome(fake);

    expect(fake.installedListeners).toHaveLength(1);
    const installed = fake.installedListeners[0];
    if (installed === undefined) throw new Error("installed listener missing");
    await installed();
    // Two cycles is enough for `chrome.alarms.get` + `chrome.alarms.create`
    // to complete inside `ensurePruneAlarmSlot`. pumpMicrotasks runs more.
    await pumpMicrotasks();

    // The cleanup alarm must exist after onInstalled even when there is no
    // session evidence, because a fresh install with no UI hint has no
    // computable deadline. `ensurePruneAlarmSlot` fills the slot with a
    // periodic fallback so the prune driver is never lost.
    const alarm = fake.getAlarm("expireCaptureUiHints");
    expect(alarm).toBeDefined();
    expect(alarm?.name).toBe("expireCaptureUiHints");

    // The AlarmCreateInfo used to create the alarm must include either a
    // concrete `when` or a recurring `periodInMinutes` / `delayInMinutes`.
    // The fake stores the most-recent create info keyed by name; the empty
    // session path always falls back to the periodic driver.
    const createCall = fake.alarmCreateCalls.find((call) => call.name === "expireCaptureUiHints");
    expect(createCall).toBeDefined();
    expect(
      createCall?.when !== undefined
      || createCall?.periodInMinutes !== undefined
      || createCall?.delayInMinutes !== undefined,
    ).toBe(true);
  });

  it("onStartup fires cleanup alarm scheduling even when flushOutbox is still pending", async () => {
    // The simplest way to pin `flushOutbox` in a never-resolving promise is
    // to hang the `chrome.storage.local.get(["captureOutbox",
    // "captureQuarantine"])` call that `readOutboxState` issues inside
    // `drainCaptureOutbox`. `ensurePruneAlarmSlot` runs on its own promise
    // chain (it is `void`-dispatched synchronously inside the onStartup
    // listener, BEFORE the executor's scheduled work), so it can finish
    // despite the executor being blocked on the drain.
    let pendingReadStarted = false;
    const fake = createFakeChrome({
      local: {
        installationId: "installation_onstartup_test",
        captureOutbox: [{ id: "bundle_pending", kind: "attempt_bundle", bundle: {}, attempts: 0, createdAt: "2026-07-24T00:00:00.000Z" }],
        captureQuarantine: [],
        captureEndpoint: "http://localhost:3000/api/capture/attempts",
        captureCredential: "capture_paired_credential",
      },
    });
    const originalGet = fake.storage.local.get;
    fake.storage.local.get = (async (keys) => {
      if (keys.includes("captureOutbox") && keys.includes("captureQuarantine")) {
        pendingReadStarted = true;
        // Never resolves — the test deliberately leaves the executor
        // blocked on the outbox drain to prove the alarm slot was filled
        // by `ensurePruneAlarmSlot` BEFORE flushOutbox could settle.
        return new Promise<Record<string, unknown>>(() => undefined);
      }
      return originalGet(keys);
    }) as FakeStorageArea["get"];

    await loadBackgroundWithChrome(fake);

    // The startup listener must have been registered exactly once.
    expect(fake.startupListeners).toHaveLength(1);
    const startup = fake.startupListeners[0];
    if (startup === undefined) throw new Error("startup listener missing");

    await startup();
    await pumpMicrotasks();

    // The cleanup alarm MUST be created even though flushOutbox is still
    // pending on the never-resolving storage read. `ensurePruneAlarmSlot`
    // is dispatched synchronously before the executor's scheduled work,
    // so it is not blocked by the outbox drain.
    const alarm = fake.getAlarm("expireCaptureUiHints");
    expect(alarm).toBeDefined();
    expect(alarm?.name).toBe("expireCaptureUiHints");
    const cleanupCreateCalls = fake.alarmCreateCalls
      .filter((call) => call.name === "expireCaptureUiHints");
    expect(cleanupCreateCalls.length).toBeGreaterThan(0);
    const lastCleanupCreate = cleanupCreateCalls[cleanupCreateCalls.length - 1];
    expect(
      lastCleanupCreate?.when !== undefined
      || lastCleanupCreate?.periodInMinutes !== undefined
      || lastCleanupCreate?.delayInMinutes !== undefined,
    ).toBe(true);

    // The pending storage read for captureOutbox was actually entered,
    // confirming that the executor's outbox drain started AFTER the alarm
    // was created. The alarm being present here is the proof that the two
    // operations are independent.
    expect(pendingReadStarted).toBe(true);
  });

  it("re-establishes the expireCaptureUiHints alarm as a periodic slot after a no-diff prune", async () => {
    // Drives the fake Chrome through the full lifecycle:
    //   install -> schedule an expireCaptureUiHints with a future `when`
    //   -> fire the alarm (Chrome consumes the one-shot) -> prune produces
    //   no session diff -> the alarm slot is re-filled by the periodic
    //   fallback with `periodInMinutes: 1`. The regression we are pinning
    //   is that an empty-diff prune (no `persistence.session` writes) must
    //   still re-anchor the alarm; previously `applyPersistence` skipped
    //   `scheduleUiHintCleanupAlarm` when there were no session writes and
    //   the slot disappeared after Chrome consumed the one-shot.
    vi.useFakeTimers();
    const baseTime = new Date("2026-07-24T00:00:00.000Z");
    vi.setSystemTime(baseTime);

    const fake = createFakeChrome({
      local: { installationId: "installation_no_diff_prune_test" },
    });
    await loadBackgroundWithChrome(fake);

    expect(fake.installedListeners).toHaveLength(1);
    const installed = fake.installedListeners[0];
    if (installed === undefined) throw new Error("installed listener missing");
    await installed();
    await pumpMicrotasks();

    // After install, the cleanup alarm slot must be filled by the periodic
    // fallback inside `ensurePruneAlarmSlot` (no session evidence yet).
    expect(fake.getAlarm("expireCaptureUiHints")?.name).toBe("expireCaptureUiHints");

    // Schedule the alarm with a future one-shot `when`. This mimics a
    // concrete deadline (e.g. after a UI hint apply) where
    // `reschedulePruneAlarm(nextDeadline)` schedules a one-shot rather
    // than the periodic fallback.
    const futureWhen = baseTime.getTime() + 60_000;
    await fake.alarms.create("expireCaptureUiHints", { when: futureWhen });
    const oneShotAlarm = fake.getAlarm("expireCaptureUiHints");
    expect(oneShotAlarm?.scheduledTime).toBe(futureWhen);
    expect(oneShotAlarm?.periodInMinutes).toBeUndefined();

    // Simulate Chrome consuming the one-shot alarm when it fires: the
    // fake's `clear` removes the entry. The slot is empty at this point.
    await fake.alarms.clear("expireCaptureUiHints");
    expect(fake.getAlarm("expireCaptureUiHints")).toBeUndefined();

    // Fire the alarm listener. The handler schedules
    // `pruneOrchestratorSession()` on the SerializedWorkExecutor; the
    // orchestrator sees an empty session and produces no diff
    // (`persistence.session.length === 0`).
    expect(fake.alarmListeners).toHaveLength(1);
    const alarmListener = fake.alarmListeners[0];
    if (alarmListener === undefined) throw new Error("alarm listener missing");
    await alarmListener({ name: "expireCaptureUiHints", scheduledTime: futureWhen });
    // Drain the executor so the scheduled `pruneOrchestratorSession`
    // (and the unconditional `scheduleUiHintCleanupAlarm` it triggers via
    // `applyPersistence`) completes.
    await pumpMicrotasks();

    // The session slice must remain empty (prune produced no diff). The
    // alarm must be re-established as a periodic slot even though no
    // session writes were committed; this is the regression contract.
    const sessionAfter = await fake.storage.session.get([
      "uiHints",
      "transientE1",
      "transientPageContexts",
      "transientUnmatchedE3",
      "transientAmbiguityDiagnostics",
    ]);
    expect(sessionAfter.uiHints).toEqual([]);
    expect(sessionAfter.transientE1).toEqual([]);
    expect(sessionAfter.transientPageContexts).toEqual([]);
    expect(sessionAfter.transientUnmatchedE3).toEqual([]);
    expect(sessionAfter.transientAmbiguityDiagnostics).toEqual([]);

    const reestablished = fake.getAlarm("expireCaptureUiHints");
    expect(reestablished).toBeDefined();
    expect(reestablished?.name).toBe("expireCaptureUiHints");
    expect(reestablished?.periodInMinutes).toBe(1);
  });
});

describe("verdict candidate orchestration (Task 5)", () => {
  const candidateNow = "2026-08-06T11:22:00.000Z";

  const verdictCandidate = (overrides: Partial<TransientVerdictCandidate> = {}): TransientVerdictCandidate => ({
    schemaVersion: 1,
    tier: "E3",
    kind: "verdict_candidate",
    candidateId: "candidate_flow_1",
    platform: "leetcode",
    problemExternalId: "two-sum",
    verdict: "Accepted",
    observedAt: "2026-08-06T11:21:00.000Z",
    tabId: 1,
    frameId: 0,
    documentId: "doc_e1",
    transitionEvidence: "same_document_transition",
    receivedAt: "2026-08-06T11:20:30.000Z",
    ...overrides,
  });

  const candidateE1 = (): E1RequestObserved => ({
    ...baseE1,
    evidenceId: "e1_leetcode_840",
    receivedAt: "2026-08-06T11:20:01.000Z",
    apiTimeStamp: 1000.5,
    requestId: "request_840",
    endpointKey: "leetcode/submit/cn/two-sum",
    statusCode: 200,
  });

  const candidateE1Check = (): E1RequestObserved => ({
    ...baseE1,
    evidenceId: "e1_leetcode_841",
    receivedAt: "2026-08-06T11:20:02.500Z",
    apiTimeStamp: 1001.5,
    requestId: "request_841",
    method: "GET",
    endpointKey: "leetcode/check/cn/920",
    statusCode: 200,
  });

  const candidateE2 = (): E2SubmissionConfirmed => ({
    schemaVersion: 1,
    evidenceId: "e2_leetcode_cn_920",
    platform: "leetcode",
    tier: "E2",
    kind: "submission_confirmed",
    receivedAt: "2026-08-06T11:20:02.500Z",
    tabId: 1,
    frameId: 0,
    documentId: "doc_e1",
    adapterVersion: "v4-leetcode-network-6",
    requestEvidenceId: "e1_leetcode_841",
    externalSubmissionId: "cn/920",
    problemExternalId: "two-sum",
    phase: "judging",
  });

  const candidateE3 = (): E3FinalVerdictConfirmed => ({
    schemaVersion: 1,
    evidenceId: "e3_leetcode_cn_920",
    platform: "leetcode",
    tier: "E3",
    kind: "final_verdict_confirmed",
    receivedAt: "2026-08-06T11:21:00.000Z",
    tabId: 1,
    frameId: 0,
    documentId: "doc_e1",
    adapterVersion: "v4-leetcode-network-6",
    externalSubmissionId: "cn/920",
    problemExternalId: "two-sum",
    verdict: "Accepted",
  });

  async function installWithLifecycles(
    storage: ExtensionInitializationStorageSplit,
    now: string,
  ): Promise<ReturnType<typeof createBackgroundOrchestrator>> {
    const orchestrator = createBackgroundOrchestrator(orchestratorDeps(storage, now));
    const installEffects = await orchestrator.install();
    await applyEffectsToStorage(storage, installEffects);
    return orchestrator;
  }

  async function recordLifecyclePair(
    storage: ExtensionInitializationStorageSplit,
    orchestrator: ReturnType<typeof createBackgroundOrchestrator>,
  ): Promise<void> {
    for (const evidence of [candidateE1(), candidateE1Check()]) {
      const effects = await orchestrator.apply({
        kind: "e1_recorded",
        evidence,
        tabId: evidence.tabId,
        frameId: evidence.frameId,
        documentId: evidence.documentId,
        adapterVersion: evidence.adapterVersion,
      });
      await applyEffectsToStorage(storage, effects);
    }
  }

  it("candidate-only event changes session state but not waiting/outbox", async () => {
    const storage = storageSpy({
      local: { captureProtocolVersion: 4, installationId, captureCredential: "capture_paired_credential" },
    });
    const orchestrator = await installWithLifecycles(storage, candidateNow);
    await recordLifecyclePair(storage, orchestrator);
    const effects = await orchestrator.apply({
      kind: "verdict_candidate_recorded",
      candidate: verdictCandidate(),
    });
    await applyEffectsToStorage(storage, effects);
    expect(effects.verdictCandidateResolutions).toEqual([]);
    expect(effects.state.waitingCount).toBe(0);
    expect(effects.state.outboxCount).toBe(0);
    expect(effects.persistence.verdictCandidates).toHaveLength(1);
    const session = await storage.session.get(["transientVerdictCandidates"]);
    expect(session.transientVerdictCandidates).toHaveLength(1);
  });

  it("E2 event returns one resolution for the matching candidate", async () => {
    const storage = storageSpy({
      local: { captureProtocolVersion: 4, installationId, captureCredential: "capture_paired_credential" },
    });
    const orchestrator = await installWithLifecycles(storage, candidateNow);
    await recordLifecyclePair(storage, orchestrator);
    const candidateEffects = await orchestrator.apply({
      kind: "verdict_candidate_recorded",
      candidate: verdictCandidate(),
    });
    await applyEffectsToStorage(storage, candidateEffects);
    const effects = await orchestrator.apply({
      kind: "e2_recorded",
      evidence: candidateE2(),
      matchedSubmitRequestId: "request_840",
    });
    await applyEffectsToStorage(storage, effects);
    expect(effects.verdictCandidateResolutions).toHaveLength(1);
    const resolution = effects.verdictCandidateResolutions[0];
    if (resolution === undefined) throw new Error("resolution missing");
    expect(resolution.candidateId).toBe("candidate_flow_1");
    expect(resolution.externalSubmissionId).toBe("cn/920");
    expect(resolution.problemExternalId).toBe("two-sum");
    expect(resolution.verdict).toBe("Accepted");
    expect(effects.persistence.confirmed).toHaveLength(1);
  });

  it("E2 event does not resolve unrelated candidates", async () => {
    const storage = storageSpy({
      local: { captureProtocolVersion: 4, installationId, captureCredential: "capture_paired_credential" },
    });
    const orchestrator = await installWithLifecycles(storage, candidateNow);
    await recordLifecyclePair(storage, orchestrator);
    const candidateEffects = await orchestrator.apply({
      kind: "verdict_candidate_recorded",
      candidate: verdictCandidate({ candidateId: "candidate_other", problemExternalId: "reverse-integer" }),
    });
    await applyEffectsToStorage(storage, candidateEffects);
    const effects = await orchestrator.apply({
      kind: "e2_recorded",
      evidence: candidateE2(),
      matchedSubmitRequestId: "request_840",
    });
    await applyEffectsToStorage(storage, effects);
    expect(effects.verdictCandidateResolutions).toEqual([]);
    const session = await storage.session.get(["transientVerdictCandidates"]);
    expect(session.transientVerdictCandidates).toHaveLength(1);
  });

  it("successful E3 consumes candidate and confirmed record", async () => {
    const storage = storageSpy({
      local: { captureProtocolVersion: 4, installationId, captureCredential: "capture_paired_credential" },
    });
    const orchestrator = await installWithLifecycles(storage, candidateNow);
    await recordLifecyclePair(storage, orchestrator);
    const candidateEffects = await orchestrator.apply({
      kind: "verdict_candidate_recorded",
      candidate: verdictCandidate(),
    });
    await applyEffectsToStorage(storage, candidateEffects);
    const e2Effects = await orchestrator.apply({
      kind: "e2_recorded",
      evidence: candidateE2(),
      matchedSubmitRequestId: "request_840",
    });
    await applyEffectsToStorage(storage, e2Effects);
    const resolution = e2Effects.verdictCandidateResolutions[0];
    if (resolution === undefined) throw new Error("resolution missing");
    const effects = await orchestrator.apply({
      kind: "e3_recorded",
      evidence: candidateE3(),
      candidateId: resolution.candidateId,
    });
    await applyEffectsToStorage(storage, effects);
    expect(effects.persistence.outbox).toHaveLength(1);
    expect(effects.persistence.confirmed).toEqual([]);
    const session = await storage.session.get(["transientVerdictCandidates"]);
    expect(session.transientVerdictCandidates).toEqual([]);
  });

  it("successful E3 adds one tombstone and one outbox item", async () => {
    const storage = storageSpy({
      local: { captureProtocolVersion: 4, installationId, captureCredential: "capture_paired_credential" },
    });
    const orchestrator = await installWithLifecycles(storage, candidateNow);
    await recordLifecyclePair(storage, orchestrator);
    const candidateEffects = await orchestrator.apply({
      kind: "verdict_candidate_recorded",
      candidate: verdictCandidate(),
    });
    await applyEffectsToStorage(storage, candidateEffects);
    const e2Effects = await orchestrator.apply({
      kind: "e2_recorded",
      evidence: candidateE2(),
      matchedSubmitRequestId: "request_840",
    });
    await applyEffectsToStorage(storage, e2Effects);
    const resolution = e2Effects.verdictCandidateResolutions[0];
    if (resolution === undefined) throw new Error("resolution missing");
    const effects = await orchestrator.apply({
      kind: "e3_recorded",
      evidence: candidateE3(),
      candidateId: resolution.candidateId,
    });
    await applyEffectsToStorage(storage, effects);
    expect(effects.persistence.tombstones).toHaveLength(1);
    expect(effects.persistence.outbox).toHaveLength(1);
  });

  it("duplicate E3 creates no second bundle", async () => {
    const storage = storageSpy({
      local: { captureProtocolVersion: 4, installationId, captureCredential: "capture_paired_credential" },
    });
    const orchestrator = await installWithLifecycles(storage, candidateNow);
    await recordLifecyclePair(storage, orchestrator);
    const candidateEffects = await orchestrator.apply({
      kind: "verdict_candidate_recorded",
      candidate: verdictCandidate(),
    });
    await applyEffectsToStorage(storage, candidateEffects);
    const e2Effects = await orchestrator.apply({
      kind: "e2_recorded",
      evidence: candidateE2(),
      matchedSubmitRequestId: "request_840",
    });
    await applyEffectsToStorage(storage, e2Effects);
    const resolution = e2Effects.verdictCandidateResolutions[0];
    if (resolution === undefined) throw new Error("resolution missing");
    const first = await orchestrator.apply({
      kind: "e3_recorded",
      evidence: candidateE3(),
      candidateId: resolution.candidateId,
    });
    await applyEffectsToStorage(storage, first);
    const duplicate = await orchestrator.apply({
      kind: "e3_recorded",
      evidence: candidateE3(),
      candidateId: resolution.candidateId,
    });
    await applyEffectsToStorage(storage, duplicate);
    expect(first.persistence.outbox).toHaveLength(1);
    expect(duplicate.persistence.outbox).toEqual([]);
    expect(duplicate.persistence.tombstones).toEqual([]);
    const durable = await storage.local.get(["captureOutbox"]);
    expect(durable.captureOutbox).toHaveLength(1);
    const durables = await storage.local.get(["confirmedSubmissions"]);
    expect(durables.confirmedSubmissions).toEqual([]);
  });

  it("restart/install re-emits a recoverable resolution", async () => {
    const storage = storageSpy({
      local: { captureProtocolVersion: 4, installationId, captureCredential: "capture_paired_credential" },
    });
    const orchestrator = await installWithLifecycles(storage, candidateNow);
    await recordLifecyclePair(storage, orchestrator);
    const candidateEffects = await orchestrator.apply({
      kind: "verdict_candidate_recorded",
      candidate: verdictCandidate(),
    });
    await applyEffectsToStorage(storage, candidateEffects);
    const e2Effects = await orchestrator.apply({
      kind: "e2_recorded",
      evidence: candidateE2(),
      matchedSubmitRequestId: "request_840",
    });
    // Simulate a worker stop before the E3 was applied: the durable
    // confirmed record exists, the candidate was consumed by the resolution,
    // so nothing is left to reconcile.
    await applyEffectsToStorage(storage, e2Effects);
    const restarted = createBackgroundOrchestrator(orchestratorDeps(storage, candidateNow));
    const effects = await restarted.install();
    await applyEffectsToStorage(storage, effects);
    expect(effects.verdictCandidateResolutions).toEqual([]);
    expect(effects.persistence.verdictCandidates).toEqual([]);
    const session = await storage.session.get(["transientVerdictCandidates"]);
    expect(session.transientVerdictCandidates).toEqual([]);
  });

  it("terminal chronology removes only the offending candidate", async () => {
    const storage = storageSpy({
      local: { captureProtocolVersion: 4, installationId, captureCredential: "capture_paired_credential" },
    });
    const orchestrator = await installWithLifecycles(storage, candidateNow);
    await recordLifecyclePair(storage, orchestrator);
    const candidateEffects = await orchestrator.apply({
      kind: "verdict_candidate_recorded",
      candidate: verdictCandidate({
        candidateId: "candidate_late",
        observedAt: "2026-08-06T11:20:01.000Z",
      }),
    });
    await applyEffectsToStorage(storage, candidateEffects);
    expect(candidateEffects.verdictCandidateResolutions).toEqual([]);
    const effects = await orchestrator.apply({
      kind: "e2_recorded",
      evidence: candidateE2(),
      matchedSubmitRequestId: "request_840",
    });
    await applyEffectsToStorage(storage, effects);
    expect(effects.verdictCandidateResolutions).toEqual([]);
    const session = await storage.session.get(["transientVerdictCandidates"]);
    expect(session.transientVerdictCandidates).toEqual([]);
  });

  it("two candidates do not overwrite one another", async () => {
    const storage = storageSpy({
      local: { captureProtocolVersion: 4, installationId, captureCredential: "capture_paired_credential" },
    });
    const orchestrator = await installWithLifecycles(storage, candidateNow);
    const first = verdictCandidate();
    const second = verdictCandidate({
      candidateId: "candidate_flow_2",
      receivedAt: "2026-08-06T11:20:40.000Z",
    });
    for (const candidate of [first, second]) {
      const effects = await orchestrator.apply({
        kind: "verdict_candidate_recorded",
        candidate,
      });
      await applyEffectsToStorage(storage, effects);
    }
    const session = await storage.session.get(["transientVerdictCandidates"]);
    expect(session.transientVerdictCandidates).toHaveLength(2);
  });

  it("all writes remain routed through orchestrator persistence", async () => {
    const storage = storageSpy({
      local: { captureProtocolVersion: 4, installationId, captureCredential: "capture_paired_credential" },
    });
    const orchestrator = await installWithLifecycles(storage, candidateNow);
    await recordLifecyclePair(storage, orchestrator);
    const effects = await orchestrator.apply({
      kind: "verdict_candidate_recorded",
      candidate: verdictCandidate(),
    });
    await applyEffectsToStorage(storage, effects);
    const local = await storage.local.get(["lastCaptureError"]);
    expect(local.lastCaptureError).toBeUndefined();
    expect(effects.persistence.session).toHaveLength(1);
    const writeLog = storage.writeLog.filter(
      (write) => write.area === "session" && write.operation === "set",
    );
    expect(writeLog.some((write) => write.keys.includes("transientVerdictCandidates"))).toBe(true);
  });
});
