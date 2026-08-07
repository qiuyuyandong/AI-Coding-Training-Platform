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
  createLeetCodeTransientVerdictCandidate,
  LEETCODE_CHECK_ENDPOINT_PREFIX,
  LEETCODE_RESULT_ENDPOINT_PREFIX,
  LEETCODE_SUBMIT_ENDPOINT_PREFIX,
  selectLeetCodeResultConfirmation,
} from "@/extension/src/adapters/leetcode/network";
import { readTransientSessionEvidenceState } from "@/extension/src/transientEvidenceStorage";
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

  it("graphql result-distribution full chain: E2 from the adapter drives one bundle", async () => {
    const storage = storageSpy();
    const orchestrator = createBackgroundOrchestrator({
      storage,
      now: () => EXECUTOR_TIME,
      flushOutbox: async (): Promise<void> => undefined,
    });

    // WebRequest E1s: a GraphQL POST submit and the exact result-distribution
    // path that carries the stable numeric submission id. Both are retained by
    // the normal E1 pipeline (what `applyLeetCodeResultConfirmation` reads).
    const graphqlE1: E1RequestObserved = {
      schemaVersion: 1,
      evidenceId: "e1_leetcode_graphql_841",
      platform: "leetcode",
      tier: "E1",
      kind: "request_observed",
      receivedAt: "2026-08-06T11:20:01.500Z",
      tabId: 7,
      frameId: 0,
      documentId: DOCUMENT_ID,
      adapterVersion: "v4-leetcode-network-6",
      requestId: "graphql-841",
      method: "POST",
      endpointKey: "graphql",
      resourceType: "xmlhttprequest",
      lifecycle: "completed",
      apiTimeStamp: 1500.25,
      statusCode: 200,
    };
    const resultE1: E1RequestObserved = {
      ...lifecycle({ method: "GET", requestId: "result-842", statusCode: 200 }),
      evidenceId: "e1_leetcode_result_842",
      receivedAt: NETWORK_TIME,
      endpointKey: `${LEETCODE_RESULT_ENDPOINT_PREFIX}/cn/740553045`,
      apiTimeStamp: 2000.5,
    };
    for (const evidence of [graphqlE1, resultE1]) {
      const effects = await orchestrator.apply({
        kind: "e1_recorded",
        evidence,
        tabId: evidence.tabId,
        frameId: evidence.frameId,
        documentId: evidence.documentId,
        adapterVersion: evidence.adapterVersion,
      });
      await applyEffects(storage, effects);
    }

    // Candidate (from the visible verdict on the final page) arrives before
    // the adapter-driven confirmation.
    const first = await orchestrator.apply({
      kind: "verdict_candidate_recorded",
      candidate: candidate(),
    });
    expect(first.verdictCandidateResolutions).toEqual([]);
    await applyEffects(storage, first);

    // A trusted visible click discovered the problem before the GraphQL POST
    // (`applyLeetCodeResultConfirmation` filters hints by source documentId).
    const hintEffects = await orchestrator.apply({
      kind: "e0_recorded",
      hint: {
        schemaVersion: 1,
        tier: "E0",
        kind: "ui_hint",
        platform: "leetcode",
        problemExternalId: PROBLEM,
        observedAt: "2026-08-06T11:20:01.200Z",
      },
      sourceDocumentId: DOCUMENT_ID,
    });
    await applyEffects(storage, hintEffects);

    // Reproduce `applyLeetCodeResultConfirmation` exactly: read the transient
    // session, find the result lifecycle, gather the GraphQL and problem
    // candidates, then confirm through the adapter-owned constructor.
    const transient = readTransientSessionEvidenceState(storage.sessionState());
    const resultLifecycle = transient.requestLifecycles.find((entry) =>
      entry.evidence.platform === "leetcode"
      && entry.evidence.endpointKey.startsWith(`${LEETCODE_RESULT_ENDPOINT_PREFIX}/`));
    expect(resultLifecycle).toBeDefined();
    if (resultLifecycle === undefined) return;
    const graphqlCandidates = transient.requestLifecycles
      .filter((entry) => entry.evidence.platform === "leetcode" && entry.evidence.endpointKey === "graphql")
      .map((entry) => entry.evidence);
    const problemCandidates = transient.uiHints
      .filter((hint) => hint.platform === "leetcode" && hint.sourceDocumentId === resultLifecycle.evidence.documentId)
      .map((hint) => ({
        platform: "leetcode" as const,
        problemExternalId: hint.problemExternalId,
        observedAt: hint.observedAt,
        tabId: resultLifecycle.evidence.tabId,
        frameId: resultLifecycle.evidence.frameId,
        documentId: hint.sourceDocumentId,
      }));
    const confirmation = selectLeetCodeResultConfirmation({
      resultEvidence: resultLifecycle.evidence,
      graphqlCandidates,
      problemCandidates,
    });
    expect(confirmation.kind).toBe("confirmed");
    if (confirmation.kind !== "confirmed") return;

    // The adapter-driven E2 carries the result path's network evidence time.
    const confirmedE2 = confirmation.evidence;
    expect(confirmedE2.receivedAt).toBe(NETWORK_TIME);
    expect(confirmedE2.externalSubmissionId).toBe(SUBMISSION_ID);
    expect(confirmation.matchedSubmitRequestId).toBe("graphql-841");

    const third = await orchestrator.apply({
      kind: "e2_recorded",
      evidence: confirmedE2,
      matchedSubmitRequestId: confirmation.matchedSubmitRequestId,
    });
    expect(third.verdictCandidateResolutions).toHaveLength(1);
    expect(third.verdictCandidateResolutions[0]).toMatchObject({
      candidateId: candidate().candidateId,
      externalSubmissionId: SUBMISSION_ID,
      problemExternalId: PROBLEM,
      verdict: "Accepted",
    });
    await applyEffects(storage, third);

    // E3 finalization: exactly one bundle, one tombstone, no retained candidate.
    await drainResolutions(storage, third);
    const finalState = await orchestrator.snapshot();
    expect(finalState.outboxCount).toBe(1);
    expect(finalState.finalizedCount).toBe(1);
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

  it("adapter construction failure is diagnosed through the orchestrator", async () => {
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

    // Stale persisted state (written before intake rejection existed) can
    // still carry a verdict `createLeetCodeFinalVerdictEvidence` refuses to
    // normalize. The background must route the failure through the
    // orchestrator's `verdict_candidate_blocked` event, never write storage
    // directly.
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
    const resolution = e2.verdictCandidateResolutions[0];
    if (resolution === undefined) throw new Error("resolution missing");

    const e3 = createLeetCodeFinalVerdictEvidence({
      problemExternalId: resolution.problemExternalId,
      externalSubmissionId: resolution.externalSubmissionId,
      verdictText: resolution.verdict,
      tabId: resolution.tabId,
      frameId: resolution.frameId,
      documentId: resolution.documentId,
      receivedAt: resolution.observedAt,
    });
    expect(e3).toBeNull();

    // The background applies the orchestrator event instead of a direct
    // `storage.local.set` (Task 8 review fix).
    const blocked = await orchestrator.apply({
      kind: "verdict_candidate_blocked",
      candidateId: resolution.candidateId,
      platform: "leetcode",
      problemExternalId: resolution.problemExternalId,
    });
    await applyEffects(storage, blocked);
    const diagnostic = `verdict candidate blocked: leetcode:${PROBLEM}:adapter`;
    expect(blocked.persistence.local.some((write) =>
      write.key === "lastCaptureError" && write.value === diagnostic)).toBe(true);
    const local = storage.localState();
    expect(local.lastCaptureError).toBe(diagnostic);
    const session = storage.sessionState();
    expect(session.transientVerdictCandidates).toEqual([]);
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

  it("background routes adapter failure through the orchestrator event, not a direct write", async () => {
    const { readFileSync } = await import("node:fs");
    const { resolve } = await import("node:path");
    const backgroundSource = readFileSync(
      resolve(process.cwd(), "extension/src/background.ts"),
      "utf8",
    );
    expect(backgroundSource).toContain('kind: "verdict_candidate_blocked"');
    expect(backgroundSource).not.toMatch(/verdict candidate blocked/u);
  });

  it("background normalizes verdict text at intake through the shared taxonomy", async () => {
    const { readFileSync } = await import("node:fs");
    const { resolve } = await import("node:path");
    const backgroundSource = readFileSync(
      resolve(process.cwd(), "extension/src/background.ts"),
      "utf8",
    );
    expect(backgroundSource).toContain("createLeetCodeTransientVerdictCandidate");
    expect(backgroundSource).not.toMatch(/candidateId: verdictCandidateIdentity/u);
  });

  it("adapter-produced candidate survives a session write/read round-trip", () => {
    const produced = createLeetCodeTransientVerdictCandidate({
      problemExternalId: PROBLEM,
      verdictText: "Accepted",
      observedAt: CANDIDATE_TIME,
      tabId: 7,
      frameId: 0,
      documentId: DOCUMENT_ID,
      transitionEvidence: "exact_result_document",
    });
    expect(produced).not.toBeNull();
    if (produced === null) return;
    const roundTripped = readTransientSessionEvidenceState({
      transientVerdictCandidates: [produced],
    });
    expect(roundTripped.verdictCandidates).toHaveLength(1);
    expect(roundTripped.verdictCandidates[0]?.candidateId).toBe(produced.candidateId);
    expect(roundTripped.ambiguityDiagnostics).toEqual([]);
  });
});
