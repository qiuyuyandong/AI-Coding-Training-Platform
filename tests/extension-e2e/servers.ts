import type { BrowserContext } from "@playwright/test";

export const SYNTHETIC_PAGE_URL =
  "https://atcoder.jp/contests/capture-v4-spike/tasks/capture_v4_spike";
export const SYNTHETIC_SUBMISSION_URL =
  "https://atcoder.jp/__capture_v4_webrequest_spike__/submit";
export const SYNTHETIC_WRONG_URL =
  "https://atcoder.jp/__capture_v4_webrequest_spike__/other";
export const WORKER_DENIAL_PROBE_URL =
  "https://atcoder.jp/__capture_v4_network_denial_probe__";

export type NetworkDenialEvidence = {
  readonly fulfilled: string[];
  readonly denied: string[];
};

export async function installSyntheticNetwork(
  context: BrowserContext,
): Promise<NetworkDenialEvidence> {
  const fulfilled: string[] = [];
  const denied: string[] = [];
  await context.route("**/*", async (route) => {
    const request = route.request();
    const key = `${request.method()} ${request.url()}`;
    if (request.url().startsWith("chrome-extension://")) {
      await route.continue();
      return;
    }
    if (request.method() === "GET" && request.url() === SYNTHETIC_PAGE_URL) {
      fulfilled.push(key);
      await route.fulfill({
        status: 200,
        contentType: "text/html; charset=utf-8",
        body: "<!doctype html><title>V4 webRequest spike</title><main>synthetic</main>",
      });
      return;
    }
    if (request.url() === SYNTHETIC_SUBMISSION_URL
      || request.url() === SYNTHETIC_WRONG_URL) {
      fulfilled.push(key);
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: "{}",
      });
      return;
    }
    denied.push(key);
    await route.abort("blockedbyclient");
  });
  return { fulfilled, denied };
}
