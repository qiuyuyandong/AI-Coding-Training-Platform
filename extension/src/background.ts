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
import { blocksCharacterizationProductionIngress } from "./characterizationIngress";
import { characterizationPlatformForHostname } from "./characterizationStorage";
import type { Platform } from "./adapters/contract";
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
  VERDICT_CANDIDATE_TTL_MS,
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
  appendLeetCodeEndpointDiagnostic,
  createLeetCodeEndpointDiagnostic,
  createLeetCodeFinalVerdictEvidence,
  createLeetCodeTransientVerdictCandidate,
  LEETCODE_CHECK_ENDPOINT_PREFIX,
  LEETCODE_ENDPOINT_DIAGNOSTIC_KEY,
  LEETCODE_RESULT_ENDPOINT_PREFIX,
  LEETCODE_SUBMIT_ENDPOINT_PREFIX,
  normalizeLeetCodeNetworkEndpoint,
  normalizeLeetCodeProblemIdentity,
  selectLeetCodeConfirmation,
  selectLeetCodeResultConfirmation,
} from "./adapters/leetcode/network";
import {
  NOWCODER_NETWORK_POLICY,
  NOWCODER_STATUS_ENDPOINT_KEY,
  NOWCODER_SUBMIT_ENDPOINT_KEY,
  selectNowCoderConfirmation,
} from "./adapters/nowcoder/network";
// readConfirmedSubmissionState lives in confirmedSubmissionStorage and is
// only read by the orchestrator; the background never inspects confirmed
// submissions directly (plan Task 7).
import {
  applyOrchestratorPersistence,
  createBackgroundOrchestrator,
  readMalformedOutboxRecords,
  readMalformedQuarantineRecords,
  type Orchestrator,
  type OrchestratorEffects,
  type OrchestratorEvent,
  type OrchestratorState,
  type OrchestratorUserAction,
} from "./backgroundOrchestrator";
import {
  isCaptureOutboxItem,
  isCaptureQuarantineItem,
  type CaptureOutboxItem,
  type CaptureQuarantineItem,
} from "./attemptStorage";
import { persistEffectsBeforeCaching } from "./backgroundPersistence";
import { assertCaptureStorageKeys, type CaptureStorageAreaName } from "./storagePrivacy";
import {
  INITIAL_STATE as INITIAL_INGRESS_STATE,
  isContentRuntimeReadyMessage,
  isExactNowCoderResultUrl,
  reduceIngress,
  type IngressCoordinatorState,
  type IngressInput,
} from "./contentIngress";
import {
  deliverLeetCodeSubmitEpochControl,
  LEETCODE_SUBMIT_EPOCH_CONFIRMED,
  LEETCODE_SUBMIT_EPOCH_STARTED,
  type LeetCodeSubmitEpochConfirmedMessage,
  type LeetCodeSubmitEpochStartedMessage,
  type SubmitEpochDeliveryTarget,
  type SubmitEpochDiagnostic,
} from "./submitEpochControl";

const FLUSH_ALARM_NAME = "flushCaptureOutbox";
const UI_HINT_CLEANUP_ALARM_NAME = "expireCaptureUiHints";
const CHARACTERIZATION_EXPIRY_ALARM_NAME = "expireNowCoderCharacterization";
const WEBREQUEST_SPIKE_URL =
  "https://atcoder.jp/__capture_v4_webrequest_spike__/submit";
const WEBREQUEST_SPIKE_MARKER_LIMIT = 8;
const INGRESS_DIAGNOSTIC_KEY = "contentIngressDiagnostics";
const INGRESS_DIAGNOSTIC_LIMIT = 20;
const INGRESS_READY_KEY = "contentIngressReady";
const INGRESS_READY_LIMIT = 20;
let activeOutboxFlush: Promise<void> | undefined;
let cachedSnapshot: OrchestratorState | undefined;
let ingressState: IngressCoordinatorState = INITIAL_INGRESS_STATE;
const characterizationClock = (): string => new Date().toISOString();

chrome.storage.onChanged?.addListener((changes, areaName) => {
  if (areaName !== "local") return;
  if (Object.hasOwn(changes, "captureEnabled")) {
    cachedSnapshot = undefined;
  }
});

/**
 * Synchronous snapshot of whether NowCoder characterization is active.
 * Set true BEFORE the serialized start-task is scheduled so the production
 * webRequest observer can skip scheduling any NowCoder work synchronously
 * (the session-backed check still acts as a worker-restart safety net).
 */
let characterizationProductionGuard: Platform | null = null;
const trustedLocalStorage = chromeArea(chrome.storage.local, "local");
const trustedSessionStorage = chromeArea(chrome.storage.session, "session");

const orchestrator: Orchestrator = createBackgroundOrchestrator({
  storage: {
    local: trustedLocalStorage,
    session: trustedSessionStorage,
  },
  now: () => new Date().toISOString(),
  flushOutbox: async () => {
    await flushOutbox();
  },
});

/** Characterization controller - session-only, never affects production state. */
const characterizationController: CharacterizationController = createCharacterizationController(
  trustedSessionStorage,
  characterizationClock,
);

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

const b3Storage: B3SessionStorage = trustedSessionStorage;

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
  "transientVerdictCandidates",
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
  for (const candidate of state.verdictCandidates) {
    const ms = Date.parse(candidate.receivedAt) + VERDICT_CANDIDATE_TTL_MS;
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
    verdictCandidates: persistence.verdictCandidates,
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
    () => console.warn("[capture-v4] ui hint cleanup alarm slot was not created"),
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
        () => console.warn("[capture-v4] ui hint cleanup alarm was not scheduled"),
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
  const stored = await trustedSessionStorage.get(PRUNE_DEADLINE_KEYS);
  const transient = readTransientSessionEvidenceState(stored);
  await scheduleUiHintCleanupAlarm(transient);
}

const initialization = (async (): Promise<void> => {
  // Chromium 138 exposes this API for session but not local storage. Newer
  // browsers that expose the local method are restricted too; the runtime key
  // allowlist below remains mandatory on every supported browser.
  if (typeof chrome.storage.local.setAccessLevel === "function") {
    await chrome.storage.local.setAccessLevel({ accessLevel: "TRUSTED_CONTEXTS" });
  }
  await chrome.storage.session.setAccessLevel({ accessLevel: "TRUSTED_CONTEXTS" });
  // B3.1: Do NOT unconditionally stop characterization here.
  // Session-backed state must survive MV3 worker restarts.
  // Read the persisted session to set the production guard.
  const session = await characterizationController.getSession();
  characterizationProductionGuard = session.active && session.platform !== ""
    ? session.platform
    : null;
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
  // Replay resolutions recovered from retained persisted candidates plus
  // confirmed E2 records: a worker that stopped after E2 persistence but
  // before E3 handling resumes exactly where the previous worker stopped.
  await processVerdictCandidateResolutions(effects.verdictCandidateResolutions);
  await reconcileOpenNowCoderResultTabs();
})();

const executor = createSerializedWorkExecutor(initialization, (error) => {
  void error;
  console.error("[capture-v4] operation failed");
});

function toIngressUrl(rawUrl: string): URL | undefined {
  try {
    const parsed = new URL(rawUrl);
    return isExactNowCoderResultUrl(parsed) ? parsed : undefined;
  } catch {
    return undefined;
  }
}

async function applyContentIngress(input: IngressInput): Promise<void> {
  const reduced = reduceIngress(ingressState, input);
  ingressState = reduced.state;
  await persistIngressDiagnostics(reduced.effects);
  await persistIngressReadyRecords(reduced.effects);
  for (const effect of reduced.effects) {
    if (effect.type !== "inject") continue;
    try {
      await chrome.scripting.executeScript({
        target: effect.documentId === undefined
          ? { tabId: effect.tabId, frameIds: [0] }
          : { tabId: effect.tabId, documentIds: [effect.documentId] },
        files: ["content.js"],
        world: "ISOLATED",
        injectImmediately: true,
      });
      const result = reduceIngress(ingressState, {
        kind: "injection_result",
        tabId: effect.tabId,
        frameId: effect.frameId,
        documentId: effect.documentId,
        success: true,
      });
      ingressState = result.state;
      await persistIngressDiagnostics(result.effects);
    } catch {
      const result = reduceIngress(ingressState, {
        kind: "injection_result",
        tabId: effect.tabId,
        frameId: effect.frameId,
        documentId: effect.documentId,
        success: false,
      });
      ingressState = result.state;
      await persistIngressDiagnostics(result.effects);
    }
  }
}

type IngressDiagnosticRecord = Readonly<{
  readonly reason: "injection_failed";
  readonly documentId: string | undefined;
}>;

function readIngressDiagnostics(value: unknown): readonly IngressDiagnosticRecord[] {
  if (!Array.isArray(value)) return [];
  return value.filter((candidate): candidate is IngressDiagnosticRecord =>
    typeof candidate === "object" && candidate !== null
    && Reflect.get(candidate, "reason") === "injection_failed"
    && (typeof Reflect.get(candidate, "documentId") === "string"
      || Reflect.get(candidate, "documentId") === undefined));
}

async function persistIngressDiagnostics(
  effects: readonly { readonly type: string; readonly reason?: string; readonly documentId?: string | undefined }[],
): Promise<void> {
  const diagnostics = effects.filter((effect) =>
    effect.type === "diagnostic" && effect.reason === "injection_failed");
  if (diagnostics.length === 0) return;
  const stored = await trustedSessionStorage.get([INGRESS_DIAGNOSTIC_KEY]);
  const existing = readIngressDiagnostics(stored[INGRESS_DIAGNOSTIC_KEY]);
  const appended: IngressDiagnosticRecord[] = diagnostics.map((effect) => ({
    reason: "injection_failed",
    documentId: effect.documentId,
  }));
  await trustedSessionStorage.set({
    [INGRESS_DIAGNOSTIC_KEY]: [...existing, ...appended].slice(-INGRESS_DIAGNOSTIC_LIMIT),
  });
}

type IngressReadyRecord = Readonly<{
  readonly reason: "ready_record";
  readonly tabId: number;
  readonly frameId: number;
  readonly documentId: string | undefined;
}>;

function readIngressReadyRecords(value: unknown): readonly IngressReadyRecord[] {
  if (!Array.isArray(value)) return [];
  return value.filter((candidate): candidate is IngressReadyRecord =>
    typeof candidate === "object" && candidate !== null
    && Reflect.get(candidate, "reason") === "ready_record"
    && typeof Reflect.get(candidate, "tabId") === "number"
    && typeof Reflect.get(candidate, "frameId") === "number"
    && (typeof Reflect.get(candidate, "documentId") === "string"
      || Reflect.get(candidate, "documentId") === undefined));
}

async function persistIngressReadyRecords(
  effects: readonly { readonly type: string; readonly tabId?: number; readonly frameId?: number; readonly documentId?: string | undefined }[],
): Promise<void> {
  const records = effects.filter((effect) => effect.type === "ready_record"
    && typeof effect.tabId === "number"
    && typeof effect.frameId === "number") as readonly {
      readonly type: "ready_record";
      readonly tabId: number;
      readonly frameId: number;
      readonly documentId: string | undefined;
    }[];
  if (records.length === 0) return;
  const stored = await trustedSessionStorage.get([INGRESS_READY_KEY]);
  const existing = readIngressReadyRecords(stored[INGRESS_READY_KEY]);
  const appended: IngressReadyRecord[] = records.map((record) => ({
    reason: "ready_record",
    tabId: record.tabId,
    frameId: record.frameId,
    documentId: record.documentId,
  }));
  await trustedSessionStorage.set({
    [INGRESS_READY_KEY]: [...existing, ...appended].slice(-INGRESS_READY_LIMIT),
  });
}

async function reconcileOpenNowCoderResultTabs(): Promise<void> {
  const tabs = await chrome.tabs.query({
    url: ["https://ac.nowcoder.com/acm/contest/view-submission*"],
  });
  for (const tab of tabs) {
    if (typeof tab.id !== "number" || typeof tab.url !== "string") continue;
    const url = toIngressUrl(tab.url);
    if (url === undefined) continue;
    await applyContentIngress({
      kind: "startup",
      url,
      tabId: tab.id,
      frameId: 0,
      documentId: undefined,
    });
  }
}

chrome.webNavigation.onCommitted.addListener((details) => {
  const url = toIngressUrl(details.url);
  executor.schedule(async () => {
    if (url === undefined) {
      if (details.frameId === 0 && details.tabId >= 0) {
        await applyContentIngress({ kind: "cleanup", tabId: details.tabId });
      }
      return;
    }
    await applyContentIngress({
      kind: "committed",
      url,
      tabId: details.tabId,
      frameId: details.frameId,
      documentId: details.documentId,
    });
  });
});

chrome.webNavigation.onCompleted.addListener((details) => {
  const url = toIngressUrl(details.url);
  if (url === undefined) return;
  executor.schedule(async () => {
    await applyContentIngress({
      kind: "completed",
      url,
      tabId: details.tabId,
      frameId: details.frameId,
      documentId: details.documentId,
    });
  });
});

chrome.webNavigation.onHistoryStateUpdated.addListener((details) => {
  const url = toIngressUrl(details.url);
  if (url === undefined) return;
  executor.schedule(async () => {
    await applyContentIngress({
      kind: "history_state",
      url,
      tabId: details.tabId,
      frameId: details.frameId,
      documentId: details.documentId,
    });
  });
});

chrome.webNavigation.onErrorOccurred.addListener((details) => {
  executor.schedule(async () => {
    await applyContentIngress({
      kind: "cleanup",
      documentId: details.documentId,
      tabId: details.tabId,
    });
  });
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
      const stored = await trustedSessionStorage.get(["webRequestSpikeMarkers"]);
      const markers = readWebRequestSpikeMarkers(stored.webRequestSpikeMarkers);
      await trustedSessionStorage.set({
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

function skipActiveCharacterizationProduction(details: ChromeObserverDetails): boolean {
  if (characterizationProductionGuard === null) return false;
  try {
    return characterizationPlatformForHostname(new URL(details.url).hostname)
      === characterizationProductionGuard;
  } catch {
    return false;
  }
}

async function applyNowCoderStatusConfirmation(
  details: WebRequestDetails,
  rawUrl: string,
): Promise<void> {
  if (details.method !== "GET" || details.type !== "xmlhttprequest"
    || details.documentId === undefined) return;
  if (await blocksCharacterizationProductionIngress("nowcoder", characterizationController)) return;
  const stored = await trustedSessionStorage.get(["uiHints", "transientE1"]);
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

async function applyLeetCodeCheckConfirmation(details: WebRequestDetails): Promise<void> {
  if (details.method !== "GET" || details.type !== "xmlhttprequest"
    || details.documentId === undefined) return;
  if (await blocksCharacterizationProductionIngress("leetcode", characterizationController)) return;
  const stored = await trustedSessionStorage.get(["transientE1"]);
  const transient = readTransientSessionEvidenceState(stored);
  const checkLifecycle = transient.requestLifecycles.find((entry) =>
    entry.evidence.platform === "leetcode"
    && entry.evidence.requestId === details.requestId
    && entry.evidence.endpointKey.startsWith(`${LEETCODE_CHECK_ENDPOINT_PREFIX}/`));
  if (checkLifecycle === undefined) return;
  const submitCandidates = transient.requestLifecycles
    .filter((entry) =>
      entry.evidence.platform === "leetcode"
      && entry.evidence.endpointKey.startsWith(`${LEETCODE_SUBMIT_ENDPOINT_PREFIX}/`))
    .map((entry) => entry.evidence);
  const confirmation = selectLeetCodeConfirmation({
    checkEvidence: checkLifecycle.evidence,
    submitCandidates,
  });
  if (confirmation.kind !== "confirmed") return;
  const effects = await applyOrchestratorEvent({
    kind: "e2_recorded",
    evidence: confirmation.evidence,
    matchedSubmitRequestId: confirmation.matchedSubmitRequestId,
  });
  const persistenceComplete = effects.persistence.confirmed.some((record) =>
    record.externalSubmissionId === confirmation.evidence.externalSubmissionId
    && record.platform === "leetcode");
  await sendLeetCodeSubmitEpochConfirmed(
    confirmation.evidence,
    confirmation.matchedSubmitRequestId,
    persistenceComplete,
  );
}

async function applyLeetCodeResultConfirmation(details: WebRequestDetails): Promise<void> {
  if (details.method !== "GET" || details.type !== "xmlhttprequest"
    || details.documentId === undefined) return;
  if (await blocksCharacterizationProductionIngress("leetcode", characterizationController)) return;
  const stored = await trustedSessionStorage.get(["uiHints", "transientE1"]);
  const transient = readTransientSessionEvidenceState(stored);
  const resultLifecycle = transient.requestLifecycles.find((entry) =>
    entry.evidence.platform === "leetcode"
    && entry.evidence.requestId === details.requestId
    && entry.evidence.endpointKey.startsWith(`${LEETCODE_RESULT_ENDPOINT_PREFIX}/`));
  if (resultLifecycle === undefined) return;
  const graphqlCandidates = transient.requestLifecycles
    .filter((entry) =>
      entry.evidence.platform === "leetcode"
      && entry.evidence.endpointKey === "graphql")
    .map((entry) => entry.evidence);
  const problemCandidates = transient.uiHints
    .filter((hint) =>
      hint.platform === "leetcode"
      && hint.sourceDocumentId === resultLifecycle.evidence.documentId)
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
  if (confirmation.kind !== "confirmed") return;
  const effects = await applyOrchestratorEvent({
    kind: "e2_recorded",
    evidence: confirmation.evidence,
    matchedSubmitRequestId: confirmation.matchedSubmitRequestId,
  });
  const persistenceComplete = effects.persistence.confirmed.some((record) =>
    record.externalSubmissionId === confirmation.evidence.externalSubmissionId
    && record.platform === "leetcode");
  await sendLeetCodeSubmitEpochConfirmed(
    confirmation.evidence,
    confirmation.matchedSubmitRequestId,
    persistenceComplete,
  );
}

async function persistLeetCodeEndpointDiagnostic(
  details: ChromeObserverDetails,
  statusCode: number,
): Promise<void> {
  if (await blocksCharacterizationProductionIngress("leetcode", characterizationController)) return;
  const diagnostic = createLeetCodeEndpointDiagnostic({
    rawUrl: details.url,
    method: details.method,
    resourceType: details.type,
    statusCode,
    requestId: details.requestId,
    tabId: details.tabId,
    frameId: details.frameId,
    documentId: details.documentId,
    receivedAt: new Date().toISOString(),
  });
  if (diagnostic === null) return;
  const stored = await trustedSessionStorage.get([LEETCODE_ENDPOINT_DIAGNOSTIC_KEY]);
  await trustedSessionStorage.set({
    [LEETCODE_ENDPOINT_DIAGNOSTIC_KEY]: appendLeetCodeEndpointDiagnostic(
      stored[LEETCODE_ENDPOINT_DIAGNOSTIC_KEY],
      diagnostic,
    ),
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
          (details) => { if (!skipActiveCharacterizationProduction(details)) callback(toObserverDetails(details)); return undefined; },
          chromeFilter,
        );
        break;
      case "onBeforeRedirect":
        chrome.webRequest.onBeforeRedirect.addListener(
          (details) => {
            if (!skipActiveCharacterizationProduction(details)) callback(toObserverDetails(details), details.redirectUrl);
          },
          chromeFilter,
        );
        break;
      case "onResponseStarted":
        chrome.webRequest.onResponseStarted.addListener(
          (details) => {
            if (!skipActiveCharacterizationProduction(details)) callback(toObserverDetails(details), details.statusCode);
          },
          chromeFilter,
        );
        break;
      case "onCompleted":
        chrome.webRequest.onCompleted.addListener(
          (details) => {
            if (skipActiveCharacterizationProduction(details)) return;
            const observerDetails = toObserverDetails(details);
            callback(observerDetails);
            executor.schedule(async () => {
              await persistLeetCodeEndpointDiagnostic(details, details.statusCode);
            });
            if (details.url.startsWith("https://ac.nowcoder.com/nccommon/status")) {
              executor.schedule(async () => {
                await applyNowCoderStatusConfirmation(observerDetails, details.url);
              });
            }
            const leetCodeEndpoint = normalizeLeetCodeNetworkEndpoint(details.url);
            if (leetCodeEndpoint?.startsWith(`${LEETCODE_CHECK_ENDPOINT_PREFIX}/`) === true) {
              executor.schedule(async () => {
                await applyLeetCodeCheckConfirmation(observerDetails);
              });
            }
            if (leetCodeEndpoint?.startsWith(`${LEETCODE_RESULT_ENDPOINT_PREFIX}/`) === true) {
              executor.schedule(async () => {
                await applyLeetCodeResultConfirmation(observerDetails);
              });
            }
          },
          chromeFilter,
        );
        break;
      case "onErrorOccurred":
        chrome.webRequest.onErrorOccurred.addListener(
          (details) => {
            if (!skipActiveCharacterizationProduction(details)) callback(toObserverDetails(details), details.error);
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
    if (evidence.platform === characterizationProductionGuard) return;
    if (await blocksCharacterizationProductionIngress(evidence.platform, characterizationController)) return;
    await applyOrchestratorEvent({
      kind: "e1_recorded",
      evidence,
      tabId: evidence.tabId,
      frameId: evidence.frameId,
      documentId: evidence.documentId,
      adapterVersion: evidence.adapterVersion,
    });
    await sendLeetCodeSubmitEpochStarted(evidence);
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
          (details) => { if (characterizationProductionGuard !== null) callback(toObserverDetails(details)); return undefined; },
          chromeFilter,
        );
        break;
      case "onBeforeRedirect":
        chrome.webRequest.onBeforeRedirect.addListener(
          (details) => {
            if (characterizationProductionGuard !== null) callback(toObserverDetails(details), details.redirectUrl);
          },
          chromeFilter,
        );
        break;
      case "onResponseStarted":
        chrome.webRequest.onResponseStarted.addListener(
          (details) => {
            if (characterizationProductionGuard !== null) callback(toObserverDetails(details), details.statusCode);
          },
          chromeFilter,
        );
        break;
      case "onCompleted":
        chrome.webRequest.onCompleted.addListener(
          (details) => { if (characterizationProductionGuard !== null) callback(toObserverDetails(details)); },
          chromeFilter,
        );
        break;
      case "onErrorOccurred":
        chrome.webRequest.onErrorOccurred.addListener(
          (details) => {
            if (characterizationProductionGuard !== null) callback(toObserverDetails(details), details.error);
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
    const session = await characterizationController.getSession();
    if (session.platform === "nowcoder"
      && !shouldCollectCharacterizationEvidence((await getB3State()).status)) return;
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
    () => console.warn("[capture-v4] flush alarm was not created"),
  );
});

chrome.runtime.onStartup.addListener(() => {
  void ensurePruneAlarmSlot();
  executor.schedule(async () => {
    // B3.1: Do NOT unconditionally stop characterization here.
    // Session-backed state survives extension restarts; read session to set guard.
    const session = await characterizationController.getSession();
    characterizationProductionGuard = session.active && session.platform !== ""
      ? session.platform
      : null;
    await flushOutbox();
    await scheduleUiHintCleanupAlarmFromSession();
    await scheduleCharacterizationExpiry(session);
    await reconcileOpenNowCoderResultTabs();
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
  if (isContentRuntimeReadyMessage(message)) {
    const url = typeof sender.url === "string" ? toIngressUrl(sender.url) : undefined;
    const senderTabId = sender.tab?.id;
    if (url === undefined || typeof senderTabId !== "number"
      || typeof sender.frameId !== "number" || typeof sender.documentId !== "string") {
      return false;
    }
    const senderFrameId = sender.frameId;
    const senderDocumentId = sender.documentId;
    executor.schedule(async () => {
      // The closed ready payload carries no page-derived fields. Chrome owns
      // the sender identity and URL used to admit this control-plane record.
      await applyContentIngress({
        kind: "ready",
        tabId: senderTabId,
        frameId: senderFrameId,
        documentId: senderDocumentId,
      });
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
      if (await blocksCharacterizationProductionIngress(message.summary.platform, characterizationController)) return;
      await applyMainBridgeSummary(message.summary);
    });
    return false;
  }
  const e3Evidence = readE3RecordedMessage(message);
  if (e3Evidence !== undefined) {
    executor.schedule(async () => {
      if (await blocksCharacterizationProductionIngress(e3Evidence.platform, characterizationController)) return;
      await applyOrchestratorEvent({ kind: "e3_recorded", evidence: e3Evidence });
    });
    return false;
  }
  if (isUiHintMessage(message)) {
    executor.schedule(async () => {
      if (await blocksCharacterizationProductionIngress(message.hint.platform, characterizationController)) return;
      await applyOrchestratorEvent({
        kind: "e0_recorded",
        hint: message.hint,
        sourceDocumentId: sender.documentId,
      });
    });
    return false;
  }
  if (isVerdictCandidateMessage(message)) {
    const candidate = message.candidate;
    const senderTabUrl = typeof sender.tab?.url === "string" ? sender.tab.url : undefined;
    const senderTabId = typeof sender.tab?.id === "number" ? sender.tab.id : undefined;
    const senderFrameId = typeof sender.frameId === "number" ? sender.frameId : undefined;
    const senderDocumentId = typeof sender.documentId === "string" ? sender.documentId : undefined;

    // Validate the sender's tab/frame/document identity before any storage
    // work. A malformed sender can never reach the candidate pipeline.
    if (senderTabUrl === undefined
      || senderTabId === undefined
      || senderFrameId === undefined
      || senderDocumentId === undefined) {
      return false;
    }

    if (candidate.platform === "nowcoder") {
      executor.schedule(async () => {
        if (await blocksCharacterizationProductionIngress(candidate.platform, characterizationController)) return;
        const e3 = NOWCODER_NETWORK_POLICY.verdictEvidence({
          kind: "verdict",
          pageUrl: senderTabUrl,
          problemExternalId: candidate.problemExternalId,
          verdictText: candidate.verdict,
          tabId: senderTabId,
          frameId: senderFrameId,
          documentId: senderDocumentId,
          receivedAt: candidate.observedAt,
        });
        if (e3?.kind === "final_verdict_confirmed") {
          await applyOrchestratorEvent({ kind: "e3_recorded", evidence: e3 });
        }
      });
      return false;
    }

    if (candidate.platform === "leetcode") {
      executor.schedule(async () => {
        if (await blocksCharacterizationProductionIngress(candidate.platform, characterizationController)) return;
        const problemIdentity = normalizeLeetCodeProblemIdentity(
          senderTabUrl,
          candidate.problemExternalId,
        );
        if (problemIdentity === null) return;
        const transientCandidate = createLeetCodeTransientVerdictCandidate({
          problemExternalId: problemIdentity,
          verdictText: candidate.verdict,
          observedAt: candidate.observedAt,
          tabId: senderTabId,
          frameId: senderFrameId,
          documentId: senderDocumentId,
          transitionEvidence: candidate.transitionEvidence,
        });
        // The shared taxonomy rejects pending labels, placeholders and the
        // `Other Failure` fallback before any session write, so a bogus
        // verdict can never wait in the bounded candidate slice for an E2
        // that cannot satisfy it.
        if (transientCandidate === null) return;
        await applyOrchestratorEvent({
          kind: "verdict_candidate_recorded",
          candidate: transientCandidate,
        });
      });
      return false;
    }

    // Unsupported platforms: drop the candidate without storage work.
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
      const b3State = session.platform === "nowcoder"
        ? await startB3Session()
        : await stopB3Session();
      // Do not block production ingress unless the session was actually persisted.
      characterizationProductionGuard = session.active && session.platform !== ""
        ? session.platform
        : null;
      await scheduleCharacterizationExpiry(session);
      sendResponse({ ok: session.active, session, b3Status: b3State.status });
    });
    return true;
  }
  if (isCharacterizationStopMessage(message)) {
    executor.schedule(async () => {
      const session = await characterizationController.stop();
      characterizationObserver.clear();
      characterizationProductionGuard = null;
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
      const session = await characterizationController.getSession();
      const b3CanExport = session.platform === "nowcoder" && await canB3ExportNow();
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
          characterizationProductionGuard = null;
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
        characterizationProductionGuard = null;
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
      characterizationProductionGuard = null;
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
  areaName: CaptureStorageAreaName,
): {
  readonly get: (keys: readonly string[]) => Promise<Record<string, unknown>>;
  readonly set: (items: Record<string, unknown>) => Promise<void>;
  readonly remove: (key: string) => Promise<void>;
} {
  return {
    get: async (keys: readonly string[]) => {
      assertCaptureStorageKeys(areaName, keys);
      return area.get([...keys]);
    },
    set: async (items: Record<string, unknown>) => {
      assertCaptureStorageKeys(areaName, Object.keys(items));
      await area.set(items);
    },
    remove: async (key: string) => {
      assertCaptureStorageKeys(areaName, [key]);
      await area.remove(key);
    },
  };
}

async function applyOrchestratorEvent(event: OrchestratorEvent): Promise<OrchestratorEffects> {
  if (event.kind !== "user_action") {
    const runtime = await readRuntimeContext();
    if (!runtime.captureEnabled) {
      return ignoredCaptureEffects(await orchestrator.snapshot());
    }
  }
  const effects = await orchestrator.apply(event);
  await applyPersistence(effects);
  await processVerdictCandidateResolutions(effects.verdictCandidateResolutions);
  return effects;
}

async function recordSubmitEpochDiagnostic(reason: SubmitEpochDiagnostic): Promise<void> {
  await applyOrchestratorEvent({ kind: "submit_epoch_diagnostic", reason });
}

/**
 * Deliver one LeetCode submit-epoch control message to exactly one browser
 * document.  The payload intentionally contains no routing identities; the
 * tab/frame/document target lives only in the Chrome API options.  A failed
 * target is terminal for this delivery and never falls back to tab-only,
 * another frame/document, or broadcast delivery.
 */
async function sendLeetCodeSubmitEpochControl(
  target: SubmitEpochDeliveryTarget,
  message: LeetCodeSubmitEpochStartedMessage | LeetCodeSubmitEpochConfirmedMessage,
  persistenceComplete = true,
): Promise<void> {
  await deliverLeetCodeSubmitEpochControl(
    target,
    message,
    {
      sendMessage: (tabId, payload, options) => chrome.tabs.sendMessage(tabId, payload, options),
      recordDiagnostic: recordSubmitEpochDiagnostic,
    },
    persistenceComplete,
  );
}

async function sendLeetCodeSubmitEpochStarted(evidence: import("./evidence").E1RequestObserved): Promise<void> {
  if (evidence.platform !== "leetcode"
    || evidence.lifecycle !== "before_request"
    || !evidence.endpointKey.startsWith(`${LEETCODE_SUBMIT_ENDPOINT_PREFIX}/`)) return;
  const problemExternalId = evidence.endpointKey.split("/").at(-1);
  if (problemExternalId === undefined) return;
  await sendLeetCodeSubmitEpochControl(
    {
      tabId: evidence.tabId,
      frameId: evidence.frameId,
      documentId: evidence.documentId,
    },
    {
      type: LEETCODE_SUBMIT_EPOCH_STARTED,
      schemaVersion: 1,
      platform: "leetcode",
      problemExternalId,
      submitRequestId: evidence.requestId,
      receivedAt: evidence.receivedAt,
    },
  );
}

async function sendLeetCodeSubmitEpochConfirmed(
  evidence: import("./evidence").E2SubmissionConfirmed,
  matchedSubmitRequestId: string,
  persistenceComplete: boolean,
): Promise<void> {
  if (evidence.platform !== "leetcode") return;
  await sendLeetCodeSubmitEpochControl(
    {
      tabId: evidence.tabId,
      frameId: evidence.frameId,
      documentId: evidence.documentId,
    },
    {
      type: LEETCODE_SUBMIT_EPOCH_CONFIRMED,
      schemaVersion: 1,
      platform: "leetcode",
      problemExternalId: evidence.problemExternalId,
      submitRequestId: matchedSubmitRequestId,
      confirmedAt: evidence.receivedAt,
    },
    persistenceComplete,
  );
}

async function processVerdictCandidateResolutions(
  resolutions: readonly import("./verdictCandidateCoordinator").VerdictCandidateResolution[],
): Promise<void> {
  for (const resolution of resolutions) {
    if (resolution.platform !== "leetcode") continue;
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
      // The plan requires that a failed E3 construction never returns
      // silently. Route the closed diagnostic through the orchestrator so
      // the popup and cached snapshot stay consistent with the single
      // state-change path (Task 8 review fix); never write storage here.
      await applyOrchestratorEvent({
        kind: "verdict_candidate_blocked",
        candidateId: resolution.candidateId,
        platform: "leetcode",
        problemExternalId: resolution.problemExternalId,
      });
      continue;
    }
    await applyOrchestratorEvent({
      kind: "e3_recorded",
      evidence: e3,
      candidateId: resolution.candidateId,
    });
  }
}

function ignoredCaptureEffects(state: OrchestratorState): OrchestratorEffects {
  return {
    state,
    persistence: {
      local: [],
      localRemovals: [],
      session: [],
      sessionRemovals: [],
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
    },
    executorSchedule: [],
    verdictCandidateResolutions: [],
  };
}

async function applyPersistence(effects: OrchestratorEffects): Promise<void> {
  await persistEffectsBeforeCaching({
    effects,
    persist: async (persistence) => {
      await applyOrchestratorPersistence({
        local: trustedLocalStorage,
        session: trustedSessionStorage,
      }, persistence);
    },
    setCachedSnapshot: (state) => { cachedSnapshot = state; },
  });
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
  const stored = await trustedSessionStorage.get(["transientE1"]);
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
      const stored = await trustedLocalStorage.get(["captureEndpoint", "captureCredential"]);
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
  const stored = await trustedLocalStorage.get(["captureOutbox", "captureQuarantine"]);
  return {
    outbox: readOutbox(stored.captureOutbox),
    quarantine: readQuarantine(stored.captureQuarantine),
    malformedOutbox: readMalformedOutboxRecords(stored.captureOutbox),
    malformedQuarantine: readMalformedQuarantineRecords(stored.captureQuarantine),
  };
}

async function persistOutboxPlan(plan: CaptureOutboxPlan): Promise<void> {
  await persistCaptureOutboxPlan(trustedLocalStorage, plan);
}

async function readRuntimeContext(): Promise<CaptureRuntimeContext> {
  const stored = await trustedLocalStorage.get([
    "installationId", "captureEnabled", "captureCredential",
  ]);
  return runtimeContextFromStored(stored);
}

async function pairCaptureInstallation(
  message: PairCaptureInstallationMessage,
): Promise<PairCaptureResult> {
  const state = await trustedLocalStorage.get(["captureEndpoint", "installationId"]);
  if (typeof state.installationId !== "string" || state.installationId.length === 0) {
    return { ok: false, error: "Extension installation is not initialized" };
  }
  try {
    const response = await fetch(pairingEndpointFromCaptureEndpoint(state.captureEndpoint), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ code: message.code, installationId: state.installationId }),
    });
    if (!response.ok) return { ok: false, error: `Pairing request rejected (HTTP ${response.status})` };
    const body: unknown = await response.json();
    const paired = parsePairCaptureApiResponse(body, state.installationId);
    await trustedLocalStorage.set({
      captureCredential: paired.credential,
      captureCredentialVersion: paired.credentialVersion,
      pairedAt: new Date().toISOString(),
    });
    await trustedLocalStorage.remove("lastCaptureError");
    await refreshCachedSnapshot();
    await flushOutbox();
    return { ok: true, installationId: paired.installationId, credentialVersion: paired.credentialVersion };
  } catch (error) {
    void error;
    return { ok: false, error: "Pairing failed" };
  }
}

type ActionMessage = {
  readonly type: "SET_CAPTURE_ENABLED" | "RETRY_CAPTURE_OUTBOX" | "CLEAR_CAPTURE_OUTBOX" | "CLEAR_CAPTURE_QUARANTINE";
  readonly enabled?: boolean;
} | {
  readonly type: "RETRY_QUARANTINED_CAPTURE" | "DELETE_QUARANTINED_CAPTURE";
  readonly id: string;
  readonly malformed?: boolean;
};

function isActionMessage(value: unknown): value is ActionMessage {
  if (typeof value !== "object" || value === null || !("type" in value)) return false;
  if (value.type === "SET_CAPTURE_ENABLED") {
    return "enabled" in value && typeof value.enabled === "boolean";
  }
  if (
    value.type === "RETRY_CAPTURE_OUTBOX"
    || value.type === "CLEAR_CAPTURE_OUTBOX"
    || value.type === "CLEAR_CAPTURE_QUARANTINE"
  ) return true;
  return (
    value.type === "RETRY_QUARANTINED_CAPTURE"
    || value.type === "DELETE_QUARANTINED_CAPTURE"
  ) && "id" in value && typeof value.id === "string"
    && (!Object.hasOwn(value, "malformed") || typeof Reflect.get(value, "malformed") === "boolean");
}

function toOrchestratorAction(message: ActionMessage): OrchestratorUserAction {
  switch (message.type) {
    case "SET_CAPTURE_ENABLED":
      return { type: "SET_CAPTURE_ENABLED", enabled: message.enabled === true };
    case "RETRY_CAPTURE_OUTBOX":
      return { type: "RETRY_CAPTURE_OUTBOX" };
    case "CLEAR_CAPTURE_OUTBOX":
      return { type: "CLEAR_CAPTURE_OUTBOX" };
    case "CLEAR_CAPTURE_QUARANTINE":
      return { type: "CLEAR_CAPTURE_QUARANTINE" };
    case "RETRY_QUARANTINED_CAPTURE":
      return { type: "RETRY_QUARANTINED_CAPTURE", id: message.id };
    case "DELETE_QUARANTINED_CAPTURE":
      return {
        type: "DELETE_QUARANTINED_CAPTURE",
        id: message.id,
        ...(message.malformed === true ? { malformed: true } : {}),
      };
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

function readOutbox(value: unknown): readonly CaptureOutboxItem[] {
  return Array.isArray(value) ? value.filter(isCaptureOutboxItem) : [];
}

function readQuarantine(value: unknown): readonly CaptureQuarantineItem[] {
  return Array.isArray(value) ? value.filter(isCaptureQuarantineItem) : [];
}
