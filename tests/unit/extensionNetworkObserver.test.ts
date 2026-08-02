import { describe, expect, it } from "vitest";
import {
  createRegistryRequestLifecycleSource,
  createCharacterizationObserver,
  createWebRequestObserver,
  normalizeCharacterizationEndpointPath,
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
  it("characterizes exact LeetCode paths without retaining query values or fragments", () => {
    expect(normalizeCharacterizationEndpointPath(
      "https://leetcode.cn/problems/two-sum/submit/?token=forbidden#fragment",
    )).toBe("/problems/two-sum/submit/");
    const outcome = createCharacterizationObserver(
      createRegistryRequestLifecycleSource(() => "2026-07-24T01:00:00.000Z"),
    ).handleBeforeRequest(details(
      "https://leetcode.cn/problems/two-sum/submit/?token=forbidden",
    ));
    expect(outcome).toMatchObject({
      kind: "recorded",
      lifecycle: {
        platform: "leetcode",
        endpointKey: "/problems/two-sum/submit/",
      },
    });
    expect(JSON.stringify(outcome)).not.toContain("forbidden");
  });

  it.each([
    ["https://atcoder.jp/contests", "/contests"],
    ["https://atcoder.jp/contests/", "/contests/"],
    ["https://atcoder.jp/contests/abc100", "/contests/abc100"],
    ["https://atcoder.jp/contests/abc100/", "/contests/abc100/"],
    ["https://atcoder.jp/contests/abc100/tasks/abc100_a", "/contests/abc100/tasks/abc100_a"],
    ["https://atcoder.jp/contests/abc100/tasks/abc100_a/", "/contests/abc100/tasks/abc100_a/"],
    ["https://atcoder.jp/contests/abc100/submit", "/contests/abc100/submit"],
    ["https://atcoder.jp/contests/abc100/submissions", "/contests/abc100/submissions"],
    ["https://atcoder.jp/contests/abc100/submissions/me", "/contests/abc100/submissions/me"],
    ["https://atcoder.jp/contests/abc100/submissions/123456?lang=en#status", "/contests/abc100/submissions/123456"],
    [`https://atcoder.jp/contests/${"a".repeat(64)}/tasks/${"b".repeat(128)}`, `/contests/${"a".repeat(64)}/tasks/${"b".repeat(128)}`],
  ])("pre-storage AtCoder grammar accepts only the reviewed contest path %s", (url, expected) => {
    expect(normalizeCharacterizationEndpointPath(url)).toBe(expected);
    const outcome = createCharacterizationObserver(
      createRegistryRequestLifecycleSource(() => "2026-07-31T01:00:00.000Z"),
    ).handleBeforeRequest(details(url));
    expect(outcome).toMatchObject({
      kind: "recorded",
      lifecycle: { platform: "atcoder", endpointKey: expected },
    });
    expect(JSON.stringify(outcome)).not.toContain("lang=en");
  });

  it.each([
    "https://atcoder.jp/",
    "https://atcoder.jp/users/qiu_yu",
    "https://atcoder.jp/settings",
    "https://atcoder.jp/login",
    "https://atcoder.jp/oauth/authorize",
    "https://atcoder.jp/account/profile",
    "https://atcoder.jp/contests/abc100/standings",
    "https://atcoder.jp/contests/abc%31%30%30/tasks/abc100_a",
    `https://atcoder.jp/contests/${"a".repeat(65)}/submit`,
    `https://atcoder.jp/contests/abc100/tasks/${"b".repeat(129)}`,
    "https://atcoder.jp/contests/abc.100/submit",
    "https://atcoder.jp/contests/abc100/tasks/abc100.a",
  ])("rejects the AtCoder identity-bearing or unknown path before session storage: %s", (url) => {
    expect(normalizeCharacterizationEndpointPath(url)).toBeNull();
    const outcome = createCharacterizationObserver(
      createRegistryRequestLifecycleSource(() => "2026-07-31T01:00:00.000Z"),
    ).handleBeforeRequest(details(url));
    expect(outcome).toEqual({ kind: "ignored", reason: "normalize_endpoint_failed" });
    expect(JSON.stringify(outcome)).not.toContain(new URL(url).pathname);
  });

  it("rejects an unapproved AtCoder redirect path without retaining it in diagnostics", () => {
    const outcome = createCharacterizationObserver(
      createRegistryRequestLifecycleSource(() => "2026-07-31T01:00:00.000Z"),
    ).handleBeforeRedirect(
      details("https://atcoder.jp/contests/abc100/submit"),
      "https://atcoder.jp/users/qiu_yu",
    );
    expect(outcome).toEqual({ kind: "ignored", reason: "normalize_endpoint_failed" });
    expect(JSON.stringify(outcome)).not.toContain("qiu_yu");
  });

  it.each([
    ["https://codeforces.com/problemset/problem/1/A", "/problemset/problem/1/A"],
    ["https://codeforces.com/problemset/problem/123456789/A123456789012345/", "/problemset/problem/123456789/A123456789012345/"],
    ["https://codeforces.com/contest/1/problem/A", "/contest/1/problem/A"],
    ["https://codeforces.com/problemset/submit", "/problemset/submit"],
    ["https://codeforces.com/contest/1/submit/", "/contest/1/submit/"],
    ["https://codeforces.com/problemset/status", "/problemset/status"],
    ["https://codeforces.com/contest/1/status/", "/contest/1/status/"],
    ["https://codeforces.com/contest/1/my", "/contest/1/my"],
    ["https://codeforces.com/contest/1/submission/1", "/contest/1/submission/1"],
    [
      "https://codeforces.com/problemset/submission/123456789/1234567890123456789?locale=en#status",
      "/problemset/submission/123456789/1234567890123456789",
    ],
  ])("pre-storage Codeforces grammar accepts only the reviewed path %s", (url, expected) => {
    expect(normalizeCharacterizationEndpointPath(url)).toBe(expected);
    const outcome = createCharacterizationObserver(
      createRegistryRequestLifecycleSource(() => "2026-08-02T02:30:00.000Z"),
    ).handleBeforeRequest(details(url));
    expect(outcome).toMatchObject({
      kind: "recorded",
      lifecycle: { platform: "codeforces", endpointKey: expected },
    });
    expect(JSON.stringify(outcome)).not.toContain("locale=en");
  });

  it.each([
    "https://codeforces.com/",
    "https://codeforces.com/submissions/qiu_yu",
    "https://codeforces.com/profile/qiu_yu",
    "https://codeforces.com/settings/general",
    "https://codeforces.com/enter",
    "https://codeforces.com/register",
    "https://codeforces.com/api/user.status",
    "https://codeforces.com/blog/entry/1",
    "https://codeforces.com/group/private",
    "https://codeforces.com/gym/1/problem/A",
    "https://codeforces.com/mashup/1/problem/A",
    "https://codeforces.com/data/submitSource",
    "https://codeforces.com/problemset/problem/%31/A",
    "https://codeforces.com/problemset//status",
    "https://codeforces.com/problemset/problem/0/A",
    "https://codeforces.com/problemset/problem/01/A",
    "https://codeforces.com/problemset/problem/1234567890/A",
    "https://codeforces.com/problemset/problem/1/1A",
    [`https://codeforces.com/problemset/problem/1/${"A".repeat(17)}`],
    "https://codeforces.com/contest/1/submission/0",
    "https://codeforces.com/contest/1/submission/01",
    "https://codeforces.com/contest/1/submission/12345678901234567890",
    "https://codeforces.com/contest/1/standings",
    "https://codeforces.com/contest/1/problem/A.json",
  ].flat())("rejects a Codeforces account-bearing, private, malformed, or unknown path before storage: %s", (url) => {
    expect(normalizeCharacterizationEndpointPath(url)).toBeNull();
    const outcome = createCharacterizationObserver(
      createRegistryRequestLifecycleSource(() => "2026-08-02T02:30:00.000Z"),
    ).handleBeforeRequest(details(url));
    expect(outcome).toEqual({ kind: "ignored", reason: "normalize_endpoint_failed" });
    expect(JSON.stringify(outcome)).not.toContain(new URL(url).pathname);
  });

  it.each([
    "http://codeforces.com/contest/1/submit",
    "https://user:secret@codeforces.com/contest/1/submit",
    "https://codeforces.com:444/contest/1/submit",
    "https://evil.codeforces.com/contest/1/submit",
  ])("rejects an unsafe Codeforces origin before storage: %s", (url) => {
    expect(normalizeCharacterizationEndpointPath(url)).toBeNull();
  });

  it("rejects an unapproved Codeforces redirect path without retaining account identity", () => {
    const outcome = createCharacterizationObserver(
      createRegistryRequestLifecycleSource(() => "2026-08-02T02:30:00.000Z"),
    ).handleBeforeRedirect(
      details("https://codeforces.com/contest/1/submit"),
      "https://codeforces.com/submissions/qiu_yu",
    );
    expect(outcome).toEqual({ kind: "ignored", reason: "normalize_endpoint_failed" });
    expect(JSON.stringify(outcome)).not.toContain("qiu_yu");
  });

  it.each([
    ["https://www.luogu.com.cn/problem/P1001", "/problem/P1001"],
    ["https://www.luogu.com.cn/problem/1000/", "/problem/1000/"],
    ["https://www.luogu.com.cn/fe/api/problem/submit/P1001", "/fe/api/problem/submit/P1001"],
    ["https://www.luogu.com.cn/fe/api/record/lastRecordId", "/fe/api/record/lastRecordId"],
    ["https://www.luogu.com.cn/record/287273601?source=forbidden#status", "/record/287273601"],
    ["https://www.luogu.com.cn/record/1/", "/record/1/"],
    ["https://www.luogu.com.cn/record/list?user=forbidden#history", "/record/list"],
    [`https://www.luogu.com.cn/problem/A${"1".repeat(63)}`, `/problem/A${"1".repeat(63)}`],
    ["https://www.luogu.com.cn/record/12345678901234567890", "/record/12345678901234567890"],
  ])("pre-storage Luogu grammar accepts only the reviewed path %s", (url, expected) => {
    expect(normalizeCharacterizationEndpointPath(url)).toBe(expected);
    const outcome = createCharacterizationObserver(
      createRegistryRequestLifecycleSource(() => "2026-08-02T10:00:00.000Z"),
    ).handleBeforeRequest(details(url));
    expect(outcome).toMatchObject({
      kind: "recorded",
      lifecycle: { platform: "luogu", endpointKey: expected },
    });
    expect(JSON.stringify(outcome)).not.toContain("forbidden");
  });

  it.each([
    "https://www.luogu.com.cn/",
    "https://www.luogu.com.cn/user/qiu_yu",
    "https://www.luogu.com.cn/team/1",
    "https://www.luogu.com.cn/contest/1",
    "https://www.luogu.com.cn/training/1",
    "https://www.luogu.com.cn/discuss/1",
    "https://www.luogu.com.cn/article/1",
    "https://www.luogu.com.cn/chat/1",
    "https://www.luogu.com.cn/api/chat/1",
    "https://www.luogu.com.cn/api/user/1",
    "https://www.luogu.com.cn/judgement/1",
    "https://www.luogu.com.cn/admin/1",
    "https://www.luogu.com.cn/fe/api/record/queryDownloadableTestcase/1",
    "https://www.luogu.com.cn/fe/api/record/downloadTestcase/1",
    "https://www.luogu.com.cn/api/ide_submit",
    "https://www.luogu.com.cn/login",
    "https://www.luogu.com.cn/register",
    "https://www.luogu.com.cn/unknown/P1001",
    "https://www.luogu.com.cn/problem/ABC",
    "https://www.luogu.com.cn/problem/_P1001",
    "https://www.luogu.com.cn/problem/P.1001",
    "https://www.luogu.com.cn/problem/P%31%30%30%31",
    "https://www.luogu.com.cn/problem//P1001",
    `https://www.luogu.com.cn/problem/A${"1".repeat(64)}`,
    "https://www.luogu.com.cn/fe/api/problem/submit/P1001/",
    "https://www.luogu.com.cn/fe/api/record/lastRecordId/",
    "https://www.luogu.com.cn/record/0",
    "https://www.luogu.com.cn/record/01",
    "https://www.luogu.com.cn/record/123456789012345678901",
    "https://www.luogu.com.cn/record/not-a-record",
    "https://www.luogu.com.cn/record/list/extra",
  ])("rejects a Luogu account-bearing, private, malformed, or unknown path before storage: %s", (url) => {
    expect(normalizeCharacterizationEndpointPath(url)).toBeNull();
    const outcome = createCharacterizationObserver(
      createRegistryRequestLifecycleSource(() => "2026-08-02T10:00:00.000Z"),
    ).handleBeforeRequest(details(url));
    expect(outcome).toEqual({ kind: "ignored", reason: "normalize_endpoint_failed" });
    expect(JSON.stringify(outcome)).not.toContain(new URL(url).pathname);
  });

  it.each([
    "http://www.luogu.com.cn/problem/P1001",
    "https://user:secret@www.luogu.com.cn/problem/P1001",
    "https://www.luogu.com.cn:444/problem/P1001",
    "https://evil.luogu.com.cn/problem/P1001",
    "https://luogu.com.cn/problem/P1001",
  ])("rejects an unsafe Luogu origin before storage: %s", (url) => {
    expect(normalizeCharacterizationEndpointPath(url)).toBeNull();
  });

  it("rejects an unapproved Luogu redirect path without retaining account identity", () => {
    const outcome = createCharacterizationObserver(
      createRegistryRequestLifecycleSource(() => "2026-08-02T10:00:00.000Z"),
    ).handleBeforeRedirect(
      details("https://www.luogu.com.cn/fe/api/problem/submit/P1001"),
      "https://www.luogu.com.cn/user/qiu_yu",
    );
    expect(outcome).toEqual({ kind: "ignored", reason: "normalize_endpoint_failed" });
    expect(JSON.stringify(outcome)).not.toContain("qiu_yu");
  });

  it.each(Object.entries(hosts))("records sanitized E1 for %s", (platform, url) => {
    const outcome = observer().handleBeforeRequest(details(url));
    expect(outcome.kind).toBe("recorded");
    if (outcome.kind !== "recorded") return;
    expect(outcome.lifecycle).toMatchObject({
      platform,
      tier: "E1",
      kind: "request_observed",
      endpointKey: platform === "leetcode"
        ? "leetcode/submit/com/two-sum"
        : "submit",
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
        : platform === "leetcode"
          ? "v4-leetcode-network-6"
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

  it("retains a validated response status through the completed lifecycle", () => {
    const subject = observer();
    subject.handleResponseStarted(details(hosts.leetcode), 200);
    const completed = subject.handleCompleted(details(hosts.leetcode));
    expect(completed).toMatchObject({
      kind: "recorded",
      lifecycle: {
        lifecycle: "completed",
        statusCode: 200,
      },
    });
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

  it("fails closed for AtCoder form navigation when Chrome omits documentId", () => {
    const subject = createCharacterizationObserver(createRegistryRequestLifecycleSource(
      () => "2026-08-01T17:08:24.202Z",
    ));
    expect(subject.handleBeforeRequest(details("https://atcoder.jp/contests/abc001/submit", {
      method: "POST",
      type: "main_frame",
      documentId: undefined,
    }))).toEqual({ kind: "ignored", reason: "missing_document_id" });
  });

  it("fails closed for Codeforces form navigation when Chrome omits documentId", () => {
    const subject = createCharacterizationObserver(
      createRegistryRequestLifecycleSource(() => "2026-08-02T08:14:42.110Z"),
    );
    expect(subject.handleBeforeRequest(details("https://codeforces.com/problemset/submit/", {
      method: "POST",
      type: "main_frame",
      documentId: undefined,
    }))).toEqual({ kind: "ignored", reason: "missing_document_id" });
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
