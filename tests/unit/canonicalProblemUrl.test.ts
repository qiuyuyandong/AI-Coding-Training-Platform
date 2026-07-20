import { describe, expect, it } from "vitest";
import {
  canonicalProblemUrl,
  normalizeProblemIdentity,
} from "@/lib/services/canonicalProblemUrl";

describe("canonical problem identity", () => {
  it.each([
    [
      { platform: "leetcode" as const, externalId: "/Two-Sum/" },
      { platform: "leetcode", externalId: "two-sum" },
      "https://leetcode.cn/problems/two-sum/",
    ],
    [
      { platform: "codeforces" as const, externalId: "123b1" },
      { platform: "codeforces", externalId: "123B1" },
      "https://codeforces.com/problemset/problem/123/B1",
    ],
    [
      { platform: "atcoder" as const, externalId: "ABC086_A" },
      { platform: "atcoder", externalId: "abc086_a" },
      "https://atcoder.jp/contests/abc086/tasks/abc086_a",
    ],
    [
      { platform: "luogu" as const, externalId: "/problem/p1001" },
      { platform: "luogu", externalId: "P1001" },
      "https://www.luogu.com.cn/problem/P1001",
    ],
    [
      { platform: "nowcoder" as const, externalId: "/practice/example" },
      { platform: "nowcoder", externalId: "practice/example" },
      "https://www.nowcoder.com/practice/example",
    ],
    [
      { platform: "nowcoder" as const, externalId: "https://ac.nowcoder.com/acm/problem/25000" },
      { platform: "nowcoder", externalId: "acm/problem/25000" },
      "https://ac.nowcoder.com/acm/problem/25000",
    ],
  ])("normalizes %j", (input, identity, url) => {
    expect(normalizeProblemIdentity(input)).toEqual(identity);
    expect(canonicalProblemUrl(input)).toBe(url);
  });

  it("normalizes a manual observed URL without inventing identity", () => {
    const identity = { platform: "manual" as const, externalId: " local-42 " };

    expect(normalizeProblemIdentity(identity)).toEqual({
      platform: "manual",
      externalId: "local-42",
    });
    expect(canonicalProblemUrl(
      identity,
      "https://Example.com/tasks/42/?view=full#answer",
    )).toBe("https://example.com/tasks/42/");
  });

  it.each([
    [{ platform: "codeforces" as const, externalId: "bad" }, "Invalid Codeforces problem ID"],
    [{ platform: "atcoder" as const, externalId: "abc086" }, "Invalid AtCoder task ID"],
    [{ platform: "leetcode" as const, externalId: " / " }, "Problem external ID is required"],
    [{ platform: "leetcode" as const, externalId: "two sum" }, "Invalid LeetCode problem slug"],
    [{ platform: "leetcode" as const, externalId: "-two-sum" }, "Invalid LeetCode problem slug"],
    [{ platform: "leetcode" as const, externalId: "two-sum-" }, "Invalid LeetCode problem slug"],
    [{ platform: "luogu" as const, externalId: "record/123" }, "Invalid Luogu problem ID"],
    [{ platform: "luogu" as const, externalId: "/record/123" }, "Invalid Luogu problem ID"],
    [{ platform: "nowcoder" as const, externalId: "https://www.nowcoder.com/company/home" }, "Invalid NowCoder problem path"],
    [{ platform: "nowcoder" as const, externalId: "https://ac.nowcoder.com/contest/1" }, "Invalid NowCoder problem path"],
    [{ platform: "nowcoder" as const, externalId: "http://www.nowcoder.com/practice/example" }, "Invalid NowCoder problem path"],
    [{ platform: "nowcoder" as const, externalId: "https://user:pass@www.nowcoder.com/practice/example" }, "Invalid NowCoder problem path"],
    [{ platform: "nowcoder" as const, externalId: "https://www.nowcoder.com:8080/practice/example" }, "Invalid NowCoder problem path"],
    [{ platform: "nowcoder" as const, externalId: "https://leetcode.cn/problems/two-sum/" }, "Invalid NowCoder problem path"],
    [{ platform: "nowcoder" as const, externalId: "https://nowcoder.com/practice/example" }, "Invalid NowCoder problem path"],
  ])("rejects malformed identity %j", (identity, message) => {
    expect(() => normalizeProblemIdentity(identity)).toThrow(message);
  });

  it("strips trailing slashes and query strings from NowCoder identity", () => {
    const identity = { platform: "nowcoder" as const, externalId: "/practice/example/?from=nav#answer" };

    expect(normalizeProblemIdentity(identity)).toEqual({
      platform: "nowcoder",
      externalId: "practice/example",
    });
    expect(canonicalProblemUrl(identity)).toBe("https://www.nowcoder.com/practice/example");
  });

  it("produces the leetcode.cn canonical URL even when the source URL is leetcode.com", () => {
    expect(canonicalProblemUrl({
      platform: "leetcode",
      externalId: "two-sum",
    }, "https://leetcode.com/problems/two-sum/description/?envType=daily")).toBe(
      "https://leetcode.cn/problems/two-sum/",
    );
  });

  it("requires a safe observed URL for manual problems", () => {
    const identity = { platform: "manual" as const, externalId: "local-42" };

    expect(() => canonicalProblemUrl(identity)).toThrow("Manual problems require an observed URL");
    expect(() => canonicalProblemUrl(identity, "javascript:alert(1)"))
      .toThrow("Problem URL must use HTTP or HTTPS");
  });
});