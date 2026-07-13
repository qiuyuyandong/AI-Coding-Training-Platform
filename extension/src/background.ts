import {
  planExtensionInitialization,
  runtimeContextFromPlan,
  type CaptureRuntimeContext,
  type ExtensionInitializationPlan,
} from "./installation";
import {
  enqueueCaptureEvent,
  isCaptureMessage,
  isQueueItem,
  planQueueAfterFlush,
  readCaptureEndpoint,
  type CaptureQueueItem,
  type FlushResult,
} from "./transport";

const INITIALIZATION_STORAGE_KEYS = [
  "captureEnabled",
  "captureEndpoint",
  "captureProtocolVersion",
  "discardedLegacyEventCount",
  "eventQueue",
  "installationId",
  "legacyQueueDiscardedAt",
] as const;
const FLUSH_ALARM_NAME = "flushCaptureQueue";

const initialization = initializeExtension();
let captureWork: Promise<void> = initialization.then(() => undefined);

chrome.runtime.onInstalled.addListener(() => {
  void initialization;
  void chrome.alarms.create(FLUSH_ALARM_NAME, { periodInMinutes: 1 });
});

chrome.runtime.onMessage.addListener((message: unknown, _sender, sendResponse) => {
  if (isCaptureContextRequest(message)) {
    void initialization
      .then((context) => sendResponse(context))
      .catch((error: unknown) => {
        console.error("[capture-v2] initialization failed", error);
        sendResponse(undefined);
      });
    return true;
  }

  if (!isCaptureMessage(message)) return false;
  scheduleCaptureWork(() => enqueueAndFlush(message.event));
  return false;
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === FLUSH_ALARM_NAME) {
    scheduleCaptureWork(flushQueue);
  }
});

async function initializeExtension(): Promise<CaptureRuntimeContext> {
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
  return runtimeContextFromPlan(plan);
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
  return stored;
}

function scheduleCaptureWork(work: () => Promise<void>): void {
  captureWork = captureWork
    .then(work)
    .catch((error: unknown) => {
      console.error("[capture-v2] queue operation failed", error);
    });
}

async function enqueueAndFlush(event: CaptureQueueItem["event"]): Promise<void> {
  const state = await chrome.storage.local.get(["captureEnabled", "eventQueue"]);
  if (state.captureEnabled === false) return;

  const queue = enqueueCaptureEvent(readQueue(state.eventQueue), event);
  await chrome.storage.local.set({ eventQueue: queue, lastDetectedProblem: event });
  await flushQueue();
}

async function flushQueue(): Promise<void> {
  const state = await chrome.storage.local.get(["eventQueue", "captureEndpoint"]);
  const queue = readQueue(state.eventQueue);
  const [head] = queue;

  if (head === undefined) return;

  const result = await postCaptureEvent(
    head.event,
    readCaptureEndpoint(state.captureEndpoint),
  );
  const plan = planQueueAfterFlush(queue, result);
  await chrome.storage.local.set(plan);
}

async function postCaptureEvent(
  event: CaptureQueueItem["event"],
  endpoint: string,
): Promise<FlushResult> {
  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(event),
    });

    if (response.ok) return { status: 200 };

    const body = await readErrorBody(response);
    if (response.status === 400) return { status: 400, error: body };
    if (response.status === 409) return { status: 409, error: body };
    return { status: 500, error: body };
  } catch (error) {
    return {
      status: "network_error",
      error: error instanceof Error ? error.message : "Network error",
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
