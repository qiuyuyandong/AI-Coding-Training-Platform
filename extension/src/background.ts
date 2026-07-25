import {
  isVerdictCandidateMessage,
} from "./attemptCapture";
import {
  postCaptureAttemptBundle,
} from "./captureTransport";
import {
  runtimeContextFromStored,
  type CaptureRuntimeContext,
} from "./installation";
import {
  isPairCaptureInstallationMessage,
  pairingEndpointFromCaptureEndpoint,
  parsePairCaptureApiResponse,
  type PairCaptureInstallationMessage,
  type PairCaptureResult,
} from "./pairing";
import {
  drainCaptureOutbox,
  persistCaptureOutboxPlan,
  type CaptureOutboxPlan,
  type CaptureOutboxState,
} from "./outboxDrain";
import { createSerializedWorkExecutor } from "./serializedWork";
import {
  createRegistryRequestLifecycleSource,
  createWebRequestObserver,
  registerNetworkObserverListeners,
  type WebRequestDetails,
} from "./networkObserver";
import { settleExtensionOperation } from "./extensionOperation";
import { isUiHintMessage, UI_HINT_TTL_MS } from "./uiHint";
import { MAIN_WORLD_RELAY_FORWARD_TYPE } from "./mainWorldRelay";
import {
  AMBIGUITY_TTL_MS,
  E1_LIFECYCLE_TTL_MS,
  UNMATCHED_E3_TTL_MS,
  type TransientSessionEvidenceState,
} from "./transientEvidenceStorage";
import {
  correlateMainSummary,
  createCorrelatorState,
  mergeE1Lifecycle,
  parseMainBridgeSummary,
  type CorrelatorState,
  type MainBridgeSummary,
} from "./submissionCorrelator";
import { readTransientSessionEvidenceState } from "./transientEvidenceStorage";
import { parseSafeEvidence, type E3FinalVerdictConfirmed } from "./evidence";
import {
  createBackgroundOrchestrator,
  type Orchestrator,
  type OrchestratorEffects,
  type OrchestratorEvent,
  type OrchestratorState,
  type OrchestratorUserAction,
} from "./backgroundOrchestrator";

const FLUSH_ALARM_NAME = "flushCaptureOutbox";
const UI_HINT_CLEANUP_ALARM_NAME = "expireCaptureUiHints";
const WEBREQUEST_SPIKE_URL =
  "https://atcoder.jp/__capture_v4_webrequest_spike__/submit";
const WEBREQUEST_SPIKE_MARKER_LIMIT = 8;
let activeOutboxFlush: Promise<void> | undefined;
let cachedSnapshot: OrchestratorState | undefined;

const orchestrator: Orchestrator = createBackgroundOrchestrator({
  storage: {
    local: chromeArea(chrome.storage.local),
    session: chromeArea(chrome.storage.session),
  },
  now: () => new Date().toISOString(),
  flushOutbox: async () => {
    await flushOutbox();
  },
});

const PRUNE_DEADLINE_KEYS = [
  "uiHints",
  "transientE1",
  "transientUnmatchedE3",
  "transientAmbiguityDiagnostics",
] as const;

/**
 * Compute the earliest ISO timestamp at which any transient session slice
 * will exceed its bounded TTL, or `undefined` when every slice is empty or
 * already past expiry. Pure: reads only the supplied state and the `now`
 * clock; no chrome.* access. The deadline is the minimum across the four
 * transient categories the orchestrator prunes (E0 hints, E1 lifecycles,
 * unmatched E3 finals, ambiguity diagnostics).
 */
function nextSessionPruneDeadline(
  now: string,
  state: TransientSessionEvidenceState,
): string | undefined {
  const nowMs = Date.parse(now);
  if (!Number.isFinite(nowMs)) return undefined;
  let earliest = Number.POSITIVE_INFINITY;
  for (const hint of state.uiHints) {
    const ms = Date.parse(hint.observedAt) + UI_HINT_TTL_MS;
    if (Number.isFinite(ms) && ms > nowMs && ms < earliest) earliest = ms;
  }
  for (const lifecycle of state.requestLifecycles) {
    const ms = Date.parse(lifecycle.receivedAt) + E1_LIFECYCLE_TTL_MS;
    if (Number.isFinite(ms) && ms > nowMs && ms < earliest) earliest = ms;
  }
  for (const unmatched of state.unmatchedE3) {
    const ms = Date.parse(unmatched.receivedAt) + UNMATCHED_E3_TTL_MS;
    if (Number.isFinite(ms) && ms > nowMs && ms < earliest) earliest = ms;
  }
  for (const diagnostic of state.ambiguityDiagnostics) {
    const ms = Date.parse(diagnostic.receivedAt) + AMBIGUITY_TTL_MS;
    if (Number.isFinite(ms) && ms > nowMs && ms < earliest) earliest = ms;
  }
  if (!Number.isFinite(earliest)) return undefined;
  return new Date(earliest).toISOString();
}

function persistenceAsTransientState(
  persistence: OrchestratorEffects["persistence"],
): TransientSessionEvidenceState {
  return {
    uiHints: persistence.e0Hints,
    requestLifecycles: persistence.transientE1,
    pageContexts: persistence.pageContexts,
    unmatchedE3: persistence.unmatchedFinals,
    ambiguityDiagnostics: persistence.ambiguityDiagnostics,
  };
}

/**
 * Guarantee the cleanup alarm slot is populated. Chrome fires `onAlarm` only
 * for alarms that are currently scheduled; clearing the alarm after the last
 * prune would leave idle installs without any idle-day driver for the bounded
 * E0/E1 session prune. We treat the slot as a permanent fixture and replace
 * missing entries with a safe periodic fallback that fires once a minute.
 */
async function ensurePruneAlarmSlot(): Promise<void> {
  const existing = await chrome.alarms.get(UI_HINT_CLEANUP_ALARM_NAME);
  if (existing !== undefined) return;
  await settleExtensionOperation(
    () => chrome.alarms.create(UI_HINT_CLEANUP_ALARM_NAME, { periodInMinutes: 1 }),
    (error) => console.warn("[capture-v4] ui hint cleanup alarm slot was not created", error),
  );
}

/**
 * Re-anchor the cleanup alarm after a session mutation. When a concrete
 * deadline is computable we set a one-shot `when` so the alarm fires exactly
 * when the oldest transient slice expires; otherwise we delegate to
 * `ensurePruneAlarmSlot` so the slot is never empty.
 */
async function reschedulePruneAlarm(nextDeadline?: string): Promise<void> {
  if (nextDeadline !== undefined) {
    const whenMs = Date.parse(nextDeadline);
    if (Number.isFinite(whenMs)) {
      await settleExtensionOperation(
        () => chrome.alarms.create(UI_HINT_CLEANUP_ALARM_NAME, { when: whenMs }),
        (error) => console.warn("[capture-v4] ui hint cleanup alarm was not scheduled", error),
      );
      return;
    }
  }
  await ensurePruneAlarmSlot();
}

async function scheduleUiHintCleanupAlarm(
  state: TransientSessionEvidenceState,
): Promise<void> {
  const deadline = nextSessionPruneDeadline(new Date().toISOString(), state);
  await reschedulePruneAlarm(deadline);
}

async function scheduleUiHintCleanupAlarmFromSession(): Promise<void> {
  const stored = await chrome.storage.session.get([...PRUNE_DEADLINE_KEYS]);
  const transient = readTransientSessionEvidenceState(stored);
  await scheduleUiHintCleanupAlarm(transient);
}

const initialization = (async (): Promise<void> => {
  const effects = await orchestrator.install();
  await applyPersistence(effects);
})();

const executor = createSerializedWorkExecutor(initialization, (error) => {
  console.error("[capture-v4] operation failed", error);
});

chrome.webRequest.onBeforeRequest.addListener(
  (details) => {
    if (details.method !== "POST" || details.url !== WEBREQUEST_SPIKE_URL
      || details.tabId < 0 || details.frameId !== 0
      || typeof details.documentId !== "string" || details.documentId.length === 0) {
      return;
    }
    const marker = {
      requestId: details.requestId,
      method: details.method,
      endpointKey: "synthetic_submission_spike",
      tabId: details.tabId,
      frameId: details.frameId,
      documentId: details.documentId,
      receivedAt: new Date().toISOString(),
    };
    executor.schedule(async () => {
      const stored = await chrome.storage.session.get(["webRequestSpikeMarkers"]);
      const markers = readWebRequestSpikeMarkers(stored.webRequestSpikeMarkers);
      await chrome.storage.session.set({
        webRequestSpikeMarkers: [
          ...markers.filter((candidate) => candidate.requestId !== marker.requestId),
          marker,
        ].slice(-WEBREQUEST_SPIKE_MARKER_LIMIT),
      });
    });
    return undefined;
  },
  {
    urls: [WEBREQUEST_SPIKE_URL],
    types: ["xmlhttprequest"],
  },
);

const networkObserver = createWebRequestObserver(
  createRegistryRequestLifecycleSource(() => new Date().toISOString()),
);

registerNetworkObserverListeners(
  (kind, callback, filter) => {
    const chromeFilter: chrome.webRequest.RequestFilter = {
      urls: [...filter.urls],
      types: [...filter.types] as chrome.webRequest.ResourceType[],
    };
    switch (kind) {
      case "onBeforeRequest":
        chrome.webRequest.onBeforeRequest.addListener(
          (details) => { callback(toObserverDetails(details)); return undefined; },
          chromeFilter,
        );
        break;
      case "onBeforeRedirect":
        chrome.webRequest.onBeforeRedirect.addListener(
          (details) => {
            callback(toObserverDetails(details), details.redirectUrl);
          },
          chromeFilter,
        );
        break;
      case "onResponseStarted":
        chrome.webRequest.onResponseStarted.addListener(
          (details) => {
            callback(toObserverDetails(details), details.statusCode);
          },
          chromeFilter,
        );
        break;
      case "onCompleted":
        chrome.webRequest.onCompleted.addListener(
          (details) => { callback(toObserverDetails(details)); },
          chromeFilter,
        );
        break;
      case "onErrorOccurred":
        chrome.webRequest.onErrorOccurred.addListener(
          (details) => {
            callback(toObserverDetails(details), details.error);
          },
          chromeFilter,
        );
        break;
    }
  },
  networkObserver,
  (outcome) => {
    if (outcome.kind !== "recorded" || outcome.lifecycle.kind !== "request_observed") return;
    const evidence = outcome.lifecycle;
    executor.schedule(async () => {
      await applyOrchestratorEvent({
        kind: "e1_recorded",
        evidence,
        tabId: evidence.tabId,
        frameId: evidence.frameId,
        documentId: evidence.documentId,
        adapterVersion: evidence.adapterVersion,
      });
    });
  },
  (work: () => Promise<void>) => { executor.schedule(work); },
);

type ChromeObserverDetails = Readonly<{
  requestId: string;
  url: string;
  method: string;
  tabId: number;
  frameId: number;
  documentId?: string | undefined;
  parentFrameId?: number | undefined;
  timeStamp: number;
  type: string;
}>;

function toObserverDetails(details: ChromeObserverDetails): WebRequestDetails {
  return {
    requestId: details.requestId,
    url: details.url,
    method: details.method,
    tabId: details.tabId,
    frameId: details.frameId,
    ...(details.documentId === undefined ? {} : { documentId: details.documentId }),
    ...(details.parentFrameId === undefined ? {} : { parentFrameId: details.parentFrameId }),
    timeStamp: details.timeStamp,
    type: details.type,
  };
}

chrome.runtime.onInstalled.addListener(() => {
  // Guarantee the cleanup alarm slot is populated before any async work so
  // even an empty-session install wakes up with a periodic prune driver.
  void ensurePruneAlarmSlot();
  void initialization.then(async () => {
    await scheduleUiHintCleanupAlarmFromSession();
  });
  void settleExtensionOperation(
    () => chrome.alarms.create(FLUSH_ALARM_NAME, { periodInMinutes: 1 }),
    (error) => console.warn("[capture-v4] flush alarm was not created", error),
  );
});

chrome.runtime.onStartup.addListener(() => {
  // The cleanup alarm is independent of the outbox flush; establishing it
  // first lets idle-day prunes fire even when the outbox drain is stalled on
  // a slow network. The serialized executor can still interleave the two
  // safely — both helpers only touch distinct chrome.* APIs.
  void ensurePruneAlarmSlot();
  executor.schedule(async () => {
    await flushOutbox();
    await scheduleUiHintCleanupAlarmFromSession();
  });
});

chrome.runtime.onMessage.addListener((message: unknown, sender, sendResponse) => {
  if (isCaptureContextRequest(message)) {
    void initialization.then(readRuntimeContext).then(sendResponse).catch(() => sendResponse(undefined));
    return true;
  }
  if (isCaptureStateRequest(message)) {
    void respondCaptureState(sendResponse);
    return true;
  }
  if (isPairCaptureInstallationMessage(message)) {
    executor.schedule(async () => {
      sendResponse(await pairCaptureInstallation(message));
    });
    return true;
  }
  if (isMainWorldRelayMessage(message, sender)) {
    executor.schedule(() => applyMainBridgeSummary(message.summary));
    return false;
  }
  const e3Evidence = readE3RecordedMessage(message);
  if (e3Evidence !== undefined) {
    executor.schedule(async () => { await applyOrchestratorEvent({ kind: "e3_recorded", evidence: e3Evidence }); });
    return false;
  }
  if (isUiHintMessage(message)) {
    executor.schedule(async () => {
      await applyOrchestratorEvent({
        kind: "e0_recorded",
        hint: message.hint,
        sourceDocumentId: sender.documentId,
      });
    });
    return false;
  }
  if (isVerdictCandidateMessage(message)) {
    executor.schedule(async () => {
      await applyOrchestratorEvent({
        kind: "v3_verdict_observed",
        candidate: message.candidate,
        senderDocumentId: sender.documentId,
      });
    });
    return false;
  }
  if (isActionMessage(message)) {
    executor.schedule(async () => {
      const effects = await applyOrchestratorEvent({
        kind: "user_action",
        action: toOrchestratorAction(message),
      });
      sendResponse(effects.state);
    });
    return true;
  }
  return false;
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === UI_HINT_CLEANUP_ALARM_NAME) {
    // The orchestrator prunes transient evidence on every install and every
    // apply; the alarm keeps the E0 hint prune window honest on idle days.
    executor.schedule(async () => { await pruneOrchestratorSession(); });
    return;
  }
  if (alarm.name === FLUSH_ALARM_NAME) {
    executor.schedule(async () => { await flushOutbox(); });
  }
});

function chromeArea(
  area: typeof chrome.storage.local,
): {
  readonly get: (keys: readonly string[]) => Promise<Record<string, unknown>>;
  readonly set: (items: Record<string, unknown>) => Promise<void>;
  readonly remove: (key: string) => Promise<void>;
} {
  return {
    get: async (keys: readonly string[]) => {
      return area.get([...keys]);
    },
    set: async (items: Record<string, unknown>) => {
      await area.set(items);
    },
    remove: async (key: string) => {
      await area.remove(key);
    },
  };
}

async function applyOrchestratorEvent(event: OrchestratorEvent): Promise<OrchestratorEffects> {
  const effects = await orchestrator.apply(event);
  await applyPersistence(effects);
  return effects;
}

async function applyPersistence(effects: OrchestratorEffects): Promise<void> {
  cachedSnapshot = effects.state;
  if (effects.persistence.local.length > 0) {
    const items: Record<string, unknown> = {};
    for (const write of effects.persistence.local) items[write.key] = write.value;
    await chrome.storage.local.set(items);
  }
  for (const key of effects.persistence.localRemovals) {
    await chrome.storage.local.remove(key);
  }
  if (effects.persistence.session.length > 0) {
    const items: Record<string, unknown> = {};
    for (const write of effects.persistence.session) items[write.key] = write.value;
    await chrome.storage.session.set(items);
  }
  for (const key of effects.persistence.sessionRemovals) {
    await chrome.storage.session.remove(key);
  }
  // Always reschedule the cleanup alarm at the end of every apply so the
  // slot survives Chrome consuming the one-shot `when` after the alarm
  // fires. A no-diff prune (empty session) must still re-anchor the alarm;
  // when no concrete deadline is computable, `ensurePruneAlarmSlot` fills
  // the slot with the periodic fallback.
  await scheduleUiHintCleanupAlarm(persistenceAsTransientState(effects.persistence));
  for (const work of effects.executorSchedule) {
    executor.schedule(work.work);
  }
}

async function refreshCachedSnapshot(): Promise<OrchestratorState> {
  const snapshot = await orchestrator.snapshot();
  cachedSnapshot = snapshot;
  return snapshot;
}

async function applyMainBridgeSummary(summary: MainBridgeSummary): Promise<void> {
  const stored = await chrome.storage.session.get(["transientE1"]);
  const transient = readTransientSessionEvidenceState(stored);
  let correlator: CorrelatorState = createCorrelatorState();
  for (const lifecycle of transient.requestLifecycles) {
    const merged = mergeE1Lifecycle(correlator, lifecycle.evidence);
    if (merged.kind === "merged") correlator = merged.state;
  }
  const result = correlateMainSummary(correlator, summary, 5000);
  switch (result.kind) {
    case "correlated":
      await applyOrchestratorEvent({
        kind: "main_bridge_correlated",
        correlated: result,
        summary,
        tabId: summary.tabId,
        frameId: summary.frameId,
        documentId: summary.documentId,
      });
      return;
    case "ambiguous":
      await applyOrchestratorEvent({ kind: "main_bridge_ambiguous", ambiguous: result });
      return;
    case "no_match":
      await applyOrchestratorEvent({ kind: "main_bridge_no_match", noMatch: result, summary });
      return;
    case "rejected":
      await applyOrchestratorEvent({ kind: "main_bridge_rejected", rejected: result, summary });
  }
}

function isMainWorldRelayMessage(
  value: unknown,
  sender: chrome.runtime.MessageSender,
): value is { readonly type: typeof MAIN_WORLD_RELAY_FORWARD_TYPE; readonly summary: MainBridgeSummary } {
  if (typeof value !== "object" || value === null
    || Reflect.get(value, "type") !== MAIN_WORLD_RELAY_FORWARD_TYPE) return false;
  const parsed = parseMainBridgeSummary(Reflect.get(value, "summary"));
  if (!parsed.ok) return false;
  return sender.tab?.id === parsed.value.tabId
    && sender.frameId === parsed.value.frameId
    && sender.documentId === parsed.value.documentId;
}

function readE3RecordedMessage(value: unknown): E3FinalVerdictConfirmed | undefined {
  if (typeof value !== "object" || value === null || Reflect.get(value, "type") !== "V4_E3_RECORDED") {
    return undefined;
  }
  const parsed = parseSafeEvidence(Reflect.get(value, "evidence"));
  return parsed.ok && parsed.value.kind === "final_verdict_confirmed" ? parsed.value : undefined;
}

async function pruneOrchestratorSession(): Promise<void> {
  // The cleanup alarm drives the idle-day prune path. Background is the sole
  // writer: ask the orchestrator for a prune-shaped effects diff and let
  // `applyPersistence` commit the resulting session writes exactly once.
  const effects = await orchestrator.pruneOrchestratorSession(new Date().toISOString());
  await applyPersistence(effects);
}

async function respondCaptureState(
  sendResponse: (response: unknown) => void,
): Promise<void> {
  if (cachedSnapshot !== undefined) {
    sendResponse(cachedSnapshot);
    return;
  }
  try {
    await initialization;
    const snapshot = cachedSnapshot ?? await orchestrator.snapshot();
    cachedSnapshot = snapshot;
    sendResponse(snapshot);
  } catch {
    sendResponse(undefined);
  }
}

function flushOutbox(): Promise<void> {
  if (activeOutboxFlush !== undefined) return activeOutboxFlush;
  const drain = drainCaptureOutbox({
    readState: readOutboxState,
    send: async (item) => {
      const stored = await chrome.storage.local.get(["captureEndpoint", "captureCredential"]);
      return postCaptureAttemptBundle({
        bundle: item.bundle,
        endpoint: stored.captureEndpoint,
        credential: stored.captureCredential,
      });
    },
    persist: persistOutboxPlan,
  }).then(async (outcome) => {
    await refreshCachedSnapshot();
    if (outcome.reason === "batch_limit") executor.schedule(async () => { await flushOutbox(); });
  });
  activeOutboxFlush = drain.finally(() => {
    activeOutboxFlush = undefined;
  });
  return activeOutboxFlush;
}

async function readOutboxState(): Promise<CaptureOutboxState> {
  const stored = await chrome.storage.local.get(["captureOutbox", "captureQuarantine"]);
  return {
    outbox: readOutbox(stored.captureOutbox),
    quarantine: readQuarantine(stored.captureQuarantine),
  };
}

async function persistOutboxPlan(plan: CaptureOutboxPlan): Promise<void> {
  await persistCaptureOutboxPlan(chrome.storage.local, plan);
}

async function readRuntimeContext(): Promise<CaptureRuntimeContext> {
  const stored = await chrome.storage.local.get([
    "installationId", "captureEnabled", "captureCredential",
  ]);
  return runtimeContextFromStored(stored);
}

async function pairCaptureInstallation(
  message: PairCaptureInstallationMessage,
): Promise<PairCaptureResult> {
  const state = await chrome.storage.local.get(["captureEndpoint", "installationId"]);
  if (typeof state.installationId !== "string" || state.installationId.length === 0) {
    return { ok: false, error: "Extension installation is not initialized" };
  }
  try {
    const response = await fetch(pairingEndpointFromCaptureEndpoint(state.captureEndpoint), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ code: message.code, installationId: state.installationId }),
    });
    if (!response.ok) return { ok: false, error: await response.text() || response.statusText };
    const body: unknown = await response.json();
    const paired = parsePairCaptureApiResponse(body, state.installationId);
    await chrome.storage.local.set({
      captureCredential: paired.credential,
      captureCredentialVersion: paired.credentialVersion,
      pairedAt: new Date().toISOString(),
    });
    await chrome.storage.local.remove("lastCaptureError");
    await refreshCachedSnapshot();
    await flushOutbox();
    return { ok: true, installationId: paired.installationId, credentialVersion: paired.credentialVersion };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Pairing failed" };
  }
}

type ActionMessage = {
  readonly type: "RETRY_CAPTURE_OUTBOX" | "CLEAR_CAPTURE_OUTBOX" | "CLEAR_CAPTURE_QUARANTINE";
} | {
  readonly type: "RETRY_QUARANTINED_CAPTURE" | "DELETE_QUARANTINED_CAPTURE";
  readonly id: string;
};

function isActionMessage(value: unknown): value is ActionMessage {
  if (typeof value !== "object" || value === null || !("type" in value)) return false;
  if (
    value.type === "RETRY_CAPTURE_OUTBOX"
    || value.type === "CLEAR_CAPTURE_OUTBOX"
    || value.type === "CLEAR_CAPTURE_QUARANTINE"
  ) return true;
  return (
    value.type === "RETRY_QUARANTINED_CAPTURE"
    || value.type === "DELETE_QUARANTINED_CAPTURE"
  ) && "id" in value && typeof value.id === "string";
}

function toOrchestratorAction(message: ActionMessage): OrchestratorUserAction {
  switch (message.type) {
    case "RETRY_CAPTURE_OUTBOX":
      return { type: "RETRY_CAPTURE_OUTBOX" };
    case "CLEAR_CAPTURE_OUTBOX":
      return { type: "CLEAR_CAPTURE_OUTBOX" };
    case "CLEAR_CAPTURE_QUARANTINE":
      return { type: "CLEAR_CAPTURE_QUARANTINE" };
    case "RETRY_QUARANTINED_CAPTURE":
      return { type: "RETRY_QUARANTINED_CAPTURE", id: message.id };
    case "DELETE_QUARANTINED_CAPTURE":
      return { type: "DELETE_QUARANTINED_CAPTURE", id: message.id };
  }
}

function isCaptureContextRequest(value: unknown): boolean {
  return typeof value === "object" && value !== null
    && "type" in value && value.type === "GET_CAPTURE_CONTEXT";
}

function isCaptureStateRequest(value: unknown): boolean {
  return typeof value === "object" && value !== null
    && "type" in value && value.type === "GET_CAPTURE_STATE";
}

type WebRequestSpikeMarker = {
  readonly requestId: string;
  readonly method: "POST";
  readonly endpointKey: "synthetic_submission_spike";
  readonly tabId: number;
  readonly frameId: 0;
  readonly documentId: string;
  readonly receivedAt: string;
};

function readWebRequestSpikeMarkers(
  value: unknown,
): readonly WebRequestSpikeMarker[] {
  return Array.isArray(value) ? value.filter(isWebRequestSpikeMarker) : [];
}

function isWebRequestSpikeMarker(value: unknown): value is WebRequestSpikeMarker {
  return typeof value === "object" && value !== null
    && "requestId" in value && typeof value.requestId === "string"
    && "method" in value && value.method === "POST"
    && "endpointKey" in value && value.endpointKey === "synthetic_submission_spike"
    && "tabId" in value && typeof value.tabId === "number" && value.tabId >= 0
    && "frameId" in value && value.frameId === 0
    && "documentId" in value && typeof value.documentId === "string"
    && value.documentId.length > 0
    && "receivedAt" in value && typeof value.receivedAt === "string";
}

// Local outbox/quarantine readers that the V3 flush helpers still expect.
// They tolerate unknown shapes without ever reading beyond what is supplied.

import type { CaptureOutboxItem, CaptureQuarantineItem } from "./attemptStorage";

function readOutbox(value: unknown): readonly CaptureOutboxItem[] {
  return Array.isArray(value) ? value.filter(isOutboxItem) : [];
}

function isOutboxItem(value: unknown): value is CaptureOutboxItem {
  return typeof value === "object" && value !== null
    && "kind" in value && Reflect.get(value, "kind") === "attempt_bundle"
    && "id" in value && typeof Reflect.get(value, "id") === "string"
    && "bundle" in value && typeof Reflect.get(value, "bundle") === "object"
    && Reflect.get(value, "bundle") !== null
    && "attempts" in value && typeof Reflect.get(value, "attempts") === "number"
    && "createdAt" in value && typeof Reflect.get(value, "createdAt") === "string";
}

function readQuarantine(value: unknown): readonly CaptureQuarantineItem[] {
  return Array.isArray(value) ? value.filter(isQuarantineItem) : [];
}

function isQuarantineItem(value: unknown): value is CaptureQuarantineItem {
  return typeof value === "object" && value !== null
    && "id" in value && typeof Reflect.get(value, "id") === "string"
    && "item" in value && isOutboxItem(Reflect.get(value, "item"))
    && "error" in value && typeof Reflect.get(value, "error") === "string"
    && "quarantinedAt" in value && typeof Reflect.get(value, "quarantinedAt") === "string";
}