import { z } from "zod";

export const NETWORK_TRANSCRIPT_TIERS = ["E0", "E1", "E2", "E3"] as const;
export const NETWORK_TRANSCRIPT_EVIDENCE_TIERS = [
  "public-content-accessible",
  "verified-public-dom",
  "characterization-derived",
  "authenticated-characterization",
] as const;

const forbiddenKeys = new Set([
  "body", "rawBody", "raw_body", "responseBody", "response_body", "responseText", "response_text",
  "headers", "code", "source", "sourceCode", "source_code", "requestHeaders", "request_headers",
  "responseHeaders", "response_headers", "cookie", "cookies", "authorization", "auth", "csrf",
  "csrfToken", "csrf_token", "token", "username", "user", "account", "accountId", "account_id",
  "email", "userId", "user_id", "fullStatement", "full_statement", "problemStatement",
  "problem_statement", "requestBody", "request_body",
]);

const identifier = z.string().min(1).max(128)
  .refine((value) => value.trim().length > 0, "must not be empty or whitespace")
  .refine((value) => !/[\x00-\x1f\x7f]/.test(value), "must not contain control characters");
const scalar = z.string().min(1).max(256).refine((value) => value.trim().length > 0);
const isoDateTime = z.string().refine((value) => {
  if (!/^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])T([01]\d|2[0-3]):[0-5]\d:[0-5]\d(\.\d{3})?Z$/.test(value)) return false;
  const time = Date.parse(value);
  const canonical = value.includes(".") ? value : value.replace("Z", ".000Z");
  return Number.isFinite(time) && new Date(time).toISOString() === canonical;
}, "must be a valid ISO datetime (YYYY-MM-DDTHH:mm:ss.sssZ)");
const normalizedPath = z.string().min(1).max(512)
  .refine((value) => value.startsWith("/") && /^[a-zA-Z0-9/_-]+$/.test(value), "must be a normalized path starting with /");
const platform = z.enum(["leetcode", "nowcoder", "luogu", "codeforces", "atcoder"]);
const tier = z.enum(NETWORK_TRANSCRIPT_TIERS);
const base = z.object({
  schemaVersion: z.literal(1), evidenceId: identifier, platform, tier, kind: z.string(), receivedAt: isoDateTime,
  tabId: z.number().int().nonnegative(), frameId: z.number().int().nonnegative(), documentId: identifier,
  relativeTimingOrder: z.number().int().nonnegative().optional(), signalObservedFromRealUserAction: z.boolean().optional(),
  expectedTier: tier.optional(),
});
const e0 = base.extend({
  tier: z.literal("E0"), kind: z.literal("navigation_witness"),
  pageClass: z.enum(["contest_list", "contest_problem"]),
}).strict();
const e1 = base.extend({
  tier: z.literal("E1"), kind: z.literal("network_request_observed"), requestId: identifier,
  method: z.enum(["GET", "POST", "PUT", "DELETE", "PATCH", "HEAD", "OPTIONS"]), normalizedPath,
  resourceType: z.enum(["main_frame", "sub_frame", "xmlhttprequest", "other"]),
  statusCode: z.number().int().min(100).max(599).optional(), normalizedRedirectPath: normalizedPath.optional(),
  responseTopLevelFieldNames: z.array(scalar).optional(),
}).strict();
const e2 = base.extend({
  tier: z.literal("E2"), kind: z.literal("submission_confirmed"), requestEvidenceId: identifier,
  externalSubmissionId: identifier, problemExternalId: identifier, submissionIdFieldName: scalar,
  submissionIdScalarType: z.enum(["string", "number", "bigint"]), verdictStatusFieldName: scalar.optional(),
  verdictStatusScalarType: z.enum(["string", "number"]).optional(),
}).strict();
const e3 = base.extend({
  tier: z.literal("E3"), kind: z.literal("final_verdict_confirmed"), externalSubmissionId: identifier,
  problemExternalId: identifier, verdict: z.string().min(1),
}).strict();
const evidenceSchema = z.discriminatedUnion("kind", [e0, e1, e2, e3]);
const signal = z.object({ kind: z.string(), platform, tier }).strict();
const metaSchema = z.object({
  fixtureName: identifier, sourceUrl: z.string().url(), captureDate: z.string().date(),
  captureMethod: z.enum(["extension characterization export", "user-authorized browser observation"]), authenticated: z.boolean(), sanitized: z.literal(true),
  evidenceTier: z.enum(NETWORK_TRANSCRIPT_EVIDENCE_TIERS), productionEligible: z.boolean(),
  signals: z.array(signal).min(1),
}).strict().superRefine((value, context) => {
  if (value.evidenceTier === "authenticated-characterization" && !value.authenticated) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["authenticated"], message: "authenticated-characterization REQUIRES authenticated === true" });
  }
  let source: URL | undefined;
  try { source = new URL(value.sourceUrl); } catch { source = undefined; }
  if (source !== undefined && (source.protocol !== "https:" || source.username !== "" || source.password !== "" || source.search !== "" || source.hash !== "" || source.pathname !== "/")) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["sourceUrl"], message: "sourceUrl must be an https origin without credentials, query, or fragment" });
  }
  if (value.authenticated && value.productionEligible) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["productionEligible"], message: "authenticated production certification is not permitted: authenticated characterization fixtures can never satisfy a production gate" });
  }
  if (value.productionEligible && value.evidenceTier !== "public-content-accessible" && value.evidenceTier !== "verified-public-dom") {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["productionEligible"], message: "characterization-derived evidence cannot satisfy a production gate" });
  }
});
const documentSchema = z.object({ meta: metaSchema, evidence: z.array(evidenceSchema).min(1) }).strict();

export type NetworkTranscriptEvidence = z.infer<typeof evidenceSchema>;
export type E0NavigationWitness = z.infer<typeof e0>;
export type E1NetworkRequest = z.infer<typeof e1>;
export type E2NetworkSubmissionConfirmed = z.infer<typeof e2>;
export type E3NetworkFinalVerdict = z.infer<typeof e3>;
export type NetworkTranscriptMeta = z.infer<typeof metaSchema>;
export type NetworkTranscriptDocument = z.infer<typeof documentSchema>;
export type ParseResult<T> = { readonly ok: true; readonly value: T } | { readonly ok: false; readonly reason: string };

function findForbiddenKey(value: unknown, visited = new WeakSet<object>(), path = ""): { readonly key: string; readonly path: string } | undefined {
  if (typeof value !== "object" || value === null || visited.has(value)) return undefined;
  visited.add(value);
  for (const [key, nested] of Object.entries(value)) {
    const nextPath = path === "" ? key : `${path}.${key}`;
    if (forbiddenKeys.has(key)) return { key, path: nextPath };
    const found = findForbiddenKey(nested, visited, nextPath);
    if (found !== undefined) return found;
  }
  return undefined;
}

function parse<T>(value: unknown, schema: z.ZodType<T>, subject: string): ParseResult<T> {
  if (typeof value !== "object" || value === null) return { ok: false, reason: `${subject} must be a non-null object` };
  try {
    const forbidden = findForbiddenKey(value);
    if (forbidden !== undefined) return { ok: false, reason: `Forbidden key '${forbidden.key}' at '${forbidden.path}' must not appear in evidence` };
    const result = schema.safeParse(value);
    return result.success ? { ok: true, value: result.data } : { ok: false, reason: result.error.message };
  } catch {
    return { ok: false, reason: `${subject} inspection failed` };
  }
}

export function parseNetworkTranscriptEvidence(value: unknown): ParseResult<NetworkTranscriptEvidence> {
  return parse(value, evidenceSchema, "evidence");
}

export function parseNetworkTranscriptMeta(value: unknown): ParseResult<NetworkTranscriptMeta> {
  return parse(value, metaSchema, "metadata");
}

export function parseNetworkTranscriptDocument(value: unknown): ParseResult<NetworkTranscriptDocument> {
  return parse(value, documentSchema, "transcript");
}
