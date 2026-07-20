import { type CaptureIdFactory } from "./captureSession";
import { createCaptureContentRuntime } from "./contentRuntime";
import { CaptureRuntimeContextSchema } from "./installation";
import {
  detectProblemFromPage,
  detectVerdictFromDocument,
} from "./platforms";
import { isExactSubmitControl } from "./submissionControl";
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
    detectProblem: () => detectProblemFromPage(
      window.location,
      document,
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
    // Two independent guards before forwarding to the runtime:
    //   1. The current URL must resolve to a supported problem page; this
    //      rejects login / registration / record / company / home pages that
    //      happen to contain the word "submit" or "提交".
    //   2. The click target must be a recognized interactive control whose
    //      normalized label is exactly an allowed submit label for that
    //      platform. Substring matches such as "登录并提交", "提交记录" or
    //      "Submit Solution Now" are explicitly rejected by the allowlist.
    // The runtime still owns the active-session gate (reconcile + check
    // state.active) and emits the SUBMISSION_OBSERVED event.
    const detected = detectProblemFromPage(window.location, document);
    if (detected === null) return;
    if (!isExactSubmitControl(detected.platform, target)) return;
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
