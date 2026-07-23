import {
  CanonicalProblemUrlError,
  canonicalProblemUrl,
  normalizeProblemIdentity,
} from "@/lib/services/canonicalProblemUrl";
import { normalizeTrustedVerdictText } from "@/lib/capture/verdictTaxonomy";

export type Platform = "leetcode" | "nowcoder" | "luogu" | "codeforces" | "atcoder";

export type PlatformAdapterStatus = "production" | "experimental" | "disabled";

/**
 * Optional per-platform semantic extractor used by `detectVerdictFromDocument`
 * when CSS selectors alone cannot disambiguate real verdict spans from
 * unrelated colored text or navigation chrome. Each extractor receives a
 * document and returns a strictly narrowed candidate string — never the bare
 * body. Returning an empty string is equivalent to "no evidence observed";
 * `detectVerdictFromDocument` then maps that to `null`.
 */
export type PlatformCandidateExtractor = (pageDocument: Document) => string;

export type PlatformAdapterRecord = {
  readonly status: PlatformAdapterStatus;
  readonly label: string;
  /**
   * Narrow CSS selectors used as fallback evidence. Selectors are evaluated
   * against the verified-public-DOM contract and explicitly excluded from
   * broad fallbacks such as `body`. Platforms whose verdict DOM is best
   * reached via a semantic extractor (e.g. Luogu record rows) may declare an
   * empty `selectors` array together with `extractor`.
   */
  readonly selectors: readonly string[];
  readonly extractor?: PlatformCandidateExtractor;
};

// Verdict detection selectors remain deliberately narrow. The earlier "body"
// fallback made the detector scan the entire document text, which produced
// false positives like any page mentioning "AC" or "答案正确" in navigation
// chrome, headlines, or comment threads. Only the explicitly evidence-backed
// selectors/extractors below are used. Three-platform real verdict selectors
// (LeetCode.cn / NowCoder / Luogu record verdict DOM) ship here as either
// narrow CSS selectors or semantic extractors; their fixtures live under
// `tests/fixtures/{leetcode,nowcoder,luogu}` and carry the
// `authenticated-characterization` evidence tier so they can never satisfy
// the public-DOM certification gate.
export const PLATFORM_ADAPTERS: Record<Platform, PlatformAdapterRecord> = {
  leetcode: {
    status: "experimental",
    label: "LeetCode",
    // The legacy authenticated fixture uses submission-result. The current
    // problem-scoped result page uses duplicate console-result nodes for its
    // two synchronized panes. The extractor below accepts either locator,
    // collapses identical visible values, and rejects conflicting panes.
    selectors: ['[data-e2e-locator="submission-result"]'],
    extractor: extractLeetCodeVerdictText,
  },
  codeforces: {
    status: "experimental",
    label: "Codeforces",
    selectors: [".status-cell", "td.status-small", ".verdict-accepted"],
  },
  atcoder: {
    status: "production",
    label: "AtCoder",
    selectors: ["#judge-status"],
  },
  nowcoder: {
    status: "experimental",
    label: "NowCoder",
    // The public view-submission page wraps the verdict under
    // `<div class="coder-cont-legend">运行状态:<span class="font-green">答案正确</span></div>`.
    // The previously registered `.result`, `.submission-result` and `.judge-result`
    // selectors matched zero observed nodes and have been removed to keep the
    // registry evidence-backed.
    selectors: [".coder-cont-legend"],
  },
  luogu: {
    status: "experimental",
    label: "Luogu",
    // Luogu records expose verdict text inside an unlabeled semantic row
    // keyed by the exact label "评测状态" and a sibling `<span style="color: rgb(82, 196, 26)">`.
    // We deliberately do NOT register CSS selectors here: the previously
    // recorded `.status`, `.record-status`, `.submission-status` matched zero
    // observed nodes and would have produced false positives on dev pages.
    // The semantic extractor below walks every node, requires a uniquely
    // labelled "评测状态" leaf, and reads the entire row text. Empty rows
    // produce empty candidate text, which forces `verdictFromText` to return
    // null rather than guessing.
    selectors: [],
    extractor: extractLuoguRecordRowText,
  },
};

export function getPlatformAdapterStatus(platform: Platform): PlatformAdapterStatus {
  return PLATFORM_ADAPTERS[platform].status;
}

export function getProductionPlatforms(): Platform[] {
  const all = ["leetcode", "codeforces", "atcoder", "nowcoder", "luogu"] as const satisfies readonly Platform[];
  return all.filter((p) => PLATFORM_ADAPTERS[p].status === "production");
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
  let parsed: URL;
  try {
    parsed = new URL(location.href);
  } catch (error) {
    if (error instanceof TypeError) return null;
    throw error;
  }
  // Trust parsed origin/host over the supplied DetectableLocation fields so an
  // inconsistent location cannot bypass the strict-origin check.
  if (!isSafeHttpsOrigin(parsed)) return null;

  const normalized: DetectableLocation = {
    href: parsed.href,
    hostname: parsed.hostname,
    pathname: parsed.pathname,
  };
  const title = documentTitle.replace(/ - .*$/, "").trim();

  const leetCode = detectLeetCodeProblem(normalized, parsed);
  if (leetCode !== null) {
    return buildDetectedProblem(
      { platform: "leetcode", externalId: leetCode.externalId },
      title,
      normalized.href,
    );
  }

  const codeforces = detectCodeforcesProblem(normalized, parsed);
  if (codeforces !== null) {
    return buildDetectedProblem(
      { platform: "codeforces", externalId: codeforces.externalId },
      title,
      normalized.href,
    );
  }

  const atcoder = detectAtCoderProblem(normalized, parsed);
  if (atcoder !== null) {
    return buildDetectedProblem(
      { platform: "atcoder", externalId: atcoder.externalId },
      title,
      normalized.href,
    );
  }

  const nowcoder = tryDetectNowCoderProblem(parsed);
  if (nowcoder !== null) {
    return buildDetectedProblem(
      { platform: "nowcoder", externalId: nowcoder.externalId },
      title,
      normalized.href,
    );
  }

  const luogu = detectLuoguProblem(normalized, parsed);
  if (luogu !== null) {
    return buildDetectedProblem(
      { platform: "luogu", externalId: luogu.externalId },
      title,
      normalized.href,
    );
  }

  return null;
}

function detectLeetCodeProblem(
  location: DetectableLocation,
  parsed: URL,
): { readonly externalId: string } | null {
  if (parsed.hostname !== "leetcode.com" && parsed.hostname !== "leetcode.cn") {
    return null;
  }
  // Match `/problems/<slug>` with optional trailing path segments such as
  // `/description/` or `/submissions/detail/...`. The slug must be non-empty
  // and made of lowercase letters, digits, and dashes.
  const match = parsed.pathname.match(
    /^\/problems\/([a-z0-9](?:[a-z0-9-]*[a-z0-9])?)(?:\/.*)?$/iu,
  );
  if (match === null) return null;
  const slug = match[1];
  if (slug === undefined) return null;
  return { externalId: slug };
}

function detectCodeforcesProblem(
  location: DetectableLocation,
  parsed: URL,
): { readonly externalId: string } | null {
  if (parsed.hostname !== "codeforces.com") return null;
  const match = parsed.pathname.match(
    /^\/problemset\/problem\/(\d+)\/([A-Za-z][A-Za-z0-9]*)\/?$/u,
  );
  if (match === null) return null;
  const contest = match[1];
  const index = match[2];
  if (contest === undefined || index === undefined) return null;
  return { externalId: `${contest}${index.toUpperCase()}` };
}

function detectAtCoderProblem(
  location: DetectableLocation,
  parsed: URL,
): { readonly externalId: string } | null {
  if (parsed.hostname !== "atcoder.jp") return null;
  const match = parsed.pathname.match(
    /^\/contests\/([^/]+)\/tasks\/([^/]+?)\/?$/u,
  );
  if (match === null) return null;
  const taskId = match[2];
  if (match[1] === undefined || taskId === undefined) return null;
  return { externalId: taskId };
}

function tryDetectNowCoderProblem(
  parsed: URL,
): { readonly externalId: string } | null {
  // Reject other NowCoder pages (login, registration, contest home, company
  // home) so we never fabricate an externalId from an unrelated route. The
  // strict path check throws; catch it here so detectProblemFromLocation can
  // return null instead of propagating the error to the caller.
  try {
    if (parsed.hostname === "www.nowcoder.com") {
      const id = readNowCoderSegment(parsed.pathname, "/practice/", "www.nowcoder.com");
      return { externalId: `practice/${id}` };
    }
    if (parsed.hostname === "ac.nowcoder.com") {
      const id = readNowCoderSegment(parsed.pathname, "/acm/problem/", "ac.nowcoder.com");
      return { externalId: `acm/problem/${id}` };
    }
    return null;
  } catch (error) {
    if (error instanceof CanonicalProblemUrlError) return null;
    throw error;
  }
}

function readNowCoderSegment(pathname: string, urlPrefix: string, host: string): string {
  // Reject other NowCoder pages (login, registration, contest home, company
  // home) so we never fabricate an externalId from an unrelated route.
  const cleaned = pathname === "/" ? pathname : pathname.replace(/\/+$/u, "");
  if (!cleaned.startsWith(urlPrefix)) {
    throw new CanonicalProblemUrlError(`Invalid NowCoder problem path for ${host}`);
  }
  const id = cleaned.slice(urlPrefix.length);
  if (id.length === 0 || !/^[A-Za-z0-9_-]+$/u.test(id)) {
    throw new CanonicalProblemUrlError(`Invalid NowCoder problem path for ${host}`);
  }
  return id;
}

function detectLuoguProblem(
  location: DetectableLocation,
  parsed: URL,
): { readonly externalId: string } | null {
  if (parsed.hostname !== "www.luogu.com.cn") return null;
  // Only `/problem/<id>` is a problem identity reachable from URL alone.
  // Record pages (`/record/<digits>`) require authenticated, sanitized DOM
  // with exactly one unique problem anchor and are therefore resolved only
  // from the DOM via `detectProblemFromPage`; URL-only detection never
  // fabricates an externalId for a record path.
  const match = parsed.pathname.match(/^\/problem\/([A-Za-z0-9_-]+)\/?$/u);
  if (match === null) return null;
  const id = match[1];
  if (id === undefined) return null;
  return { externalId: id.toUpperCase() };
}

function isSafeHttpsOrigin(parsed: URL): boolean {
  return parsed.protocol === "https:"
    && parsed.username === ""
    && parsed.password === ""
    && parsed.port === "";
}

function buildDetectedProblem(
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
  if (!isSafeHttpsOrigin(parsed)) return null;

  // First-party AtCoder page identity: https, exact host, no credentials,
  // default port. Submission pages resolve via the unique on-page task
  // anchor; task URLs fall through to URL-only detection below.
  if (parsed.hostname === "atcoder.jp") {
    const contest = matchAtCoderSubmissionPath(parsed.pathname);
    if (contest !== null) {
      return detectProblemFromAtCoderSubmissionPage(contest, pageDocument);
    }
  }

  // Domestic-platform authenticated-characterization resolution. These
  // record/submission routes are only resolved from sanitized DOM with
  // exactly one valid first-party problem anchor. URL-only detection never
  // fabricates an externalId for record/submission routes.
  const domestic = detectProblemFromDomesticSubmissionPage(parsed, pageDocument);
  if (domestic !== null) return domestic;

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
    return detectedProblemWithTitle(
      { platform: "atcoder", externalId },
      title,
      observedUrl,
    );
  } catch (error) {
    if (error instanceof CanonicalProblemUrlError) return null;
    throw error;
  }
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

function detectedProblemWithTitle(
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

// ---- Domestic-OJ authenticated-characterization resolution -----------------
//
// Three record/submission routes each emit a unique first-party problem link
// in their visible DOM:
//
//   • LeetCode `/submissions/detail/<digits>/`  → anchor `/problems/<slug>/`
//   • NowCoder `/acm/contest/view-submission?submissionId=<digits>` → anchor `/acm/problem/<id>`
//   • Luogu `/record/<digits>`                 → anchor `/problem/<id>`
//
// We resolve these only when:
//   1. The page URL is exact (HTTPS, exact host, no credentials, default
//      port, route shape matches the platform's documented segment, no
//      extra path segments, no unexpected query/hash noise).
//   2. The sanitized DOM contains exactly one valid first-party problem
//      anchor — no zero, no multiple, no conflicting identities, no spoofed
//      host substring like "leetcode.cn.evil.example".
//
// URL-only `detectProblemFromLocation` deliberately never reads these routes:
// without DOM evidence we cannot distinguish a real record from an aggregated
// dashboard, a synthetic profile page, or a phishing mirror.

type DomesticAnchorExternalIdResolver = (
  pathname: string,
) => string | null;

interface DomesticSubmissionRoute {
  readonly platform: Platform;
  readonly host: string;
  /**
   * Returns true iff the parsed URL matches the exact documented route
   * shape, including any expected query string and absence of hash.
   */
  readonly matchUrl: (parsed: URL) => boolean;
  /**
   * Returns the normalized externalId extracted from a first-party
   * anchor's pathname, or null if the pathname is not a recognized
   * problem path for this platform.
   *
   * The anchor's visible label (`anchor.textContent.trim()`) is captured
   * separately and surfaced as `problemTitle` so duplicate anchors with
   * the same id but different visible labels collapse cleanly without
   * silently picking an arbitrary one.
   */
  readonly resolveAnchor: DomesticAnchorExternalIdResolver;
}

const DOMESTIC_ROUTES: readonly DomesticSubmissionRoute[] = [
  {
    platform: "leetcode",
    host: "leetcode.cn",
    matchUrl: (parsed) =>
      parsed.search === ""
      && parsed.hash === ""
      && /^\/submissions\/detail\/\d+\/?$/u.test(parsed.pathname),
    resolveAnchor: resolveLeetCodeProblemAnchor,
  },
  {
    platform: "nowcoder",
    host: "ac.nowcoder.com",
    // NowCoder's view-submission page is reachable at the exact path
    // `/acm/contest/view-submission` with a single required query
    // parameter `submissionId=<digits>` and no hash. The query parameter
    // is the public submission identifier; we keep its exact shape so a
    // smuggled `?foo=bar` cannot be tolerated.
    matchUrl: (parsed) => {
      if (parsed.hash !== "") return false;
      if (parsed.pathname !== "/acm/contest/view-submission"
        && parsed.pathname !== "/acm/contest/view-submission/") {
        return false;
      }
      const params = parsed.searchParams;
      if (Array.from(params.keys()).length !== 1) return false;
      const id = params.get("submissionId");
      if (id === null || !/^\d+$/u.test(id)) return false;
      return true;
    },
    resolveAnchor: resolveNowCoderProblemAnchor,
  },
  {
    platform: "luogu",
    host: "www.luogu.com.cn",
    matchUrl: (parsed) =>
      parsed.search === ""
      && parsed.hash === ""
      && /^\/record\/\d+\/?$/u.test(parsed.pathname),
    resolveAnchor: resolveLuoguProblemAnchor,
  },
];

function detectProblemFromDomesticSubmissionPage(
  parsed: URL,
  pageDocument: Document,
): DetectedProblem | null {
  for (const route of DOMESTIC_ROUTES) {
    if (parsed.hostname !== route.host) continue;
    if (parsed.protocol !== "https:") continue;
    if (parsed.username !== "" || parsed.password !== "" || parsed.port !== "") continue;
    if (!route.matchUrl(parsed)) continue;
    return resolveDomesticRoute(route, pageDocument);
  }
  return null;
}

/**
 * Validate and normalize a problem title extracted from a DOM anchor.
 *
 * Privacy hardening: we only accept text from leaf anchors (no child
 * elements), normalize whitespace, require a non-empty result, reject
 * overlong text (conservative <=200 character limit), and reject any
 * string containing control characters. If the title is unsafe the anchor
 * is skipped — no long statement or hidden nested text can be persisted.
 */
function safeAnchorTitle(anchor: Element): string | null {
  // Narrow to anchor elements only; querySelectorAll("a[href]") returns
  // NodeListOf<Element> so we double-check the tag here.
  if (!(anchor instanceof HTMLAnchorElement)) return null;

  if (isElementHidden(anchor)) return null;

  // Only leaf anchors are acceptable: a visible label with no child
  // elements prevents decorative icons, nested spans, or hidden text
  // from contributing unexpected content to the title.
  if (anchor.children.length > 0) return null;

  const raw = anchor.textContent ?? "";
  if (raw.length === 0) return null;

  // Whitespace normalization: collapse runs of any whitespace (including
  // NBSP and zero-width spaces) into a single ASCII space, then trim.
  const normalized = raw.replace(/[\s\u00a0\u200b]+/gu, " ").trim();
  if (normalized.length === 0) return null;
  if (normalized.length > 200) return null;

  // Whitespace controls were normalized above. Reject any remaining ASCII
  // control characters (0x00–0x1f, 0x7f), which cannot appear in a legitimate
  // problem title.
  if (/[\x00-\x1f\x7f]/.test(normalized)) return null;

  return normalized;
}

function isElementHidden(element: Element): boolean {
  const view = element.ownerDocument.defaultView;
  let current: Element | null = element;
  while (current !== null) {
    if (current.hasAttribute("hidden")) return true;
    if (current.getAttribute("aria-hidden")?.trim().toLowerCase() === "true") return true;

    const inlineStyle = current.getAttribute("style") ?? "";
    if (/(?:^|;)\s*display\s*:\s*none\s*(?:;|$)/iu.test(inlineStyle)) return true;
    if (/(?:^|;)\s*visibility\s*:\s*(?:hidden|collapse)\s*(?:;|$)/iu.test(inlineStyle)) return true;

    if (view !== null) {
      const computed = view.getComputedStyle(current);
      if (computed.display === "none") return true;
      if (computed.visibility === "hidden" || computed.visibility === "collapse") return true;
    }
    current = current.parentElement;
  }
  return false;
}

function resolveDomesticRoute(
  route: DomesticSubmissionRoute,
  pageDocument: Document,
): DetectedProblem | null {
  // Dedupe by normalized externalId (the unique anchor identity).
  // When two distinct anchors resolve to the same externalId we keep
  // the FIRST-seen trimmed anchor text, never overwriting with a
  // divergent value. Multiple distinct identities yield null below.
  const identities = new Map<string, string>();
  for (const anchor of Array.from(pageDocument.querySelectorAll("a[href]"))) {
    const href = anchor.getAttribute("href");
    if (href === null) continue;
    const anchorUrl = safeParseAnchorUrl(href, route.host);
    if (anchorUrl === null) continue;
    if (!isExactFirstPartyAnchor(anchorUrl, route.host)) continue;
    const externalId = route.resolveAnchor(anchorUrl.pathname);
    if (externalId === null) continue;
    if (!identities.has(externalId)) {
      // Privacy-hardened title extraction: leaf-only, whitespace
      // normalized, length-capped, control-char rejected.
      const title = safeAnchorTitle(anchor);
      if (title === null) continue;
      identities.set(externalId, title);
    }
  }
  if (identities.size !== 1) return null;
  const first = identities.entries().next();
  if (first.done === true) return null;
  const [externalId, title] = first.value;

  try {
    const identity = { platform: route.platform, externalId };
    const normalized = normalizeProblemIdentity(identity);
    if (normalized.platform !== route.platform) return null;
    return {
      platform: normalized.platform,
      problemExternalId: normalized.externalId,
      problemTitle: title,
      canonicalUrl: canonicalProblemUrl(normalized),
    };
  } catch (error) {
    if (error instanceof CanonicalProblemUrlError) return null;
    throw error;
  }
}

function safeParseAnchorUrl(href: string, host: string): URL | null {
  let parsed: URL;
  try {
    parsed = new URL(href, `https://${host}/`);
  } catch (error) {
    if (error instanceof TypeError) return null;
    throw error;
  }
  return parsed;
}

function isExactFirstPartyAnchor(parsed: URL, host: string): boolean {
  // Exact first-party host only. Substring matches like "leetcode.cn.evil.example"
  // are not acceptable even if the path looks plausible. We also reject any
  // anchor URL that smuggles credentials, an unexpected port, query strings,
  // hash fragments, or a non-https scheme.
  return parsed.protocol === "https:"
    && parsed.hostname === host
    && parsed.username === ""
    && parsed.password === ""
    && parsed.port === ""
    && parsed.search === ""
    && parsed.hash === "";
}

function resolveLeetCodeProblemAnchor(pathname: string): string | null {
  const match = pathname.match(/^\/problems\/([a-z0-9](?:[a-z0-9-]*[a-z0-9])?)\/?$/iu);
  if (match === null) return null;
  const slug = match[1];
  if (slug === undefined) return null;
  return slug.toLowerCase();
}

function resolveNowCoderProblemAnchor(pathname: string): string | null {
  // NowCoder acm contest submissions link to the public problem view at
  // `/acm/problem/<id>`. The normalized externalId carries the
  // `acm/problem/<id>` prefix so it round-trips through
  // `normalizeNowCoderExternalId` and the canonical NowCoder builder.
  const match = pathname.match(/^\/acm\/problem\/([A-Za-z0-9_-]+)\/?$/u);
  if (match === null) return null;
  const id = match[1];
  if (id === undefined) return null;
  return `acm/problem/${id}`;
}

function resolveLuoguProblemAnchor(pathname: string): string | null {
  // Luogu record pages link to the public problem view at `/problem/<id>`.
  // The canonical normalized form uppercases the id (see normalizeLuoguId).
  const match = pathname.match(/^\/problem\/([A-Za-z0-9_-]+)\/?$/u);
  if (match === null) return null;
  const id = match[1];
  if (id === undefined) return null;
  return id.toUpperCase();
}

/**
 * Returns true iff the current location+document pair is an exact submission
 * result surface that the active platform adapter recognizes from strict URL
 * routing or an evidence-backed active result tab, plus one unique visible
 * first-party problem identity.
 *
 * Exact result-page evidence is the only same-document transition that the
 * content runtime accepts on its own without observing a Waiting/Judging/null
 * intermediate verdict. The same identity invariant used by
 * `detectProblemFromPage` is reused here so we cannot fabricate a result page
 * for an unrelated problem.
 *
 * The check is intentionally narrow:
 *
 *   - HTTPS, exact host, no credentials, default port.
 *   - The URL must match a platform result route with no hash and either
 *     zero or platform-documented query strings. LeetCode may restore its
 *     problem URL while keeping a selected submission-detail tab visible;
 *     that exact first-party tab is accepted as equivalent route evidence.
 *   - The sanitized DOM must contain exactly one valid first-party problem
 *     anchor — no zero, no multiple, no spoofed hosts.
 */
export function isExactSubmissionResultPage(
  location: DetectableLocation,
  pageDocument: Document,
  detectedProblem: DetectedProblem | null,
): boolean {
  let parsed: URL;
  try {
    parsed = new URL(location.href);
  } catch (error) {
    if (error instanceof TypeError) return false;
    throw error;
  }
  if (!isSafeHttpsOrigin(parsed)) return false;

  const resolved = detectProblemFromPage(location, pageDocument);
  if (resolved === null) return false;
  if (detectedProblem !== null
    && problemIdentityKeyFor(resolved) !== problemIdentityKeyFor(detectedProblem)) {
    return false;
  }
  if (resolved.platform === "leetcode"
    && isLeetCodeProblemRootRoute(parsed)
    && hasActiveLeetCodeSubmissionDetail(pageDocument)) {
    return true;
  }
  return isExactResultRouteForPlatform(resolved.platform, parsed);
}

function problemIdentityKeyFor(problem: DetectedProblem): string {
  return `${problem.platform}:${problem.problemExternalId}`;
}

function isExactResultRouteForPlatform(platform: Platform, parsed: URL): boolean {
  if (platform === "atcoder") {
    return /^\/contests\/[^/]+\/submissions\/\d+\/?$/u.test(parsed.pathname);
  }
  if (platform === "leetcode" && isLeetCodeProblemSubmissionResultRoute(parsed)) {
    return true;
  }
  const domestic = DOMESTIC_ROUTES.find((route) => route.platform === platform);
  return domestic !== undefined
    && parsed.hostname === domestic.host
    && domestic.matchUrl(parsed);
}

function isLeetCodeProblemSubmissionResultRoute(parsed: URL): boolean {
  if (parsed.hostname !== "leetcode.com" && parsed.hostname !== "leetcode.cn") {
    return false;
  }
  if (parsed.search !== "" || parsed.hash !== "") return false;
  return /^\/problems\/[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\/submissions\/\d+\/?$/iu
    .test(parsed.pathname);
}

function isLeetCodeProblemRootRoute(parsed: URL): boolean {
  if (parsed.hostname !== "leetcode.com" && parsed.hostname !== "leetcode.cn") {
    return false;
  }
  if (parsed.search !== "" || parsed.hash !== "") return false;
  return /^\/problems\/[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\/?$/iu
    .test(parsed.pathname);
}

function hasActiveLeetCodeSubmissionDetail(pageDocument: Document): boolean {
  return extractLeetCodeDetailVerdictText(pageDocument) !== "";
}

export function detectVerdictFromDocument(platform: Platform, pageDocument: Document): DetectedVerdict | null {
  const text = candidateTextForPlatform(platform, pageDocument);
  const verdict = normalizeTrustedVerdictText(text);
  return verdict === null ? null : { verdict };
}

function candidateTextForPlatform(platform: Platform, pageDocument: Document): string {
  const adapter = PLATFORM_ADAPTERS[platform];
  if (adapter.extractor !== undefined) {
    // Per-platform semantic extractor. Never falls back to the body; returns
    // an empty string when no evidence-backed candidate is found.
    return adapter.extractor(pageDocument);
  }
  return textFromSelectors(pageDocument, adapter.selectors);
}

function textFromSelectors(pageDocument: Document, selectors: readonly string[]): string {
  return selectors
    .flatMap((selector) => Array.from(pageDocument.querySelectorAll(selector)))
    .map((element) => element.textContent ?? "")
    .join("\n");
}

/**
 * Extract a LeetCode verdict from its two observed first-party locators.
 *
 * The current result UI renders the same verdict in two visible panes. Joining
 * both strings would produce "TLE\nTLE", which is not a verdict token. Collapse
 * identical values instead. If two visible panes disagree, return no evidence
 * rather than guessing which pane is authoritative.
 */
function extractLeetCodeVerdictText(pageDocument: Document): string {
  const selectors = [
    '[data-e2e-locator="submission-result"]',
    '[data-e2e-locator="console-result"]',
  ] as const;
  const locatorTexts = new Set<string>();
  for (const selector of selectors) {
    for (const element of Array.from(pageDocument.querySelectorAll(selector))) {
      if (isElementHidden(element)) continue;
      const text = (element.textContent ?? "").trim();
      if (text !== "") locatorTexts.add(text);
    }
  }
  if (locatorTexts.size > 0) return singleUniqueText(locatorTexts);

  // The restored problem URL has no verdict locator; its selected
  // submission-detail tab is the fallback evidence surface. That tab briefly
  // renders generic chrome such as "Submission details" before the verdict.
  // Unlike a first-party verdict locator, an unknown detail-tab label is not
  // enough to prove a final failure, so wait for a recognized final verdict.
  return extractLeetCodeDetailVerdictText(pageDocument);
}

function extractLeetCodeDetailVerdictText(pageDocument: Document): string {
  const detailTabs = pageDocument.querySelectorAll("#submission-detail_tab");
  if (detailTabs.length !== 1) return "";
  const detailTab = detailTabs.item(0);
  if (isElementHidden(detailTab)) return "";
  const selectedTab = detailTab.closest(".flexlayout__tab_button--selected");
  if (selectedTab === null || isElementHidden(selectedTab)) return "";
  if (detailTab.closest("#submission-detail_tabbar_outer") === null) return "";

  const detailTexts = new Set<string>();
  collectVisibleLeafTexts(detailTab, detailTexts);
  const detailText = singleUniqueText(detailTexts);
  if (detailText === "") return "";
  const normalized = normalizeTrustedVerdictText(detailText);
  return normalized === null || normalized === "Other Failure" ? "" : detailText;
}

function singleUniqueText(texts: ReadonlySet<string>): string {
  if (texts.size !== 1) return "";
  const first = texts.values().next();
  return first.done === true ? "" : first.value;
}

function collectVisibleLeafTexts(root: Element, output: Set<string>): void {
  for (const element of [root, ...Array.from(root.querySelectorAll("*"))]) {
    if (isElementHidden(element)) continue;
    const hasTextChild = Array.from(element.children).some(
      (child) => (child.textContent ?? "").trim() !== "",
    );
    if (hasTextChild) continue;
    const text = (element.textContent ?? "").trim();
    if (text !== "") output.add(text);
  }
}

/**
 * Luogu record verdict extractor.
 *
 * Locates every leaf whose trimmed textContent is exactly the label
 * 评测状态, then reads the enclosing row's full text. The leaf must be a
 * genuine text node (no children) so comment boilerplate or arbitrary
 * heading copy cannot satisfy the matcher. We collect ALL qualifying
 * rows so a multi-row verdict table is handled honestly:
 *
 *   • Zero rows                  → empty string → `null` verdict.
 *   • One row                    → use that row text.
 *   • Multiple rows, all identical → collapse and use the single row text.
 *   • Multiple rows, conflicting → empty string → `null` verdict
 *     (we never silently pick one of two divergent rows).
 */
function extractLuoguRecordRowText(pageDocument: Document): string {
  const candidates = Array.from(pageDocument.querySelectorAll("span, em, b, i, p, div, td, th, li"))
    .filter((el) => el.children.length === 0);
  const uniqueRowTexts = new Set<string>();
  for (const candidate of candidates) {
    const text = (candidate.textContent ?? "").trim();
    if (text !== "评测状态") continue;
    const row = candidate.closest("div, tr, li, section");
    if (row === null) continue;
    const rowText = (row.textContent ?? "").trim();
    if (rowText === "") continue;
    uniqueRowTexts.add(rowText);
  }
  // Collapse identical rows. Conflicting rows yield no candidate text.
  if (uniqueRowTexts.size !== 1) return "";
  const first = uniqueRowTexts.values().next();
  return first.done === true ? "" : first.value;
}
