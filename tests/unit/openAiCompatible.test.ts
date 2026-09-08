import { afterEach, describe, expect, it, vi } from "vitest";
import {
  isPublicHttpEndpoint,
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

  it.each([
    "http://provider.example/v1/chat/completions",
    "https://localhost/v1/chat/completions",
    "https://0.0.0.0/v1/chat/completions",
    "https://100.64.0.1/v1/chat/completions",
    "https://192.0.2.1/v1/chat/completions",
    "https://[::]/v1/chat/completions",
    "https://[fc00::1]/v1/chat/completions",
    "https://[fe80::1]/v1/chat/completions",
    "https://[ff02::1]/v1/chat/completions",
    "https://[::ffff:127.0.0.1]/v1/chat/completions",
    "https://user:secret@provider.example/v1/chat/completions",
  ])("rejects non-public or non-HTTPS endpoint %s before fetch", async (url) => {
    const fetch = vi.fn<FetchLike>();
    expect(isPublicHttpEndpoint(url)).toBe(false);
    await expect(requestOpenAiCompatibleJson({ ...baseRequest(), url }, { fetch }))
      .resolves.toEqual({ ok: false, error: "network_denied" });
    expect(fetch).not.toHaveBeenCalled();
  });

  it.each([
    "https://provider.example/v1/chat/completions",
    "https://8.8.8.8/v1/chat/completions",
    "https://[2606:4700:4700::1111]/v1/chat/completions",
    "https://[::ffff:8.8.8.8]/v1/chat/completions",
  ])("accepts a syntactically public HTTPS endpoint %s", (url) => {
    expect(isPublicHttpEndpoint(url)).toBe(true);
  });

  it("runs request authorization immediately before fetch", async () => {
    const fetch = vi.fn<FetchLike>();
    const authorizeRequest = vi.fn(() => "quota_exhausted" as const);
    await expect(requestOpenAiCompatibleJson(baseRequest(), { fetch, authorizeRequest }))
      .resolves.toEqual({ ok: false, error: "quota_exhausted" });
    expect(authorizeRequest).toHaveBeenCalledOnce();
    expect(fetch).not.toHaveBeenCalled();
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
