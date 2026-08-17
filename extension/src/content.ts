import { CaptureRuntimeContextSchema } from "@/extension/src/installation";
import {
  createCaptureContentRuntime,
  type CaptureContentRuntime,
} from "@/extension/src/contentRuntime";
import {
  detectProblemFromPage,
  detectVerdictObservationFromDocument,
  isExactSubmissionResultPage,
} from "@/extension/src/platforms";
import { isVerdictCandidateMessage } from "@/extension/src/attemptCapture";
import {
  isEligibleUiHint,
  isUiHintMessage,
  isVisibleSeededSubmitControl,
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
      const verdict = detectVerdictObservationFromDocument(detected.platform, document);
      return verdict === null
        ? { verdict: null }
        : { verdict: verdict.verdict, verdictSurface: verdict.verdictSurface };
    },
    exactResultPage: (detected) =>
      isExactSubmissionResultPage(window.location, document, detected),
    now: () => new Date().toISOString(),
    activeDocumentId: getActiveDocumentId(),
  });

  let lastHref = window.location.href;
  let pollId: number | undefined;
  let observer: MutationObserver | undefined;
  let seededVisibleHint = false;
  const contextGuard = createExtensionContextGuard((error) => {
    void error;
    console.error("[capture-v4] content callback failed");
  });

  // Background control messages are admitted only for the two exact
  // LeetCode epoch types.  The runtime parser performs the strict key,
  // identity, and timestamp checks; the response is a closed, identity-free
  // diagnostic enum and never includes page data.
  const controlMessageListener = (
    message: unknown,
    _sender: chrome.runtime.MessageSender,
    sendResponse: (response: unknown) => void,
  ): boolean => {
    const type = typeof message === "object" && message !== null
      ? Reflect.get(message, "type")
      : undefined;
    if (type !== "LEETCODE_SUBMIT_EPOCH_STARTED"
      && type !== "LEETCODE_SUBMIT_EPOCH_CONFIRMED") return false;
    const messages = runtime.controlMessageReceived(message);
    forwardMessages(messages);
    sendResponse(runtime.controlMessageResponse());
    return false;
  };
  chrome.runtime.onMessage.addListener(controlMessageListener);

  function seedVisibleUiHint(): void {
    const detected = detectProblemFromPage(window.location, document);
    if (detected === null) {
      seededVisibleHint = false;
      return;
    }
    const visible = isVisibleSeededSubmitControl(detected.platform, document);
    if (visible && !seededVisibleHint) {
      seededVisibleHint = true;
      forwardMessages(runtime.uiHintVisible());
    }
    if (!visible) seededVisibleHint = false;
  }

  function observeLocation(): boolean {
    if (window.location.href === lastHref) return false;
    lastHref = window.location.href;
    seededVisibleHint = false;
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
          seedVisibleUiHint();
        });
      }, NAVIGATION_POLL_MS);
    }
    if (observer !== undefined || document.body === null) return;

    observer = new MutationObserver(() => {
      contextGuard.run(() => {
        observeLocation();
        forwardMessages(runtime.documentMutated());
        seedVisibleUiHint();
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
    seedVisibleUiHint();
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
      // server-confirmed evidence in a later V4 phase. When the visibility
      // seed already emitted the E0 hint for the current control, the click
      // must not emit a second hint: NowCoder confirmation requires exactly
      // one problem candidate and a duplicate would be ambiguous.
      if (seededVisibleHint) return;
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
      seededVisibleHint = false;
      forwardMessages(runtime.pageHidden());
      stopWatchers();
    });
  });
  window.addEventListener("pageshow", () => {
    contextGuard.run(() => {
      lastHref = window.location.href;
      seededVisibleHint = false;
      forwardMessages(runtime.pageShown());
      startWatchers();
      seedVisibleUiHint();
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
