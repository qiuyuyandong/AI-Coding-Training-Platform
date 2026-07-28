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
      return { platform, externalId: normalizeLeetCodeSlug(externalId) };
    case "codeforces":
      return { platform, externalId: normalizeCodeforcesId(externalId) };
    case "atcoder":
      return { platform, externalId: normalizeAtCoderId(externalId) };
    case "luogu":
      return { platform, externalId: normalizeLuoguId(externalId) };
    case "nowcoder":
      return { platform, externalId: normalizeNowCoderExternalId(externalId) };
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
      return `https://leetcode.cn/problems/${normalized.externalId}/`;
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
      return nowcoderCanonicalUrl(normalized.externalId);
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

function normalizeLeetCodeSlug(value: string): string {
  const trimmed = trimSlashes(value).toLowerCase();
  // Lowercase slugs are made of letters, digits, and dashes. The slug must start
  // and end with an alphanumeric so empty slugs and pure dashes cannot escape.
  if (!/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/u.test(trimmed)) {
    throw new CanonicalProblemUrlError("Invalid LeetCode problem slug");
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
  // Luogu problem IDs are uppercase alphanumerics with optional dashes/underscores.
  // Inputs like "/record/123" leave a "/" inside the candidate so this fails
  // before any case conversion; unsupported paths surface as identity errors
  // rather than fabricated externalIds.
  if (!/^[A-Z0-9_-]+$/u.test(normalized)) {
    throw new CanonicalProblemUrlError("Invalid Luogu problem ID");
  }
  return normalized;
}

const NOWCODER_PRACTICE_PREFIX = "practice/";
const NOWCODER_ACM_PREFIX = "acm/problem/";
const NOWCODER_PHASE_B_CONTEST_PROBLEM = "acm/contest/18839/1001";
const NOWCODER_ID_PATTERN = /^[A-Za-z0-9_-]+$/u;
const NOWCODER_ABSOLUTE_URL_PATTERN = /^https?:\/\//iu;

function normalizeNowCoderExternalId(value: string): string {
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    throw new CanonicalProblemUrlError("Invalid NowCoder problem path");
  }

  if (NOWCODER_ABSOLUTE_URL_PATTERN.test(trimmed)) {
    return parseNowCoderAbsoluteUrl(trimmed);
  }

  // Relative paths: pick the host namespace from the prefix and run the
  // resulting URL through the absolute path so query strings and hash
  // fragments are dropped consistently.
  const stripped = trimmed.replace(/^\/+/u, "").replace(/\/+$/u, "");
  if (stripped === NOWCODER_PHASE_B_CONTEST_PROBLEM) {
    return NOWCODER_PHASE_B_CONTEST_PROBLEM;
  }
  if (stripped.startsWith(NOWCODER_PRACTICE_PREFIX)) {
    return parseNowCoderRelative(stripped, "https://www.nowcoder.com/", NOWCODER_PRACTICE_PREFIX, "/practice/", "www.nowcoder.com");
  }
  if (stripped.startsWith(NOWCODER_ACM_PREFIX)) {
    return parseNowCoderRelative(stripped, "https://ac.nowcoder.com/", NOWCODER_ACM_PREFIX, "/acm/problem/", "ac.nowcoder.com");
  }
  throw new CanonicalProblemUrlError("Invalid NowCoder problem path");
}

function parseNowCoderRelative(
  stripped: string,
  base: string,
  externalPrefix: string,
  urlPrefix: string,
  host: string,
): string {
  let parsed: URL;
  try {
    parsed = new URL(stripped, base);
  } catch (error) {
    if (error instanceof TypeError) {
      throw new CanonicalProblemUrlError(`Invalid NowCoder problem path for ${host}`);
    }
    throw error;
  }
  return readNowCoderId(parsed.pathname, externalPrefix, urlPrefix, host);
}

function parseNowCoderAbsoluteUrl(raw: string): string {
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch (error) {
    if (error instanceof TypeError) {
      throw new CanonicalProblemUrlError("Invalid NowCoder problem path");
    }
    throw error;
  }
  if (parsed.protocol !== "https:") {
    throw new CanonicalProblemUrlError("Invalid NowCoder problem path");
  }
  if (parsed.username !== "" || parsed.password !== "" || parsed.port !== "") {
    throw new CanonicalProblemUrlError("Invalid NowCoder problem path");
  }
  if (parsed.hostname === "www.nowcoder.com") {
    return readNowCoderId(parsed.pathname, NOWCODER_PRACTICE_PREFIX, "/practice/", "www.nowcoder.com");
  }
  if (parsed.hostname === "ac.nowcoder.com") {
    if (parsed.pathname === `/${NOWCODER_PHASE_B_CONTEST_PROBLEM}`
      || parsed.pathname === `/${NOWCODER_PHASE_B_CONTEST_PROBLEM}/`) {
      return NOWCODER_PHASE_B_CONTEST_PROBLEM;
    }
    return readNowCoderId(parsed.pathname, NOWCODER_ACM_PREFIX, "/acm/problem/", "ac.nowcoder.com");
  }
  throw new CanonicalProblemUrlError("Invalid NowCoder problem path");
}

function readNowCoderId(
  pathname: string,
  externalPrefix: string,
  urlPrefix: string,
  host: string,
): string {
  const cleaned = pathname === "/" ? pathname : pathname.replace(/\/+$/u, "");
  if (!cleaned.startsWith(urlPrefix)) {
    throw new CanonicalProblemUrlError(`Invalid NowCoder problem path for ${host}`);
  }
  const id = cleaned.slice(urlPrefix.length);
  if (id.length === 0 || !NOWCODER_ID_PATTERN.test(id)) {
    throw new CanonicalProblemUrlError(`Invalid NowCoder problem path for ${host}`);
  }
  return `${externalPrefix}${id}`;
}

function nowcoderCanonicalUrl(externalId: string): string {
  if (externalId === NOWCODER_PHASE_B_CONTEST_PROBLEM) {
    return `https://ac.nowcoder.com/${NOWCODER_PHASE_B_CONTEST_PROBLEM}`;
  }
  if (externalId.startsWith(NOWCODER_PRACTICE_PREFIX)) {
    const id = externalId.slice(NOWCODER_PRACTICE_PREFIX.length);
    if (id.length === 0 || !NOWCODER_ID_PATTERN.test(id)) {
      throw new CanonicalProblemUrlError("Invalid NowCoder problem path");
    }
    return `https://www.nowcoder.com/practice/${id}`;
  }
  if (externalId.startsWith(NOWCODER_ACM_PREFIX)) {
    const id = externalId.slice(NOWCODER_ACM_PREFIX.length);
    if (id.length === 0 || !NOWCODER_ID_PATTERN.test(id)) {
      throw new CanonicalProblemUrlError("Invalid NowCoder problem path");
    }
    return `https://ac.nowcoder.com/acm/problem/${id}`;
  }
  throw new CanonicalProblemUrlError("Invalid NowCoder problem path");
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
