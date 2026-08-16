import { describe, expect, it } from "vitest";
import { replayLeetCodeConfirmedEpochs, type SubmitEpochReplayStorage } from "@/extension/src/submitEpochReplay";
import type { ConfirmedSubmissionRecord } from "@/extension/src/confirmedSubmissionStorage";
import type { TransientE1Lifecycle } from "@/extension/src/transientEvidenceStorage";
import { createCaptureContentRuntime } from "@/extension/src/contentRuntime";

const NOW = "2026-08-10T12:00:00.000Z";
const DOCUMENT_ID = "doc-live";
const SUBMIT_ENDPOINT = "leetcode/submit/cn/two-sum";

const lifecycle = (overrides: Partial<TransientE1Lifecycle> = {}): TransientE1Lifecycle => ({
  schemaVersion: 1,
  tier: "E1",
  kind: "request_lifecycle",
  evidence: {
    schemaVersion: 1,
    evidenceId: "e1-840",
    platform: "leetcode",
    tier: "E1",
    kind: "request_observed",
    receivedAt: "2026-08-10T11:59:01.000Z",
    tabId: 7,
    frameId: 0,
    documentId: DOCUMENT_ID,
    adapterVersion: "v4-leetcode-network-6",
    apiTimeStamp: 1000,
    requestId: "840",
    method: "POST",
    endpointKey: SUBMIT_ENDPOINT,
    resourceType: "xmlhttprequest",
    lifecycle: "completed",
    statusCode: 200,
  },
  outcome: "matched",
  stableSubmissionId: "leetcode:cn/920",
  rejectionReason: null,
  receivedAt: "2026-08-10T11:59:01.000Z",
  ...overrides,
});

const resultLifecycle = (overrides: Partial<TransientE1Lifecycle> = {}): TransientE1Lifecycle => ({
  ...lifecycle(),
  evidence: {
    ...lifecycle().evidence,
    evidenceId: "e1-result-842",
    requestId: "842",
    method: "GET",
    endpointKey: "leetcode/result/cn/920",
    receivedAt: "2026-08-10T11:59:02.000Z",
  },
  receivedAt: "2026-08-10T11:59:02.000Z",
  ...overrides,
});

const confirmed = (overrides: Partial<ConfirmedSubmissionRecord> = {}): ConfirmedSubmissionRecord => ({
  schemaVersion: 1,
  status: "confirmed",
  platform: "leetcode",
  problemExternalId: "two-sum",
  externalSubmissionId: "cn/920",
  confirmedAt: "2026-08-10T11:59:02.000Z",
  storageKey: "leetcode:cn/920",
  lastE3At: "2026-08-10T11:59:02.000Z",
  ...overrides,
});

function pickKeys(values: Record<string, unknown>, keys: readonly string[]): Record<string, unknown> {
  const selected: Record<string, unknown> = {};
  for (const key of keys) {
    if (Object.prototype.hasOwnProperty.call(values, key)) selected[key] = values[key];
  }
  return selected;
}

function storageFor(
  localValues: Record<string, unknown>,
  sessionValues: Record<string, unknown>,
): SubmitEpochReplayStorage {
  return {
    local: { get: async (keys) => pickKeys(localValues, keys) },
    session: { get: async (keys) => pickKeys(sessionValues, keys) },
  };
}

describe("submitEpochReplay", () => {
  it("freshly selects one exact unfinalized E2 and delivers only CONFIRMED", async () => {
    const delivered: string[] = [];
    const result = await replayLeetCodeConfirmedEpochs({
      storage: storageFor(
        {
          confirmedSubmissions: [confirmed()],
          confirmedSubmissionTombstones: [],
        },
        { transientE1: [lifecycle()] },
      ),
      now: () => NOW,
      deliver: async (replay) => {
        expect(replay.documentId).toBe(DOCUMENT_ID);
        delivered.push("LEETCODE_SUBMIT_EPOCH_CONFIRMED");
      },
    });
    expect(result).toHaveLength(1);
    expect(delivered).toEqual(["LEETCODE_SUBMIT_EPOCH_CONFIRMED"]);
  });

  it("re-reads finalized state and sends no replay after candidate E3 recovery", async () => {
    let localValues: Record<string, unknown> = {
      confirmedSubmissions: [confirmed()],
      confirmedSubmissionTombstones: [],
    };
    const storage: SubmitEpochReplayStorage = {
      local: { get: async (keys) => pickKeys(localValues, keys) },
      session: { get: async (keys) => pickKeys({ transientE1: [lifecycle()] }, keys) },
    };
    let deliveryCount = 0;
    const input = {
      storage,
      now: () => NOW,
      deliver: async (): Promise<void> => {
        deliveryCount += 1;
      },
    };
    await replayLeetCodeConfirmedEpochs(input);
    localValues = {
      confirmedSubmissions: [confirmed({ finalizedAt: "2026-08-10T12:00:00.000Z" })],
      confirmedSubmissionTombstones: [{
        submissionKey: "leetcode:cn/920",
        finalizedAt: "2026-08-10T12:00:00.000Z",
        expiresAt: "2026-09-10T12:00:00.000Z",
      }],
    };
    const second = await replayLeetCodeConfirmedEpochs(input);
    expect(second).toEqual([]);
    expect(deliveryCount).toBe(1);
  });

  it("replays a result root only with its complete ActionEpoch baseline proof", async () => {
    const hint = {
      schemaVersion: 1,
      tier: "E0",
      kind: "ui_hint",
      platform: "leetcode",
      problemExternalId: "two-sum",
      observedAt: "2026-08-10T11:59:01.500Z",
      sourceDocumentId: DOCUMENT_ID,
    } as const;
    const historical = resultLifecycle({
      evidence: {
        ...resultLifecycle().evidence,
        evidenceId: "e1-result-919",
        requestId: "919",
        endpointKey: "leetcode/result/cn/919",
        receivedAt: "2026-08-10T11:59:01.000Z",
      },
      outcome: "pending",
      stableSubmissionId: null,
      receivedAt: "2026-08-10T11:59:01.000Z",
    });
    const withProof = await replayLeetCodeConfirmedEpochs({
      storage: storageFor(
        { confirmedSubmissions: [confirmed()], confirmedSubmissionTombstones: [] },
        { transientE1: [historical, resultLifecycle()], uiHints: [hint] },
      ),
      now: () => NOW,
      deliver: async (replay) => {
        expect(replay).toMatchObject({
          submitRequestId: "842",
          actionObservedAt: hint.observedAt,
          baselineSubmissionIds: ["cn/919"],
        });
      },
    });
    expect(withProof).toHaveLength(1);

    const withoutProof = await replayLeetCodeConfirmedEpochs({
      storage: storageFor(
        { confirmedSubmissions: [confirmed()], confirmedSubmissionTombstones: [] },
        { transientE1: [resultLifecycle()] },
      ),
      now: () => NOW,
      deliver: async () => { throw new Error("must not replay without ActionEpoch proof"); },
    });
    expect(withoutProof).toEqual([]);

    const baselineReplay = await replayLeetCodeConfirmedEpochs({
      storage: storageFor(
        { confirmedSubmissions: [confirmed()], confirmedSubmissionTombstones: [] },
        {
          transientE1: [
            resultLifecycle({
              evidence: {
                ...resultLifecycle().evidence,
                evidenceId: "e1-result-920-baseline",
                requestId: "920-baseline",
                receivedAt: "2026-08-10T11:59:01.000Z",
              },
              outcome: "pending",
              stableSubmissionId: null,
              receivedAt: "2026-08-10T11:59:01.000Z",
            }),
            resultLifecycle(),
          ],
          uiHints: [hint],
        },
      ),
      now: () => NOW,
      deliver: async () => { throw new Error("must not replay a baseline stable ID"); },
    });
    expect(baselineReplay).toEqual([]);

    const simultaneous = await replayLeetCodeConfirmedEpochs({
      storage: storageFor(
        { confirmedSubmissions: [confirmed()], confirmedSubmissionTombstones: [] },
        {
          transientE1: [resultLifecycle()],
          uiHints: [{ ...hint, observedAt: "2026-08-10T11:59:02.000Z" }],
        },
      ),
      now: () => NOW,
      deliver: async () => { throw new Error("must not replay a non-post-action result"); },
    });
    expect(simultaneous).toEqual([]);
  });

  it("preserves legacy check-root replay without result-root proof", async () => {
    const check = resultLifecycle({
      evidence: {
        ...resultLifecycle().evidence,
        evidenceId: "e1-check-842",
        requestId: "check-842",
        endpointKey: "leetcode/check/cn/920",
      },
    });
    const result = await replayLeetCodeConfirmedEpochs({
      storage: storageFor(
        { confirmedSubmissions: [confirmed()], confirmedSubmissionTombstones: [] },
        { transientE1: [check] },
      ),
      now: () => NOW,
      deliver: async (replay) => {
        expect(replay).toMatchObject({ submitRequestId: "check-842" });
        expect(replay.actionObservedAt).toBeUndefined();
      },
    });
    expect(result).toHaveLength(1);
  });

  it("keeps a surviving historical result surface fail-closed across worker replay", async () => {
    let surface: Element = document.createElement("div");
    let runtimeNow = "2026-08-10T11:59:01.500Z";
    const runtime = createCaptureContentRuntime({
      detectProblem: () => ({
        platform: "leetcode",
        problemExternalId: "two-sum",
        problemTitle: "Two Sum",
        canonicalUrl: "https://leetcode.cn/problems/two-sum/",
      }),
      detectVerdict: () => ({ verdict: "Accepted", verdictSurface: surface }),
      exactResultPage: () => false,
      now: () => runtimeNow,
    });
    runtime.start();
    runtime.uiHintObserved();
    surface = document.createElement("div");
    runtimeNow = "2026-08-10T11:59:03.000Z";
    runtime.documentMutated();

    await replayLeetCodeConfirmedEpochs({
      storage: storageFor(
        { confirmedSubmissions: [confirmed()], confirmedSubmissionTombstones: [] },
        {
          transientE1: [resultLifecycle()],
          uiHints: [{
            schemaVersion: 1,
            tier: "E0",
            kind: "ui_hint",
            platform: "leetcode",
            problemExternalId: "two-sum",
            observedAt: "2026-08-10T11:59:01.500Z",
            sourceDocumentId: DOCUMENT_ID,
          }],
        },
      ),
      now: () => NOW,
      deliver: async (replay) => {
        expect(runtime.controlMessageReceived({
          type: "LEETCODE_SUBMIT_EPOCH_CONFIRMED",
          schemaVersion: 1,
          platform: "leetcode",
          problemExternalId: replay.problemExternalId,
          submitRequestId: replay.submitRequestId,
          confirmedAt: replay.confirmedAt,
          actionObservedAt: replay.actionObservedAt,
          baselineSubmissionIds: replay.baselineSubmissionIds,
        })).toEqual([]);
      },
    });
    expect(runtime.takeControlDiagnostic()).toBe("epoch_baseline_missing");
  });

  it("delivers nothing for missing or non-unique document identity", async () => {
    let deliveryCount = 0;
    const deliver = async (): Promise<void> => {
      deliveryCount += 1;
    };
    const baseLocal = {
      confirmedSubmissions: [confirmed()],
      confirmedSubmissionTombstones: [],
    };
    const missingDocument = lifecycle({
      evidence: { ...lifecycle().evidence, documentId: "" },
    });
    const missingResult = await replayLeetCodeConfirmedEpochs({
      storage: storageFor(baseLocal, { transientE1: [missingDocument] }),
      now: () => NOW,
      deliver,
    });
    const duplicateDocument = lifecycle({
      evidence: { ...lifecycle().evidence, evidenceId: "e1-841", requestId: "841", documentId: "doc-other" },
    });
    const duplicateResult = await replayLeetCodeConfirmedEpochs({
      storage: storageFor(baseLocal, { transientE1: [lifecycle(), duplicateDocument] }),
      now: () => NOW,
      deliver,
    });
    expect(missingResult).toEqual([]);
    expect(duplicateResult).toEqual([]);
    expect(deliveryCount).toBe(0);
  });

  it("does not synthesize STARTED when exact delivery reports a missing baseline", async () => {
    const sentTypes: string[] = [];
    await replayLeetCodeConfirmedEpochs({
      storage: storageFor(
        { confirmedSubmissions: [confirmed()], confirmedSubmissionTombstones: [] },
        { transientE1: [lifecycle()] },
      ),
      now: () => NOW,
      deliver: async () => {
        sentTypes.push("LEETCODE_SUBMIT_EPOCH_CONFIRMED");
        // The exact content target reports epoch_baseline_missing; replay has
        // no retry path and cannot fabricate a preceding STARTED control.
        return Promise.resolve();
      },
    });
    expect(sentTypes).toEqual(["LEETCODE_SUBMIT_EPOCH_CONFIRMED"]);
    expect(sentTypes).not.toContain("LEETCODE_SUBMIT_EPOCH_STARTED");
  });
});
