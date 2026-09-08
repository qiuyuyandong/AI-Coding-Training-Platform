import { isIP } from "node:net";

export type ProviderErrorCode =
  | "disabled"
  | "invalid_config"
  | "network_denied"
  | "timeout"
  | "transport_error"
  | "provider_error"
  | "invalid_response"
  | "invalid_output"
  | "persistence_error"
  | "quota_exhausted";

export type OpenAiProviderResult<T> = Readonly<
  | { ok: true; value: T }
  | { ok: false; error: ProviderErrorCode }
>;

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

export type FetchLike = (input: string, init?: FetchInit) => Promise<FetchResponseLike>;

export type OpenAiCompatibleRequest<T> = {
  readonly enabled: boolean;
  readonly url: string;
  readonly model: string;
  readonly apiKey: string;
  readonly timeoutMs: number;
  readonly systemPrompt: string;
  readonly userPayload: Readonly<Record<string, unknown>>;
  readonly temperature?: number;
  readonly maxTokens?: number;
  readonly validate: (value: unknown) => T | null;
};

export type OpenAiCompatibleDeps = {
  readonly fetch?: FetchLike;
  readonly authorizeRequest?: () => ProviderErrorCode | null;
};

export async function requestOpenAiCompatibleJson<T>(
  request: OpenAiCompatibleRequest<T>,
  deps: OpenAiCompatibleDeps = {},
): Promise<OpenAiProviderResult<T>> {
  if (!request.enabled) return { ok: false, error: "disabled" };
  if (!isConfigValid(request)) return { ok: false, error: "invalid_config" };
  if (!isPublicHttpEndpoint(request.url)) return { ok: false, error: "network_denied" };
  const fetchImpl = deps.fetch ?? readGlobalFetch();
  if (fetchImpl === null) return { ok: false, error: "transport_error" };
  const authorizationError = deps.authorizeRequest?.() ?? null;
  if (authorizationError !== null) return { ok: false, error: authorizationError };
  const controller = new AbortController();
  type WireOutcome =
    | { readonly kind: "text"; readonly text: string }
    | { readonly kind: "provider_error" }
    | { readonly kind: "invalid_response" }
    | { readonly kind: "transport_error" }
    | { readonly kind: "timeout" };
  const wireRequest = (async (): Promise<WireOutcome> => {
    try {
      const response = await fetchImpl(request.url, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${request.apiKey}`,
        },
        body: JSON.stringify({
          model: request.model,
          messages: [
            { role: "system", content: request.systemPrompt },
            { role: "user", content: JSON.stringify(request.userPayload) },
          ],
          temperature: request.temperature ?? 0.2,
          max_tokens: request.maxTokens ?? 512,
          stream: false,
        }),
        signal: controller.signal,
      });
      if (!response.ok) return { kind: "provider_error" };
      try {
        return { kind: "text", text: await response.text() };
      } catch {
        return { kind: "invalid_response" };
      }
    } catch (error) {
      return { kind: controller.signal.aborted || isAbortError(error) ? "timeout" : "transport_error" };
    }
  })();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<WireOutcome>((resolve) => {
    timer = setTimeout(() => {
      controller.abort();
      resolve({ kind: "timeout" });
    }, request.timeoutMs);
  });
  const outcome = await Promise.race([wireRequest, timeout]);
  if (timer !== undefined) clearTimeout(timer);
  if (outcome.kind !== "text") return { ok: false, error: outcome.kind };
  if (Buffer.byteLength(outcome.text, "utf8") > 256 * 1024) return { ok: false, error: "invalid_response" };
  const inner = parseWireContent(outcome.text);
  if (inner === null) return { ok: false, error: "invalid_response" };
  const value = request.validate(inner);
  return value === null ? { ok: false, error: "invalid_output" } : { ok: true, value };
}

export function resolveOpenAiChatCompletionsUrl(baseUrl: string): string {
  if (baseUrl.length === 0) return "";
  try {
    const parsed = new URL(baseUrl);
    const pathname = parsed.pathname.replace(/\/+$/u, "");
    if (pathname.endsWith("/chat/completions")) {
      parsed.pathname = pathname;
    } else if (pathname.endsWith("/v1")) {
      parsed.pathname = `${pathname}/chat/completions`;
    } else {
      parsed.pathname = `${pathname}/v1/chat/completions`;
    }
    return parsed.toString();
  } catch {
    return baseUrl;
  }
}

function isConfigValid(request: OpenAiCompatibleRequest<unknown>): boolean {
  return request.url.trim().length > 0
    && request.model.trim().length > 0
    && request.apiKey.trim().length > 0
    && Number.isInteger(request.timeoutMs)
    && request.timeoutMs > 0
    && request.timeoutMs <= 120_000;
}

export function isPublicHttpEndpoint(value: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    return false;
  }
  if (parsed.protocol !== "https:") return false;
  if (parsed.username.length > 0 || parsed.password.length > 0) return false;
  return !isPrivateOrLocalHostname(parsed.hostname);
}

function isPrivateOrLocalHostname(rawHostname: string): boolean {
  let host = rawHostname.toLowerCase();
  if (host.startsWith("[") && host.endsWith("]")) host = host.slice(1, -1);
  host = host.replace(/\.$/u, "");
  if (host.length === 0 || host === "localhost" || host.endsWith(".localhost")
    || host.endsWith(".local") || host.endsWith(".internal") || host.endsWith(".home")
    || host.endsWith(".lan") || host === "ip6-localhost" || host === "ip6-loopback") return true;
  if (isIP(host) === 6) return isNonPublicIpv6(host);
  const parts = host.split(".");
  if (isIP(host) !== 4 || parts.length !== 4) return false;
  const numbers = parts.map((part) => Number.parseInt(part, 10));
  const first = numbers[0];
  const second = numbers[1];
  if (first === undefined || second === undefined) return true;
  return first === 0 || first === 10 || first === 127 || first >= 224
    || (first === 100 && second >= 64 && second <= 127)
    || (first === 169 && second === 254)
    || (first === 172 && second >= 16 && second <= 31)
    || (first === 192 && second === 0 && (numbers[2] === 0 || numbers[2] === 2))
    || (first === 192 && second === 168)
    || (first === 198 && (second === 18 || second === 19))
    || (first === 198 && second === 51 && numbers[2] === 100)
    || (first === 203 && second === 0 && numbers[2] === 113);
}

function isNonPublicIpv6(host: string): boolean {
  if (host === "::" || host === "::1") return true;
  if (host.startsWith("::ffff:")) {
    const tail = host.slice("::ffff:".length).split(":");
    if (tail.length !== 2) return true;
    const high = Number.parseInt(tail[0] ?? "", 16);
    const low = Number.parseInt(tail[1] ?? "", 16);
    if (!Number.isInteger(high) || !Number.isInteger(low)) return true;
    const ipv4 = `${high >> 8}.${high & 255}.${low >> 8}.${low & 255}`;
    return isPrivateOrLocalHostname(ipv4);
  }
  const first = Number.parseInt(host.split(":")[0] ?? "", 16);
  if (!Number.isInteger(first)) return true;
  if ((first & 0xfe00) === 0xfc00 || (first & 0xffc0) === 0xfe80 || (first & 0xff00) === 0xff00) return true;
  if (host.startsWith("2001:db8:")) return true;
  return false;
}

function parseWireContent(text: string): unknown | null {
  let outer: unknown;
  try {
    outer = JSON.parse(text);
  } catch {
    return null;
  }
  if (!isRecord(outer)) return null;
  const choices = outer["choices"];
  if (!Array.isArray(choices) || choices.length === 0 || !isRecord(choices[0])) return null;
  const message = choices[0]["message"];
  if (!isRecord(message) || typeof message["content"] !== "string") return null;
  try {
    return JSON.parse(message["content"].trim());
  } catch {
    return null;
  }
}

function readGlobalFetch(): FetchLike | null {
  const candidate: unknown = globalThis.fetch;
  if (typeof candidate !== "function") return null;
  return (input, init) => candidate(input, init);
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === "AbortError";
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
