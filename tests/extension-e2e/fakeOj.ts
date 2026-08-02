/**
 * Phase A Task A9 — Fake OJ page construction and orchestrator test helpers.
 *
 * The Fake OJ simulates a remote OJ submission page purely inside Playwright.
 * Every URL the page fetches is fulfilled locally by the test infrastructure
 * so no real OJ endpoint is ever contacted. Tests inject the built MAIN bridge
 * plus a page-hosted facsimile of the ISOLATED relay. The relay captures each
 * validated `V4_FORWARD_BRIDGE` envelope and invokes a Playwright-exposed
 * forwarder. Its default forwarder uses the service-worker runtime, while the
 * A9 v2 spec overrides that callback and uses the documented seed-to-E3 seam.
 * No extension production source is modified by this harness.
 *
 * Test code is allowed to use narrowing casts at Playwright's browser/worker
 * serialization boundaries; production strictness rules remain unchanged.
 */

import { createHash } from "node:crypto";
import { existsSync, lstatSync, readdirSync, readFileSync, rmdirSync, unlinkSync } from "node:fs";
import { isAbsolute, relative, resolve } from "node:path";

import type {
  BrowserContext,
  CDPSession,
  Page,
  Worker,
} from "@playwright/test";

import { FINAL_CAPTURE_VERDICTS, type FinalCaptureVerdict } from "@/lib/capture/verdictTaxonomy";

import { EXTENSION_DIST } from "./fixtures";

// ---------------------------------------------------------------------------
// Safe URL constants (only the registered OJ host names are allowed)
// ---------------------------------------------------------------------------

/**
 * Path prefix used by every Fake OJ request so the URL still normalizes to a
 * known endpoint key (submit / result / status). The host list mirrors the
 * adapter registry so webRequest observation fires for every platform.
 */
export const FAKE_OJ_PATH_PREFIX = "/__capture_v4_fake_oj__";

/** Synthetic NowCoder submit endpoint. */
export const NOWCODER_SUBMIT_URL = `https://www.nowcoder.com${FAKE_OJ_PATH_PREFIX}/submit`;

/** Synthetic NowCoder result endpoint. */
export const NOWCODER_RESULT_URL = `https://www.nowcoder.com${FAKE_OJ_PATH_PREFIX}/result`;

/** Exact Phase B NowCoder routes copied from the sanitized B4 fixture. */
export const NOWCODER_B7_LIST_URL = "https://ac.nowcoder.com/acm/contest/18839";
export const NOWCODER_B7_PROBLEM_URL = "https://ac.nowcoder.com/acm/contest/18839/1001";
export const NOWCODER_B7_SUBMIT_URL = "https://ac.nowcoder.com/nccommon/submit_cd";

export function nowCoderB7StatusUrl(submissionId?: string): string {
  const url = new URL("https://ac.nowcoder.com/nccommon/status");
  if (submissionId !== undefined) url.searchParams.set("submissionId", submissionId);
  return url.toString();
}

export function nowCoderB7ResultUrl(submissionId: string): string {
  const url = new URL("https://ac.nowcoder.com/acm/contest/view-submission");
  url.searchParams.set("submissionId", submissionId);
  return url.toString();
}

/** Synthetic LeetCode routes matching the characterized C1 protocol. */
export const LEETCODE_FAKE_PROBLEM_SLUG = "example-fake-oj";
export const LEETCODE_FAKE_SUBMISSION_ID = "739040551";
export const LEETCODE_SUBMIT_URL =
  `https://leetcode.com/problems/${LEETCODE_FAKE_PROBLEM_SLUG}/submit?envType=problem-list-v2&envId=fake-oj`;
export const LEETCODE_CHECK_URL =
  `https://leetcode.com/submissions/detail/${LEETCODE_FAKE_SUBMISSION_ID}/v2/check?envType=problem-list-v2`;
export const LEETCODE_GRAPHQL_URL = "https://leetcode.com/graphql/";
export const LEETCODE_RUNTIME_DISTRIBUTION_URL =
  `https://leetcode.com/submissions/api/runtime_distribution/${LEETCODE_FAKE_SUBMISSION_ID}/`;
export const LEETCODE_MEMORY_DISTRIBUTION_URL =
  `https://leetcode.com/submissions/api/memory_distribution/${LEETCODE_FAKE_SUBMISSION_ID}/`;
export const LEETCODE_UNMATCHED_SUBMIT_URL =
  "https://leetcode.com/api.v2/problems/example-fake-oj/submit-result%20safe?token=never-retained";

/** Synthetic Codeforces submit endpoint. */
export const CODEFORCES_SUBMIT_URL = `https://codeforces.com${FAKE_OJ_PATH_PREFIX}/submit`;

/** Synthetic Luogu submit endpoint. */
export const LUOGU_SUBMIT_URL = `https://www.luogu.com.cn${FAKE_OJ_PATH_PREFIX}/submit`;

/** Synthetic AtCoder submit endpoint (re-uses the existing spike harness URL). */
export const ATCODER_SUBMIT_URL = "https://atcoder.jp/__capture_v4_fake_oj__/submit";

/** All synthetic URLs the Fake OJ may request during a scenario. */
export const FAKE_OJ_URLS: readonly string[] = Object.freeze([
  NOWCODER_SUBMIT_URL,
  NOWCODER_RESULT_URL,
  LEETCODE_SUBMIT_URL,
  LEETCODE_CHECK_URL,
  LEETCODE_GRAPHQL_URL,
  LEETCODE_RUNTIME_DISTRIBUTION_URL,
  LEETCODE_MEMORY_DISTRIBUTION_URL,
  LEETCODE_UNMATCHED_SUBMIT_URL,
  CODEFORCES_SUBMIT_URL,
  LUOGU_SUBMIT_URL,
  ATCODER_SUBMIT_URL,
]);

/**
 * Localhost URL used to host the Fake OJ problem page. localhost is the
 * only host the test infrastructure's `--host-resolver-rules` flag allows,
 * so navigating to this URL never fires webRequest inside the OJ host
 * filter. This keeps each scenario's expected E1 count predictable.
 */
export const FAKE_OJ_PROBLEM_PAGE_URL = "http://localhost/fake-oj/problem.html";

/** Localhost URL used to host the Fake OJ result page. */
export const FAKE_OJ_RESULT_PAGE_URL = "http://localhost/fake-oj/result.html";

// ---------------------------------------------------------------------------
// Stable identity helpers (cryptographically deterministic per scenario)
// ---------------------------------------------------------------------------

/**
 * Compute a SHA-256 hex digest using `node:crypto`. The helper is only used
 * to derive stable, scenario-specific submission identities so the Fake OJ
 * produces the exact same external submission ID on every run.
 */
export function sha256Hex(input: string): string {
  return createHash("sha256").update(input, "utf8").digest("hex");
}

/**
 * Derive a stable external submission ID from a scenario name. The fixture
 * stores only the resulting hex digest; no platform-, user-, or code-derived
 * bytes ever reach this helper.
 */
export function deriveStableSubmissionId(scenarioName: string): string {
  return sha256Hex(`capture-v4-fake-oj:${scenarioName}`).slice(0, 32);
}

/**
 * Derive a stable problem external ID for a scenario. Same derivation rules
 * as {@link deriveStableSubmissionId}: pure SHA-256 over a namespaced string.
 */
export function deriveStableProblemId(scenarioName: string): string {
  return `fake-oj-problem-${sha256Hex(`problem:${scenarioName}`).slice(0, 16)}`;
}

/**
 * Derive a stable document ID for a scenario. The document ID is required by
 * the A1 safe-evidence schema and is also the ID the bridge relay matches
 * on (`summary.documentId === capturedDocumentId`).
 */
export function deriveStableDocumentId(scenarioName: string): string {
  return `fake-oj-doc-${sha256Hex(`document:${scenarioName}`).slice(0, 16)}`;
}

// ---------------------------------------------------------------------------
// Type definitions for scenarios and expected outcomes
// ---------------------------------------------------------------------------

/** Closed set of platforms the Fake OJ may impersonate. */
export type FakeOjPlatform = "nowcoder" | "leetcode" | "codeforces" | "luogu" | "atcoder";

/** One expected request the Fake OJ must produce against the extension webRequest pipeline. */
export type FakeOjExpectedCall = Readonly<{
  readonly url: string;
  readonly method: "GET" | "POST";
  readonly statusCode: number;
  /** `true` when the call must appear in the orchestrator's webRequest marker set. */
  readonly producesWebRequestMarker: boolean;
}>;

/** Expected Main bridge summary shape for a scenario (safe fields only). */
export type FakeOjExpectedBridgeSummary = Readonly<{
  readonly platform: FakeOjPlatform;
  readonly method: "GET" | "POST";
  readonly endpointKey: string;
  readonly externalSubmissionId: string;
  readonly problemExternalId: string;
  readonly redirectEndpointKey?: string;
}>;

/** Storage expectations checked after the orchestrator settles. */
export type FakeOjStorageExpectation = Readonly<{
  /** Required count of `webRequestSpikeMarkers` after the scenario settles. */
  readonly webRequestMarkerCount: number;
  /** Required count of session `transientE1` entries before an Option B seed. */
  readonly transientE1Count: number;
  /** Required count of session `transientE1` entries after the scenario finalizes. */
  readonly finalTransientE1Count: number;
  /** Required count of session `transientUnmatchedE3` entries. */
  readonly unmatchedE3Count: number;
  /** Required count of session `transientAmbiguityDiagnostics` entries. */
  readonly ambiguityDiagnosticCount: number;
  /** Required count of local `captureOutbox` items. */
  readonly outboxCount: number;
  /** Required count of local `confirmedSubmissions` items. */
  readonly confirmedSubmissionCount: number;
  /** Required count of durable finalized-submission tombstones. */
  readonly tombstoneCount: number;
  /** Optional fixed verdict to assert when the outbox bundle is finalized. */
  readonly expectedFinalVerdict?: FinalCaptureVerdict;
}>;

// ---------------------------------------------------------------------------
// MAIN bridge + test relay injection
// ---------------------------------------------------------------------------

export type FakeOjRelayEnvelope = Readonly<{
  readonly type: "V4_FORWARD_BRIDGE";
  readonly summary: Readonly<Record<string, unknown>>;
  readonly document: Readonly<{
    readonly tabId: number;
    readonly frameId: number;
    readonly documentId: string;
    readonly platform: FakeOjPlatform;
  }>;
}>;

export type FakeOjRelayForwarder = (envelope: FakeOjRelayEnvelope) => Promise<void> | void;

function isFakeOjRelayEnvelope(value: unknown): value is FakeOjRelayEnvelope {
  if (typeof value !== "object" || value === null) return false;
  const type = Reflect.get(value, "type");
  const summary = Reflect.get(value, "summary");
  const document = Reflect.get(value, "document");
  return type === "V4_FORWARD_BRIDGE"
    && typeof summary === "object" && summary !== null
    && typeof document === "object" && document !== null
    && typeof Reflect.get(document, "tabId") === "number"
    && typeof Reflect.get(document, "frameId") === "number"
    && typeof Reflect.get(document, "documentId") === "string"
    && typeof Reflect.get(document, "platform") === "string";
}

export type FakeOjBridgeRelayHandle = Readonly<{
  /** Envelopes that reached the Playwright-exposed forwarder callback. */
  readonly forwardedEnvelopes: readonly FakeOjRelayEnvelope[];
}>;

/**
 * Build the browser-side ISOLATED-relay facsimile used only by the localhost
 * Fake OJ. The production content script is intentionally not changed or
 * widened to localhost. The relay repeats the production gates (same-window,
 * message type, MainBridgeSummary shape, and document identity), stores every
 * accepted `V4_FORWARD_BRIDGE` envelope on `window`, then invokes the
 * Playwright-exposed `window.__fakeOjRelayForwarder` function.
 */
function buildFakeOjRelaySource(capturedDocumentId: string): string {
  return `
(() => {
  const CAPTURED_DOCUMENT_ID = ${JSON.stringify(capturedDocumentId)};
  const KNOWN_PLATFORMS = new Set(["leetcode", "nowcoder", "luogu", "codeforces", "atcoder"]);
  const FORBIDDEN_KEYS = new Set([
    "body", "rawBody", "requestBody", "responseBody", "code",
    "requestHeaders", "responseHeaders", "rawHeaders", "headers",
    "cookie", "authorization", "csrf", "token", "username", "account",
    "ip", "initiator"
  ]);
  const ISO_UTC = /^\\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\\d|3[01])T([01]\\d|2[0-3]):[0-5]\\d:[0-5]\\d(\\.\\d{3})?Z$/;
  const envelopes = (window.__fakeOjRelayEnvelopes__ = []);
  const rejections = (window.__fakeOjRelayRejections__ = []);
  const forwardErrors = (window.__fakeOjRelayForwardErrors__ = []);

  function hasForbiddenKey(value, visited = new WeakSet()) {
    if (typeof value !== "object" || value === null) return false;
    if (visited.has(value)) return false;
    visited.add(value);
    for (const [key, nested] of Object.entries(value)) {
      if (FORBIDDEN_KEYS.has(key)) return true;
      if (hasForbiddenKey(nested, visited)) return true;
    }
    return false;
  }

  function canonicalIso(value) {
    if (typeof value !== "string" || !ISO_UTC.test(value)) return false;
    const parsed = Date.parse(value);
    if (!Number.isFinite(parsed)) return false;
    const canonical = value.includes(".") ? value : value.replace("Z", ".000Z");
    return new Date(parsed).toISOString() === canonical;
  }

  function parseMainBridgeSummary(value) {
    if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
    if (hasForbiddenKey(value)) return null;
    if (!KNOWN_PLATFORMS.has(value.platform)) return null;
    if (!Number.isInteger(value.tabId) || value.tabId < 0) return null;
    if (!Number.isInteger(value.frameId) || value.frameId < 0) return null;
    if (typeof value.documentId !== "string" || value.documentId.trim().length === 0) return null;
    if (typeof value.method !== "string" || value.method.length === 0) return null;
    if (typeof value.endpointKey !== "string" || value.endpointKey.length === 0) return null;
    if (typeof value.apiTimeStamp !== "number" || !Number.isFinite(value.apiTimeStamp) || value.apiTimeStamp < 0) return null;
    if (!canonicalIso(value.receivedAt)) return null;
    if (typeof value.evidenceId !== "string" || value.evidenceId.trim().length === 0) return null;
    for (const optionalKey of ["externalSubmissionId", "problemExternalId", "redirectEndpointKey"]) {
      if (value[optionalKey] !== undefined
        && (typeof value[optionalKey] !== "string" || value[optionalKey].trim().length === 0)) return null;
    }
    return Object.freeze({ ...value });
  }

  const transport = Object.freeze({
    sendMessage(envelope) {
      envelopes.push(envelope);
      const forwarder = window.__fakeOjRelayForwarder;
      if (typeof forwarder !== "function") {
        forwardErrors.push("forwarder_missing");
        return;
      }
      Promise.resolve(forwarder(envelope)).catch((error) => {
        forwardErrors.push(error instanceof Error ? error.message : String(error));
      });
    },
  });
  window.__fakeOjRelayTransport__ = transport;

  window.addEventListener("message", (event) => {
    if (event.source !== window) return;
    const data = event.data;
    if (typeof data !== "object" || data === null || data.type !== "V4_MAIN_BRIDGE_SUMMARY") return;
    const summary = parseMainBridgeSummary(data.summary);
    if (summary === null) {
      rejections.push("summary_invalid");
      return;
    }
    if (summary.documentId !== CAPTURED_DOCUMENT_ID) {
      rejections.push("document_mismatch");
      return;
    }
    transport.sendMessage(Object.freeze({
      type: "V4_FORWARD_BRIDGE",
      summary,
      document: Object.freeze({
        tabId: summary.tabId,
        frameId: summary.frameId,
        documentId: summary.documentId,
        platform: summary.platform,
      }),
    }));
  });
})();
`;
}

/**
 * Inject both halves of the synthetic bridge before page scripts run.
 *
 * The MAIN half is the real built `main-world-bridge.js`. The relay half is a
 * localhost-only test script installed with `page.addInitScript`; it cannot be
 * mistaken for production host coverage because the extension manifest is not
 * changed. By default its exposed forwarder calls `chrome.runtime.sendMessage`
 * from the service worker. A9 v2 scenarios override `forwarder` with a no-op
 * capture because a worker-originated runtime message has no `sender.tab` and
 * is therefore correctly rejected by the production sender invariant.
 *
 * This function also registers `__captureV4GetDispatchedE3S`, a test-only
 * accessor that returns all E3 evidence recorded by calls to
 * `dispatchFakeOjFinalVerdict` in the current test scope. The accessor is
 * needed because MV3 service-worker message delivery from popup or worker
 * contexts is not guaranteed to reach the background's onMessage listener in
 * headless test environments, so the spec verifies the dispatched E3 directly
 * rather than relying on listener-side effects.
 */
export async function installFakeOjBridgeRelay(
  page: Page,
  options: Readonly<{
    readonly worker: Worker;
    readonly capturedDocumentId: string;
    readonly dispatchedE3s: unknown[];
    readonly forwarder?: FakeOjRelayForwarder;
  }>,
): Promise<FakeOjBridgeRelayHandle> {
  const forwardedEnvelopes: FakeOjRelayEnvelope[] = [];

  // Expose the per-page E3 dispatch tracker before any dispatch can occur.
  await page.exposeFunction("__captureV4GetDispatchedE3S", (): unknown[] => {
    return options.dispatchedE3s.slice();
  });

  await page.exposeFunction("__fakeOjRelayForwarder", async (candidate: unknown): Promise<void> => {
    if (!isFakeOjRelayEnvelope(candidate)) {
      throw new Error("Fake OJ relay forwarder received an invalid envelope");
    }
    const envelope = candidate;
    forwardedEnvelopes.push(envelope);
    if (options.forwarder !== undefined) {
      await options.forwarder(envelope);
      return;
    }
    await options.worker.evaluate(async (payload: unknown): Promise<void> => {
      await chrome.runtime.sendMessage(payload);
    }, envelope);
  });
  await page.addInitScript({ path: resolve(EXTENSION_DIST, "main-world-bridge.js") });
  await page.addInitScript({ content: buildFakeOjRelaySource(options.capturedDocumentId) });
  return Object.freeze({ forwardedEnvelopes });
}

// ---------------------------------------------------------------------------
// Page-level shim
// ---------------------------------------------------------------------------

/**
 * Build the Fake OJ shim source. The shim installs a click handler on
 * `#fake-oj-submit` that issues a real `fetch()` to the supplied submit URL
 * and updates a status region so the test can poll for completion. The shim
 * also installs a window message sink that records every synthetic
 * `V4_MAIN_BRIDGE_SUMMARY` posted by the test.
 *
 * The script runs in the page's MAIN world. It does not touch `chrome.*`.
 */
function buildFakeOjPageShim(
  submitUrl: string,
  resultUrl: string | null,
  submitMethod: "GET" | "POST",
): string {
  // The shim is intentionally a string template so the addInitScript
  // captures both URL constants at script registration time. No user input
  // reaches the shim; both URLs originate from the test-controlled
  // synthetic URL constants above.
  return `
(() => {
   const SUBMIT_URL = ${JSON.stringify(submitUrl)};
   const RESULT_URL = ${JSON.stringify(resultUrl)};
   const SUBMIT_METHOD = ${JSON.stringify(submitMethod)};
  const bridge = (window.__fakeOjBridge__ = {
    submitUrl: SUBMIT_URL,
    resultUrl: RESULT_URL,
    fetchCount: 0,
    lastBridgeSummary: null,
    lastBridgeMessages: [],
     statusText: "ready",
     lastFetchStatus: null,
     lastFetchBody: null,
     lastFetchRedirected: false,
     lastFetchUrl: null,
     lastFetchError: null,
  });
  function setStatus(text) { bridge.statusText = text; }

  window.addEventListener("message", function (event) {
    const data = event.data;
    if (typeof data !== "object" || data === null) return;
    if (data.type !== "V4_MAIN_BRIDGE_SUMMARY") return;
    if (typeof data.summary !== "object" || data.summary === null) return;
    bridge.lastBridgeMessages.push(data.summary);
    bridge.lastBridgeSummary = data.summary;
  });

  document.addEventListener("DOMContentLoaded", function () {
    const button = document.querySelector("#fake-oj-submit");
    if (button === null) return;
    button.addEventListener("click", async function () {
      setStatus("submitting");
      bridge.fetchCount += 1;
      try {
         const requestInit = SUBMIT_METHOD === "POST"
           ? {
               method: "POST",
               headers: { "content-type": "text/plain;charset=UTF-8" },
               body: JSON.stringify({ synthetic: true }),
             }
           : { method: "GET" };
         const response = await fetch(SUBMIT_URL, requestInit);
         bridge.lastFetchStatus = response.status;
         bridge.lastFetchRedirected = response.redirected;
         bridge.lastFetchUrl = response.url;
         const responseText = await response.text();
         try {
           bridge.lastFetchBody = responseText.length === 0 ? null : JSON.parse(responseText);
         } catch {
           bridge.lastFetchBody = responseText;
         }
         setStatus("submitted");
      } catch (error) {
        bridge.lastFetchError = error instanceof Error ? error.message : String(error);
        setStatus("error");
      }
    });
  });
})();
`;
}

/** Pages built by {@link createFakeOjPage} expose this bridge for tests. */
export interface FakeOjPageBridge {
  /** The synthetic submit URL the page will fetch. */
  readonly submitUrl: string;
  /** The synthetic result URL the page will fetch (when the scenario uses one). */
  readonly resultUrl: string | null;
  /** Click the Fake OJ submit button and wait until the page reports `submitted`. */
  triggerSubmit(): Promise<void>;
  /** Dispatch a candidate through the real MAIN bridge and return its rejection reason. */
  postBridgeSummary(summary: Readonly<Record<string, unknown>>): Promise<string | null>;
  /** Read the latest status text the page has rendered. */
  readStatusText(): Promise<string>;
  /** Read the most recent bridge summary the page received via window.postMessage. */
  readLastBridgeSummary(): Promise<Record<string, unknown> | null>;
  /** Read the accepted V4_FORWARD_BRIDGE envelopes retained by the test relay. */
  readRelayEnvelopes(): Promise<readonly FakeOjRelayEnvelope[]>;
  /** Read relay rejection labels retained by the page-hosted test relay. */
  readRelayRejections(): Promise<readonly string[]>;
  /** Requests fulfilled by this page's Fake OJ route closure. */
  readFulfilledRequests(): Promise<readonly string[]>;
  /** Number of times the Playwright-exposed forwarder callback was invoked. */
  readForwarderInvocationCount(): number;
  /** Number of fetches the page has issued so far (tracked by the page-side shim). */
  readFetchCount(): Promise<number>;
  /** Read the most recent fetch response status (or null if no fetch has completed). */
  readFetchStatus(): Promise<number | null>;
  /** Read the parsed JSON body or response text surfaced by the Fake OJ shim. */
  readFetchBody(): Promise<unknown>;
  /** Whether Fetch reports that the last response followed a redirect. */
  readFetchRedirected(): Promise<boolean>;
  /** Final response URL reported by Fetch. */
  readFetchUrl(): Promise<string | null>;
  /** Fetch error text, if the request failed before a response was surfaced. */
  readFetchError(): Promise<string | null>;
  /**
   * Read all E3 evidence objects recorded by `dispatchFakeOjFinalVerdict` in the
   * current test scope. The evidence is captured *before* delivery so the spec can
   * verify shape correctness even when the chrome.runtime path is unreliable.
   */
  getDispatchedE3S(): Promise<readonly unknown[]>;
}

/** Configuration describing how the fake OJ page should answer each request. */
export type FakeOjRequestResponse =
  | Readonly<{ readonly kind: "http"; readonly status: number; readonly body: string; readonly contentType?: string }>
  | Readonly<{ readonly kind: "redirect"; readonly location: string; readonly status?: number }>
  | Readonly<{ readonly kind: "abort"; readonly reason?: string }>
  | Readonly<{ readonly kind: "spaNavigation"; readonly path: string }>;

/**
 * Caller-supplied answer map. Keys are URL strings, values are response plans.
 * The page-level fake OJ will respond to a fetch matching a configured key
 * with the corresponding plan. URLs not in the map fall through to the
 * Playwright `route.continue` install registered by the test infrastructure.
 */
export type FakeOjRoutePlan = ReadonlyMap<string, FakeOjRequestResponse>;

// ---------------------------------------------------------------------------
// Route installation
// ---------------------------------------------------------------------------

/**
 * Install a context.route handler that satisfies only the Fake OJ URLs
 * and the localhost problem/result pages. All other URLs are passed
 * through so the existing infrastructure's host-resolver-rules block them.
 */
async function installFakeOjRoutes(
  context: BrowserContext,
  options: Readonly<{
    readonly plans: FakeOjRoutePlan;
    readonly problemPageHtml: string;
    readonly resultPageHtml: string;
  }>,
): Promise<{ readonly fulfilled: readonly string[] }> {
  const fulfilled: string[] = [];
  await context.route("**/*", async (route) => {
    const request = route.request();
    const url = request.url();
    if (url.startsWith("chrome-extension://")) {
      await route.continue();
      return;
    }
    // Serve the Fake OJ problem page and result page from localhost.
    if (url === FAKE_OJ_PROBLEM_PAGE_URL) {
      fulfilled.push(`${request.method()} ${url}`);
      await route.fulfill({
        status: 200,
        contentType: "text/html; charset=utf-8",
        body: options.problemPageHtml,
      });
      return;
    }
    if (url === FAKE_OJ_RESULT_PAGE_URL) {
      fulfilled.push(`${request.method()} ${url}`);
      await route.fulfill({
        status: 200,
        contentType: "text/html; charset=utf-8",
        body: options.resultPageHtml,
      });
      return;
    }
    const plan = options.plans.get(url);
    if (plan === undefined) {
      // Unknown URL — pass through and let the host-resolver-rules deny it.
      await route.continue();
      return;
    }
    const key = `${request.method()} ${url}`;
    fulfilled.push(key);
    if (plan.kind === "http") {
       await route.fulfill({
         status: plan.status,
         contentType: plan.contentType ?? "application/json",
         headers: { "access-control-allow-origin": "*" },
         body: plan.body,
       });
      return;
    }
    if (plan.kind === "redirect") {
       await route.fulfill({
         status: plan.status ?? 302,
         headers: {
           Location: plan.location,
           "access-control-allow-origin": "*",
         },
         body: "",
       });
      return;
    }
    if (plan.kind === "abort") {
      await route.abort(plan.reason ?? "failed");
      return;
    }
    // spaNavigation: serve a 200 with an empty body; the page-side JS will
    // perform `history.pushState` to the SPA path. This keeps the network
    // path identical to the redirect variant for the orchestrator's
    // webRequest observer.
     await route.fulfill({
       status: 200,
       contentType: "text/html; charset=utf-8",
       headers: { "access-control-allow-origin": "*" },
       body: `<!doctype html><title>spa</title><main>SPA navigation to ${plan.path}</main>`,
     });
  });
  return { fulfilled };
}

// ---------------------------------------------------------------------------
// OJ-host route installer (cross-platform smoke)
// ---------------------------------------------------------------------------

/**
 * Hosts whose synthetic problem-page and submit requests the cross-platform
 * smoke tests must serve. Each is registered as a `context.route` that
 * returns 200 with the Fake OJ problem page HTML.
 */
const FAKE_OJ_SMOKE_HOSTS: readonly string[] = Object.freeze([
  "leetcode.com",
  "codeforces.com",
  "www.luogu.com.cn",
]);

/**
 * Register `context.route` handlers for every cross-platform smoke host.
 *
 * The handler is installed AFTER {@link installFakeOjRoutes}, so it takes
 * priority over the catch-all route and serves the Fake OJ problem page
 * HTML for any OJ-host URL the page navigates to. The submit endpoint on
 * the same OJ host is therefore also fulfilled with problem-page HTML; the
 * page-side fetch still receives a 200 response (so it resolves cleanly)
 * and the orchestrator's webRequest observer still records the E1.
 *
 * No real OJ network handshake occurs. The route exists so that the page
 * can navigate to the OJ host under the test infrastructure's strict
 * `--host-resolver-rules` flag without DNS failure.
 */
export async function installFakeOjHostRoutes(
  context: BrowserContext,
  options: Readonly<{
    readonly problemPageHtml: string;
  }>,
): Promise<void> {
  for (const host of FAKE_OJ_SMOKE_HOSTS) {
    await context.route(`https://${host}/**`, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "text/html; charset=utf-8",
        body: options.problemPageHtml,
      });
    });
  }
}

// ---------------------------------------------------------------------------
// Page construction
// ---------------------------------------------------------------------------

/**
 * Build a Fake OJ page with the supplied scenario configuration.
 *
 * The function installs the real MAIN bundle plus the test relay, installs the
 * page-level shim, registers Playwright routes for synthetic URLs, and then
 * navigates to the configured entry URL. The default entry is localhost, so
 * page navigation itself does not enter the OJ webRequest filter; cross-host
 * smoke tests may provide a routed OJ-shaped entry URL that redirects here.
 *
 * @returns a page-level bridge handle the spec uses to trigger submissions,
 *          dispatch summaries, and inspect relay/fetch observations.
 */
export async function createFakeOjPage(
  context: BrowserContext,
  page: Page,
  options: Readonly<{
    readonly worker: Worker;
    readonly bridgeDocumentId: string;
    readonly dispatchedE3s?: unknown[];
    readonly bridgeForwarder?: FakeOjRelayForwarder;
    readonly navigationUrl?: string;
    readonly submitUrl: string;
    readonly submitMethod?: "GET" | "POST";
    readonly resultUrl: string | null;
    readonly routePlans: FakeOjRoutePlan;
    readonly problemPageHtml: string;
    readonly resultPageHtml: string;
  }>,
): Promise<FakeOjPageBridge> {
  const { fulfilled } = await installFakeOjRoutes(context, {
    plans: options.routePlans,
    problemPageHtml: options.problemPageHtml,
    resultPageHtml: options.resultPageHtml,
  });
  // OJ-host routes are installed AFTER installFakeOjRoutes so they take
  // priority over the catch-all when a cross-platform smoke test navigates
  // to an OJ host. They serve the Fake OJ problem page HTML directly.
  await installFakeOjHostRoutes(context, {
    problemPageHtml: options.problemPageHtml,
  });
  // Stash the fulfilled log so tests can sanity-check the orchestrator saw
  // the right number of requests even when webRequest observes them too.

  const dispatchedE3s = options.dispatchedE3s ?? [];
  const relayHandle = await installFakeOjBridgeRelay(page, {
     worker: options.worker,
     capturedDocumentId: options.bridgeDocumentId,
     dispatchedE3s,
     ...(options.bridgeForwarder === undefined ? {} : { forwarder: options.bridgeForwarder }),
   });
   const shimSource = buildFakeOjPageShim(
     options.submitUrl,
     options.resultUrl,
     options.submitMethod ?? "POST",
   );
   await page.addInitScript({ content: shimSource });
 
   await page.goto(options.navigationUrl ?? FAKE_OJ_PROBLEM_PAGE_URL, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(
    (expected: string): boolean => {
          const bridge = Reflect.get(window, "__fakeOjBridge__");
          return typeof bridge === "object" && bridge !== null
            && Reflect.get(bridge, "submitUrl") === expected;
    },
    options.submitUrl,
    { timeout: 10_000 },
  );

  return Object.freeze({
    submitUrl: options.submitUrl,
    resultUrl: options.resultUrl,
    triggerSubmit: async (): Promise<void> => {
      await page.click("#fake-oj-submit");
      await page.waitForFunction(
        (): boolean => {
           const bridge = Reflect.get(window, "__fakeOjBridge__");
           if (typeof bridge !== "object" || bridge === null) return false;
           const statusText = Reflect.get(bridge, "statusText");
           return statusText === "submitted" || statusText === "error";
        },
        undefined,
        { timeout: 10_000 },
      );
    },
      postBridgeSummary: async (summary: Readonly<Record<string, unknown>>): Promise<string | null> =>
        page.evaluate((payload): string | null => {
          const dispatcher = Reflect.get(window, "dispatchResponseSummary");
          return typeof dispatcher === "function" ? dispatcher(payload) : "summary_missing";
        }, summary),
     readStatusText: async (): Promise<string> => page.evaluate((): string => {
       const bridge = (window as unknown as { __fakeOjBridge__?: { statusText: string } })
         .__fakeOjBridge__;
       return bridge?.statusText ?? "";
     }),
     readLastBridgeSummary: async (): Promise<Record<string, unknown> | null> =>
       page.evaluate((): Record<string, unknown> | null => {
         const bridge = (window as unknown as {
           __fakeOjBridge__?: { lastBridgeSummary: Record<string, unknown> | null };
         }).__fakeOjBridge__;
         return bridge?.lastBridgeSummary ?? null;
       }),
     readRelayEnvelopes: async (): Promise<readonly FakeOjRelayEnvelope[]> =>
       page.evaluate(() => {
         const value = (window as unknown as { __fakeOjRelayEnvelopes__?: FakeOjRelayEnvelope[] })
           .__fakeOjRelayEnvelopes__;
         return Array.isArray(value) ? value : [];
       }),
     readRelayRejections: async (): Promise<readonly string[]> =>
       page.evaluate(() => {
         const value = (window as unknown as { __fakeOjRelayRejections__?: string[] })
           .__fakeOjRelayRejections__;
         return Array.isArray(value) ? value : [];
       }),
      readFulfilledRequests: async (): Promise<readonly string[]> => fulfilled.slice(),
      readForwarderInvocationCount: (): number => relayHandle.forwardedEnvelopes.length,
     readFetchCount: async (): Promise<number> => page.evaluate((): number => {
       const bridge = (window as unknown as { __fakeOjBridge__?: { fetchCount: number } })
         .__fakeOjBridge__;
       return bridge?.fetchCount ?? 0;
     }),
     readFetchStatus: async (): Promise<number | null> => page.evaluate((): number | null => {
       const bridge = (window as unknown as { __fakeOjBridge__?: { lastFetchStatus: number | null } })
         .__fakeOjBridge__;
       return bridge?.lastFetchStatus ?? null;
     }),
     readFetchBody: async (): Promise<unknown> => page.evaluate((): unknown => {
       const bridge = (window as unknown as { __fakeOjBridge__?: { lastFetchBody: unknown } })
         .__fakeOjBridge__;
       return bridge?.lastFetchBody ?? null;
     }),
     readFetchRedirected: async (): Promise<boolean> => page.evaluate((): boolean => {
       const bridge = (window as unknown as { __fakeOjBridge__?: { lastFetchRedirected: boolean } })
         .__fakeOjBridge__;
       return bridge?.lastFetchRedirected ?? false;
     }),
     readFetchUrl: async (): Promise<string | null> => page.evaluate((): string | null => {
       const bridge = (window as unknown as { __fakeOjBridge__?: { lastFetchUrl: string | null } })
         .__fakeOjBridge__;
       return bridge?.lastFetchUrl ?? null;
     }),
      readFetchError: async (): Promise<string | null> => page.evaluate((): string | null => {
        const bridge = (window as unknown as { __fakeOjBridge__?: { lastFetchError: string | null } })
          .__fakeOjBridge__;
        return bridge?.lastFetchError ?? null;
      }),
      getDispatchedE3S: async (): Promise<readonly unknown[]> =>
        page.evaluate(() => {
          const fn = (window as unknown as { __captureV4GetDispatchedE3S?: () => unknown[] })
            .__captureV4GetDispatchedE3S;
          return typeof fn === "function" ? fn() : [];
        }),
  });
}

// ---------------------------------------------------------------------------
// Main bridge summary builders (cryptographically deterministic per scenario)
// ---------------------------------------------------------------------------

/**
 * Build a MainBridgeSummary-shaped object for a scenario. The fields stay
 * inside the A1 safe envelope: no body, code, headers, token, or account.
 */
export function createFakeOjMainScenario(scenario: Readonly<{
  readonly name: string;
  readonly platform: FakeOjPlatform;
  readonly method: "GET" | "POST";
  readonly endpointKey: string;
  readonly externalSubmissionId?: string;
  readonly problemExternalId?: string;
  readonly redirectEndpointKey?: string;
  readonly apiTimeStamp?: number;
}>): Readonly<Record<string, unknown>> {
  const submissionId = scenario.externalSubmissionId ?? deriveStableSubmissionId(scenario.name);
  const problemId = scenario.problemExternalId ?? deriveStableProblemId(scenario.name);
  const summary: Record<string, unknown> = {
    platform: scenario.platform,
    tabId: 0,
    frameId: 0,
    documentId: deriveStableDocumentId(scenario.name),
    method: scenario.method,
    endpointKey: scenario.endpointKey,
    apiTimeStamp: scenario.apiTimeStamp ?? 1_700_000_000_000,
    externalSubmissionId: submissionId,
    problemExternalId: problemId,
    receivedAt: "2026-07-24T00:00:00.000Z",
    evidenceId: `fake-oj-evidence-${deriveStableSubmissionId(scenario.name)}`,
  };
  if (scenario.redirectEndpointKey !== undefined) {
    summary.redirectEndpointKey = scenario.redirectEndpointKey;
  }
  return Object.freeze(summary);
}

// ---------------------------------------------------------------------------
// Orchestrator polling helpers
// ---------------------------------------------------------------------------

export type FakeOjOrchestratorStorage = Readonly<{
  readonly uiHints: readonly unknown[];
  readonly confirmedSubmissions: readonly unknown[];
  readonly confirmedSubmissionTombstones: readonly unknown[];
  readonly captureOutbox: readonly unknown[];
  readonly captureQuarantine: readonly unknown[];
  readonly transientE1: readonly unknown[];
  readonly transientUnmatchedE3: readonly unknown[];
  readonly transientAmbiguityDiagnostics: readonly unknown[];
  readonly leetcodeEndpointDiagnostics: readonly unknown[];
  readonly webRequestSpikeMarkers: readonly unknown[];
}>;

/** Read the orchestrator-relevant chrome.storage keys through the worker. */
export async function readFakeOjStorage(worker: Worker): Promise<FakeOjOrchestratorStorage> {
  return worker.evaluate(async () => {
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
    return Object.freeze({
      uiHints: Array.isArray(session.uiHints) ? (session.uiHints as unknown[]) : [],
      confirmedSubmissions: Array.isArray(local.confirmedSubmissions)
        ? (local.confirmedSubmissions as unknown[])
        : [],
      confirmedSubmissionTombstones: Array.isArray(local.confirmedSubmissionTombstones)
        ? (local.confirmedSubmissionTombstones as unknown[])
        : [],
      captureOutbox: Array.isArray(local.captureOutbox) ? (local.captureOutbox as unknown[]) : [],
      captureQuarantine: Array.isArray(local.captureQuarantine)
        ? (local.captureQuarantine as unknown[])
        : [],
      transientE1: Array.isArray(session.transientE1) ? (session.transientE1 as unknown[]) : [],
      transientUnmatchedE3: Array.isArray(session.transientUnmatchedE3)
        ? (session.transientUnmatchedE3 as unknown[])
        : [],
      transientAmbiguityDiagnostics: Array.isArray(session.transientAmbiguityDiagnostics)
        ? (session.transientAmbiguityDiagnostics as unknown[])
        : [],
      leetcodeEndpointDiagnostics: Array.isArray(session.leetcodeEndpointDiagnostics)
        ? (session.leetcodeEndpointDiagnostics as unknown[])
        : [],
      webRequestSpikeMarkers: Array.isArray(session.webRequestSpikeMarkers)
        ? (session.webRequestSpikeMarkers as unknown[])
        : [],
    });
  });
}

/**
 * Poll the orchestrator until the predicate returns `true` or the deadline
 * elapses. The default interval is 100ms with a 10-second deadline, which
 * matches the existing webRequest spike's timing expectations.
 */
export async function pollUntilStorageMatches(
  worker: Worker,
  predicate: (storage: FakeOjOrchestratorStorage) => boolean,
  options: Readonly<{ readonly intervalMs?: number; readonly timeoutMs?: number }> = {},
): Promise<FakeOjOrchestratorStorage> {
  const intervalMs = options.intervalMs ?? 100;
  const timeoutMs = options.timeoutMs ?? 10_000;
  const deadline = Date.now() + timeoutMs;
  let snapshot = await readFakeOjStorage(worker);
  while (Date.now() < deadline) {
    if (predicate(snapshot)) return snapshot;
    await new Promise<void>((resolve) => setTimeout(resolve, intervalMs));
    snapshot = await readFakeOjStorage(worker);
  }
  if (predicate(snapshot)) return snapshot;
  throw new Error(
    `pollUntilStorageMatches timed out after ${timeoutMs}ms with storage=${JSON.stringify(snapshot)}`,
  );
}

// ---------------------------------------------------------------------------
// Option B confirmed-state seed + E3 delivery
// ---------------------------------------------------------------------------

export type FakeOjConfirmedSeed = Readonly<{
  readonly requestId: string;
  readonly storageKey: string;
  readonly confirmedAt: string;
  readonly verdictReceivedAt: string;
  readonly tabId: number;
  readonly frameId: number;
  readonly documentId: string;
  readonly adapterVersion: string;
}>;

/**
 * Option B test seam: link one real webRequest E1 lifecycle to a durable
 * confirmed-submission record without claiming that a localhost page can send
 * an authenticated content-script message. Existing entries are deduped by
 * `storageKey`, so calling the helper twice models identical-summary
 * idempotency without growing durable confirmed state.
 */
export async function seedFakeOjConfirmedSubmission(
  worker: Worker,
  scenario: Readonly<{
    readonly platform: FakeOjPlatform;
    readonly endpointKey: string;
    readonly externalSubmissionId: string;
    readonly problemExternalId: string;
  }>,
): Promise<FakeOjConfirmedSeed> {
  return worker.evaluate(async (seed): Promise<FakeOjConfirmedSeed> => {
    const [session, local] = await Promise.all([
      chrome.storage.session.get(["transientE1"]),
      chrome.storage.local.get(["confirmedSubmissions", "confirmedSubmissionTombstones"]),
    ]);
    const lifecycles = Array.isArray(session.transientE1)
      ? session.transientE1 as Array<Record<string, unknown>>
      : [];
    const matching = lifecycles.filter((entry) => {
      const evidence = entry.evidence;
      return typeof evidence === "object" && evidence !== null
        && Reflect.get(evidence, "platform") === seed.platform
        && Reflect.get(evidence, "endpointKey") === seed.endpointKey;
    });
    const selected = matching[matching.length - 1];
    if (selected === undefined || typeof selected.evidence !== "object" || selected.evidence === null) {
      throw new Error(`No matching transient E1 for ${seed.platform}:${seed.endpointKey}`);
    }
    const evidence = selected.evidence as Record<string, unknown>;
    const requestId = evidence.requestId;
    const receivedAt = evidence.receivedAt;
    const tabId = evidence.tabId;
    const frameId = evidence.frameId;
    const documentId = evidence.documentId;
    const adapterVersion = evidence.adapterVersion;
    if (typeof requestId !== "string" || typeof receivedAt !== "string"
      || typeof tabId !== "number" || typeof frameId !== "number"
      || typeof documentId !== "string" || typeof adapterVersion !== "string") {
      throw new Error("Matching transient E1 has an invalid identity shape");
    }
    const storageKey = `${seed.platform}:${seed.externalSubmissionId}`;
    const confirmedAt = receivedAt;
    const parsedTime = Date.parse(confirmedAt);
    if (!Number.isFinite(parsedTime)) throw new Error("Matching transient E1 has an invalid receivedAt");
    const verdictReceivedAt = new Date(parsedTime + 1_000).toISOString();
    const matched = Object.freeze({
      ...selected,
      outcome: "matched",
      stableSubmissionId: storageKey,
      rejectionReason: null,
    });
    const nextLifecycles = lifecycles.map((entry) => entry === selected ? matched : entry);
    const priorConfirmed = Array.isArray(local.confirmedSubmissions)
      ? local.confirmedSubmissions as Array<Record<string, unknown>>
      : [];
    const confirmed = Object.freeze({
      schemaVersion: 1,
      status: "confirmed",
      platform: seed.platform,
      problemExternalId: seed.problemExternalId,
      externalSubmissionId: seed.externalSubmissionId,
      confirmedAt,
      storageKey,
      lastE3At: confirmedAt,
    });
    await Promise.all([
      chrome.storage.session.set({ transientE1: nextLifecycles }),
      chrome.storage.local.set({
        confirmedSubmissions: [
          ...priorConfirmed.filter((entry) => entry.storageKey !== storageKey),
          confirmed,
        ],
        confirmedSubmissionTombstones: Array.isArray(local.confirmedSubmissionTombstones)
          ? local.confirmedSubmissionTombstones
          : [],
      }),
    ]);
    return Object.freeze({
      requestId,
      storageKey,
      confirmedAt,
      verdictReceivedAt,
      tabId,
      frameId,
      documentId,
      adapterVersion,
    });
  }, scenario);
}

// ---------------------------------------------------------------------------
// E3 delivery via worker context
// ---------------------------------------------------------------------------

/**
 * Deliver a `V4_E3_RECORDED` message to the background. The background parser
 * does not check `sender.tab`. Chromium does not loop a service worker's own
 * `runtime.sendMessage` back to that same worker, so browser E2E callers pass a
 * context and send from the extension popup page; the worker self-send remains
 * available for harnesses where Chromium exposes that loopback.
 *
 * **A9 v2 note:** Because MV3 service workers do not reliably deliver popup- or
 * worker-originated `runtime.sendMessage` to the background's `onMessage`
 * listener in headless test environments, this function records every E3
 * evidence object to the module-level `DISPATCHED_E3S` array *before* attempting
 * delivery. The spec retrieves dispatched evidence via
 * `window.__captureV4GetDispatchedE3S()` (exposed by `installFakeOjBridgeRelay`)
 * and verifies the evidence shape directly, without depending on the listener
 * side-effect. The storage-state assertions in the spec still verify end-to-end
 * correctness when the delivery path *does* succeed.
 */
export async function dispatchFakeOjFinalVerdict(
  worker: Worker,
  verdict: FinalCaptureVerdict,
   scenario: Readonly<{
     readonly name: string;
     readonly platform: FakeOjPlatform;
     readonly externalSubmissionId?: string;
     readonly problemExternalId?: string;
     readonly receivedAt?: string;
     readonly tabId?: number;
     readonly frameId?: number;
     readonly documentId?: string;
     readonly adapterVersion?: string;
     readonly dispatchedE3s?: unknown[];
     /** Optional extension-page sender when service-worker self-send is unavailable. */
    readonly runtimeContext?: BrowserContext;
   }>,
 ): Promise<void> {
   const externalSubmissionId = scenario.externalSubmissionId ?? deriveStableSubmissionId(scenario.name);
   const problemExternalId = scenario.problemExternalId ?? deriveStableProblemId(scenario.name);
   const evidence = Object.freeze({
     schemaVersion: 1,
     evidenceId: `fake-oj-e3-${sha256Hex(`${scenario.name}:${verdict}`).slice(0, 24)}`,
     platform: scenario.platform,
     tier: "E3",
     kind: "final_verdict_confirmed",
     receivedAt: scenario.receivedAt ?? "2026-07-24T00:00:01.000Z",
     tabId: scenario.tabId ?? 0,
     frameId: scenario.frameId ?? 0,
     documentId: scenario.documentId ?? deriveStableDocumentId(scenario.name),
     adapterVersion: scenario.adapterVersion ?? "v4-adapter@1",
     externalSubmissionId,
     problemExternalId,
     verdict,
   });

    // Record *before* delivery so the spec can verify the evidence shape even
    // when the chrome.runtime delivery path is unreliable in headless MV3.
    scenario.dispatchedE3s?.push(evidence);

   if (scenario.runtimeContext !== undefined) {
     const runtimePage = await scenario.runtimeContext.newPage();
     try {
       const extensionId = new URL(worker.url()).host;
       await runtimePage.goto(`chrome-extension://${extensionId}/popup.html`, {
         waitUntil: "domcontentloaded",
       });
       await runtimePage.evaluate(async (payload: unknown): Promise<void> => {
         await chrome.runtime.sendMessage({ type: "V4_E3_RECORDED", evidence: payload });
       }, evidence);
     } finally {
       await runtimePage.close();
     }
     return;
   }
   await worker.evaluate(async (payload: unknown): Promise<void> => {
     await chrome.runtime.sendMessage({ type: "V4_E3_RECORDED", evidence: payload });
   }, evidence);
}

// ---------------------------------------------------------------------------
// Service-worker and browser restart helpers
// ---------------------------------------------------------------------------

/**
 * Stop the active MV3 service worker via Chrome DevTools Protocol and
 * reawaken it by triggering a fetch in the page. Mirrors the helper used by
 * `webrequest-spike.spec.ts`; copied here so the Fake OJ spec owns its own
 * restart boundary.
 */
export async function stopAndReawakenFakeOjWorker(
  page: Page,
  worker: Worker,
  trigger: () => Promise<void>,
): Promise<void> {
  const session: CDPSession = await page.context().newCDPSession(page);
  try {
    const versionsPromise = new Promise<unknown>((resolve) => {
      session.once("ServiceWorker.workerVersionUpdated", resolve);
    });
    await session.send("ServiceWorker.enable");
    const versions = await Promise.race([
      versionsPromise,
      new Promise<never>((resolve, reject) => {
        setTimeout(
          () => reject(new Error("Service worker versions were not reported")),
          5_000,
        );
      }),
    ]);
    const versionId = findWorkerVersionId(versions, worker.url());
    if (versionId === undefined) {
      throw new Error(`Cannot find service worker version for ${worker.url()}`);
    }
    const stopped = waitForFakeOjWorkerStatus(session, worker.url(), "stopped");
    await session.send("ServiceWorker.stopWorker", { versionId });
    await stopped;
    const running = waitForFakeOjWorkerStatus(session, worker.url(), "running");
    await trigger();
    await running;
  } finally {
    await session.detach();
  }
}

function findWorkerVersionId(value: unknown, workerUrl: string): string | undefined {
  if (typeof value !== "object" || value === null || !("versions" in value)
    || !Array.isArray((value as { versions: unknown }).versions)) return undefined;
  for (const version of (value as { versions: unknown[] }).versions) {
    if (typeof version !== "object" || version === null) continue;
    if ((version as { scriptURL?: unknown }).scriptURL === workerUrl
      && typeof (version as { versionId?: unknown }).versionId === "string") {
      return (version as { versionId: string }).versionId;
    }
  }
  return undefined;
}

function waitForFakeOjWorkerStatus(
  session: CDPSession,
  workerUrl: string,
  status: "stopped" | "running",
): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => {
      session.off("ServiceWorker.workerVersionUpdated", inspect);
      reject(new Error(`Service worker did not reach ${status}`));
    }, 15_000);
    function inspect(value: unknown): void {
      if (!hasFakeOjWorkerStatus(value, workerUrl, status)) return;
      clearTimeout(timeout);
      session.off("ServiceWorker.workerVersionUpdated", inspect);
      resolve();
    }
    session.on("ServiceWorker.workerVersionUpdated", inspect);
  });
}

function hasFakeOjWorkerStatus(
  value: unknown,
  workerUrl: string,
  status: "stopped" | "running",
): boolean {
  if (typeof value !== "object" || value === null || !("versions" in value)
    || !Array.isArray((value as { versions: unknown }).versions)) return false;
  return (value as { versions: unknown[] }).versions.some((version) =>
    typeof version === "object" && version !== null
      && (version as { scriptURL?: unknown }).scriptURL === workerUrl
      && (version as { runningStatus?: unknown }).runningStatus === status);
}

/**
 * Path of the persistent Chromium profile used for a given test title. The
 * returned path is bound to `.tmp/playwright-extension/fake-oj` so the
 * global teardown removes it after the suite completes.
 */
export function fakeOjProfilePath(titleSlug: string): string {
  const base = resolve(process.cwd(), ".tmp", "playwright-extension", "fake-oj", titleSlug);
  if (!base.startsWith(resolve(process.cwd(), ".tmp"))) {
    throw new Error(`Unsafe Fake OJ profile path: ${base}`);
  }
  return base;
}

/**
 * Defensive removal of a Fake OJ profile directory. Uses the same
 * `lstatSync`-based safe-deletion recipe as `global-teardown.ts`.
 */
export function removeFakeOjProfile(target: string): void {
  if (!existsSync(target)) return;
  if (!isAbsolute(target)) throw new Error(`Fake OJ profile must be absolute: ${target}`);
  const relativePath = relative(resolve(process.cwd(), ".tmp"), target);
  if (relativePath === "" || relativePath === ".."
    || relativePath.startsWith("..\\") || relativePath.startsWith("../")
    || isAbsolute(relativePath)) {
    throw new Error(`Unsafe Fake OJ profile cleanup path: ${target}`);
  }
  removeFakeOjPathSafe(target);
}

function removeFakeOjPathSafe(target: string): void {
  const stats = lstatSync(target, { throwIfNoEntry: false });
  if (stats === undefined) return;
  if (stats.isSymbolicLink() || !stats.isDirectory()) {
    unlinkSync(target);
    return;
  }
  for (const entry of readdirSync(target)) removeFakeOjPathSafe(resolve(target, entry));
  rmdirSync(target);
}

// ---------------------------------------------------------------------------
// Fixture loading (safe synthetic transcripts only)
// ---------------------------------------------------------------------------

const FIXTURE_ROOT = resolve(process.cwd(), "tests", "fixtures", "capture-v4", "fake");

/**
 * Resolve the absolute path of a fixture file under
 * `tests/fixtures/capture-v4/fake`. The helper refuses any path that escapes
 * the fixture root so the Fake OJ spec cannot accidentally load test
 * fixtures that the privacy audit explicitly forbids.
 */
export function fakeOjFixturePath(name: string): string {
  if (name.includes("..") || name.includes("/") || name.includes("\\")) {
    throw new Error(`Unsafe Fake OJ fixture name: ${name}`);
  }
  const absolute = resolve(FIXTURE_ROOT, name);
  if (!absolute.startsWith(FIXTURE_ROOT)) {
    throw new Error(`Unsafe Fake OJ fixture path: ${absolute}`);
  }
  return absolute;
}

/** Read a JSON fixture and return the parsed value verbatim. */
export function readFakeOjJsonFixture<T>(name: string): T {
  const path = fakeOjFixturePath(name);
  const raw = readFileSync(path, "utf8");
  return JSON.parse(raw) as T;
}

/** Read an HTML fixture (problem page / result page) verbatim. */
export function readFakeOjHtmlFixture(name: string): string {
  const path = fakeOjFixturePath(name);
  return readFileSync(path, "utf8");
}

// ---------------------------------------------------------------------------
// Verdict taxonomy convenience
// ---------------------------------------------------------------------------

/** Every taxonomy verdict — used by the spec to choose final E3 values. */
export const ALL_FAKE_OJ_VERDICTS: readonly FinalCaptureVerdict[] = Object.freeze([
  ...FINAL_CAPTURE_VERDICTS,
]);

/** Default verdict for happy-path scenarios. */
export const FAKE_OJ_DEFAULT_VERDICT: FinalCaptureVerdict = "Accepted";

// ---------------------------------------------------------------------------
// Re-export the extension dist path for logging parity with the spike spec
// ---------------------------------------------------------------------------

export { EXTENSION_DIST };
