import { describe, expect, it } from "vitest";
import {
  detectProblemFromLocation,
  detectProblemFromPage,
  detectVerdictFromDocument,
  type DetectableLocation,
  getPlatformAdapterStatus,
  getProductionPlatforms,
  type PlatformAdapterRecord,
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

function asLocationWithHref(url: string, hrefOverride: string): DetectableLocation {
  const claimed = new URL(url);
  return { href: hrefOverride, hostname: claimed.hostname, pathname: claimed.pathname };
}

function asDocument(html: string): Document {
  return new DOMParser().parseFromString(html, "text/html");
}

describe("detectProblemFromLocation", () => {
  it("detects LeetCode problem URLs and emits the .cn canonical", () => {
    expect(detectProblemFromLocation(asLocation("https://leetcode.com/problems/two-sum/"), "Two Sum - LeetCode")).toEqual({
      platform: "leetcode",
      problemExternalId: "two-sum",
      problemTitle: "Two Sum",
      canonicalUrl: "https://leetcode.cn/problems/two-sum/",
    });
  });

  it("collapses LeetCode route and tracking variants to one canonical URL", () => {
    expect(detectProblemFromLocation(
      asLocation("https://leetcode.com/problems/Two-Sum/description/?envType=daily#solution"),
      "Two Sum - LeetCode",
    )).toMatchObject({
      problemExternalId: "two-sum",
      canonicalUrl: "https://leetcode.cn/problems/two-sum/",
    });
  });

  it("detects LeetCode.cn problem URLs and emits the .cn canonical", () => {
    expect(detectProblemFromLocation(
      asLocation("https://leetcode.cn/problems/two-sum/"),
      "两数之和 - LeetCode",
    )).toMatchObject({
      platform: "leetcode",
      problemExternalId: "two-sum",
      canonicalUrl: "https://leetcode.cn/problems/two-sum/",
    });
  });

  it("collapses LeetCode.cn route variants to one canonical URL", () => {
    expect(detectProblemFromLocation(
      asLocation("https://leetcode.cn/problems/Two-Sum/description/?envType=daily"),
      "两数之和 - LeetCode",
    )).toMatchObject({
      problemExternalId: "two-sum",
      canonicalUrl: "https://leetcode.cn/problems/two-sum/",
    });
  });

  it("rejects LeetCode lookalike hosts (leetcode.cn.evil.example)", () => {
    expect(detectProblemFromLocation(
      asLocation("https://leetcode.cn.evil.example/problems/two-sum/"),
      "Two Sum",
    )).toBeNull();
  });

  it("rejects LeetCode lookalike hosts (evil.leetcode.com)", () => {
    expect(detectProblemFromLocation(
      asLocation("https://evil.leetcode.com/problems/two-sum/"),
      "Two Sum",
    )).toBeNull();
  });

  it("rejects non-https LeetCode URLs", () => {
    expect(detectProblemFromLocation(
      asLocation("http://leetcode.cn/problems/two-sum/"),
      "Two Sum",
    )).toBeNull();
  });

  it("rejects LeetCode URLs with credentials or unusual ports", () => {
    expect(detectProblemFromLocation(
      asLocation("https://user:pass@leetcode.cn/problems/two-sum/"),
      "Two Sum",
    )).toBeNull();
    expect(detectProblemFromLocation(
      asLocation("https://leetcode.cn:8443/problems/two-sum/"),
      "Two Sum",
    )).toBeNull();
  });

  it("rejects LeetCode URLs whose path does not match /problems/<slug>", () => {
    expect(detectProblemFromLocation(
      asLocation("https://leetcode.cn/"),
      "Home",
    )).toBeNull();
    expect(detectProblemFromLocation(
      asLocation("https://leetcode.cn/problems/"),
      "Empty slug",
    )).toBeNull();
    expect(detectProblemFromLocation(
      asLocation("https://leetcode.cn/problems/-bogus/"),
      "Bogus slug",
    )).toBeNull();
    expect(detectProblemFromLocation(
      asLocation("https://leetcode.cn/contest/"),
      "Contest home",
    )).toBeNull();
  });

  it("rejects LeetCode URLs when the supplied DetectableLocation host does not match the parsed URL", () => {
    expect(detectProblemFromLocation(
      asLocationWithHref("https://leetcode.cn/problems/two-sum/", "https://leetcode.cn.evil.example/problems/two-sum/"),
      "Two Sum",
    )).toBeNull();
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

  it("detects NowCoder www practice URLs and namespaced identity", () => {
    expect(detectProblemFromLocation(
      asLocation("https://www.nowcoder.com/practice/example"),
      "Example - NowCoder",
    )).toEqual({
      platform: "nowcoder",
      problemExternalId: "practice/example",
      problemTitle: "Example",
      canonicalUrl: "https://www.nowcoder.com/practice/example",
    });
  });

  it("collapses NowCoder www trailing slash and query/hash", () => {
    expect(detectProblemFromLocation(
      asLocation("https://www.nowcoder.com/practice/example/?from=nav#answer"),
      "Example - NowCoder",
    )).toMatchObject({
      platform: "nowcoder",
      problemExternalId: "practice/example",
      canonicalUrl: "https://www.nowcoder.com/practice/example",
    });
  });

  it("detects NowCoder ACM contest URLs on the ac subdomain", () => {
    expect(detectProblemFromLocation(
      asLocation("https://ac.nowcoder.com/acm/problem/25000"),
      "ACM Example - NowCoder",
    )).toEqual({
      platform: "nowcoder",
      problemExternalId: "acm/problem/25000",
      problemTitle: "ACM Example",
      canonicalUrl: "https://ac.nowcoder.com/acm/problem/25000",
    });
  });

  it("collapses NowCoder ACM trailing slash and query", () => {
    expect(detectProblemFromLocation(
      asLocation("https://ac.nowcoder.com/acm/problem/25000/?from=acm-home"),
      "ACM Example - NowCoder",
    )).toMatchObject({
      platform: "nowcoder",
      problemExternalId: "acm/problem/25000",
      canonicalUrl: "https://ac.nowcoder.com/acm/problem/25000",
    });
  });

  it("returns null for unsupported NowCoder pages", () => {
    expect(detectProblemFromLocation(
      asLocation("https://www.nowcoder.com/"),
      "Home",
    )).toBeNull();
    expect(detectProblemFromLocation(
      asLocation("https://www.nowcoder.com/login"),
      "Login",
    )).toBeNull();
    expect(detectProblemFromLocation(
      asLocation("https://www.nowcoder.com/company/home"),
      "Company",
    )).toBeNull();
    expect(detectProblemFromLocation(
      asLocation("https://ac.nowcoder.com/"),
      "AC Home",
    )).toBeNull();
    expect(detectProblemFromLocation(
      asLocation("https://ac.nowcoder.com/contest/25000"),
      "Contest",
    )).toBeNull();
  });

  it("rejects NowCoder lookalike hosts", () => {
    expect(detectProblemFromLocation(
      asLocation("https://www.nowcoder.com.evil.example/practice/example"),
      "Spoofed",
    )).toBeNull();
    expect(detectProblemFromLocation(
      asLocation("https://ac.nowcoder.com.evil.example/acm/problem/25000"),
      "Spoofed",
    )).toBeNull();
  });

  it("rejects non-https NowCoder URLs", () => {
    expect(detectProblemFromLocation(
      asLocation("http://www.nowcoder.com/practice/example"),
      "Example",
    )).toBeNull();
    expect(detectProblemFromLocation(
      asLocation("http://ac.nowcoder.com/acm/problem/25000"),
      "ACM",
    )).toBeNull();
  });

  it("rejects NowCoder URLs with credentials or unusual ports", () => {
    expect(detectProblemFromLocation(
      asLocation("https://user:pass@www.nowcoder.com/practice/example"),
      "Example",
    )).toBeNull();
    expect(detectProblemFromLocation(
      asLocation("https://www.nowcoder.com:8443/practice/example"),
      "Example",
    )).toBeNull();
  });

  it("detects Luogu problem URLs and uppercases the problem ID", () => {
    expect(detectProblemFromLocation(
      asLocation("https://www.luogu.com.cn/problem/P1001"),
      "P1001 A+B Problem",
    )).toEqual({
      platform: "luogu",
      problemExternalId: "P1001",
      problemTitle: "P1001 A+B Problem",
      canonicalUrl: "https://www.luogu.com.cn/problem/P1001",
    });
  });

  it("returns null for Luogu record pages without fabricating an externalId", () => {
    expect(detectProblemFromLocation(
      asLocation("https://www.luogu.com.cn/record/12345"),
      "Luogu",
    )).toBeNull();
    expect(detectProblemFromLocation(
      asLocation("https://www.luogu.com.cn/record/list?pid=P1001"),
      "Luogu",
    )).toBeNull();
  });

  it("returns null for unsupported Luogu paths", () => {
    expect(detectProblemFromLocation(
      asLocation("https://www.luogu.com.cn/"),
      "Luogu",
    )).toBeNull();
    expect(detectProblemFromLocation(
      asLocation("https://www.luogu.com.cn/training"),
      "Luogu",
    )).toBeNull();
    expect(detectProblemFromLocation(
      asLocation("https://www.luogu.com.cn/user/12345"),
      "Luogu",
    )).toBeNull();
  });

  it("rejects Luogu lookalike hosts", () => {
    expect(detectProblemFromLocation(
      asLocation("https://www.luogu.com.cn.evil.example/problem/P1001"),
      "Luogu",
    )).toBeNull();
  });

  it("rejects non-https Luogu URLs and credentialed Luogu URLs", () => {
    expect(detectProblemFromLocation(
      asLocation("http://www.luogu.com.cn/problem/P1001"),
      "Luogu",
    )).toBeNull();
    expect(detectProblemFromLocation(
      asLocation("https://user:pass@www.luogu.com.cn/problem/P1001"),
      "Luogu",
    )).toBeNull();
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

  it("detects the observed LeetCode.cn Chinese runtime-error verdict text", () => {
    document.body.innerHTML = '<div data-e2e-locator="submission-result">执行出错</div>';

    expect(detectVerdictFromDocument("leetcode", document)).toEqual({ verdict: "Runtime Error" });
  });

  it("does not detect LeetCode.cn runtime-error wording outside the verdict node", () => {
    document.body.innerHTML = '<main>执行出错</main>';

    expect(detectVerdictFromDocument("leetcode", document)).toBeNull();
  });

  it("normalizes the same runtime-error meaning across platform verdict regions", () => {
    document.body.innerHTML = '<div class="coder-cont-legend">运行状态:<span>执行出错</span></div>';

    expect(detectVerdictFromDocument("nowcoder", document)).toEqual({ verdict: "Runtime Error" });
  });

  it("normalizes the observed LeetCode.cn time-limit wording", () => {
    document.body.innerHTML = '<div data-e2e-locator="submission-result">超出时间限制</div>';

    expect(detectVerdictFromDocument("leetcode", document)).toEqual({ verdict: "Time Limit Exceeded" });
  });

  it("normalizes duplicate current LeetCode console-result nodes", () => {
    document.body.innerHTML = [
      '<span data-e2e-locator="console-result">超出时间限制</span>',
      '<span data-e2e-locator="console-result">超出时间限制</span>',
    ].join("");

    expect(detectVerdictFromDocument("leetcode", document)).toEqual({
      verdict: "Time Limit Exceeded",
    });
  });

  it("normalizes duplicate visible verdict leaves in the LeetCode submission-detail tab", () => {
    document.body.innerHTML = [
      '<div id="submission-detail_tabbar_outer">',
      '  <div class="flexlayout__tab_button flexlayout__tab_button--selected">',
      '    <div id="submission-detail_tab">',
      '      <div class="relative">',
      '        <div class="medium whitespace-nowrap font-medium">超出时间限制</div>',
      '        <div class="normal absolute whitespace-nowrap font-normal">超出时间限制</div>',
      "      </div>",
      "    </div>",
      "  </div>",
      "</div>",
    ].join("");

    expect(detectVerdictFromDocument("leetcode", document)).toEqual({
      verdict: "Time Limit Exceeded",
    });
  });

  it("rejects conflicting visible verdict leaves in the LeetCode submission-detail tab", () => {
    document.body.innerHTML = [
      '<div id="submission-detail_tabbar_outer">',
      '  <div class="flexlayout__tab_button flexlayout__tab_button--selected">',
      '    <div id="submission-detail_tab">',
      '      <div class="relative">',
      '        <div>超出时间限制</div>',
      '        <div>执行出错</div>',
      "      </div>",
      "    </div>",
      "  </div>",
      "</div>",
    ].join("");

    expect(detectVerdictFromDocument("leetcode", document)).toBeNull();
  });

  it("does not treat the transient LeetCode submission-detail tab label as a final failure", () => {
    document.body.innerHTML = [
      '<div id="submission-detail_tabbar_outer">',
      '  <div class="flexlayout__tab_button flexlayout__tab_button--selected">',
      '    <div id="submission-detail_tab"><div>提交详情</div></div>',
      "  </div>",
      "</div>",
    ].join("");

    expect(detectVerdictFromDocument("leetcode", document)).toBeNull();
  });

  it("rejects conflicting current LeetCode console-result nodes", () => {
    document.body.innerHTML = [
      '<span data-e2e-locator="console-result">超出时间限制</span>',
      '<span data-e2e-locator="console-result">执行出错</span>',
    ].join("");

    expect(detectVerdictFromDocument("leetcode", document)).toBeNull();
  });

  it("keeps a trusted pending verdict state out of completed attempts", () => {
    document.body.innerHTML = '<div data-e2e-locator="submission-result">判题中</div>';

    expect(detectVerdictFromDocument("leetcode", document)).toBeNull();
  });

  it("records an unrecognized non-empty trusted final result instead of hanging", () => {
    document.body.innerHTML = '<div data-e2e-locator="submission-result">平台新增失败状态</div>';

    expect(detectVerdictFromDocument("leetcode", document)).toEqual({ verdict: "Other Failure" });
  });

  it("preserves useful distinctions for less common final failures", () => {
    document.body.innerHTML = '<div data-e2e-locator="submission-result">输出超限</div>';
    expect(detectVerdictFromDocument("leetcode", document)).toEqual({ verdict: "Output Limit Exceeded" });

    document.body.innerHTML = '<span id="judge-status">IE</span>';
    expect(detectVerdictFromDocument("atcoder", document)).toEqual({ verdict: "Judge Error" });
  });

  it("detects Codeforces wrong-answer verdict text", () => {
    // The td must live inside a table/tr for the HTML parser to keep it;
    // before the body-fallback removal this test incidentally matched via
    // the body selector, but now the .status-cell selector is the only path.
    document.body.innerHTML = '<table><tr><td class="status-cell">Wrong answer on test 2</td></tr></table>';

    expect(detectVerdictFromDocument("codeforces", document)).toEqual({ verdict: "Wrong Answer" });
  });

  it("detects AtCoder time-limit verdict text", () => {
    document.body.innerHTML = '<span id="judge-status">TLE</span>';

    expect(detectVerdictFromDocument("atcoder", document)).toEqual({ verdict: "Time Limit Exceeded" });
  });

  // NowCoder verdict nodes are wrapped in `<div class="coder-cont-legend">…</div>`
  // on the public view-submission page. Each of the four cases wraps the
  // observed verdict token in that exact container so the registered
  // selector matches and the verdictFromText heuristics classify it.
  it("detects NowCoder partial verdict text", () => {
    document.body.innerHTML = '<div class="coder-cont-legend">运行状态:<span>部分通过</span></div>';

    expect(detectVerdictFromDocument("nowcoder", document)).toEqual({ verdict: "Partially Accepted" });
  });

  it("detects NowCoder Chinese accepted verdict text", () => {
    document.body.innerHTML = '<div class="coder-cont-legend">运行状态:<span class="font-green">答案正确</span></div>';

    expect(detectVerdictFromDocument("nowcoder", document)).toEqual({ verdict: "Accepted" });
  });

  it("detects NowCoder Chinese wrong-answer verdict text", () => {
    document.body.innerHTML = '<div class="coder-cont-legend">运行状态:<span>答案错误</span></div>';

    expect(detectVerdictFromDocument("nowcoder", document)).toEqual({ verdict: "Wrong Answer" });
  });

  it("detects NowCoder Chinese compile-error verdict text", () => {
    document.body.innerHTML = '<div class="coder-cont-legend">运行状态:<span>编译错误</span></div>';

    expect(detectVerdictFromDocument("nowcoder", document)).toEqual({ verdict: "Compile Error" });
  });

  // NowCoder: the previously-registered `.result`, `.submission-result`,
  // and `.judge-result` selectors matched zero observed nodes and have been
  // removed. The detector must NOT fall back to those legacy class names.
  it("NowCoder does not match the obsolete `.result` selector", () => {
    document.body.innerHTML = '<div class="result">答案正确</div>';
    expect(detectVerdictFromDocument("nowcoder", document)).toBeNull();
  });

  it("NowCoder does not match the obsolete `.submission-result` selector", () => {
    document.body.innerHTML = '<div class="submission-result">答案正确</div>';
    expect(detectVerdictFromDocument("nowcoder", document)).toBeNull();
  });

  it("NowCoder does not match the obsolete `.judge-result` selector", () => {
    document.body.innerHTML = '<div class="judge-result">答案错误</div>';
    expect(detectVerdictFromDocument("nowcoder", document)).toBeNull();
  });

  // NowCoder selectors are exactly ['.coder-cont-legend'].
  it("NowCoder selectors are exactly ['.coder-cont-legend']", () => {
    expect(PLATFORM_ADAPTERS.nowcoder.selectors).toEqual([".coder-cont-legend"]);
  });

  // Luogu verdict extraction uses a semantic extractor keyed by the exact
  // label 评测状态, not CSS selectors. Each positive case places the label
  // in a leaf span and the verdict in a sibling span, both wrapped in a
  // containing row.
  it("detects Luogu Chinese time-limit verdict text via semantic extractor", () => {
    document.body.innerHTML = '<div><span><span>评测状态</span></span><span><span style="color: rgb(0,0,0)">运行超时</span></span></div>';
    expect(detectVerdictFromDocument("luogu", document)).toEqual({ verdict: "Time Limit Exceeded" });
  });

  it("detects Luogu Chinese memory-limit verdict text via semantic extractor", () => {
    document.body.innerHTML = '<div><span><span>评测状态</span></span><span><span>内存超限</span></span></div>';
    expect(detectVerdictFromDocument("luogu", document)).toEqual({ verdict: "Memory Limit Exceeded" });
  });

  it("detects Luogu Chinese runtime-error verdict text via semantic extractor", () => {
    document.body.innerHTML = '<div><span><span>评测状态</span></span><span><span>段错误</span></span></div>';
    expect(detectVerdictFromDocument("luogu", document)).toEqual({ verdict: "Runtime Error" });
  });

  it("detects Luogu accepted verdict text via semantic extractor", () => {
    document.body.innerHTML = '<div><span><span>评测状态</span></span><span><span style="color: rgb(82, 196, 26)">Accepted</span></span></div>';
    expect(detectVerdictFromDocument("luogu", document)).toEqual({ verdict: "Accepted" });
  });

  it("detects Luogu compile-error verdict text via semantic extractor", () => {
    document.body.innerHTML = '<div><span><span>评测状态</span></span><span><span style="color: rgb(255, 0, 0)">Compile Error</span></span></div>';
    expect(detectVerdictFromDocument("luogu", document)).toEqual({ verdict: "Compile Error" });
  });

  // Luogu extractor false-positive guards. None of these match the
  // observed semantic structure, so the detector must return null rather
  // than guess a verdict.
  it("Luogu returns null when only the bare body mentions 'Accepted'", () => {
    document.body.innerHTML = "<body>您的 Accepted 记录可以在记录列表中查看。</body>";
    expect(detectVerdictFromDocument("luogu", document)).toBeNull();
  });

  it("Luogu returns null when an unrelated colored span mentions 'Accepted'", () => {
    // Colored spans without the 评测状态 label are NOT verdict rows.
    document.body.innerHTML = '<div><span style="color: rgb(82, 196, 26)">Accepted</span></div>';
    expect(detectVerdictFromDocument("luogu", document)).toBeNull();
  });

  it("Luogu returns null when the label row has a different label, not 评测状态", () => {
    document.body.innerHTML = '<div><span><span>运行状态</span></span><span><span>Accepted</span></span></div>';
    expect(detectVerdictFromDocument("luogu", document)).toBeNull();
  });

  it("Luogu returns null when the 评测状态 label exists but no verdict text follows", () => {
    document.body.innerHTML = '<div><span><span>评测状态</span></span><span><span>代号</span></span></div>';
    expect(detectVerdictFromDocument("luogu", document)).toBeNull();
  });

  it("Luogu returns null when 评测状态 is only present as a comment-style wrapper", () => {
    // The wrapper must be a leaf so wrapping children can never satisfy
    // the extractor.
    document.body.innerHTML = '<div><span><span>评测状态<i>X</i></span></span><span>Accepted</span></div>';
    expect(detectVerdictFromDocument("luogu", document)).toBeNull();
  });

  // Luogu selects the first qualifying row only; later text in the same
  // page containing verdict tokens does not amplify the row signal.
  it("Luogu extractor collapses identical qualifying rows", () => {
    document.body.innerHTML = [
      '<div><span><span>评测状态</span></span><span><span>Accepted</span></span></div>',
      '<div><span><span>评测状态</span></span><span><span>Accepted</span></span></div>',
    ].join("");
    expect(detectVerdictFromDocument("luogu", document)).toEqual({ verdict: "Accepted" });
  });

  // Luogu selectors are the empty list (semantic extractor only).
  it("Luogu selectors are exactly [] and a semantic extractor is registered", () => {
    expect(PLATFORM_ADAPTERS.luogu.selectors).toEqual([]);
    expect(typeof PLATFORM_ADAPTERS.luogu.extractor).toBe("function");
  });

  // The legacy selector remains fixture metadata. Runtime extraction also
  // handles the observed console-result locator and collapses duplicate panes.
  it("LeetCode keeps its legacy selector and registers a semantic extractor", () => {
    expect(PLATFORM_ADAPTERS.leetcode.selectors).toEqual(['[data-e2e-locator="submission-result"]']);
    expect(typeof PLATFORM_ADAPTERS.leetcode.extractor).toBe("function");
  });

  it("detects LeetCode verdict via the e2e locator wrapper (通过)", () => {
    document.body.innerHTML = '<div data-e2e-locator="submission-result">通过</div>';
    expect(detectVerdictFromDocument("leetcode", document)).toEqual({ verdict: "Accepted" });
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

  // T-safe: experimental adapters must NOT scan <body>. The body fallback
  // would emit false verdicts whenever the page chrome, headline or
  // unrelated section mentions "AC", "Accepted" or "答案正确".
  it("LeetCode selectors do not contain the broad 'body' fallback", () => {
    expect(PLATFORM_ADAPTERS.leetcode.selectors).not.toContain("body");
  });

  it("Codeforces selectors do not contain the broad 'body' fallback", () => {
    expect(PLATFORM_ADAPTERS.codeforces.selectors).not.toContain("body");
  });

  it("NowCoder selectors do not contain the broad 'body' fallback", () => {
    expect(PLATFORM_ADAPTERS.nowcoder.selectors).not.toContain("body");
  });

  it("Luogu selectors do not contain the broad 'body' fallback", () => {
    expect(PLATFORM_ADAPTERS.luogu.selectors).not.toContain("body");
  });

  // T-safe: with the body fallback removed, a document whose only verdict
  // signal is the bare page body or an unrelated element must not emit a
  // verdict. These pin the contract that verdict capture is gated by an
  // evidence-backed narrow selector or extractor.
  it("LeetCode returns null when only the bare body mentions 'Accepted'", () => {
    document.body.innerHTML = "<body>You can see your Accepted submissions in history.</body>";
    expect(detectVerdictFromDocument("leetcode", document)).toBeNull();
  });

  it("Codeforces returns null when only the bare body mentions 'AC'", () => {
    document.body.innerHTML = "<body>Solution AC summary of past contests.</body>";
    expect(detectVerdictFromDocument("codeforces", document)).toBeNull();
  });

  it("NowCoder returns null when only the bare body mentions '答案正确'", () => {
    document.body.innerHTML = "<body>历史中所有答案正确的提交都会显示在这里。</body>";
    expect(detectVerdictFromDocument("nowcoder", document)).toBeNull();
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

  it("every platform has an adapter record with label and provenance", () => {
    // Each adapter must declare either a non-empty selectors array or a
    // semantic extractor (or both). Empty selectors WITHOUT an extractor
    // would mean "we ship no evidence at all" for a platform, which this
    // registry contract explicitly forbids. Iterate over the union-typed
    // `PlatformAdapterRecord` array explicitly so optional `extractor`
    // and the new `v4NetworkStatus` / `version` / `hostOwnership` fields
    // are visible regardless of per-record narrowing.
    const records: readonly PlatformAdapterRecord[] = Object.values(PLATFORM_ADAPTERS);
    for (const record of records) {
      expect(typeof record.label).toBe("string");
      expect(record.label.length).toBeGreaterThan(0);
      expect(record.label).toBe(record.label.trim());
      expect(record.version.length).toBeGreaterThan(0);
      expect(Array.isArray(record.selectors)).toBe(true);
      expect(Array.isArray(record.hostOwnership)).toBe(true);
      expect(record.hostOwnership.length).toBeGreaterThan(0);
      const hasSelectors = record.selectors.length > 0;
      const hasExtractor = record.extractor !== undefined;
      expect(hasSelectors || hasExtractor).toBe(true);
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
