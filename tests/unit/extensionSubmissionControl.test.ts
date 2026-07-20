import { describe, expect, it, beforeEach } from "vitest";
import {
  isAllowedSubmitLabel,
  isExactSubmitControl,
  normalizeControlLabel,
  resolveSubmitControl,
} from "@/extension/src/submissionControl";
import { detectProblemFromPage, type DetectableLocation } from "@/extension/src/platforms";

function asLocation(url: string): DetectableLocation {
  const parsed = new URL(url);
  return { href: parsed.href, hostname: parsed.hostname, pathname: parsed.pathname };
}

function asDocument(html: string): Document {
  return new DOMParser().parseFromString(html, "text/html");
}

describe("resolveSubmitControl", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  it("resolves a native <button> when its inner span is the click target", () => {
    document.body.innerHTML = '<button id="btn"><span>Submit</span></button>';
    const span = document.querySelector("span");
    expect(span).not.toBeNull();
    const resolved = resolveSubmitControl(span);
    expect(resolved.kind).toBe("control");
    if (resolved.kind === "control") {
      expect(resolved.control.id).toBe("btn");
    }
  });

  it("does not promote a plain <div> or <a> to an interactive control", () => {
    document.body.innerHTML = '<a id="lnk" href="#">Submit</a><div id="div">Submit</div>';
    const link = document.getElementById("lnk");
    const div = document.getElementById("div");
    expect(resolveSubmitControl(link).kind).toBe("none");
    expect(resolveSubmitControl(div).kind).toBe("none");
  });

  it("accepts an explicit role=button on a generic element", () => {
    document.body.innerHTML = '<div role="button" id="rb">提交</div>';
    const target = document.getElementById("rb");
    const resolved = resolveSubmitControl(target);
    expect(resolved.kind).toBe("control");
  });

  it("returns none for null targets", () => {
    expect(resolveSubmitControl(null).kind).toBe("none");
  });
});

describe("normalizeControlLabel", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  it("trims, collapses whitespace, and lowercases the visible text of a button", () => {
    document.body.innerHTML = "<button id=\"btn\">  Submit\tSolution  </button>";
    const btn = document.getElementById("btn");
    expect(btn).not.toBeNull();
    if (btn !== null) expect(normalizeControlLabel(btn)).toBe("submit solution");
  });

  it("reads the value of an <input type=submit|button>", () => {
    document.body.innerHTML = '<input id="inp" type="submit" value="  \u63d0\u4ea4  ">';
    const input = document.getElementById("inp");
    expect(input).not.toBeNull();
    if (input !== null) expect(normalizeControlLabel(input)).toBe("\u63d0\u4ea4");
  });

  it("normalizes a value with leading/trailing whitespace and mixed case", () => {
    document.body.innerHTML = '<input id="inp" type="button" value="   Submit Code   ">';
    const input = document.getElementById("inp");
    expect(input).not.toBeNull();
    if (input !== null) expect(normalizeControlLabel(input)).toBe("submit code");
  });

  it("falls back to aria-label when the visible text is empty", () => {
    document.body.innerHTML = '<button id="btn" aria-label="  Submit  "></button>';
    const btn = document.getElementById("btn");
    expect(btn).not.toBeNull();
    if (btn !== null) expect(normalizeControlLabel(btn)).toBe("submit");
  });
});

describe("isAllowedSubmitLabel", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  it("accepts LeetCode/Codeforces/AtCoder English 'submit' label", () => {
    document.body.innerHTML = '<button id="b">Submit</button>';
    const btn = document.getElementById("b");
    expect(btn).not.toBeNull();
    if (btn !== null) {
      expect(isAllowedSubmitLabel("leetcode", btn)).toBe(true);
      expect(isAllowedSubmitLabel("codeforces", btn)).toBe(true);
      expect(isAllowedSubmitLabel("atcoder", btn)).toBe(true);
    }
  });

  it("accepts the exact Japanese AtCoder label without matching result navigation", () => {
    document.body.innerHTML = '<button id="submit">提出</button><button id="results">提出結果</button>';
    const submit = document.getElementById("submit");
    const results = document.getElementById("results");
    expect(submit).not.toBeNull();
    expect(results).not.toBeNull();
    if (submit !== null && results !== null) {
      expect(isAllowedSubmitLabel("atcoder", submit)).toBe(true);
      expect(isAllowedSubmitLabel("atcoder", results)).toBe(false);
    }
  });

  it("accepts NowCoder/Luogu Chinese '提交' label", () => {
    document.body.innerHTML = '<button id="b">提交</button>';
    const btn = document.getElementById("b");
    expect(btn).not.toBeNull();
    if (btn !== null) {
      expect(isAllowedSubmitLabel("nowcoder", btn)).toBe(true);
      expect(isAllowedSubmitLabel("luogu", btn)).toBe(true);
    }
  });

  it("accepts LeetCode Chinese '提交' label (e2e-locator submit button evidence)", () => {
    document.body.innerHTML = '<button id="b">提交</button>';
    const btn = document.getElementById("b");
    expect(btn).not.toBeNull();
    if (btn !== null) {
      expect(isAllowedSubmitLabel("leetcode", btn)).toBe(true);
      expect(isExactSubmitControl("leetcode", btn)).toBe(true);
    }
  });

  it("accepts NowCoder '保存并提交' label", () => {
    document.body.innerHTML = '<button id="b" class="btn-submit">保存并提交</button>';
    const btn = document.getElementById("b");
    expect(btn).not.toBeNull();
    if (btn !== null) {
      expect(isAllowedSubmitLabel("nowcoder", btn)).toBe(true);
      expect(isExactSubmitControl("nowcoder", btn)).toBe(true);
    }
  });

  it("rejects substring matches: 登录并提交 / 提交记录", () => {
    document.body.innerHTML = '<button id="login">登录并提交</button><button id="record">提交记录</button>';
    const login = document.getElementById("login");
    const record = document.getElementById("record");
    expect(login).not.toBeNull();
    expect(record).not.toBeNull();
    if (login !== null && record !== null) {
      expect(isAllowedSubmitLabel("nowcoder", login)).toBe(false);
      expect(isAllowedSubmitLabel("luogu", login)).toBe(false);
      expect(isAllowedSubmitLabel("nowcoder", record)).toBe(false);
      expect(isAllowedSubmitLabel("luogu", record)).toBe(false);
    }
  });

  it("rejects English phrases containing the word submit as a substring", () => {
    document.body.innerHTML = '<button id="long">Submit Solution Now</button>';
    const btn = document.getElementById("long");
    expect(btn).not.toBeNull();
    if (btn !== null) {
      expect(isAllowedSubmitLabel("leetcode", btn)).toBe(false);
      expect(isAllowedSubmitLabel("codeforces", btn)).toBe(false);
      expect(isAllowedSubmitLabel("atcoder", btn)).toBe(false);
    }
  });

  it("rejects an editor <textarea> even when its value mentions submit", () => {
    document.body.innerHTML = '<textarea id="ed">submit this solution</textarea>';
    const editor = document.getElementById("ed");
    expect(editor).not.toBeNull();
    if (editor !== null) {
      expect(isAllowedSubmitLabel("leetcode", editor)).toBe(false);
      expect(isAllowedSubmitLabel("nowcoder", editor)).toBe(false);
    }
  });

  it("rejects a heading or ordinary div containing 提交", () => {
    document.body.innerHTML = '<h1 id="h">点击下方按钮提交代码</h1><div id="d">已提交</div>';
    const h = document.getElementById("h");
    const d = document.getElementById("d");
    expect(h).not.toBeNull();
    expect(d).not.toBeNull();
    if (h !== null && d !== null) {
      expect(isAllowedSubmitLabel("nowcoder", h)).toBe(false);
      expect(isAllowedSubmitLabel("luogu", d)).toBe(false);
    }
  });
});

describe("isExactSubmitControl (click-handler integration)", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  it("returns true for a real button with the platform's allowed label", () => {
    document.body.innerHTML = '<button id="b">提交</button>';
    const target = document.getElementById("b");
    expect(target).not.toBeNull();
    if (target !== null) {
      expect(isExactSubmitControl("nowcoder", target)).toBe(true);
      expect(isExactSubmitControl("luogu", target)).toBe(true);
    }
  });

  it("returns true when the click target is the inner span of a submit button", () => {
    document.body.innerHTML = '<button id="btn"><span id="child">Submit</span></button>';
    const target = document.getElementById("child");
    expect(target).not.toBeNull();
    if (target !== null) expect(isExactSubmitControl("leetcode", target)).toBe(true);
  });

  it("returns true for an explicit role=button with aria-label fallback", () => {
    document.body.innerHTML = '<div role="button" id="rb" aria-label="Submit"></div>';
    const target = document.getElementById("rb");
    expect(target).not.toBeNull();
    if (target !== null) expect(isExactSubmitControl("atcoder", target)).toBe(true);
  });

  it("returns true for an <input type=submit> via its value", () => {
    document.body.innerHTML = '<input id="inp" type="submit" value="Submit">';
    const target = document.getElementById("inp");
    expect(target).not.toBeNull();
    if (target !== null) expect(isExactSubmitControl("codeforces", target)).toBe(true);
  });

  it("returns false on a wrong platform (英文 'submit' button on NowCoder Chinese-only platform)", () => {
    document.body.innerHTML = '<button id="b">submit</button>';
    const target = document.getElementById("b");
    expect(target).not.toBeNull();
    if (target !== null) expect(isExactSubmitControl("nowcoder", target)).toBe(false);
  });

  it("returns false on a wrong platform (NowCoder '保存并提交' on a non-NowCoder platform)", () => {
    document.body.innerHTML = '<button id="b" class="btn-submit">保存并提交</button>';
    const target = document.getElementById("b");
    expect(target).not.toBeNull();
    if (target !== null) {
      expect(isExactSubmitControl("leetcode", target)).toBe(false);
      expect(isExactSubmitControl("codeforces", target)).toBe(false);
      expect(isExactSubmitControl("atcoder", target)).toBe(false);
      expect(isExactSubmitControl("luogu", target)).toBe(false);
    }
  });

  it("returns false when the click target is the document body", () => {
    document.body.innerHTML = "<div>page chrome with submit copy</div>";
    expect(isExactSubmitControl("leetcode", document.body)).toBe(false);
  });

  it("returns false for null targets", () => {
    expect(isExactSubmitControl("leetcode", null)).toBe(false);
  });
});

describe("detectProblemFromPage guards against unsupported routes", () => {
  it("returns null for the LeetCode home page (no /problems/<slug>)", () => {
    expect(detectProblemFromPage(asLocation("https://leetcode.com/"), asDocument("<title>Home</title>"))).toBeNull();
  });

  it("returns null for NowCoder login / registration / company pages", () => {
    expect(detectProblemFromPage(asLocation("https://www.nowcoder.com/login"), asDocument("<title>Login</title>"))).toBeNull();
    expect(detectProblemFromPage(asLocation("https://www.nowcoder.com/"), asDocument("<title>Home</title>"))).toBeNull();
    expect(detectProblemFromPage(asLocation("https://www.nowcoder.com/company/home"), asDocument("<title>Company</title>"))).toBeNull();
    expect(detectProblemFromPage(asLocation("https://ac.nowcoder.com/"), asDocument("<title>AC Home</title>"))).toBeNull();
  });

  it("returns null for Luogu record pages (BLOCKED: no record→problem resolution yet)", () => {
    expect(detectProblemFromPage(asLocation("https://www.luogu.com.cn/record/12345"), asDocument("<title>Record</title>"))).toBeNull();
    expect(detectProblemFromPage(asLocation("https://www.luogu.com.cn/record/list?pid=P1001"), asDocument("<title>Record List</title>"))).toBeNull();
  });

  it("returns null for Luogu login / user / training pages", () => {
    expect(detectProblemFromPage(asLocation("https://www.luogu.com.cn/"), asDocument("<title>Luogu</title>"))).toBeNull();
    expect(detectProblemFromPage(asLocation("https://www.luogu.com.cn/user/12345"), asDocument("<title>User</title>"))).toBeNull();
    expect(detectProblemFromPage(asLocation("https://www.luogu.com.cn/training"), asDocument("<title>Training</title>"))).toBeNull();
  });
});
