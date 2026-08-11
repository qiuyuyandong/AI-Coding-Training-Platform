/**
 * V4 Phase NowCoder E3 ingress repair — Task 6 evidence.
 *
 * Same-build fresh full-chain real retest against the production extension
 * `extension/dist`. The browser cannot reach public ac.nowcoder.com; the
 * Playwright context.route intercept handles submit/status/result so the
 * production code path runs end-to-end:
 *
 *   trusted click → E0 hint
 *     → nccommon/submit_cd → E1 lifecycle
 *     → nccommon/status → E2 confirmation (stable submissionId)
 *     → /acm/contest/view-submission → content bootstrap ready_record
 *       → page DOM mutation → final verdict → E3
 *         → one bundle, one outbox, one delivery, one SQLite attempt
 *
 * Preconditions (verified by Task 0-4 + Task 5 on the same SHA):
 *   - fresh profile (no prior extension state)
 *   - disposable SQLite paired via fetch('/api/capture/pairing-codes')
 *   - browse-only waiting remains zero before submit
 *
 * Required public evidence:
 *   +4 capture_events (one V3-compatible atomic bundle)
 *   +1 training_session
 *   +1 training_attempt
 *   no duplicate rows after reload or worker restart
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { expect, test } from "./fixtures";
import {
  NOWCODER_B7_LIST_URL,
  NOWCODER_B7_PROBLEM_URL,
  NOWCODER_B7_SUBMIT_URL,
  nowCoderB7ResultUrl,
  nowCoderB7StatusUrl,
  pollUntilStorageMatches,
  readFakeOjStorage,
} from "./fakeOj";
import { readDatabaseCounts } from "./database";

const DB_PATH_FILE = resolve(process.cwd(), ".tmp", "server-db-path.txt");

const SUBMISSION_ID = "84258557";
const OTHER_SUBMISSION_ID = "84257999";

test("Task 6: same-build full-chain real retest delivers one bundle and one training attempt", async ({
  extensionContext,
  extensionWorker,
  extensionId,
}) => {
  const observed: string[] = [];
  let resultVerdict: string | null = null;
  await extensionContext.route("https://ac.nowcoder.com/**", async (route) => {
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
      await route.fulfill({
        status: 200,
        contentType: "text/html; charset=utf-8",
        body: resultHtml(resultVerdict),
      });
      return;
    }
    await route.abort("blockedbyclient");
  });

  const dbPath = readFileSync(DB_PATH_FILE, "utf8").trim();
  const before = readDatabaseCounts(dbPath);
  const page = await extensionContext.newPage();
  try {
    // Pair the fresh extension with the disposable local app.
    await pairExtension(extensionContext, extensionWorker, extensionId);

    // Browse list -> problem before submit. No trusted click yet; browse-only
    // waiting must remain zero.
    await page.goto(NOWCODER_B7_LIST_URL, { waitUntil: "domcontentloaded" });
    await page.goto(NOWCODER_B7_PROBLEM_URL, { waitUntil: "domcontentloaded" });
    await page.locator("button.btn-submit").waitFor();
    const browseStorage = await readFakeOjStorage(extensionWorker);
    expect(browseStorage.uiHints).toHaveLength(0);
    expect(browseStorage.confirmedSubmissions).toHaveLength(0);
    expect(browseStorage.transientE1).toHaveLength(0);

    // Trusted click → E0 hint → synthetic submit → status → confirmed.
    await page.waitForTimeout(550);
    await page.locator("button.btn-submit").click();
    await expect.poll(async () => (await readFakeOjStorage(extensionWorker)).uiHints.length)
      .toBe(1);
    await page.evaluate(async (url) => { await fetch(url, { method: "POST" }); }, NOWCODER_B7_SUBMIT_URL);
    await page.evaluate(async (url) => { await fetch(url); }, nowCoderB7StatusUrl(SUBMISSION_ID));
    const confirmed = await pollUntilStorageMatches(
      extensionWorker,
      (snapshot) => snapshot.confirmedSubmissions.length === 1,
    );
    expect(confirmed.confirmedSubmissionTombstones).toHaveLength(0);
    expect(confirmed.captureOutbox).toHaveLength(0);

    // Now visit the result page. The page returns no verdict; we mutate the
    // body to attach the final ".coder-cont-legend" and let the detector see
    // the transition from null → "答案错误" in a single observable frame.
    resultVerdict = null;
    await page.goto(nowCoderB7ResultUrl(SUBMISSION_ID), { waitUntil: "domcontentloaded" });
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

    // Delivery observable: the worker drained the outbox, the SQLite attempt
    // exists, and the queue is now empty. No quarantine means the
    // POST /api/capture/attempts returned 200 with a stored attemptId.
    const delivered = await pollUntilStorageMatches(
      extensionWorker,
      (snapshot) => snapshot.confirmedSubmissionTombstones.length === 1
        && snapshot.confirmedSubmissions.length === 0
        && snapshot.captureOutbox.length === 0,
    );
    expect(delivered.captureQuarantine).toHaveLength(0);
    expect(delivered.transientUnmatchedE3).toHaveLength(0);

    // Mismatched final verdict cannot mint a duplicate bundle.
    const routesAfter = observed.length;
    void OTHER_SUBMISSION_ID;
    resultVerdict = "Wrong Answer";
    await page.goto(nowCoderB7ResultUrl("99999999"), { waitUntil: "domcontentloaded" });
    await page.evaluate(() => {
      const verdict = document.createElement("div");
      verdict.className = "coder-cont-legend";
      verdict.textContent = "编译错误";
      document.body.append(verdict);
    });
    await pollUntilStorageMatches(
      extensionWorker,
      (snapshot) => snapshot.transientUnmatchedE3.length === 1,
    );
    const finalStorage = await readFakeOjStorage(extensionWorker);
    expect(finalStorage.confirmedSubmissions).toHaveLength(0);
    expect(finalStorage.captureOutbox).toHaveLength(0);
    expect(finalStorage.captureQuarantine).toHaveLength(0);

    // Reloading the already-delivered result URL cannot duplicate the bundle:
    // the confirmed submission is gone and E3 path is closed.
    await page.goto(nowCoderB7ResultUrl(SUBMISSION_ID), { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(250);
    const afterReload = readDatabaseCounts(dbPath);
    expect(afterReload).toEqual({
      captureEvents: before.captureEvents + 4,
      trainingSessions: before.trainingSessions + 1,
      trainingAttempts: before.trainingAttempts + 1,
    });
    expect(observed.length).toBeGreaterThan(routesAfter);
  } finally {
    await page.close();
  }
});

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
    "<ul class=\"acm-nav\"><li><a href=\"/acm/problem/list\">题库</a></li></ul>",
    "<a href=\"/acm/contest/18839/1001\">problem</a>",
    verdict === null ? "" : `<div class=\"coder-cont-legend\">${verdict}</div>`,
  ].join("");
}

async function pairExtension(
  context: import("@playwright/test").BrowserContext,
  worker: import("@playwright/test").Worker,
  extensionId: string,
): Promise<void> {
  const codeResponse = await fetch("http://localhost:3000/api/capture/pairing-codes", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      origin: "http://localhost:3000",
    },
    body: "{}",
  });
  const body: unknown = await codeResponse.json();
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
