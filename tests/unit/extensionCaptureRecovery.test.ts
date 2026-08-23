import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  CAPTURE_CONTENT_SCRIPT_MATCHES,
  collectCaptureRecoveryDocuments,
  isCaptureContentScriptUrl,
  nextCaptureRecoveryRetry,
  recoverCaptureDocuments,
  type CaptureRecoveryDocument,
} from "@/extension/src/captureRecovery";

describe("capture recovery URL and manifest contract", () => {
  it("keeps the source policy byte-for-byte aligned with manifest matches", () => {
    const manifest = JSON.parse(readFileSync(resolve("extension/manifest.json"), "utf8")) as {
      readonly content_scripts?: readonly { readonly matches?: readonly string[] }[];
    };
    expect(manifest.content_scripts?.[0]?.matches).toEqual(CAPTURE_CONTENT_SCRIPT_MATCHES);
  });

  it.each([
    "https://leetcode.cn/problems/two-sum/",
    "https://leetcode.com/problems/two-sum/submissions/1",
    "https://ac.nowcoder.com/acm/contest/18839/1001",
    "https://ac.nowcoder.com/acm/contest/view-submission?submissionId=42",
    "https://www.nowcoder.com/practice/abc",
    "https://www.luogu.com.cn/record/1",
    "https://codeforces.com/problemset/problem/1/A",
    "https://atcoder.jp/contests/abc100/tasks/abc100_a",
  ])("accepts a declared top-level content page: %s", (url) => {
    expect(isCaptureContentScriptUrl(url)).toBe(true);
  });

  it.each([
    "https://example.com/problems/two-sum/",
    "https://leetcode.cn/contest/weekly-contest-1",
    "https://ac.nowcoder.com/acm/contest/999/1",
    "https://atcoder.jp/contests/abc100",
    "http://leetcode.cn/problems/two-sum/",
  ])("rejects a page outside manifest ownership: %s", (url) => {
    expect(isCaptureContentScriptUrl(url)).toBe(false);
  });
});

describe("documentId-only capture recovery", () => {
  it("keeps production injection exact and contains no broadcast or frame-only fallback", () => {
    const source = readFileSync(resolve("extension/src/background.ts"), "utf8");
    const start = source.indexOf("async function injectCaptureDocumentAndWait");
    const end = source.indexOf("async function resetCaptureRecoveryRetryBudget", start);
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
    const injection = source.slice(start, end);
    expect(injection).toContain("documentIds: [document.documentId]");
    expect(injection).not.toContain("frameIds");
    expect(injection).not.toContain("allFrames");
    expect(injection).not.toContain("chrome.tabs.sendMessage");
  });

  it("collects only matching Chrome-owned main documents and fails without documentId", () => {
    expect(collectCaptureRecoveryDocuments([{
      tabId: 7,
      frames: [{ frameId: 0, documentId: "doc_7", url: "https://leetcode.cn/problems/two-sum/" }],
    }])).toEqual({
      ok: true,
      documents: [{ tabId: 7, documentId: "doc_7", url: "https://leetcode.cn/problems/two-sum/" }],
    });
    expect(collectCaptureRecoveryDocuments([{
      tabId: 8,
      frames: [{ frameId: 0, url: "https://leetcode.cn/problems/two-sum/" }],
    }])).toEqual({ ok: false, error: "unsupported_browser" });
    expect(collectCaptureRecoveryDocuments([{
      tabId: 9,
      frames: [{ frameId: 1, documentId: "child", url: "https://leetcode.cn/problems/two-sum/" }],
    }])).toEqual({ ok: false, error: "unsupported_browser" });
  });

  it("fails closed before injection when more than 100 matching documents exist", async () => {
    const documents = Array.from({ length: 101 }, (_value, index): CaptureRecoveryDocument => ({
      tabId: index + 1,
      documentId: `doc_${index + 1}`,
      url: "https://leetcode.cn/problems/two-sum/",
    }));
    let calls = 0;
    expect(await recoverCaptureDocuments(documents, async () => {
      calls += 1;
      return true;
    })).toEqual({ ok: false, error: "capture_recovery_capacity_exceeded" });
    expect(calls).toBe(0);
  });

  it("uses at most four workers and retries each document at most three times", async () => {
    const documents = Array.from({ length: 12 }, (_value, index): CaptureRecoveryDocument => ({
      tabId: index + 1,
      documentId: `doc_${index + 1}`,
      url: "https://leetcode.cn/problems/two-sum/",
    }));
    const attempts = new Map<string, number>();
    let active = 0;
    let peak = 0;
    const result = await recoverCaptureDocuments(documents, async (document) => {
      active += 1;
      peak = Math.max(peak, active);
      const attempt = (attempts.get(document.documentId) ?? 0) + 1;
      attempts.set(document.documentId, attempt);
      await Promise.resolve();
      active -= 1;
      return attempt === 3;
    });
    expect(result).toEqual({ ok: true, recovered: 12 });
    expect(peak).toBeLessThanOrEqual(4);
    expect([...attempts.values()].every((attempt) => attempt === 3)).toBe(true);
  });

  it("returns a fixed failure after the third READY timeout", async () => {
    let attempts = 0;
    const result = await recoverCaptureDocuments([{
      tabId: 1,
      documentId: "doc_1",
      url: "https://leetcode.cn/problems/two-sum/",
    }], async () => {
      attempts += 1;
      return false;
    });
    expect(result).toEqual({ ok: false, error: "capture_recovery_failed" });
    expect(attempts).toBe(3);
  });

  it("uses only the 1/5/15 minute automatic retry budget", () => {
    expect(nextCaptureRecoveryRetry(0)).toEqual({ attempt: 1, delayMinutes: 1 });
    expect(nextCaptureRecoveryRetry(1)).toEqual({ attempt: 2, delayMinutes: 5 });
    expect(nextCaptureRecoveryRetry(2)).toEqual({ attempt: 3, delayMinutes: 15 });
    expect(nextCaptureRecoveryRetry(3)).toBeUndefined();
  });
});
