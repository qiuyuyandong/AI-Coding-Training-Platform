import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  __INTERNAL__,
  requestReflectionQuestion,
  type FetchInit,
  type FetchLike,
  type FetchResponseLike,
  type ReflectionInput,
  type ReflectionResultKind,
} from "@/lib/services/reflectionExperiment";

/**
 * V0 optional AI reflection experiment tests (Todo 21).
 *
 * The service is fully driven through `deps.env` and `deps.fetch` so
 * no test mutates `process.env` or `globalThis.fetch`. Every failure
 * mode returns the deterministic result-keyed fallback question and
 * never throws.
 */

const VALID_ENV = {
  V0_AI_REFLECTION_ENABLED: "1",
  V0_AI_REFLECTION_URL: "https://example.com/v1/chat/completions",
  V0_AI_REFLECTION_MODEL: "gpt-4o-mini",
  V0_AI_REFLECTION_API_KEY: "sk-test-key-do-not-leak",
  V0_AI_REFLECTION_TIMEOUT_MS: "8000",
} as const;

const BASE_INPUT: ReflectionInput = {
  nodeStableId: "node_arrays",
  nodeTitle: "Arrays",
  practiceTaskStableId: "task_two_sum",
  practiceTaskTitle: "Two Sum",
  planReasonCode: "primary_first_pass",
  effortBoundaryMinutes: 30,
  result: "passed",
};

type FetchCall = { readonly url: string; readonly init: FetchInit | undefined };

function makeFetch(handler: (call: FetchCall) => Promise<FetchResponseLike>): {
  readonly fetch: FetchLike;
  readonly calls: FetchCall[];
} {
  const calls: FetchCall[] = [];
  const fetch: FetchLike = async (url, init) => {
    const record: FetchCall = { url, init };
    calls.push(record);
    return handler(record);
  };
  return { fetch, calls };
}

function jsonResponse(status: number, body: unknown): FetchResponseLike {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => JSON.stringify(body),
  };
}

function rawResponse(status: number, body: string): FetchResponseLike {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => body,
  };
}

const ALL_RESULTS: readonly ReflectionResultKind[] = [
  "passed",
  "partial",
  "failed",
  "stuck",
];

const EXPECTED_FALLBACK: Readonly<Record<ReflectionResultKind, string>> = {
  passed: "What part of your approach would you reuse on a harder variant?",
  partial: "What evidence shows progress, and what remains unresolved?",
  failed: "What is the smallest failing assumption you can test next?",
  stuck: "What is the smallest failing assumption you can test next?",
};

beforeEach(() => {
  vi.spyOn(console, "log").mockImplementation(() => undefined);
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe("requestReflectionQuestion — disabled configuration", () => {
  it("returns fallback for every result when the enabled flag is absent", async () => {
    const { fetch } = makeFetch(async () => jsonResponse(200, {}));
    for (const result of ALL_RESULTS) {
      const response = await requestReflectionQuestion(
        { ...BASE_INPUT, result },
        { fetch, env: { V0_AI_REFLECTION_ENABLED: "0" } },
      );
      expect(response.source).toBe("fallback");
      expect(response.question).toBe(EXPECTED_FALLBACK[result]);
    }
  });

  it("returns fallback when enabled flag is not exactly '1'", async () => {
    const { fetch, calls } = makeFetch(async () => jsonResponse(200, {}));
    const response = await requestReflectionQuestion(BASE_INPUT, {
      fetch,
      env: { ...VALID_ENV, V0_AI_REFLECTION_ENABLED: "true" },
    });
    expect(response).toEqual({ source: "fallback", question: EXPECTED_FALLBACK.passed });
    expect(calls).toHaveLength(0);
  });

  it("returns fallback when the URL is missing", async () => {
    const { fetch, calls } = makeFetch(async () => jsonResponse(200, {}));
    const response = await requestReflectionQuestion(BASE_INPUT, {
      fetch,
      env: { ...VALID_ENV, V0_AI_REFLECTION_URL: "" },
    });
    expect(response.source).toBe("fallback");
    expect(calls).toHaveLength(0);
  });

  it("returns fallback when the URL is not a valid http(s) endpoint", async () => {
    const { fetch, calls } = makeFetch(async () => jsonResponse(200, {}));
    const response = await requestReflectionQuestion(BASE_INPUT, {
      fetch,
      env: { ...VALID_ENV, V0_AI_REFLECTION_URL: "file:///etc/passwd" },
    });
    expect(response.source).toBe("fallback");
    expect(calls).toHaveLength(0);
  });

  it("returns fallback when the model is missing", async () => {
    const { fetch, calls } = makeFetch(async () => jsonResponse(200, {}));
    const response = await requestReflectionQuestion(BASE_INPUT, {
      fetch,
      env: { ...VALID_ENV, V0_AI_REFLECTION_MODEL: "  " },
    });
    expect(response.source).toBe("fallback");
    expect(calls).toHaveLength(0);
  });

  it("returns fallback when the API key is missing", async () => {
    const { fetch, calls } = makeFetch(async () => jsonResponse(200, {}));
    const response = await requestReflectionQuestion(BASE_INPUT, {
      fetch,
      env: { ...VALID_ENV, V0_AI_REFLECTION_API_KEY: "" },
    });
    expect(response.source).toBe("fallback");
    expect(calls).toHaveLength(0);
  });
});

describe("requestReflectionQuestion — happy path", () => {
  it("returns source 'ai' with the validated question on a valid OpenAI-compatible response", async () => {
    const { fetch, calls } = makeFetch(async () =>
      jsonResponse(200, {
        choices: [
          {
            message: {
              content: JSON.stringify({
                question: "Which invariant would break first under a larger input?",
              }),
            },
          },
        ],
      }),
    );

    const response = await requestReflectionQuestion(BASE_INPUT, {
      fetch,
      env: VALID_ENV,
    });

    expect(response).toEqual({
      source: "ai",
      question: "Which invariant would break first under a larger input?",
    });
    expect(calls).toHaveLength(1);
    const call = calls[0];
    expect(call).toBeDefined();
    if (call === undefined) return;
    expect(call.url).toBe(VALID_ENV.V0_AI_REFLECTION_URL);
    expect(call.init?.method).toBe("POST");
    expect(call.init?.headers?.["content-type"]).toBe("application/json");
    expect(call.init?.headers?.authorization).toBe(
      `Bearer ${VALID_ENV.V0_AI_REFLECTION_API_KEY}`,
    );
    expect(call.init?.signal).toBeInstanceOf(AbortSignal);
  });

  it("sends exactly the seven allowlisted scalars in the user message", async () => {
    const { fetch, calls } = makeFetch(async () =>
      jsonResponse(200, {
        choices: [
          { message: { content: JSON.stringify({ question: "Reflective question?" }) } },
        ],
      }),
    );

    await requestReflectionQuestion(
      { ...BASE_INPUT, planReasonCode: "primary_re_verified" },
      { fetch, env: VALID_ENV },
    );

    const call = calls[0];
    expect(call).toBeDefined();
    if (call === undefined) return;
    const body = JSON.parse(String(call.init?.body ?? "{}")) as {
      readonly model: string;
      readonly messages: ReadonlyArray<{ readonly role: string; readonly content: string }>;
      readonly temperature: number;
      readonly max_tokens: number;
      readonly stream: boolean;
    };
    expect(body.model).toBe(VALID_ENV.V0_AI_REFLECTION_MODEL);
    expect(body.temperature).toBeGreaterThanOrEqual(0);
    expect(body.max_tokens).toBeGreaterThan(0);
    expect(body.stream).toBe(false);
    expect(body.messages).toHaveLength(2);
    const system = body.messages[0];
    const user = body.messages[1];
    expect(system?.role).toBe("system");
    expect(user?.role).toBe("user");

    const userPayload = JSON.parse(String(user?.content ?? "{}")) as Record<string, unknown>;
    expect(Object.keys(userPayload).sort()).toEqual(
      [
        "effortBoundaryMinutes",
        "nodeStableId",
        "nodeTitle",
        "planReasonCode",
        "practiceTaskStableId",
        "practiceTaskTitle",
        "result",
      ],
    );
    expect(userPayload["nodeStableId"]).toBe(BASE_INPUT.nodeStableId);
    expect(userPayload["nodeTitle"]).toBe(BASE_INPUT.nodeTitle);
    expect(userPayload["practiceTaskStableId"]).toBe(BASE_INPUT.practiceTaskStableId);
    expect(userPayload["practiceTaskTitle"]).toBe(BASE_INPUT.practiceTaskTitle);
    expect(userPayload["planReasonCode"]).toBe("primary_re_verified");
    expect(userPayload["effortBoundaryMinutes"]).toBe(BASE_INPUT.effortBoundaryMinutes);
    expect(userPayload["result"]).toBe(BASE_INPUT.result);
  });

  it("rejects a non-JSON assistant content string as a schema failure", async () => {
    const { fetch } = makeFetch(async () =>
      jsonResponse(200, {
        choices: [{ message: { content: "What part would you refactor first?" } }],
      }),
    );

    const response = await requestReflectionQuestion(BASE_INPUT, {
      fetch,
      env: VALID_ENV,
    });

    expect(response).toEqual({
      source: "fallback",
      question: EXPECTED_FALLBACK.passed,
    });
  });
});

describe("requestReflectionQuestion — failure modes return deterministic fallback", () => {
  it.each([
    ["401 unauthorized", 401],
    ["500 server error", 500],
    ["429 too many requests", 429],
  ])("returns fallback on HTTP %s", async (_label, status) => {
    const { fetch, calls } = makeFetch(async () => rawResponse(status, "error"));
    const response = await requestReflectionQuestion(BASE_INPUT, {
      fetch,
      env: VALID_ENV,
    });
    expect(response).toEqual({
      source: "fallback",
      question: EXPECTED_FALLBACK.passed,
    });
    expect(calls).toHaveLength(1);
  });

  it("returns fallback when fetch rejects with a network error", async () => {
    const { fetch, calls } = makeFetch(async () => {
      throw new Error("ECONNREFUSED");
    });
    const response = await requestReflectionQuestion(BASE_INPUT, {
      fetch,
      env: VALID_ENV,
    });
    expect(response).toEqual({
      source: "fallback",
      question: EXPECTED_FALLBACK.passed,
    });
    expect(calls).toHaveLength(1);
  });

  it("returns fallback when the call is aborted by the configured timeout", async () => {
    vi.useFakeTimers();
    const fetchMock: FetchLike = (_url, init) =>
      new Promise<FetchResponseLike>((_, reject) => {
        const signal = init?.signal;
        if (signal === undefined) {
          reject(new Error("missing signal"));
          return;
        }
        if (signal.aborted) {
          reject(new DOMException("aborted", "AbortError"));
          return;
        }
        signal.addEventListener("abort", () => {
          reject(new DOMException("aborted", "AbortError"));
        });
      });

    const promise = requestReflectionQuestion(BASE_INPUT, {
      fetch: fetchMock,
      env: { ...VALID_ENV, V0_AI_REFLECTION_TIMEOUT_MS: "10" },
    });
    await vi.advanceTimersByTimeAsync(50);
    const response = await promise;
    expect(response).toEqual({
      source: "fallback",
      question: EXPECTED_FALLBACK.passed,
    });
  });

  it("returns fallback on malformed JSON response body", async () => {
    const { fetch } = makeFetch(async () => rawResponse(200, "{not-json"));
    const response = await requestReflectionQuestion(BASE_INPUT, {
      fetch,
      env: VALID_ENV,
    });
    expect(response.source).toBe("fallback");
    expect(response.question).toBe(EXPECTED_FALLBACK.passed);
  });

  it("returns fallback when choices is missing or empty", async () => {
    const { fetch: fetch1 } = makeFetch(async () => jsonResponse(200, { choices: [] }));
    const response1 = await requestReflectionQuestion(BASE_INPUT, {
      fetch: fetch1,
      env: VALID_ENV,
    });
    expect(response1.source).toBe("fallback");

    const { fetch: fetch2 } = makeFetch(async () => jsonResponse(200, {}));
    const response2 = await requestReflectionQuestion(BASE_INPUT, {
      fetch: fetch2,
      env: VALID_ENV,
    });
    expect(response2.source).toBe("fallback");
  });

  it("returns fallback when the question field is missing or wrong type", async () => {
    const { fetch: fetch1 } = makeFetch(async () =>
      jsonResponse(200, { choices: [{ message: { content: JSON.stringify({}) } }] }),
    );
    const response1 = await requestReflectionQuestion(BASE_INPUT, {
      fetch: fetch1,
      env: VALID_ENV,
    });
    expect(response1.source).toBe("fallback");

    const { fetch: fetch2 } = makeFetch(async () =>
      jsonResponse(200, {
        choices: [{ message: { content: JSON.stringify({ question: 42 }) } }],
      }),
    );
    const response2 = await requestReflectionQuestion(BASE_INPUT, {
      fetch: fetch2,
      env: VALID_ENV,
    });
    expect(response2.source).toBe("fallback");
  });

  it("returns fallback when the question is empty or longer than 300 characters", async () => {
    const { fetch: fetch1 } = makeFetch(async () =>
      jsonResponse(200, { choices: [{ message: { content: JSON.stringify({ question: "" }) } }] }),
    );
    const response1 = await requestReflectionQuestion(BASE_INPUT, {
      fetch: fetch1,
      env: VALID_ENV,
    });
    expect(response1.source).toBe("fallback");

    const oversized = "x".repeat(301);
    const { fetch: fetch2 } = makeFetch(async () =>
      jsonResponse(200, { choices: [{ message: { content: JSON.stringify({ question: oversized }) } }] }),
    );
    const response2 = await requestReflectionQuestion(BASE_INPUT, {
      fetch: fetch2,
      env: VALID_ENV,
    });
    expect(response2.source).toBe("fallback");
  });

  it.each([
    ["URL in question", "Read https://example.com for context"],
    ["http URL", "Check http://localhost:3000/page"],
    ["file URL", "Inspect file:///etc/passwd"],
    ["code fence", "Try ```cpp\nint x = 1;\n``` in the editor"],
    ["mastery claim - mastered", "You mastered this topic."],
    ["mastery claim - achieved mastery", "You have achieved mastery of arrays."],
    ["evidence claim - your evidence", "Your evidence proves the level."],
    ["evidence claim - the evidence shows", "The evidence shows progress."],
    ["state-mutation - delete", "Delete the failed attempt record."],
    ["state-mutation - mark as", "Mark as passed in the planner."],
    ["state-mutation - set ability", "Set ability to L2 in the database."],
  ])("returns fallback on forbidden content: %s", async (_label, badQuestion) => {
    const { fetch } = makeFetch(async () =>
      jsonResponse(200, {
        choices: [{ message: { content: JSON.stringify({ question: badQuestion }) } }],
      }),
    );
    const response = await requestReflectionQuestion(BASE_INPUT, {
      fetch,
      env: VALID_ENV,
    });
    expect(response.source).toBe("fallback");
    expect(response.question).toBe(EXPECTED_FALLBACK.passed);
  });

  it.each(ALL_RESULTS)(
    "returns the exact result-keyed fallback question for result=%s",
    async (result) => {
      const { fetch, calls } = makeFetch(async () =>
        jsonResponse(200, { choices: [{ message: { content: "{not-json" } }] }),
      );
      const response = await requestReflectionQuestion(
        { ...BASE_INPUT, result },
        { fetch, env: VALID_ENV },
      );
      expect(response).toEqual({
        source: "fallback",
        question: EXPECTED_FALLBACK[result],
      });
      expect(calls).toHaveLength(1);
    },
  );
});

describe("requestReflectionQuestion — privacy and logging boundaries", () => {
  it("never includes the API key or request payload in the serialized result", async () => {
    const { fetch } = makeFetch(async () =>
      jsonResponse(200, {
        choices: [
          { message: { content: JSON.stringify({ question: "What would you change?" }) } },
        ],
      }),
    );
    const response = await requestReflectionQuestion(
      { ...BASE_INPUT, planReasonCode: "primary_first_pass" },
      { fetch, env: VALID_ENV },
    );
    const serialized = JSON.stringify(response);
    expect(serialized).not.toContain(VALID_ENV.V0_AI_REFLECTION_API_KEY);
    expect(serialized).not.toContain(BASE_INPUT.nodeStableId);
    expect(serialized).not.toContain(BASE_INPUT.practiceTaskStableId);
    expect(serialized).not.toContain(BASE_INPUT.planReasonCode);
  });

  it("never calls console.log/warn/error with the API key or payload", async () => {
    const { fetch } = makeFetch(async () => jsonResponse(200, {}));
    await requestReflectionQuestion(BASE_INPUT, { fetch, env: VALID_ENV });

    const logSpy = vi.mocked(console.log);
    const warnSpy = vi.mocked(console.warn);
    const errorSpy = vi.mocked(console.error);
    const allCalls = [
      ...logSpy.mock.calls,
      ...warnSpy.mock.calls,
      ...errorSpy.mock.calls,
    ].flatMap((args) => args.map((arg) => String(arg)));
    const joined = allCalls.join("\n");
    expect(joined).not.toContain(VALID_ENV.V0_AI_REFLECTION_API_KEY);
    expect(joined).not.toContain(BASE_INPUT.nodeStableId);
    expect(joined).not.toContain(BASE_INPUT.practiceTaskStableId);
  });

  it("does not log the API key when fetch throws", async () => {
    const { fetch } = makeFetch(async () => {
      throw new Error("network down");
    });
    await requestReflectionQuestion(BASE_INPUT, { fetch, env: VALID_ENV });
    const joined = vi.mocked(console.error).mock.calls
      .flatMap((args) => args.map((arg) => String(arg)))
      .join("\n");
    expect(joined).not.toContain(VALID_ENV.V0_AI_REFLECTION_API_KEY);
  });
});

describe("requestReflectionQuestion — timeout default", () => {
  it("defaults to an 8000ms timeout when V0_AI_REFLECTION_TIMEOUT_MS is unset", () => {
    expect(__INTERNAL__.DEFAULT_TIMEOUT_MS).toBe(8000);
    expect(__INTERNAL__.MAX_QUESTION_LENGTH).toBe(300);
  });

  it("falls back to the default timeout when the env value is malformed", async () => {
    vi.useFakeTimers();
    const fetchMock: FetchLike = (_url, init) =>
      new Promise<FetchResponseLike>((_, reject) => {
        const signal = init?.signal;
        if (signal === undefined) {
          reject(new Error("missing signal"));
          return;
        }
        if (signal.aborted) {
          reject(new DOMException("aborted", "AbortError"));
          return;
        }
        signal.addEventListener("abort", () => {
          reject(new DOMException("aborted", "AbortError"));
        });
      });
    const promise = requestReflectionQuestion(BASE_INPUT, {
      fetch: fetchMock,
      env: { ...VALID_ENV, V0_AI_REFLECTION_TIMEOUT_MS: "not-a-number" },
    });
    await vi.advanceTimersByTimeAsync(8005);
    const response = await promise;
    expect(response.source).toBe("fallback");
    expect(response.question).toBe(EXPECTED_FALLBACK.passed);
  });
});