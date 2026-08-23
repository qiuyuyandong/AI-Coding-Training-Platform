// @vitest-environment node

import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  buildStageSequence,
  buildStageSequenceEntry,
  classifyRejectedStorageBatch,
  storageKeyDiagnosticListener,
  storageKeyDiagnosticListenerSource,
  validateDiagnosticOutputPath,
  writeDiagnosticOutputFile,
} from "../../scripts/v4-live-observation-diagnostic.mjs";

const LOCAL_KEYS = [
  "confirmedSubmissions",
  "confirmedSubmissionTombstones",
  "captureOutbox",
  "captureQuarantine",
  "lastCaptureError",
  "lastSuccessfulCaptureAt",
];

const SESSION_KEYS = [
  "uiHints",
  "transientE1",
  "transientPageContexts",
  "transientUnmatchedE3",
  "transientVerdictCandidates",
  "transientAmbiguityDiagnostics",
  "contentIngressReady",
  "contentIngressDiagnostics",
  "leetcodeEndpointDiagnostics",
];

const IGNORED_LOCAL_KEYS = [
  "installationId",
  "captureCredential",
  "captureCredentialVersion",
  "captureEnabled",
  "captureEndpoint",
  "captureProtocolVersion",
  "lastDeliveredAttemptId",
  "lastDeliveredAttemptStatus",
  "pairedAt",
  "v4ClickIntentMigration",
  "discardedPreBundleEventCount",
  "preBundleQueueDiscardedAt",
  "pendingSubmissionIntents",
  "eventQueue",
  "outbox",
  "quarantine",
];

const IGNORED_SESSION_KEYS = [
  "b3WitnessState",
  "captureRecoveryRetryAttempt",
  "characterizationSession",
  "webRequestSpikeMarkers",
];

const classify = (area: string, changes: unknown) => classifyRejectedStorageBatch(
  area,
  changes,
  LOCAL_KEYS,
  SESSION_KEYS,
  IGNORED_LOCAL_KEYS,
  IGNORED_SESSION_KEYS,
);

describe("V4 live observation storage-key diagnostic", () => {
  it("classifies one out-of-allowlist session key by name only", () => {
    expect(classify(
      "session",
      { hostileUnknownKey: { newValue: "must not be read" } },
    )).toEqual({
      ok: true,
      rejected: { area: "session", keys: ["hostileUnknownKey"] },
    });
  });

  it("reports no rejection for a batch inside trigger or ignore lists", () => {
    expect(classify("session", { b3WitnessState: { newValue: {} } })).toEqual({ ok: true });
    expect(classify("local", { pairedAt: { newValue: {} } })).toEqual({ ok: true });
    expect(classify("session", { uiHints: [], transientE1: [] })).toEqual({ ok: true });
  });

  it("sorts multiple rejected keys and classifies the local area", () => {
    const changes: Record<string, unknown> = {};
    changes.hostileKeyA = {};
    changes.hostileKeyB = {};
    const result = classify("local", changes);
    expect(result).toEqual({
      ok: true,
      rejected: { area: "local", keys: ["hostileKeyA", "hostileKeyB"] },
    });
  });

  it("reports no rejection for an all-allowlisted batch", () => {
    expect(classify("session", { uiHints: [], transientE1: [] })).toEqual({ ok: true });
  });

  it("fails closed on invalid area, non-object changes, or missing allowlists", () => {
    expect(classify("sync", {})).toEqual({ ok: false, reason: "observer_value_rejected" });
    expect(classify("session", null)).toEqual({ ok: false, reason: "observer_value_rejected" });
    expect(classifyRejectedStorageBatch("session", {}, LOCAL_KEYS, [42], IGNORED_LOCAL_KEYS, IGNORED_SESSION_KEYS))
      .toEqual({ ok: false, reason: "observer_value_rejected" });
  });

  it("fails closed on unsafe or excessive key names without reading values", () => {
    expect(classify("session", { "bad key!": {} }))
      .toEqual({ ok: false, reason: "observer_value_rejected" });
    const excessive: Record<string, unknown> = {};
    for (let index = 0; index < 33; index += 1) excessive[`extraKey${index}`] = {};
    expect(classify("session", excessive))
      .toEqual({ ok: false, reason: "observer_value_rejected" });
  });

  it("never reads change values or oldValue/newValue getters", () => {
    let reads = 0;
    const hostile: Record<string, unknown> = {};
    Object.defineProperty(hostile, "b3WitnessState", {
      enumerable: true,
      get() {
        reads += 1;
        throw new Error("value was read");
      },
    });
    const result = classify("session", hostile);
    expect(result).toEqual({ ok: true });
    expect(reads).toBe(0);
  });

  it("emits only unknown key names from the injected listener and ignores approved and ignored batches", async () => {
    const events: unknown[] = [];
    const listeners: ((value: Record<string, unknown>, storageArea: string) => void)[] = [];
    const priorWindow = Reflect.get(globalThis, "window");
    const priorChrome = Reflect.get(globalThis, "chrome");
    Reflect.set(globalThis, "window", { __v4ObservationEvent: (event: unknown) => events.push(event) });
    Reflect.set(globalThis, "chrome", {
      storage: { onChanged: { addListener: (listener: (value: Record<string, unknown>, storageArea: string) => void) => listeners.push(listener) } },
    });
    try {
      storageKeyDiagnosticListener({
        localKeys: LOCAL_KEYS,
        sessionKeys: SESSION_KEYS,
        ignoredLocalKeys: IGNORED_LOCAL_KEYS,
        ignoredSessionKeys: IGNORED_SESSION_KEYS,
      });
      let valueReads = 0;
      const hostile: Record<string, unknown> = {};
      Object.defineProperty(hostile, "newValue", {
        enumerable: true,
        get() {
          valueReads += 1;
          throw new Error("newValue was read");
        },
      });
      listeners[0]?.({ hostileUnknownKey: hostile, uiHints: { newValue: [] } }, "session");
      listeners[0]?.({ b3WitnessState: hostile }, "session");
      listeners[0]?.({ uiHints: { newValue: [] } }, "session");
      listeners[0]?.({ "bad key!": {} }, "session");
      await new Promise((complete) => setTimeout(complete, 0));
      expect(events).toEqual([
        { type: "observer_storage_key_diagnostic", area: "session", keys: ["hostileUnknownKey"] },
      ]);
      expect(valueReads).toBe(0);
    } finally {
      Reflect.set(globalThis, "window", priorWindow);
      Reflect.set(globalThis, "chrome", priorChrome);
    }
  });

  it("keeps the diagnostic source self-contained and value-free", () => {
    const source = storageKeyDiagnosticListenerSource();
    expect(source.startsWith("(")).toBe(true);
    expect(source).not.toContain("newValue");
    expect(source).not.toContain("oldValue");
    expect(source).not.toContain("import ");
  });

  it("accepts only a safe diagnostic output path", () => {
    const root = mkdtempSync(join(tmpdir(), "v4-diag-path-root-"));
    const outside = mkdtempSync(join(tmpdir(), "v4-diag-path-outside-"));
    try {
      expect(validateDiagnosticOutputPath(join(root, "out", "run-storage-key-diagnostic.json"), root))
        .toEqual({ ok: true });
      expect(validateDiagnosticOutputPath(join(root, "run-ready.json"), root))
        .toEqual({ ok: false, reason: "observer_diagnostic_path_rejected" });
      expect(validateDiagnosticOutputPath(join(outside, "run-storage-key-diagnostic.json"), root))
        .toEqual({ ok: false, reason: "observer_diagnostic_path_rejected" });
      const linkParent = join(root, "linked");
      mkdirSync(outside, { recursive: true });
      symlinkSync(outside, linkParent, "junction");
      expect(validateDiagnosticOutputPath(join(linkParent, "run-storage-key-diagnostic.json"), root))
        .toEqual({ ok: false, reason: "observer_diagnostic_path_rejected" });
      const directoryTarget = join(root, "dir-target-storage-key-diagnostic.json");
      mkdirSync(directoryTarget);
      expect(validateDiagnosticOutputPath(directoryTarget, root))
        .toEqual({ ok: false, reason: "observer_diagnostic_path_rejected" });
    } finally {
      rmSync(root, { recursive: true, force: true });
      rmSync(outside, { recursive: true, force: true });
    }
  });

  it("writes the diagnostic payload or fails without throwing", () => {
    const root = mkdtempSync(join(tmpdir(), "v4-diag-write-root-"));
    try {
      const target = join(root, "nested", "run-storage-key-diagnostic.json");
      const writeResult = writeDiagnosticOutputFile(target, {
        schemaVersion: 1,
        note: "DIAGNOSTIC, NOT A READY RECEIPT",
        rejectedBatches: [{ area: "session", keys: ["b3WitnessState"] }],
      });
      expect(writeResult).toEqual({ ok: true });
      expect(JSON.parse(readFileSync(target, "utf8")).rejectedBatches).toEqual([
        { area: "session", keys: ["b3WitnessState"] },
      ]);
      const blockedParent = join(root, "parent-is-a-file");
      writeFileSync(blockedParent, "file", "utf8");
      expect(writeDiagnosticOutputFile(join(blockedParent, "x-storage-key-diagnostic.json"), {})).toEqual({
        ok: false,
        reason: "observer_evidence_write_failed",
      });
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("keeps diagnostic write failures out of the terminal path", () => {
    const runner = readFileSync("scripts/v4-live-observation.mjs", "utf8");
    const writeStart = runner.indexOf("const writeDiagnosticOutput");
    const recordDiagnosticStart = runner.indexOf("const recordDiagnosticBatch");
    expect(writeStart).toBeGreaterThan(-1);
    expect(recordDiagnosticStart).toBeGreaterThan(writeStart);
    const body = runner.slice(writeStart, recordDiagnosticStart);
    expect(body).toContain("STORAGE_KEY_DIAGNOSTIC_ERROR=observer_evidence_write_failed");
    expect(body).not.toContain("terminal(");
    expect(existsSync(resolve(process.cwd(), "scripts", "v4-live-observation-diagnostic.mjs"))).toBe(true);
  });

  it("RED: builds one closed stage-sequence entry from a bounded projection", () => {
    const projection = {
      schemaVersion: 1,
      stage: "browse_only",
      causalGrade: "UNRESOLVED",
      verdict: "PROFILE_UNRESOLVED",
      url: "https://must.not.leak",
      timestamp: "2026-08-16T00:00:00.000Z",
      facts: {
        authorizedActions: 1,
        exactSubmitCorroboration: 0,
        stableResultLifecycles: 0,
        e2Confirmed: 0,
        e3Finalized: 0,
        waiting: 0,
        outbox: 0,
        quarantine: 0,
        databaseDelta: { captureEvents: 0, trainingSessions: 0, trainingAttempts: 0 },
      },
    };
    expect(buildStageSequenceEntry(1, projection)).toEqual({
      seq: 1,
      stage: "browse_only",
      authorizedActions: 1,
      exactSubmitCorroboration: 0,
      stableResultLifecycles: 0,
      e2Confirmed: 0,
      e3Finalized: 0,
    });
    expect(buildStageSequenceEntry(0, projection)).toBeUndefined();
    expect(buildStageSequenceEntry(1, { ...projection, stage: "hostile_stage" })).toBeUndefined();
    expect(buildStageSequenceEntry(1, { ...projection, facts: { ...projection.facts, authorizedActions: -1 } })).toBeUndefined();
  });

  it("RED: sequences history entries, appends a distinct final stage, and caps at 64", () => {
    const projection = (stage: string, seqOffset: number) => ({
      schemaVersion: 1,
      stage,
      facts: {
        authorizedActions: seqOffset,
        exactSubmitCorroboration: 0,
        stableResultLifecycles: 0,
        e2Confirmed: 0,
        e3Finalized: 0,
      },
    });
    const sequence = buildStageSequence(
      [projection("browse_only", 0), projection("e1_observed", 1)],
      projection("e1_observed", 1),
    );
    expect(sequence.entries).toEqual([
      { seq: 1, stage: "browse_only", authorizedActions: 0, exactSubmitCorroboration: 0, stableResultLifecycles: 0, e2Confirmed: 0, e3Finalized: 0 },
      { seq: 2, stage: "e1_observed", authorizedActions: 1, exactSubmitCorroboration: 0, stableResultLifecycles: 0, e2Confirmed: 0, e3Finalized: 0 },
    ]);
    expect(sequence.capped).toBe(false);
    const appended = buildStageSequence(
      [projection("browse_only", 0)],
      projection("e1_observed", 1),
    );
    expect(appended.entries.map((entry) => entry.stage)).toEqual(["browse_only", "e1_observed"]);
    const long = buildStageSequence(
      Array.from({ length: 70 }, (_, index) => projection("browse_only", index)),
      projection("e1_observed", 70),
    );
    expect(long.entries).toHaveLength(64);
    expect(long.capped).toBe(true);
  });

  it("RED: wires the stage sequence and refresh into the runner and keeps the observer untouched", () => {
    const runner = readFileSync("scripts/v4-live-observation.mjs", "utf8");
    const observer = readFileSync("scripts/v4-live-observation-observer.mjs", "utf8");
    expect(runner).toContain('argumentValue(args, "--diagnostic-refresh-after-ms")');
    expect(runner).toContain("platformPage.reload(");
    expect(runner).toContain("stageSequence");
    const writeDiagnosticStart = runner.indexOf("const writeDiagnosticOutput");
    const recordDiagnosticStart = runner.indexOf("const recordDiagnosticBatch");
    expect(runner.slice(writeDiagnosticStart, recordDiagnosticStart)).toContain("stageSequence");
    const readyBranchStart = runner.indexOf('process.stdout.write("ACTION_AUTHORIZED=0');
    const readyEvidenceIndex = runner.indexOf('writeEvidence("ready_only"');
    expect(readyEvidenceIndex).toBeGreaterThan(-1);
    expect(readyBranchStart).toBeGreaterThan(readyEvidenceIndex);
    expect(runner.slice(readyEvidenceIndex, readyBranchStart)).toContain("writeDiagnosticOutput(true)");
    expect(observer).not.toContain("stageSequence");
    expect(observer).not.toContain("buildStageSequence");
    expect(observer).not.toContain("diagnostic-refresh");
  });

  it("RED: keeps one closed stage-rejection code in diagnostic output only", () => {
    const runner = readFileSync("scripts/v4-live-observation.mjs", "utf8");
    const observer = readFileSync("scripts/v4-live-observation-observer.mjs", "utf8");
    expect(observer).toContain("diagnosticCode");
    expect(runner).toContain("stageRejection");
    expect(runner).toContain('recordStageRejection("snapshot_before_arm")');
    const diagnosticStart = runner.indexOf("const writeDiagnosticOutput");
    const evidenceStart = runner.indexOf("const writeEvidence");
    const failureStart = runner.indexOf("const recordFailure");
    expect(diagnosticStart).toBeGreaterThan(-1);
    expect(evidenceStart).toBeGreaterThan(diagnosticStart);
    expect(failureStart).toBeGreaterThan(evidenceStart);
    expect(runner.slice(diagnosticStart, evidenceStart)).toContain("stageRejection");
    expect(runner.slice(evidenceStart, failureStart)).not.toContain("stageRejection");
  });

  it("wires the runner opt-in without touching the reviewed observer module", () => {
    const runner = readFileSync("scripts/v4-live-observation.mjs", "utf8");
    const observer = readFileSync("scripts/v4-live-observation-observer.mjs", "utf8");
    expect(runner).toContain('argumentValue(args, "--diagnostic-storage-keys")');
    expect(runner).toContain("validateDiagnosticOutputPath, writeDiagnosticOutputFile");
    expect(runner).toContain('from "./v4-live-observation-diagnostic.mjs";');
    expect(runner).toContain('event.type === "observer_storage_key_diagnostic"');
    expect(runner).toContain("DIAGNOSTIC, NOT A READY RECEIPT, NOT ACCEPTANCE EVIDENCE");
    expect(runner).toContain("await popup.evaluate(storageKeyDiagnosticListener, {");
    expect(runner).toContain('resolve("scripts", "v4-live-observation-diagnostic.mjs")');
    expect(runner).toContain('validateDiagnosticOutputPath(candidatePath, resolve("."))');
    expect(runner).toContain("STORAGE_KEY_DIAGNOSTIC_ERROR=observer_evidence_write_failed");
    expect(observer).not.toContain("storageKeyDiagnosticListener");
    expect(observer).not.toContain("observer_storage_key_diagnostic");
    const evidenceWriteIndex = runner.indexOf("const writeEvidence");
    const recordFailureIndex = runner.indexOf("const recordFailure");
    expect(evidenceWriteIndex).toBeGreaterThan(-1);
    expect(recordFailureIndex).toBeGreaterThan(evidenceWriteIndex);
    expect(runner.slice(evidenceWriteIndex, recordFailureIndex))
      .not.toContain("rejectedBatches");
    expect(runner.slice(evidenceWriteIndex, recordFailureIndex))
      .not.toContain("diagnosticBatches");
  });

  it("requires the closed product state before any READY-only platform navigation", () => {
    const runner = readFileSync("scripts/v4-live-observation.mjs", "utf8");
    expect(runner).toContain("async function assertCaptureReadyPreflight(popup)");
    expect(runner).toContain('Reflect.get(state, "captureEndpoint") !== canonicalEndpoint');
    expect(runner).toContain('Reflect.get(state, "provenanceLevel") !== "extension_paired"');
    expect(runner).toContain('Reflect.get(recovery, "state") !== "ready"');
    expect(runner).toContain('Reflect.get(state, "waitingCount") !== 0');
    expect(runner).toContain('Reflect.get(state, "outboxCount") !== 0');
    expect(runner).toContain('Reflect.get(state, "quarantineCount") !== 0');
    expect(runner).not.toContain("async function pairExtension(popup)");
    expect(runner).not.toContain("/api/capture/pairing-codes");
    const preflight = runner.indexOf("await assertCaptureReadyPreflight(popup)");
    const navigation = runner.indexOf("await platformPage.goto(startUrl");
    expect(preflight).toBeGreaterThan(-1);
    expect(navigation).toBeGreaterThan(preflight);
  });
});
