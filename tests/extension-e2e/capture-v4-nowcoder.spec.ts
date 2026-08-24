/**
 * Phase B Task B7 — exact production-dist NowCoder network pilot.
 *
 * All ac.nowcoder.com traffic is fulfilled by Playwright routes. The test
 * browser cannot reach the public network, and the exact B4 paths are the only
 * paths the harness accepts. Positive completion uses the real extension
 * background/content scripts; no confirmed-submission seed is used.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import type {
  BrowserContext,
  Page,
  Route,
  Worker,
} from "@playwright/test";

import { expect, test } from "./fixtures";
import {
  NOWCODER_B7_LIST_URL,
  NOWCODER_B7_PROBLEM_URL,
  NOWCODER_B7_SUBMIT_URL,
  nowCoderB7ResultUrl,
  nowCoderB7StatusUrl,
  pollUntilStorageMatches,
  readFakeOjStorage,
  stopAndReawakenFakeOjWorker,
} from "./fakeOj";
import { readDatabaseCounts } from "./database";
import { connectRouteHExtension } from "./routeHConnection";

const SUBMISSION_ID = "84257293";
const OTHER_SUBMISSION_ID = "84257999";
const DB_PATH_FILE = resolve(process.cwd(), ".tmp", "server-db-path.txt");

type NowCoderRouteHarness = Readonly<{
  readonly observed: readonly string[];
  readonly setResultVerdict: (verdict: string | null) => void;
}>;

test("list -> problem without submit leaves waiting at zero", async ({
  extensionContext,
  extensionWorker,
}) => {
  const harness = await installNowCoderRoutes(extensionContext);
  const page = await extensionContext.newPage();
  try {
    await navigateReady(extensionContext, page, extensionWorker);
    await page.waitForTimeout(150);
    const storage = await readFakeOjStorage(extensionWorker);
    expect(storage.confirmedSubmissions).toHaveLength(0);
    expect(storage.captureOutbox).toHaveLength(0);
    expect(harness.observed).toEqual([
      `GET ${NOWCODER_B7_LIST_URL}`,
      `GET ${NOWCODER_B7_PROBLEM_URL}`,
    ]);
  } finally {
    await page.close();
  }
});

test("trusted click hint alone leaves waiting at zero", async ({
  extensionContext,
  extensionWorker,
}) => {
  await installNowCoderRoutes(extensionContext);
  const page = await extensionContext.newPage();
  try {
    await navigateReady(extensionContext, page, extensionWorker);
    await clickHint(page, extensionWorker);
    const storage = await readFakeOjStorage(extensionWorker);
    expect(storage.confirmedSubmissions).toHaveLength(0);
    expect(storage.transientE1).toHaveLength(0);
  } finally {
    await page.close();
  }
});

test("HTTP 200 without the characterized stable ID does not confirm", async ({
  extensionContext,
  extensionWorker,
}) => {
  await installNowCoderRoutes(extensionContext);
  const page = await extensionContext.newPage();
  try {
    await navigateReady(extensionContext, page, extensionWorker);
    await clickHint(page, extensionWorker);
    await fetchSubmit(page);
    await fetchStatus(page);
    await expect.poll(async () => (await readFakeOjStorage(extensionWorker)).transientE1.length)
      .toBe(2);
    expect((await readFakeOjStorage(extensionWorker)).confirmedSubmissions).toHaveLength(0);
  } finally {
    await page.close();
  }
});

test("characterized submit + status confirmation creates waiting exactly once", async ({
  extensionContext,
  extensionWorker,
}) => {
  await installNowCoderRoutes(extensionContext);
  const page = await extensionContext.newPage();
  try {
    await navigateReady(extensionContext, page, extensionWorker);
    await clickHint(page, extensionWorker);
    await fetchSubmit(page);
    await fetchStatus(page, SUBMISSION_ID);
    const storage = await pollUntilStorageMatches(
      extensionWorker,
      (snapshot) => snapshot.confirmedSubmissions.length === 1,
    );
    expect(storage.confirmedSubmissions).toHaveLength(1);

    await fetchStatus(page, SUBMISSION_ID);
    await page.waitForTimeout(200);
    expect((await readFakeOjStorage(extensionWorker)).confirmedSubmissions).toHaveLength(1);
  } finally {
    await page.close();
  }
});

test("mismatched final verdict cannot consume the confirmed submission", async ({
  extensionContext,
  extensionWorker,
}) => {
  const harness = await installNowCoderRoutes(extensionContext);
  const page = await extensionContext.newPage();
  try {
    await confirmSubmission(extensionContext, page, extensionWorker, SUBMISSION_ID);
    harness.setResultVerdict("答案错误");
    await page.goto(nowCoderB7ResultUrl(OTHER_SUBMISSION_ID), { waitUntil: "domcontentloaded" });
    await expect.poll(async () => (await readFakeOjStorage(extensionWorker)).transientUnmatchedE3.length)
      .toBe(1);
    const storage = await readFakeOjStorage(extensionWorker);
    expect(storage.confirmedSubmissions).toHaveLength(1);
    expect(storage.captureOutbox).toHaveLength(0);
    expect(storage.confirmedSubmissionTombstones).toHaveLength(0);
  } finally {
    await page.close();
  }
});

test("direct exact result creates one unmatched E3 without delivery", async ({
  extensionContext,
  extensionWorker,
}) => {
  const harness = await installNowCoderRoutes(extensionContext);
  const page = await extensionContext.newPage();
  try {
    harness.setResultVerdict("答案错误");
    await page.goto(nowCoderB7ResultUrl(SUBMISSION_ID), { waitUntil: "domcontentloaded" });
    const storage = await pollUntilStorageMatches(
      extensionWorker,
      (snapshot) => snapshot.transientUnmatchedE3.length === 1,
    );
    expect(storage.confirmedSubmissions).toHaveLength(0);
    expect(storage.captureOutbox).toHaveLength(0);
    expect(storage.captureQuarantine).toHaveLength(0);

    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForTimeout(250);
    expect((await readFakeOjStorage(extensionWorker)).transientUnmatchedE3).toHaveLength(1);
  } finally {
    await page.close();
  }
});

test("two concurrent submit candidates fail closed as ambiguous", async ({
  extensionContext,
  extensionWorker,
}) => {
  await installNowCoderRoutes(extensionContext);
  const page = await extensionContext.newPage();
  try {
    await navigateReady(extensionContext, page, extensionWorker);
    await clickHint(page, extensionWorker);
    await Promise.all([fetchSubmit(page), fetchSubmit(page)]);
    await fetchStatus(page, SUBMISSION_ID);
    await expect.poll(async () => (await readFakeOjStorage(extensionWorker)).transientE1.length)
      .toBe(3);
    expect((await readFakeOjStorage(extensionWorker)).confirmedSubmissions).toHaveLength(0);
  } finally {
    await page.close();
  }
});

test("service-worker restart after E1 and after E2 preserves the legal transitions", async ({
  extensionContext,
  extensionWorker,
}) => {
  const harness = await installNowCoderRoutes(extensionContext);
  const page = await extensionContext.newPage();
  const popup = await extensionContext.newPage();
  try {
    await navigateReady(extensionContext, page, extensionWorker);
    await clickHint(page, extensionWorker);
    await fetchSubmit(page);
    await expect.poll(async () =>
      (await readFakeOjStorage(extensionWorker)).transientE1.some(isCompletedNowCoderSubmit))
      .toBe(true);

    await stopAndReawakenFakeOjWorker(page, extensionWorker, async () => {
      await fetchStatus(page, SUBMISSION_ID);
    });
    // In bundled Chromium the request used to wake a stopped MV3 worker can
    // finish before the restarted worker has reattached all webRequest
    // listeners. Drive the same idempotent status witness once more after CDP
    // has reported `running`; this is the event whose post-restart transition
    // the assertion covers.
    await popup.goto(
      `chrome-extension://${new URL(extensionWorker.url()).host}/popup.html`,
      { waitUntil: "domcontentloaded" },
    );
    await expect.poll(async () => {
      const storage = await readRestartStorage(popup);
      return storage.e1 >= 1 || storage.confirmed === 1;
    }).toBe(true);
    const afterRestart = await readRestartStorage(popup);
    if (afterRestart.confirmed === 0) await fetchStatus(page, SUBMISSION_ID);
    await expect.poll(() => readRestartStorage(popup), { timeout: 20_000 })
      .toMatchObject({ confirmed: 1, tombstones: 0, outbox: 0 });
    // The NowCoder submit/status contract intentionally has a five-second
    // chronology window. Verify the post-restart status witness before waiting
    // for the independent open-document recovery sweep, then prove that sweep
    // also reaches ready without relaxing the capture window.
    await expect.poll(async () => popup.evaluate(async () => {
      const state = await chrome.runtime.sendMessage({ type: "GET_CAPTURE_STATE" });
      const recovery = typeof state === "object" && state !== null
        ? Reflect.get(state, "captureRecoveryStatus")
        : undefined;
      return typeof recovery === "object" && recovery !== null
        ? Reflect.get(recovery, "state")
        : undefined;
    })).toBe("ready");

    harness.setResultVerdict("答案错误");
    await stopAndReawakenFakeOjWorker(page, extensionWorker, async () => {
      await page.goto(nowCoderB7ResultUrl(SUBMISSION_ID), { waitUntil: "domcontentloaded" });
    });
    // Likewise, make the final verdict observation after the worker is known
    // running. A prior successful observation is idempotent via its tombstone.
    await page.reload({ waitUntil: "domcontentloaded" });
    await expect.poll(() => readRestartStorage(popup))
      .toMatchObject({ confirmed: 0, tombstones: 1, outbox: 1 });
  } finally {
    await popup.close();
    await page.close();
  }
});

test("judging -> matching final delivers one ACK, one attempt, and four events", async ({
  extensionContext,
  extensionWorker,
}) => {
  const harness = await installNowCoderRoutes(extensionContext);
  const page = await extensionContext.newPage();
  const dbPath = readFileSync(DB_PATH_FILE, "utf8").trim();
  const before = readDatabaseCounts(dbPath);
  try {
    await connectRouteHExtension(extensionContext, extensionWorker);
    await confirmSubmission(extensionContext, page, extensionWorker, SUBMISSION_ID);

    harness.setResultVerdict(null);
    await page.goto(nowCoderB7ResultUrl(SUBMISSION_ID), { waitUntil: "domcontentloaded" });
    expect((await readFakeOjStorage(extensionWorker)).confirmedSubmissions).toHaveLength(1);

    await page.evaluate(() => {
      const verdict = document.createElement("div");
      verdict.className = "coder-cont-legend";
      verdict.textContent = "答案错误";
      document.body.append(verdict);
    });

    await expect.poll(() => readDatabaseCounts(dbPath)).toEqual({
      captureEvents: before.captureEvents + 4,
      trainingSessions: before.trainingSessions + 1,
      trainingAttempts: before.trainingAttempts + 1,
    });
    const delivered = await pollUntilStorageMatches(
      extensionWorker,
      (snapshot) => snapshot.confirmedSubmissionTombstones.length === 1
        && snapshot.confirmedSubmissions.length === 0
        && snapshot.captureOutbox.length === 0,
    );
    expect(delivered.captureQuarantine).toHaveLength(0);

    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForTimeout(250);
    expect(readDatabaseCounts(dbPath)).toEqual({
      captureEvents: before.captureEvents + 4,
      trainingSessions: before.trainingSessions + 1,
      trainingAttempts: before.trainingAttempts + 1,
    });
  } finally {
    await page.close();
  }
});

async function installNowCoderRoutes(context: BrowserContext): Promise<NowCoderRouteHarness> {
  const observed: string[] = [];
  let resultVerdict: string | null = null;
  await context.route("https://ac.nowcoder.com/**", async (route) => {
    observed.push(`${route.request().method()} ${route.request().url()}`);
    await fulfillNowCoderRoute(route, resultVerdict);
  });
  return {
    observed,
    setResultVerdict: (verdict) => {
      resultVerdict = verdict;
    },
  };
}

async function fulfillNowCoderRoute(route: Route, resultVerdict: string | null): Promise<void> {
  const request = route.request();
  const parsed = new URL(request.url());
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
    await route.fulfill({
      status: 200,
      contentType: "text/html; charset=utf-8",
      body: resultHtml(resultVerdict),
    });
    return;
  }
  await route.abort("blockedbyclient");
}

function listHtml(): string {
  return "<!doctype html><meta charset=\"utf-8\"><title>Fake NowCoder list</title><main>list</main>";
}

function problemHtml(): string {
  return [
    "<!doctype html><meta charset=\"utf-8\"><title>Fake NowCoder problem</title>",
    "<main><button class=\"btn-submit\" type=\"button\">保存并提交</button></main>",
  ].join("");
}

function resultHtml(verdict: string | null): string {
  return [
    "<!doctype html><meta charset=\"utf-8\"><title>Fake NowCoder result</title>",
    "<a href=\"/acm/contest/18839/1001\">problem</a>",
    verdict === null ? "" : `<div class="coder-cont-legend">${verdict}</div>`,
  ].join("");
}

async function navigateReady(
  context: BrowserContext,
  page: Page,
  worker: Worker,
): Promise<void> {
  const extensionId = new URL(worker.url()).host;
  const popup = await context.newPage();
  await popup.goto(`chrome-extension://${extensionId}/popup.html`, { waitUntil: "domcontentloaded" });
  await popup.locator("#characterizationHostname").selectOption("ac.nowcoder.com");
  await popup.locator("#characterizationAuthenticated").uncheck();
  await popup.locator("#characterizationStart").click();
  await page.goto(NOWCODER_B7_LIST_URL, { waitUntil: "domcontentloaded" });
  await expect.poll(async () => popup.evaluate(async () =>
    chrome.runtime.sendMessage({ type: "CHARACTERIZATION_STATUS" })))
    .toMatchObject({ b3Status: "list_seen" });
  await page.goto(NOWCODER_B7_PROBLEM_URL, { waitUntil: "domcontentloaded" });
  await page.locator("button.btn-submit").waitFor();
  await expect.poll(async () => popup.evaluate(async () =>
    chrome.runtime.sendMessage({ type: "CHARACTERIZATION_STATUS" })))
    .toMatchObject({ b3Status: "ready" });
  await popup.locator("#characterizationStop").click();
  await expect(popup.locator("#characterizationStart")).toBeEnabled();
  await expect.poll(async () => popup.evaluate(async () =>
    chrome.runtime.sendMessage({ type: "CHARACTERIZATION_STATUS" })))
    .toMatchObject({ session: { active: false } });
  await popup.close();
}

async function clickHint(page: Page, worker: Worker): Promise<void> {
  // The content script obtains its runtime context asynchronously at
  // document_start. Wait one navigation-poll interval so the trusted-click
  // listener is installed before driving the synthetic user gesture.
  await page.waitForTimeout(550);
  await page.locator("button.btn-submit").click();
  await expect.poll(async () => (await readFakeOjStorage(worker)).uiHints.length).toBe(1);
}

async function fetchSubmit(page: Page): Promise<void> {
  await page.evaluate(async (url) => {
    await fetch(url, { method: "POST" });
  }, NOWCODER_B7_SUBMIT_URL);
}

async function fetchStatus(page: Page, submissionId?: string): Promise<void> {
  await page.evaluate(async (url) => {
    await fetch(url, { cache: "no-store" });
  }, nowCoderB7StatusUrl(submissionId));
}

async function confirmSubmission(
  context: BrowserContext,
  page: Page,
  worker: Worker,
  submissionId: string,
): Promise<void> {
  await navigateReady(context, page, worker);
  await clickHint(page, worker);
  await fetchSubmit(page);
  await fetchStatus(page, submissionId);
  await pollUntilStorageMatches(worker, (snapshot) => snapshot.confirmedSubmissions.length === 1);
}

async function readRestartStorage(page: Page): Promise<{
  readonly e1: number;
  readonly confirmed: number;
  readonly tombstones: number;
  readonly outbox: number;
}> {
  return page.evaluate(async () => {
    const local = await chrome.storage.local.get([
      "confirmedSubmissions",
      "confirmedSubmissionTombstones",
      "captureOutbox",
    ]);
    const session = await chrome.storage.session.get(["transientE1"]);
    return {
      e1: Array.isArray(session.transientE1) ? session.transientE1.length : 0,
      confirmed: Array.isArray(local.confirmedSubmissions)
        ? local.confirmedSubmissions.length
        : 0,
      tombstones: Array.isArray(local.confirmedSubmissionTombstones)
        ? local.confirmedSubmissionTombstones.length
        : 0,
      outbox: Array.isArray(local.captureOutbox) ? local.captureOutbox.length : 0,
    };
  });
}

function isCompletedNowCoderSubmit(value: unknown): boolean {
  if (typeof value !== "object" || value === null) return false;
  const evidence = Reflect.get(value, "evidence");
  return typeof evidence === "object" && evidence !== null
    && Reflect.get(evidence, "platform") === "nowcoder"
    && Reflect.get(evidence, "method") === "POST"
    && Reflect.get(evidence, "endpointKey") === "nowcoder/submit"
    && Reflect.get(evidence, "lifecycle") === "completed"
    && Reflect.get(evidence, "statusCode") === 200;
}
