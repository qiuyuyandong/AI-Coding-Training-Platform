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
      "https://leetcode.com/problems/two-sum/",
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
      { platform: "nowcoder" as const, externalId: "practice/example/?from=nav#answer" },
      { platform: "nowcoder", externalId: "/practice/example" },
      "https://www.nowcoder.com/practice/example",
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
  ])("rejects malformed identity %j", (identity, message) => {
    expect(() => normalizeProblemIdentity(identity)).toThrow(message);
  });

  it("requires a safe observed URL for manual problems", () => {
    const identity = { platform: "manual" as const, externalId: "local-42" };

    expect(() => canonicalProblemUrl(identity)).toThrow("Manual problems require an observed URL");
    expect(() => canonicalProblemUrl(identity, "javascript:alert(1)"))
      .toThrow("Problem URL must use HTTP or HTTPS");
  });
});
