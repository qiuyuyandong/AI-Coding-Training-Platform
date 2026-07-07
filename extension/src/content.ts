import { detectProblemFromLocation, detectVerdictFromDocument, type DetectedProblem } from "./platforms";

void run();

let lastSentVerdict: string | null = null;

async function run(): Promise<void> {
  const state = await chrome.storage.local.get(["captureEnabled"]);
  if (state.captureEnabled === false) return;

  const detected = detectProblemFromLocation(window.location, document.title);
  if (!detected) return;

  sendCaptureEvent("PAGE_DETECTED", detected, { source: "content_script" });
  observeSubmissions(detected);
  observeVerdicts(detected);
  window.addEventListener("pagehide", () => {
    sendCaptureEvent("TRAINING_ENDED", detected, { source: "content_script" });
  });
}

function observeSubmissions(detected: DetectedProblem): void {
  document.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof Element)) return;

    const text = target.textContent?.toLowerCase() ?? "";
    if (!text.includes("submit") && !text.includes("提交")) return;

    sendCaptureEvent("SUBMISSION_DETECTED", detected, { source: "content_script", action: "submit_clicked" });
  });
}

function observeVerdicts(detected: DetectedProblem): void {
  const publishVerdict = (): void => {
    const verdict = detectVerdictFromDocument(detected.platform, document);
    if (verdict === null || verdict.verdict === lastSentVerdict) return;

    lastSentVerdict = verdict.verdict;
    sendCaptureEvent("VERDICT_UPDATED", detected, { source: "content_script", verdict: verdict.verdict });
  };

  publishVerdict();
  const observer = new MutationObserver(publishVerdict);
  observer.observe(document.body, { childList: true, subtree: true, characterData: true });
}

function sendCaptureEvent(type: "PAGE_DETECTED" | "TRAINING_STARTED" | "SUBMISSION_DETECTED" | "VERDICT_UPDATED" | "TRAINING_ENDED", detected: DetectedProblem, payload: Record<string, unknown>): void {
  chrome.runtime.sendMessage({
    type: "CAPTURE_EVENT",
    event: {
      id: createEventId(),
      type,
      ...detected,
      occurredAt: new Date().toISOString(),
      payload,
    },
  });
}

function createEventId(): string {
  if (typeof crypto.randomUUID === "function") return `evt_${crypto.randomUUID()}`;
  return `evt_${Date.now()}_${Math.random().toString(36).slice(2)}`;
}
