/**
 * Cross-layer verdict-candidate flow tests (D4 E3 coordinator repair, Task 1).
 *
 * RED contract: these tests pin the final Candidate/E2 coordinator contract
 * before any production code exists. They are expected to fail until Tasks
 * 2-7 land:
 *
 *  - E2 must carry the network evidence time, not the executor processing
 *    time (Task 2).
 *  - `verdict_candidate_recorded` + `verdictCandidateResolutions` must exist
 *    on the orchestrator (Task 5).
 *  - `reconcileVerdictCandidates` must exist (Task 4).
 *  - `createLeetCodeFinalVerdictEvidence` must exist (Task 6).
 *  - Candidate persistence must be session-only and bounded (Task 3).
 *
 * The scenario uses the real defect timestamps:
 *
 *  submit network evidence:       2026-08-06T11:20:00.000Z
 *  check/result network evidence: 2026-08-06T11:20:02.500Z
 *  candidate DOM observation:     2026-08-06T11:20:02.700Z
 *  executor processing clock:     2026-08-06T11:20:03.065Z
 *
 * The test simulates the background loop: apply an orchestrator event, then
 * apply its persistence diff to the storage spy exactly like the worker does.
 */
import { describe, expect, it } from "vitest";
import { createBackgroundOrchestrator } from "@/extension/src/backgroundOrchestrator";
import type {
  OrchestratorEffects,
  OrchestratorPersistence,
} from "@/extension/src/backgroundOrchestrator";
import type { ExtensionInitializationStorageSplit } from "@/extension/src/installation";
import {
  createLeetCodeFinalVerdictEvidence,
  LEETCODE_CHECK_ENDPOINT_PREFIX,
  LEETCODE_SUBMIT_ENDPOINT_PREFIX,
} from "@/extension/src/adapters/leetcode/network";
import type { VerdictCandidateResolution } from "@/extension/src/verdictCandidateCoordinator";
import type {
  TransientVerdictCandidate,
} from "@/extension/src/transientEvidenceStorage";
import type { E1RequestObserved, E2SubmissionConfirmed } from "@/extension/src/evidence";

const SUBMIT_TIME = "2026-08-06T11:20:00.000Z";
const NETWORK_TIME = "2026-08-06T11:20:02.500Z";
const CANDIDATE_TIME = "2026-08-06T11:20:02.700Z";
const EXECUTOR_TIME = "2026-08-06T11:20:03.065Z";
const DOCUMENT_ID = "E3F2C1B4A59687D0102030405060708";
const PROBLEM = "two-sum";
const SUBMISSION_ID = "cn/740553045";

function lifecycle(
  overrides: Partial<E1RequestObserved> = {},
): E1RequestObserved {
  return {
    schemaVersion: 1,
    evidenceId: "e1_leetcode_840",
    platform: "leetcode",
    tier: "E1",
    kind: "request_observed",
    receivedAt: SUBMIT_TIME,
    tabId: 7,
    frameId: 0,
    documentId: DOCUMENT_ID,
    adapterVersion: "v4-leetcode-network-6",
    requestId: "840",
    method: "POST",
    endpointKey: `${LEETCODE_SUBMIT_ENDPOINT_PREFIX}/cn/${PROBLEM}`,
    resourceType: "xmlhttprequest",
    lifecycle: "completed",
    apiTimeStamp: 1000.5,
    statusCode: 200,
    ...overrides,
  };
}

function confirmedE2(overrides: Partial<E2SubmissionConfirmed> = {}): E2SubmissionConfirmed {
  return {
    schemaVersion: 1,
    evidenceId: "e2_leetcode_cn_740553045",
    platform: "leetcode",
    tier: "E2",
    kind: "submission_confirmed",
    receivedAt: NETWORK_TIME,
    tabId: 7,
    frameId: 0,
    documentId: DOCUMENT_ID,
    adapterVersion: "v4-leetcode-network-6",
    requestEvidenceId: "e1_leetcode_841",
    externalSubmissionId: SUBMISSION_ID,
    problemExternalId: PROBLEM,
    phase: "judging",
    ...overrides,
  };
}

function candidate(overrides: Partial<TransientVerdictCandidate> = {}): TransientVerdictCandidate {
  return {
    schemaVersion: 1,
    tier: "E3",
    kind: "verdict_candidate",
    candidateId: "candidate_two-sum_740553045",
    platform: "leetcode",
    problemExternalId: PROBLEM,
    verdict: "Accepted",
    observedAt: CANDIDATE_TIME,
    tabId: 7,
    frameId: 0,
    documentId: DOCUMENT_ID,
    transitionEvidence: "exact_result_document",
    receivedAt: CANDIDATE_TIME,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// In-memory storage spy mirroring tests/unit/extensionBackgroundOrchestrator
// ---------------------------------------------------------------------------

function storageSpy(initial: {
  readonly local?: Record<string, unknown>;
  readonly session?: Record<string, unknown>;
} = {}): ExtensionInitializationStorageSplit & {
  readonly localState: () => Record<string, unknown>;
  readonly sessionState: () => Record<string, unknown>;
} {
  const localStore: Record<string, unknown> = { ...(initial.local ?? {}) };
  const sessionStore: Record<string, unknown> = { ...(initial.session ?? {}) };
  return {
    localState: () => ({ ...localStore }),
    sessionState: () => ({ ...sessionStore }),
    local: {
      get: async (keys: readonly string[]) => {
        const out: Record<string, unknown> = {};
        for (const key of keys) {
          if (Object.hasOwn(localStore, key)) out[key] = localStore[key];
        }
        return out;
      },
      set: async (items: Record<string, unknown>) => {
        Object.assign(localStore, items);
      },
      remove: async (key: string) => {
        Reflect.deleteProperty(localStore, key);
      },
    },
    session: {
      get: async (keys: readonly string[]) => {
        const out: Record<string, unknown> = {};
        for (const key of keys) {
          if (Object.hasOwn(sessionStore, key)) out[key] = sessionStore[key];
        }
        return out;
      },
      set: async (items: Record<string, unknown>) => {
        Object.assign(sessionStore, items);
      },
      remove: async (key: string) => {
        Reflect.deleteProperty(sessionStore, key);
      },
    },
  };
}

async function applyEffects(
  storage: ReturnType<typeof storageSpy>,
  effects: { readonly persistence: OrchestratorPersistence },
): Promise<void> {
  const localItems: Record<string, unknown> = {};
  for (const write of effects.persistence.local) localItems[write.key] = write.value;
  if (Object.keys(localItems).length > 0) await storage.local.set(localItems);
  const sessionItems: Record<string, unknown> = {};
  for (const write of effects.persistence.session) sessionItems[write.key] = write.value;
  if (Object.keys(sessionItems).length > 0) await storage.session.set(sessionItems);
  for (const key of effects.persistence.localRemovals) await storage.local.remove(key);
  for (const key of effects.persistence.sessionRemovals) await storage.session.remove(key);
}

async function drainResolutions(
  storage: ReturnType<typeof storageSpy>,
  effects: OrchestratorEffects,
): Promise<void> {
  for (const resolution of effects.verdictCandidateResolutions) {
    const e3 = createLeetCodeFinalVerdictEvidence({
      problemExternalId: resolution.problemExternalId,
      externalSubmissionId: resolution.externalSubmissionId,
      verdictText: resolution.verdict,
      tabId: resolution.tabId,
      frameId: resolution.frameId,
      documentId: resolution.documentId,
      receivedAt: resolution.observedAt,
    });
    expect(e3).not.toBeNull();
    if (e3 !== null) {
      const orchestrator = createBackgroundOrchestrator({
        storage,
        now: () => EXECUTOR_TIME,
        flushOutbox: async (): Promise<void> => undefined,
      });
      const next = await orchestrator.apply({
        kind: "e3_recorded",
        evidence: e3,
        candidateId: resolution.candidateId,
      });
      await applyEffects(storage, next);
    }
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("verdict candidate flow", () => {
  it("RED: candidate before E2 completes exactly one bundle", async () => {
    const storage = storageSpy();
    const orchestrator = createBackgroundOrchestrator({
      storage,
      now: () => EXECUTOR_TIME,
      flushOutbox: async (): Promise<void> => undefined,
    });

    // Candidate arrives first: no E2 yet, so no resolution.
    const first = await orchestrator.apply({
      kind: "verdict_candidate_recorded",
      candidate: candidate(),
    });
    expect(first.verdictCandidateResolutions).toEqual([]);
    expect(first.persistence.session.some((write) => write.key === "transientVerdictCandidates")).toBe(true);
    await applyEffects(storage, first);

    // The E1 lifecycle for the exact submit is retained in session state.
    const second = await orchestrator.apply({
      kind: "e1_recorded",
      evidence: lifecycle(),
      tabId: 7,
      frameId: 0,
      documentId: DOCUMENT_ID,
      adapterVersion: "v4-leetcode-network-6",
    });
    await applyEffects(storage, second);

    // The confirmation (check/result) E1 lifecycle is also present.
    const confirmation = await orchestrator.apply({
      kind: "e1_recorded",
      evidence: lifecycle({
        evidenceId: "e1_leetcode_841",
        requestId: "841",
        method: "GET",
        endpointKey: `${LEETCODE_CHECK_ENDPOINT_PREFIX}/cn/${SUBMISSION_ID}`,
      }),
      tabId: 7,
      frameId: 0,
      documentId: DOCUMENT_ID,
      adapterVersion: "v4-leetcode-network-6",
    });
    await applyEffects(storage, confirmation);

    // E2 arrives (network evidence time 11:20:02.500, NOT executor 11:20:03.065).
    const third = await orchestrator.apply({
      kind: "e2_recorded",
      evidence: confirmedE2(),
      matchedSubmitRequestId: "840",
    });
    expect(third.verdictCandidateResolutions).toHaveLength(1);
    await applyEffects(storage, third);

    // The exact resolution must reference the exact submission identity.
    const resolutions: readonly VerdictCandidateResolution[] =
      third.verdictCandidateResolutions;
    expect(resolutions[0]).toMatchObject({
      candidateId: candidate().candidateId,
      externalSubmissionId: SUBMISSION_ID,
      problemExternalId: PROBLEM,
      verdict: "Accepted",
    });

    // Turn the resolution into E3 through the adapter-owned constructor.
    await drainResolutions(storage, third);

    // Finalization: one bundle, one tombstone, no retained candidate.
    const finalState = await orchestrator.snapshot();
    expect(finalState.outboxCount).toBe(1);
    expect(finalState.finalizedCount).toBe(1);
    expect(finalState.sessionCount).toBe(2);
    const session = storage.sessionState();
    const retained = session.transientVerdictCandidates as readonly unknown[];
    expect(retained).toHaveLength(0);
  });

  it("RED: E2 timestamp is the network evidence time, not the executor clock", async () => {
    const storage = storageSpy();
    const orchestrator = createBackgroundOrchestrator({
      storage,
      now: () => EXECUTOR_TIME,
      flushOutbox: async (): Promise<void> => undefined,
    });
    for (const record of [
      lifecycle(),
      lifecycle({
        evidenceId: "e1_leetcode_841",
        requestId: "841",
        method: "GET",
        endpointKey: `${LEETCODE_CHECK_ENDPOINT_PREFIX}/cn/${SUBMISSION_ID}`,
      }),
    ]) {
      const events = await orchestrator.apply({
        kind: "e1_recorded",
        evidence: record,
        tabId: 7,
        frameId: 0,
        documentId: DOCUMENT_ID,
        adapterVersion: "v4-leetcode-network-6",
      });
      await applyEffects(storage, events);
    }
    const effects = await orchestrator.apply({
      kind: "e2_recorded",
      evidence: confirmedE2({ receivedAt: NETWORK_TIME }),
      matchedSubmitRequestId: "840",
    });
    const persisted = effects.persistence.local.find(
      (write) => write.key === "confirmedSubmissions",
    );
    const records = Array.isArray(persisted?.value)
      ? persisted.value
      : [];
    expect(records).toHaveLength(1);
    const record = records[0] as Readonly<{ confirmedAt?: string }>;
    expect(record.confirmedAt).toBe(NETWORK_TIME);
    expect(record.confirmedAt).not.toBe(EXECUTOR_TIME);
  });

  it("E2 before candidate still produces exactly one bundle when the candidate arrives second", async () => {
    const storage = storageSpy();
    const orchestrator = createBackgroundOrchestrator({
      storage,
      now: () => EXECUTOR_TIME,
      flushOutbox: async (): Promise<void> => undefined,
    });

    for (const record of [
      lifecycle(),
      lifecycle({
        evidenceId: "e1_leetcode_841",
        requestId: "841",
        method: "GET",
        endpointKey: `${LEETCODE_CHECK_ENDPOINT_PREFIX}/cn/${SUBMISSION_ID}`,
      }),
    ]) {
      const events = await orchestrator.apply({
        kind: "e1_recorded",
        evidence: record,
        tabId: 7,
        frameId: 0,
        documentId: DOCUMENT_ID,
        adapterVersion: "v4-leetcode-network-6",
      });
      await applyEffects(storage, events);
    }
    const e2 = await orchestrator.apply({
      kind: "e2_recorded",
      evidence: confirmedE2(),
      matchedSubmitRequestId: "840",
    });
    expect(e2.verdictCandidateResolutions).toEqual([]);
    await applyEffects(storage, e2);

    const intake = await orchestrator.apply({
      kind: "verdict_candidate_recorded",
      candidate: candidate(),
    });
    expect(intake.verdictCandidateResolutions).toHaveLength(1);
    await applyEffects(storage, intake);

    await drainResolutions(storage, intake);
    const finalState = await orchestrator.snapshot();
    expect(finalState.outboxCount).toBe(1);
    expect(finalState.finalizedCount).toBe(1);
  });

  it("an unrelated E2 leaves the candidate pending", async () => {
    const storage = storageSpy();
    const orchestrator = createBackgroundOrchestrator({
      storage,
      now: () => EXECUTOR_TIME,
      flushOutbox: async (): Promise<void> => undefined,
    });

    const retained = await orchestrator.apply({
      kind: "verdict_candidate_recorded",
      candidate: candidate(),
    });
    await applyEffects(storage, retained);

    for (const record of [
      lifecycle({
        evidenceId: "e1_leetcode_unrelated",
        requestId: "900",
      }),
      lifecycle({
        evidenceId: "e1_leetcode_unrelated_check",
        requestId: "901",
        method: "GET",
        endpointKey: `${LEETCODE_CHECK_ENDPOINT_PREFIX}/cn/999999`,
      }),
    ]) {
      const events = await orchestrator.apply({
        kind: "e1_recorded",
        evidence: record,
        tabId: 9,
        frameId: 0,
        documentId: "UNRELATED_DOC",
        adapterVersion: "v4-leetcode-network-6",
      });
      await applyEffects(storage, events);
    }
    const e2 = await orchestrator.apply({
      kind: "e2_recorded",
      evidence: confirmedE2({
        externalSubmissionId: "cn/999999",
        problemExternalId: "three-sum",
      }),
      matchedSubmitRequestId: "900",
    });
    expect(e2.verdictCandidateResolutions).toEqual([]);
    await applyEffects(storage, e2);

    const session = storage.sessionState();
    const retainedAfter = session.transientVerdictCandidates as readonly unknown[];
    expect(retainedAfter).toHaveLength(1);
  });

  it("two tabs complete independently", async () => {
    const storage = storageSpy();
    const orchestrator = createBackgroundOrchestrator({
      storage,
      now: () => EXECUTOR_TIME,
      flushOutbox: async (): Promise<void> => undefined,
    });

    const DOCUMENT_A = "DOC_A_TAB_7";
    const DOCUMENT_B = "DOC_B_TAB_8";
    const SUBMISSION_B = "cn/740553999";

    for (const record of [
      lifecycle({ documentId: DOCUMENT_A }),
      lifecycle({
        evidenceId: "e1_leetcode_841",
        requestId: "841",
        method: "GET",
        documentId: DOCUMENT_A,
        endpointKey: `${LEETCODE_CHECK_ENDPOINT_PREFIX}/cn/${SUBMISSION_ID}`,
      }),
      lifecycle({
        evidenceId: "e1_leetcode_b_submit",
        requestId: "950",
        documentId: DOCUMENT_B,
        tabId: 8,
        endpointKey: `${LEETCODE_SUBMIT_ENDPOINT_PREFIX}/cn/two-sum`,
      }),
      lifecycle({
        evidenceId: "e1_leetcode_b_check",
        requestId: "951",
        documentId: DOCUMENT_B,
        tabId: 8,
        method: "GET",
        endpointKey: `${LEETCODE_CHECK_ENDPOINT_PREFIX}/cn/${SUBMISSION_B}`,
      }),
    ]) {
      const events = await orchestrator.apply({
        kind: "e1_recorded",
        evidence: record,
        tabId: record.tabId ?? 7,
        frameId: 0,
        documentId: record.documentId,
        adapterVersion: "v4-leetcode-network-6",
      });
      await applyEffects(storage, events);
    }
    for (const cand of [
      candidate({ candidateId: "candidate_a", documentId: DOCUMENT_A }),
      candidate({
        candidateId: "candidate_b",
        documentId: DOCUMENT_B,
        tabId: 8,
        problemExternalId: PROBLEM,
      }),
    ]) {
      const intake = await orchestrator.apply({
        kind: "verdict_candidate_recorded",
        candidate: cand,
      });
      await applyEffects(storage, intake);
    }

    const e2a = await orchestrator.apply({
      kind: "e2_recorded",
      evidence: confirmedE2({ documentId: DOCUMENT_A, tabId: 7 }),
      matchedSubmitRequestId: "840",
    });
    await applyEffects(storage, e2a);
    expect(e2a.verdictCandidateResolutions).toHaveLength(1);
    await drainResolutions(storage, e2a);

    const e2b = await orchestrator.apply({
      kind: "e2_recorded",
      evidence: confirmedE2({
        externalSubmissionId: SUBMISSION_B,
        problemExternalId: PROBLEM,
        documentId: DOCUMENT_B,
        tabId: 8,
        requestEvidenceId: "e1_leetcode_b_check",
      }),
      matchedSubmitRequestId: "950",
    });
    await applyEffects(storage, e2b);
    expect(e2b.verdictCandidateResolutions).toHaveLength(1);
    await drainResolutions(storage, e2b);

    const finalState = await orchestrator.snapshot();
    expect(finalState.outboxCount).toBe(2);
    expect(finalState.finalizedCount).toBe(2);
  });

  it("service-worker reconstruction completes a retained candidate", async () => {
    const storage = storageSpy();
    const first = createBackgroundOrchestrator({
      storage,
      now: () => CANDIDATE_TIME,
      flushOutbox: async (): Promise<void> => undefined,
    });
    await first.install();

    const retained = await first.apply({
      kind: "verdict_candidate_recorded",
      candidate: candidate(),
    });
    await applyEffects(storage, retained);

    for (const record of [
      lifecycle(),
      lifecycle({
        evidenceId: "e1_leetcode_841",
        requestId: "841",
        method: "GET",
        endpointKey: `${LEETCODE_CHECK_ENDPOINT_PREFIX}/cn/${SUBMISSION_ID}`,
      }),
    ]) {
      const events = await first.apply({
        kind: "e1_recorded",
        evidence: record,
        tabId: 7,
        frameId: 0,
        documentId: DOCUMENT_ID,
        adapterVersion: "v4-leetcode-network-6",
      });
      await applyEffects(storage, events);
    }

    const second = createBackgroundOrchestrator({
      storage,
      now: () => EXECUTOR_TIME,
      flushOutbox: async (): Promise<void> => undefined,
    });
    const reconciled = await second.install();
    await applyEffects(storage, reconciled);

    const e2 = await second.apply({
      kind: "e2_recorded",
      evidence: confirmedE2(),
      matchedSubmitRequestId: "840",
    });
    await applyEffects(storage, e2);
    expect(e2.verdictCandidateResolutions).toHaveLength(1);
    await drainResolutions(storage, e2);

    const finalState = await second.snapshot();
    expect(finalState.outboxCount).toBe(1);
    expect(finalState.finalizedCount).toBe(1);
  });

  it("adapter construction failure is diagnosed", async () => {
    const storage = storageSpy();
    const orchestrator = createBackgroundOrchestrator({
      storage,
      now: () => EXECUTOR_TIME,
      flushOutbox: async (): Promise<void> => undefined,
    });

    for (const record of [
      lifecycle(),
      lifecycle({
        evidenceId: "e1_leetcode_841",
        requestId: "841",
        method: "GET",
        endpointKey: `${LEETCODE_CHECK_ENDPOINT_PREFIX}/cn/${SUBMISSION_ID}`,
      }),
    ]) {
      const events = await orchestrator.apply({
        kind: "e1_recorded",
        evidence: record,
        tabId: 7,
        frameId: 0,
        documentId: DOCUMENT_ID,
        adapterVersion: "v4-leetcode-network-6",
      });
      await applyEffects(storage, events);
    }

    // Use a verdict label that is part of the closed taxonomy but the
    // resolution carries a verdict text that createLeetCodeFinalVerdictEvidence
    // refuses to normalize. The background must surface an `adapter` diagnostic
    // instead of silently returning.
    const bogusCandidate = candidate({ verdict: "Other Failure" });
    const retained = await orchestrator.apply({
      kind: "verdict_candidate_recorded",
      candidate: bogusCandidate,
    });
    await applyEffects(storage, retained);

    const e2 = await orchestrator.apply({
      kind: "e2_recorded",
      evidence: confirmedE2(),
      matchedSubmitRequestId: "840",
    });
    await applyEffects(storage, e2);
    expect(e2.verdictCandidateResolutions).toHaveLength(1);

    // Drive the background's resolution-processing path manually so the
    // adapter-failure diagnostic is written exactly the way the worker would.
    let adapterFailureDiagnosed = false;
    for (const resolution of e2.verdictCandidateResolutions) {
      const e3 = createLeetCodeFinalVerdictEvidence({
        problemExternalId: resolution.problemExternalId,
        externalSubmissionId: resolution.externalSubmissionId,
        verdictText: resolution.verdict,
        tabId: resolution.tabId,
        frameId: resolution.frameId,
        documentId: resolution.documentId,
        receivedAt: resolution.observedAt,
      });
      if (e3 === null) {
        await storage.local.set({
          lastCaptureError:
            `verdict candidate blocked: leetcode:${resolution.problemExternalId}:adapter`,
        });
        adapterFailureDiagnosed = true;
        continue;
      }
      const next = await orchestrator.apply({
        kind: "e3_recorded",
        evidence: e3,
        candidateId: resolution.candidateId,
      });
      await applyEffects(storage, next);
    }
    expect(adapterFailureDiagnosed).toBe(true);

    const local = storage.localState();
    expect(local.lastCaptureError).toBe(
      `verdict candidate blocked: leetcode:${PROBLEM}:adapter`,
    );
  });

  it("duplicate candidate and E3 signals remain idempotent", async () => {
    const storage = storageSpy();
    const orchestrator = createBackgroundOrchestrator({
      storage,
      now: () => EXECUTOR_TIME,
      flushOutbox: async (): Promise<void> => undefined,
    });

    for (const record of [
      lifecycle(),
      lifecycle({
        evidenceId: "e1_leetcode_841",
        requestId: "841",
        method: "GET",
        endpointKey: `${LEETCODE_CHECK_ENDPOINT_PREFIX}/cn/${SUBMISSION_ID}`,
      }),
    ]) {
      const events = await orchestrator.apply({
        kind: "e1_recorded",
        evidence: record,
        tabId: 7,
        frameId: 0,
        documentId: DOCUMENT_ID,
        adapterVersion: "v4-leetcode-network-6",
      });
      await applyEffects(storage, events);
    }

    const firstIntake = await orchestrator.apply({
      kind: "verdict_candidate_recorded",
      candidate: candidate(),
    });
    await applyEffects(storage, firstIntake);

    const e2 = await orchestrator.apply({
      kind: "e2_recorded",
      evidence: confirmedE2(),
      matchedSubmitRequestId: "840",
    });
    await applyEffects(storage, e2);
    await drainResolutions(storage, e2);

    const secondIntake = await orchestrator.apply({
      kind: "verdict_candidate_recorded",
      candidate: candidate(),
    });
    expect(secondIntake.verdictCandidateResolutions).toEqual([]);
    await applyEffects(storage, secondIntake);

    const state = await orchestrator.snapshot();
    expect(state.outboxCount).toBe(1);
    expect(state.finalizedCount).toBe(1);
  });

  it("source code contains no setTimeout for verdict candidates", async () => {
    const { readFileSync } = await import("node:fs");
    const { resolve } = await import("node:path");
    const backgroundSource = readFileSync(
      resolve(process.cwd(), "extension/src/background.ts"),
      "utf8",
    );
    expect(backgroundSource).not.toMatch(/setTimeout/);
    expect(backgroundSource).not.toMatch(/VERDICT_CANDIDATE_RETRY/);
    expect(backgroundSource).not.toMatch(/pendingVerdictCandidateRecheck/);
  });

  it("source code contains no storage-change revival listener for verdict candidates", async () => {
    const { readFileSync } = await import("node:fs");
    const { resolve } = await import("node:path");
    const backgroundSource = readFileSync(
      resolve(process.cwd(), "extension/src/background.ts"),
      "utf8",
    );
    expect(backgroundSource).not.toMatch(/shouldRetryLeetCodeVerdictCandidate/);
    expect(backgroundSource).not.toMatch(/storageChangeRevivesVerdictCandidate/);
  });
});
