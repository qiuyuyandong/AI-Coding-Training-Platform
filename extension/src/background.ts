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
  createCharacterizationObserver,
  registerCharacterizationObserverListeners,
  type WebRequestDetails,
} from "./networkObserver";
import {
  createCharacterizationController,
  createBrowseOnlyNavigationExportDocument,
  characterizeSessionStatus,
  selectCharacterizationExportMode,
  shouldCollectCharacterizationEvidence,
  type CharacterizationController,
} from "./characterization";
import { blocksNowCoderProductionIngress } from "./characterizationIngress";
import { readNavigationWitness } from "./characterizationNavigationWitness";
import {
  B3_BUILD_SHA,
  type B3WitnessState,
  transitionB3Witness,
  startB3State,
  invalidateB3State,
  stopB3State,
  canB3Export,
  buildB3E0Records,
  readB3WitnessState,
  planB3WitnessStateWrite,
  isB3StateExpired,
} from "./b3Witness";
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
  NOWCODER_NETWORK_POLICY,
  NOWCODER_STATUS_ENDPOINT_KEY,
  NOWCODER_SUBMIT_ENDPOINT_KEY,
  selectNowCoderConfirmation,
} from "./adapters/nowcoder/network";
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
const CHARACTERIZATION_EXPIRY_ALARM_NAME = "expireNowCoderCharacterization";
const WEBREQUEST_SPIKE_URL =
  "https://atcoder.jp/__capture_v4_webrequest_spike__/submit";
const WEBREQUEST_SPIKE_MARKER_LIMIT = 8;
let activeOutboxFlush: Promise<void> | undefined;
let cachedSnapshot: OrchestratorState | undefined;
const characterizationClock = (): string => new Date().toISOString();

/**
 * Synchronous snapshot of whether NowCoder characterization is active.
 * Set true BEFORE the serialized start-task is scheduled so the production
 * webRequest observer can skip scheduling any NowCoder work synchronously
 * (the session-backed check still acts as a worker-restart safety net).
 */
let characterizationProductionGuard = false;

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

/** Characterization controller - session-only, never affects production state. */
const characterizationController: CharacterizationController = createCharacterizationController({

  get: async (keys: readonly string[]) => {
    return chrome.storage.session.get([...keys]);
  },
  set: async (items: Record<string, unknown>) => {
    await chrome.storage.session.set(items);
  },
  remove: async (key: string) => {
    await chrome.storage.session.remove(key);
  },
}, characterizationClock);

// ---------------------------------------------------------------------------
// B3 Navigation Witness Controller
// Serializes all B3 transitions to prevent concurrent get-modify-set races.
// Stored independently from CharacterizationSession (separate chrome.storage.session key).
// ---------------------------------------------------------------------------

type B3SessionStorage = {
  readonly get: (keys: readonly string[]) => Promise<Record<string, unknown>>;
  readonly set: (items: Record<string, unknown>) => Promise<void>;
  readonly remove: (key: string) => Promise<void>;
};

const b3Storage: B3SessionStorage = {
  get: async (keys: readonly string[]) => chrome.storage.session.get([...keys]),
  set: async (items: Record<string, unknown>) => chrome.storage.session.set(items),
  remove: async (key: string) => chrome.storage.session.remove(key),
};

/**
 * Read current B3 state from storage.
 */
async function readCurrentB3State(): Promise<B3WitnessState> {
  const stored = await b3Storage.get(["b3WitnessState"]);
  const state = readB3WitnessState(stored);
  // If expired, transition to invalid
  const now = characterizationClock();
  if (isB3StateExpired(state, now)) {
    const invalid = invalidateB3State(state, "expired", B3_BUILD_SHA);
    await b3Storage.set(planB3WitnessStateWrite(invalid).items);
    return invalid;
  }
  return state;
}

/**
 * Apply a B3 navigation witness transition.
 * SERIALIZED via executor to prevent concurrent get-modify-set races.
 * Returns the new state or undefined if transition failed.
 */
async function applyB3NavigationWitness(
  pageClass: "contest_list" | "contest_problem",
  documentId: string,
  tabId: number,
  receivedAt: string,
): Promise<B3WitnessState | undefined> {
  const current = await readCurrentB3State();
  const next = transitionB3Witness(current, pageClass, documentId, tabId, receivedAt, B3_BUILD_SHA);
  if (next === undefined) {
    const invalid = invalidateB3State(current, "invalid_transition", B3_BUILD_SHA);
    await b3Storage.set(planB3WitnessStateWrite(invalid).items);
    return invalid;
  }
  await b3Storage.set(planB3WitnessStateWrite(next).items);
  return next;
}

/**
 * Start B3 state (called when characterization START is triggered).
 */
async function startB3Session(): Promise<B3WitnessState> {
  const now = characterizationClock();
  const state = startB3State(now, B3_BUILD_SHA);
  await b3Storage.set(planB3WitnessStateWrite(state).items);
  return state;
}

/**
 * Stop B3 state (called when characterization STOP is triggered).
 */
async function stopB3Session(): Promise<B3WitnessState> {
  const current = await readCurrentB3State();
  const stopped = stopB3State(current, B3_BUILD_SHA);
  await b3Storage.set(planB3WitnessStateWrite(stopped).items);
  return stopped;
}

/**
 * Clear B3 state on expiry alarm.
 */
async function expireB3Session(): Promise<B3WitnessState> {
  const current = await readCurrentB3State();
  const expired = invalidateB3State(current, "expired", B3_BUILD_SHA);
  await b3Storage.set(planB3WitnessStateWrite(expired).items);
  return expired;
}

/**
 * Check if B3 export is possible.
 */
async function canB3ExportNow(): Promise<boolean> {
  const state = await readCurrentB3State();
  return canB3Export(state, characterizationClock(), B3_BUILD_SHA);
}

/**
 * Get current B3 state for popup.
 */
async function getB3State(): Promise<B3WitnessState> {
  return readCurrentB3State();
}

async function scheduleCharacterizationExpiry(session: { readonly active: boolean; readonly expiresAt: string }): Promise<void> {
  if (!session.active) {
    await chrome.alarms.clear(CHARACTERIZATION_EXPIRY_ALARM_NAME);
    return;
  }
  const when = Date.parse(session.expiresAt);
  if (!Number.isFinite(when)) return;
  await chrome.alarms.create(CHARACTERIZATION_EXPIRY_ALARM_NAME, { when });
}

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
  // B3.1: Do NOT unconditionally stop characterization here.
  // Session-backed state must survive MV3 worker restarts.
  // Read the persisted session to set the production guard.
  const session = await characterizationController.getSession();
  characterizationProductionGuard = session.active;
  // B3: Read persisted B3 state. chrome.storage.session survives worker restarts
  // but NOT extension reloads (as required). Handle expiry if present.
  const b3State = await readCurrentB3State();
  if (b3State.status === "invalid" && b3State.invalidReason === "expired") {
    // Transition expired state to armed (clear invalidReason) on startup
    const cleared = stopB3State(b3State, B3_BUILD_SHA);
    await b3Storage.set(planB3WitnessStateWrite(cleared).items);
  }
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

function skipNowCoderProduction(details: ChromeObserverDetails): boolean {
  if (!characterizationProductionGuard) return false;
  try { return new URL(details.url).hostname === "ac.nowcoder.com" || new URL(details.url).hostname === "www.nowcoder.com"; } catch { return false; }
}

async function applyNowCoderStatusConfirmation(
  details: WebRequestDetails,
  rawUrl: string,
): Promise<void> {
  if (details.method !== "GET" || details.type !== "xmlhttprequest"
    || details.documentId === undefined) return;
  if (await blocksNowCoderProductionIngress("nowcoder", characterizationController)) return;
  const stored = await chrome.storage.session.get(["uiHints", "transientE1"]);
  const transient = readTransientSessionEvidenceState(stored);
  const statusLifecycle = transient.requestLifecycles.find((entry) =>
    entry.evidence.platform === "nowcoder"
    && entry.evidence.requestId === details.requestId
    && entry.evidence.endpointKey === NOWCODER_STATUS_ENDPOINT_KEY);
  if (statusLifecycle === undefined) return;
  const submitCandidates = transient.requestLifecycles
    .filter((entry) =>
      entry.evidence.platform === "nowcoder"
      && entry.evidence.endpointKey === NOWCODER_SUBMIT_ENDPOINT_KEY)
    .map((entry) => entry.evidence);
  const problemCandidates = transient.uiHints
    .filter((hint) =>
      hint.platform === "nowcoder"
      && hint.sourceDocumentId === statusLifecycle.evidence.documentId)
    .map((hint) => ({
      problemExternalId: hint.problemExternalId,
      observedAt: hint.observedAt,
      tabId: statusLifecycle.evidence.tabId,
      frameId: statusLifecycle.evidence.frameId,
      documentId: hint.sourceDocumentId,
    }));
  const confirmation = selectNowCoderConfirmation({
    statusEvidence: statusLifecycle.evidence,
    statusUrl: rawUrl,
    submitCandidates,
    problemCandidates,
    now: new Date().toISOString(),
  });
  if (confirmation.kind !== "confirmed") return;
  await applyOrchestratorEvent({
    kind: "e2_recorded",
    evidence: confirmation.evidence,
    matchedSubmitRequestId: confirmation.matchedSubmitRequestId,
  });
}

registerNetworkObserverListeners(
  (kind, callback, filter) => {
    const chromeFilter: chrome.webRequest.RequestFilter = {
      urls: [...filter.urls],
      types: [...filter.types] as chrome.webRequest.ResourceType[],
    };
    switch (kind) {
      case "onBeforeRequest":
        chrome.webRequest.onBeforeRequest.addListener(
          (details) => { if (!skipNowCoderProduction(details)) callback(toObserverDetails(details)); return undefined; },
          chromeFilter,
        );
        break;
      case "onBeforeRedirect":
        chrome.webRequest.onBeforeRedirect.addListener(
          (details) => {
            if (!skipNowCoderProduction(details)) callback(toObserverDetails(details), details.redirectUrl);
          },
          chromeFilter,
        );
        break;
      case "onResponseStarted":
        chrome.webRequest.onResponseStarted.addListener(
          (details) => {
            if (!skipNowCoderProduction(details)) callback(toObserverDetails(details), details.statusCode);
          },
          chromeFilter,
        );
        break;
      case "onCompleted":
        chrome.webRequest.onCompleted.addListener(
          (details) => {
            if (skipNowCoderProduction(details)) return;
            const observerDetails = toObserverDetails(details);
            callback(observerDetails);
            if (details.url.startsWith("https://ac.nowcoder.com/nccommon/status")) {
              executor.schedule(async () => {
                await applyNowCoderStatusConfirmation(observerDetails, details.url);
              });
            }
          },
          chromeFilter,
        );
        break;
      case "onErrorOccurred":
        chrome.webRequest.onErrorOccurred.addListener(
          (details) => {
            if (!skipNowCoderProduction(details)) callback(toObserverDetails(details), details.error);
          },
          chromeFilter,
        );
        break;
    }
  },
  networkObserver,
  async (outcome) => {
    if (outcome.kind !== "recorded" || outcome.lifecycle.kind !== "request_observed") return;
    const evidence = outcome.lifecycle;
    if (evidence.platform === "nowcoder" && characterizationProductionGuard) return;
    if (await blocksNowCoderProductionIngress(evidence.platform, characterizationController)) return;
    await applyOrchestratorEvent({
      kind: "e1_recorded",
      evidence,
      tabId: evidence.tabId,
      frameId: evidence.frameId,
      documentId: evidence.documentId,
      adapterVersion: evidence.adapterVersion,
    });
  },
  (work: () => Promise<void>) => { executor.schedule(work); },
);

/** Characterization observer - NowCoder-only, separate from production. */
const characterizationObserver = createCharacterizationObserver(
  createRegistryRequestLifecycleSource(() => new Date().toISOString()),
);

/**
 * Register characterization observer listeners.
 * These listeners are always registered but only collect when characterization is active.
 * The characterization controller checks session state before storing anything.
 */
registerCharacterizationObserverListeners(
  (kind, callback, filter) => {
    const chromeFilter: chrome.webRequest.RequestFilter = {
      urls: [...filter.urls],
      types: [...filter.types] as chrome.webRequest.ResourceType[],
    };
    switch (kind) {
      case "onBeforeRequest":
        chrome.webRequest.onBeforeRequest.addListener(
          (details) => { if (characterizationProductionGuard) callback(toObserverDetails(details)); return undefined; },
          chromeFilter,
        );
        break;
      case "onBeforeRedirect":
        chrome.webRequest.onBeforeRedirect.addListener(
          (details) => {
            if (characterizationProductionGuard) callback(toObserverDetails(details), details.redirectUrl);
          },
          chromeFilter,
        );
        break;
      case "onResponseStarted":
        chrome.webRequest.onResponseStarted.addListener(
          (details) => {
            if (characterizationProductionGuard) callback(toObserverDetails(details), details.statusCode);
          },
          chromeFilter,
        );
        break;
      case "onCompleted":
        chrome.webRequest.onCompleted.addListener(
          (details) => { if (characterizationProductionGuard) callback(toObserverDetails(details)); },
          chromeFilter,
        );
        break;
      case "onErrorOccurred":
        chrome.webRequest.onErrorOccurred.addListener(
          (details) => {
            if (characterizationProductionGuard) callback(toObserverDetails(details), details.error);
          },
          chromeFilter,
        );
        break;
    }
  },
  characterizationObserver,
  async (evidence, hostname) => {
    // B3 remains exactly browse-only until its two-page witness is complete.
    // Once ready, subsequent requests are B4 evidence and must be retained.
    if (!shouldCollectCharacterizationEvidence((await getB3State()).status)) return;
    await characterizationController.collect(evidence, hostname);
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
    await scheduleCharacterizationExpiry(await characterizationController.getSession());
  });
  void settleExtensionOperation(
    () => chrome.alarms.create(FLUSH_ALARM_NAME, { periodInMinutes: 1 }),
    (error) => console.warn("[capture-v4] flush alarm was not created", error),
  );
});

chrome.runtime.onStartup.addListener(() => {
  void ensurePruneAlarmSlot();
  executor.schedule(async () => {
    // B3.1: Do NOT unconditionally stop characterization here.
    // Session-backed state survives extension restarts; read session to set guard.
    const session = await characterizationController.getSession();
    characterizationProductionGuard = session.active;
    await flushOutbox();
    await scheduleUiHintCleanupAlarmFromSession();
    await scheduleCharacterizationExpiry(session);
  });
});

chrome.runtime.onMessage.addListener((message: unknown, sender, sendResponse) => {
  // B3: Sanitize sender synchronously, then transition B3 state serially via executor.
  const receivedAt = new Date().toISOString();
  const sanitized = readNavigationWitness(message, sender, chrome.runtime.id, receivedAt);
  if (sanitized !== undefined) {
    executor.schedule(async () => {
      // B3 transition: get -> validate -> transition -> save (serialized)
      await applyB3NavigationWitness(sanitized.pageClass, sanitized.documentId, sanitized.tabId, receivedAt);
    });
    return false;
  }
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
    executor.schedule(async () => {
      if (await blocksNowCoderProductionIngress(message.summary.platform, characterizationController)) return;
      await applyMainBridgeSummary(message.summary);
    });
    return false;
  }
  const e3Evidence = readE3RecordedMessage(message);
  if (e3Evidence !== undefined) {
    executor.schedule(async () => {
      if (await blocksNowCoderProductionIngress(e3Evidence.platform, characterizationController)) return;
      await applyOrchestratorEvent({ kind: "e3_recorded", evidence: e3Evidence });
    });
    return false;
  }
  if (isUiHintMessage(message)) {
    executor.schedule(async () => {
      if (await blocksNowCoderProductionIngress(message.hint.platform, characterizationController)) return;
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
      if (await blocksNowCoderProductionIngress(message.candidate.platform, characterizationController)) return;
      if (message.candidate.platform === "nowcoder"
        && typeof sender.tab?.url === "string"
        && typeof sender.tab.id === "number"
        && typeof sender.frameId === "number"
        && typeof sender.documentId === "string") {
        const e3 = NOWCODER_NETWORK_POLICY.verdictEvidence({
          kind: "verdict",
          pageUrl: sender.tab.url,
          problemExternalId: message.candidate.problemExternalId,
          verdictText: message.candidate.verdict,
          tabId: sender.tab.id,
          frameId: sender.frameId,
          documentId: sender.documentId,
          receivedAt: message.candidate.observedAt,
        });
        if (e3?.kind === "final_verdict_confirmed") {
          await applyOrchestratorEvent({ kind: "e3_recorded", evidence: e3 });
          return;
        }
      }
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
  // Characterization messages - handled directly without orchestrator
  if (isCharacterizationStartMessage(message)) {
    executor.schedule(async () => {
      const session = await characterizationController.start(message.hostname, message.authenticated);
      networkObserver.clear();
      characterizationObserver.clear();
      // Start B3 session independently
      const b3State = await startB3Session();
      // Do not block production ingress unless the session was actually persisted.
      characterizationProductionGuard = session.active;
      await scheduleCharacterizationExpiry(session);
      sendResponse({ ok: session.active, session, b3Status: b3State.status });
    });
    return true;
  }
  if (isCharacterizationStopMessage(message)) {
    executor.schedule(async () => {
      const session = await characterizationController.stop();
      characterizationObserver.clear();
      characterizationProductionGuard = false;
      // Stop B3 session independently
      await stopB3Session();
      await scheduleCharacterizationExpiry(session);
      sendResponse({ ok: true, session });
    });
    return true;
  }
  if (isCharacterizationExportMessage(message)) {
    executor.schedule(async () => {
      // B3: Check if B3 export is possible FIRST (B3 takes priority)
      const b3CanExport = await canB3ExportNow();
      const session = await characterizationController.getSession();
      const exportMode = selectCharacterizationExportMode(
        b3CanExport,
        session.records.length,
      );
      if (exportMode === "b3_browse_only") {
        const b3State = await getB3State();
        const e0Records = buildB3E0Records(b3State);
        if (e0Records !== undefined) {
          const b3Document = createBrowseOnlyNavigationExportDocument(
            e0Records,
            characterizationClock(),
            "ac.nowcoder.com",
            session.authenticated,
          );
          if (b3Document === undefined) {
            sendResponse({ ok: false, reason: "browse-only export validation failed", isB3Export: true });
            return;
          }
          // Stop after successful B3 export
          await stopB3Session();
          await characterizationController.stop();
          characterizationObserver.clear();
          characterizationProductionGuard = false;
          await scheduleCharacterizationExpiry(await characterizationController.getSession());
          sendResponse({ ok: true, document: b3Document, records: [], isB3Export: true });
          return;
        }
      }
      // Fall back to B1 network records export
      const result = await characterizationController.export();
      if (result.ok) {
        await characterizationController.stop();
        characterizationObserver.clear();
        characterizationProductionGuard = false;
        await scheduleCharacterizationExpiry(await characterizationController.getSession());
      }
      sendResponse({ ...result, isB3Export: false });
    });
    return true;
  }
  if (isCharacterizationStatusMessage(message)) {
    executor.schedule(async () => {
      const session = await characterizationController.getSession();
      const status = characterizeSessionStatus(session, characterizationClock());
      const b3State = await getB3State();
      sendResponse({ session, status, b3Status: b3State.status, b3Revision: b3State.revision });
    });
    return true;
  }
  return false;
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === CHARACTERIZATION_EXPIRY_ALARM_NAME) {
    executor.schedule(async () => {
      await characterizationController.stop();
      characterizationObserver.clear();
      characterizationProductionGuard = false;
      // B3: Also expire B3 session
      await expireB3Session();
      await chrome.alarms.clear(CHARACTERIZATION_EXPIRY_ALARM_NAME);
    });
    return;
  }
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

// ---------------------------------------------------------------------------
// Characterization message type guards
// ---------------------------------------------------------------------------

function isCharacterizationStartMessage(value: unknown): value is {
  readonly type: "CHARACTERIZATION_START";
  readonly hostname: string;
  readonly authenticated: boolean;
} {
  return typeof value === "object" && value !== null
    && "type" in value && value.type === "CHARACTERIZATION_START"
    && "hostname" in value && typeof value.hostname === "string"
    && "authenticated" in value && typeof value.authenticated === "boolean";
}

function isCharacterizationStopMessage(value: unknown): boolean {
  return typeof value === "object" && value !== null
    && "type" in value && value.type === "CHARACTERIZATION_STOP";
}

function isCharacterizationExportMessage(value: unknown): boolean {
  return typeof value === "object" && value !== null
    && "type" in value && value.type === "CHARACTERIZATION_EXPORT";
}

function isCharacterizationStatusMessage(value: unknown): boolean {
  return typeof value === "object" && value !== null
    && "type" in value && value.type === "CHARACTERIZATION_STATUS";
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
