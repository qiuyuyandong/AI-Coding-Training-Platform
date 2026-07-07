import { describe, expect, it } from "vitest";
import { detectProblemFromLocation, detectVerdictFromDocument, type DetectableLocation } from "@/extension/src/platforms";

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

  it("detects Codeforces problem URLs", () => {
    expect(detectProblemFromLocation(asLocation("https://codeforces.com/problemset/problem/4/A"), "A. Watermelon")).toEqual({
      platform: "codeforces",
      problemExternalId: "4A",
      problemTitle: "A. Watermelon",
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

  it("detects Luogu accepted verdict text", () => {
    document.body.innerHTML = '<span class="status">Accepted</span>';

    expect(detectVerdictFromDocument("luogu", document)).toEqual({ verdict: "Accepted" });
  });

  it("returns null when no verdict text is visible", () => {
    document.body.innerHTML = "<main>Problem statement</main>";

    expect(detectVerdictFromDocument("leetcode", document)).toBeNull();
  });
});
