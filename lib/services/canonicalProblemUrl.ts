import { PlatformSchema, type Platform } from "@/lib/domain/source";

export type ProblemIdentity = {
  readonly platform: Platform;
  readonly externalId: string;
};

export class CanonicalProblemUrlError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CanonicalProblemUrlError";
  }
}

export function normalizeProblemIdentity(
  identity: ProblemIdentity,
): ProblemIdentity {
  const platform = PlatformSchema.parse(identity.platform);
  const externalId = identity.externalId.trim();
  if (externalId.length === 0 || /^\/*$/.test(externalId)) {
    throw new CanonicalProblemUrlError("Problem external ID is required");
  }

  switch (platform) {
    case "leetcode":
      return { platform, externalId: trimSlashes(externalId).toLowerCase() };
    case "codeforces":
      return { platform, externalId: normalizeCodeforcesId(externalId) };
    case "atcoder":
      return { platform, externalId: normalizeAtCoderId(externalId) };
    case "luogu":
      return { platform, externalId: normalizeLuoguId(externalId) };
    case "nowcoder":
      return { platform, externalId: normalizeNowCoderPath(externalId) };
    case "manual":
      return { platform, externalId };
  }
}

export function canonicalProblemUrl(
  identity: ProblemIdentity,
  observedUrl?: string,
): string {
  const normalized = normalizeProblemIdentity(identity);
  switch (normalized.platform) {
    case "leetcode":
      return `https://leetcode.com/problems/${normalized.externalId}/`;
    case "codeforces": {
      const parts = codeforcesParts(normalized.externalId);
      return `https://codeforces.com/problemset/problem/${parts.contest}/${parts.index}`;
    }
    case "atcoder": {
      const contest = normalized.externalId.split("_", 1)[0];
      if (contest === undefined || contest.length === 0) {
        throw new CanonicalProblemUrlError("Invalid AtCoder task ID");
      }
      return `https://atcoder.jp/contests/${contest}/tasks/${normalized.externalId}`;
    }
    case "luogu":
      return `https://www.luogu.com.cn/problem/${normalized.externalId}`;
    case "nowcoder":
      return `https://www.nowcoder.com${normalized.externalId}`;
    case "manual":
      if (observedUrl === undefined) {
        throw new CanonicalProblemUrlError("Manual problems require an observed URL");
      }
      return normalizeGenericUrl(observedUrl);
  }
}

function trimSlashes(value: string): string {
  const trimmed = value.replace(/^\/+|\/+$/gu, "");
  if (trimmed.length === 0) {
    throw new CanonicalProblemUrlError("Problem external ID is required");
  }
  return trimmed;
}

function normalizeCodeforcesId(value: string): string {
  const compact = trimSlashes(value).replaceAll("/", "");
  const parts = codeforcesParts(compact);
  return `${parts.contest}${parts.index}`;
}

function codeforcesParts(value: string): {
  readonly contest: string;
  readonly index: string;
} {
  const match = value.match(/^(\d+)([A-Za-z][A-Za-z0-9]*)$/u);
  if (match?.[1] === undefined || match[2] === undefined) {
    throw new CanonicalProblemUrlError("Invalid Codeforces problem ID");
  }
  return { contest: match[1], index: match[2].toUpperCase() };
}

function normalizeAtCoderId(value: string): string {
  const normalized = trimSlashes(value).toLowerCase();
  if (!/^[a-z0-9]+_[a-z0-9_]+$/u.test(normalized)) {
    throw new CanonicalProblemUrlError("Invalid AtCoder task ID");
  }
  return normalized;
}

function normalizeLuoguId(value: string): string {
  const normalized = trimSlashes(value)
    .replace(/^problem\//iu, "")
    .toUpperCase();
  if (!/^[A-Z0-9_-]+$/u.test(normalized)) {
    throw new CanonicalProblemUrlError("Invalid Luogu problem ID");
  }
  return normalized;
}

function normalizeNowCoderPath(value: string): string {
  const parsed = new URL(value, "https://www.nowcoder.com/");
  if (parsed.hostname !== "www.nowcoder.com") {
    throw new CanonicalProblemUrlError("Invalid NowCoder problem path");
  }
  const pathname = parsed.pathname === "/"
    ? parsed.pathname
    : parsed.pathname.replace(/\/+$/u, "");
  return pathname.startsWith("/") ? pathname : `/${pathname}`;
}

function normalizeGenericUrl(value: string): string {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch (error) {
    if (error instanceof TypeError) {
      throw new CanonicalProblemUrlError("Problem URL is invalid");
    }
    throw error;
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new CanonicalProblemUrlError("Problem URL must use HTTP or HTTPS");
  }
  parsed.search = "";
  parsed.hash = "";
  return parsed.toString();
}
