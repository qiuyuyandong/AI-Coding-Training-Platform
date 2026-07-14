import { describe, expect, it } from "vitest";
import {
  detectProblemFromLocation,
  detectVerdictFromDocument,
  type DetectableLocation,
  getPlatformAdapterStatus,
  getProductionPlatforms,
  PLATFORM_ADAPTERS,
} from "@/extension/src/platforms";

function asLocation(url: string): DetectableLocation {
  const parsedUrl = new URL(url);
  return {
    href: parsedUrl.href,
    hostname: parsedUrl.hostname,
    pathname: parsedUrl.pathname,
  };
}

describe("detectProblemFromLocation", () => {
  it("detects LeetCode problem URLs", () => {
    expect(detectProblemFromLocation(asLocation("https://leetcode.com/problems/two-sum/"), "Two Sum - LeetCode")).toEqual({
      platform: "leetcode",
      problemExternalId: "two-sum",
      problemTitle: "Two Sum",
      canonicalUrl: "https://leetcode.com/problems/two-sum/",
    });
  });

  it("collapses LeetCode route and tracking variants to one canonical URL", () => {
    expect(detectProblemFromLocation(
      asLocation("https://leetcode.com/problems/Two-Sum/description/?envType=daily#solution"),
      "Two Sum - LeetCode",
    )).toMatchObject({
      problemExternalId: "two-sum",
      canonicalUrl: "https://leetcode.com/problems/two-sum/",
    });
  });

  it("detects Codeforces problem URLs", () => {
    expect(detectProblemFromLocation(asLocation("https://codeforces.com/problemset/problem/4/A"), "A. Watermelon")).toEqual({
      platform: "codeforces",
      problemExternalId: "4A",
      problemTitle: "A. Watermelon",
      canonicalUrl: "https://codeforces.com/problemset/problem/4/A",
    });
  });

  it("normalizes Codeforces index casing", () => {
    expect(detectProblemFromLocation(
      asLocation("https://codeforces.com/problemset/problem/4/a?locale=en"),
      "A. Watermelon",
    )).toMatchObject({
      problemExternalId: "4A",
      canonicalUrl: "https://codeforces.com/problemset/problem/4/A",
    });
  });

  it("detects AtCoder task URLs", () => {
    expect(detectProblemFromLocation(asLocation("https://atcoder.jp/contests/abc086/tasks/abc086_a"), "ABC086A - Product")).toEqual({
      platform: "atcoder",
      problemExternalId: "abc086_a",
      problemTitle: "ABC086A",
      canonicalUrl: "https://atcoder.jp/contests/abc086/tasks/abc086_a",
    });
  });

  it("detects NowCoder URLs conservatively", () => {
    expect(detectProblemFromLocation(asLocation("https://www.nowcoder.com/practice/example"), "Example - NowCoder")?.platform).toBe(
      "nowcoder",
    );
  });

  it("detects Luogu URLs conservatively", () => {
    expect(detectProblemFromLocation(asLocation("https://www.luogu.com.cn/problem/P1001"), "P1001 A+B Problem")?.platform).toBe(
      "luogu",
    );
  });

  it("returns null for unsupported hosts", () => {
    expect(detectProblemFromLocation(asLocation("https://example.com/problems/two-sum"), "Two Sum")).toBeNull();
  });
});

describe("detectVerdictFromDocument", () => {
  it("detects LeetCode accepted verdict text", () => {
    document.body.innerHTML = '<div data-e2e-locator="submission-result">Accepted</div>';

    expect(detectVerdictFromDocument("leetcode", document)).toEqual({ verdict: "Accepted" });
  });

  it("detects Codeforces wrong-answer verdict text", () => {
    document.body.innerHTML = '<td class="status-cell">Wrong answer on test 2</td>';

    expect(detectVerdictFromDocument("codeforces", document)).toEqual({ verdict: "Wrong Answer" });
  });

  it("detects AtCoder time-limit verdict text", () => {
    document.body.innerHTML = '<span id="judge-status">TLE</span>';

    expect(detectVerdictFromDocument("atcoder", document)).toEqual({ verdict: "Time Limit Exceeded" });
  });

  it("detects NowCoder partial verdict text", () => {
    document.body.innerHTML = '<div class="result">部分通过</div>';

    expect(detectVerdictFromDocument("nowcoder", document)).toEqual({ verdict: "Partially Accepted" });
  });

  it("detects NowCoder Chinese accepted verdict text", () => {
    document.body.innerHTML = '<div class="result">答案正确</div>';

    expect(detectVerdictFromDocument("nowcoder", document)).toEqual({ verdict: "Accepted" });
  });

  it("detects NowCoder Chinese wrong-answer verdict text", () => {
    document.body.innerHTML = '<div class="judge-result">答案错误</div>';

    expect(detectVerdictFromDocument("nowcoder", document)).toEqual({ verdict: "Wrong Answer" });
  });

  it("detects NowCoder Chinese compile-error verdict text", () => {
    document.body.innerHTML = '<div class="submission-result">编译错误</div>';

    expect(detectVerdictFromDocument("nowcoder", document)).toEqual({ verdict: "Compile Error" });
  });

  it("detects Luogu Chinese time-limit verdict text", () => {
    document.body.innerHTML = '<span class="record-status">运行超时</span>';

    expect(detectVerdictFromDocument("luogu", document)).toEqual({ verdict: "Time Limit Exceeded" });
  });

  it("detects Luogu Chinese memory-limit verdict text", () => {
    document.body.innerHTML = '<span class="submission-status">内存超限</span>';

    expect(detectVerdictFromDocument("luogu", document)).toEqual({ verdict: "Memory Limit Exceeded" });
  });

  it("detects Luogu Chinese runtime-error verdict text", () => {
    document.body.innerHTML = '<span class="status">段错误</span>';

    expect(detectVerdictFromDocument("luogu", document)).toEqual({ verdict: "Runtime Error" });
  });

  it("detects Luogu accepted verdict text", () => {
    document.body.innerHTML = '<span class="status">Accepted</span>';

    expect(detectVerdictFromDocument("luogu", document)).toEqual({ verdict: "Accepted" });
  });

  it("returns null when no verdict text is visible", () => {
    document.body.innerHTML = "<main>Problem statement</main>";

    expect(detectVerdictFromDocument("leetcode", document)).toBeNull();
  });
});

describe("adapter status registry", () => {
  it("initially has no production platform (certification gate must decide)", () => {
    expect(getProductionPlatforms()).toEqual([]);
  });

  it("every currently enabled platform is experimental or disabled", () => {
    for (const platform of ["leetcode", "nowcoder", "codeforces", "atcoder", "luogu"] as const) {
      const status = getPlatformAdapterStatus(platform);
      expect(["experimental", "disabled"]).toContain(status);
    }
  });

  it("every platform has an adapter record with label and selectors", () => {
    for (const record of Object.values(PLATFORM_ADAPTERS)) {
      expect(typeof record.label).toBe("string");
      expect(record.label.length).toBeGreaterThan(0);
      expect(Array.isArray(record.selectors)).toBe(true);
      expect(record.selectors.length).toBeGreaterThan(0);
    }
  });
});
