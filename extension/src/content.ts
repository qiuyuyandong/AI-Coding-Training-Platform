import {
  endCaptureSession,
  observeSubmission,
  observeVerdict,
  startCaptureSession,
  type CaptureIdFactory,
  type CaptureSessionState,
} from "./captureSession";
import { CaptureRuntimeContextSchema } from "./installation";
import {
  detectProblemFromLocation,
  detectVerdictFromDocument,
  type DetectedProblem,
} from "./platforms";
import type { CaptureEvent } from "@/lib/capture/protocol";

void run();

async function run(): Promise<void> {
  const settings = await chrome.storage.local.get(["captureEnabled"]);
  if (settings.captureEnabled === false) return;

  const detected = detectProblemFromLocation(window.location, document.title);
  if (!detected) return;

  const contextResult: unknown = await chrome.runtime.sendMessage({
    type: "GET_CAPTURE_CONTEXT",
  });
  const parsedContext = CaptureRuntimeContextSchema.safeParse(contextResult);
  if (!parsedContext.success) return;

  const started = startCaptureSession(
    detected,
    parsedContext.data,
    new Date().toISOString(),
    createCaptureId,
  );
  let sessionState = started.state;
  sendCaptureEvent(started.event);

  observeSubmissions(() => sessionState, (next) => {
    sessionState = next;
  });
  observeVerdicts(detected, () => sessionState, (next) => {
    sessionState = next;
  });
  window.addEventListener("pagehide", () => {
    sendCaptureEvent(
      endCaptureSession(
        sessionState,
        "pagehide",
        new Date().toISOString(),
        createCaptureId,
      ),
    );
  });
}

function observeSubmissions(
  getState: () => CaptureSessionState,
  setState: (state: CaptureSessionState) => void,
): void {
  document.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof Element)) return;

    const text = target.textContent?.toLowerCase() ?? "";
    if (!text.includes("submit") && !text.includes("提交")) return;

    const observed = observeSubmission(
      getState(),
      new Date().toISOString(),
      createCaptureId,
    );
    setState(observed.state);
    sendCaptureEvent(observed.event);
  });
}

function observeVerdicts(
  detected: DetectedProblem,
  getState: () => CaptureSessionState,
  setState: (state: CaptureSessionState) => void,
): void {
  const publishVerdict = (): void => {
    const verdict = detectVerdictFromDocument(detected.platform, document);
    if (verdict === null) return;

    const observed = observeVerdict(
      getState(),
      verdict.verdict,
      new Date().toISOString(),
      createCaptureId,
    );
    setState(observed.state);
    if (observed.event !== undefined) sendCaptureEvent(observed.event);
  };

  publishVerdict();
  const observer = new MutationObserver(publishVerdict);
  observer.observe(document.body, {
    childList: true,
    subtree: true,
    characterData: true,
  });
}

function sendCaptureEvent(event: CaptureEvent): void {
  void chrome.runtime.sendMessage({ type: "CAPTURE_EVENT", event });
}

const createCaptureId: CaptureIdFactory = (kind) => {
  if (typeof crypto.randomUUID === "function") {
    return `${kind}_${crypto.randomUUID()}`;
  }
  return `${kind}_${Date.now()}_${Math.random().toString(36).slice(2)}`;
};
