/**
 * Phase D D1.5 — exact production-dist upgrade/restart/update reliability.
 *
 * This suite owns the dedicated service-worker lifecycle lane. It does not use
 * the generic Phase A restart skip: every worker stop is followed by CDP
 * re-acquisition of the live worker and a post-restart assertion.
 *
 * All OJ traffic is Fake OJ traffic fulfilled by Playwright. The only durable
 * database used by this suite is the extension-E2E disposable SQLite file.
 */

import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { dirname, resolve } from "node:path";

import {
  chromium,
  type BrowserContext,
  type Page,
  type Worker,
} from "@playwright/test";

import { expect, test } from "./fixtures";
import {
  NOWCODER_B7_LIST_URL,
  NOWCODER_B7_PROBLEM_URL,
  NOWCODER_B7_SUBMIT_URL,
  nowCoderB7ResultUrl,
  nowCoderB7StatusUrl,
  readFakeOjStorage,
  removeFakeOjProfile,
  stopAndReawakenFakeOjWorker,
  type FakeOjOrchestratorStorage,
} from "./fakeOj";
import {
  readDatabaseCounts,
  snapshotDefaultDatabase,
  verifyDefaultDatabaseUntouched,
} from "./database";
import { EXTENSION_DIST } from "./fixtures";

test.setTimeout(240_000);

const DB_PATH_FILE = resolve(process.cwd(), ".tmp", "server-db-path.txt");
const DISABLED_CAPTURE_ENDPOINT = "http://127.0.0.1:9/api/capture/events";
const CAPTURE_ENDPOINT = "http://localhost:3000/api/capture/attempts";
const D1_EVIDENCE_PATH = resolve(process.cwd(), ".tmp", "phase-d-d1-e2e-evidence.json");
const D1_PROFILE_ROOT = resolve(process.cwd(), ".tmp", "playwright-extension", "d1-upgrade");
const D1_PROFILE = resolve(D1_PROFILE_ROOT, "lifecycle");
const D1_BROWSER_RESTART_PROFILE = resolve(D1_PROFILE_ROOT, "browser-restart");
const D1_V2_PROFILE = resolve(D1_PROFILE_ROOT, "v2-upgrade");
const D1_V3_PROFILE = resolve(D1_PROFILE_ROOT, "v3-upgrade");
const DIST_FILES = [
  "manifest.json",
  "background.js",
  "content.js",
  "popup.js",
  "main-world-bridge.js",
] as const;

type RawStorage = Readonly<{
  readonly local: Record<string, unknown>;
  readonly session: Record<string, unknown>;
}>;

type StorageSummary = Readonly<{
  readonly localKeys: readonly string[];
  readonly sessionKeys: readonly string[];
  readonly captureEnabled: boolean | undefined;
  readonly confirmed: number;
  readonly tombstones: number;
  readonly outbox: number;
  readonly quarantine: number;
  readonly e0: number;
  readonly e1: number;
  readonly unmatchedE3: number;
  readonly ingressReady: number;
  readonly ingressDiagnostics: number;
  readonly confirmedStorageKeys: readonly string[];
  readonly tombstoneKeys: readonly string[];
}>;

type LifecycleAction = Readonly<{
  readonly name: string;
  readonly startedAt: string;
  readonly endedAt: string;
  readonly before: StorageSummary;
  readonly after: StorageSummary;
}>;

type D1Evidence = {
  browser: string;
  readonly manifestVersion: string;
  readonly distHashes: Readonly<Record<string, string>>;
  replacementDistHashes?: Readonly<Record<string, string>>;
  replacementBuildSource?: string;
  sourceHead?: string;
  sourceWorktreeStatus?: readonly string[];
  readonly extensionIds: string[];
  readonly actions: LifecycleAction[];
  readonly sqlite: Array<Record<string, unknown>>;
  readonly api: Array<Record<string, unknown>>;
};

type ExtensionPageRef = {
  page: Page | null;
};

type ReplayPayload = Readonly<{
  readonly body: string;
  readonly credential: string;
  readonly bundleId: string;
  readonly eventCount: number;
}>;

type DurableMetadata = Readonly<{
  readonly installationId: string | undefined;
  readonly captureCredential: string | undefined;
  readonly captureCredentialVersion: number | undefined;
  readonly captureProtocolVersion: number | undefined;
  readonly captureEndpoint: string | undefined;
  readonly pairedAt: string | undefined;
}>;

type DurableCaptureSnapshot = Readonly<{
  readonly installationId: string | undefined;
  readonly captureCredential: string | undefined;
  readonly captureCredentialVersion: number | undefined;
  readonly captureEnabled: boolean | undefined;
  readonly captureEndpoint: string | undefined;
  readonly captureProtocolVersion: number | undefined;
  readonly pairedAt: string | undefined;
  readonly lastCaptureError: string | undefined;
  readonly lastSuccessfulCaptureAt: string | undefined;
  readonly lastDeliveredAttemptId: string | undefined;
  readonly lastDeliveredAttemptStatus: string | undefined;
  readonly confirmedSubmissions: readonly unknown[];
  readonly confirmedSubmissionTombstones: readonly unknown[];
  readonly captureOutbox: readonly unknown[];
  readonly captureQuarantine: readonly unknown[];
}>;

type CaptureProxy = Readonly<{
  readonly endpoint: string;
  readonly requestCount: () => number;
  readonly ackCount: () => number;
  readonly lastStatus: () => number | undefined;
  readonly requestBundleIds: () => readonly string[];
  readonly requestEventCounts: () => readonly number[];
  readonly ackBundleIds: () => readonly string[];
  readonly close: () => Promise<void>;
}>;

const evidence: D1Evidence = {
  browser: "unrecorded",
  manifestVersion: readManifestVersion(),
  distHashes: readDistHashes(),
  sourceHead: readGitHead(),
  sourceWorktreeStatus: readGitStatus(),
  extensionIds: [],
  actions: [],
  sqlite: [],
  api: [],
};

test.afterAll(() => {
  mkdirSync(dirname(D1_EVIDENCE_PATH), { recursive: true });
  writeFileSync(D1_EVIDENCE_PATH, JSON.stringify(evidence, null, 2), "utf8");
});

test("D1 blocked-platform requests do not project a confirmation or bundle", async ({
  extensionContext,
  extensionWorker,
}) => {
  const blockedTargets = [
    {
      pageUrl: "https://atcoder.jp/contests/abc001/tasks/abc001_a",
      submitUrl: "https://atcoder.jp/contests/abc001/submit",
    },
    {
      pageUrl: "https://codeforces.com/contest/1/problem/A",
      submitUrl: "https://codeforces.com/contest/1/submit",
    },
    {
      pageUrl: "https://www.luogu.com.cn/problem/P1001",
      submitUrl: "https://www.luogu.com.cn/fe/api/problem/submit/P1001",
    },
  ] as const;
  const page = await extensionContext.newPage();
  for (const target of blockedTargets) {
    await extensionContext.route(`${new URL(target.pageUrl).origin}/**`, async (route) => {
      await route.fulfill({
        status: 200,
        headers: {
          "access-control-allow-origin": "*",
          "content-type": "text/html; charset=utf-8",
        },
        body: "<!doctype html><title>blocked adapter fixture</title>",
      });
    });
  }
  try {
    for (const target of blockedTargets) {
      await page.goto(target.pageUrl, { waitUntil: "domcontentloaded" });
      await page.evaluate(async (url) => {
        await fetch(url, { method: "POST" });
      }, target.submitUrl);
      await page.waitForTimeout(300);
      const storage = await readFakeOjStorage(extensionWorker);
      expect(storage.confirmedSubmissions).toHaveLength(0);
      expect(storage.confirmedSubmissionTombstones).toHaveLength(0);
      expect(storage.captureOutbox).toHaveLength(0);
      expect(storage.captureQuarantine).toHaveLength(0);
    }
  } finally {
    await page.close();
  }
});

test("D1 exact-dist chain survives E1/E2/E3/outbox worker restarts and replays once", async ({
  extensionContext,
  extensionWorker,
  extensionId,
}) => {
  recordBrowserVersion(extensionContext);
  evidence.extensionIds.push(extensionId);
  const beforeDefaultDb = snapshotDefaultDatabase();
  const dbPath = readDbPath();
  const beforeDb = readDatabaseCounts(dbPath);
  let liveWorker = extensionWorker;
  const controller: ExtensionPageRef = { page: null };
  const controllerPage = (): Page => {
    if (controller.page === null) throw new Error("D1 extension controller page is not attached");
    return controller.page;
  };
  let resultVerdict: string | null = null;
  let metadataBeforeDelivery: DurableMetadata | undefined;
  const observedOjRequests: string[] = [];
  let captureProxy: CaptureProxy | undefined;
  let apiReplayRequests = 0;
  let apiReplayAcks = 0;
  await installNowCoderRoutes(extensionContext, observedOjRequests, (next) => {
    resultVerdict = next;
  }, () => resultVerdict);

  const page = await extensionContext.newPage();
  try {
    await pairExtension(extensionContext, liveWorker, extensionId);
    const proxy = await startCaptureProxy();
    captureProxy = proxy;

    await recordAction("browse-only before submit", liveWorker, async () => {
      await page.goto(NOWCODER_B7_LIST_URL, { waitUntil: "domcontentloaded" });
      await page.goto(NOWCODER_B7_PROBLEM_URL, { waitUntil: "domcontentloaded" });
      await page.locator("button.btn-submit").waitFor();
      await expect.poll(async () => (await readFakeOjStorage(liveWorker)).uiHints.length).toBe(0);
      expect((await readFakeOjStorage(liveWorker)).confirmedSubmissions).toHaveLength(0);
      return liveWorker;
    });

    await page.waitForTimeout(550);
    await page.locator("button.btn-submit").click();
    await expect.poll(async () => (await readFakeOjStorage(liveWorker)).uiHints.length).toBe(1);
    await page.evaluate(async (url) => { await fetch(url, { method: "POST" }); }, NOWCODER_B7_SUBMIT_URL);
    await expect.poll(async () => hasCompletedE1(await readFakeOjStorage(liveWorker))).toBe(true);

    liveWorker = await restartWorker(
      "service-worker restart after E1",
      extensionContext,
      page,
      liveWorker,
      undefined,
      controller,
    );
    expect((await readStorageFromPage(controllerPage())).transientE1.length).toBeGreaterThanOrEqual(1);

    await page.evaluate(async (url) => { await fetch(url); }, nowCoderB7StatusUrl("84259001"));
    await page.waitForTimeout(250);
    await pollStorageFromPage(controllerPage(), (storage) => storage.confirmedSubmissions.length === 1);

    liveWorker = await restartWorker(
      "service-worker restart after E2",
      extensionContext,
      page,
      liveWorker,
      undefined,
      controller,
    );
    expect((await readStorageFromPage(controllerPage())).confirmedSubmissions).toHaveLength(1);

    resultVerdict = null;
    await page.goto(nowCoderB7ResultUrl("84259001"), { waitUntil: "domcontentloaded" });
    liveWorker = await restartWorker(
      "service-worker restart before E3",
      extensionContext,
      page,
      liveWorker,
      async () => { await page.reload({ waitUntil: "domcontentloaded" }); },
      controller,
    );
    await page.reload({ waitUntil: "domcontentloaded" });
    expect((await readStorageFromPage(controllerPage())).confirmedSubmissions).toHaveLength(1);
    metadataBeforeDelivery = await readDurableMetadataFromPage(controllerPage());

    await controllerPage().evaluate(async (endpoint: string) => {
      await chrome.storage.local.set({ captureEndpoint: endpoint });
    }, DISABLED_CAPTURE_ENDPOINT);
    await expect.poll(async () => controllerPage().evaluate(async () => {
      const stored = await chrome.storage.local.get(["captureEndpoint"]);
      return stored.captureEndpoint;
    })).toBe(DISABLED_CAPTURE_ENDPOINT);
    await expect.poll(async () => controllerPage().evaluate(async () => {
      const stored = await chrome.storage.local.get(["captureEnabled"]);
      return stored.captureEnabled;
    })).toBe(true);
    resultVerdict = "答案错误";
    await page.evaluate(() => {
      const verdict = document.createElement("div");
      verdict.className = "coder-cont-legend";
      verdict.textContent = "答案错误";
      document.body.append(verdict);
    });
    await pollStorageFromPage(controllerPage(), (storage) =>
      storage.captureOutbox.length === 1
      && storage.confirmedSubmissionTombstones.length === 1
      && storage.confirmedSubmissions.length === 0,
    );

    liveWorker = await restartWorker(
      "service-worker restart with retained outbox",
      extensionContext,
      page,
      liveWorker,
      undefined,
      controller,
    );
    const retainedOutbox = await readStorageFromPage(controllerPage());
    expect(retainedOutbox.captureOutbox).toHaveLength(1);
    expect(retainedOutbox.confirmedSubmissionTombstones).toHaveLength(1);
    const replayPayload = await controllerPage().evaluate(async (): Promise<ReplayPayload | null> => {
      const stored = await chrome.storage.local.get(["captureOutbox", "captureCredential"]);
      const outbox = stored.captureOutbox;
      const credential = stored.captureCredential;
      if (!Array.isArray(outbox) || outbox.length !== 1 || typeof credential !== "string") return null;
      const first = outbox[0];
      if (typeof first !== "object" || first === null) return null;
      const bundle = Reflect.get(first, "bundle");
      if (typeof bundle !== "object" || bundle === null) return null;
      const bundleId = Reflect.get(bundle, "bundleId");
      const events = Reflect.get(bundle, "events");
      if (typeof bundleId !== "string" || !Array.isArray(events)) return null;
      const body = JSON.stringify(bundle);
      return body === undefined ? null : { body, credential, bundleId, eventCount: events.length };
    });
    if (replayPayload === null) throw new Error("D1 retained outbox replay payload is missing");

    await controllerPage().evaluate(async (endpoint: string) => {
      await chrome.storage.local.set({ captureEndpoint: endpoint });
    }, proxy.endpoint);
    await retryOutboxPage(controllerPage());
    await expect.poll(() => proxy.requestCount()).toBe(1);
    await expect.poll(() => readDatabaseCounts(dbPath)).toEqual({
      captureEvents: beforeDb.captureEvents + 4,
      trainingSessions: beforeDb.trainingSessions + 1,
      trainingAttempts: beforeDb.trainingAttempts + 1,
    });
    const delivered = await pollStorageFromPage(controllerPage(), (storage) =>
      storage.captureOutbox.length === 0
      && storage.confirmedSubmissionTombstones.length === 1,
    );
    expect(delivered.captureQuarantine).toHaveLength(0);
    expect(metadataBeforeDelivery).toBeDefined();
    const metadataAfterDelivery = await readDurableMetadataFromPage(controllerPage());
    expect(metadataAfterDelivery.installationId).toBe(metadataBeforeDelivery?.installationId);
    expect(metadataAfterDelivery.captureCredential).toBe(metadataBeforeDelivery?.captureCredential);
    expect(metadataAfterDelivery.captureCredentialVersion)
      .toBe(metadataBeforeDelivery?.captureCredentialVersion);
    expect(metadataAfterDelivery.captureProtocolVersion).toBe(metadataBeforeDelivery?.captureProtocolVersion);
    expect(metadataAfterDelivery.pairedAt).toBe(metadataBeforeDelivery?.pairedAt);
    expect(metadataAfterDelivery.captureEndpoint).toBe(proxy.endpoint);
    expect(proxy.requestCount()).toBe(1);
    expect(proxy.ackCount()).toBe(1);
    expect(proxy.requestBundleIds()).toEqual([replayPayload.bundleId]);
    expect(proxy.requestEventCounts()).toEqual([replayPayload.eventCount]);
    expect(proxy.requestEventCounts()).toEqual([4]);
    expect(proxy.ackBundleIds()).toEqual([replayPayload.bundleId]);

    apiReplayRequests += 1;
    const replay = await fetch(CAPTURE_ENDPOINT, {
      method: "POST",
      headers: {
        authorization: `Bearer ${replayPayload.credential}`,
        "content-type": "application/json",
        origin: `chrome-extension://${extensionId}`,
      },
      body: replayPayload.body,
    });
    const replayBody: unknown = await replay.json();
    expect(replay.ok).toBe(true);
    apiReplayAcks += replay.ok ? 1 : 0;
    if (typeof replayBody !== "object" || replayBody === null) {
      throw new Error("D1 API replay response is not an object");
    }
    expect(Reflect.get(replayBody, "replayed")).toBe(true);
    expect(Reflect.get(replayBody, "bundleId")).toBe(replayPayload.bundleId);

    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForTimeout(300);
    expect(readDatabaseCounts(dbPath)).toEqual({
      captureEvents: beforeDb.captureEvents + 4,
      trainingSessions: beforeDb.trainingSessions + 1,
      trainingAttempts: beforeDb.trainingAttempts + 1,
    });
    expect((await readStorageFromPage(controllerPage())).captureOutbox).toHaveLength(0);
    expect(observedOjRequests).toContain(`POST ${NOWCODER_B7_SUBMIT_URL}`);
    expect(observedOjRequests).toContain(`GET ${nowCoderB7StatusUrl("84259001")}`);

    evidence.sqlite.push({
      test: "D1 exact-dist chain",
      before: beforeDb,
      after: readDatabaseCounts(dbPath),
    });
    evidence.api.push({
      test: "D1 exact-dist chain",
      extensionRequests: proxy.requestCount(),
      extensionAcks: proxy.ackCount(),
      apiReplayRequests,
      apiReplayAcks,
    });
  } finally {
    await page.close();
    if (controller.page !== null) await controller.page.close();
    if (captureProxy !== undefined) await captureProxy.close();
    expect(verifyDefaultDatabaseUntouched(beforeDefaultDb, snapshotDefaultDatabase())).toBe(true);
  }
});

test("D1 reload, disable/enable, replacement dist, browser restart, and pause retain durable state", async () => {
  mkdirSync(D1_PROFILE_ROOT, { recursive: true });
  removeFakeOjProfile(D1_PROFILE);
  const beforeDefaultDb = snapshotDefaultDatabase();
  let context: BrowserContext = await launchExactContext(D1_PROFILE);
  recordBrowserVersion(context);
  let worker = await getLiveWorker(context, undefined);
  await settleWorkerInitialization(context, worker);
  const extensionId = new URL(worker.url()).host;
  evidence.extensionIds.push(extensionId);
  const workerUrl = worker.url();
  await installNowCoderRoutes(context, [], () => undefined, () => null);

  try {
    await seedLifecycleState(worker);
    let durableBaseline = await assertDurableStateEventually(context, workerUrl, 1, 1);
    await assertSessionStateEventually(context, workerUrl, true);

     worker = await recordWorkerAction("chrome.runtime.reload clears session", context, worker, async () =>
       reloadRuntime(context, worker, workerUrl));
     let durableAfter = await assertDurableStateEventually(context, workerUrl, 1, 1);
     expect(durableAfter.captureQuarantine).toEqual([expect.objectContaining({
       error: "Retained capture error",
     })]);
     expectDurableIdentityUnchanged(durableBaseline, durableAfter);
    durableBaseline = durableAfter;
    await assertSessionStateEventually(context, workerUrl, false);

    await seedSessionState(worker);
    const disableEnableStartedAt = new Date().toISOString();
    const disableEnableBefore = await summarizeStorage(worker);
    await setExtensionEnabled(context, extensionId, false);
    const enabledWorker = context.waitForEvent("serviceworker", {
      predicate: (candidate) => candidate.url() === workerUrl,
      timeout: 20_000,
    });
    await setExtensionEnabled(context, extensionId, true);
    worker = await enabledWorker;
    await settleWorkerInitialization(context, worker);
    durableAfter = await assertDurableStateEventually(context, workerUrl, 1, 1);
    expectDurableIdentityUnchanged(durableBaseline, durableAfter);
    durableBaseline = durableAfter;
    await assertSessionStateEventually(context, workerUrl, false);
    evidence.actions.push({
      name: "extension disable/enable",
      startedAt: disableEnableStartedAt,
      endedAt: new Date().toISOString(),
      before: disableEnableBefore,
      after: await summarizeStorage(worker),
    });

    await seedSessionState(worker);
    worker = await recordWorkerAction("same-path unpacked reload clears session", context, worker, async () =>
      reloadUnpackedExtension(context, extensionId, workerUrl));
    durableAfter = await assertDurableStateEventually(context, workerUrl, 1, 1);
    expectDurableIdentityUnchanged(durableBaseline, durableAfter);
    durableBaseline = durableAfter;
    await assertSessionStateEventually(context, workerUrl, false);

    await seedSessionState(worker);
    execFileSync(process.execPath, [resolve(process.cwd(), "extension", "build.mjs")], {
      cwd: process.cwd(),
      stdio: "pipe",
      windowsHide: true,
    });
    const sourceBuildSha = execFileSync("git", ["rev-parse", "HEAD"], {
      cwd: process.cwd(),
      encoding: "utf8",
    }).trim();
    const hashesBeforeReplacement = readDistHashes();
    execFileSync(process.execPath, [resolve(process.cwd(), "extension", "build.mjs")], {
      cwd: process.cwd(),
      env: { ...process.env, V4_BUILD_VARIANT: "d1-replacement" },
      stdio: "pipe",
      windowsHide: true,
    });
    const hashesAfterReplacement = readDistHashes();
    expect(hashesAfterReplacement).not.toEqual(hashesBeforeReplacement);
    evidence.replacementDistHashes = hashesAfterReplacement;
    evidence.replacementBuildSource = `${sourceBuildSha} + dirty-worktree (variant: d1-replacement; see sourceWorktreeStatus)`;
    worker = await recordWorkerAction("replacement dist reload at same unpacked path", context, worker, async () =>
      reloadUnpackedExtension(context, extensionId, workerUrl));
    durableAfter = await assertDurableStateEventually(context, workerUrl, 1, 1);
    expectDurableIdentityUnchanged(durableBaseline, durableAfter);
    durableBaseline = durableAfter;
    await assertSessionStateEventually(context, workerUrl, false);

    await seedSessionState(worker);
    const profileContext = context;
    const beforeBrowserRestart = await summarizeStorageEventually(context, workerUrl);
    const restartStartedAt = new Date().toISOString();
    await profileContext.close();
    context = await launchExactContext(D1_PROFILE);
    worker = await getLiveWorker(context, workerUrl);
    await settleWorkerInitialization(context, worker);
    const afterBrowserRestart = await summarizeStorageEventually(context, workerUrl);
    evidence.actions.push({
      name: "browser full restart",
      startedAt: restartStartedAt,
      endedAt: new Date().toISOString(),
      before: beforeBrowserRestart,
      after: afterBrowserRestart,
    });
    durableAfter = await assertDurableStateEventually(context, workerUrl, 1, 1);
    expectDurableIdentityUnchanged(durableBaseline, durableAfter);
    durableBaseline = durableAfter;
    await assertSessionStateEventually(context, workerUrl, false);

    await installNowCoderRoutes(context, [], () => undefined, () => null);
    const pauseStartedAt = new Date().toISOString();
    const pauseBefore = await summarizeStorageEventually(context, workerUrl);
    const pauseController = await context.newPage();
    const pauseProblemPage = await context.newPage();
    const pauseResultPage = await context.newPage();
    try {
      await pauseController.goto(`chrome-extension://${extensionId}/popup.html`, { waitUntil: "domcontentloaded" });
      const durableBeforePause = await readDurableCaptureSnapshotFromPage(pauseController);
      await pauseProblemPage.goto(NOWCODER_B7_PROBLEM_URL, { waitUntil: "domcontentloaded" });
      await pauseProblemPage.locator("button.btn-submit").waitFor();
      await pauseResultPage.goto(nowCoderB7ResultUrl("84259001"), { waitUntil: "domcontentloaded" });
      await pauseController.evaluate(async () => {
        await chrome.runtime.sendMessage({ type: "SET_CAPTURE_ENABLED", enabled: false });
      });
      await expect.poll(async () => pauseController.evaluate(async () => {
        const stored = await chrome.storage.local.get(["captureEnabled"]);
        return stored.captureEnabled;
      })).toBe(false);
      await expect.poll(async () => pauseController.evaluate(async () => {
        const state = await chrome.runtime.sendMessage({ type: "GET_CAPTURE_STATE" });
        return typeof state === "object" && state !== null
          ? Reflect.get(state, "captureEnabled")
          : undefined;
      })).toBe(false);
      await pauseProblemPage.waitForTimeout(550);
      await pauseProblemPage.locator("button.btn-submit").click();
      await pauseProblemPage.evaluate(async (url) => { await fetch(url, { method: "POST" }); }, NOWCODER_B7_SUBMIT_URL);
      await pauseProblemPage.evaluate(async (url) => { await fetch(url); }, nowCoderB7StatusUrl("84259001"));
      await pauseResultPage.evaluate(() => {
        const verdict = document.createElement("div");
        verdict.className = "coder-cont-legend";
        verdict.textContent = "答案错误";
        document.body.append(verdict);
      });
      await pauseResultPage.waitForTimeout(500);
      const paused = await readFakeOjStorageEventually(context, workerUrl);
      expect(paused.uiHints).toHaveLength(0);
      expect(paused.transientE1).toHaveLength(0);
      expect(paused.confirmedSubmissions).toHaveLength(1);
      expect(paused.confirmedSubmissionTombstones).toHaveLength(1);
      expect(paused.captureOutbox).toHaveLength(1);
      expect(paused.captureQuarantine).toHaveLength(1);
      await retryOutboxPage(pauseController);
      await expect.poll(async () => {
        const retryState = await readDurableCaptureSnapshotFromPage(pauseController);
        return typeof retryState.lastCaptureError === "string";
      }).toBe(true);
      const afterPausedRetry = await readDurableCaptureSnapshotFromPage(pauseController);
      expect(afterPausedRetry.confirmedSubmissions).toEqual(durableBeforePause.confirmedSubmissions);
      expect(afterPausedRetry.confirmedSubmissionTombstones)
        .toEqual(durableBeforePause.confirmedSubmissionTombstones);
      expect(afterPausedRetry.captureQuarantine).toHaveLength(0);
      expect(afterPausedRetry.captureOutbox).toHaveLength(2);
      expect(afterPausedRetry.captureOutbox.flatMap((item) =>
        typeof item === "object" && item !== null ? [Reflect.get(item, "id")] : []))
         .toEqual(expect.arrayContaining(["bundle_d1-seeded-outbox", "bundle_d1-seeded-quarantine"]));
      expect(afterPausedRetry.captureEnabled).toBe(false);
      const durableAfterPause = await readDurableCaptureSnapshotFromPage(pauseController);
      expect(durableAfterPause.confirmedSubmissions).toEqual(durableBeforePause.confirmedSubmissions);
      expect(durableAfterPause.confirmedSubmissionTombstones)
        .toEqual(durableBeforePause.confirmedSubmissionTombstones);
      expect(durableAfterPause.captureEnabled).toBe(false);
      evidence.actions.push({
        name: "global capture pause fail-closed",
        startedAt: pauseStartedAt,
        endedAt: new Date().toISOString(),
        before: pauseBefore,
        after: await summarizeStorageEventually(context, workerUrl),
      });
    } finally {
      await pauseResultPage.close();
      await pauseProblemPage.close();
      await pauseController.close();
    }
  } finally {
    await context.close();
    execFileSync(process.execPath, [resolve(process.cwd(), "extension", "build.mjs")], {
      cwd: process.cwd(),
      stdio: "pipe",
      windowsHide: true,
    });
    removeFakeOjProfile(D1_PROFILE);
    expect(verifyDefaultDatabaseUntouched(beforeDefaultDb, snapshotDefaultDatabase())).toBe(true);
  }
});

test("D1 browser restart after E1 clears transient state and after E2 retains durable state", async () => {
  mkdirSync(D1_PROFILE_ROOT, { recursive: true });
  removeFakeOjProfile(D1_BROWSER_RESTART_PROFILE);
  const beforeDefaultDb = snapshotDefaultDatabase();
  let context = await launchExactContext(D1_BROWSER_RESTART_PROFILE);
  let worker = await getLiveWorker(context, undefined);
  await settleWorkerInitialization(context, worker);
  const extensionId = new URL(worker.url()).host;
  const workerUrl = worker.url();
  let resultVerdict: string | null = null;
  const observedOjRequests: string[] = [];

  try {
    await installNowCoderRoutes(context, observedOjRequests, (next) => {
      resultVerdict = next;
    }, () => resultVerdict);
    let page = await context.newPage();
    await pairExtension(context, worker, extensionId);
    await submitFakeNowCoder(page);
    await expect.poll(async () =>
      hasCompletedE1(await readFakeOjStorageEventually(context, workerUrl)),
    ).toBe(true);
    const e1RestartStartedAt = new Date().toISOString();
    const beforeE1Restart = await summarizeStorageEventually(context, workerUrl);
    await page.close();

    await context.close();
    context = await launchExactContext(D1_BROWSER_RESTART_PROFILE);
    worker = await getLiveWorker(context, workerUrl);
    await settleWorkerInitialization(context, worker);
    expect(new URL(worker.url()).host).toBe(extensionId);
    await installNowCoderRoutes(context, observedOjRequests, (next) => {
      resultVerdict = next;
    }, () => resultVerdict);
    const afterE1Restart = await readFakeOjStorageEventually(context, workerUrl);
    const afterE1RestartSummary = await summarizeStorageEventually(context, workerUrl);
    expect(afterE1Restart.transientE1).toHaveLength(0);
    expect(afterE1Restart.confirmedSubmissions).toHaveLength(0);
    evidence.actions.push({
      name: "browser restart after E1",
      startedAt: e1RestartStartedAt,
      endedAt: new Date().toISOString(),
      before: beforeE1Restart,
      after: afterE1RestartSummary,
    });

    page = await context.newPage();
    await submitFakeNowCoder(page);
    await expect.poll(async () =>
      hasCompletedE1(await readFakeOjStorageEventually(context, workerUrl)),
    ).toBe(true);
    await page.evaluate(async (url) => { await fetch(url); }, nowCoderB7StatusUrl("84259001"));
    await expect.poll(async () =>
      (await readFakeOjStorageEventually(context, workerUrl)).confirmedSubmissions.length,
    ).toBe(1);
    const e2RestartStartedAt = new Date().toISOString();
    const beforeE2Restart = await summarizeStorageEventually(context, workerUrl);
    await page.close();

    await context.close();
    context = await launchExactContext(D1_BROWSER_RESTART_PROFILE);
    worker = await getLiveWorker(context, workerUrl);
    await settleWorkerInitialization(context, worker);
    expect(new URL(worker.url()).host).toBe(extensionId);
    await installNowCoderRoutes(context, observedOjRequests, (next) => {
      resultVerdict = next;
    }, () => resultVerdict);
    const afterE2Restart = await readFakeOjStorageEventually(context, workerUrl);
    const afterE2RestartSummary = await summarizeStorageEventually(context, workerUrl);
    expect(afterE2Restart.confirmedSubmissions).toHaveLength(1);
    expect(afterE2Restart.transientE1).toHaveLength(0);
    evidence.actions.push({
      name: "browser restart after E2",
      startedAt: e2RestartStartedAt,
      endedAt: new Date().toISOString(),
      before: beforeE2Restart,
      after: afterE2RestartSummary,
    });

    const controller = await context.newPage();
    const resultPage = await context.newPage();
    try {
      await controller.goto(`chrome-extension://${extensionId}/popup.html`, { waitUntil: "domcontentloaded" });
      await controller.evaluate(async (endpoint: string) => {
        await chrome.storage.local.set({ captureEndpoint: endpoint });
      }, DISABLED_CAPTURE_ENDPOINT);
      await expect.poll(async () => controller.evaluate(async () => {
        const stored = await chrome.storage.local.get(["captureEndpoint"]);
        return stored.captureEndpoint;
      })).toBe(DISABLED_CAPTURE_ENDPOINT);
      resultVerdict = "答案错误";
      await resultPage.goto(nowCoderB7ResultUrl("84259001"), { waitUntil: "domcontentloaded" });
      await resultPage.evaluate(() => {
        const verdict = document.createElement("div");
        verdict.className = "coder-cont-legend";
        verdict.textContent = "答案错误";
        document.body.append(verdict);
      });
      const finalized = await pollStorageFromPage(controller, (storage) =>
        storage.confirmedSubmissions.length === 0
        && storage.confirmedSubmissionTombstones.length === 1
        && storage.captureOutbox.length === 1,
      );
      expect(finalized.captureQuarantine).toHaveLength(0);
    } finally {
      await resultPage.close();
      await controller.close();
    }

    expect(observedOjRequests).toContain(`POST ${NOWCODER_B7_SUBMIT_URL}`);
    expect(observedOjRequests).toContain(`GET ${nowCoderB7StatusUrl("84259001")}`);
  } finally {
    await context.close();
    removeFakeOjProfile(D1_BROWSER_RESTART_PROFILE);
    expect(verifyDefaultDatabaseUntouched(beforeDefaultDb, snapshotDefaultDatabase())).toBe(true);
  }
});

test("D1 exact-dist profiles migrate V2 and V3 storage without LevelDB access", async () => {
  const scenarios = [
    { profile: D1_V2_PROFILE, version: 2 as const },
    { profile: D1_V3_PROFILE, version: 3 as const },
  ];
  for (const scenario of scenarios) {
    mkdirSync(D1_PROFILE_ROOT, { recursive: true });
    removeFakeOjProfile(scenario.profile);
    const beforeDefaultDb = snapshotDefaultDatabase();
    let context: BrowserContext | undefined;
    try {
      context = await launchExactContext(scenario.profile);
      let worker = await getLiveWorker(context, undefined);
      const extensionId = new URL(worker.url()).host;
      const workerUrl = worker.url();
      const seedPage = await context.newPage();
      try {
        await seedPage.goto(`chrome-extension://${extensionId}/popup.html`, { waitUntil: "domcontentloaded" });
        await seedUpgradeStorage(seedPage, scenario.version);
      } finally {
        await seedPage.close().catch(() => undefined);
      }

      worker = await reloadUnpackedExtension(context, extensionId, workerUrl);
      const upgradedWorker = worker;
      await settleWorkerInitialization(context, upgradedWorker);
      const readPage = await context.newPage();
      try {
        await readPage.goto(`chrome-extension://${extensionId}/popup.html`, { waitUntil: "domcontentloaded" });
        await expect.poll(async () => {
          const current = await readRawStorageFromPage(readPage);
          return current.local.captureProtocolVersion;
        }, { message: `D1 V${scenario.version} profile did not migrate` }).toBe(4);
        const raw = await readRawStorageFromPage(readPage);
        expect(raw.local.captureProtocolVersion).toBe(4);
        expect(raw.local).not.toHaveProperty("pendingSubmissionIntents");
        expect(raw.local).not.toHaveProperty("eventQueue");
        expect(raw.local).not.toHaveProperty("outbox");
        expect(raw.local).not.toHaveProperty("quarantine");
        if (scenario.version === 2) {
          expect(raw.local.discardedPreBundleEventCount).toBe(2);
          expect(typeof raw.local.preBundleQueueDiscardedAt).toBe("string");
          expect(raw.local).not.toHaveProperty("v4ClickIntentMigration");
          expect(raw.local.unknownLocalSentinel).toBe("d1-v2-local");
        } else {
          expect(raw.local.v4ClickIntentMigration).toEqual(expect.objectContaining({
            removedActiveIntentCount: 1,
            sourceProtocolVersion: 3,
            targetProtocolVersion: 4,
           }));
           expect(raw.local.captureOutbox).toHaveLength(1);
           expect(raw.local.captureQuarantine).toHaveLength(1);
           expect(raw.local.captureOutbox).toEqual([expect.objectContaining({
             id: "bundle_d1-v3-outbox",
             bundle: expect.objectContaining({ bundleId: "bundle_d1-v3-outbox" }),
           })]);
           expect(raw.local.captureQuarantine).toEqual([expect.objectContaining({
             id: "bundle_d1-v3-quarantine",
             item: expect.objectContaining({
               id: "bundle_d1-v3-quarantine",
               bundle: expect.objectContaining({ bundleId: "bundle_d1-v3-quarantine" }),
             }),
           })]);
           expect(raw.local.unknownLocalSentinel).toBe("d1-v3-local");
        }
      } finally {
        await readPage.close();
      }
    } finally {
      await context?.close();
      removeFakeOjProfile(scenario.profile);
      expect(verifyDefaultDatabaseUntouched(beforeDefaultDb, snapshotDefaultDatabase())).toBe(true);
    }
  }
});

async function recordAction(
  name: string,
  worker: Worker,
  action: () => Promise<Worker>,
): Promise<Worker> {
  const startedAt = new Date().toISOString();
  const before = await summarizeStorage(worker);
  const next = await action();
  const after = await summarizeStorage(next);
  evidence.actions.push({ name, startedAt, endedAt: new Date().toISOString(), before, after });
  return next;
}

async function recordWorkerAction(
  name: string,
  context: BrowserContext,
  worker: Worker,
  action: () => Promise<Worker>,
): Promise<Worker> {
  const startedAt = new Date().toISOString();
  const workerUrl = worker.url();
  const before = await summarizeStorage(worker);
  await action();
  const after = await summarizeStorageEventually(context, workerUrl);
  evidence.actions.push({ name, startedAt, endedAt: new Date().toISOString(), before, after });
  return getLiveWorker(context, workerUrl);
}

async function restartWorker(
  name: string,
  context: BrowserContext,
  page: Page,
  worker: Worker,
  trigger?: () => Promise<void>,
  controller?: ExtensionPageRef,
): Promise<Worker> {
  const startedAt = new Date().toISOString();
  const before = controller?.page === null || controller === undefined
    ? await summarizeStorage(worker)
    : await summarizeStorageFromPage(controller.page);
  let wakePage: Page | null = null;
  const actualTrigger = async (): Promise<void> => {
    if (controller?.page !== null && controller !== undefined) {
      await controller.page.close();
      controller.page = null;
    }
    wakePage = await context.newPage();
    await wakePage.goto(`chrome-extension://${new URL(worker.url()).host}/popup.html`, {
      waitUntil: "domcontentloaded",
    });
    if (trigger !== undefined) {
      await trigger();
      return;
    }
    await wakePage.evaluate(async () => {
      const state = await chrome.runtime.sendMessage({ type: "GET_CAPTURE_STATE" });
      if (typeof state !== "object" || state === null) {
        throw new Error("D1 worker initialization did not return capture state");
      }
    });
  };
  const freshWorker = controller === undefined
    ? context.waitForEvent("serviceworker", {
      predicate: (candidate) => candidate.url() === worker.url(),
      timeout: 20_000,
    }).catch(() => null)
    : Promise.resolve(null);
  try {
    await stopAndReawakenFakeOjWorker(page, worker, actualTrigger);
    const eventWorker = await freshWorker;
    // The serviceworker event is the fresh execution-context handle. In the
    // popup-controller path Chrome can suspend that handle again before a
    // worker-side evaluation, so the controller page remains the storage read
    // boundary while the new worker is still returned for the next CDP stop.
    const visibleWorker = context.serviceWorkers().find((candidate) => candidate.url() === worker.url());
    if (eventWorker === null && controller !== undefined && visibleWorker === undefined) {
      throw new Error(`D1 worker restart did not expose a new worker handle for ${worker.url()}`);
    }
    let next: Worker;
    if (eventWorker !== null) {
      next = eventWorker;
    } else if (controller === undefined) {
      next = await getLiveWorker(context, worker.url());
    } else if (visibleWorker !== undefined) {
      next = visibleWorker;
    } else {
      throw new Error(`D1 worker restart did not expose a usable worker for ${worker.url()}`);
    }
    await settleWorkerInitialization(context, next);
    if (controller !== undefined && wakePage !== null) controller.page = wakePage;
    const after = controller === undefined || controller.page === null
      ? await summarizeStorage(next)
      : await summarizeStorageFromPage(controller.page);
    evidence.actions.push({ name, startedAt, endedAt: new Date().toISOString(), before, after });
    return next;
  } finally {
    if (controller === undefined) {
      const pageToClose = wakePage as Page | null;
      if (pageToClose !== null) await pageToClose.close();
    }
  }
}

async function reloadRuntime(
  context: BrowserContext,
  worker: Worker,
  workerUrl: string,
): Promise<Worker> {
  const popup = await context.newPage();
  try {
    await popup.goto(`chrome-extension://${new URL(worker.url()).host}/popup.html`, {
      waitUntil: "domcontentloaded",
    });
    await popup.evaluate(() => { chrome.runtime.reload(); });
  } catch {
    // The popup execution context is expected to disappear during reload.
  } finally {
    await popup.close().catch(() => undefined);
  }
  return getLiveWorker(context, workerUrl);
}

async function reloadUnpackedExtension(
  context: BrowserContext,
  extensionId: string,
  workerUrl: string,
): Promise<Worker> {
  const page = await context.newPage();
  try {
    await page.goto("chrome://extensions/", { waitUntil: "domcontentloaded" });
    const clicked = await page.evaluate((targetId: string): boolean => {
      const manager = document.querySelector("extensions-manager");
      const list = manager?.shadowRoot?.querySelector("extensions-item-list");
      const items = list?.shadowRoot?.querySelectorAll("extensions-item") ?? [];
      for (const item of items) {
        const data = Reflect.get(item, "data");
        if (typeof data !== "object" || data === null || Reflect.get(data, "id") !== targetId) continue;
        const reload = item.shadowRoot?.querySelector<HTMLButtonElement>("#dev-reload-button");
        if (reload === null || reload === undefined || reload.disabled) return false;
        reload.click();
        return true;
      }
      return false;
    }, extensionId);
    expect(clicked).toBe(true);
  } finally {
    await page.close();
  }
  return getLiveWorker(context, workerUrl);
}

async function setExtensionEnabled(
  context: BrowserContext,
  extensionId: string,
  enabled: boolean,
): Promise<void> {
  const page = await context.newPage();
  try {
    await page.goto("chrome://extensions/", { waitUntil: "domcontentloaded" });
    const toggled = await page.evaluate(({ targetId, nextEnabled }): boolean => {
      const manager = document.querySelector("extensions-manager");
      const list = manager?.shadowRoot?.querySelector("extensions-item-list");
      const items = list?.shadowRoot?.querySelectorAll("extensions-item") ?? [];
      for (const item of items) {
        const data = Reflect.get(item, "data");
        if (typeof data !== "object" || data === null || Reflect.get(data, "id") !== targetId) continue;
        const state = Reflect.get(data, "state");
        const isEnabled = state === "ENABLED";
        if (isEnabled === nextEnabled) return true;
        const candidates = [
          item.shadowRoot?.querySelector<HTMLElement>("#enable-controls"),
          item.shadowRoot?.querySelector<HTMLElement>("#enable-toggle"),
          item.shadowRoot?.querySelector<HTMLElement>("cr-toggle"),
        ];
        const toggle = candidates.find((candidate) => candidate !== null && candidate !== undefined);
        if (toggle === undefined) return false;
        toggle.click();
        return true;
      }
      return false;
    }, { targetId: extensionId, nextEnabled: enabled });
    expect(toggled).toBe(true);
    await expect.poll(() => readExtensionState(page, extensionId)).toBe(enabled ? "ENABLED" : "DISABLED");
  } finally {
    await page.close();
  }
}

async function readExtensionState(page: Page, extensionId: string): Promise<string | undefined> {
  return page.evaluate((targetId: string): string | undefined => {
    const manager = document.querySelector("extensions-manager");
    const list = manager?.shadowRoot?.querySelector("extensions-item-list");
    const items = list?.shadowRoot?.querySelectorAll("extensions-item") ?? [];
    for (const item of items) {
      const data = Reflect.get(item, "data");
      if (typeof data === "object" && data !== null && Reflect.get(data, "id") === targetId) {
        const state = Reflect.get(data, "state");
        return typeof state === "string" ? state : undefined;
      }
    }
    return undefined;
  }, extensionId);
}

async function seedLifecycleState(worker: Worker): Promise<void> {
  await worker.evaluate(async () => {
    const now = new Date().toISOString();
    const later = new Date(Date.parse(now) + 1_000).toISOString();
    const bundleCommon = {
      schemaVersion: 2,
      captureSessionId: "d1-lifecycle-session",
      installationId: "d1-lifecycle-installation",
      adapterVersion: "v4-nowcoder-network-1",
      parserVersion: "v4-nowcoder-network-1",
      pageOrigin: "https://ac.nowcoder.com",
      provenanceLevel: "extension_paired",
      platform: "nowcoder",
      problemExternalId: "acm/contest/18839/1001",
      problemTitle: "D1 lifecycle",
      canonicalUrl: "https://ac.nowcoder.com/acm/contest/18839/1001",
    };
    const makeBundle = (bundleId: string, submissionId: string) => ({
      schemaVersion: 1,
      bundleId,
      events: [
        { ...bundleCommon, id: `${bundleId}-started`, type: "SESSION_STARTED", occurredAt: now, payload: { source: "content_script" } },
        { ...bundleCommon, id: `${bundleId}-submitted`, type: "SUBMISSION_OBSERVED", submissionId, occurredAt: now, payload: { action: "submit_clicked" } },
        { ...bundleCommon, id: `${bundleId}-verdict`, type: "VERDICT_OBSERVED", submissionId, occurredAt: later, payload: { verdict: "Accepted" } },
        { ...bundleCommon, id: `${bundleId}-ended`, type: "SESSION_ENDED", occurredAt: later, payload: { endReason: "capture_disabled" } },
      ],
    });
    const outboxBundle = makeBundle("bundle_d1-seeded-outbox", "d1-seeded-outbox-submission");
    const quarantineBundle = makeBundle("bundle_d1-seeded-quarantine", "d1-seeded-quarantine-submission");
    const outbox = {
      id: outboxBundle.bundleId,
      kind: "attempt_bundle",
      bundle: outboxBundle,
      attempts: 0,
      createdAt: now,
    };
    const quarantine = {
      id: quarantineBundle.bundleId,
      item: { ...outbox, id: quarantineBundle.bundleId, bundle: quarantineBundle },
      error: "D1 seeded quarantine",
      quarantinedAt: now,
    };
    const e1 = {
      schemaVersion: 1,
      evidenceId: "d1-lifecycle-e1",
      platform: "nowcoder",
      tier: "E1",
      kind: "request_observed",
      receivedAt: now,
      tabId: 1,
      frameId: 0,
      documentId: "d1-lifecycle-document",
      adapterVersion: "v4-nowcoder-network-1",
      apiTimeStamp: Date.now(),
      requestId: "d1-lifecycle-request",
      method: "POST",
      endpointKey: "nowcoder/submit",
      resourceType: "xmlhttprequest",
      lifecycle: "completed",
      statusCode: 200,
    };
    await chrome.storage.local.set({
      captureProtocolVersion: 4,
      installationId: "d1-lifecycle-installation",
      captureCredential: "d1-lifecycle-credential",
      captureCredentialVersion: 1,
      captureEnabled: true,
      captureEndpoint: "http://127.0.0.1:9/api/capture/events",
      confirmedSubmissions: [{
        schemaVersion: 1,
        status: "confirmed",
        platform: "nowcoder",
        problemExternalId: "acm/contest/18839/1001",
        externalSubmissionId: "d1-lifecycle-submission",
        confirmedAt: now,
        storageKey: "nowcoder:d1-lifecycle-submission",
        lastE3At: now,
      }],
      confirmedSubmissionTombstones: [{
        submissionKey: "nowcoder:d1-lifecycle-finalized",
        finalizedAt: now,
        expiresAt: new Date(Date.parse(now) + 30 * 24 * 60 * 60_000).toISOString(),
      }],
       captureOutbox: [outbox],
       captureQuarantine: [{
         ...quarantine,
         item: { ...quarantine.item, attempts: 3, automaticRetryBlocked: true },
       }],
      pairedAt: now,
      unknownLocalSentinel: "d1-local-unknown",
    });
    await chrome.storage.session.set({
      uiHints: [{
        schemaVersion: 1,
        tier: "E0",
        kind: "ui_hint",
        platform: "nowcoder",
        problemExternalId: "acm/contest/18839/1001",
        observedAt: now,
        sourceDocumentId: "d1-lifecycle-document",
      }],
      transientE1: [{
        schemaVersion: 1,
        tier: "E1",
        kind: "request_lifecycle",
        evidence: e1,
        outcome: "pending",
        stableSubmissionId: null,
        rejectionReason: null,
        receivedAt: now,
      }],
      contentIngressReady: [{ reason: "ready_record", tabId: 1, frameId: 0, documentId: "d1-lifecycle-document" }],
      contentIngressDiagnostics: [{ reason: "injection_failed", documentId: "d1-lifecycle-document" }],
      unknownSessionSentinel: "d1-session-unknown",
    });
  });
}

async function seedSessionState(worker: Worker): Promise<void> {
  await worker.evaluate(async () => {
    const now = new Date().toISOString();
    await chrome.storage.session.set({
      contentIngressReady: [{ reason: "ready_record", tabId: 1, frameId: 0, documentId: "d1-reseed" }],
      contentIngressDiagnostics: [{ reason: "injection_failed", documentId: "d1-reseed" }],
      unknownSessionSentinel: `d1-reseed-${now}`,
    });
  });
}

async function assertDurableStateEventually(
  context: BrowserContext,
  workerUrl: string,
  expectedOutbox = 0,
  expectedQuarantine = 0,
): Promise<DurableCaptureSnapshot> {
  const state = await readDurableCaptureSnapshotEventually(context, workerUrl);
  expect(state.confirmedSubmissions).toHaveLength(1);
  expect(state.confirmedSubmissionTombstones).toHaveLength(1);
  expect(state.captureOutbox).toHaveLength(expectedOutbox);
  expect(state.captureQuarantine).toHaveLength(expectedQuarantine);
  return state;
}

function expectDurableIdentityUnchanged(
  before: DurableCaptureSnapshot,
  after: DurableCaptureSnapshot,
): void {
  expect(durableIdentity(after)).toEqual(durableIdentity(before));
}

async function assertSessionStateEventually(
  context: BrowserContext,
  workerUrl: string,
  retained: boolean,
): Promise<void> {
  const state = await summarizeStorageEventually(context, workerUrl);
  if (retained) {
    expect(state.e1).toBe(1);
    expect(state.ingressReady).toBe(1);
    expect(state.ingressDiagnostics).toBe(1);
  } else {
    expect(state.e1).toBe(0);
    expect(state.ingressReady).toBe(0);
    expect(state.ingressDiagnostics).toBe(0);
  }
}

async function readFakeOjStorageEventually(
  context: BrowserContext,
  workerUrl: string,
): Promise<FakeOjOrchestratorStorage> {
  let lastError: unknown;
  for (let attempt = 0; attempt < 20; attempt += 1) {
    try {
      const worker = await getLiveWorker(context, workerUrl);
      return await readFakeOjStorage(worker);
    } catch (error) {
      lastError = error;
      await new Promise<void>((resolvePromise) => setTimeout(resolvePromise, 100));
    }
  }
  throw new Error(
    `D1 could not read a live worker: ${lastError instanceof Error ? lastError.message : String(lastError)}`,
  );
}

function hasCompletedE1(state: FakeOjOrchestratorStorage): boolean {
  const first = state.transientE1[0];
  if (typeof first !== "object" || first === null) return false;
  const evidence = Reflect.get(first, "evidence");
  return typeof evidence === "object"
    && evidence !== null
    && Reflect.get(evidence, "lifecycle") === "completed";
}

async function summarizeStorageEventually(
  context: BrowserContext,
  workerUrl: string,
): Promise<StorageSummary> {
  let lastError: unknown;
  for (let attempt = 0; attempt < 20; attempt += 1) {
    try {
      const worker = await getLiveWorker(context, workerUrl);
      return await summarizeStorage(worker);
    } catch (error) {
      lastError = error;
      await new Promise<void>((resolvePromise) => setTimeout(resolvePromise, 100));
    }
  }
  throw new Error(
    `D1 could not summarize a live worker: ${lastError instanceof Error ? lastError.message : String(lastError)}`,
  );
}

async function retryOutboxPage(page: Page): Promise<void> {
  await page.evaluate(async () => {
    await chrome.runtime.sendMessage({ type: "RETRY_CAPTURE_OUTBOX" });
  });
}

async function startCaptureProxy(): Promise<CaptureProxy> {
  let requests = 0;
  let acks = 0;
  let lastStatus: number | undefined;
  const requestBundleIds: string[] = [];
  const requestEventCounts: number[] = [];
  const ackBundleIds: string[] = [];
  const server = createServer((request: IncomingMessage, response: ServerResponse) => {
    void (async (): Promise<void> => {
      const url = new URL(request.url ?? "/", "http://127.0.0.1");
      const origin = request.headers.origin;
      if (typeof origin === "string") {
        response.setHeader("access-control-allow-origin", origin);
        response.setHeader("access-control-allow-headers", "authorization, content-type");
        response.setHeader("access-control-allow-methods", "POST, OPTIONS");
      }
      if (request.method === "OPTIONS") {
        response.statusCode = 204;
        response.end();
        return;
      }
      if (request.method !== "POST" || url.pathname !== "/api/capture/attempts") {
        response.statusCode = 404;
        response.end();
        return;
      }
      try {
        const chunks: Buffer[] = [];
        for await (const chunk of request) {
          chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
        }
        const requestBody: unknown = JSON.parse(Buffer.concat(chunks).toString("utf8"));
        const requestBundle = requestBody !== null && typeof requestBody === "object"
          ? Reflect.get(requestBody, "bundleId")
          : undefined;
        const requestEvents = requestBody !== null && typeof requestBody === "object"
          ? Reflect.get(requestBody, "events")
          : undefined;
        if (typeof requestBundle !== "string" || !Array.isArray(requestEvents)) {
          response.statusCode = 400;
          response.end("D1 proxy received an invalid bundle");
          return;
        }
        const headers: Record<string, string> = {
          "content-type": typeof request.headers["content-type"] === "string"
            ? request.headers["content-type"]
            : "application/json",
        };
        const authorization = request.headers.authorization;
        if (typeof authorization === "string") headers.authorization = authorization;
        if (typeof origin === "string") headers.origin = origin;
        requests += 1;
        const upstream = await fetch(CAPTURE_ENDPOINT, {
          method: "POST",
          headers,
          body: Buffer.concat(chunks),
        });
        lastStatus = upstream.status;
        requestBundleIds.push(requestBundle);
        requestEventCounts.push(requestEvents.length);
        if (upstream.status === 200) acks += 1;
        response.statusCode = upstream.status;
        const contentType = upstream.headers.get("content-type");
        if (contentType !== null) response.setHeader("content-type", contentType);
        const responseBytes = Buffer.from(await upstream.arrayBuffer());
        if (upstream.status === 200) {
          const responseBody: unknown = JSON.parse(responseBytes.toString("utf8"));
          const responseBundle = responseBody !== null && typeof responseBody === "object"
            ? Reflect.get(responseBody, "bundleId")
            : undefined;
          if (typeof responseBundle === "string") ackBundleIds.push(responseBundle);
        }
        response.end(responseBytes);
      } catch (error) {
        response.statusCode = 502;
        response.end(error instanceof Error ? error.message : "Capture proxy failed");
      }
    })();
  });
  await new Promise<void>((resolvePromise, rejectPromise) => {
    server.once("error", rejectPromise);
    server.listen(0, "127.0.0.1", () => resolvePromise());
  });
  const address = server.address();
  if (address === null || typeof address === "string") {
    await closeHttpServer(server);
    throw new Error("D1 capture proxy did not expose a TCP address");
  }
  return {
    endpoint: `http://127.0.0.1:${address.port}/api/capture/events`,
    requestCount: () => requests,
    ackCount: () => acks,
    lastStatus: () => lastStatus,
    requestBundleIds: () => [...requestBundleIds],
    requestEventCounts: () => [...requestEventCounts],
    ackBundleIds: () => [...ackBundleIds],
    close: () => closeHttpServer(server),
  };
}

async function closeHttpServer(server: ReturnType<typeof createServer>): Promise<void> {
  if (!server.listening) return;
  await new Promise<void>((resolvePromise, rejectPromise) => {
    server.close((error) => error === undefined ? resolvePromise() : rejectPromise(error));
  });
}

async function launchExactContext(profile: string): Promise<BrowserContext> {
  return chromium.launchPersistentContext(profile, {
    channel: "chromium",
    headless: true,
    args: [
      `--disable-extensions-except=${EXTENSION_DIST}`,
      `--load-extension=${EXTENSION_DIST}`,
      "--disable-features=ExtensionDisableUnsupportedDeveloper",
      "--no-proxy-server",
      "--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE localhost, EXCLUDE 127.0.0.1",
    ],
  });
}

async function getLiveWorker(context: BrowserContext, expectedUrl: string | undefined): Promise<Worker> {
  let workerUrl = expectedUrl;
  for (let attempt = 0; attempt < 120; attempt += 1) {
    const candidate = context.serviceWorkers().find((entry) =>
      workerUrl === undefined ? entry.url().startsWith("chrome-extension://") : entry.url() === workerUrl,
    );
    if (candidate !== undefined) {
      workerUrl = candidate.url();
      try {
        const ready = await candidate.evaluate(() =>
          typeof chrome !== "undefined" && chrome.storage !== undefined,
        );
        if (ready) return candidate;
      } catch {
        // The handle can be visible while its execution context is reattached.
      }
    }
    await new Promise<void>((resolvePromise) => setTimeout(resolvePromise, 100));
  }
  throw new Error(
    `No live exact-dist worker for ${workerUrl ?? "extension"}; visible=${context.serviceWorkers().map((entry) => entry.url()).join(",")}`,
  );
}

async function readRawStorage(worker: Worker): Promise<RawStorage> {
  return worker.evaluate(async (): Promise<RawStorage> => {
    const [local, session] = await Promise.all([
      chrome.storage.local.get(),
      chrome.storage.session.get(),
    ]);
    return {
      local: Object.fromEntries(Object.entries(local)),
      session: Object.fromEntries(Object.entries(session)),
    };
  });
}

async function readRawStorageFromPage(page: Page): Promise<RawStorage> {
  return page.evaluate(async (): Promise<RawStorage> => {
    const [local, session] = await Promise.all([
      chrome.storage.local.get(),
      chrome.storage.session.get(),
    ]);
    return {
      local: Object.fromEntries(Object.entries(local)),
      session: Object.fromEntries(Object.entries(session)),
    };
  });
}

async function readStorageFromPage(page: Page): Promise<FakeOjOrchestratorStorage> {
  return page.evaluate(async (): Promise<FakeOjOrchestratorStorage> => {
    const [local, session] = await Promise.all([
      chrome.storage.local.get([
        "confirmedSubmissions",
        "confirmedSubmissionTombstones",
        "captureOutbox",
        "captureQuarantine",
      ]),
      chrome.storage.session.get([
        "uiHints",
        "transientE1",
        "transientUnmatchedE3",
        "transientAmbiguityDiagnostics",
        "leetcodeEndpointDiagnostics",
        "webRequestSpikeMarkers",
      ]),
    ]);
    const list = (value: unknown): readonly unknown[] => Array.isArray(value) ? value : [];
    return {
      uiHints: list(session.uiHints),
      confirmedSubmissions: list(local.confirmedSubmissions),
      confirmedSubmissionTombstones: list(local.confirmedSubmissionTombstones),
      captureOutbox: list(local.captureOutbox),
      captureQuarantine: list(local.captureQuarantine),
      transientE1: list(session.transientE1),
      transientUnmatchedE3: list(session.transientUnmatchedE3),
      transientAmbiguityDiagnostics: list(session.transientAmbiguityDiagnostics),
      leetcodeEndpointDiagnostics: list(session.leetcodeEndpointDiagnostics),
      webRequestSpikeMarkers: list(session.webRequestSpikeMarkers),
    };
  });
}

async function readDurableMetadataFromPage(page: Page): Promise<DurableMetadata> {
  return page.evaluate(async (): Promise<DurableMetadata> => {
    const stored = await chrome.storage.local.get([
      "installationId",
      "captureCredential",
      "captureCredentialVersion",
      "captureProtocolVersion",
      "captureEndpoint",
      "pairedAt",
    ]);
    const stringValue = (value: unknown): string | undefined =>
      typeof value === "string" ? value : undefined;
    const numberValue = (value: unknown): number | undefined =>
      typeof value === "number" ? value : undefined;
    return {
      installationId: stringValue(stored.installationId),
      captureCredential: stringValue(stored.captureCredential),
      captureCredentialVersion: numberValue(stored.captureCredentialVersion),
      captureProtocolVersion: numberValue(stored.captureProtocolVersion),
      captureEndpoint: stringValue(stored.captureEndpoint),
      pairedAt: stringValue(stored.pairedAt),
    };
  });
}

async function readDurableCaptureSnapshotInExtensionContext(): Promise<DurableCaptureSnapshot> {
    const stored = await chrome.storage.local.get([
      "installationId",
      "captureCredential",
      "captureCredentialVersion",
      "captureEnabled",
      "captureEndpoint",
      "captureProtocolVersion",
      "pairedAt",
      "lastCaptureError",
      "lastSuccessfulCaptureAt",
      "lastDeliveredAttemptId",
      "lastDeliveredAttemptStatus",
      "confirmedSubmissions",
      "confirmedSubmissionTombstones",
      "captureOutbox",
      "captureQuarantine",
    ]);
    const stringValue = (value: unknown): string | undefined =>
      typeof value === "string" ? value : undefined;
    const numberValue = (value: unknown): number | undefined =>
      typeof value === "number" ? value : undefined;
    const booleanValue = (value: unknown): boolean | undefined =>
      typeof value === "boolean" ? value : undefined;
    const list = (value: unknown): readonly unknown[] => Array.isArray(value) ? value : [];
    return {
      installationId: stringValue(stored.installationId),
      captureCredential: stringValue(stored.captureCredential),
      captureCredentialVersion: numberValue(stored.captureCredentialVersion),
      captureEnabled: booleanValue(stored.captureEnabled),
      captureEndpoint: stringValue(stored.captureEndpoint),
      captureProtocolVersion: numberValue(stored.captureProtocolVersion),
      pairedAt: stringValue(stored.pairedAt),
      lastCaptureError: stringValue(stored.lastCaptureError),
      lastSuccessfulCaptureAt: stringValue(stored.lastSuccessfulCaptureAt),
      lastDeliveredAttemptId: stringValue(stored.lastDeliveredAttemptId),
      lastDeliveredAttemptStatus: stringValue(stored.lastDeliveredAttemptStatus),
      confirmedSubmissions: list(stored.confirmedSubmissions),
      confirmedSubmissionTombstones: list(stored.confirmedSubmissionTombstones),
      captureOutbox: list(stored.captureOutbox),
      captureQuarantine: list(stored.captureQuarantine),
    };
}

async function readDurableCaptureSnapshotFromPage(page: Page): Promise<DurableCaptureSnapshot> {
  return page.evaluate(readDurableCaptureSnapshotInExtensionContext);
}

async function readDurableCaptureSnapshotEventually(
  context: BrowserContext,
  workerUrl: string,
): Promise<DurableCaptureSnapshot> {
  let lastError: unknown;
  for (let attempt = 0; attempt < 20; attempt += 1) {
    try {
      const worker = await getLiveWorker(context, workerUrl);
      return await worker.evaluate(readDurableCaptureSnapshotInExtensionContext);
    } catch (error) {
      lastError = error;
      await new Promise<void>((resolvePromise) => setTimeout(resolvePromise, 100));
    }
  }
  throw new Error(
    `D1 could not read durable capture state: ${lastError instanceof Error ? lastError.message : String(lastError)}`,
  );
}

function durableIdentity(snapshot: DurableCaptureSnapshot): Readonly<Record<string, unknown>> {
  return {
    installationId: snapshot.installationId,
    captureCredential: snapshot.captureCredential,
    captureCredentialVersion: snapshot.captureCredentialVersion,
    captureEndpoint: snapshot.captureEndpoint,
    captureProtocolVersion: snapshot.captureProtocolVersion,
    pairedAt: snapshot.pairedAt,
    lastSuccessfulCaptureAt: snapshot.lastSuccessfulCaptureAt,
    lastDeliveredAttemptId: snapshot.lastDeliveredAttemptId,
    lastDeliveredAttemptStatus: snapshot.lastDeliveredAttemptStatus,
     confirmedSubmissions: snapshot.confirmedSubmissions,
     confirmedSubmissionTombstones: snapshot.confirmedSubmissionTombstones,
     captureOutbox: snapshot.captureOutbox,
     captureQuarantine: snapshot.captureQuarantine.map((candidate) =>
       typeof candidate === "object" && candidate !== null
         ? {
             id: Reflect.get(candidate, "id"),
             item: Reflect.get(candidate, "item"),
             error: "diagnostic",
             quarantinedAt: Reflect.get(candidate, "quarantinedAt"),
           }
         : candidate),
   };
 }

async function pollStorageFromPage(
  page: Page,
  predicate: (storage: FakeOjOrchestratorStorage) => boolean,
  timeoutMs = 10_000,
): Promise<FakeOjOrchestratorStorage> {
  const deadline = Date.now() + timeoutMs;
  let storage = await readStorageFromPage(page);
  while (Date.now() < deadline) {
    if (predicate(storage)) return storage;
    await new Promise<void>((resolvePromise) => setTimeout(resolvePromise, 100));
    storage = await readStorageFromPage(page);
  }
  if (predicate(storage)) return storage;
  throw new Error(`D1 page storage poll timed out: ${JSON.stringify(storage)}`);
}

function recordBrowserVersion(context: BrowserContext): void {
  const browser = context.browser();
  if (browser !== null) evidence.browser = browser.version();
}

async function settleWorkerInitialization(context: BrowserContext, worker: Worker): Promise<void> {
  let lastError: unknown;
  for (let attempt = 0; attempt < 120; attempt += 1) {
    const popup = await context.newPage();
    try {
      await popup.goto(`chrome-extension://${new URL(worker.url()).host}/popup.html`, {
        waitUntil: "domcontentloaded",
      });
      await popup.evaluate(async () => {
        const result = await new Promise<{ readonly response: unknown; readonly error?: string }>((resolvePromise) => {
          chrome.runtime.sendMessage({ type: "GET_CAPTURE_STATE" }, (response: unknown) => {
            resolvePromise({
              response,
              ...(chrome.runtime.lastError?.message === undefined
                ? {}
                : { error: chrome.runtime.lastError.message }),
            });
          });
        });
        if (result.error !== undefined) throw new Error(result.error);
        const state = result.response;
        if (typeof state !== "object" || state === null) throw new Error("invalid object");
        if (typeof Reflect.get(state, "__captureStateError") === "string") {
          throw new Error(`background: ${Reflect.get(state, "__captureStateError")}`);
        }
        if (typeof Reflect.get(state, "installationId") !== "string") throw new Error("invalid installationId");
        if (typeof Reflect.get(state, "captureEnabled") !== "boolean") throw new Error("invalid captureEnabled");
        if (typeof Reflect.get(state, "captureEndpoint") !== "string") throw new Error("invalid captureEndpoint");
        if (typeof Reflect.get(state, "waiting") !== "boolean") throw new Error("invalid waiting");
        if (typeof Reflect.get(state, "waitingCount") !== "number") throw new Error("invalid waitingCount");
        if (typeof Reflect.get(state, "sessionCount") !== "number") throw new Error("invalid sessionCount");
        if (typeof Reflect.get(state, "finalizedCount") !== "number") throw new Error("invalid finalizedCount");
        if (typeof Reflect.get(state, "outboxCount") !== "number") throw new Error("invalid outboxCount");
        if (typeof Reflect.get(state, "quarantineCount") !== "number") throw new Error("invalid quarantineCount");
        if (!Array.isArray(Reflect.get(state, "quarantineDetails"))) throw new Error("invalid quarantineDetails");
      });
      return;
    } catch (error) {
      lastError = error;
      await new Promise<void>((resolvePromise) => setTimeout(resolvePromise, 100));
    } finally {
      await popup.close().catch(() => undefined);
    }
  }
  throw new Error(
    `D1 worker initialization did not settle: ${lastError instanceof Error ? lastError.message : String(lastError)}`,
  );
}

async function summarizeStorage(worker: Worker): Promise<StorageSummary> {
  return summarizeRawStorage(await readRawStorage(worker));
}

async function summarizeStorageFromPage(page: Page): Promise<StorageSummary> {
  return summarizeRawStorage(await readRawStorageFromPage(page));
}

function summarizeRawStorage(raw: RawStorage): StorageSummary {
  const array = (value: unknown): readonly unknown[] => Array.isArray(value) ? value : [];
  const strings = (value: unknown, key: string): readonly string[] => array(value).flatMap((entry) => {
    if (typeof entry !== "object" || entry === null) return [];
    const candidate = Reflect.get(entry, key);
    return typeof candidate === "string" ? [candidate] : [];
  });
  return {
    localKeys: Object.keys(raw.local).sort(),
    sessionKeys: Object.keys(raw.session).sort(),
    captureEnabled: typeof raw.local.captureEnabled === "boolean"
      ? raw.local.captureEnabled
      : undefined,
    confirmed: array(raw.local.confirmedSubmissions).length,
    tombstones: array(raw.local.confirmedSubmissionTombstones).length,
    outbox: array(raw.local.captureOutbox).length,
    quarantine: array(raw.local.captureQuarantine).length,
    e0: array(raw.session.uiHints).length,
    e1: array(raw.session.transientE1).length,
    unmatchedE3: array(raw.session.transientUnmatchedE3).length,
    ingressReady: array(raw.session.contentIngressReady).length,
    ingressDiagnostics: array(raw.session.contentIngressDiagnostics).length,
    confirmedStorageKeys: strings(raw.local.confirmedSubmissions, "storageKey"),
    tombstoneKeys: strings(raw.local.confirmedSubmissionTombstones, "submissionKey"),
  };
}

async function installNowCoderRoutes(
  context: BrowserContext,
  observed: string[],
  setVerdict: (value: string) => void,
  getVerdict: () => string | null,
): Promise<void> {
  await context.route("https://ac.nowcoder.com/**", async (route) => {
    const request = route.request();
    const parsed = new URL(request.url());
    observed.push(`${request.method()} ${request.url()}`);
    if (request.method() === "GET"
      && (parsed.pathname === "/acm/contest/18839" || parsed.pathname === "/acm/contest/18839/1001")) {
      await route.fulfill({
        status: 200,
        contentType: "text/html; charset=utf-8",
        body: parsed.pathname.endsWith("/1001") ? problemHtml() : listHtml(),
      });
      return;
    }
    if (request.method() === "POST" && parsed.pathname === "/nccommon/submit_cd") {
      await route.fulfill({ status: 200, contentType: "application/json", body: "{\"ok\":true}" });
      return;
    }
    if (request.method() === "GET" && parsed.pathname === "/nccommon/status") {
      await route.fulfill({ status: 200, contentType: "application/json", body: "{\"ok\":true}" });
      return;
    }
    if (request.method() === "GET" && parsed.pathname === "/acm/contest/view-submission") {
      await route.fulfill({ status: 200, contentType: "text/html; charset=utf-8", body: resultHtml(getVerdict()) });
      return;
    }
    await route.abort("blockedbyclient");
  });
  void setVerdict;
}

async function submitFakeNowCoder(page: Page): Promise<void> {
  await page.goto(NOWCODER_B7_PROBLEM_URL, { waitUntil: "domcontentloaded" });
  await page.locator("button.btn-submit").waitFor();
  await page.waitForTimeout(550);
  await page.locator("button.btn-submit").click();
  await page.evaluate(async (url) => { await fetch(url, { method: "POST" }); }, NOWCODER_B7_SUBMIT_URL);
}

async function seedUpgradeStorage(page: Page, version: 2 | 3): Promise<void> {
  await page.evaluate(async (protocolVersion: number) => {
    const now = new Date().toISOString();
    const base = {
      captureProtocolVersion: protocolVersion,
      installationId: `d1-v${protocolVersion}-installation`,
      captureCredential: `capture_d1_v${protocolVersion}`,
      captureEnabled: false,
      captureEndpoint: "http://127.0.0.1:9/api/capture/events",
      unknownLocalSentinel: `d1-v${protocolVersion}-local`,
      unknownSessionSentinel: `d1-v${protocolVersion}-session`,
    };
    if (protocolVersion === 2) {
      await chrome.storage.local.set({
        ...base,
        eventQueue: [{ id: "d1-v2-event-1" }, { id: "d1-v2-event-2" }],
      });
      await chrome.storage.session.set({ unknownSessionSentinel: base.unknownSessionSentinel });
      return;
    }
    const bundleCommon = {
      schemaVersion: 2,
      captureSessionId: "d1-v3-session",
      installationId: base.installationId,
      adapterVersion: "atomic-bundle@0.1.0",
      parserVersion: "atomic-bundle-verdict@0.2.0",
      pageOrigin: "https://atcoder.jp",
      provenanceLevel: "extension_paired",
      platform: "atcoder",
      problemExternalId: "abc001_a",
      problemTitle: "D1 V3",
      canonicalUrl: "https://atcoder.jp/contests/abc001/tasks/abc001_a",
    };
    const later = new Date(Date.parse(now) + 1_000).toISOString();
    const makeBundle = (bundleId: string, submissionId: string) => ({
      schemaVersion: 1,
      bundleId,
      events: [
        { ...bundleCommon, id: `${bundleId}-started`, type: "SESSION_STARTED", occurredAt: now, payload: { source: "content_script" } },
        { ...bundleCommon, id: `${bundleId}-submitted`, type: "SUBMISSION_OBSERVED", submissionId, occurredAt: now, payload: { action: "submit_clicked" } },
        { ...bundleCommon, id: `${bundleId}-verdict`, type: "VERDICT_OBSERVED", submissionId, occurredAt: later, payload: { verdict: "Accepted" } },
        { ...bundleCommon, id: `${bundleId}-ended`, type: "SESSION_ENDED", occurredAt: later, payload: { endReason: "capture_disabled" } },
      ],
    });
    const outboxBundle = makeBundle("bundle_d1-v3-outbox", "d1-v3-outbox-submission");
    const quarantineBundle = makeBundle("bundle_d1-v3-quarantine", "d1-v3-quarantine-submission");
    const outbox = {
      id: outboxBundle.bundleId,
      kind: "attempt_bundle",
      bundle: outboxBundle,
      attempts: 0,
      createdAt: now,
    };
    const quarantine = {
      id: quarantineBundle.bundleId,
      item: { ...outbox, id: quarantineBundle.bundleId, bundle: quarantineBundle },
      error: "D1 V3 retained quarantine",
      quarantinedAt: now,
    };
    await chrome.storage.local.set({
      ...base,
      pendingSubmissionIntents: [
        { id: "d1-v3-active", status: "active" },
        { id: "d1-v3-superseded", status: "superseded" },
        { id: "d1-v3-expired", status: "expired" },
      ],
      captureOutbox: [outbox],
      captureQuarantine: [quarantine],
      outbox: [{ id: "d1-v3-stale-outbox" }],
      quarantine: [{ id: "d1-v3-stale-quarantine" }],
    });
    await chrome.storage.session.set({ unknownSessionSentinel: base.unknownSessionSentinel });
  }, version);
  await page.waitForTimeout(100);
}

function listHtml(): string {
  return "<!doctype html><meta charset=\"utf-8\"><title>D1 list</title><main>list</main>";
}

function problemHtml(): string {
  return "<!doctype html><meta charset=\"utf-8\"><title>D1 problem</title><main><button class=\"btn-submit\" type=\"button\">保存并提交</button></main>";
}

function resultHtml(verdict: string | null): string {
  return [
    "<!doctype html><meta charset=\"utf-8\"><title>D1 result</title>",
    "<a href=\"/acm/contest/18839/1001\">problem</a>",
    verdict === null ? "" : `<div class=\"coder-cont-legend\">${verdict}</div>`,
  ].join("");
}

async function pairExtension(
  context: BrowserContext,
  worker: Worker,
  extensionId: string,
): Promise<void> {
  const response = await fetch("http://localhost:3000/api/capture/pairing-codes", {
    method: "POST",
    headers: { "content-type": "application/json", origin: "http://localhost:3000" },
    body: "{}",
  });
  const body: unknown = await response.json();
  const code = readPairingCode(body);
  const popup = await context.newPage();
  try {
    await popup.goto(`chrome-extension://${extensionId}/popup.html`, { waitUntil: "domcontentloaded" });
    await popup.locator("#pairingCode").fill(code);
    await popup.locator("#pairButton").click();
    await expect.poll(async () => worker.evaluate(async () => {
      const stored = await chrome.storage.local.get(["captureCredential"]);
      return typeof stored.captureCredential === "string";
    })).toBe(true);
  } finally {
    await popup.close();
  }
}

function readPairingCode(value: unknown): string {
  if (typeof value !== "object" || value === null) throw new Error("Pairing response is not an object");
  const code = Reflect.get(value, "code");
  if (Reflect.get(value, "ok") !== true || typeof code !== "string" || code.length === 0) {
    throw new Error("Pairing response did not contain a code");
  }
  return code;
}

function readDbPath(): string {
  const path = readFileSync(DB_PATH_FILE, "utf8").trim();
  if (path.length === 0) throw new Error("D1 disposable DB path is empty");
  return path;
}

function readManifestVersion(): string {
  const content = readFileSync(resolve(EXTENSION_DIST, "manifest.json"), "utf8");
  const match = content.match(/"version"\s*:\s*"([^"]+)"/u);
  if (match?.[1] === undefined) throw new Error("Production manifest version is missing");
  return match[1];
}

function readDistHashes(): Readonly<Record<string, string>> {
  const hashes: Record<string, string> = {};
  for (const file of DIST_FILES) {
    const path = resolve(EXTENSION_DIST, file);
    if (!existsSync(path)) continue;
    hashes[file] = createHash("sha256").update(readFileSync(path)).digest("hex");
  }
  return hashes;
}

function readGitHead(): string {
  return execFileSync("git", ["rev-parse", "HEAD"], {
    cwd: process.cwd(),
    encoding: "utf8",
  }).trim();
}

function readGitStatus(): readonly string[] {
  const output = execFileSync("git", ["status", "--short"], {
    cwd: process.cwd(),
    encoding: "utf8",
  });
  return output.split(/\r?\n/u).filter((line) => line.length > 0);
}
