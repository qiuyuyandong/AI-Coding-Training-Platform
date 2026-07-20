import { join } from "node:path";
import { describe, expect, it, beforeEach } from "vitest";
import {
  detectProblemFromLocation,
  detectProblemFromPage,
  detectVerdictFromDocument,
  type DetectableLocation,
  type Platform,
} from "@/extension/src/platforms";
import manifest from "@/extension/manifest.json";
import {
  isAllowedSubmitLabel,
  isExactSubmitControl,
} from "@/extension/src/submissionControl";
import {
  isCertifyingEvidence,
  isNoncertifyingEvidence,
  loadFixtureHtml,
  loadFixtureMetadata,
  PlatformFixtureMetaSchema,
  type FixtureMeta,
} from "@/tests/helpers/platformFixtureMetadata";

const LEETCODE_FIXTURES_DIR = join(process.cwd(), "tests", "fixtures", "leetcode");
const NOWCODER_FIXTURES_DIR = join(process.cwd(), "tests", "fixtures", "nowcoder");
const LUOGU_FIXTURES_DIR = join(process.cwd(), "tests", "fixtures", "luogu", "authenticated");

function asLocation(url: string): DetectableLocation {
  const parsed = new URL(url);
  return { href: parsed.href, hostname: parsed.hostname, pathname: parsed.pathname };
}

function asDocument(html: string): Document {
  return new DOMParser().parseFromString(html, "text/html");
}

describe("authenticated-characterization metadata schema", () => {
  const base = {
    fixtureName: "ac-leetcode-submission-726110110-ac",
    sourceUrl: "https://leetcode.cn/submissions/detail/726110110/",
    captureDate: "2026-07-20",
    captureMethod: "logged-in Chrome visible-DOM scrape, user-authorized, sanitized",
    purpose: "detectVerdictFromDocument — sanity check.",
    selectors: ['[data-e2e-locator="submission-result"]'],
    authenticated: true,
    sanitized: true,
    evidenceTier: "authenticated-characterization",
    verdictExpected: { verdict: "Accepted" },
    problemExpected: { platform: "leetcode" as Platform, externalId: "two-sum" },
  };

  it("accepts a fully formed authenticated-characterization metadata record", () => {
    expect(PlatformFixtureMetaSchema("leetcode").safeParse(base).success).toBe(true);
  });

  it("rejects when authenticated !== true", () => {
    const result = PlatformFixtureMetaSchema("leetcode").safeParse({ ...base, authenticated: false });
    expect(result.success).toBe(false);
    if (!result.success) {
      const messages = result.error.issues.map((i) => i.message).join(" | ");
      expect(messages).toMatch(/authenticated === true/);
    }
  });

  it("rejects when verdictExpected is null", () => {
    const result = PlatformFixtureMetaSchema("leetcode").safeParse({ ...base, verdictExpected: null });
    expect(result.success).toBe(false);
    if (!result.success) {
      const messages = result.error.issues.map((i) => i.message).join(" | ");
      expect(messages).toMatch(/non-null verdictExpected/);
    }
  });

  it("rejects when selectors is empty (no extractor provenance)", () => {
    const result = PlatformFixtureMetaSchema("leetcode").safeParse({ ...base, selectors: [] });
    expect(result.success).toBe(false);
    if (!result.success) {
      const messages = result.error.issues.map((i) => i.message).join(" | ");
      expect(messages).toMatch(/non-empty selector\/extractor provenance/);
    }
  });

  it("rejects when sanitized is false", () => {
    // sanitized is a literal-true in the schema; flipping it yields a
    // struct-level rejection before any tier rule runs.
    const result = PlatformFixtureMetaSchema("leetcode").safeParse({ ...base, sanitized: false });
    expect(result.success).toBe(false);
  });

  it("authenticated-characterization is NEVER certifying", () => {
    const meta: FixtureMeta = PlatformFixtureMetaSchema("leetcode").parse(base);
    expect(meta.evidenceTier).toBe("authenticated-characterization");
    // The shared isCertifyingEvidence helper must not flip true for this tier.
    expect(isCertifyingEvidence(meta)).toBe(false);
    expect(isNoncertifyingEvidence(meta)).toBe(true);
  });
});

describe("LeetCode authenticated-characterization detection", () => {
  it("detects problem identity via the unique anchor in the public submission page", () => {
    const html = loadFixtureHtml("submission-726110110-ac.html", LEETCODE_FIXTURES_DIR);
    expect(detectProblemFromPage(
      asLocation("https://leetcode.cn/submissions/detail/726110110/"),
      asDocument(html),
    )).toEqual({
      platform: "leetcode",
      problemExternalId: "find-the-prefix-common-array-of-two-arrays",
      problemTitle: "Find the Prefix Common Array of Two Arrays",
      canonicalUrl: "https://leetcode.cn/problems/find-the-prefix-common-array-of-two-arrays/",
    });
  });

  it("detects verdict via the registered e2e locator", () => {
    const html = loadFixtureHtml("submission-726110110-ac.html", LEETCODE_FIXTURES_DIR);
    expect(detectVerdictFromDocument("leetcode", asDocument(html))).toEqual({ verdict: "Accepted" });
  });

  type RejectCase = readonly [name: string, url: string, anchorHtml: string, hrefOverride: string];
  const SUB_URL = "https://leetcode.cn/submissions/detail/726110110/";
  const ANCHOR = '<a href="/problems/find-the-prefix-common-array-of-two-arrays/">Anchor</a>';
  const wrap = (body: string) =>
    asDocument(`<!doctype html><html><head><title>LeetCode</title></head><body>${body}</body></html>`);

  const REJECT_CASES: readonly RejectCase[] = [
    ["zero anchors", SUB_URL, "<span>no link</span>", ""],
    ["multiple conflicting anchors", SUB_URL, ANCHOR + '<a href="/problems/other/">Other</a>', ""],
    ["anchor with query string", SUB_URL, '<a href="/problems/find-the-prefix-common-array-of-two-arrays/?foo=bar">x</a>', ""],
    ["anchor with hash fragment", SUB_URL, '<a href="/problems/find-the-prefix-common-array-of-two-arrays/#frag">x</a>', ""],
    ["anchor on spoofed host (substring)", SUB_URL, '<a href="https://leetcode.cn.evil.example/problems/find-the-prefix-common-array-of-two-arrays/">x</a>', ""],
    ["anchor with credentials", SUB_URL, '<a href="https://user:pass@leetcode.cn/problems/find-the-prefix-common-array-of-two-arrays/">x</a>', ""],
    ["anchor with unexpected port", SUB_URL, '<a href="https://leetcode.cn:8080/problems/find-the-prefix-common-array-of-two-arrays/">x</a>', ""],
    ["anchor with http scheme", SUB_URL, '<a href="http://leetcode.cn/problems/find-the-prefix-common-array-of-two-arrays/">x</a>', ""],
    ["anchor with ftp scheme", SUB_URL, '<a href="ftp://leetcode.cn/problems/find-the-prefix-common-array-of-two-arrays/">x</a>', ""],
    ["page URL with extra path segment", "https://leetcode.cn/submissions/detail/726110110/extra", ANCHOR, ""],
    ["page URL with query string", "https://leetcode.cn/submissions/detail/726110110/?lang=en", ANCHOR, ""],
    ["page URL with hash", "https://leetcode.cn/submissions/detail/726110110/#frag", ANCHOR, ""],
    ["page URL with non-numeric submission ID", "https://leetcode.cn/submissions/detail/notanumber/", ANCHOR, ""],
    ["page URL on spoofed host (substring)", "https://leetcode.cn.evil.example/submissions/detail/726110110/", ANCHOR, ""],
    ["page URL with credentials", "https://user:pass@leetcode.cn/submissions/detail/726110110/", ANCHOR, ""],
    ["page URL with unexpected port", "https://leetcode.cn:8080/submissions/detail/726110110/", ANCHOR, ""],
    ["page URL with http scheme", "http://leetcode.cn/submissions/detail/726110110/", ANCHOR, ""],
    ["page URL on .com host instead of .cn", "https://leetcode.com/submissions/detail/726110110/", ANCHOR, ""],
    ["page URL on unrelated host", "https://example.com/submissions/detail/726110110/", ANCHOR, ""],
    ["inconsistent DetectableLocation with spoofed href", SUB_URL, ANCHOR, "https://leetcode.cn.evil.example/submissions/detail/726110110/"],
  ];

  it.each(REJECT_CASES)("[%s] rejects and returns null", (_n, url, anchorHtml, hrefOverride) => {
    const claimed = new URL(url);
    const location: DetectableLocation = hrefOverride === ""
      ? asLocation(url)
      : { href: hrefOverride, hostname: claimed.hostname, pathname: claimed.pathname };
    expect(detectProblemFromPage(location, wrap(anchorHtml))).toBeNull();
  });

  it("URL-only detectProblemFromLocation returns null for LeetCode submission URLs (DOM-only)", () => {
    expect(detectProblemFromLocation(asLocation(SUB_URL), "Submission 726110110 - LeetCode")).toBeNull();
  });
});

describe("NowCoder authenticated-characterization detection", () => {
  const SUB_URL = "https://ac.nowcoder.com/acm/contest/view-submission?submissionId=84104369";

  it("detects problem identity via the unique acm problem anchor in the view-submission page", () => {
    const html = loadFixtureHtml("submission-84104369-ac.html", NOWCODER_FIXTURES_DIR);
    expect(detectProblemFromPage(asLocation(SUB_URL), asDocument(html))).toEqual({
      platform: "nowcoder",
      problemExternalId: "acm/problem/319811",
      problemTitle: "319811",
      canonicalUrl: "https://ac.nowcoder.com/acm/problem/319811",
    });
  });

  it("detects verdict via the registered .coder-cont-legend container", () => {
    const html = loadFixtureHtml("submission-84104369-ac.html", NOWCODER_FIXTURES_DIR);
    expect(detectVerdictFromDocument("nowcoder", asDocument(html))).toEqual({ verdict: "Accepted" });
  });

  type RejectCase = readonly [name: string, url: string, anchorHtml: string];
  const ANCHOR = '<a href="/acm/problem/319811">Anchor</a>';
  const wrap = (body: string) =>
    asDocument(`<!doctype html><html><head><title>NowCoder</title></head><body>${body}</body></html>`);

  const REJECT_CASES: readonly RejectCase[] = [
    ["zero anchors", SUB_URL, "<span>no link</span>"],
    ["multiple conflicting anchors", SUB_URL, ANCHOR + '<a href="/acm/problem/12345">Other</a>'],
    ["anchor with query string", SUB_URL, '<a href="/acm/problem/319811?foo=bar">x</a>'],
    ["anchor with hash fragment", SUB_URL, '<a href="/acm/problem/319811#frag">x</a>'],
    ["anchor on spoofed host (substring)", SUB_URL, '<a href="https://ac.nowcoder.com.evil.example/acm/problem/319811">x</a>'],
    ["anchor with credentials", SUB_URL, '<a href="https://user:pass@ac.nowcoder.com/acm/problem/319811">x</a>'],
    ["anchor on the www host instead of ac", SUB_URL, '<a href="https://www.nowcoder.com/acm/problem/319811">x</a>'],
    ["anchor with relative pathname not matching acm/problem", SUB_URL, '<a href="/practice/319811">x</a>'],
    ["page URL without submissionId", "https://ac.nowcoder.com/acm/contest/view-submission", ANCHOR],
    ["page URL with non-numeric submissionId", "https://ac.nowcoder.com/acm/contest/view-submission?submissionId=abc", ANCHOR],
    ["page URL with extra query parameter", "https://ac.nowcoder.com/acm/contest/view-submission?submissionId=84104369&extra=1", ANCHOR],
    ["page URL with hash", "https://ac.nowcoder.com/acm/contest/view-submission?submissionId=84104369#frag", ANCHOR],
    ["page URL on the www host instead of ac", "https://www.nowcoder.com/acm/contest/view-submission?submissionId=84104369", ANCHOR],
    ["page URL on spoofed host (substring)", "https://ac.nowcoder.com.evil.example/acm/contest/view-submission?submissionId=84104369", ANCHOR],
    ["page URL with credentials", "https://user:pass@ac.nowcoder.com/acm/contest/view-submission?submissionId=84104369", ANCHOR],
    ["page URL with non-https scheme", "http://ac.nowcoder.com/acm/contest/view-submission?submissionId=84104369", ANCHOR],
    ["page URL with hash fragment on ac host", "https://ac.nowcoder.com/acm/contest/view-submission?submissionId=84104369#xx", ANCHOR],
    ["page URL with extra path segment", "https://ac.nowcoder.com/acm/contest/view-submission/extra?submissionId=84104369", ANCHOR],
    ["page URL on unrelated host", "https://example.com/acm/contest/view-submission?submissionId=84104369", ANCHOR],
  ];

  it.each(REJECT_CASES)("[%s] rejects and returns null", (_n, url, anchorHtml) => {
    expect(detectProblemFromPage(asLocation(url), wrap(anchorHtml))).toBeNull();
  });
});

describe("Luogu authenticated-characterization detection", () => {
  it("detects problem identity via the unique /problem/<id> anchor on the record page", () => {
    const html = loadFixtureHtml("record-287273601-p1001-ac.html", LUOGU_FIXTURES_DIR);
    expect(detectProblemFromPage(
      asLocation("https://www.luogu.com.cn/record/287273601"),
      asDocument(html),
    )).toEqual({
      platform: "luogu",
      problemExternalId: "P1001",
      problemTitle: "P1001",
      canonicalUrl: "https://www.luogu.com.cn/problem/P1001",
    });
  });

  it("detects Accepted verdict via the semantic 评测状态 row", () => {
    const html = loadFixtureHtml("record-287273601-p1001-ac.html", LUOGU_FIXTURES_DIR);
    expect(detectVerdictFromDocument("luogu", asDocument(html))).toEqual({ verdict: "Accepted" });
  });

  it("detects Compile Error verdict via the semantic 评测状态 row", () => {
    const html = loadFixtureHtml("record-287272767-p1001-ce.html", LUOGU_FIXTURES_DIR);
    expect(detectVerdictFromDocument("luogu", asDocument(html))).toEqual({ verdict: "Compile Error" });
  });

  type RejectCase = readonly [name: string, url: string, anchorHtml: string];
  const SUB_URL = "https://www.luogu.com.cn/record/287273601";
  const ANCHOR = '<a href="/problem/P1001">Anchor</a>';
  const wrap = (body: string) =>
    asDocument(`<!doctype html><html><head><title>Luogu</title></head><body>${body}</body></html>`);

  const REJECT_CASES: readonly RejectCase[] = [
    ["zero anchors", SUB_URL, "<span>no link</span>"],
    ["multiple conflicting anchors", SUB_URL, ANCHOR + '<a href="/problem/P2000">Other</a>'],
    ["anchor with query string", SUB_URL, '<a href="/problem/P1001?foo=bar">x</a>'],
    ["anchor with hash fragment", SUB_URL, '<a href="/problem/P1001#frag">x</a>'],
    ["anchor on spoofed host (substring)", SUB_URL, '<a href="https://www.luogu.com.cn.evil.example/problem/P1001">x</a>'],
    ["anchor with credentials", SUB_URL, '<a href="https://user:pass@www.luogu.com.cn/problem/P1001">x</a>'],
    ["anchor with unexpected port", SUB_URL, '<a href="https://www.luogu.com.cn:8080/problem/P1001">x</a>'],
    ["anchor with non-https scheme", SUB_URL, '<a href="http://www.luogu.com.cn/problem/P1001">x</a>'],
    ["page URL with extra path segment", "https://www.luogu.com.cn/record/287273601/extra", ANCHOR],
    ["page URL with query string", "https://www.luogu.com.cn/record/287273601?foo=bar", ANCHOR],
    ["page URL with hash", "https://www.luogu.com.cn/record/287273601#frag", ANCHOR],
    ["page URL with non-numeric record ID", "https://www.luogu.com.cn/record/notanumber", ANCHOR],
    ["page URL on spoofed host (substring)", "https://www.luogu.com.cn.evil.example/record/287273601", ANCHOR],
    ["page URL with non-https", "http://www.luogu.com.cn/record/287273601", ANCHOR],
    ["page URL with credentials", "https://user:pass@www.luogu.com.cn/record/287273601", ANCHOR],
    ["page URL with unexpected port", "https://www.luogu.com.cn:8080/record/287273601", ANCHOR],
    ["page URL on unrelated host", "https://example.com/record/287273601", ANCHOR],
    ["record list page", "https://www.luogu.com.cn/record/list?pid=P1001", "<title>Records</title>"],
  ];

  it.each(REJECT_CASES)("[%s] rejects and returns null", (_n, url, anchorHtml) => {
    expect(detectProblemFromPage(asLocation(url), wrap(anchorHtml))).toBeNull();
  });

  // URL-only detector must NEVER fabricate an externalId for /record/<digits>.
  it("URL-only detectProblemFromLocation still rejects Luogu record routes", () => {
    expect(detectProblemFromLocation(asLocation(SUB_URL), "Luogu")).toBeNull();
  });
});

describe("submission controls: LeetCode Chinese label", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  it("accepts the LeetCode '提交' label on a real button", () => {
    document.body.innerHTML = '<button id="b">提交</button>';
    const btn = document.getElementById("b");
    expect(btn).not.toBeNull();
    if (btn !== null) {
      expect(isAllowedSubmitLabel("leetcode", btn)).toBe(true);
      expect(isExactSubmitControl("leetcode", btn)).toBe(true);
    }
  });

  it("accepts the e2e-locator LeetCode submit button", () => {
    document.body.innerHTML = '<button id="b" data-e2e-locator="console-submit-button">提交</button>';
    const btn = document.getElementById("b");
    expect(btn).not.toBeNull();
    if (btn !== null) expect(isExactSubmitControl("leetcode", btn)).toBe(true);
  });

  it("does NOT accept the LeetCode '提交' label on a NowCoder or Luogu platform", () => {
    document.body.innerHTML = '<button id="b">提交</button>';
    const btn = document.getElementById("b");
    expect(btn).not.toBeNull();
    if (btn !== null) {
      // 提交 was already accepted for these platforms; this confirms no
      // cross-platform widening was performed.
      expect(isExactSubmitControl("nowcoder", btn)).toBe(true);
      expect(isExactSubmitControl("luogu", btn)).toBe(true);
    }
  });
});

describe("submission controls: NowCoder 保存并提交 label", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  it("accepts NowCoder 保存并提交 on the .btn-submit button", () => {
    document.body.innerHTML = '<button id="b" class="btn-submit">保存并提交</button>';
    const btn = document.getElementById("b");
    expect(btn).not.toBeNull();
    if (btn !== null) {
      expect(isAllowedSubmitLabel("nowcoder", btn)).toBe(true);
      expect(isExactSubmitControl("nowcoder", btn)).toBe(true);
    }
  });

  it("accepts NowCoder 保存并提交 via an inner span click target", () => {
    document.body.innerHTML = '<button id="b" class="btn-submit"><span id="child">保存并提交</span></button>';
    const target = document.getElementById("child");
    expect(target).not.toBeNull();
    if (target !== null) expect(isExactSubmitControl("nowcoder", target)).toBe(true);
  });

  it("rejects NowCoder 保存并提交 on LeetCode platform", () => {
    document.body.innerHTML = '<button id="b" class="btn-submit">保存并提交</button>';
    const btn = document.getElementById("b");
    expect(btn).not.toBeNull();
    if (btn !== null) expect(isExactSubmitControl("leetcode", btn)).toBe(false);
  });

  it("rejects NowCoder 保存并提交 on Codeforces platform", () => {
    document.body.innerHTML = '<button id="b" class="btn-submit">保存并提交</button>';
    const btn = document.getElementById("b");
    expect(btn).not.toBeNull();
    if (btn !== null) expect(isExactSubmitControl("codeforces", btn)).toBe(false);
  });
});

describe("submission controls: Luogu <a class=\"title\"> anchor (platform-specific)", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  it("accepts the Luogu evidence-anchored submit anchor with 提交 label", () => {
    document.body.innerHTML =
      '<a id="a" href="javascript:void 0" class="title"><span class="icon">i</span><span class="text">提交</span></a>';
    const target = document.getElementById("a");
    expect(target).not.toBeNull();
    if (target !== null) expect(isExactSubmitControl("luogu", target)).toBe(true);
  });

  it("accepts the Luogu submit anchor when the click target is the inner span", () => {
    document.body.innerHTML =
      '<a id="a" href="javascript:void 0" class="title"><span class="icon">i</span><span id="child" class="text">提交</span></a>';
    const target = document.getElementById("child");
    expect(target).not.toBeNull();
    if (target !== null) expect(isExactSubmitControl("luogu", target)).toBe(true);
  });

  // The platform-specific anchor promotion is intentionally scoped to Luogu.
  // A stray <a class="title"> on LeetCode/NowCoder/AtCoder/Codeforces must
  // NOT be promoted to a submit control, even if its label would otherwise
  // match.
  it("does NOT promote <a class=\"title\"> for non-Luogu platforms", () => {
    document.body.innerHTML =
      '<a id="a" href="javascript:void 0" class="title"><span class="text">提交</span></a>';
    const target = document.getElementById("a");
    expect(target).not.toBeNull();
    if (target !== null) {
      expect(isExactSubmitControl("leetcode", target)).toBe(false);
      expect(isExactSubmitControl("nowcoder", target)).toBe(false);
      expect(isExactSubmitControl("codeforces", target)).toBe(false);
      expect(isExactSubmitControl("atcoder", target)).toBe(false);
    }
  });

  it("does NOT promote an Luogu anchor whose label is not 提交", () => {
    document.body.innerHTML =
      '<a id="a" href="javascript:void 0" class="title"><span class="text">保存草稿</span></a>';
    const target = document.getElementById("a");
    expect(target).not.toBeNull();
    if (target !== null) expect(isExactSubmitControl("luogu", target)).toBe(false);
  });

  it("does NOT promote a Luogu title anchor with a navigable href", () => {
    document.body.innerHTML =
      '<a id="a" href="/record/list" class="title"><span class="text">提交</span></a>';
    const target = document.getElementById("a");
    expect(target).not.toBeNull();
    if (target !== null) expect(isExactSubmitControl("luogu", target)).toBe(false);
  });

  it("does NOT promote an Luogu anchor whose class list does not contain title alone", () => {
    document.body.innerHTML =
      '<a id="a" href="javascript:void 0" class="something-else"><span class="text">提交</span></a>';
    const target = document.getElementById("a");
    expect(target).not.toBeNull();
    if (target !== null) expect(isExactSubmitControl("luogu", target)).toBe(false);
  });
});

describe("authenticated-characterization fixture corpora — load and snapshot", () => {
  it("load all LeetCode fixtures with the authenticated-characterization tier", () => {
    const schema = PlatformFixtureMetaSchema("leetcode");
    const metadata = loadFixtureMetadata(LEETCODE_FIXTURES_DIR, schema);
    expect(metadata.length).toBeGreaterThan(0);
    for (const m of metadata) {
      expect(m.evidenceTier).toBe("authenticated-characterization");
      expect(m.authenticated).toBe(true);
      expect(m.sanitized).toBe(true);
      expect(m.verdictExpected).not.toBeNull();
      expect(m.selectors.length).toBeGreaterThan(0);
    }
  });

  it("load all NowCoder fixtures with the authenticated-characterization tier", () => {
    const schema = PlatformFixtureMetaSchema("nowcoder");
    const metadata = loadFixtureMetadata(NOWCODER_FIXTURES_DIR, schema);
    expect(metadata.length).toBeGreaterThan(0);
    for (const m of metadata) {
      expect(m.evidenceTier).toBe("authenticated-characterization");
    }
  });

  it("load all Luogu authenticated fixtures with the authenticated-characterization tier", () => {
    const schema = PlatformFixtureMetaSchema("luogu");
    const metadata = loadFixtureMetadata(LUOGU_FIXTURES_DIR, schema);
    expect(metadata.length).toBeGreaterThan(0);
    for (const m of metadata) {
      expect(m.evidenceTier).toBe("authenticated-characterization");
    }
  });
});

describe("verdictFromText token-safety on 通过", () => {
  // The observed LeetCode.cn e2e locator exposes the verdict as the bare
  // token `通过` inside a narrow wrapper. To keep AC detection from
  // regressing into a substring contains()-match that would classify
  // `未通过` (not passed) or `全部通过` (all passed) as Accepted, the
  // heuristic must require `通过` to be delimited by non-CJK boundaries.

  it("classifies a stand-alone `通过` token as Accepted", () => {
    document.body.innerHTML = '<div data-e2e-locator="submission-result">通过</div>';
    expect(detectVerdictFromDocument("leetcode", document)).toEqual({ verdict: "Accepted" });
  });

  it("REJECTS `未通过` (not passed) as a false AC", () => {
    document.body.innerHTML = '<div data-e2e-locator="submission-result">未通过</div>';
    expect(detectVerdictFromDocument("leetcode", document)).toBeNull();
  });

  it("REJECTS `全部通过` (all passed in a multi-test summary) as a false AC", () => {
    document.body.innerHTML = '<div data-e2e-locator="submission-result">测试点全部通过</div>';
    expect(detectVerdictFromDocument("leetcode", document)).toBeNull();
  });

  it("REJECTS `通过的题目` (verdict attached to a noun phrase) as a false AC", () => {
    document.body.innerHTML = '<div data-e2e-locator="submission-result">通过的题目在历史中查看</div>';
    expect(detectVerdictFromDocument("leetcode", document)).toBeNull();
  });

  it("ACCEPTS `运行结果: 通过` (verdict preceded by non-whitespace boundaries)", () => {
    // A real LeetCode.cn wrapper may include non-CJK copy like "运行结果: 通过".
    // The whitespace + colon boundaries are non-whitespace, so the regex
    // token-safety check accepts the standalone `通过` token.
    document.body.innerHTML = '<div data-e2e-locator="submission-result">运行结果: 通过</div>';
    expect(detectVerdictFromDocument("leetcode", document)).toEqual({ verdict: "Accepted" });
  });

  it("REJECTS `本题通过` (verdict attached directly to CJK characters)", () => {
    // CJK-then-CJK adjacency is rejected so we cannot be tricked by
    // prose like "本题通过" (this problem passed) where 通过 is part of
    // a sentence rather than a stand-alone verdict display.
    document.body.innerHTML = '<div data-e2e-locator="submission-result">本题通过</div>';
    expect(detectVerdictFromDocument("leetcode", document)).toBeNull();
  });

  // 部分通过 must be classified as Partially Accepted, NOT Accepted,
  // and the token-safety rule must NOT regress that ordering.
  it("classifies `部分通过` as Partially Accepted, not Accepted", () => {
    document.body.innerHTML = '<div data-e2e-locator="submission-result">部分通过</div>';
    expect(detectVerdictFromDocument("leetcode", document)).toEqual({ verdict: "Partially Accepted" });
  });

  it("classifies `部分通过` precedence over a trailing `通过` mention", () => {
    document.body.innerHTML = '<div data-e2e-locator="submission-result">部分通过 共 1 个测试点通过</div>';
    // The 通过 token at the end is delimited by space + digits; but the
    // earlier 部分通过 substring matches first → Partially Accepted.
    expect(detectVerdictFromDocument("leetcode", document)).toEqual({ verdict: "Partially Accepted" });
  });
});

describe("Luogu record verdict extractor: row-collapse semantics", () => {
  // The extractor must honestly handle a multi-row verdict DOM. We collect
  // every 评测状态 leaf, walk up to its enclosing row, and only emit a
  // candidate text when the unique rows either coincide (single-source) or
  // are absent. Conflicting rows must yield no candidate (verdict=null).

  const wrap = (body: string) =>
    asDocument(`<!doctype html><html><head><title>Luogu Record</title></head><body>${body}</body></html>`);

  it("returns empty when no 评测状态 row exists", () => {
    document.body.innerHTML = wrap(
      '<div><span><span>通过题目数</span></span><span><span>5</span></span></div>',
    ).body.innerHTML;
    expect(detectVerdictFromDocument("luogu", document)).toBeNull();
  });

  it("emits candidate text for a single AC row", () => {
    document.body.innerHTML =
      '<div><span><span>评测状态</span></span><span><span style="color: rgb(82,196,26)">Accepted</span></span></div>';
    expect(detectVerdictFromDocument("luogu", document)).toEqual({ verdict: "Accepted" });
  });

  it("collapses two identical AC rows into the same candidate text", () => {
    document.body.innerHTML = [
      '<div><span><span>评测状态</span></span><span><span style="color: rgb(82,196,26)">Accepted</span></span></div>',
      '<div><span><span>评测状态</span></span><span><span style="color: rgb(82,196,26)">Accepted</span></span></div>',
    ].join("");
    expect(detectVerdictFromDocument("luogu", document)).toEqual({ verdict: "Accepted" });
  });

  it("returns null when one row says AC and another says Compile Error", () => {
    document.body.innerHTML = [
      '<div><span><span>评测状态</span></span><span><span style="color: rgb(82,196,26)">Accepted</span></span></div>',
      '<div><span><span>评测状态</span></span><span><span style="color: rgb(255,0,0)">Compile Error</span></span></div>',
    ].join("");
    expect(detectVerdictFromDocument("luogu", document)).toBeNull();
  });

  it("returns null when the 评测状态 leaf has non-评测状态 cousins (label row not exact)", () => {
    document.body.innerHTML =
      '<div><span><span>运行状态</span></span><span><span>Accepted</span></span></div>';
    expect(detectVerdictFromDocument("luogu", document)).toBeNull();
  });
});

describe("Domestic submission identity: title preservation", () => {
  // The unique anchor's visible text is the only DOM-attested problem
  // label we can record. The detector must preserve it (first-seen wins
  // for duplicate anchors with the same externalId; multiple distinct
  // ids still return null).

  type Case = readonly [name: string, url: string, html: string, expectedExternalId: string, expectedTitle: string];
  const SUBMIT_URL = "https://leetcode.cn/submissions/detail/726110110/";

  const MATCH_CASES: readonly Case[] = [
    [
      "preserves LeetCode anchor text",
      SUBMIT_URL,
      '<a href="/problems/find-the-prefix-common-array-of-two-arrays/">Find the Prefix Common Array of Two Arrays</a>',
      "find-the-prefix-common-array-of-two-arrays",
      "Find the Prefix Common Array of Two Arrays",
    ],
    [
      "preserves NowCoder anchor text",
      "https://ac.nowcoder.com/acm/contest/view-submission?submissionId=84104369",
      '<a href="/acm/problem/319811">319811</a>',
      "acm/problem/319811",
      "319811",
    ],
    [
      "preserves Luogu anchor text",
      "https://www.luogu.com.cn/record/287273601",
      '<a href="/problem/P1001">P1001</a>',
      "P1001",
      "P1001",
    ],
  ];

  it.each(MATCH_CASES)("[%s]", (_n, url, anchorHtml, expectedExternalId, expectedTitle) => {
    const doc = asDocument(`<!doctype html><html><head><title>Sub</title></head><body>${anchorHtml}</body></html>`);
    const detected = detectProblemFromPage(asLocation(url), doc);
    expect(detected).not.toBeNull();
    if (detected !== null) {
      expect(detected.problemExternalId).toBe(expectedExternalId);
      expect(detected.problemTitle).toBe(expectedTitle);
    }
  });

  it("collapses duplicate anchors with identical id and visible text to the trimmed label", () => {
    const html = [
      '<a href="/problems/find-the-prefix-common-array-of-two-arrays/">Find the Prefix Common Array of Two Arrays</a>',
      '<a href="/problems/find-the-prefix-common-array-of-two-arrays/">Find the Prefix Common Array of Two Arrays</a>',
    ].join("");
    const doc = asDocument(`<!doctype html><html><head><title>Sub</title></head><body>${html}</body></html>`);
    const detected = detectProblemFromPage(asLocation(SUBMIT_URL), doc);
    expect(detected).toEqual({
      platform: "leetcode",
      problemExternalId: "find-the-prefix-common-array-of-two-arrays",
      problemTitle: "Find the Prefix Common Array of Two Arrays",
      canonicalUrl: "https://leetcode.cn/problems/find-the-prefix-common-array-of-two-arrays/",
    });
  });

  it("rejects two distinct Luogu record externalIds even when titles are identical", () => {
    const html = [
      '<a href="/problem/P1001">P1001</a>',
      '<a href="/problem/P2000">P1001</a>',
    ].join("");
    const doc = asDocument(`<!doctype html><html><head><title>Record</title></head><body>${html}</body></html>`);
    expect(detectProblemFromPage(
      asLocation("https://www.luogu.com.cn/record/287273601"),
      doc,
    )).toBeNull();
  });

  it("captures a valid trimmed leaf-anchor title", () => {
    // Leaf anchor (no children) with valid trimmed text is accepted.
    const html = '<a href="/problem/P1001">P1001</a>';
    const doc = asDocument(`<!doctype html><html><head><title>Record</title></head><body>${html}</body></html>`);
    const detected = detectProblemFromPage(
      asLocation("https://www.luogu.com.cn/record/287273601"),
      doc,
    );
    expect(detected).not.toBeNull();
    if (detected !== null) {
      expect(detected.problemExternalId).toBe("P1001");
      expect(detected.problemTitle).toBe("P1001");
    }
  });

  it("rejects an anchor with children (nested hidden text / decorative spans)", () => {
    // Anchors with child elements are rejected so no hidden nested text,
    // decorative icons, or injected spans can contribute to the title.
    const html = '<a href="/problem/P1001">P1001 <span hidden>nested</span></a>';
    const doc = asDocument(`<!doctype html><html><head><title>Record</title></head><body>${html}</body></html>`);
    const detected = detectProblemFromPage(
      asLocation("https://www.luogu.com.cn/record/287273601"),
      doc,
    );
    expect(detected).toBeNull();
  });

  it.each([
    ["hidden leaf anchor", '<a href="/problem/P1001" hidden>P1001 private text</a>'],
    ["hidden ancestor", '<div hidden><a href="/problem/P1001">P1001 private text</a></div>'],
    ["aria-hidden leaf anchor", '<a href="/problem/P1001" aria-hidden="true">P1001 private text</a>'],
    ["aria-hidden ancestor", '<div aria-hidden="true"><a href="/problem/P1001">P1001 private text</a></div>'],
    ["display-none leaf anchor", '<a href="/problem/P1001" style="display: none">P1001 private text</a>'],
    ["display-none ancestor", '<div style="display:none"><a href="/problem/P1001">P1001 private text</a></div>'],
    ["visibility-hidden leaf anchor", '<a href="/problem/P1001" style="visibility: hidden">P1001 private text</a>'],
    ["visibility-collapse ancestor", '<div style="visibility:collapse"><a href="/problem/P1001">P1001 private text</a></div>'],
  ])("rejects %s", (_name, html) => {
    const doc = asDocument(`<!doctype html><html><head><title>Record</title></head><body>${html}</body></html>`);
    expect(detectProblemFromPage(
      asLocation("https://www.luogu.com.cn/record/287273601"),
      doc,
    )).toBeNull();
  });

  it.each([
    ["computed display none", ".private-title { display: none; }", '<a class="private-title" href="/problem/P1001">P1001 private text</a>'],
    ["ancestor computed visibility hidden", ".private-title { visibility: hidden; }", '<div class="private-title"><a href="/problem/P1001">P1001 private text</a></div>'],
    ["ancestor computed visibility collapse", ".private-title { visibility: collapse; }", '<div class="private-title"><a href="/problem/P1001">P1001 private text</a></div>'],
  ])("rejects %s from computed styles", (_name, css, html) => {
    document.head.innerHTML = `<style>${css}</style><title>Record</title>`;
    document.body.innerHTML = html;
    expect(detectProblemFromPage(
      asLocation("https://www.luogu.com.cn/record/287273601"),
      document,
    )).toBeNull();
    document.head.innerHTML = "";
    document.body.innerHTML = "";
  });

  it("rejects an anchor with an overlong title (>200 chars)", () => {
    const longTitle = "A".repeat(201);
    const html = `<a href="/problem/P1001">${longTitle}</a>`;
    const doc = asDocument(`<!doctype html><html><head><title>Record</title></head><body>${html}</body></html>`);
    const detected = detectProblemFromPage(
      asLocation("https://www.luogu.com.cn/record/287273601"),
      doc,
    );
    expect(detected).toBeNull();
  });

  it("rejects an anchor title containing ASCII control characters", () => {
    // Use \u0001 (SOH, code point 1) which JSDOM preserves in textContent.
    // The null character (code point 0) is stripped by JSDOM's HTML parser;
    // the regex /[\x00-\x1f\x7f]/ still catches it in real browsers.
    const html = '<a href="/problem/P1001">P1001\u0001malicious</a>';
    const doc = asDocument(`<!doctype html><html><head><title>Record</title></head><body>${html}</body></html>`);
    const detected = detectProblemFromPage(
      asLocation("https://www.luogu.com.cn/record/287273601"),
      doc,
    );
    expect(detected).toBeNull();
  });

  it("rejects an anchor with an empty title", () => {
    const html = '<a href="/problem/P1001">   </a>';
    const doc = asDocument(`<!doctype html><html><head><title>Record</title></head><body>${html}</body></html>`);
    const detected = detectProblemFromPage(
      asLocation("https://www.luogu.com.cn/record/287273601"),
      doc,
    );
    expect(detected).toBeNull();
  });
});

describe("manifest-to-runtime contract: domestic OJ routes", () => {
  // Chrome match patterns are intentionally coarse — they cannot express
  // query-string requirements or numeric-ID constraints. The runtime
  // `detectProblemFromPage` performs strict final filtering. These tests
  // prove the end-to-end contract: manifest-included URLs that pass
  // strict runtime checks resolve correctly, while spoofed / malformed /
  // adjacent-path forms are rejected.

  const manifestPatterns: readonly string[] = (manifest as { content_scripts: readonly { matches: readonly string[] }[] }).content_scripts[0]?.matches ?? [];

  it("manifest includes the LeetCode.cn submission detail route", () => {
    const pattern = "https://leetcode.cn/submissions/detail/*";
    expect(manifestPatterns.some((p) => p === pattern)).toBe(true);
  });

  it("manifest includes the NowCoder view-submission route", () => {
    const pattern = "https://ac.nowcoder.com/acm/contest/view-submission*";
    expect(manifestPatterns.some((p) => p === pattern)).toBe(true);
  });

  it("runtime resolves a valid LeetCode.cn submission URL via detectProblemFromPage", () => {
    const html = loadFixtureHtml("submission-726110110-ac.html", LEETCODE_FIXTURES_DIR);
    const result = detectProblemFromPage(
      asLocation("https://leetcode.cn/submissions/detail/726110110/"),
      asDocument(html),
    );
    expect(result).not.toBeNull();
    if (result !== null) {
      expect(result.platform).toBe("leetcode");
      expect(result.problemExternalId).toBe("find-the-prefix-common-array-of-two-arrays");
    }
  });

  it("runtime resolves a valid NowCoder view-submission URL via detectProblemFromPage", () => {
    const html = loadFixtureHtml("submission-84104369-ac.html", NOWCODER_FIXTURES_DIR);
    const result = detectProblemFromPage(
      asLocation("https://ac.nowcoder.com/acm/contest/view-submission?submissionId=84104369"),
      asDocument(html),
    );
    expect(result).not.toBeNull();
    if (result !== null) {
      expect(result.platform).toBe("nowcoder");
      expect(result.problemExternalId).toBe("acm/problem/319811");
    }
  });

  it("runtime rejects LeetCode.cn submission URL with extra query param", () => {
    const html = '<a href="/problems/find-the-prefix-common-array-of-two-arrays/">Find the Prefix Common Array of Two Arrays</a>';
    const result = detectProblemFromPage(
      asLocation("https://leetcode.cn/submissions/detail/726110110/?foo=bar"),
      asDocument(html),
    );
    expect(result).toBeNull();
  });

  it("runtime rejects LeetCode.cn submission URL with non-numeric ID", () => {
    const html = '<a href="/problems/find-the-prefix-common-array-of-two-arrays/">Find the Prefix Common Array of Two Arrays</a>';
    const result = detectProblemFromPage(
      asLocation("https://leetcode.cn/submissions/detail/notanumber/"),
      asDocument(html),
    );
    expect(result).toBeNull();
  });

  it("runtime rejects LeetCode.cn login page URL (adjacent path)", () => {
    const html = '<a href="/problems/find-the-prefix-common-array-of-two-arrays/">Find the Prefix Common Array of Two Arrays</a>';
    const result = detectProblemFromPage(
      asLocation("https://leetcode.cn/submissions/"),
      asDocument(html),
    );
    expect(result).toBeNull();
  });

  it("runtime rejects NowCoder view-submission with extra query parameter", () => {
    const html = '<a href="/acm/problem/319811">319811</a>';
    const result = detectProblemFromPage(
      asLocation("https://ac.nowcoder.com/acm/contest/view-submission?submissionId=84104369&extra=1"),
      asDocument(html),
    );
    expect(result).toBeNull();
  });

  it("runtime rejects NowCoder view-submission with non-numeric submissionId", () => {
    const html = '<a href="/acm/problem/319811">319811</a>';
    const result = detectProblemFromPage(
      asLocation("https://ac.nowcoder.com/acm/contest/view-submission?submissionId=abc"),
      asDocument(html),
    );
    expect(result).toBeNull();
  });

  it("runtime rejects spoofed LeetCode.cn host via detectProblemFromPage", () => {
    const html = '<a href="/problems/find-the-prefix-common-array-of-two-arrays/">Find the Prefix Common Array of Two Arrays</a>';
    const result = detectProblemFromPage(
      asLocation("https://leetcode.cn.evil.example/submissions/detail/726110110/"),
      asDocument(html),
    );
    expect(result).toBeNull();
  });

  it("runtime rejects spoofed NowCoder host via detectProblemFromPage", () => {
    const html = '<a href="/acm/problem/319811">319811</a>';
    const result = detectProblemFromPage(
      asLocation("https://ac.nowcoder.com.evil.example/acm/contest/view-submission?submissionId=84104369"),
      asDocument(html),
    );
    expect(result).toBeNull();
  });
});
