import {
  planExtensionInitialization,
  runtimeContextFromStored,
  type CaptureRuntimeContext,
  type ExtensionInitializationPlan,
} from "./installation";
import {
  isPairCaptureInstallationMessage,
  pairingEndpointFromCaptureEndpoint,
  parsePairCaptureApiResponse,
  type PairCaptureInstallationMessage,
  type PairCaptureResult,
} from "./pairing";
import { drainCaptureQueue } from "./queueDrain";
import { createSerializedWorkExecutor } from "./serializedWork";
import {
  enqueueCaptureEvent,
  captureRequestHeaders,
  isCaptureMessage,
  isQueueItem,
  readCaptureEndpoint,
  type CaptureQueueItem,
  type FlushResult,
} from "./transport";

const INITIALIZATION_STORAGE_KEYS = [
  "captureEnabled",
  "captureEndpoint",
  "captureCredential",
  "captureProtocolVersion",
  "discardedLegacyEventCount",
  "eventQueue",
  "installationId",
  "legacyQueueDiscardedAt",
] as const;
const FLUSH_ALARM_NAME = "flushCaptureQueue";

const initialization = initializeExtension();
const executor = createSerializedWorkExecutor(
  initialization.then(() => undefined),
  (error) => {
    console.error("[capture-v2] queue operation failed", error);
  },
);

chrome.runtime.onInstalled.addListener(() => {
  void initialization;
  void chrome.alarms.create(FLUSH_ALARM_NAME, { periodInMinutes: 1 });
});

chrome.runtime.onMessage.addListener((message: unknown, _sender, sendResponse) => {
  if (isCaptureContextRequest(message)) {
    void initialization
      .then(readRuntimeContext)
      .then((context) => sendResponse(context))
      .catch((error: unknown) => {
        console.error("[capture-v2] initialization failed", error);
        sendResponse(undefined);
      });
    return true;
  }

  if (isPairCaptureInstallationMessage(message)) {
    void initialization
      .then(() => pairCaptureInstallation(message))
      .then((result) => sendResponse(result))
      .catch((error: unknown) => {
        console.error("[capture-v2] pairing failed", error);
        sendResponse({ ok: false, error: "Pairing failed" });
      });
    return true;
  }

  if (!isCaptureMessage(message)) return false;
  executor.schedule(() => enqueueAndFlush(message.event));
  return false;
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === FLUSH_ALARM_NAME) {
    executor.schedule(flushQueue);
  }
});

async function initializeExtension(): Promise<void> {
  await chrome.storage.local.setAccessLevel({ accessLevel: "TRUSTED_CONTEXTS" });
  const stored = await chrome.storage.local.get(INITIALIZATION_STORAGE_KEYS);
  const plan = planExtensionInitialization(stored, {
    now: new Date().toISOString(),
    createInstallationId: () => createIdentifier("installation"),
  });

  await chrome.storage.local.set(initializationStorage(plan));
  if (plan.shouldLogLegacyDiscard) {
    console.info(
      `[capture-v2] discarded ${plan.discardedLegacyEventCount} queued V1 event(s)`,
    );
  }
}

function initializationStorage(plan: ExtensionInitializationPlan): Record<string, unknown> {
  const stored: Record<string, unknown> = {
    installationId: plan.installationId,
    captureEnabled: plan.captureEnabled,
    captureEndpoint: plan.captureEndpoint,
    captureProtocolVersion: plan.captureProtocolVersion,
    eventQueue: plan.eventQueue,
    discardedLegacyEventCount: plan.discardedLegacyEventCount,
  };
  if (plan.legacyQueueDiscardedAt !== undefined) {
    stored.legacyQueueDiscardedAt = plan.legacyQueueDiscardedAt;
  }
  if (plan.captureCredential !== undefined) {
    stored.captureCredential = plan.captureCredential;
  }
  return stored;
}

async function readRuntimeContext(): Promise<CaptureRuntimeContext> {
  const stored = await chrome.storage.local.get([
    "installationId",
    "captureEnabled",
    "captureCredential",
  ]);
  return runtimeContextFromStored(stored);
}

async function enqueueAndFlush(event: CaptureQueueItem["event"]): Promise<void> {
  const state = await chrome.storage.local.get(["captureEnabled", "eventQueue"]);
  if (state.captureEnabled === false) return;

  const queue = enqueueCaptureEvent(readQueue(state.eventQueue), event);
  await chrome.storage.local.set({ eventQueue: queue, lastDetectedProblem: event });
  await flushQueue();
}

async function flushQueue(): Promise<void> {
  const outcome = await drainCaptureQueue({
    readQueue: async () => {
      const state = await chrome.storage.local.get(["eventQueue"]);
      return readQueue(state.eventQueue);
    },
    send: async (event) => {
      const state = await chrome.storage.local.get([
        "captureEndpoint",
        "captureCredential",
      ]);
      return postCaptureEvent(
        event,
        readCaptureEndpoint(state.captureEndpoint),
        state.captureCredential,
      );
    },
    persist: async (plan) => {
      await chrome.storage.local.set(plan);
    },
  });

  if (outcome.reason === "batch_limit") {
    executor.schedule(flushQueue);
  }
}

async function postCaptureEvent(
  event: CaptureQueueItem["event"],
  endpoint: string,
  credential: unknown,
): Promise<FlushResult> {
  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: captureRequestHeaders(credential),
      body: JSON.stringify(event),
    });

    if (response.ok) return { status: 200 };

    const body = await readErrorBody(response);
    if (response.status === 400) return { status: 400, error: body };
    if (response.status === 401) return { status: 401, error: body };
    if (response.status === 403) return { status: 403, error: body };
    if (response.status === 413) return { status: 413, error: body };
    if (response.status === 415) return { status: 415, error: body };
    if (response.status === 409) return { status: 409, error: body };
    return { status: 500, error: body };
  } catch (error) {
    return {
      status: "network_error",
      error: error instanceof Error ? error.message : "Network error",
    };
  }
}

async function pairCaptureInstallation(
  message: PairCaptureInstallationMessage,
): Promise<PairCaptureResult> {
  const state = await chrome.storage.local.get([
    "captureEndpoint",
    "installationId",
  ]);
  if (typeof state.installationId !== "string" || state.installationId.length === 0) {
    return { ok: false, error: "Extension installation is not initialized" };
  }

  try {
    const response = await fetch(
      pairingEndpointFromCaptureEndpoint(state.captureEndpoint),
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          code: message.code,
          installationId: state.installationId,
        }),
      },
    );
    if (!response.ok) {
      return { ok: false, error: await readErrorBody(response) };
    }
    const body: unknown = await response.json();
    const paired = parsePairCaptureApiResponse(body, state.installationId);
    await chrome.storage.local.set({
      captureCredential: paired.credential,
      captureCredentialVersion: paired.credentialVersion,
      pairedAt: new Date().toISOString(),
    });
    await chrome.storage.local.remove("lastCaptureError");
    executor.schedule(flushQueue);
    return {
      ok: true,
      installationId: paired.installationId,
      credentialVersion: paired.credentialVersion,
    };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Pairing failed",
    };
  }
}

async function readErrorBody(response: Response): Promise<string> {
  try {
    const body: unknown = await response.json();
    if (typeof body === "object" && body !== null && "error" in body) {
      return String(body.error);
    }
    return response.statusText || `HTTP ${response.status}`;
  } catch (error) {
    if (error instanceof SyntaxError) {
      return response.statusText || `HTTP ${response.status}`;
    }
    throw error;
  }
}

function readQueue(value: unknown): readonly CaptureQueueItem[] {
  return Array.isArray(value) ? value.filter(isQueueItem) : [];
}

function isCaptureContextRequest(value: unknown): boolean {
  return typeof value === "object"
    && value !== null
    && "type" in value
    && value.type === "GET_CAPTURE_CONTEXT";
}

function createIdentifier(prefix: string): string {
  if (typeof crypto.randomUUID === "function") {
    return `${prefix}_${crypto.randomUUID()}`;
  }
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2)}`;
}
