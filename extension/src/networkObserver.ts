import { PLATFORM_ADAPTERS } from "@/extension/src/adapters/registry";
import type { Platform } from "@/extension/src/adapters/contract";
import { parseSafeEvidence } from "@/extension/src/evidence";
import type { E1RequestObserved, SafeEvidence } from "@/extension/src/evidence";
import type { CorrelatorRejectionReason } from "@/extension/src/submissionCorrelator";
import {
  planTransientSessionEvidenceWrite,
  pruneAndWriteTransientSessionEvidence,
} from "@/extension/src/transientEvidenceStorage";
import type {
  TransientAmbiguityDiagnosticReason,
  TransientE1Lifecycle,
  TransientEvidenceStorage,
} from "@/extension/src/transientEvidenceStorage";

export type WebRequestDetails = Readonly<{
  requestId: string;
  url: string;
  method: string;
  tabId: number;
  frameId: number;
  documentId?: string;
  parentFrameId?: number;
  timeStamp: number;
  ip?: string;
  initiator?: string;
  type?: string;
}>;

export type RequestLifecyleSource = Readonly<{
  hostOwns: (hostname: string, requestUrl: string) => boolean;
  normalizeEndpointKey: (requestUrl: string) => string | null;
  now: () => string;
  observedDocumentIds: ReadonlySet<string> | null;
}>;

export type LifecycleOutcome =
  | { readonly kind: "recorded"; readonly lifecycle: SafeEvidence }
  | { readonly kind: "ignored"; readonly reason: TransientAmbiguityDiagnosticReason | "unsupported_method" | "non_adapted_host" | "missing_document_id" | "normalize_endpoint_failed" }
  | { readonly kind: "rejected"; readonly reason: CorrelatorRejectionReason; readonly lifecycle: SafeEvidence };

export interface WebRequestObserver {
  handleBeforeRequest(details: WebRequestDetails): LifecycleOutcome;
  handleBeforeRedirect(details: WebRequestDetails, redirectUrl: string): LifecycleOutcome;
  handleResponseStarted(details: WebRequestDetails, statusCode: number): LifecycleOutcome;
  handleCompleted(details: WebRequestDetails): LifecycleOutcome;
  handleErrorOccurred(details: WebRequestDetails, error: string): LifecycleOutcome;
}

type SupportedPlatform = Exclude<Platform, "atcoder">;
type Lifecycle = E1RequestObserved["lifecycle"];

const SUPPORTED_PLATFORMS: readonly SupportedPlatform[] = ["leetcode", "nowcoder", "luogu", "codeforces"];
const METHODS = new Set(["GET", "POST", "PUT", "DELETE", "PATCH", "HEAD", "OPTIONS"]);
const RESOURCE_TYPES = new Set(["xmlhttprequest", "main_frame", "sub_frame"]);

export const OJ_HOST_PATTERNS: readonly string[] = SUPPORTED_PLATFORMS.flatMap((platform) =>
  PLATFORM_ADAPTERS[platform].hostOwnership.map((host) => `https://${host}/*`),
);
export const OJ_RESOURCE_TYPES = ["xmlhttprequest", "main_frame", "sub_frame"] as const;

function platformForUrl(rawUrl: string): SupportedPlatform | null {
  let hostname: string;
  try {
    hostname = new URL(rawUrl).hostname;
  } catch {
    return null;
  }
  const matches = SUPPORTED_PLATFORMS.filter((platform) =>
    PLATFORM_ADAPTERS[platform].hostOwnership.some((host) => host === hostname),
  );
  return matches.length === 1 ? matches[0] : null;
}

/**
 * Phase A intentionally uses only coarse, non-URL endpoint keys. Known path
 * words win; otherwise the first safe path segment is retained. This is not a
 * claim that an endpoint confirms a submission.
 */
export function normalizeOjEndpointKey(requestUrl: string): string | null {
  let parsed: URL;
  try {
    parsed = new URL(requestUrl);
  } catch {
    return null;
  }
  const pathAndQuery = `${parsed.pathname}${parsed.search}`;
  if (pathAndQuery.includes(":") || pathAndQuery.includes("//") || pathAndQuery.includes("://")) return null;
  const lower = parsed.pathname.toLowerCase();
  if (lower.includes("submit")) return "submit";
  if (lower.includes("result")) return "result";
  if (lower.includes("status") || lower.includes("record") || lower.includes("submission")) return "status";
  const first = parsed.pathname.split("/").filter(Boolean)[0];
  if (first === undefined || !/^[a-zA-Z0-9_-]+$/.test(first)) return null;
  return first.toLowerCase();
}

export function createWebRequestObserver(deps: RequestLifecyleSource): WebRequestObserver {
  const records = new Map<string, E1RequestObserved>();

  const handle = (
    details: WebRequestDetails,
    lifecycle: Lifecycle,
    additions: Readonly<{ statusCode?: number; redirectUrl?: string }> = {},
  ): LifecycleOutcome => {
    const forbiddenRawKeys = ["body", "requestBody", "requestHeaders", "responseHeaders", "extraHeaders"];
    if (forbiddenRawKeys.some((key) => key in details)) return { kind: "ignored", reason: "corrupt_record" };
    if (!METHODS.has(details.method.toUpperCase())) return { kind: "ignored", reason: "unsupported_method" };
    if (details.type !== undefined && !RESOURCE_TYPES.has(details.type)) return { kind: "ignored", reason: "non_adapted_host" };
    if (details.tabId < 0 || details.frameId < 0 || details.documentId === undefined || details.documentId === "") {
      return { kind: "ignored", reason: "missing_document_id" };
    }
    if (deps.observedDocumentIds !== null && !deps.observedDocumentIds.has(details.documentId)) {
      return { kind: "ignored", reason: "missing_document_id" };
    }
    const platform = platformForUrl(details.url);
    if (platform === null) return { kind: "ignored", reason: "non_adapted_host" };
    let hostname: string;
    try { hostname = new URL(details.url).hostname; } catch { return { kind: "ignored", reason: "non_adapted_host" }; }
    if (!deps.hostOwns(hostname, details.url)) return { kind: "ignored", reason: "non_adapted_host" };
    const endpointKey = deps.normalizeEndpointKey(details.url);
    if (endpointKey === null) return { kind: "ignored", reason: "normalize_endpoint_failed" };
    const redirectEndpointKey = additions.redirectUrl === undefined ? undefined : deps.normalizeEndpointKey(additions.redirectUrl);
    if (additions.redirectUrl !== undefined && redirectEndpointKey === null) {
      return { kind: "ignored", reason: "normalize_endpoint_failed" };
    }
    const prior = records.get(details.requestId);
    const now = deps.now();
    const receivedAt = prior !== undefined && Date.parse(prior.receivedAt) > Date.parse(now) ? prior.receivedAt : now;
    const candidate: unknown = {
      schemaVersion: 1,
      evidenceId: `e1_${platform}_${details.requestId}`,
      platform,
      tier: "E1",
      kind: "request_observed",
      receivedAt,
      tabId: details.tabId,
      frameId: details.frameId,
      documentId: details.documentId,
      adapterVersion: PLATFORM_ADAPTERS[platform].version,
      apiTimeStamp: Math.max(prior?.apiTimeStamp ?? 0, details.timeStamp),
      requestId: details.requestId,
      method: details.method.toUpperCase(),
      endpointKey,
      resourceType: details.type ?? "xmlhttprequest",
      lifecycle,
      ...(additions.statusCode === undefined || lifecycle === "error_occurred" ? {} : { statusCode: additions.statusCode }),
      ...(redirectEndpointKey === undefined ? {} : { redirectEndpointKey }),
    };
    const parsed = parseSafeEvidence(candidate);
    if (!parsed.ok || parsed.value.kind !== "request_observed") return { kind: "ignored", reason: "corrupt_record" };
    records.set(details.requestId, parsed.value);
    return { kind: "recorded", lifecycle: parsed.value };
  };

  return Object.freeze({
    handleBeforeRequest: (details: WebRequestDetails) => handle(details, "before_request"),
    handleBeforeRedirect: (details: WebRequestDetails, redirectUrl: string) => handle(details, "before_redirect", { redirectUrl }),
    handleResponseStarted: (details: WebRequestDetails, statusCode: number) => handle(details, "response_started", { statusCode }),
    handleCompleted: (details: WebRequestDetails) => handle(details, "completed"),
    handleErrorOccurred: (details: WebRequestDetails, error: string) => {
      void error;
      return handle(details, "error_occurred");
    },
  });
}

export async function persistRecordedLifecycle(
  storage: TransientEvidenceStorage,
  outcome: LifecycleOutcome,
  platform: Platform,
  tabId: number,
  frameId: number,
  documentId: string,
  adapterVersion: string,
): Promise<void> {
  if (outcome.kind !== "recorded" || outcome.lifecycle.kind !== "request_observed") return;
  const evidence = outcome.lifecycle;
  if (evidence.platform !== platform || evidence.tabId !== tabId || evidence.frameId !== frameId
    || evidence.documentId !== documentId || evidence.adapterVersion !== adapterVersion) return;
  const current = await pruneAndWriteTransientSessionEvidence(storage, evidence.receivedAt);
  const record: TransientE1Lifecycle = Object.freeze({
    schemaVersion: 1,
    tier: "E1",
    kind: "request_lifecycle",
    evidence,
    outcome: evidence.lifecycle === "error_occurred" ? "error" : "pending",
    stableSubmissionId: null,
    rejectionReason: evidence.lifecycle === "error_occurred" ? "network_error" : null,
    receivedAt: evidence.receivedAt,
  });
  const next = Object.freeze({
    ...current,
    requestLifecycles: Object.freeze([
      ...current.requestLifecycles.filter((item) => item.evidence.requestId !== evidence.requestId),
      record,
    ]),
  });
  await storage.set(planTransientSessionEvidenceWrite(next).items);
}

export function createRegistryRequestLifecycleSource(now: () => string): RequestLifecyleSource {
  return Object.freeze({
    hostOwns: (hostname: string, requestUrl: string) => {
      const platform = platformForUrl(requestUrl);
      return platform !== null && PLATFORM_ADAPTERS[platform].hostOwnership.some((host) => host === hostname);
    },
    normalizeEndpointKey: normalizeOjEndpointKey,
    now,
    observedDocumentIds: null,
  });
}

// ---------------------------------------------------------------------------
// Listener registration
// ---------------------------------------------------------------------------

export type WebRequestListenerKind =
  | "onBeforeRequest"
  | "onBeforeRedirect"
  | "onResponseStarted"
  | "onCompleted"
  | "onErrorOccurred";

export type WebRequestFilter = Readonly<{
  urls: readonly string[];
  types: readonly string[];
}>;

/**
 * Callback invoked by registerNetworkObserverListeners to attach each Chrome
 * webRequest listener. The kind field disambiguates which listener is being
 * registered; extraArgs carries the Chrome-supplied extra fields for that
 * event (redirectUrl / statusCode / error).
 */
export type RegisterCallback = (
  kind: WebRequestListenerKind,
  callback: (details: WebRequestDetails, ...extraArgs: unknown[]) => void,
  filter: WebRequestFilter,
) => void;

/** Called once per `recorded` outcome to enqueue persistence work. */
export type PersistRecordedCallback = (outcome: LifecycleOutcome) => void;

/** Wraps executor.schedule so callers can inject a fake in tests. */
export type ExecutorScheduleCallback = (work: () => Promise<void>) => void;

/**
 * Attaches five Chrome webRequest listeners (beforeRequest, beforeRedirect,
 * responseStarted, completed, errorOccurred) by calling `register` once per
 * listener. Each listener synchronously calls the observer; only `recorded`
 * outcomes cause `executorSchedule` to enqueue a `persistRecorded` call.
 *
 * This function is pure — no chrome.* references — so it is fully testable
 * by passing fake register / persist / schedule callbacks.
 */
export function registerNetworkObserverListeners(
  register: RegisterCallback,
  observer: WebRequestObserver,
  persistRecorded: PersistRecordedCallback,
  executorSchedule: ExecutorScheduleCallback,
): void {
  const filter: WebRequestFilter = Object.freeze({
    urls: OJ_HOST_PATTERNS,
    types: [...OJ_RESOURCE_TYPES],
  });

  register("onBeforeRequest", (details) => {
    const outcome = observer.handleBeforeRequest(details);
    if (outcome.kind === "recorded") executorSchedule(async () => { persistRecorded(outcome); });
  }, filter);

  register("onBeforeRedirect", (details, redirectUrl) => {
    const outcome = observer.handleBeforeRedirect(details, redirectUrl as string);
    if (outcome.kind === "recorded") executorSchedule(async () => { persistRecorded(outcome); });
  }, filter);

  register("onResponseStarted", (details, statusCode) => {
    const outcome = observer.handleResponseStarted(details, statusCode as number);
    if (outcome.kind === "recorded") executorSchedule(async () => { persistRecorded(outcome); });
  }, filter);

  register("onCompleted", (details) => {
    const outcome = observer.handleCompleted(details);
    if (outcome.kind === "recorded") executorSchedule(async () => { persistRecorded(outcome); });
  }, filter);

  register("onErrorOccurred", (details, error) => {
    const outcome = observer.handleErrorOccurred(details, error as string);
    if (outcome.kind === "recorded") executorSchedule(async () => { persistRecorded(outcome); });
  }, filter);
}
