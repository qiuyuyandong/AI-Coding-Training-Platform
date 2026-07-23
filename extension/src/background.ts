import {
  isSubmissionIntentMessage,
  isVerdictCandidateMessage,
  type PendingSubmissionIntent,
  type VerdictCandidateMessage,
} from "./attemptCapture";
import {
  canPersistCaptureBytes,
  consumeVerdictCandidate,
  deleteQuarantined,
  estimateCaptureBytes,
  expireSubmissionIntents,
  recordSubmissionIntent,
  type CaptureOutboxItem,
  type CaptureQuarantineItem,
} from "./attemptStorage";
import {
  postCaptureAttemptBundle,
} from "./captureTransport";
import {
  applyExtensionInitialization,
  planExtensionInitialization,
  restrictStorageToTrustedContexts,
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
  retryAllCaptureStorageUpdate,
  retryQuarantinedCaptureStorageUpdate,
  type CaptureOutboxPlan,
  type CaptureOutboxState,
} from "./outboxDrain";
import { createSerializedWorkExecutor } from "./serializedWork";
import { settleExtensionOperation } from "./extensionOperation";

const INITIALIZATION_STORAGE_KEYS = [
  "captureEnabled",
  "captureEndpoint",
  "captureCredential",
  "captureProtocolVersion",
  "pendingSubmissionIntents",
  "captureOutbox",
  "captureQuarantine",
  "discardedPreBundleEventCount",
  "preBundleQueueDiscardedAt",
  "eventQueue",
  "unmatchedVerdictCandidates",
  "installationId",
] as const;
const FLUSH_ALARM_NAME = "flushCaptureOutbox";
const UNMATCHED_CANDIDATE_TTL_MS = 5 * 60 * 1000;
let activeOutboxFlush: Promise<void> | undefined;

const initialization = initializeExtension();
const executor = createSerializedWorkExecutor(initialization.then(() => undefined), (error) => {
  console.error("[capture-v3] operation failed", error);
});

chrome.runtime.onInstalled.addListener(() => {
  void initialization;
  void settleExtensionOperation(
    () => chrome.alarms.create(FLUSH_ALARM_NAME, { periodInMinutes: 1 }),
    (error) => console.warn("[capture-v3] flush alarm was not created", error),
  );
});

chrome.runtime.onStartup.addListener(() => {
  executor.schedule(flushOutbox);
});

chrome.runtime.onMessage.addListener((message: unknown, sender, sendResponse) => {
  if (isCaptureContextRequest(message)) {
    void initialization.then(readRuntimeContext).then(sendResponse).catch(() => sendResponse(undefined));
    return true;
  }
  if (isPairCaptureInstallationMessage(message)) {
    executor.schedule(async () => {
      sendResponse(await pairCaptureInstallation(message));
    });
    return true;
  }
  if (isSubmissionIntentMessage(message)) {
    executor.schedule(() => persistSubmissionIntent(message.intent, sender.documentId));
    return false;
  }
  if (isVerdictCandidateMessage(message)) {
    executor.schedule(() => persistVerdictCandidate(message.candidate, sender.documentId));
    return false;
  }
  if (isActionMessage(message)) {
    executor.schedule(() => handleAction(message));
    return false;
  }
  return false;
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === FLUSH_ALARM_NAME) {
    executor.schedule(async () => {
      // Expiry used to run only during extension initialization. A missed
      // verdict could therefore remain visibly active forever in a long-lived
      // browser session. Periodic maintenance now expires stale intents before
      // attempting delivery; completed verdicts still consume immediately.
      await expireStoredIntents();
      await flushOutbox();
    });
  }
});

async function initializeExtension(): Promise<void> {
  const accessRestricted = await restrictStorageToTrustedContexts(chrome.storage.local);
  if (!accessRestricted) {
    console.warn("[capture-v3] trusted-only storage access is unavailable in this browser");
  }
  const stored = await chrome.storage.local.get(INITIALIZATION_STORAGE_KEYS);
  const plan = planExtensionInitialization(stored, {
    now: new Date().toISOString(),
    createInstallationId: () => createIdentifier("installation"),
  });
  await applyExtensionInitialization(chrome.storage.local, plan);
  await expireStoredIntents();
  await flushOutbox();
}

async function persistSubmissionIntent(
  draft: Parameters<typeof recordSubmissionIntent>[1],
  documentId?: string,
): Promise<void> {
  const stored = await chrome.storage.local.get([
    "captureEnabled", "installationId", "pendingSubmissionIntents",
  ]);
  if (stored.captureEnabled === false || typeof stored.installationId !== "string") return;
  const intents = readIntents(stored.pendingSubmissionIntents);
  await chrome.storage.local.set({
    pendingSubmissionIntents: recordSubmissionIntent(
      intents,
      { ...draft, installationId: stored.installationId },
      documentId,
    ),
  });
  const pending = await chrome.storage.local.get(["unmatchedVerdictCandidates"]);
  const candidates = recentVerdictCandidates(
    readVerdictCandidates(pending.unmatchedVerdictCandidates),
    Date.now(),
  );
  for (const candidate of candidates) {
    if (candidate.platform === draft.platform
      && candidate.problemExternalId === draft.problemExternalId
      && candidate.observedAt >= draft.occurredAt) {
      await persistVerdictCandidate(candidate);
    }
  }
}

async function persistVerdictCandidate(
  candidate: Parameters<typeof consumeVerdictCandidate>[0]["candidate"],
  documentId?: string,
): Promise<void> {
  const stored = await chrome.storage.local.get([
    "captureEnabled", "installationId", "captureCredential",
    "pendingSubmissionIntents", "captureOutbox", "unmatchedVerdictCandidates",
  ]);
  if (stored.captureEnabled === false || typeof stored.installationId !== "string") return;
  const effectiveCandidate = {
    ...candidate,
    installationId: stored.installationId,
    ...(documentId === undefined ? {} : { sourceDocumentId: documentId }),
  };
  const result = consumeVerdictCandidate({
    intents: readIntents(stored.pendingSubmissionIntents),
    candidate: effectiveCandidate,
    installationId: stored.installationId,
    provenanceLevel: typeof stored.captureCredential === "string"
      ? "extension_paired"
      : "extension_unpaired",
  });
  const unmatched = recentVerdictCandidates(
    readVerdictCandidates(stored.unmatchedVerdictCandidates),
    Date.now(),
  );
  if (result.outboxItem === undefined) {
    const key = verdictCandidateKey(effectiveCandidate);
    const nextCandidates = [
      ...unmatched.filter((value) => verdictCandidateKey(value) !== key),
      effectiveCandidate,
    ];
    const bytesInUse = await chrome.storage.local.getBytesInUse(null);
    if (!canPersistCaptureBytes({
      quotaBytes: chrome.storage.local.QUOTA_BYTES,
      bytesInUse,
      estimatedWriteBytes: estimateCaptureBytes(effectiveCandidate),
    })) {
      await chrome.storage.local.set({
        lastCaptureError: "Storage capacity reached: verdict recovery state was not persisted",
      });
      return;
    }
    await chrome.storage.local.set({
      unmatchedVerdictCandidates: nextCandidates,
    });
    return;
  }
  const outbox = readOutbox(stored.captureOutbox);
  const nextOutbox = [...outbox, result.outboxItem];
  const bytesInUse = await chrome.storage.local.getBytesInUse(null);
  const quotaBytes = chrome.storage.local.QUOTA_BYTES;
  if (!canPersistCaptureBytes({
    quotaBytes,
    bytesInUse,
    estimatedWriteBytes: estimateCaptureBytes(result.outboxItem),
  })) {
    await chrome.storage.local.set({
      lastCaptureError: "Storage capacity reached: completed result was not persisted",
    });
    return;
  }
  await chrome.storage.local.set({
    pendingSubmissionIntents: result.intents,
    captureOutbox: nextOutbox,
    unmatchedVerdictCandidates: unmatched.filter(
      (value) => verdictCandidateKey(value) !== verdictCandidateKey(candidate),
    ),
    lastDetectedProblem: result.outboxItem.bundle.events[2],
  });
  await flushOutbox();
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
  }).then((outcome) => {
    if (outcome.reason === "batch_limit") executor.schedule(flushOutbox);
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

type ActionMessage = {
  readonly type: "RETRY_CAPTURE_OUTBOX" | "CLEAR_CAPTURE_OUTBOX" | "CLEAR_CAPTURE_QUARANTINE";
} | {
  readonly type: "RETRY_QUARANTINED_CAPTURE" | "DELETE_QUARANTINED_CAPTURE";
  readonly id: string;
};

async function handleAction(message: ActionMessage): Promise<void> {
  const state = await readOutboxState();
  if (message.type === "RETRY_CAPTURE_OUTBOX") {
    await chrome.storage.local.set(retryAllCaptureStorageUpdate(state));
    await flushOutbox();
    return;
  }
  if (message.type === "RETRY_QUARANTINED_CAPTURE") {
    await chrome.storage.local.set(retryQuarantinedCaptureStorageUpdate(state, message.id));
    await flushOutbox();
    return;
  }
  if (message.type === "DELETE_QUARANTINED_CAPTURE") {
    const deleted = deleteQuarantined(state.quarantine, message.id);
    await chrome.storage.local.set({ captureQuarantine: deleted.quarantine });
    if (deleted.deletedCount > 0 && deleted.quarantine.length === 0 && state.outbox.length === 0) {
      await chrome.storage.local.remove("lastCaptureError");
    }
    return;
  }
  if (message.type === "CLEAR_CAPTURE_OUTBOX") {
    await chrome.storage.local.set({ captureOutbox: [] });
    await chrome.storage.local.remove("lastCaptureError");
    return;
  }
  await chrome.storage.local.set({ captureQuarantine: [] });
  await chrome.storage.local.remove("lastCaptureError");
}

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

async function expireStoredIntents(): Promise<void> {
  const stored = await chrome.storage.local.get(["pendingSubmissionIntents"]);
  await chrome.storage.local.set({
    pendingSubmissionIntents: expireSubmissionIntents(
      readIntents(stored.pendingSubmissionIntents),
      new Date().toISOString(),
    ),
  });
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
    await flushOutbox();
    return { ok: true, installationId: paired.installationId, credentialVersion: paired.credentialVersion };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Pairing failed" };
  }
}

function readIntents(value: unknown): readonly PendingSubmissionIntent[] {
  return Array.isArray(value) ? value.filter(isPendingIntent) : [];
}

function isPendingIntent(value: unknown): value is PendingSubmissionIntent {
  return typeof value === "object" && value !== null
    && "submissionId" in value && typeof value.submissionId === "string"
    && "status" in value
    && (value.status === "active" || value.status === "superseded" || value.status === "expired");
}

function readOutbox(value: unknown): readonly CaptureOutboxItem[] {
  return Array.isArray(value) ? value.filter(isOutboxItem) : [];
}

function isOutboxItem(value: unknown): value is CaptureOutboxItem {
  return typeof value === "object" && value !== null
    && "kind" in value && value.kind === "attempt_bundle"
    && "id" in value && typeof value.id === "string"
    && "bundle" in value;
}

function readQuarantine(value: unknown): readonly CaptureQuarantineItem[] {
  return Array.isArray(value) ? value.filter(isQuarantineItem) : [];
}

function readVerdictCandidates(value: unknown): readonly VerdictCandidateMessage["candidate"][] {
  return Array.isArray(value) ? value.filter(isStoredVerdictCandidate) : [];
}

function isStoredVerdictCandidate(
  value: unknown,
): value is VerdictCandidateMessage["candidate"] {
  return isVerdictCandidateMessage({ type: "VERDICT_CANDIDATE_OBSERVED", candidate: value });
}

function verdictCandidateKey(candidate: VerdictCandidateMessage["candidate"]): string {
  return `${candidate.platform}:${candidate.problemExternalId}`;
}

function recentVerdictCandidates(
  candidates: readonly VerdictCandidateMessage["candidate"][],
  nowMs: number,
): readonly VerdictCandidateMessage["candidate"][] {
  return candidates.filter((candidate) => {
    const observedMs = Date.parse(candidate.observedAt);
    return Number.isFinite(observedMs)
      && observedMs <= nowMs
      && nowMs - observedMs <= UNMATCHED_CANDIDATE_TTL_MS;
  });
}

function isQuarantineItem(value: unknown): value is CaptureQuarantineItem {
  return typeof value === "object" && value !== null
    && "id" in value && typeof value.id === "string"
    && "item" in value && isOutboxItem(value.item)
    && "error" in value && typeof value.error === "string";
}

function isCaptureContextRequest(value: unknown): boolean {
  return typeof value === "object" && value !== null
    && "type" in value && value.type === "GET_CAPTURE_CONTEXT";
}

function createIdentifier(prefix: string): string {
  return typeof crypto.randomUUID === "function"
    ? `${prefix}_${crypto.randomUUID()}`
    : `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2)}`;
}
