/**
 * V0 optional AI reflection experiment (Todo 21).
 *
 * The service is gated on explicit environment configuration and is
 * disabled by default. When enabled, it posts a strict seven-scalar DTO
 * to the configured OpenAI-compatible chat-completions endpoint and
 * parses the response as `{ question: string(1..300) }`.
 *
 * Hard rules locked by ADR `0002-v0-optional-ai-reflection.md`:
 *
 *   - The service never persists request, response, or key.
 *   - The service never logs the payload or key.
 *   - The service never throws past its boundary: every failure mode
 *     returns the deterministic result-keyed fallback question so the
 *     offline learning loop is never blocked by the AI experiment.
 *   - The fetch implementation is the only injection seam so tests
 *     can mock the wire without touching `globalThis.fetch`.
 *   - The environment is read through an optional `deps.env` seam so
 *     tests can drive every code path deterministically. Production
 *     callers pass nothing and the service reads `process.env`.
 *
 * The seven scalar fields are: `nodeStableId`, `nodeTitle`,
 * `practiceTaskStableId`, `practiceTaskTitle`, `planReasonCode`,
 * `effortBoundaryMinutes`, and `result`. The user message payload is
 * built from this allowlist and nothing else.
 */

const DEFAULT_TIMEOUT_MS = 8000;
const MAX_QUESTION_LENGTH = 300;
const REQUEST_TEMPERATURE = 0.2;
const REQUEST_MAX_TOKENS = 256;

export type ReflectionResultKind = "passed" | "failed" | "partial" | "stuck";

export type ReflectionInput = {
  readonly nodeStableId: string;
  readonly nodeTitle: string;
  readonly practiceTaskStableId: string;
  readonly practiceTaskTitle: string;
  readonly planReasonCode: string;
  readonly effortBoundaryMinutes: number;
  readonly result: ReflectionResultKind;
};

export type ReflectionSource = "ai" | "fallback";

export type ReflectionResult = {
  readonly source: ReflectionSource;
  readonly question: string;
};

export type FetchInit = {
  readonly method?: string;
  readonly headers?: Readonly<Record<string, string>>;
  readonly body?: string;
  readonly signal?: AbortSignal;
};

export type FetchResponseLike = {
  readonly ok: boolean;
  readonly status: number;
  text(): Promise<string>;
};

export type FetchLike = (
  input: string,
  init?: FetchInit,
) => Promise<FetchResponseLike>;

export type EnvSource = Readonly<Record<string, string | undefined>>;

export type RequestReflectionDeps = {
  readonly fetch?: FetchLike;
  readonly env?: EnvSource;
};

const FALLBACK_QUESTIONS: Readonly<Record<ReflectionResultKind, string>> = {
  passed:
    "What part of your approach would you reuse on a harder variant?",
  partial:
    "What evidence shows progress, and what remains unresolved?",
  failed:
    "What is the smallest failing assumption you can test next?",
  stuck:
    "What is the smallest failing assumption you can test next?",
};

const SYSTEM_PROMPT: string = [
  "You produce exactly one concise self-reflection question for a",
  "learner who just finished a single practice task. Respond with",
  "strict JSON: {\"question\": \"<string between 1 and 300 characters>\"}.",
  "Do not include URLs, code fences, or any markdown. Do not assert",
  "mastery, cite evidence, or instruct the learner to mutate saved",
  "state. Use only the seven context fields supplied by the user; do",
  "not invent platform identity, attempt ids, or history.",
].join(" ");

const REQUEST_ALLOWLIST_KEYS: ReadonlySet<string> = new Set([
  "nodeStableId",
  "nodeTitle",
  "practiceTaskStableId",
  "practiceTaskTitle",
  "planReasonCode",
  "effortBoundaryMinutes",
  "result",
]);

const FORBIDDEN_PATTERNS: readonly RegExp[] = [
  // URL schemes: http(s)://, file://, ws://, custom schemes, etc.
  /[a-z][a-z0-9+\-.]*:\/\//i,
  // Code fences.
  /```/,
  // Mastery claims in any tense/voice.
  /\byou('?|ha|ve|\s)+master(ed|y)?\b/i,
  /\byou('?|ha|ve|\s)+(now\s+)?achieved\s+mastery\b/i,
  // Evidence claims referencing the learner or stating proof.
  /\byour\s+evidence\b/i,
  /\bthe\s+evidence\b/i,
  /\bevidence\s+(proves|shows|confirms|demonstrates)\b/i,
  // State-mutation instructions on persisted data.
  /\b(delete|remove|erase|clear|update|mark\s+as|set\s+(ability|level|state|plan))\b/i,
];

type ResolvedConfig = {
  readonly enabled: boolean;
  readonly url: string;
  readonly model: string;
  readonly apiKey: string;
  readonly timeoutMs: number;
};

function readEnv(env: EnvSource): ResolvedConfig {
  const enabled = env["V0_AI_REFLECTION_ENABLED"] === "1";
  const url = (env["V0_AI_REFLECTION_URL"] ?? "").trim();
  const model = (env["V0_AI_REFLECTION_MODEL"] ?? "").trim();
  const apiKey = (env["V0_AI_REFLECTION_API_KEY"] ?? "").trim();
  const rawTimeout = env["V0_AI_REFLECTION_TIMEOUT_MS"];
  const parsed: number = rawTimeout === undefined || rawTimeout === ""
    ? Number.NaN
    : Number.parseInt(rawTimeout, 10);
  const timeoutMs: number = Number.isFinite(parsed) && parsed > 0
    ? parsed
    : DEFAULT_TIMEOUT_MS;
  return { enabled, url, model, apiKey, timeoutMs };
}

/**
 * Reject loopback, link-local, and RFC1918 private-network hostnames so
 * the AI experiment cannot be redirected at internal infrastructure
 * (LLM agents on localhost, cloud metadata services, or LAN devices).
 * Public DNS hostnames and unreserved IPv4/IPv6 addresses pass.
 */
function isPrivateOrLocalHostname(rawHostname: string): boolean {
  let host = rawHostname.toLowerCase();
  if (host.startsWith("[") && host.endsWith("]")) {
    host = host.slice(1, -1);
  }
  if (host.length === 0) return true;
  if (host === "localhost" || host === "::1") return true;
  if (host === "ip6-localhost" || host === "ip6-loopback") return true;
  if (host.startsWith("fe80:") || host.startsWith("fe80::")) return true;
  const parts = host.split(".");
  if (parts.length === 4) {
    const nums = parts.map((p) => Number.parseInt(p, 10));
    if (nums.every((n) => Number.isInteger(n) && n >= 0 && n <= 255)) {
      const [a, b] = nums;
      if (a === undefined || b === undefined) return false;
      // 127.0.0.0/8 loopback
      if (a === 127) return true;
      // 169.254.0.0/16 link-local (covers cloud metadata 169.254.169.254)
      if (a === 169 && b === 254) return true;
      // 10.0.0.0/8 private
      if (a === 10) return true;
      // 172.16.0.0/12 private
      if (a === 172 && b >= 16 && b <= 31) return true;
      // 192.168.0.0/16 private
      if (a === 192 && b === 168) return true;
    }
  }
  return false;
}

function isConfigValid(config: ResolvedConfig): boolean {
  if (!config.enabled) return false;
  if (config.url.length === 0) return false;
  if (config.model.length === 0) return false;
  if (config.apiKey.length === 0) return false;
  let parsed: URL;
  try {
    parsed = new URL(config.url);
  } catch {
    return false;
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return false;
  }
  if (isPrivateOrLocalHostname(parsed.hostname)) {
    return false;
  }
  return true;
}

function buildRequestBody(model: string, input: ReflectionInput): string {
  const userPayload: Record<string, string | number> = {};
  for (const key of REQUEST_ALLOWLIST_KEYS) {
    const value: unknown = Reflect.get(input, key);
    if (typeof value === "string") {
      userPayload[key] = value;
    } else if (typeof value === "number" && Number.isFinite(value)) {
      userPayload[key] = value;
    }
  }
  const body = {
    model,
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: JSON.stringify(userPayload) },
    ],
    temperature: REQUEST_TEMPERATURE,
    max_tokens: REQUEST_MAX_TOKENS,
    stream: false,
  };
  return JSON.stringify(body);
}

function fallbackFor(result: ReflectionResultKind): ReflectionResult {
  return { source: "fallback", question: FALLBACK_QUESTIONS[result] };
}

function isForbidden(question: string): boolean {
  for (const pattern of FORBIDDEN_PATTERNS) {
    if (pattern.test(question)) return true;
  }
  return false;
}

function validateQuestion(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  if (trimmed.length < 1) return null;
  if (trimmed.length > MAX_QUESTION_LENGTH) return null;
  if (isForbidden(trimmed)) return null;
  return trimmed;
}

type WireResponse = {
  readonly choices?: ReadonlyArray<{
    readonly message?: { readonly content?: unknown };
  }>;
};

function parseResponseText(text: string): string | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return null;
  }
  if (parsed === null || typeof parsed !== "object") return null;
  const wire: WireResponse = parsed as WireResponse;
  if (!Array.isArray(wire.choices) || wire.choices.length === 0) {
    return null;
  }
  const first = wire.choices[0];
  if (first === undefined) return null;
  const content: unknown = first.message?.content;
  if (typeof content !== "string") return null;

  let inner: unknown;
  try {
    inner = JSON.parse(content.trim());
  } catch {
    return null;
  }
  if (inner === null || typeof inner !== "object") return null;
  const innerObject = inner as { question?: unknown };
  return validateQuestion(innerObject.question);
}

function getFetchImpl(deps: RequestReflectionDeps | undefined): FetchLike | null {
  if (deps?.fetch !== undefined) return deps.fetch;
  const candidate: unknown = (globalThis as { fetch?: unknown }).fetch;
  if (typeof candidate === "function") return candidate as FetchLike;
  return null;
}

function getEnvSource(deps: RequestReflectionDeps | undefined): EnvSource {
  if (deps?.env !== undefined) return deps.env;
  return process.env as EnvSource;
}

/**
 * Request exactly one optional AI reflection question.
 *
 * Returns `{ source: "ai", question }` only when the environment is
 * correctly configured, the upstream call succeeds within the
 * configured timeout, and the parsed payload satisfies the schema.
 * Every other code path returns `{ source: "fallback", question }` and
 * never throws.
 *
 * The optional `deps` argument is the test seam: production callers
 * pass nothing and the service reads `process.env` plus
 * `globalThis.fetch`. Tests pass injected values to drive every
 * failure mode deterministically without touching global state.
 */
export async function requestReflectionQuestion(
  input: ReflectionInput,
  deps?: RequestReflectionDeps,
): Promise<ReflectionResult> {
  try {
    const fallback = fallbackFor(input.result);
    const config = readEnv(getEnvSource(deps));
    if (!isConfigValid(config)) return fallback;

    const fetchImpl = getFetchImpl(deps);
    if (fetchImpl === null) return fallback;

    const controller = new AbortController();
    const timer = setTimeout(() => {
      controller.abort();
    }, config.timeoutMs);

    let response: FetchResponseLike | undefined;
    try {
      response = await fetchImpl(config.url, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${config.apiKey}`,
        },
        body: buildRequestBody(config.model, input),
        signal: controller.signal,
      });
    } catch {
      return fallback;
    } finally {
      clearTimeout(timer);
    }

    if (!response.ok) return fallback;

    let text: string;
    try {
      text = await response.text();
    } catch {
      return fallback;
    }

    const validated = parseResponseText(text);
    if (validated === null) return fallback;

    return { source: "ai", question: validated };
  } catch {
    return fallbackFor(input.result);
  }
}

/**
 * Internal constants exposed for test inspection. Not part of the
 * public service contract; do not import from production code.
 */
export const __INTERNAL__ = {
  SYSTEM_PROMPT,
  FALLBACK_QUESTIONS,
  FORBIDDEN_PATTERNS,
  REQUEST_ALLOWLIST_KEYS,
  MAX_QUESTION_LENGTH,
  DEFAULT_TIMEOUT_MS,
} as const;