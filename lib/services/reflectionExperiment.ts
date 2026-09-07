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

import {
  requestOpenAiCompatibleJson,
  resolveOpenAiChatCompletionsUrl,
  type FetchInit,
  type FetchLike,
  type FetchResponseLike,
} from "@/lib/services/openAiCompatible";

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

export type { FetchInit, FetchLike, FetchResponseLike };

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
  const legacyEnabled = env["V0_AI_REFLECTION_ENABLED"];
  const enabled = legacyEnabled === undefined
    ? env["TRAINING_AI_MODE"] === "on_demand"
    : legacyEnabled === "1";
  const legacyUrl = (env["V0_AI_REFLECTION_URL"] ?? "").trim();
  const url = legacyUrl.length > 0
    ? legacyUrl
    : resolveOpenAiChatCompletionsUrl((env["TRAINING_AI_OPENAI_BASE_URL"] ?? "").trim());
  const model = (env["V0_AI_REFLECTION_MODEL"] ?? env["TRAINING_AI_OPENAI_MODEL"] ?? "").trim();
  const apiKey = (env["V0_AI_REFLECTION_API_KEY"] ?? env["TRAINING_AI_OPENAI_API_KEY"] ?? "").trim();
  const rawTimeout = env["V0_AI_REFLECTION_TIMEOUT_MS"] ?? env["TRAINING_AI_TIMEOUT_MS"];
  const parsed: number = rawTimeout === undefined || rawTimeout === ""
    ? Number.NaN
    : Number.parseInt(rawTimeout, 10);
  const timeoutMs: number = Number.isFinite(parsed) && parsed > 0
    ? parsed
    : DEFAULT_TIMEOUT_MS;
  return { enabled, url, model, apiKey, timeoutMs };
}

function buildUserPayload(input: ReflectionInput): Readonly<Record<string, string | number>> {
  const userPayload: Record<string, string | number> = {};
  for (const key of REQUEST_ALLOWLIST_KEYS) {
    const value: unknown = Reflect.get(input, key);
    if (typeof value === "string") {
      userPayload[key] = value;
    } else if (typeof value === "number" && Number.isFinite(value)) {
      userPayload[key] = value;
    }
  }
  return userPayload;
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
    const result = await requestOpenAiCompatibleJson({
      ...config,
      systemPrompt: SYSTEM_PROMPT,
      userPayload: buildUserPayload(input),
      temperature: REQUEST_TEMPERATURE,
      maxTokens: REQUEST_MAX_TOKENS,
      validate: (value) => {
        if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
        return validateQuestion(Reflect.get(value, "question"));
      },
    }, { fetch: deps?.fetch });
    return result.ok ? { source: "ai", question: result.value } : fallback;
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
