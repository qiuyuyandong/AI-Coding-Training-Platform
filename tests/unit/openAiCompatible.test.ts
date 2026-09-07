import { afterEach, describe, expect, it, vi } from "vitest";
import {
  requestOpenAiCompatibleJson,
  type FetchLike,
} from "@/lib/services/openAiCompatible";

afterEach(() => {
  vi.useRealTimers();
});

describe("OpenAI-compatible adapter", () => {
  it("settles with timeout even when an injected fetch ignores AbortSignal", async () => {
    vi.useFakeTimers();
    const fetch = vi.fn<FetchLike>(() => new Promise(() => undefined));
    let settled = false;
    const request = requestOpenAiCompatibleJson(baseRequest(), { fetch });
      request.then(() => { settled = true; }, () => { settled = true; });

    await vi.advanceTimersByTimeAsync(51);
    expect(settled).toBe(true);
    await expect(request).resolves.toEqual({ ok: false, error: "timeout" });
  });

  it("settles with timeout when reading a successful response body hangs", async () => {
    vi.useFakeTimers();
    const fetch = vi.fn<FetchLike>(async () => ({
      ok: true,
      status: 200,
      text: () => new Promise(() => undefined),
    }));
    const request = requestOpenAiCompatibleJson(baseRequest(), { fetch });

    await vi.advanceTimersByTimeAsync(51);
    await expect(request).resolves.toEqual({ ok: false, error: "timeout" });
  });

  it.each([
    ["non-success response", async () => ({ ok: false, status: 429, text: async () => "rate limited" }), "provider_error"],
    ["malformed envelope", async () => ({ ok: true, status: 200, text: async () => "{}" }), "invalid_response"],
    ["unreadable body", async () => ({ ok: true, status: 200, text: async () => { throw new Error("body"); } }), "invalid_response"],
  ] as const)("closes %s to a stable error", async (_label, fetch, error) => {
    await expect(requestOpenAiCompatibleJson(baseRequest(), { fetch })).resolves.toEqual({ ok: false, error });
  });
});

function baseRequest() {
  return {
    enabled: true,
    url: "https://provider.example/v1/chat/completions",
    model: "test-model",
    apiKey: "sk-test-only",
    timeoutMs: 50,
    systemPrompt: "Return JSON.",
    userPayload: {},
    validate: (value: unknown) => value,
  } as const;
}
