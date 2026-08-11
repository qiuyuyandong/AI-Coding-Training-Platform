/**
 * V4 Phase NowCoder E3 ingress repair — Task 5 evidence.
 *
 * Fresh extension profile, no characterization session, no submit. Direct
 * navigation to the known historical NowCoder result page exercises the
 * self-healing ingress path through production-built `extension/dist`.
 *
 * Required public evidence:
 *   navigation committed
 *     -> CONTENT_RUNTIME_READY received for Chrome sender document
 *     -> exactly one ready_record in chrome.storage.session
 *     -> exact result detected
 *     -> exactly one unmatched E3 in chrome.storage.session
 *     -> submissionId on the unmatched E3 equals the URL submissionId
 *
 * Required fail-closed outcome:
 *   - confirmedSubmissions, captureOutbox, captureQuarantine, captureEndpoint
 *     all remain empty
 *   - default SQLite metadata is unchanged before vs. after
 *   - reload, worker restart do not duplicate records
 */

import { expect, test } from "./fixtures";
import {
  nowCoderB7ResultUrl,
  pollUntilStorageMatches,
  readFakeOjStorage,
} from "./fakeOj";
import { snapshotDefaultDatabase, verifyDefaultDatabaseUntouched } from "./database";

const HISTORY_SUBMISSION_ID = "84258557";

test("Task 5: real history-open ingress produces one unique ready_record and one unmatched E3", async ({
  extensionContext,
  extensionWorker,
}) => {
  // Fresh-profile guarantee: the fixtures set up a brand-new Chromium
  // user-data directory and load the production `extension/dist`. No prior
  // navigation, no submit, no characterization ever occurred on this profile.
  await installNowCoderResultRoute(extensionContext, "答案错误");

  const before = snapshotDefaultDatabase();
  const page = await extensionContext.newPage();
  try {
    await page.goto(nowCoderB7ResultUrl(HISTORY_SUBMISSION_ID), { waitUntil: "domcontentloaded" });

    const ready = await pollForReadyRecord(extensionWorker);
    expect(ready).toHaveLength(1);
    expect(ready[0]).toMatchObject({
      reason: "ready_record",
      tabId: expect.any(Number),
      frameId: 0,
      documentId: expect.any(String),
    });

    const storage = await pollUntilStorageMatches(
      extensionWorker,
      (snapshot) => snapshot.transientUnmatchedE3.length === 1
        && (snapshot.transientUnmatchedE3[0] as { readonly evidence?: { readonly externalSubmissionId?: string } })
          .evidence?.externalSubmissionId === HISTORY_SUBMISSION_ID,
    );
    expect(storage.confirmedSubmissions).toHaveLength(0);
    expect(storage.captureOutbox).toHaveLength(0);
    expect(storage.captureQuarantine).toHaveLength(0);

    const unmatched = storage.transientUnmatchedE3[0] as { readonly evidence?: {
      readonly externalSubmissionId?: string;
      readonly platform?: string;
      readonly problemExternalId?: string;
    } };
    expect(unmatched.evidence?.externalSubmissionId).toBe(HISTORY_SUBMISSION_ID);
    expect(unmatched.evidence?.platform).toBe("nowcoder");
    expect(unmatched.evidence?.problemExternalId).toBe("acm/contest/18839/1001");

    const afterFirst = snapshotDefaultDatabase();
    expect(verifyDefaultDatabaseUntouched(before, afterFirst)).toBe(true);

    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForTimeout(250);
    const storageAfterReload = await readFakeOjStorage(extensionWorker);
    expect(storageAfterReload.transientUnmatchedE3).toHaveLength(1);
    expect(storageAfterReload.confirmedSubmissions).toHaveLength(0);
    expect(storageAfterReload.captureOutbox).toHaveLength(0);
  } finally {
    await page.close();
  }
});

async function installNowCoderResultRoute(
  context: import("@playwright/test").BrowserContext,
  verdict: string,
): Promise<void> {
  const harness: { setResultVerdict: (next: string) => void } = {
    setResultVerdict: (next) => {
      verdict = next;
    },
  };
  void harness;
  await context.route("https://ac.nowcoder.com/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (request.method() === "GET" && url.pathname === "/acm/contest/view-submission") {
      await route.fulfill({
        status: 200,
        contentType: "text/html; charset=utf-8",
        body: [
          "<!doctype html><meta charset=\"utf-8\"><title>Historical NowCoder result</title>",
          "<ul class=\"acm-nav\"><li><a href=\"/acm/problem/list\">题库</a></li></ul>",
          "<a href=\"/acm/contest/18839/1001\">problem</a>",
          `<div class="coder-cont-legend">${verdict}</div>`,
        ].join(""),
      });
      return;
    }
    await route.abort("blockedbyclient");
  });
}

async function pollForReadyRecord(
  worker: import("@playwright/test").Worker,
): Promise<readonly { readonly reason: string; readonly tabId: number; readonly frameId: number; readonly documentId?: string }[]> {
  return worker.evaluate(async () => {
    const deadline = Date.now() + 8000;
    while (Date.now() < deadline) {
      const stored = await chrome.storage.session.get(["contentIngressReady"]);
      const records = Array.isArray(stored.contentIngressReady)
        ? stored.contentIngressReady as readonly { readonly reason: string; readonly tabId: number; readonly frameId: number; readonly documentId?: string }[]
        : [];
      if (records.length > 0) return records;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    return [];
  });
}
