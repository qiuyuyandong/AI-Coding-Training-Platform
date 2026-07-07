import { DEFAULT_CAPTURE_ENDPOINT, enqueueCaptureEvent, isCaptureMessage, isQueueItem, planQueueAfterFlush, readCaptureEndpoint, type CaptureQueueItem, type FlushResult } from "./transport";

const STORAGE_KEYS = ["captureEnabled", "eventQueue"] as const;
const FLUSH_ALARM_NAME = "flushCaptureQueue";

chrome.runtime.onInstalled.addListener(() => {
  void chrome.storage.local.set({ captureEnabled: true, eventQueue: [], captureEndpoint: DEFAULT_CAPTURE_ENDPOINT });
  void chrome.alarms.create(FLUSH_ALARM_NAME, { periodInMinutes: 1 });
});

chrome.runtime.onMessage.addListener((message: unknown) => {
  if (!isCaptureMessage(message)) return;
  void enqueueAndFlush(message.event);
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === FLUSH_ALARM_NAME) void flushQueue();
});

async function enqueueAndFlush(event: CaptureQueueItem["event"]): Promise<void> {
  const state = await chrome.storage.local.get(STORAGE_KEYS);
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

  const result = await postCaptureEvent(head.event, readCaptureEndpoint(state.captureEndpoint));
  const plan = planQueueAfterFlush(queue, result);
  await chrome.storage.local.set(plan);
}

async function postCaptureEvent(event: CaptureQueueItem["event"], endpoint: string): Promise<FlushResult> {
  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(event),
    });

    if (response.ok) return { status: 200 };

    const body = await readErrorBody(response);
    if (response.status === 400) return { status: 400, error: body };
    return { status: 500, error: body };
  } catch (error) {
    return { status: "network_error", error: error instanceof Error ? error.message : "Network error" };
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
    if (error instanceof SyntaxError) return response.statusText || `HTTP ${response.status}`;
    throw error;
  }
}

function readQueue(value: unknown): readonly CaptureQueueItem[] {
  return Array.isArray(value) ? value.filter(isQueueItem) : [];
}
