import { describe, expect, it } from "vitest";
import {
  detectProblemFromLocation,
  detectProblemFromPage,
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

function asDocument(html: string): Document {
  return new DOMParser().parseFromString(html, "text/html");
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

  // T4: AtCoder must only parse #judge-status, not broad td/body selectors
  it("AtCoder returns null when AC/WA/TLE appear outside #judge-status", () => {
    document.body.innerHTML = "<table><tr><td>AC</td></tr></table><main>TLE</main>";
    // With broad selectors this would return a false verdict
    expect(detectVerdictFromDocument("atcoder", document)).toBeNull();
  });

  it("AtCoder returns null for absent status element", () => {
    document.body.innerHTML = "<main>Problem statement only</main>";
    expect(detectVerdictFromDocument("atcoder", document)).toBeNull();
  });

  it("AtCoder returns null for empty #judge-status", () => {
    document.body.innerHTML = '<span id="judge-status"></span>';
    expect(detectVerdictFromDocument("atcoder", document)).toBeNull();
  });

  it("AtCoder returns null for WJ (Waiting) status", () => {
    document.body.innerHTML = '<span id="judge-status">WJ</span>';
    expect(detectVerdictFromDocument("atcoder", document)).toBeNull();
  });

  it("AtCoder returns null for Judging status", () => {
    document.body.innerHTML = '<span id="judge-status">Judging</span>';
    expect(detectVerdictFromDocument("atcoder", document)).toBeNull();
  });

  it("AtCoder selectors are exactly ['#judge-status']", () => {
    // This pins the fix so no broad selectors can creep back
    expect(PLATFORM_ADAPTERS.atcoder.selectors).toEqual(["#judge-status"]);
  });
});

describe("adapter status registry", () => {
  it("AtCoder is the sole production platform", () => {
    expect(getProductionPlatforms()).toEqual(["atcoder"]);
  });

  it("LeetCode, Codeforces, NowCoder, and Luogu are exactly experimental", () => {
    for (const platform of ["leetcode", "codeforces", "nowcoder", "luogu"] as const) {
      expect(getPlatformAdapterStatus(platform)).toBe("experimental");
    }
  });

  it("AtCoder is production", () => {
    expect(getPlatformAdapterStatus("atcoder")).toBe("production");
  });

  it("Luogu is never included in production platforms", () => {
    expect(getProductionPlatforms()).not.toContain("luogu");
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

describe("detectProblemFromPage", () => {
  type PageAwareIdentity = {
    readonly platform: "atcoder";
    readonly problemExternalId: string;
    readonly problemTitle: string;
    readonly canonicalUrl: string;
  };
  type MatchCase = readonly [name: string, url: string, anchorHtml: string, expected: PageAwareIdentity];
  type RejectCase = readonly [name: string, url: string, anchorHtml: string, hrefOverride: string];
  const TASK_D = '<a href="/contests/agc040/tasks/agc040_d">D - Balance Beam</a>';
  const TASK_E = '<a href="/contests/agc040/tasks/agc040_e">E - Another</a>';
  const TASK_URL = "https://atcoder.jp/contests/agc040/tasks/agc040_d";
  const SUB_URL = "https://atcoder.jp/contests/agc040/submissions/53759742";
  const CANON = "https://atcoder.jp/contests/agc040/tasks/agc040_d";
  const wrapDoc = (body: string): Document =>
    asDocument(`<!doctype html><html><head><title>D - Balance Beam</title></head><body>${body}</body></html>`);

  const MATCH_CASES: readonly MatchCase[] = [
    ["task URL via URL-only branch with ?lang=en query", `${TASK_URL}?lang=en`, TASK_D, { platform: "atcoder", problemExternalId: "agc040_d", problemTitle: "D", canonicalUrl: CANON }],
    ["submission URL via same-contest anchor", SUB_URL, TASK_D, { platform: "atcoder", problemExternalId: "agc040_d", problemTitle: "D - Balance Beam", canonicalUrl: CANON }],
    ["submission URL with ?lang=en query preserved", `${SUB_URL}?lang=en`, TASK_D, { platform: "atcoder", problemExternalId: "agc040_d", problemTitle: "D - Balance Beam", canonicalUrl: CANON }],
    ["two duplicate anchors collapse to one normalized identity", SUB_URL, TASK_D + TASK_D, { platform: "atcoder", problemExternalId: "agc040_d", problemTitle: "D - Balance Beam", canonicalUrl: CANON }],
  ];

const REJECT_CASES: readonly RejectCase[] = [
    ["submission page with no task anchor", SUB_URL, "<span>no link</span>", ""],
    ["submission page with two distinct valid task anchors", SUB_URL, TASK_D + TASK_E, ""],
    ["anchor links to a different contest path", SUB_URL, '<a href="/contests/abc164/tasks/abc164_e">E - Two Currencies</a>', ""],
    ["same-contest path but normalized task contest mismatch (agc040 vs abc164_e)", SUB_URL, '<a href="/contests/agc040/tasks/abc164_e">E - Two Currencies</a>', ""],
    ["raw anchor-path contest mismatches submission contest even though normalized task contest matches (agc040 vs abc164 path, agc040_d id)", SUB_URL, '<a href="/contests/abc164/tasks/agc040_d">D - Balance Beam</a>', ""],
    ["attacker anchor host containing atcoder.jp", SUB_URL, '<a href="https://atcoder.jp.evil.example/contests/agc040/tasks/agc040_d">spoofed</a>', ""],
    ["nonnumeric submission ID segment", "https://atcoder.jp/contests/agc040/submissions/notanumber", TASK_D, ""],
    ["invalid AtCoder task ID format", SUB_URL, '<a href="/contests/agc040/tasks/!!invalid!!">bad</a>', ""],
    ["only exposes a document title", SUB_URL, "", ""],
    ["submission-style path on unsupported host", "https://example.com/contests/agc040/submissions/53759742", TASK_D, ""],
    ["page-location spoof on task-style path", "https://atcoder.jp.evil.example/contests/agc040/tasks/agc040_d", TASK_D, ""],
    ["page-location spoof on submission-style path", "https://atcoder.jp.evil.example/contests/agc040/submissions/53759742", TASK_D, ""],
    ["page URL with http (not https)", "http://atcoder.jp/contests/agc040/tasks/agc040_d", TASK_D, ""],
    ["page URL with unexpected port", "https://atcoder.jp:8080/contests/agc040/submissions/53759742", TASK_D, ""],
    ["page URL with credentials", "https://user:pass@atcoder.jp/contests/agc040/submissions/53759742", TASK_D, ""],
    ["inconsistent DetectableLocation with evil href but first-party hostname/pathname", SUB_URL, TASK_D, "https://atcoder.jp.evil.example/contests/agc040/submissions/53759742"],
    ["inconsistent DetectableLocation with evil href on task-style path", TASK_URL, TASK_D, "https://atcoder.jp.evil.example/contests/agc040/tasks/agc040_d"],
    ["anchor with query string", SUB_URL, '<a href="/contests/agc040/tasks/agc040_d?foo=bar">D - Balance Beam</a>', ""],
    ["anchor with hash fragment", SUB_URL, '<a href="/contests/agc040/tasks/agc040_d#frag">D - Balance Beam</a>', ""],
    ["anchor with http (not https)", SUB_URL, '<a href="http://atcoder.jp/contests/agc040/tasks/agc040_d">D - Balance Beam</a>', ""],
    ["anchor with unexpected port", SUB_URL, '<a href="https://atcoder.jp:8080/contests/agc040/tasks/agc040_d">D - Balance Beam</a>', ""],
    ["anchor with credentials", SUB_URL, '<a href="https://user:pass@atcoder.jp/contests/agc040/tasks/agc040_d">D - Balance Beam</a>', ""],
    ["anchor with ftp scheme", SUB_URL, '<a href="ftp://atcoder.jp/contests/agc040/tasks/agc040_d">D - Balance Beam</a>', ""],
  ];

  const locationFor = (url: string, hrefOverride: string): DetectableLocation => {
    if (hrefOverride === "") return asLocation(url);
    const claimed = new URL(url);
    return { href: hrefOverride, hostname: claimed.hostname, pathname: claimed.pathname };
  };

  it.each(MATCH_CASES)("[%s] resolves to expected identity", (_n, url, anchorHtml, expected) => {
    expect(detectProblemFromPage(asLocation(url), wrapDoc(anchorHtml))).toEqual(expected);
  });
  it.each(REJECT_CASES)("[%s] rejects and returns null", (_n, url, anchorHtml, hrefOverride) => {
    expect(detectProblemFromPage(locationFor(url, hrefOverride), wrapDoc(anchorHtml))).toBeNull();
  });
});
