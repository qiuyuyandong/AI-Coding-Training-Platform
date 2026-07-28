import { describe, expect, it } from "vitest";
import {
  createRegistryRequestLifecycleSource,
  createCharacterizationObserver,
  createWebRequestObserver,
  normalizeOjEndpointKey,
  persistRecordedLifecycle,
  type WebRequestDetails,
} from "@/extension/src/networkObserver";
import { readTransientSessionEvidenceState } from "@/extension/src/transientEvidenceStorage";

const hosts = {
  leetcode: "https://leetcode.com/problems/two-sum/submit/",
  nowcoder: "https://www.nowcoder.com/question/submit",
  luogu: "https://www.luogu.com.cn/record/submit",
  codeforces: "https://codeforces.com/contest/1/submit",
} as const;

const details = (url: string, overrides: Partial<WebRequestDetails> = {}): WebRequestDetails => ({
  requestId: "request-1",
  url,
  method: "POST",
  tabId: 4,
  frameId: 0,
  documentId: "document-1",
  timeStamp: 100,
  type: "xmlhttprequest",
  ...overrides,
});

const observer = (times: readonly string[] = ["2026-07-24T01:00:00.000Z"]) => {
  let index = 0;
  const source = createRegistryRequestLifecycleSource(() => times[Math.min(index++, times.length - 1)] ?? times[0] ?? "2026-07-24T01:00:00.000Z");
  return createWebRequestObserver(source);
};

describe("V4 network observer", () => {
  it.each(Object.entries(hosts))("records sanitized E1 for %s", (platform, url) => {
    const outcome = observer().handleBeforeRequest(details(url));
    expect(outcome.kind).toBe("recorded");
    if (outcome.kind !== "recorded") return;
    expect(outcome.lifecycle).toMatchObject({
      platform,
      tier: "E1",
      kind: "request_observed",
      endpointKey: "submit",
      method: "POST",
      resourceType: "xmlhttprequest",
      lifecycle: "before_request",
      apiTimeStamp: 100,
      receivedAt: "2026-07-24T01:00:00.000Z",
      tabId: 4,
      frameId: 0,
      documentId: "document-1",
      adapterVersion: platform === "nowcoder"
        ? "v4-nowcoder-network-1"
        : "v4-contract-1",
    });
    expect(JSON.stringify(outcome.lifecycle)).not.toContain(url);
  });

  it("updates one requestId in place with monotonic timestamps", () => {
    const subject = observer(["2026-07-24T01:00:02.000Z", "2026-07-24T01:00:01.000Z"]);
    subject.handleBeforeRequest(details(hosts.leetcode, { timeStamp: 200 }));
    const completed = subject.handleCompleted(details(hosts.leetcode, { timeStamp: 150 }));
    expect(completed.kind).toBe("recorded");
    if (completed.kind !== "recorded") return;
    expect(completed.lifecycle).toMatchObject({ lifecycle: "completed", apiTimeStamp: 200, receivedAt: "2026-07-24T01:00:02.000Z" });
  });

  it("rejects unsafe endpoint fragments and forbidden raw observation keys", () => {
    expect(normalizeOjEndpointKey("https://leetcode.com/submit?next=https://evil.test")).toBeNull();
    const raw = { ...details(hosts.leetcode), body: undefined };
    expect(observer().handleBeforeRequest(raw)).toEqual({ kind: "ignored", reason: "corrupt_record" });
  });

  it.each([
    { responseBody: { nested: { rawBody: "must-not-inspect" } } },
    { response: { headers: { cookie: "must-not-inspect" } } },
    { metadata: [{ token: "must-not-inspect" }] },
    { responseBody: "x".repeat(1024 * 1024) },
    { responseBody: new Uint8Array([0, 255, 1]) },
  ])("fails closed for recursive and non-JSON raw representations", (unsafe) => {
    const raw = Object.assign({}, details(hosts.nowcoder), unsafe);
    expect(observer().handleBeforeRequest(raw)).toEqual({ kind: "ignored", reason: "corrupt_record" });
    expect(createCharacterizationObserver(createRegistryRequestLifecycleSource(
      () => "2026-07-24T01:00:00.000Z",
    )).handleBeforeRequest(raw)).toEqual({ kind: "ignored", reason: "corrupt_record" });
  });

  it.each([
    "requestBody", "request_body", "raw_body", "response_body", "response_text",
    "sourceCode", "source_code", "request_headers", "response_headers", "headers",
    "cookies", "auth", "csrfToken", "csrf_token", "accountId", "account_id",
    "userId", "user_id", "fullStatement", "full_statement", "problemStatement", "problem_statement",
  ])("rejects the B1 forbidden alias %s recursively in both observers", (alias) => {
    const unsafe = { nested: { [alias]: "must-not-inspect" } };
    const raw = Object.assign({}, details(hosts.nowcoder), unsafe);
    expect(observer().handleBeforeRequest(raw)).toEqual({ kind: "ignored", reason: "corrupt_record" });
    expect(createCharacterizationObserver(createRegistryRequestLifecycleSource(
      () => "2026-07-24T01:00:00.000Z",
    )).handleBeforeRequest(raw)).toEqual({ kind: "ignored", reason: "corrupt_record" });
  });

  it.each([
    details(hosts.leetcode, { documentId: undefined }),
    details(hosts.leetcode, { tabId: -1 }),
    details(hosts.leetcode, { frameId: -1 }),
  ])("ignores missing browser-document identity", (input) => {
    expect(observer().handleBeforeRequest(input)).toEqual({ kind: "ignored", reason: "missing_document_id" });
  });

  it("ignores unsupported methods, resource types, foreign hosts, and AtCoder", () => {
    expect(observer().handleBeforeRequest(details(hosts.leetcode, { method: "CONNECT" }))).toEqual({ kind: "ignored", reason: "unsupported_method" });
    expect(observer().handleBeforeRequest(details(hosts.leetcode, { type: "image" }))).toEqual({ kind: "ignored", reason: "non_adapted_host" });
    expect(observer().handleBeforeRequest(details("https://example.com/submit"))).toEqual({ kind: "ignored", reason: "non_adapted_host" });
    expect(observer().handleBeforeRequest(details("https://atcoder.jp/submit"))).toEqual({ kind: "ignored", reason: "non_adapted_host" });
  });

  it("records redirect/response/error phases without leaking errors or status on error", () => {
    const subject = observer();
    expect(subject.handleBeforeRedirect(details(hosts.luogu), "https://www.luogu.com.cn/record/123")).toMatchObject({
      kind: "recorded", lifecycle: { lifecycle: "before_redirect", redirectEndpointKey: "status" },
    });
    expect(subject.handleResponseStarted(details(hosts.luogu), 202)).toMatchObject({
      kind: "recorded", lifecycle: { lifecycle: "response_started", statusCode: 202 },
    });
    const failed = subject.handleErrorOccurred(details(hosts.luogu), "net::ERR_FAILED secret");
    expect(failed).toMatchObject({ kind: "recorded", lifecycle: { lifecycle: "error_occurred" } });
    if (failed.kind === "recorded") {
      expect("statusCode" in failed.lifecycle).toBe(false);
      expect(JSON.stringify(failed.lifecycle)).not.toContain("ERR_FAILED");
    }
  });

  it("persists and round-trips one transientE1 lifecycle", async () => {
    const values: Record<string, unknown> = {};
    const storage = {
      get: async (keys: readonly string[]) => Object.fromEntries(keys.filter((key) => key in values).map((key) => [key, values[key]])),
      set: async (items: Record<string, unknown>) => { Object.assign(values, items); },
    };
    const outcome = observer().handleBeforeRequest(details(hosts.codeforces));
    await persistRecordedLifecycle(storage, outcome, "codeforces", 4, 0, "document-1", "v4-contract-1");
    const state = readTransientSessionEvidenceState(values);
    expect(state.requestLifecycles).toHaveLength(1);
    expect(state.requestLifecycles[0]).toMatchObject({
      kind: "request_lifecycle",
      outcome: "pending",
      evidence: { platform: "codeforces", endpointKey: "submit" },
    });
  });
});
