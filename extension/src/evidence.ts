/**
 * Safe Evidence schemas for V4 network-confirmed capture.
 *
 * Design goals:
 * - Forbidden data (bodies, credentials, headers, user identity) is
 *   structurally impossible to persist or pass to the state machine.
 * - Raw network observations stay callback-local and are never represented by
 *   an exported type from this module.
 * - Every exported evidence object requires browser-document identity
 *   (tabId / frameId / documentId).
 * - Background-assigned receivedAt is the authoritative timestamp;
 *   page timestamps are never used as authority.
 * - API-local ordering via apiTimeStamp (not a page timestamp).
 */

import { z } from "zod";
import { FINAL_CAPTURE_VERDICTS } from "@/lib/capture/verdictTaxonomy";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** All valid evidence tier names. */
export const SAFE_EVIDENCE_TIERS = ["E0", "E1", "E2", "E3"] as const;

/** Keys that must never appear in any Safe Evidence object. */
const FORBIDDEN_KEYS = [
  "body",
  "rawBody",
  "responseBody",
  "code",
  "source",
  "requestHeaders",
  "responseHeaders",
  "cookie",
  "authorization",
  "csrf",
  "token",
  "username",
  "account",
] as const;

/** HTTP methods allowed in E1 evidence. */
const VALID_METHODS = ["GET", "POST", "PUT", "DELETE", "PATCH", "HEAD", "OPTIONS"] as const;

/** Chrome webRequest lifecycle phases. */
const LIFECYCLE_PHASES = [
  "before_request",
  "before_redirect",
  "response_started",
  "completed",
  "error_occurred",
] as const;

/** Resource types from Chrome webRequest API. */
const RESOURCE_TYPES = [
  "main_frame",
  "sub_frame",
  "xmlhttprequest",
  "other",
] as const;

/** E2 submission phase values. */
const SUBMISSION_PHASES = ["queued", "judging", "running"] as const;

/** Safe ambiguity diagnostic reasons. */
const SAFE_AMBIGUITY_REASONS = [
  "multiple_e1_candidates",
  "e1_window_expired",
  "bridge_message_unmatched",
] as const;

/** Safe request-rejection reasons. */
const SAFE_REJECTION_REASONS = [
  "csrf_invalid",
  "csrf_expired",
  "auth_required",
  "auth_expired",
  "rate_limited",
  "business_rejection",
  "network_error",
  "timeout",
  "server_error",
  "malformed_response",
] as const;

// ---------------------------------------------------------------------------
// String bound helpers
// ---------------------------------------------------------------------------

/** Identifier string: max 128 chars, non-empty, no whitespace-only. */
const identifierString = z.string().min(1).max(128).refine((s) => s.trim().length > 0, {
  message: "must not be empty or whitespace",
});

/** Scalar string: max 256 chars, non-empty, no whitespace-only. */
const scalarString = z.string().min(1).max(256).refine((s) => s.trim().length > 0, {
  message: "must not be empty or whitespace",
});

const ISO_DATETIME_PATTERN = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])T([01]\d|2[0-3]):[0-5]\d:[0-5]\d(\.\d{3})?Z$/;

/** ISO datetime string with a real Gregorian calendar date. */
const isoDateTimeString = z.string().refine((value) => {
  if (!ISO_DATETIME_PATTERN.test(value)) return false;
  const time = Date.parse(value);
  if (!Number.isFinite(time)) return false;
  const canonical = value.includes(".") ? value : value.replace("Z", ".000Z");
  return new Date(time).toISOString() === canonical;
}, "must be a valid ISO datetime (YYYY-MM-DDTHH:mm:ss.sssZ)");

/**
 * Normalized endpoint key: alphanumeric, hyphen, underscore, and slash only.
 * Excluding colons makes URL schemes structurally invalid, including schemes
 * such as javascript: and data: that do not contain `://`.
 */
const normalizedEndpointKey = z.string()
  .min(1)
  .max(256)
  .refine(
    (s) => /^[a-zA-Z0-9/_-]+$/.test(s),
    "must be a normalized endpoint key, not a URL",
  );

// ---------------------------------------------------------------------------
// Zod schemas
// ---------------------------------------------------------------------------

/**
 * EvidenceBase is the foundation of every safe evidence object.
 * It provides browser-document identity and API-local ordering metadata.
 * .strict() rejects any key not explicitly defined.
 */
const evidenceBaseSchema = z.object({
  schemaVersion: z.literal(1),
  evidenceId: identifierString,
  platform: z.enum(["leetcode", "nowcoder", "luogu", "codeforces", "atcoder"]),
  tier: z.enum(SAFE_EVIDENCE_TIERS),
  kind: z.string(),
  /** Background-received timestamp (authoritative, set by extension background). */
  receivedAt: isoDateTimeString,
  /** Tab identity from Chrome APIs. */
  tabId: z.number().int().nonnegative(),
  /** Frame identity from Chrome APIs. */
  frameId: z.number().int().nonnegative(),
  /** Document identity from Chrome APIs (changes on navigation). */
  documentId: identifierString,
  /** Version of the adapter that produced this evidence. */
  adapterVersion: scalarString,
});

/** webRequest evidence always retains Chrome's internally consistent timestamp. */
const webRequestEvidenceBaseSchema = evidenceBaseSchema.extend({
  apiTimeStamp: z.number().finite().nonnegative(),
});

/**
 * E0 UI hint evidence.
 * Records a bounded UI action after its producer has validated the source.
 * This schema validates shape only; it does not authenticate the producer.
 * Tier semantics: may not increase waiting state.
 */
const e0UiHintSchema = evidenceBaseSchema.extend({
  tier: z.literal("E0"),
  kind: z.literal("ui_hint"),
  problemExternalId: identifierString,
  /** Optional: document ID that was active when the hint was recorded. */
  sourceDocumentId: identifierString.optional(),
  /**
   * Optional: moment the UI event was observed by the content script.
   * Non-authoritative: page-set wallclock, not background monotonic.
   */
  observedAt: isoDateTimeString.optional(),
}).strict();

/**
 * E1 request observed evidence.
 * Records that Chrome webRequest observed an adapter-shaped request.
 * Tier semantics: may not increase waiting state.
 */
const e1RequestObservedSchema = webRequestEvidenceBaseSchema.extend({
  tier: z.literal("E1"),
  kind: z.literal("request_observed"),
  /** Chrome webRequest requestId (stable within session). */
  requestId: identifierString,
  method: z.enum(VALID_METHODS),
  /**
   * Adapter-normalized endpoint key, NOT a raw URL.
   * Correlator and state machine use this key, not the original URL.
   */
  endpointKey: normalizedEndpointKey,
  resourceType: z.enum(RESOURCE_TYPES),
  lifecycle: z.enum(LIFECYCLE_PHASES),
  /** HTTP status code, if available (100–599). */
  statusCode: z.number().int().min(100).max(599).optional(),
  /**
   * Adapter-normalized redirect target; only present when redirected.
   * Must be a normalized key, never a raw URL.
   */
  redirectEndpointKey: normalizedEndpointKey.optional(),
}).strict();

/**
 * E2 submission confirmed evidence.
 * Records that an E1 was linked to server acceptance and a stable submission ID.
 * Tier semantics: may increase waiting state.
 */
const e2SubmissionConfirmedSchema = evidenceBaseSchema.extend({
  tier: z.literal("E2"),
  kind: z.literal("submission_confirmed"),
  /** References the evidenceId of the correlated E1. */
  requestEvidenceId: identifierString,
  /** Stable server-provided submission identity. */
  externalSubmissionId: identifierString,
  /** Required problem identity for this submission. */
  problemExternalId: identifierString,
  /** Optional submission phase. */
  phase: z.enum(SUBMISSION_PHASES).optional(),
}).strict();

/**
 * E3 final verdict confirmed evidence.
 * Records a final verdict that matches the confirmed submission.
 * Tier semantics: finalizes the attempt bundle.
 */
const e3FinalVerdictConfirmedSchema = evidenceBaseSchema.extend({
  tier: z.literal("E3"),
  kind: z.literal("final_verdict_confirmed"),
  /** Stable server-provided submission identity. */
  externalSubmissionId: identifierString,
  /** Problem identity for this submission. */
  problemExternalId: identifierString,
  /** Normalized verdict from the product taxonomy. */
  verdict: z.enum(FINAL_CAPTURE_VERDICTS),
}).strict();

/**
 * Ambiguous correlation evidence.
 * Records that more than one legal E1 candidate was found.
 * No state transition occurs when ambiguity is recorded.
 * Tier: E1 diagnostic.
 */
const ambiguousCorrelationSchema = webRequestEvidenceBaseSchema.extend({
  tier: z.literal("E1"),
  kind: z.literal("ambiguous_correlation"),
  requestId: identifierString,
  method: z.enum(VALID_METHODS),
  endpointKey: normalizedEndpointKey,
  resourceType: z.enum(RESOURCE_TYPES),
  lifecycle: z.enum(LIFECYCLE_PHASES),
  /** Number of candidates found; must be at least 2. */
  candidateCount: z.number().int().min(2),
  reason: z.enum(SAFE_AMBIGUITY_REASONS),
}).strict();

/**
 * Request rejection evidence.
 * Records that a request was rejected by the server or network layer.
 * This diagnostic does not define a state transition.
 * Tier: E1 diagnostic.
 */
const requestRejectedSchema = webRequestEvidenceBaseSchema.extend({
  tier: z.literal("E1"),
  kind: z.literal("request_rejected"),
  requestId: identifierString,
  method: z.enum(VALID_METHODS),
  endpointKey: normalizedEndpointKey,
  resourceType: z.enum(RESOURCE_TYPES),
  lifecycle: z.enum(LIFECYCLE_PHASES),
  rejectionReason: z.enum(SAFE_REJECTION_REASONS),
  statusCode: z.number().int().min(100).max(599).optional(),
}).strict();

// ---------------------------------------------------------------------------
// Union schema
// ---------------------------------------------------------------------------

/**
 * Complete safe evidence discriminated union.
 * Uses `kind` as discriminator because every kind value is unique.
 */
const safeEvidenceSchema = z.discriminatedUnion("kind", [
  e0UiHintSchema,
  e1RequestObservedSchema,
  e2SubmissionConfirmedSchema,
  e3FinalVerdictConfirmedSchema,
  ambiguousCorrelationSchema,
  requestRejectedSchema,
]);

// ---------------------------------------------------------------------------
// Forbidden key guard (cycle-safe recursive)
// ---------------------------------------------------------------------------

/**
 * Recursively checks whether an object or array contains any forbidden key.
 * Uses WeakSet to track visited object references and avoid infinite loops.
 * Returns the first forbidden key found (with path), or null if none.
 */
function findForbiddenKey(
  node: unknown,
  visited = new WeakSet<object>(),
  currentPath = "",
): { key: (typeof FORBIDDEN_KEYS)[number]; path: string } | null {
  if (typeof node !== "object" || node === null) return null;

  // Prevent cycles
  if (visited.has(node)) return null;
  visited.add(node);

  // Check direct keys
  for (const key of FORBIDDEN_KEYS) {
    if (key in node) {
      return { key, path: currentPath ? `${currentPath}.${key}` : key };
    }
  }

  // Recurse into arrays and objects
  if (Array.isArray(node)) {
    for (let i = 0; i < node.length; i++) {
      const found = findForbiddenKey(node[i], visited, currentPath ? `${currentPath}[${i}]` : `[${i}]`);
      if (found) return found;
    }
  } else {
    for (const [k, v] of Object.entries(node)) {
      if (typeof v === "object" && v !== null) {
        const found = findForbiddenKey(v, visited, currentPath ? `${currentPath}.${k}` : k);
        if (found) return found;
      }
    }
  }

  return null;
}

// ---------------------------------------------------------------------------
// Parse result type
// ---------------------------------------------------------------------------

export type ParseResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly reason: string };

// ---------------------------------------------------------------------------
// Parse function
// ---------------------------------------------------------------------------

/**
 * Parse an unknown value as SafeEvidence.
 * Pre-checks for forbidden keys, then performs a strict Zod parse.
 */
export function parseSafeEvidence(value: unknown): ParseResult<SafeEvidence> {
  if (typeof value !== "object" || value === null) {
    return { ok: false, reason: "Evidence must be a non-null object" };
  }
  try {
    const forbidden = findForbiddenKey(value);
    if (forbidden !== null) {
      return {
        ok: false,
        reason: `Forbidden key '${forbidden.key}' at '${forbidden.path}' must not appear in evidence`,
      };
    }
    const parsed = safeEvidenceSchema.safeParse(value);
    if (parsed.success) {
      return { ok: true, value: parsed.data };
    }
    return { ok: false, reason: parsed.error.message };
  } catch {
    return { ok: false, reason: "Evidence inspection failed" };
  }
}

// ---------------------------------------------------------------------------
// Exported types (inferred from schemas)
// ---------------------------------------------------------------------------

/** Safe evidence discriminated union. */
export type SafeEvidence = z.infer<typeof safeEvidenceSchema>;

/** E0 UI hint evidence. */
export type E0UiHint = z.infer<typeof e0UiHintSchema>;

/** E1 request observed evidence. */
export type E1RequestObserved = z.infer<typeof e1RequestObservedSchema>;

/** E2 submission confirmed evidence. */
export type E2SubmissionConfirmed = z.infer<typeof e2SubmissionConfirmedSchema>;

/** E3 final verdict confirmed evidence. */
export type E3FinalVerdictConfirmed = z.infer<typeof e3FinalVerdictConfirmedSchema>;

/** Ambiguous correlation diagnostic evidence. */
export type AmbiguousCorrelation = z.infer<typeof ambiguousCorrelationSchema>;

/** Request rejection evidence. */
export type RejectionEvidence = z.infer<typeof requestRejectedSchema>;
