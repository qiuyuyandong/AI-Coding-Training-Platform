import type { CDPSession, Page, Worker } from "@playwright/test";

import { EXTENSION_DIST, expect, test } from "./fixtures";
import {
  installSyntheticNetwork,
  SYNTHETIC_PAGE_URL,
  SYNTHETIC_SUBMISSION_URL,
  SYNTHETIC_WRONG_URL,
  WORKER_DENIAL_PROBE_URL,
} from "./servers";

type SafeSpikeMarker = {
  readonly requestId: string;
  readonly method: string;
  readonly endpointKey: string;
  readonly tabId: number;
  readonly frameId: number;
  readonly documentId: string;
  readonly receivedAt: string;
};

test("production dist observes a fulfilled synthetic request before and after worker suspension", async ({
  extensionContext,
  extensionWorker,
  extensionId,
}) => {
  expect(extensionId).toMatch(/^[a-p]{32}$/u);
  const network = await installSyntheticNetwork(extensionContext);
  await clearMarkers(extensionWorker);

  const page = extensionContext.pages()[0] ?? await extensionContext.newPage();
  await page.goto(SYNTHETIC_PAGE_URL);
  await page.evaluate(async (url) => {
    await fetch(url, { method: "POST" });
  }, SYNTHETIC_SUBMISSION_URL);

  await expect.poll(() => markerCount(extensionWorker)).toBe(1);
  expect(network.fulfilled).toContain(`POST ${SYNTHETIC_SUBMISSION_URL}`);
  expect(await workerNetworkIsDenied(extensionWorker)).toBe(true);
  expect(await readMarkers(extensionWorker)).toEqual([
    expect.objectContaining({
      method: "POST",
      endpointKey: "synthetic_submission_spike",
      tabId: expect.any(Number),
      frameId: 0,
      documentId: expect.any(String),
      requestId: expect.any(String),
      receivedAt: expect.any(String),
    }),
  ]);

  await page.evaluate(async ({ exact, wrong }) => {
    await fetch(exact, { method: "GET" });
    await fetch(wrong, { method: "POST" });
  }, { exact: SYNTHETIC_SUBMISSION_URL, wrong: SYNTHETIC_WRONG_URL });
  await expect.poll(() => markerCount(extensionWorker)).toBe(1);

  await stopAndReawakenServiceWorker(page, extensionWorker, async () => {
    await page.evaluate(async (url) => {
      await fetch(url, { method: "POST" });
    }, SYNTHETIC_SUBMISSION_URL);
  });
  const popup = await extensionContext.newPage();
  await popup.goto(`chrome-extension://${extensionId}/popup.html`);
  await expect.poll(() => markerCountFromPage(popup)).toBe(2);

  expect(network.fulfilled.filter((entry) =>
    entry === `POST ${SYNTHETIC_SUBMISSION_URL}`)).toHaveLength(2);
  expect(network.denied.filter((entry) =>
    !entry.endsWith("favicon.ico"))).toEqual([]);
  const browserVersion = extensionContext.browser()?.version()
    ?? await page.evaluate(() => navigator.userAgent);
  console.log("WEBREQUEST_SPIKE_EVIDENCE", JSON.stringify({
    browserVersion,
    distPath: EXTENSION_DIST,
    playwrightObservedPostCount: network.fulfilled.filter(
      (entry) => entry === `POST ${SYNTHETIC_SUBMISSION_URL}`,
    ).length,
    extensionMarkerCount: await markerCountFromPage(popup),
    deniedExternalRequestCount: network.denied.filter((entry) =>
      !entry.endsWith("favicon.ico")).length,
    workerNetworkDenialProbe: true,
    workerLifecycle: ["stopped", "running"],
  }));
});

async function readMarkers(worker: Worker): Promise<readonly SafeSpikeMarker[]> {
  return worker.evaluate(async () => {
    const stored = await chrome.storage.session.get(["webRequestSpikeMarkers"]);
    return Array.isArray(stored.webRequestSpikeMarkers)
      ? stored.webRequestSpikeMarkers
      : [];
  });
}

async function markerCount(worker: Worker): Promise<number> {
  return (await readMarkers(worker)).length;
}

async function markerCountFromPage(page: Page): Promise<number> {
  return page.evaluate(async () => {
    const stored = await chrome.storage.session.get(["webRequestSpikeMarkers"]);
    return Array.isArray(stored.webRequestSpikeMarkers)
      ? stored.webRequestSpikeMarkers.length
      : 0;
  });
}

async function clearMarkers(worker: Worker): Promise<void> {
  await worker.evaluate(async () => {
    await chrome.storage.session.set({ webRequestSpikeMarkers: [] });
  });
}

async function workerNetworkIsDenied(worker: Worker): Promise<boolean> {
  return worker.evaluate(async (url) => {
    try {
      await fetch(url, { cache: "no-store" });
      return false;
    } catch {
      return true;
    }
  }, WORKER_DENIAL_PROBE_URL);
}

async function stopAndReawakenServiceWorker(
  page: Page,
  worker: Worker,
  trigger: () => Promise<void>,
): Promise<void> {
  const session = await page.context().newCDPSession(page);
  try {
    const versionsPromise = new Promise<unknown>((resolve) => {
      session.once("ServiceWorker.workerVersionUpdated", resolve);
    });
    await session.send("ServiceWorker.enable");
    const versions = await Promise.race([
      versionsPromise,
      new Promise<never>((_resolve, reject) => {
        setTimeout(() => reject(new Error("Service worker versions were not reported")), 5_000);
      }),
    ]);
    const versionId = findVersionId(versions, worker.url());
    if (versionId === undefined) {
      throw new Error(`Cannot find service worker version for ${worker.url()}`);
    }
    const stopped = waitForWorkerStatus(session, worker.url(), "stopped");
    await session.send("ServiceWorker.stopWorker", { versionId });
    await stopped;
    const running = waitForWorkerStatus(session, worker.url(), "running");
    await trigger();
    await running;
  } finally {
    await session.detach();
  }
}

function waitForWorkerStatus(
  session: CDPSession,
  workerUrl: string,
  status: "stopped" | "running",
): Promise<void> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      session.off("ServiceWorker.workerVersionUpdated", inspect);
      reject(new Error(`Service worker did not reach ${status}`));
    }, 15_000);
    function inspect(value: unknown): void {
      if (!hasWorkerStatus(value, workerUrl, status)) return;
      clearTimeout(timeout);
      session.off("ServiceWorker.workerVersionUpdated", inspect);
      resolve();
    }
    session.on("ServiceWorker.workerVersionUpdated", inspect);
  });
}

function findVersionId(value: unknown, workerUrl: string): string | undefined {
  if (typeof value !== "object" || value === null || !("versions" in value)
    || !Array.isArray(value.versions)) return undefined;
  for (const version of value.versions) {
    if (typeof version === "object" && version !== null
      && "scriptURL" in version && version.scriptURL === workerUrl
      && "versionId" in version && typeof version.versionId === "string") {
      return version.versionId;
    }
  }
  return undefined;
}

function hasWorkerStatus(
  value: unknown,
  workerUrl: string,
  status: "stopped" | "running",
): boolean {
  if (typeof value !== "object" || value === null || !("versions" in value)
    || !Array.isArray(value.versions)) return false;
  return value.versions.some((version) =>
    typeof version === "object" && version !== null
      && "scriptURL" in version && version.scriptURL === workerUrl
      && "runningStatus" in version && version.runningStatus === status);
}
