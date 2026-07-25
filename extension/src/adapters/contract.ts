/**
 * Platform adapter contracts for V4 network-confirmed capture (Phase A).
 *
 * Goals:
 * - Separate platform metadata/interpretation contracts from correlation,
 *   persistence, and delivery.
 * - Preserve legacy DOM-evidence readiness semantics for the existing
 *   public-DOM production gate.
 * - Add an independent V4 network readiness status that always starts
 *   "uncharacterized" in Phase A. Network status is never inferred from
 *   DOM status.
 * - Constrain every V4 adapter evidence function to a single normalized
 *   shape. The runtime factory {@link defineNetworkAdapterPolicy} and
 *   {@link parseSafeEvidence} enforce the Safe Evidence contract on
 *   every raw observation; TypeScript unique symbols cannot prevent
 *   every unsafe assertion by themselves, so the parser is the
 *   authoritative defense.
 */

import { parseSafeEvidence } from "@/extension/src/evidence";
import type { SafeEvidence } from "@/extension/src/evidence";

/** Known platform identifiers. */
export type Platform =
  | "leetcode"
  | "nowcoder"
  | "luogu"
  | "codeforces"
  | "atcoder";

/** Legacy DOM-evidence readiness status. Independent of V4 network status. */
export type PlatformAdapterStatus = "production" | "experimental" | "disabled";

/**
 * Conservative V4 network readiness status. The Phase A infrastructure
 * can only mark an adapter as "production" through real OJ
 * characterization in a later phase; no adapter is V4-production today.
 *
 * The status ladder is deliberately restrictive: an adapter only
 * advances through `uncharacterized` -> `experimental` -> `production`,
 * or is marked `blocked` when characterization proves it infeasible.
 */
export type V4NetworkStatus =
  | "uncharacterized"
  | "experimental"
  | "blocked"
  | "production";

/**
 * Optional per-platform semantic DOM extractor used when CSS selectors
 * alone cannot disambiguate real verdict spans from unrelated colored
 * text or navigation chrome. Each extractor receives a document and
 * returns a strictly narrowed candidate string — never the bare body.
 * Returning an empty string is equivalent to "no evidence observed";
 * `detectVerdictFromDocument` then maps that to `null`.
 */
export type PlatformCandidateExtractor = (pageDocument: Document) => string;

export type DetectableLocation = Pick<Location, "href" | "hostname" | "pathname">;

export type DetectedProblem = {
  readonly platform: Platform;
  readonly problemExternalId: string;
  readonly problemTitle: string;
  readonly canonicalUrl: string;
};

export type DetectedVerdict = {
  readonly verdict: string;
};

/**
 * AdapterEvidenceFunction is the single callable shape every V4
 * network policy function (request / submission / verdict) must
 * satisfy at runtime. It receives an untrusted raw observation and
 * returns strict {@link SafeEvidence} or `null`. Implementations are
 * produced exclusively by {@link defineNetworkAdapterPolicy}; arbitrary
 * JS functions are not assignable to this type at compile time because
 * the policy type carries a module-private brand key.
 */
export type AdapterEvidenceFunction = (input: unknown) => SafeEvidence | null;

/**
 * Module-private unique-symbol brand attached to every value that
 * satisfies {@link V4NetworkAdapterPolicy}. Because this symbol is not
 * exported, ordinary object literals created outside this module
 * cannot include a property keyed by it and therefore cannot satisfy
 * the policy type without an explicit unsafe assertion (which no
 * in-tree caller is granted).
 *
 * Type assertions can bypass compile-time brands, so the
 * {@link defineNetworkAdapterPolicy} factory plus {@link parseSafeEvidence}
 * remain the runtime defenses that prevent hostile data from being persisted.
 */
const POLICY_BRAND: unique symbol = Symbol("V4NetworkAdapterPolicy.v4");

/**
 * V4 network policy for a single platform. The module-private symbol
 * brand ensures only {@link defineNetworkAdapterPolicy} can produce a
 * value that satisfies this type; no other code path stamps the brand.
 */
export interface V4NetworkAdapterPolicy {
  readonly [POLICY_BRAND]: true;
  /**
   * Normalize a raw request observation into SafeEvidence
   * (E1 / ambiguous / rejected) or null when the observation has no
   * adapter-shaped meaning.
   */
  readonly requestEvidence: AdapterEvidenceFunction;
  /**
   * Normalize a raw submission observation into SafeEvidence (E2) or
   * null when the observation cannot be linked to a confirmed
   * submission.
   */
  readonly submissionEvidence: AdapterEvidenceFunction;
  /**
   * Normalize a raw verdict observation into SafeEvidence (E3) or
   * null when the observation does not produce a final verdict.
   */
  readonly verdictEvidence: AdapterEvidenceFunction;
}

/**
 * Candidate shape accepted by {@link defineNetworkAdapterPolicy}.
 * Each function returns an unknown raw observation; the factory must
 * run {@link parseSafeEvidence} against every non-null result to
 * enforce the Safe Evidence contract at runtime.
 *
 * The factory tolerates throwing candidates and nullish returns; it
 * never propagates a thrown error and never returns the raw candidate
 * result.
 */
export interface V4NetworkAdapterPolicyCandidate {
  readonly requestEvidence: (input: unknown) => unknown;
  readonly submissionEvidence: (input: unknown) => unknown;
  readonly verdictEvidence: (input: unknown) => unknown;
}

/**
 * Wraps raw candidate functions into a frozen, branded
 * {@link V4NetworkAdapterPolicy}. Each wrapped function:
 *
 *   1. Calls the candidate inside a try/catch; thrown errors become
 *      `null` (the function never re-throws).
 *   2. Returns `null` for any null or undefined raw result, so
 *      candidates that "have nothing yet" can simply return `null`.
 *   3. Runs {@link parseSafeEvidence} on every non-null raw result and
 *      returns the parser's normalized `SafeEvidence` value, or `null`
 *      on parser rejection (forbidden keys, wrong tier/kind shape,
 *      unknown fields, etc.).
 *
 * This factory is the only place that may stamp the brand onto a
 * {@link V4NetworkAdapterPolicy} value, and the only runtime path
 * that converts a raw candidate return into a SafeEvidence value.
 * The returned policy object is frozen so call sites cannot tamper
 * with the wrapped functions or the brand.
 */
export function defineNetworkAdapterPolicy(
  candidate: V4NetworkAdapterPolicyCandidate,
): V4NetworkAdapterPolicy {
  function wrap(candidateFn: (input: unknown) => unknown): AdapterEvidenceFunction {
    return (input: unknown) => {
      let raw: unknown;
      try {
        raw = candidateFn(input);
      } catch {
        return null;
      }
      if (raw === null || raw === undefined) return null;
      const parsed = parseSafeEvidence(raw);
      return parsed.ok ? parsed.value : null;
    };
  }

  const policy = {
    [POLICY_BRAND]: true,
    requestEvidence: wrap(candidate.requestEvidence),
    submissionEvidence: wrap(candidate.submissionEvidence),
    verdictEvidence: wrap(candidate.verdictEvidence),
  } as const;

  return Object.freeze(policy);
}

/**
 * One platform adapter record. Every required platform declares its
 * metadata, DOM-evidence readiness, exact host ownership, and V4
 * network readiness. Host ownership is the exact list of hostname
 * strings; no schemes, wildcards, or paths.
 *
 * The optional `networkPolicy` field is absent whenever
 * `v4NetworkStatus` is "uncharacterized"; production adapters will
 * declare one when characterization data justifies it. Even when a
 * `networkPolicy` is attached, the deterministic dependency audit in
 * `tests/unit/extensionAdapterContract.test.ts` forbids storage,
 * transport, or state-machine imports inside any adapter module.
 */
export interface PlatformAdapterRecord {
  /** Platform identifier; matches the Record key in PLATFORM_ADAPTERS. */
  readonly platform: Platform;
  /** Human-readable platform label. */
  readonly label: string;
  /** Legacy DOM-evidence readiness status. */
  readonly status: PlatformAdapterStatus;
  /** V4 network readiness status. Independent from DOM status. */
  readonly v4NetworkStatus: V4NetworkStatus;
  /** Adapter contract version (bounded identifier for compatibility). */
  readonly version: string;
  /** Exact hostname strings this adapter owns. No schemes/wildcards/paths. */
  readonly hostOwnership: readonly string[];
  /**
   * Narrow CSS selectors used as fallback evidence. Selectors are
   * evaluated against the verified-public-DOM contract and explicitly
   * excluded from broad fallbacks such as `body`. Platforms whose
   * verdict DOM is best reached via a semantic extractor (e.g. Luogu
   * record rows) may declare an empty `selectors` array together with
   * `extractor`.
   */
  readonly selectors: readonly string[];
  /** Optional per-platform semantic extractor. */
  readonly extractor?: PlatformCandidateExtractor;
  /**
   * Optional V4 network policy. Absent when v4NetworkStatus is
   * "uncharacterized"; the deterministic import scan forbids
   * attaching storage, transport, or state-machine helpers even
   * when this field is present.
   */
  readonly networkPolicy?: V4NetworkAdapterPolicy;
}
