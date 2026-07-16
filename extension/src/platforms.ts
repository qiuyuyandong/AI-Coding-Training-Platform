import {
  CanonicalProblemUrlError,
  canonicalProblemUrl,
  normalizeProblemIdentity,
} from "@/lib/services/canonicalProblemUrl";

export type Platform = "leetcode" | "nowcoder" | "luogu" | "codeforces" | "atcoder";

export type PlatformAdapterStatus = "production" | "experimental" | "disabled";

export type PlatformAdapterRecord = {
  readonly status: PlatformAdapterStatus;
  readonly label: string;
  readonly selectors: readonly string[];
};

export const PLATFORM_ADAPTERS: Record<Platform, PlatformAdapterRecord> = {
  leetcode: {
    status: "experimental",
    label: "LeetCode",
    selectors: [
      '[data-e2e-locator="submission-result"]',
      '[data-cy="submission-result"]',
      ".text-green-s",
      ".text-red-s",
      "body",
    ],
  },
  codeforces: {
    status: "experimental",
    label: "Codeforces",
    selectors: [".status-cell", "td.status-small", ".verdict-accepted", "body"],
  },
  atcoder: {
    status: "experimental",
    label: "AtCoder",
    selectors: ["#judge-status"],
  },
  nowcoder: {
    status: "experimental",
    label: "NowCoder",
    selectors: [".result", ".submission-result", ".judge-result", "body"],
  },
  luogu: {
    status: "experimental",
    label: "Luogu",
    selectors: [".status", ".record-status", ".submission-status", "body"],
  },
};

export function getPlatformAdapterStatus(platform: Platform): PlatformAdapterStatus {
  return PLATFORM_ADAPTERS[platform].status;
}

export function getProductionPlatforms(): Platform[] {
  return (Object.keys(PLATFORM_ADAPTERS) as Platform[]).filter(
    (p) => PLATFORM_ADAPTERS[p].status === "production",
  );
}

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

export function detectProblemFromPage(
  location: DetectableLocation,
  pageDocument: Document,
): DetectedProblem | null {
  // Parse location.href exactly once; the parsed URL is the single source of truth
  // for routing and for any URL-only fallback. Inconsistent supplied DetectableLocation
  // fields cannot bypass the spoof guard or the strict-origin check.
  let parsed: URL;
  try {
    parsed = new URL(location.href);
  } catch (error) {
    if (error instanceof TypeError) return null;
    throw error;
  }
  // Reject any parsed host that contains "atcoder.jp" as a substring but is not the
  // exact first-party host (e.g. atcoder.jp.evil.example).
  if (parsed.hostname !== "atcoder.jp" && parsed.hostname.includes("atcoder.jp")) return null;
  if (parsed.hostname === "atcoder.jp") {
    // First-party AtCoder page identity: https, exact host, no credentials, default port.
    // Query strings (e.g. ?lang=en) and hash fragments are allowed because retained public
    // source URLs use them.
    if (parsed.protocol !== "https:" || parsed.username !== "" || parsed.password !== "" || parsed.port !== "") return null;
    const contest = matchAtCoderSubmissionPath(parsed.pathname);
    if (contest !== null) {
      return detectProblemFromAtCoderSubmissionPage(contest, pageDocument);
    }
  }
  const normalized: DetectableLocation = {
    href: parsed.href,
    hostname: parsed.hostname,
    pathname: parsed.pathname,
  };
  return detectProblemFromLocation(normalized, pageDocument.title);
}

function matchAtCoderSubmissionPath(pathname: string): string | null {
  const match = pathname.match(/^\/contests\/([^/]+)\/submissions\/(\d+)\/?$/u);
  if (match === null || match[1] === undefined) return null;
  return match[1];
}

function isExactAtCoderFirstPartyOrigin(parsed: URL): boolean {
  return parsed.protocol === "https:"
    && parsed.hostname === "atcoder.jp"
    && parsed.username === ""
    && parsed.password === ""
    && parsed.port === ""
    && parsed.search === ""
    && parsed.hash === "";
}

function normalizeAtCoderTaskId(taskId: string) {
  try {
    return normalizeProblemIdentity({ platform: "atcoder", externalId: taskId });
  } catch (error) {
    if (error instanceof CanonicalProblemUrlError) return null;
    throw error;
  }
}

function detectProblemFromAtCoderSubmissionPage(
  contest: string,
  pageDocument: Document,
): DetectedProblem | null {
  // Dedupe by normalized (platform, externalId); preserve first-seen trimmed title.
  const identities = new Map<string, string>();
  for (const anchor of Array.from(pageDocument.querySelectorAll("a[href]"))) {
    const href = anchor.getAttribute("href");
    if (href === null) continue;
    let parsed: URL;
    try {
      parsed = new URL(href, "https://atcoder.jp/");
    } catch (error) {
      if (error instanceof TypeError) continue;
      throw error;
    }
    if (!isExactAtCoderFirstPartyOrigin(parsed)) continue;
    const taskMatch = parsed.pathname.match(/^\/contests\/([^/]+)\/tasks\/([^/]+)\/?$/u);
    if (taskMatch === null) continue;
    const anchorContest = taskMatch[1];
    const taskId = taskMatch[2];
    if (anchorContest === undefined || taskId === undefined) continue;
    // Require both the raw anchor-path contest AND the normalized task-ID contest to equal
    // the submission-page contest. Raw anchor check catches path-level spoofing; normalized
    // task-ID check catches ID-level inconsistencies.
    if (anchorContest !== contest) continue;

    const normalized = normalizeAtCoderTaskId(taskId);
    if (normalized === null) continue;
    if (normalized.platform !== "atcoder") continue;
    const taskContest = normalized.externalId.split("_", 1)[0];
    if (taskContest !== contest) continue;

    if (!identities.has(normalized.externalId)) {
      identities.set(normalized.externalId, anchor.textContent?.trim() ?? "");
    }
  }

  if (identities.size !== 1) return null;
  const first = identities.entries().next();
  if (first.done === true) return null;
  const [externalId, title] = first.value;

  const observedUrl = `https://atcoder.jp/contests/${contest}/tasks/${externalId}`;
  try {
    return detectedProblem(
      { platform: "atcoder", externalId },
      title,
      observedUrl,
    );
  } catch (error) {
    if (error instanceof CanonicalProblemUrlError) return null;
    throw error;
  }
}

export function detectVerdictFromDocument(platform: Platform, pageDocument: Document): DetectedVerdict | null {
  const text = candidateTextForPlatform(platform, pageDocument);
  return verdictFromText(text);
}

function candidateTextForPlatform(platform: Platform, pageDocument: Document): string {
  return textFromSelectors(pageDocument, [...PLATFORM_ADAPTERS[platform].selectors]);
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
