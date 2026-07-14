import { type CaptureIdFactory } from "./captureSession";
import { createCaptureContentRuntime } from "./contentRuntime";
import { CaptureRuntimeContextSchema } from "./installation";
import {
  detectProblemFromLocation,
  detectVerdictFromDocument,
} from "./platforms";
import type { CaptureEvent } from "@/lib/capture/protocol";

const NAVIGATION_POLL_MS = 500;

void run().catch((error: unknown) => {
  console.error("[capture-v2] content runtime failed", error);
});

async function run(): Promise<void> {
  const contextResult: unknown = await chrome.runtime.sendMessage({
    type: "GET_CAPTURE_CONTEXT",
  });
  const parsedContext = CaptureRuntimeContextSchema.safeParse(contextResult);
  if (!parsedContext.success || !parsedContext.data.captureEnabled) return;

  const runtime = createCaptureContentRuntime({
    context: parsedContext.data,
    detectProblem: () => detectProblemFromLocation(
      window.location,
      document.title,
    ),
    detectVerdict: (platform) => detectVerdictFromDocument(platform, document),
    sendEvent: sendCaptureEvent,
    now: () => new Date().toISOString(),
    createId: createCaptureId,
  });

  let lastHref = window.location.href;
  let pollId: number | undefined;
  let observer: MutationObserver | undefined;

  function observeLocation(): boolean {
    if (window.location.href === lastHref) return false;
    lastHref = window.location.href;
    runtime.locationObserved();
    return true;
  }

  function startWatchers(): void {
    if (pollId === undefined) {
      pollId = window.setInterval(observeLocation, NAVIGATION_POLL_MS);
    }
    if (observer !== undefined || document.body === null) return;

    observer = new MutationObserver(() => {
      observeLocation();
      runtime.documentMutated();
    });
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true,
    });
  }

  function stopWatchers(): void {
    if (pollId !== undefined) {
      window.clearInterval(pollId);
      pollId = undefined;
    }
    observer?.disconnect();
    observer = undefined;
  }

  document.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof Element)) return;

    const text = target.textContent?.toLowerCase() ?? "";
    if (!text.includes("submit") && !text.includes("提交")) return;
    runtime.submissionObserved();
  });
  window.addEventListener("popstate", observeLocation);
  window.addEventListener("hashchange", observeLocation);
  window.addEventListener("pagehide", () => {
    runtime.pageHidden();
    stopWatchers();
  });
  window.addEventListener("pageshow", () => {
    lastHref = window.location.href;
    runtime.pageShown();
    startWatchers();
  });

  runtime.start();
  startWatchers();
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
