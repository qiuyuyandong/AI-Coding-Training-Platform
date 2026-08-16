// @vitest-environment node

import { mkdtempSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  APPROVED_NOWCODER_PATH,
  LOCAL_TRIGGER_KEYS,
  SESSION_TRIGGER_KEYS,
  createObservationTerminalController,
  createStorageObserverController,
  applySafeStorageChange,
  isCanonicalDescendant,
  isExactObserverPageUrl,
  persistentObserverEntrypoint,
  projectD4AcceptanceEvidence,
  projectStageEvidence,
  projectFailureReceipt,
  projectSafeSnapshot,
  reduceObservationSnapshot,
  validateCandidateReceipt,
  validateObservationTarget,
  validateObservationDatabase,
} from "../../scripts/v4-live-observation-observer.mjs";

const emptyLocal = {
  confirmedSubmissions: [],
  confirmedSubmissionTombstones: [],
  captureOutbox: [],
  captureQuarantine: [],
};

const emptySession = {
  uiHints: [],
  transientE1: [],
  transientPageContexts: [],
  transientUnmatchedE3: [],
  transientVerdictCandidates: [],
  transientAmbiguityDiagnostics: [],
  contentIngressReady: [],
  contentIngressDiagnostics: [],
  leetcodeEndpointDiagnostics: [],
};

function confirmed(platform = "leetcode", problemExternalId = "merge-two-sorted-lists", id = "cn/741526004", finalized = false) {
  return {
    schemaVersion: 1,
    status: "confirmed",
    platform,
    problemExternalId,
    externalSubmissionId: id,
    confirmedAt: "2026-08-11T08:10:00.000Z",
    storageKey: `${platform}:${id}`,
    lastE3At: "2026-08-11T08:10:01.000Z",
    ...(finalized ? { finalizedAt: "2026-08-11T08:10:01.000Z" } : {}),
  };
}

function tombstone(platform = "leetcode", id = "cn/741526004") {
  return {
    submissionKey: `${platform}:${id}`,
    finalizedAt: "2026-08-11T08:10:01.000Z",
    expiresAt: "2026-09-10T08:10:01.000Z",
  };
}

const LEETCODE_TARGET = Object.freeze({
  platform: "leetcode" as const,
  problemExternalId: "merge-two-sorted-lists",
});
const NOWCODER_TARGET = Object.freeze({
  platform: "nowcoder" as const,
  problemExternalId: "acm/contest/18839/1001",
});

function uiHint(platform: "leetcode" | "nowcoder", problemExternalId: string) {
  return {
    schemaVersion: 1,
    tier: "E0",
    kind: "ui_hint",
    platform,
    problemExternalId,
    sourceDocumentId: "hostile-document",
    observedAt: "2026-08-11T08:10:00.000Z",
  };
}

function e1Lifecycle(
  platform: "leetcode" | "nowcoder",
  endpointKey: string,
  method: "GET" | "POST",
  lifecycle = "completed",
  extras: Record<string, unknown> = {},
) {
  return {
    schemaVersion: 1,
    tier: "E1",
    kind: "request_lifecycle",
    evidence: {
      schemaVersion: 1,
      evidenceId: "hostile-evidence-id",
      platform,
      tier: "E1",
      kind: "request_observed",
      receivedAt: "2026-08-11T08:10:00.000Z",
      tabId: 1,
      frameId: 0,
      documentId: "hostile-document",
      adapterVersion: "hostile-adapter",
      apiTimeStamp: 1,
      requestId: "hostile-request-id",
      method,
      endpointKey,
      resourceType: "xmlhttprequest",
      lifecycle,
      ...extras,
    },
    outcome: "pending",
    stableSubmissionId: null,
    rejectionReason: null,
    receivedAt: "2026-08-11T08:10:00.000Z",
  };
}

function targetSession(
  uiHints: readonly unknown[] = [],
  transientE1: readonly unknown[] = [],
) {
  return { ...emptySession, uiHints, transientE1 };
}

async function runInjectedChanges(
  changes: readonly Readonly<{ changes: Record<string, unknown>; area: string }>[],
  target?: Readonly<{ platform: "leetcode" | "nowcoder"; problemExternalId: string }>,
  initialSession: Record<string, readonly unknown[]> = emptySession,
) {
  const events: unknown[] = [];
  const listeners: ((value: Record<string, unknown>, storageArea: string) => void)[] = [];
  const priorWindow = Reflect.get(globalThis, "window");
  const priorChrome = Reflect.get(globalThis, "chrome");
  Reflect.set(globalThis, "window", { __v4ObservationEvent: (event: unknown) => events.push(event), addEventListener: () => undefined });
  Reflect.set(globalThis, "chrome", { storage: { local: { get: async () => emptyLocal }, session: { get: async () => initialSession }, onChanged: { addListener: (listener: (value: Record<string, unknown>, storageArea: string) => void) => listeners.push(listener) } } });
  try {
    persistentObserverEntrypoint({ localKeys: LOCAL_TRIGGER_KEYS, sessionKeys: SESSION_TRIGGER_KEYS, target });
    await new Promise((complete) => setTimeout(complete, 0));
    for (const change of changes) {
      listeners[0]?.(change.changes, change.area);
      await new Promise((complete) => setTimeout(complete, 0));
    }
    return events;
  } finally {
    Reflect.set(globalThis, "window", priorWindow);
    Reflect.set(globalThis, "chrome", priorChrome);
  }
}

async function runInjectedChange(
  changes: Record<string, unknown>,
  area: string,
  target?: Readonly<{ platform: "leetcode" | "nowcoder"; problemExternalId: string }>,
  initialSession: Record<string, readonly unknown[]> = emptySession,
) {
  return runInjectedChanges([{ changes, area }], target, initialSession);
}

function leetCodeE2State() {
  const db = { captureEvents: 0, trainingSessions: 0, trainingAttempts: 0 };
  const target = LEETCODE_TARGET;
  const hint = uiHint("leetcode", target.problemExternalId);
  const submit = e1Lifecycle("leetcode", `leetcode/submit/cn/${target.problemExternalId}`, "POST");
  const result = e1Lifecycle("leetcode", "leetcode/result/cn/741526004", "GET");
  const base = projectSafeSnapshot({ local: emptyLocal, session: targetSession() }, target);
  const e0 = projectSafeSnapshot({ local: emptyLocal, session: targetSession([hint]) }, target);
  const e1 = projectSafeSnapshot({ local: emptyLocal, session: targetSession([hint], [submit]) }, target);
  const rooted = projectSafeSnapshot({ local: emptyLocal, session: targetSession([hint], [submit, result]) }, target);
  const e2 = projectSafeSnapshot({ local: { ...emptyLocal, confirmedSubmissions: [confirmed()] }, session: targetSession([hint], [submit, result]) }, target);
  if (!base.ok || !e0.ok || !e1.ok || !rooted.ok || !e2.ok) throw new Error("fixture projection failed");
  const b = reduceObservationSnapshot(undefined, base.value, db, target);
  if (!b.ok || b.value === undefined) throw new Error("baseline reduction failed");
  const s0 = reduceObservationSnapshot(b.value, e0.value, db, target);
  if (!s0.ok || s0.value === undefined) throw new Error("E0 reduction failed");
  const s1 = reduceObservationSnapshot(s0.value, e1.value, db, target);
  if (!s1.ok || s1.value === undefined) throw new Error("E1 reduction failed");
  const rootedState = reduceObservationSnapshot(s1.value, rooted.value, db, target);
  if (!rootedState.ok || rootedState.value === undefined) throw new Error("result-root reduction failed");
  const s2 = reduceObservationSnapshot(rootedState.value, e2.value, db, target);
  if (!s2.ok || s2.value === undefined) throw new Error("E2 reduction failed");
  return { state: s2.value, db, target };
}

describe("V4 live observation storage observer", () => {
  it("uses the exact reviewed local and session trigger allowlists", () => {
    expect(LOCAL_TRIGGER_KEYS).toEqual([
      "confirmedSubmissions",
      "confirmedSubmissionTombstones",
      "captureOutbox",
      "captureQuarantine",
      "lastCaptureError",
      "lastSuccessfulCaptureAt",
    ]);
    expect(SESSION_TRIGGER_KEYS).toEqual([
      "uiHints",
      "transientE1",
      "transientPageContexts",
      "transientUnmatchedE3",
      "transientVerdictCandidates",
      "transientAmbiguityDiagnostics",
      "contentIngressReady",
      "contentIngressDiagnostics",
      "leetcodeEndpointDiagnostics",
    ]);
  });

  it("keeps the legacy observation command forbidden and the D4 command build-free", () => {
    const packageDocument = JSON.parse(readFileSync("package.json", "utf8"));
    const runnerSource = readFileSync("scripts/v4-live-observation.mjs", "utf8");
    expect(packageDocument.scripts["extension:observe"]).toContain("Forbidden");
    expect(packageDocument.scripts["extension:observe:d4"]).toBe("node scripts/v4-live-observation.mjs");
    expect(packageDocument.scripts["extension:observe:d4"]).not.toContain("build");
    expect(runnerSource).toContain('requiredArgument(args, "--candidate-receipt")');
    expect(runnerSource).toContain("createObservationTerminalController");
    expect(runnerSource).toContain('terminal("observer_unexpected_failure")');
    expect(runnerSource).toContain('process.stderr.write("EVIDENCE_ERROR=observer_evidence_write_failed\\n")');
    expect(runnerSource).toContain("await context.close().catch(() => undefined)");
    expect(runnerSource).not.toContain("terminal(error instanceof Error");
    expect(runnerSource).not.toContain("String(evidenceError)");
  });

  it("binds the candidate SHA, exact dist path, and five hashes through one receipt", () => {
    const artifactHashes = {
      "manifest.json": "A".repeat(64),
      "background.js": "B".repeat(64),
      "content.js": "C".repeat(64),
      "popup.js": "D".repeat(64),
      "main-world-bridge.js": "E".repeat(64),
    };
    const expected = {
      candidateSha: "a".repeat(40),
      extensionDist: ".tmp/exact-dist",
      artifactHashes,
    };
    const receipt = {
      schemaVersion: 1,
      candidateSha: expected.candidateSha,
      extensionDist: expected.extensionDist,
      artifactHashes,
    };
    expect(validateCandidateReceipt(receipt, expected)).toEqual({ ok: true });
    expect(validateCandidateReceipt({ ...receipt, candidateSha: "b".repeat(40) }, expected))
      .toEqual({ ok: false, reason: "observer_candidate_receipt_rejected" });
    expect(validateCandidateReceipt({ ...receipt, extensionDist: ".tmp/other-dist" }, expected))
      .toEqual({ ok: false, reason: "observer_candidate_receipt_rejected" });
    expect(validateCandidateReceipt({
      ...receipt,
      artifactHashes: { ...artifactHashes, "popup.js": "F".repeat(64) },
    }, expected)).toEqual({ ok: false, reason: "observer_candidate_receipt_rejected" });
  });

  it("closes the observation context exactly once on the first terminal failure", async () => {
    let closes = 0;
    const rejected: string[] = [];
    const terminal = createObservationTerminalController({
      closeContext: async () => { closes += 1; },
      rejectArmed: (error) => rejected.push(error.message),
    });
    expect(terminal.fail("observer_stage_rejected")).toBe(true);
    expect(terminal.fail("observer_value_rejected")).toBe(false);
    await new Promise((complete) => setTimeout(complete, 0));
    expect(terminal.terminal).toBe(true);
    expect(terminal.reason).toBe("observer_stage_rejected");
    expect(rejected).toEqual(["observer_stage_rejected"]);
    expect(closes).toBe(1);
  });

  it("accepts only LeetCode.cn and the exact approved NowCoder pilot", () => {
    expect(validateObservationTarget("leetcode.cn", "/problemset/").ok).toBe(true);
    expect(validateObservationTarget("ac.nowcoder.com", APPROVED_NOWCODER_PATH).ok).toBe(true);
    expect(validateObservationTarget("ac.nowcoder.com", "/acm/problem/319811").ok).toEqual(false);
    expect(validateObservationTarget("ac.nowcoder.com", "/acm/contest/18839/1002").ok).toEqual(false);
    expect(validateObservationTarget("codeforces.com", "/problemset").ok).toEqual(false);
  });

  it("projects only closed confirmed/tombstone fields and array cardinalities", () => {
    const snapshot = projectSafeSnapshot({
      local: {
        ...emptyLocal,
        confirmedSubmissions: [confirmed()],
        confirmedSubmissionTombstones: [tombstone()],
        captureOutbox: [{ secret: "must not be read" }],
        captureQuarantine: [{ body: "must not be read" }],
        lastSuccessfulCaptureAt: "2026-08-11T08:10:02.000Z",
      },
      session: emptySession,
    });
    expect(snapshot.ok).toBe(true);
    if (!snapshot.ok) return;
    expect(snapshot.value.confirmed).toHaveLength(1);
    expect(snapshot.value.tombstones).toHaveLength(1);
    expect(snapshot.value.outbox).toBe(1);
    expect(snapshot.value.quarantine).toBe(1);
    expect(JSON.stringify(snapshot.value)).not.toContain("secret");
    expect(JSON.stringify(snapshot.value)).not.toContain("body");
  });

  it("rejects malformed or extra confirmed fields without serializing values", () => {
    const result = projectSafeSnapshot({
      local: {
        ...emptyLocal,
        confirmedSubmissions: [{
          ...confirmed(),
          nested: { cookie: "secret" },
        }],
      },
      session: emptySession,
    });
    expect(result).toEqual({ ok: false, reason: "observer_value_rejected" });
  });

  it("rejects a callback batch containing an unsafe key before reading old/new values", async () => {
    const events: unknown[] = [];
    const listeners: ((changes: Record<string, unknown>, area: string) => void)[] = [];
    const storage = {
      local: { get: async () => emptyLocal },
      session: { get: async () => emptySession },
      onChanged: {
        addListener: (listener: (changes: Record<string, unknown>, area: string) => void) => listeners.push(listener),
        removeListener: () => undefined,
      },
    };
    const controller = createStorageObserverController({
      storage,
      emit: (event) => events.push(event),
    });
    await controller.arm();
    expect(events).toContainEqual(expect.objectContaining({ type: "observer_armed" }));

    const unsafe = {};
    Object.defineProperty(unsafe, "newValue", {
      get() {
        throw new Error("unsafe value was read");
      },
    });
    listeners[0]?.({
      captureOutbox: unsafe,
      captureCredential: unsafe,
    }, "local");
    await controller.flush();
    expect(events).toContainEqual({ type: "observer_storage_key_rejected" });
    expect(events).not.toContainEqual(expect.objectContaining({ type: "storage_value_read" }));
  });

  it("rejects unknown capture errors and closes when the persistent page closes", async () => {
    expect(projectSafeSnapshot({
      local: { ...emptyLocal, lastCaptureError: "contains-secret-detail" },
      session: emptySession,
    })).toEqual({ ok: false, reason: "observer_value_rejected" });

    const events: unknown[] = [];
    const storage = {
      local: { get: async () => emptyLocal },
      session: { get: async () => emptySession },
      onChanged: { addListener: () => undefined, removeListener: () => undefined },
    };
    const controller = createStorageObserverController({ storage, emit: (event) => events.push(event) });
    await controller.arm();
    controller.close();
    expect(controller.closed).toBe(true);
    expect(events.at(-1)).toEqual({ type: "observer_page_closed" });
  });

  it("projects approved newValue synchronously without reading oldValue", () => {
    const baseline = projectSafeSnapshot({ local: emptyLocal, session: emptySession });
    expect(baseline.ok).toBe(true);
    if (!baseline.ok) return;
    const change: Record<string, unknown> = { newValue: [{}, {}] };
    Object.defineProperty(change, "oldValue", {
      get() {
        throw new Error("oldValue must never be read");
      },
    });
    const result = applySafeStorageChange(baseline.value, "session", { transientE1: change });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.session.transientE1).toBe(2);

    const unsafe: Record<string, unknown> = {};
    Object.defineProperty(unsafe, "newValue", {
      get() {
        throw new Error("unknown-key newValue must never be read");
      },
    });
    expect(applySafeStorageChange(baseline.value, "local", {
      captureOutbox: { newValue: [] },
      captureCredential: unsafe,
    })).toEqual({ ok: false, reason: "observer_storage_key_rejected" });
  });

  it("uses an exact popup URL and the injected page observer survives worker loss", async () => {
    const expected = "chrome-extension://observer/popup.html";
    expect(isExactObserverPageUrl(expected, expected)).toBe(true);
    expect(isExactObserverPageUrl(`${expected}?x=1`, expected)).toBe(false);
    expect(isExactObserverPageUrl(`${expected}#x`, expected)).toBe(false);

    const events: unknown[] = [];
    const listeners: ((changes: Record<string, unknown>, area: string) => void)[] = [];
    let pagehide: (() => void) | undefined;
    const priorWindow = Reflect.get(globalThis, "window");
    const priorChrome = Reflect.get(globalThis, "chrome");
    Reflect.set(globalThis, "window", {
      __v4ObservationEvent: (event: unknown) => events.push(event),
      addEventListener: (type: string, listener: () => void) => {
        if (type === "pagehide") pagehide = listener;
      },
    });
    Reflect.set(globalThis, "chrome", {
      storage: {
        local: { get: async () => emptyLocal },
        session: { get: async () => emptySession },
        onChanged: { addListener: (listener: (changes: Record<string, unknown>, area: string) => void) => listeners.push(listener) },
      },
    });
    try {
      persistentObserverEntrypoint({ localKeys: LOCAL_TRIGGER_KEYS, sessionKeys: SESSION_TRIGGER_KEYS });
      await new Promise((complete) => setTimeout(complete, 0));
      expect(events).toContainEqual(expect.objectContaining({ type: "observer_armed" }));
      // No service-worker object participates in the observer. Its absence or
      // termination cannot remove the extension-page storage listener.
      expect(listeners).toHaveLength(1);
      const approved: Record<string, unknown> = { newValue: [{}, {}] };
      Object.defineProperty(approved, "oldValue", { get() { throw new Error("injected observer read oldValue"); } });
      listeners[0]?.({ transientE1: approved }, "session");
      await new Promise((complete) => setTimeout(complete, 0));
      expect(events).toContainEqual(expect.objectContaining({
        type: "snapshot",
        snapshot: expect.objectContaining({ session: expect.objectContaining({ transientE1: 2 }) }),
      }));
      pagehide?.();
      expect(events.at(-1)).toEqual({ type: "observer_page_closed" });
    } finally {
      Reflect.set(globalThis, "window", priorWindow);
      Reflect.set(globalThis, "chrome", priorChrome);
    }
  });

  it("RED: injected observer rejects mixed unknown keys before any getter access", async () => {
    const events: unknown[] = [];
    const listeners: ((changes: Record<string, unknown>, area: string) => void)[] = [];
    const priorWindow = Reflect.get(globalThis, "window");
    const priorChrome = Reflect.get(globalThis, "chrome");
    Reflect.set(globalThis, "window", { __v4ObservationEvent: (event: unknown) => events.push(event), addEventListener: () => undefined });
    Reflect.set(globalThis, "chrome", { storage: { local: { get: async () => emptyLocal }, session: { get: async () => emptySession }, onChanged: { addListener: (listener: (changes: Record<string, unknown>, area: string) => void) => listeners.push(listener) } } });
    try {
      persistentObserverEntrypoint({ localKeys: LOCAL_TRIGGER_KEYS, sessionKeys: SESSION_TRIGGER_KEYS });
      await new Promise((complete) => setTimeout(complete, 0));
      let getterReads = 0;
      const hostile: Record<string, unknown> = {};
      Object.defineProperty(hostile, "newValue", { get() { getterReads += 1; throw new Error("must not read"); } });
      listeners[0]?.({ captureOutbox: hostile, captureCredential: hostile }, "local");
      await new Promise((complete) => setTimeout(complete, 0));
      expect(getterReads).toBe(0);
      expect(events.at(-1)).toEqual({ type: "observer_storage_key_rejected" });
    } finally {
      Reflect.set(globalThis, "window", priorWindow);
      Reflect.set(globalThis, "chrome", priorChrome);
    }
  });

  it("RED: injected observer never reads approved oldValue", async () => {
    let reads = 0;
    const approved: Record<string, unknown> = { newValue: [{}] };
    Object.defineProperty(approved, "oldValue", { get() { reads += 1; throw new Error("oldValue read"); } });
    const events = await runInjectedChange({ transientE1: approved }, "session");
    expect(reads).toBe(0);
    expect(events).toContainEqual(expect.objectContaining({ type: "snapshot" }));
  });

  it("RED: injected observer rejects an unknown key without reading its newValue", async () => {
    let reads = 0;
    const hostile: Record<string, unknown> = {};
    Object.defineProperty(hostile, "newValue", { get() { reads += 1; throw new Error("unknown newValue read"); } });
    const events = await runInjectedChange({ captureCredential: hostile }, "local");
    expect(reads).toBe(0);
    expect(events.at(-1)).toEqual({ type: "observer_storage_key_rejected" });
  });

  it("retains ordered E1 to E2 to E3/outbox to ACK and rejects duplicates/out-of-order", () => {
    const target = LEETCODE_TARGET;
    const hint = uiHint("leetcode", target.problemExternalId);
    const submit = e1Lifecycle("leetcode", `leetcode/submit/cn/${target.problemExternalId}`, "POST");
    const result = e1Lifecycle("leetcode", "leetcode/result/cn/741526004", "GET");
    const baseline = projectSafeSnapshot({ local: emptyLocal, session: targetSession() }, target);
    expect(baseline.ok).toBe(true);
    if (!baseline.ok) return;
    const e0 = projectSafeSnapshot({ local: emptyLocal, session: targetSession([hint]) }, target);
    expect(e0.ok).toBe(true);
    if (!e0.ok) return;
    const e1 = projectSafeSnapshot({ local: emptyLocal, session: targetSession([hint], [submit]) }, target);
    expect(e1.ok).toBe(true);
    if (!e1.ok) return;
    const e2 = projectSafeSnapshot({
      local: { ...emptyLocal, confirmedSubmissions: [confirmed()] },
      session: targetSession([hint], [submit, result]),
    }, target);
    expect(e2.ok).toBe(true);
    if (!e2.ok) return;
    const e3 = projectSafeSnapshot({
      local: { ...emptyLocal, confirmedSubmissions: [confirmed("leetcode", "merge-two-sorted-lists", "cn/741526004", true)], confirmedSubmissionTombstones: [tombstone()], captureOutbox: [{}] },
      session: targetSession([hint], [submit, result]),
    }, target);
    expect(e3.ok).toBe(true);
    if (!e3.ok) return;
    const ack = projectSafeSnapshot({
      local: {
        ...emptyLocal,
        confirmedSubmissions: [confirmed("leetcode", "merge-two-sorted-lists", "cn/741526004", true)],
        confirmedSubmissionTombstones: [tombstone()],
        lastSuccessfulCaptureAt: "2026-08-11T08:10:03.000Z",
      },
      session: targetSession([hint], [submit, result]),
    }, target);
    expect(ack.ok).toBe(true);
    if (!ack.ok) return;
    const db0 = { captureEvents: 0, trainingSessions: 0, trainingAttempts: 0 };
    const db1 = { captureEvents: 0, trainingSessions: 0, trainingAttempts: 0 };
    const db2 = { captureEvents: 0, trainingSessions: 0, trainingAttempts: 0 };
    const db3 = { captureEvents: 0, trainingSessions: 0, trainingAttempts: 0 };
    const db4 = { captureEvents: 4, trainingSessions: 1, trainingAttempts: 1 };
    let state = reduceObservationSnapshot(undefined, baseline.value, db0, target);
    expect(state.ok).toBe(true);
    if (!state.ok) return;
    state = reduceObservationSnapshot(state.value, e0.value, db0, target);
    expect(state.ok).toBe(true);
    if (!state.ok || state.value === undefined) return;
    state = reduceObservationSnapshot(state.value, e1.value, db1, target);
    expect(state.value?.stage).toBe("e1_observed");
    if (!state.ok || state.value === undefined) return;
    state = reduceObservationSnapshot(state.value, e2.value, db2, target);
    expect(state.value?.stage).toBe("e2_confirmed");
    if (!state.ok || state.value === undefined) return;
    const e2State = state.value;
    state = reduceObservationSnapshot(state.value, e3.value, db3, target);
    expect(state.value?.stage).toBe("e3_outbox");
    if (!state.ok || state.value === undefined) return;
    state = reduceObservationSnapshot(state.value, ack.value, db4, target);
    expect(state.value?.stage).toBe("acknowledged");

    const duplicate = reduceObservationSnapshot(state.value, e2.value, db4, target);
    expect(duplicate).toEqual({ ok: false, reason: "observer_stage_rejected" });
    const outOfOrder = reduceObservationSnapshot(undefined, e2.value, db2, target);
    expect(outOfOrder).toEqual({ ok: false, reason: "observer_baseline_rejected" });

    const e3WithoutOutbox = projectSafeSnapshot({
      local: { ...emptyLocal, confirmedSubmissions: [confirmed("leetcode", "merge-two-sorted-lists", "cn/741526004", true)], confirmedSubmissionTombstones: [tombstone()] },
      session: targetSession([hint], [submit, result]),
    }, target);
    expect(e3WithoutOutbox.ok).toBe(true);
    if (e3WithoutOutbox.ok) {
      expect(reduceObservationSnapshot(e2State, e3WithoutOutbox.value, db3, target))
        .toEqual({ ok: false, reason: "observer_stage_rejected" });
    }
  });

  it("accepts the approved NowCoder submit E1 plus status E1 before E2", () => {
    const target = NOWCODER_TARGET;
    const hint = uiHint("nowcoder", target.problemExternalId);
    const submit = e1Lifecycle("nowcoder", "nowcoder/submit", "POST");
    const status = e1Lifecycle("nowcoder", "nowcoder/status", "GET");
    const baseline = projectSafeSnapshot({ local: emptyLocal, session: targetSession() }, target);
    const e0 = projectSafeSnapshot({ local: emptyLocal, session: targetSession([hint]) }, target);
    const submitE1 = projectSafeSnapshot({ local: emptyLocal, session: targetSession([hint], [submit]) }, target);
    const statusE1 = projectSafeSnapshot({ local: emptyLocal, session: targetSession([hint], [submit, status]) }, target);
    const e2 = projectSafeSnapshot({
      local: { ...emptyLocal, confirmedSubmissions: [confirmed("nowcoder", "acm/contest/18839/1001", "84444687")] },
      session: targetSession([hint], [submit, status]),
    }, target);
    expect(baseline.ok && e0.ok && submitE1.ok && statusE1.ok && e2.ok).toBe(true);
    if (!baseline.ok || !e0.ok || !submitE1.ok || !statusE1.ok || !e2.ok) return;
    const b = reduceObservationSnapshot(undefined, baseline.value, { captureEvents: 0, trainingSessions: 0, trainingAttempts: 0 }, target);
    expect(b.ok).toBe(true);
    if (!b.ok || b.value === undefined) return;
    const s0 = reduceObservationSnapshot(b.value, e0.value, { captureEvents: 0, trainingSessions: 0, trainingAttempts: 0 }, target);
    expect(s0.ok).toBe(true);
    if (!s0.ok || s0.value === undefined) return;
    const s1 = reduceObservationSnapshot(s0.value, submitE1.value, { captureEvents: 0, trainingSessions: 0, trainingAttempts: 0 }, target);
    expect(s1.value?.stage).toBe("e1_observed");
    if (!s1.ok || s1.value === undefined) return;
    expect(reduceObservationSnapshot(s1.value, { ...e2.value, target: submitE1.value.target }, { captureEvents: 0, trainingSessions: 0, trainingAttempts: 0 }, target))
      .toEqual({ ok: false, reason: "observer_stage_rejected" });
    const s2 = reduceObservationSnapshot(s1.value, statusE1.value, { captureEvents: 0, trainingSessions: 0, trainingAttempts: 0 }, target);
    expect(s2.value?.stage).toBe("e1_observed");
    if (!s2.ok || s2.value === undefined) return;
    const confirmedState = reduceObservationSnapshot(s2.value, e2.value, { captureEvents: 0, trainingSessions: 0, trainingAttempts: 0 }, target);
    expect(confirmedState.value?.stage).toBe("e2_confirmed");
  });

  it("RED: rejects a fixed nonempty capture error at every stage", () => {
    const db0 = { captureEvents: 0, trainingSessions: 0, trainingAttempts: 0 };
    const db4 = { captureEvents: 4, trainingSessions: 1, trainingAttempts: 1 };
    const target = LEETCODE_TARGET;
    const hint = uiHint("leetcode", target.problemExternalId);
    const submit = e1Lifecycle("leetcode", `leetcode/submit/cn/${target.problemExternalId}`, "POST");
    const base = projectSafeSnapshot({ local: emptyLocal, session: targetSession() }, target);
    const e0 = projectSafeSnapshot({ local: emptyLocal, session: targetSession([hint]) }, target);
    const e1 = projectSafeSnapshot({ local: emptyLocal, session: targetSession([hint], [submit]) }, target);
    const e2 = projectSafeSnapshot({ local: { ...emptyLocal, confirmedSubmissions: [confirmed()] }, session: targetSession([hint], [submit]) }, target);
    const e3 = projectSafeSnapshot({ local: { ...emptyLocal, confirmedSubmissions: [confirmed("leetcode", "merge-two-sorted-lists", "cn/741526004", true)], confirmedSubmissionTombstones: [tombstone()], captureOutbox: [{}] }, session: targetSession([hint], [submit]) }, target);
    const ack = projectSafeSnapshot({ local: { ...emptyLocal, confirmedSubmissions: [confirmed("leetcode", "merge-two-sorted-lists", "cn/741526004", true)], confirmedSubmissionTombstones: [tombstone()], lastSuccessfulCaptureAt: "2026-08-11T08:10:03.000Z" }, session: targetSession([hint], [submit]) }, target);
    expect(base.ok && e0.ok && e1.ok && e2.ok && e3.ok && ack.ok).toBe(true);
    if (!base.ok || !e0.ok || !e1.ok || !e2.ok || !e3.ok || !ack.ok) return;
    const b = reduceObservationSnapshot(undefined, base.value, db0, target);
    if (!b.ok || b.value === undefined) return;
    const s0 = reduceObservationSnapshot(b.value, e0.value, db0, target);
    if (!s0.ok || s0.value === undefined) return;
    const s1 = reduceObservationSnapshot(s0.value, e1.value, db0, target);
    if (!s1.ok || s1.value === undefined) return;
    const s2 = reduceObservationSnapshot(s1.value, e2.value, db0, target);
    if (!s2.ok || s2.value === undefined) return;
    const s3 = reduceObservationSnapshot(s2.value, e3.value, db0, target);
    if (!s3.ok || s3.value === undefined) return;
    const stages = [
      [undefined, base.value, db0],
      [b.value, e0.value, db0],
      [s0.value, e1.value, db0],
      [s1.value, e2.value, db0],
      [s2.value, e3.value, db0],
      [s3.value, ack.value, db4],
    ] as const;
    for (const [previous, snapshot, database] of stages) {
      expect(reduceObservationSnapshot(previous, { ...snapshot, lastCaptureError: "epoch_started_missing" }, database, target))
        .toEqual({ ok: false, reason: "observer_capture_error" });
    }
  });

  it("RED: preserves the triggering counts when one callback contains E1, E2, and an allowlisted error", () => {
    const target = LEETCODE_TARGET;
    const hint = uiHint("leetcode", target.problemExternalId);
    const submit = e1Lifecycle("leetcode", `leetcode/submit/cn/${target.problemExternalId}`, "POST");
    const snapshot = projectSafeSnapshot({
      local: {
        ...emptyLocal,
        confirmedSubmissions: [confirmed()],
        lastCaptureError: "epoch_started_missing",
      },
      session: targetSession([hint], [submit]),
    }, target);
    expect(snapshot.ok).toBe(true);
    if (!snapshot.ok) return;

    const receipt = projectFailureReceipt(
      snapshot.value,
      { captureEvents: 0, trainingSessions: 0, trainingAttempts: 0 },
      target,
    );
    expect(receipt).toEqual({
      ok: true,
      value: {
        reason: "observer_capture_error",
        error: "epoch_started_missing",
        target: { e0: 1, e1: 1, submit: 1, status: 0 },
        extension: { confirmed: 1, tombstones: 0, outbox: 0, quarantine: 0 },
        database: { captureEvents: 0, trainingSessions: 0, trainingAttempts: 0 },
      },
    });
    expect(JSON.stringify(receipt)).not.toMatch(/"(?:transientE1|graphql|endpoint|request|tab|frame|document|body|header|token|code|database-path)"|2026-|https?:/u);

    const baseline = projectSafeSnapshot({ local: emptyLocal, session: targetSession() }, target);
    expect(baseline.ok).toBe(true);
    if (!baseline.ok) return;
    const armed = reduceObservationSnapshot(
      undefined,
      baseline.value,
      { captureEvents: 0, trainingSessions: 0, trainingAttempts: 0 },
      target,
    );
    expect(armed.ok).toBe(true);
    if (!armed.ok || armed.value === undefined) return;
    // The callback is one projected snapshot.  The reducer must stop on the
    // fixed error instead of inventing E1/E2 order or reaching ACK.
    expect(reduceObservationSnapshot(
      armed.value,
      snapshot.value,
      { captureEvents: 0, trainingSessions: 0, trainingAttempts: 0 },
      target,
    )).toEqual({ ok: false, reason: "observer_capture_error" });
    if (receipt.ok) {
      expect(receipt.value).not.toHaveProperty("stage");
      expect(receipt.value).not.toHaveProperty("acknowledged");
    }

    let hostileReads = 0;
    const hostile = { ...snapshot.value } as Record<string, unknown>;
    Object.defineProperty(hostile, "unknownRaw", {
      enumerable: true,
      get() {
        hostileReads += 1;
        throw new Error("unknown receipt key was read");
      },
    });
    expect(projectFailureReceipt(
      hostile,
      { captureEvents: 0, trainingSessions: 0, trainingAttempts: 0 },
      target,
    )).toEqual({ ok: false, reason: "observer_value_rejected" });
    expect(hostileReads).toBe(0);
  });

  it("RED: binds E2 to the requested identity", () => {
    const db0 = { captureEvents: 0, trainingSessions: 0, trainingAttempts: 0 };
    const target = NOWCODER_TARGET;
    const hint = uiHint("nowcoder", target.problemExternalId);
    const submit = e1Lifecycle("nowcoder", "nowcoder/submit", "POST");
    const status = e1Lifecycle("nowcoder", "nowcoder/status", "GET");
    const base = projectSafeSnapshot({ local: emptyLocal, session: targetSession() }, target);
    const e0 = projectSafeSnapshot({ local: emptyLocal, session: targetSession([hint]) }, target);
    const e1 = projectSafeSnapshot({ local: emptyLocal, session: targetSession([hint], [submit]) }, target);
    const statusE1 = projectSafeSnapshot({ local: emptyLocal, session: targetSession([hint], [submit, status]) }, target);
    const wrongE2 = projectSafeSnapshot({ local: { ...emptyLocal, confirmedSubmissions: [confirmed("nowcoder", "acm/contest/18839/1002", "84440000")] }, session: targetSession([hint], [submit, status]) }, target);
    expect(base.ok && e0.ok && e1.ok && statusE1.ok && wrongE2.ok).toBe(true);
    if (!base.ok || !e0.ok || !e1.ok || !statusE1.ok || !wrongE2.ok) return;
    const b = reduceObservationSnapshot(undefined, base.value, db0, target);
    if (!b.ok || b.value === undefined) return;
    const s0 = reduceObservationSnapshot(b.value, e0.value, db0, target);
    if (!s0.ok || s0.value === undefined) return;
    const s1 = reduceObservationSnapshot(s0.value, e1.value, db0, target);
    if (!s1.ok || s1.value === undefined) return;
    const s2 = reduceObservationSnapshot(s1.value, statusE1.value, db0, target);
    if (!s2.ok || s2.value === undefined) return;
    expect(reduceObservationSnapshot(s2.value, wrongE2.value, db0, target))
      .toEqual({ ok: false, reason: "observer_target_rejected" });

  });

  it("RED: rejects E3 without finalizedAt and rejects finalization before tombstone/outbox", () => {
    const { state, db, target } = leetCodeE2State();
    const hint = uiHint("leetcode", target.problemExternalId);
    const submit = e1Lifecycle("leetcode", `leetcode/submit/cn/${target.problemExternalId}`, "POST");
    const unfinalized = projectSafeSnapshot({ local: { ...emptyLocal, confirmedSubmissions: [confirmed()], confirmedSubmissionTombstones: [tombstone()], captureOutbox: [{}] }, session: targetSession([hint], [submit]) }, target);
    const early = projectSafeSnapshot({ local: { ...emptyLocal, confirmedSubmissions: [confirmed("leetcode", "merge-two-sorted-lists", "cn/741526004", true)] }, session: targetSession([hint], [submit]) }, target);
    expect(unfinalized.ok && early.ok).toBe(true);
    if (!unfinalized.ok || !early.ok) return;
    expect(reduceObservationSnapshot(state, unfinalized.value, db, target)).toEqual({ ok: false, reason: "observer_stage_rejected" });
    expect(reduceObservationSnapshot(state, early.value, db, target)).toEqual({ ok: false, reason: "observer_stage_rejected" });
  });

  it("RED: rejects a finalized E3 carrying a different identity", () => {
    const { state, db, target } = leetCodeE2State();
    const hint = uiHint("leetcode", target.problemExternalId);
    const submit = e1Lifecycle("leetcode", `leetcode/submit/cn/${target.problemExternalId}`, "POST");
    const wrong = projectSafeSnapshot({ local: { ...emptyLocal, confirmedSubmissions: [confirmed("leetcode", "merge-two-sorted-lists", "cn/999999999", true)], confirmedSubmissionTombstones: [tombstone("leetcode", "cn/999999999")], captureOutbox: [{}] }, session: targetSession([hint], [submit]) }, target);
    expect(wrong.ok).toBe(true);
    if (wrong.ok) expect(reduceObservationSnapshot(state, wrong.value, db, target)).toEqual({ ok: false, reason: "observer_stage_rejected" });
  });

  it("rejects noncanonical finalizedAt during projection", () => {
    expect(projectSafeSnapshot({ local: { ...emptyLocal, confirmedSubmissions: [{ ...confirmed("leetcode", "merge-two-sorted-lists", "cn/741526004", true), finalizedAt: "not-a-time" }] }, session: { ...emptySession, transientE1: [{}] } }))
      .toEqual({ ok: false, reason: "observer_value_rejected" });
  });

  it("requires an explicit zero-count database under the observation root", () => {
    const root = mkdtempSync(join(tmpdir(), "v4-observer-db-root-"));
    const run = join(root, ".tmp", "v4-live-observation-db", "leetcode-run");
    const good = join(run, "training-platform.sqlite");
    mkdirSync(run, { recursive: true });
    writeFileSync(good, "fixture", "utf8");
    try {
      expect(validateObservationDatabase({ repoRoot: root, pointerPath: good, explicitPath: good, counts: { captureEvents: 0, trainingSessions: 0, trainingAttempts: 0 } }).ok).toBe(true);
      expect(validateObservationDatabase({ repoRoot: root, pointerPath: good, explicitPath: good, counts: { captureEvents: 4, trainingSessions: 1, trainingAttempts: 1 } }))
        .toEqual({ ok: false, reason: "observer_database_not_empty" });
      expect(validateObservationDatabase({ repoRoot: root, pointerPath: good, explicitPath: join(root, "outside.sqlite"), counts: { captureEvents: 0, trainingSessions: 0, trainingAttempts: 0 } }))
        .toEqual({ ok: false, reason: "observer_database_rejected" });
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("RED: rejects a junction escape beneath the observation database root", () => {
    const root = mkdtempSync(join(tmpdir(), "v4-observer-db-root-"));
    const outside = mkdtempSync(join(tmpdir(), "v4-observer-db-outside-"));
    const allowed = join(root, ".tmp", "v4-live-observation-db");
    const link = join(allowed, "escaped-run");
    const escapedDatabase = join(link, "training-platform.sqlite");
    mkdirSync(allowed, { recursive: true });
    writeFileSync(join(outside, "training-platform.sqlite"), "fixture", "utf8");
    symlinkSync(outside, link, "junction");
    try {
      expect(validateObservationDatabase({ repoRoot: root, pointerPath: escapedDatabase, explicitPath: escapedDatabase, counts: { captureEvents: 0, trainingSessions: 0, trainingAttempts: 0 } }))
        .toEqual({ ok: false, reason: "observer_database_rejected" });
    } finally {
      rmSync(root, { recursive: true, force: true });
      rmSync(outside, { recursive: true, force: true });
    }
  });

  it("RED: rejects a .tmp junction before the observation database root", () => {
    const root = mkdtempSync(join(tmpdir(), "v4-observer-db-root-"));
    const outside = mkdtempSync(join(tmpdir(), "v4-observer-db-outside-"));
    const externalRun = join(outside, "v4-live-observation-db", "escaped-run");
    const escapedDatabase = join(root, ".tmp", "v4-live-observation-db", "escaped-run", "training-platform.sqlite");
    mkdirSync(externalRun, { recursive: true });
    writeFileSync(join(externalRun, "training-platform.sqlite"), "fixture", "utf8");
    symlinkSync(outside, join(root, ".tmp"), "junction");
    try {
      expect(validateObservationDatabase({ repoRoot: root, pointerPath: escapedDatabase, explicitPath: escapedDatabase, counts: { captureEvents: 0, trainingSessions: 0, trainingAttempts: 0 } }))
        .toEqual({ ok: false, reason: "observer_database_rejected" });
    } finally {
      rmSync(root, { recursive: true, force: true });
      rmSync(outside, { recursive: true, force: true });
    }
  });

  it("RED: rejects a canonical descendant check that crosses Windows volumes", () => {
    expect(isCanonicalDescendant("D:\\repo", "C:\\external\\v4-live-observation-db")).toBe(false);
    expect(isCanonicalDescendant("D:\\repo", "D:\\repo\\.tmp\\v4-live-observation-db")).toBe(true);
  });

  it("RED: rejects a nonzero database snapshot at observer arm", () => {
    const baseline = projectSafeSnapshot({ local: emptyLocal, session: emptySession });
    expect(baseline.ok).toBe(true);
    if (!baseline.ok) return;
    expect(reduceObservationSnapshot(undefined, baseline.value, { captureEvents: 4, trainingSessions: 1, trainingAttempts: 1 }, { platform: "leetcode", problemExternalId: "merge-two-sorted-lists" }))
      .toEqual({ ok: false, reason: "observer_database_not_empty" });
  });

  it("RED: target-aware projection keeps GraphQL browse noise at zero and counts exact LeetCode submit once", () => {
    const graphql = e1Lifecycle("leetcode", "graphql", "POST");
    const exactSubmit = e1Lifecycle("leetcode", "leetcode/submit/cn/merge-two-sorted-lists", "POST");
    const baseline = projectSafeSnapshot({ local: emptyLocal, session: targetSession([], [graphql]) }, LEETCODE_TARGET);
    expect(baseline.ok).toBe(true);
    if (!baseline.ok) return;
    expect(baseline.value.target).toEqual({ e0: 0, e1: 0, submit: 0, status: 0 });
    expect(baseline.value.session.transientE1).toBe(0);
    const db0 = { captureEvents: 0, trainingSessions: 0, trainingAttempts: 0 };
    const browse = reduceObservationSnapshot(undefined, baseline.value, db0, LEETCODE_TARGET);
    expect(browse.ok).toBe(true);
    if (!browse.ok || browse.value === undefined) return;
    expect(browse.value.stage).toBe("browse_only");
    const afterHint = projectSafeSnapshot({ local: emptyLocal, session: targetSession([uiHint("leetcode", "merge-two-sorted-lists")], [graphql]) }, LEETCODE_TARGET);
    expect(afterHint.ok).toBe(true);
    if (!afterHint.ok) return;
    expect(afterHint.value.target).toEqual({ e0: 1, e1: 0, submit: 0, status: 0 });
    const hinted = reduceObservationSnapshot(browse.value, afterHint.value, db0, LEETCODE_TARGET);
    expect(hinted.ok).toBe(true);
    if (hinted.ok) expect(hinted.value?.stage).toBe("browse_only");
    const afterSubmit = projectSafeSnapshot({ local: emptyLocal, session: targetSession([uiHint("leetcode", "merge-two-sorted-lists")], [graphql, exactSubmit]) }, LEETCODE_TARGET);
    expect(afterSubmit.ok).toBe(true);
    if (afterSubmit.ok) expect(afterSubmit.value.target).toEqual({ e0: 1, e1: 1, submit: 1, status: 0 });
  });

  it("accepts one REST-less stable LeetCode result root after the exact action", () => {
    const hint = uiHint("leetcode", LEETCODE_TARGET.problemExternalId);
    const result = e1Lifecycle("leetcode", "leetcode/result/cn/741526004", "GET");
    const db = { captureEvents: 0, trainingSessions: 0, trainingAttempts: 0 };
    const baseline = projectSafeSnapshot({ local: emptyLocal, session: targetSession() }, LEETCODE_TARGET);
    const action = projectSafeSnapshot({ local: emptyLocal, session: targetSession([hint]) }, LEETCODE_TARGET);
    const rooted = projectSafeSnapshot({ local: emptyLocal, session: targetSession([hint], [result]) }, LEETCODE_TARGET);
    const e2 = projectSafeSnapshot({
      local: { ...emptyLocal, confirmedSubmissions: [confirmed()] },
      session: targetSession([hint], [result]),
    }, LEETCODE_TARGET);
    expect(baseline.ok && action.ok && rooted.ok && e2.ok).toBe(true);
    if (!baseline.ok || !action.ok || !rooted.ok || !e2.ok) return;
    expect(rooted.value.target).toEqual({ e0: 1, e1: 1, submit: 0, status: 1 });
    let state = reduceObservationSnapshot(undefined, baseline.value, db, LEETCODE_TARGET);
    expect(state.ok).toBe(true);
    if (!state.ok || state.value === undefined) return;
    state = reduceObservationSnapshot(state.value, action.value, db, LEETCODE_TARGET);
    expect(state.ok).toBe(true);
    if (!state.ok || state.value === undefined) return;
    state = reduceObservationSnapshot(state.value, rooted.value, db, LEETCODE_TARGET);
    expect(state.value?.stage).toBe("e1_observed");
    if (!state.ok || state.value === undefined) return;
    state = reduceObservationSnapshot(state.value, e2.value, db, LEETCODE_TARGET);
    expect(state.value?.stage).toBe("e2_confirmed");
  });

  it("RED: rejects LeetCode E2 when the action has only an exact submit lifecycle", () => {
    const hint = uiHint("leetcode", LEETCODE_TARGET.problemExternalId);
    const submit = e1Lifecycle("leetcode", `leetcode/submit/cn/${LEETCODE_TARGET.problemExternalId}`, "POST");
    const db = { captureEvents: 0, trainingSessions: 0, trainingAttempts: 0 };
    const baseline = projectSafeSnapshot({ local: emptyLocal, session: targetSession() }, LEETCODE_TARGET);
    const action = projectSafeSnapshot({ local: emptyLocal, session: targetSession([hint]) }, LEETCODE_TARGET);
    const submitted = projectSafeSnapshot({ local: emptyLocal, session: targetSession([hint], [submit]) }, LEETCODE_TARGET);
    const e2 = projectSafeSnapshot({
      local: { ...emptyLocal, confirmedSubmissions: [confirmed()] },
      session: targetSession([hint], [submit]),
    }, LEETCODE_TARGET);
    expect(baseline.ok && action.ok && submitted.ok && e2.ok).toBe(true);
    if (!baseline.ok || !action.ok || !submitted.ok || !e2.ok) return;
    let state = reduceObservationSnapshot(undefined, baseline.value, db, LEETCODE_TARGET);
    if (!state.ok || state.value === undefined) return;
    state = reduceObservationSnapshot(state.value, action.value, db, LEETCODE_TARGET);
    if (!state.ok || state.value === undefined) return;
    state = reduceObservationSnapshot(state.value, submitted.value, db, LEETCODE_TARGET);
    if (!state.ok || state.value === undefined) return;
    expect(reduceObservationSnapshot(state.value, e2.value, db, LEETCODE_TARGET))
      .toEqual({ ok: false, reason: "observer_stage_rejected" });
  });

  it("RED: rejects LeetCode E2 when the unique result identity does not match", () => {
    const hint = uiHint("leetcode", LEETCODE_TARGET.problemExternalId);
    const result = e1Lifecycle("leetcode", "leetcode/result/cn/741526005", "GET");
    const db = { captureEvents: 0, trainingSessions: 0, trainingAttempts: 0 };
    const baseline = projectSafeSnapshot({ local: emptyLocal, session: targetSession() }, LEETCODE_TARGET);
    const action = projectSafeSnapshot({ local: emptyLocal, session: targetSession([hint]) }, LEETCODE_TARGET);
    const rooted = projectSafeSnapshot({ local: emptyLocal, session: targetSession([hint], [result]) }, LEETCODE_TARGET);
    const e2 = projectSafeSnapshot({
      local: { ...emptyLocal, confirmedSubmissions: [confirmed()] },
      session: targetSession([hint], [result]),
    }, LEETCODE_TARGET);
    expect(baseline.ok && action.ok && rooted.ok && e2.ok).toBe(true);
    if (!baseline.ok || !action.ok || !rooted.ok || !e2.ok) return;
    let state = reduceObservationSnapshot(undefined, baseline.value, db, LEETCODE_TARGET);
    if (!state.ok || state.value === undefined) return;
    state = reduceObservationSnapshot(state.value, action.value, db, LEETCODE_TARGET);
    if (!state.ok || state.value === undefined) return;
    state = reduceObservationSnapshot(state.value, rooted.value, db, LEETCODE_TARGET);
    if (!state.ok || state.value === undefined) return;
    expect(reduceObservationSnapshot(state.value, e2.value, db, LEETCODE_TARGET))
      .toEqual({ ok: false, reason: "observer_stage_rejected" });
  });

  it("RED: rejects duplicate LeetCode result/check lifecycles for one stable identity", () => {
    const hint = uiHint("leetcode", LEETCODE_TARGET.problemExternalId);
    const result = e1Lifecycle("leetcode", "leetcode/result/cn/741526004", "GET");
    const check = e1Lifecycle("leetcode", "leetcode/check/cn/741526004", "GET");
    const db = { captureEvents: 0, trainingSessions: 0, trainingAttempts: 0 };
    const baseline = projectSafeSnapshot({ local: emptyLocal, session: targetSession() }, LEETCODE_TARGET);
    const action = projectSafeSnapshot({ local: emptyLocal, session: targetSession([hint]) }, LEETCODE_TARGET);
    const duplicate = projectSafeSnapshot({ local: emptyLocal, session: targetSession([hint], [result, check]) }, LEETCODE_TARGET);
    expect(baseline.ok && action.ok && duplicate.ok).toBe(true);
    if (!baseline.ok || !action.ok || !duplicate.ok) return;
    let state = reduceObservationSnapshot(undefined, baseline.value, db, LEETCODE_TARGET);
    if (!state.ok || state.value === undefined) return;
    state = reduceObservationSnapshot(state.value, action.value, db, LEETCODE_TARGET);
    if (!state.ok || state.value === undefined) return;
    expect(reduceObservationSnapshot(state.value, duplicate.value, db, LEETCODE_TARGET))
      .toEqual({ ok: false, reason: "observer_stage_rejected" });
  });

  it("keeps the injected LeetCode result identity in memory and emits only its E2 match", async () => {
    const hint = uiHint("leetcode", LEETCODE_TARGET.problemExternalId);
    const result = e1Lifecycle("leetcode", "leetcode/result/cn/741526004", "GET");
    const events = await runInjectedChange({
      confirmedSubmissions: { newValue: [confirmed()] },
    }, "local", LEETCODE_TARGET, targetSession([hint], [result]));
    const snapshots = events.filter((event): event is { type: "snapshot"; snapshot: { target: Record<string, unknown> } } => (
      typeof event === "object" && event !== null && Reflect.get(event, "type") === "snapshot"
    ));
    expect(snapshots.at(-1)?.snapshot.target).toEqual({
      e0: 1,
      e1: 1,
      submit: 0,
      status: 1,
      statusConfirmedMatch: true,
    });
    expect(Object.keys(snapshots.at(-1)?.snapshot.target ?? {})).not.toContain("stableSubmissionId");
  });

  it("rejects E2 identity replacement and persistent status identity drift", async () => {
    const { state, db, target } = leetCodeE2State();
    const hint = uiHint("leetcode", target.problemExternalId);
    const resultA = e1Lifecycle("leetcode", "leetcode/result/cn/741526004", "GET");
    const resultB = e1Lifecycle("leetcode", "leetcode/result/cn/741526005", "GET");
    const replaced = projectSafeSnapshot({
      local: { ...emptyLocal, confirmedSubmissions: [confirmed("leetcode", target.problemExternalId, "cn/741526005")] },
      session: targetSession([hint], [resultA]),
    }, target);
    expect(replaced.ok).toBe(true);
    if (replaced.ok) {
      expect(reduceObservationSnapshot(state, replaced.value, db, target))
        .toEqual({ ok: false, reason: "observer_stage_rejected" });
    }

    const events = await runInjectedChanges([
      { area: "session", changes: { uiHints: { newValue: [hint] } } },
      { area: "session", changes: { transientE1: { newValue: [resultA] } } },
      { area: "local", changes: { confirmedSubmissions: { newValue: [confirmed()] } } },
      { area: "session", changes: { transientE1: { newValue: [resultB] } } },
    ], target);
    const snapshots = events.filter((event): event is { type: "snapshot"; snapshot: Parameters<typeof reduceObservationSnapshot>[1] } => (
      typeof event === "object" && event !== null && Reflect.get(event, "type") === "snapshot"
    ));
    let reduced = reduceObservationSnapshot(undefined, (events[0] as { snapshot: Parameters<typeof reduceObservationSnapshot>[1] }).snapshot, db, target);
    expect(reduced.ok).toBe(true);
    for (const event of snapshots.slice(0, 3)) {
      if (!reduced.ok || reduced.value === undefined) break;
      reduced = reduceObservationSnapshot(reduced.value, event.snapshot, db, target);
    }
    expect(reduced.value?.stage).toBe("e2_confirmed");
    if (!reduced.ok || reduced.value === undefined) return;
    const driftedSnapshot = snapshots.at(-1)?.snapshot;
    if (driftedSnapshot === undefined) return;
    expect(reduceObservationSnapshot(reduced.value, driftedSnapshot, db, target))
      .toEqual({ ok: false, reason: "observer_stage_rejected" });
  });

  it("keeps persistent submit-only, mismatch, duplicate, and invalid targets fail-closed", async () => {
    const hint = uiHint("leetcode", LEETCODE_TARGET.problemExternalId);
    const submit = e1Lifecycle("leetcode", `leetcode/submit/cn/${LEETCODE_TARGET.problemExternalId}`, "POST");
    const matching = e1Lifecycle("leetcode", "leetcode/result/cn/741526004", "GET");
    const mismatch = e1Lifecycle("leetcode", "leetcode/result/cn/741526005", "GET");
    const duplicate = e1Lifecycle("leetcode", "leetcode/check/cn/741526004", "GET");
    for (const lifecycles of [[submit], [mismatch], [matching, duplicate]]) {
      const events = await runInjectedChanges([
        { area: "session", changes: { uiHints: { newValue: [hint] } } },
        { area: "session", changes: { transientE1: { newValue: lifecycles } } },
        { area: "local", changes: { confirmedSubmissions: { newValue: [confirmed()] } } },
      ], LEETCODE_TARGET);
      const final = events.filter((event): event is { type: "snapshot"; snapshot: { target: Record<string, unknown> } } => (
        typeof event === "object" && event !== null && Reflect.get(event, "type") === "snapshot"
      )).at(-1);
      expect(final?.snapshot.target.statusConfirmedMatch).toBe(false);
    }
    const invalidTarget = await runInjectedChanges([], {
      platform: "luogu",
      problemExternalId: "P1001",
    } as never);
    expect(invalidTarget.at(-1)).toEqual({ type: "observer_value_rejected" });
  });

  it("keeps exact LeetCode E1 stable when unrelated GraphQL activity grows before E2", async () => {
    const target = LEETCODE_TARGET;
    const hint = uiHint("leetcode", target.problemExternalId);
    const graphqlBefore = e1Lifecycle("leetcode", "graphql", "POST");
    const graphqlAfter = e1Lifecycle("leetcode", "graphql", "POST");
    const submit = e1Lifecycle("leetcode", `leetcode/submit/cn/${target.problemExternalId}`, "POST");
    const result = e1Lifecycle("leetcode", "leetcode/result/cn/741526004", "GET");
    const db = { captureEvents: 0, trainingSessions: 0, trainingAttempts: 0 };
    const baseline = projectSafeSnapshot({ local: emptyLocal, session: targetSession([], [graphqlBefore]) }, target);
    const e0 = projectSafeSnapshot({ local: emptyLocal, session: targetSession([hint], [graphqlBefore]) }, target);
    const e1 = projectSafeSnapshot({ local: emptyLocal, session: targetSession([hint], [graphqlBefore, submit]) }, target);
    const noisyE1 = projectSafeSnapshot({ local: emptyLocal, session: targetSession([hint], [graphqlBefore, submit, graphqlAfter]) }, target);
    const e2 = projectSafeSnapshot({
      local: { ...emptyLocal, confirmedSubmissions: [confirmed()] },
      session: targetSession([hint], [graphqlBefore, submit, graphqlAfter, result]),
    }, target);
    expect(baseline.ok && e0.ok && e1.ok && noisyE1.ok && e2.ok).toBe(true);
    if (!baseline.ok || !e0.ok || !e1.ok || !noisyE1.ok || !e2.ok) return;
    let state = reduceObservationSnapshot(undefined, baseline.value, db, target);
    expect(state.ok).toBe(true);
    if (!state.ok || state.value === undefined) return;
    state = reduceObservationSnapshot(state.value, e0.value, db, target);
    expect(state.ok).toBe(true);
    if (!state.ok || state.value === undefined) return;
    state = reduceObservationSnapshot(state.value, e1.value, db, target);
    expect(state.value?.stage).toBe("e1_observed");
    if (!state.ok || state.value === undefined) return;
    state = reduceObservationSnapshot(state.value, noisyE1.value, db, target);
    expect(state.value?.stage).toBe("e1_observed");
    expect(noisyE1.value.target).toEqual({ e0: 1, e1: 1, submit: 1, status: 0 });
    expect(JSON.stringify(noisyE1.value)).not.toContain("graphql");
    if (!state.ok || state.value === undefined) return;
    state = reduceObservationSnapshot(state.value, e2.value, db, target);
    expect(state.value?.stage).toBe("e2_confirmed");

    const events = await runInjectedChanges([
      { changes: { transientE1: { newValue: [submit] } }, area: "session" },
      { changes: { transientE1: { newValue: [submit, graphqlAfter] } }, area: "session" },
    ], target, targetSession([hint], []));
    const snapshots = events.filter((event): event is { type: "snapshot"; snapshot: { target: unknown; session: { transientE1: number } } } => (
      typeof event === "object" && event !== null && Reflect.get(event, "type") === "snapshot"
    ));
    expect(snapshots.at(-2)?.snapshot.target).toEqual({ e0: 1, e1: 1, submit: 1, status: 0 });
    expect(snapshots.at(-1)?.snapshot.target).toEqual({ e0: 1, e1: 1, submit: 1, status: 0 });
    expect(snapshots.at(-1)?.snapshot.session.transientE1).toBe(0);
    expect(JSON.stringify(events)).not.toContain("graphql");
  });

  it("RED: target-aware projection rejects submit-like target mismatch and never promotes GraphQL", async () => {
    const wrongSlug = e1Lifecycle("leetcode", "leetcode/submit/cn/other-problem", "POST");
    const wrongMethod = e1Lifecycle("leetcode", "leetcode/submit/cn/merge-two-sorted-lists", "GET");
    const wrongResource = e1Lifecycle("leetcode", "leetcode/submit/cn/merge-two-sorted-lists", "POST", "completed", { resourceType: "other" });
    for (const mismatch of [wrongSlug, wrongMethod, wrongResource]) {
      expect(projectSafeSnapshot({ local: emptyLocal, session: targetSession([uiHint("leetcode", "merge-two-sorted-lists")], [mismatch]) }, LEETCODE_TARGET))
        .toEqual({ ok: false, reason: "observer_value_rejected" });
    }
    const graphql = projectSafeSnapshot({ local: emptyLocal, session: targetSession([uiHint("leetcode", "merge-two-sorted-lists")], [e1Lifecycle("leetcode", "graphql", "POST")]) }, LEETCODE_TARGET);
    expect(graphql.ok).toBe(true);
    if (graphql.ok) expect(graphql.value.target).toEqual({ e0: 1, e1: 0, submit: 0, status: 0 });
    expect(JSON.stringify(graphql)).not.toContain("graphql");
    const injected = await runInjectedChange({ transientE1: { newValue: [wrongSlug] } }, "session", LEETCODE_TARGET, targetSession([uiHint("leetcode", LEETCODE_TARGET.problemExternalId)], []));
    expect(injected.at(-1)).toEqual({ type: "observer_value_rejected" });
  });

  it("RED: NowCoder requires target E0 then submit/status; wrong order is terminal", () => {
    const submit = e1Lifecycle("nowcoder", "nowcoder/submit", "POST");
    const status = e1Lifecycle("nowcoder", "nowcoder/status", "GET");
    const baseline = projectSafeSnapshot({ local: emptyLocal, session: targetSession([], []) }, NOWCODER_TARGET);
    const submitOnly = projectSafeSnapshot({ local: emptyLocal, session: targetSession([uiHint("nowcoder", NOWCODER_TARGET.problemExternalId)], [submit]) }, NOWCODER_TARGET);
    const pair = projectSafeSnapshot({ local: emptyLocal, session: targetSession([uiHint("nowcoder", NOWCODER_TARGET.problemExternalId)], [submit, status]) }, NOWCODER_TARGET);
    const statusFirst = projectSafeSnapshot({ local: emptyLocal, session: targetSession([uiHint("nowcoder", NOWCODER_TARGET.problemExternalId)], [status]) }, NOWCODER_TARGET);
    expect(baseline.ok && submitOnly.ok && pair.ok && statusFirst.ok).toBe(true);
    if (!baseline.ok || !submitOnly.ok || !pair.ok || !statusFirst.ok) return;
    expect(submitOnly.value.target).toEqual({ e0: 1, e1: 1, submit: 1, status: 0 });
    expect(pair.value.target).toEqual({ e0: 1, e1: 2, submit: 1, status: 1 });
    const db0 = { captureEvents: 0, trainingSessions: 0, trainingAttempts: 0 };
    const b = reduceObservationSnapshot(undefined, baseline.value, db0, NOWCODER_TARGET);
    expect(b.ok).toBe(true);
    if (!b.ok || b.value === undefined) return;
    const wrong = reduceObservationSnapshot(b.value, statusFirst.value, db0, NOWCODER_TARGET);
    expect(wrong).toEqual({ ok: false, reason: "observer_stage_rejected" });
  });

  it("RED: target E0 is exactly one, lifecycle changes preserve membership, and same-tuple duplicates reject", () => {
    const submit = e1Lifecycle("leetcode", "leetcode/submit/cn/merge-two-sorted-lists", "POST", "before_request");
    const completed = e1Lifecycle("leetcode", "leetcode/submit/cn/merge-two-sorted-lists", "POST", "completed");
    const baseline = projectSafeSnapshot({ local: emptyLocal, session: targetSession([], []) }, LEETCODE_TARGET);
    const e0 = projectSafeSnapshot({ local: emptyLocal, session: targetSession([uiHint("leetcode", LEETCODE_TARGET.problemExternalId)], []) }, LEETCODE_TARGET);
    const one = projectSafeSnapshot({ local: emptyLocal, session: targetSession([uiHint("leetcode", LEETCODE_TARGET.problemExternalId)], [submit]) }, LEETCODE_TARGET);
    const lifecycleUpdate = projectSafeSnapshot({ local: emptyLocal, session: targetSession([uiHint("leetcode", LEETCODE_TARGET.problemExternalId)], [completed]) }, LEETCODE_TARGET);
    const duplicate = projectSafeSnapshot({ local: emptyLocal, session: targetSession([uiHint("leetcode", LEETCODE_TARGET.problemExternalId)], [completed, completed]) }, LEETCODE_TARGET);
    const duplicateHint = projectSafeSnapshot({ local: emptyLocal, session: targetSession([uiHint("leetcode", LEETCODE_TARGET.problemExternalId), uiHint("leetcode", LEETCODE_TARGET.problemExternalId)], [completed]) }, LEETCODE_TARGET);
    const removedHint = projectSafeSnapshot({ local: emptyLocal, session: targetSession([], [completed]) }, LEETCODE_TARGET);
    const wrongHint = projectSafeSnapshot({ local: emptyLocal, session: targetSession([uiHint("leetcode", "other-problem")], []) }, LEETCODE_TARGET);
    expect(baseline.ok && e0.ok && one.ok && lifecycleUpdate.ok && duplicate.ok && duplicateHint.ok && removedHint.ok).toBe(true);
    expect(wrongHint).toEqual({ ok: false, reason: "observer_value_rejected" });
    if (!baseline.ok || !e0.ok || !one.ok || !lifecycleUpdate.ok || !duplicate.ok || !duplicateHint.ok || !removedHint.ok) return;
    const db0 = { captureEvents: 0, trainingSessions: 0, trainingAttempts: 0 };
    const b = reduceObservationSnapshot(undefined, baseline.value, db0, LEETCODE_TARGET);
    expect(b.ok).toBe(true);
    if (!b.ok || b.value === undefined) return;
    const s0 = reduceObservationSnapshot(b.value, e0.value, db0, LEETCODE_TARGET);
    expect(s0.ok).toBe(true);
    if (!s0.ok || s0.value === undefined) return;
    const s1 = reduceObservationSnapshot(s0.value, one.value, db0, LEETCODE_TARGET);
    expect(s1.ok).toBe(true);
    if (!s1.ok || s1.value === undefined) return;
    expect(reduceObservationSnapshot(s1.value, lifecycleUpdate.value, db0, LEETCODE_TARGET).ok).toBe(true);
    expect(reduceObservationSnapshot(s1.value, duplicate.value, db0, LEETCODE_TARGET)).toEqual({ ok: false, reason: "observer_stage_rejected" });
    expect(reduceObservationSnapshot(s1.value, duplicateHint.value, db0, LEETCODE_TARGET)).toEqual({ ok: false, reason: "observer_stage_rejected" });
    expect(reduceObservationSnapshot(s1.value, removedHint.value, db0, LEETCODE_TARGET)).toEqual({ ok: false, reason: "observer_stage_rejected" });
  });

  it("RED: hostile E1/E0 getters are never read and unknown nested keys fail closed", () => {
    const hostileE1 = e1Lifecycle("leetcode", "leetcode/submit/cn/merge-two-sorted-lists", "POST");
    const hostileHint = uiHint("leetcode", LEETCODE_TARGET.problemExternalId);
    let hintReads = 0;
    for (const key of ["sourceDocumentId", "observedAt"]) {
      Object.defineProperty(hostileHint, key, { get() { hintReads += 1; return undefined; }, enumerable: true });
    }
    const evidence = hostileE1.evidence as Record<string, unknown>;
    for (const key of ["requestId", "tabId", "frameId", "documentId", "receivedAt", "adapterVersion", "evidenceId", "apiTimeStamp"]) {
      Object.defineProperty(evidence, key, { get() { throw new Error(`read ${key}`); }, enumerable: true });
    }
    for (const key of ["outcome", "stableSubmissionId", "rejectionReason", "receivedAt"]) {
      Object.defineProperty(hostileE1, key, { get() { throw new Error(`read ${key}`); }, enumerable: true });
    }
    const result = projectSafeSnapshot({ local: emptyLocal, session: targetSession([hostileHint], [hostileE1]) }, LEETCODE_TARGET);
    expect(result.ok).toBe(true);
    expect(hintReads).toBe(0);
    if (result.ok) expect(result.value.target).toEqual({ e0: 1, e1: 1, submit: 1, status: 0 });

    const unknown = e1Lifecycle("leetcode", "leetcode/submit/cn/merge-two-sorted-lists", "POST");
    Object.defineProperty(unknown.evidence, "unknownNested", { get() { throw new Error("unknown nested read"); }, enumerable: true });
    expect(projectSafeSnapshot({ local: emptyLocal, session: targetSession([], [unknown]) }, LEETCODE_TARGET))
      .toEqual({ ok: false, reason: "observer_value_rejected" });
  });

  it("injects the target projector without reading forbidden lifecycle fields", async () => {
    const hostileE1 = e1Lifecycle("leetcode", "leetcode/submit/cn/merge-two-sorted-lists", "POST");
    const hostileHint = uiHint("leetcode", LEETCODE_TARGET.problemExternalId);
    const evidence = hostileE1.evidence as Record<string, unknown>;
    let forbiddenReads = 0;
    for (const key of ["sourceDocumentId", "observedAt"]) {
      Object.defineProperty(hostileHint, key, { get() { forbiddenReads += 1; return undefined; }, enumerable: true });
    }
    for (const key of ["requestId", "tabId", "frameId", "documentId", "receivedAt", "adapterVersion", "evidenceId", "apiTimeStamp", "statusCode"]) {
      Object.defineProperty(evidence, key, { get() { forbiddenReads += 1; return undefined; }, enumerable: true });
    }
    for (const key of ["outcome", "stableSubmissionId", "rejectionReason", "receivedAt"]) {
      Object.defineProperty(hostileE1, key, { get() { forbiddenReads += 1; return undefined; }, enumerable: true });
    }
    const initial = targetSession([hostileHint], []);
    const events = await runInjectedChange({ transientE1: { newValue: [hostileE1] } }, "session", LEETCODE_TARGET, initial);
    expect(forbiddenReads).toBe(0);
    expect(events.at(-1)).toMatchObject({ type: "snapshot", snapshot: { target: { e0: 1, e1: 1, submit: 1, status: 0 } } });

    const unknown = e1Lifecycle("leetcode", "leetcode/submit/cn/merge-two-sorted-lists", "POST");
    let unknownReads = 0;
    Object.defineProperty(unknown.evidence, "unknownNested", { get() { unknownReads += 1; return "secret"; }, enumerable: true });
    const rejected = await runInjectedChange({ transientE1: { newValue: [unknown] } }, "session", LEETCODE_TARGET, initial);
    expect(unknownReads).toBe(0);
    expect(rejected.at(-1)).toEqual({ type: "observer_value_rejected" });

    const missing = e1Lifecycle("leetcode", "leetcode/submit/cn/merge-two-sorted-lists", "POST");
    delete (missing.evidence as Record<string, unknown>).requestId;
    expect(projectSafeSnapshot({ local: emptyLocal, session: targetSession([hostileHint], [missing]) }, LEETCODE_TARGET))
      .toEqual({ ok: false, reason: "observer_value_rejected" });
    const missingInjected = await runInjectedChange({ transientE1: { newValue: [missing] } }, "session", LEETCODE_TARGET, initial);
    expect(missingInjected.at(-1)).toEqual({ type: "observer_value_rejected" });
  });

  it("serializes stage evidence without raw session cardinalities", () => {
    const graphql = e1Lifecycle("leetcode", "graphql", "POST");
    const snapshot = projectSafeSnapshot({ local: emptyLocal, session: targetSession([], [graphql]) }, LEETCODE_TARGET);
    expect(snapshot.ok).toBe(true);
    if (!snapshot.ok) return;
    const reduced = reduceObservationSnapshot(undefined, snapshot.value, { captureEvents: 0, trainingSessions: 0, trainingAttempts: 0 }, LEETCODE_TARGET);
    expect(reduced.ok).toBe(true);
    if (!reduced.ok || reduced.value === undefined) return;
    const evidence = projectStageEvidence(reduced.value, { captureEvents: 0, trainingSessions: 0, trainingAttempts: 0 });
    expect(evidence.ok).toBe(true);
    expect(JSON.stringify(evidence)).not.toContain("session");
    expect(JSON.stringify(evidence)).not.toContain("transientE1");
    expect(evidence.value).toMatchObject({ extension: { target: { e0: 0, e1: 0, submit: 0, status: 0 } } });
  });

  it("exports D4 evidence as bounded facts without identity, URL, or timestamps", () => {
    const { state, db } = leetCodeE2State();
    const evidence = projectD4AcceptanceEvidence(state, db);
    expect(evidence.ok).toBe(true);
    expect(evidence.value).toMatchObject({
      schemaVersion: 1,
      stage: "e2_confirmed",
      causalGrade: "UNRESOLVED",
      verdict: "PROFILE_UNRESOLVED",
      facts: {
        authorizedActions: 1,
        exactSubmitCorroboration: 1,
        stableResultLifecycles: 1,
        e2Confirmed: 1,
      },
    });
    const serialized = JSON.stringify(evidence);
    for (const forbidden of [
      "741526004",
      "merge-two-sorted-lists",
      "hostile-document",
      "hostile-request-id",
      "2026-08-11",
      "http",
      "storageKey",
      "externalSubmissionId",
    ]) {
      expect(serialized).not.toContain(forbidden);
    }
  });
});
