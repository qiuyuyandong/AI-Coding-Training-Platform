import { CaptureRuntimeContextSchema } from "@/extension/src/installation";
import {
  createCaptureContentRuntime,
  type CaptureContentRuntime,
} from "@/extension/src/contentRuntime";
import {
  detectProblemFromPage,
  detectVerdictFromDocument,
  isExactSubmissionResultPage,
} from "@/extension/src/platforms";
import {
  isSubmissionIntentMessage,
  isVerdictCandidateMessage,
} from "@/extension/src/attemptCapture";
import { isExactSubmitControl } from "@/extension/src/submissionControl";
import {
  createExtensionContextGuard,
  isExtensionContextInvalidatedError,
  settleExtensionOperation,
} from "@/extension/src/extensionOperation";

const NAVIGATION_POLL_MS = 500;

void run().catch((error: unknown) => {
  reportContentRuntimeError("[capture-v3] content runtime failed", error);
});

async function run(): Promise<void> {
  const contextResult: unknown = await chrome.runtime.sendMessage({
    type: "GET_CAPTURE_CONTEXT",
  });
  const parsedContext = CaptureRuntimeContextSchema.safeParse(contextResult);
  if (!parsedContext.success || !parsedContext.data.captureEnabled) return;

  const runtime: CaptureContentRuntime = createCaptureContentRuntime({
    detectProblem: () => detectProblemFromPage(window.location, document),
    detectVerdict: () => {
      const detected = detectProblemFromPage(window.location, document);
      if (detected === null) return null;
      const verdict = detectVerdictFromDocument(detected.platform, document);
      return verdict === null
        ? { verdict: null }
        : { verdict: verdict.verdict };
    },
    exactResultPage: (detected) =>
      isExactSubmissionResultPage(window.location, document, detected),
    now: () => new Date().toISOString(),
    createSessionId: () => createCaptureId("session"),
    createSubmissionIntentId: () => createCaptureId("submission"),
    activeDocumentId: getActiveDocumentId(),
  });

  let lastHref = window.location.href;
  let pollId: number | undefined;
  let observer: MutationObserver | undefined;
  const contextGuard = createExtensionContextGuard((error) => {
    console.error("[capture-v3] content callback failed", error);
  });

  function observeLocation(): boolean {
    if (window.location.href === lastHref) return false;
    lastHref = window.location.href;
    const messages = runtime.locationObserved();
    forwardMessages(messages);
    return true;
  }

  function startWatchers(): void {
    if (pollId === undefined) {
      pollId = window.setInterval(() => {
        contextGuard.run(() => {
          observeLocation();
        });
      }, NAVIGATION_POLL_MS);
    }
    if (observer !== undefined || document.body === null) return;

    observer = new MutationObserver(() => {
      contextGuard.run(() => {
        observeLocation();
        forwardMessages(runtime.documentMutated());
      });
    });
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true,
    });
  }

  function observeInitialDocument(): void {
    forwardMessages(runtime.locationObserved());
    startWatchers();
  }
  if (document.readyState === "loading") {
    document.addEventListener(
      "DOMContentLoaded",
      () => {
        contextGuard.run(observeInitialDocument);
      },
      { once: true },
    );
  } else {
    contextGuard.run(observeInitialDocument);
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
    contextGuard.run(() => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      // Strict submit gate: page must resolve to a supported problem page AND
      // the click target must resolve to an exact platform-allowed submit
      // control. Substring matches (登录并提交, 提交记录, Submit Solution Now)
      // are silently rejected. The runtime records one intent message per
      // qualifying click; subsequent clicks supersede previous intents at the
      // background layer.
      const detected = detectProblemFromPage(window.location, document);
      if (detected === null) return;
      if (!isExactSubmitControl(detected.platform, target)) return;
      forwardMessages(runtime.submissionObserved());
    });
  });
  window.addEventListener("popstate", () => {
    contextGuard.run(() => {
      observeLocation();
      forwardMessages(runtime.documentMutated());
    });
  });
  window.addEventListener("hashchange", () => {
    contextGuard.run(() => {
      observeLocation();
      forwardMessages(runtime.documentMutated());
    });
  });
  window.addEventListener("pagehide", () => {
    contextGuard.run(() => {
      forwardMessages(runtime.pageHidden());
      stopWatchers();
    });
  });
  window.addEventListener("pageshow", () => {
    contextGuard.run(() => {
      lastHref = window.location.href;
      forwardMessages(runtime.pageShown());
      startWatchers();
    });
  });

  contextGuard.run(() => {
    forwardMessages(runtime.start());
    startWatchers();
  });
}

function forwardMessages(messages: readonly unknown[]): void {
  for (const message of messages) {
    if (
      isSubmissionIntentMessage(message) ||
      isVerdictCandidateMessage(message)
    ) {
      void settleExtensionOperation(
        () => chrome.runtime.sendMessage(message),
        (error) =>
          reportContentRuntimeError(
            "[capture-v3] runtime message was not delivered",
            error,
          ),
      );
    }
  }
}

function reportContentRuntimeError(message: string, error: unknown): void {
  if (isExtensionContextInvalidatedError(error)) return;
  console.error(message, error);
}

function getActiveDocumentId(): string | undefined {
  // sender.documentId is supplied by chrome.runtime.sendMessage at the
  // background worker. The runtime treats this as trusted, but the content
  // script never reads or recomputes it from page-script data.
  return undefined;
}

function createCaptureId(kind: "session" | "submission"): string {
  if (typeof crypto.randomUUID === "function") {
    return `${kind}_${crypto.randomUUID()}`;
  }
  return `${kind}_${Date.now()}_${Math.random().toString(36).slice(2)}`;
}
