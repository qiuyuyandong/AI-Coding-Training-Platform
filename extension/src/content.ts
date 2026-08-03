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
import { isVerdictCandidateMessage } from "@/extension/src/attemptCapture";
import {
  isEligibleUiHint,
  isUiHintMessage,
} from "@/extension/src/uiHint";
import {
  createExtensionContextGuard,
  isExtensionContextInvalidatedError,
  settleExtensionOperation,
} from "@/extension/src/extensionOperation";
import { bootstrapContentRuntime } from "@/extension/src/contentBootstrap";
import { isExactNowCoderResultUrl } from "@/extension/src/contentIngress";

const NAVIGATION_POLL_MS = 500;

void bootstrapContentRuntime({
  isolatedGlobal: globalThis,
  install: run,
  reannounceReady: sendContentRuntimeReady,
}).catch((error: unknown) => {
  reportContentRuntimeError("[capture-v4] content runtime failed", error);
});

async function run(announceReady: () => void): Promise<boolean> {
  const contextResult: unknown = await chrome.runtime.sendMessage({
    type: "GET_CAPTURE_CONTEXT",
  });
  const parsedContext = CaptureRuntimeContextSchema.safeParse(contextResult);
  if (!parsedContext.success || !parsedContext.data.captureEnabled) return false;

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
    activeDocumentId: getActiveDocumentId(),
  });

  let lastHref = window.location.href;
  let pollId: number | undefined;
  let observer: MutationObserver | undefined;
  const contextGuard = createExtensionContextGuard((error) => {
    void error;
    console.error("[capture-v4] content callback failed");
  });

  function observeLocation(): boolean {
    if (window.location.href === lastHref) return false;
    lastHref = window.location.href;
    sendCharacterizationNavigationWitness();
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
    sendCharacterizationNavigationWitness();
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
      // A click is only a bounded diagnostic hint. Waiting state requires
      // server-confirmed evidence in a later V4 phase.
      const detected = detectProblemFromPage(window.location, document);
      if (detected === null) return;
      if (!isEligibleUiHint({
        isTrusted: event.isTrusted,
        platform: detected.platform,
        target,
      })) return;
      forwardMessages(runtime.uiHintObserved());
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
    announceReady();
    forwardMessages(runtime.start());
    startWatchers();
  });
  return true;
}

function sendContentRuntimeReady(): void {
  let current: URL;
  try {
    current = new URL(window.location.href);
  } catch {
    return;
  }
  if (!isExactNowCoderResultUrl(current)) return;
  void settleExtensionOperation(
    () => chrome.runtime.sendMessage({
      type: "CONTENT_RUNTIME_READY",
      schemaVersion: 1,
      purpose: "capture",
    }),
    (error) => reportContentRuntimeError("[capture-v4] readiness was not delivered", error),
  );
}

function sendCharacterizationNavigationWitness(): void {
  void settleExtensionOperation(
    () => chrome.runtime.sendMessage({ type: "CHARACTERIZATION_NAVIGATION_OBSERVED" }),
    (error) => reportContentRuntimeError("[capture-v4] navigation witness was not delivered", error),
  );
}

function forwardMessages(messages: readonly unknown[]): void {
  for (const message of messages) {
    if (
      isUiHintMessage(message) ||
      isVerdictCandidateMessage(message)
    ) {
      void settleExtensionOperation(
        () => chrome.runtime.sendMessage(message),
        (error) =>
          reportContentRuntimeError(
            "[capture-v4] runtime message was not delivered",
            error,
          ),
      );
    }
  }
}

function reportContentRuntimeError(message: string, error: unknown): void {
  if (isExtensionContextInvalidatedError(error)) return;
  void error;
  console.error(message);
}

function getActiveDocumentId(): string | undefined {
  // sender.documentId is supplied by chrome.runtime.sendMessage at the
  // background worker. The runtime treats this as trusted, but the content
  // script never reads or recomputes it from page-script data.
  return undefined;
}
