import {
  canonicalProblemUrl,
  normalizeProblemIdentity,
} from "@/lib/services/canonicalProblemUrl";

export type Platform = "leetcode" | "nowcoder" | "luogu" | "codeforces" | "atcoder";

export type DetectableLocation = Pick<Location, "href" | "hostname" | "pathname">;

export type DetectedProblem = {
  platform: Platform;
  problemExternalId: string;
  problemTitle: string;
  canonicalUrl: string;
};

export type DetectedVerdict = {
  readonly verdict: string;
};

export function detectProblemFromLocation(location: DetectableLocation, documentTitle: string): DetectedProblem | null {
  const url = location.href;
  const title = documentTitle.replace(/ - .*$/, "").trim();

  if (location.hostname.includes("leetcode.com") && location.pathname.startsWith("/problems/")) {
    return detectedProblem(
      { platform: "leetcode", externalId: location.pathname.split("/")[2] ?? title },
      title,
      url,
    );
  }

  if (location.hostname.includes("codeforces.com") && location.pathname.includes("/problemset/problem/")) {
    const parts = location.pathname.split("/");
    return detectedProblem(
      { platform: "codeforces", externalId: `${parts.at(-2) ?? ""}${parts.at(-1) ?? ""}` },
      title,
      url,
    );
  }

  if (location.hostname.includes("atcoder.jp") && location.pathname.includes("/tasks/")) {
    return detectedProblem(
      { platform: "atcoder", externalId: location.pathname.split("/").at(-1) ?? title },
      title,
      url,
    );
  }

  if (location.hostname.includes("nowcoder.com")) {
    return detectedProblem(
      { platform: "nowcoder", externalId: location.pathname },
      title,
      url,
    );
  }

  if (location.hostname.includes("luogu.com.cn")) {
    return detectedProblem(
      { platform: "luogu", externalId: location.pathname },
      title,
      url,
    );
  }

  return null;
}

function detectedProblem(
  identity: { readonly platform: Platform; readonly externalId: string },
  problemTitle: string,
  observedUrl: string,
): DetectedProblem {
  const normalized = normalizeProblemIdentity(identity);
  if (normalized.platform === "manual") {
    throw new Error("Manual problems are not detected by the extension");
  }
  return {
    platform: normalized.platform,
    problemExternalId: normalized.externalId,
    problemTitle,
    canonicalUrl: canonicalProblemUrl(normalized, observedUrl),
  };
}

export function detectVerdictFromDocument(platform: Platform, pageDocument: Document): DetectedVerdict | null {
  const text = candidateTextForPlatform(platform, pageDocument);
  return verdictFromText(text);
}

function candidateTextForPlatform(platform: Platform, pageDocument: Document): string {
  switch (platform) {
    case "leetcode":
      return textFromSelectors(pageDocument, [
        '[data-e2e-locator="submission-result"]',
        '[data-cy="submission-result"]',
        ".text-green-s",
        ".text-red-s",
        "body",
      ]);
    case "codeforces":
      return textFromSelectors(pageDocument, [".status-cell", "td.status-small", ".verdict-accepted", "body"]);
    case "atcoder":
      return textFromSelectors(pageDocument, ["#judge-status", ".waiting-judge", "td", "body"]);
    case "nowcoder":
      return textFromSelectors(pageDocument, [".result", ".submission-result", ".judge-result", "body"]);
    case "luogu":
      return textFromSelectors(pageDocument, [".status", ".record-status", ".submission-status", "body"]);
  }
}

function textFromSelectors(pageDocument: Document, selectors: readonly string[]): string {
  return selectors
    .flatMap((selector) => Array.from(pageDocument.querySelectorAll(selector)))
    .map((element) => element.textContent ?? "")
    .join("\n");
}

function verdictFromText(text: string): DetectedVerdict | null {
  const normalized = text.toLowerCase();
  if (normalized.includes("partially accepted") || text.includes("部分通过")) return { verdict: "Partially Accepted" };
  if (normalized.includes("time limit exceeded") || hasVerdictToken(normalized, "tle") || text.includes("运行超时") || text.includes("超出时间限制")) {
    return { verdict: "Time Limit Exceeded" };
  }
  if (normalized.includes("memory limit exceeded") || hasVerdictToken(normalized, "mle") || text.includes("内存超限") || text.includes("超出内存限制")) {
    return { verdict: "Memory Limit Exceeded" };
  }
  if (normalized.includes("runtime error") || hasVerdictToken(normalized, "re") || text.includes("段错误")) return { verdict: "Runtime Error" };
  if (normalized.includes("wrong answer") || hasVerdictToken(normalized, "wa") || text.includes("答案错误") || text.includes("格式错误")) {
    return { verdict: "Wrong Answer" };
  }
  if (normalized.includes("compile error") || normalized.includes("compilation error") || hasVerdictToken(normalized, "ce") || text.includes("编译错误") || text.includes("编译失败")) {
    return { verdict: "Compile Error" };
  }
  if (normalized.includes("accepted") || hasVerdictToken(normalized, "ac") || text.includes("答案正确")) return { verdict: "Accepted" };
  return null;
}

function hasVerdictToken(text: string, token: string): boolean {
  return text.split(/[^a-z]+/u).includes(token);
}
