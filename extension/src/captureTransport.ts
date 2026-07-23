import { CaptureAttemptAckSchema, type CaptureAttemptAck } from "@/lib/capture/attemptBundle";
import type { CaptureAttemptBundle } from "@/lib/capture/attemptBundle";

export const DEFAULT_CAPTURE_ENDPOINT = "http://localhost:3000/api/capture/events";
export const MAX_RETRY_ATTEMPTS = 3;

export type CaptureAttemptFlushResult =
  | { readonly status: 200; readonly ack: CaptureAttemptAck }
  | { readonly status: "ack_error"; readonly error: string }
  | { readonly status: 400 | 401 | 403 | 409 | 413 | 415 | 500; readonly error: string }
  | { readonly status: "network_error"; readonly error: string };

export function readCaptureEndpoint(value: unknown): string {
  if (typeof value !== "string") return DEFAULT_CAPTURE_ENDPOINT;
  try {
    const url = new URL(value);
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return DEFAULT_CAPTURE_ENDPOINT;
    }
    return url.toString();
  } catch (error) {
    if (error instanceof TypeError) return DEFAULT_CAPTURE_ENDPOINT;
    throw error;
  }
}

export function captureAttemptEndpoint(value: unknown): string {
  const endpoint = new URL(readCaptureEndpoint(value));
  if (endpoint.pathname !== "/api/capture/events") {
    return "http://localhost:3000/api/capture/attempts";
  }
  endpoint.pathname = "/api/capture/attempts";
  endpoint.search = "";
  endpoint.hash = "";
  return endpoint.toString();
}

export function captureRequestHeaders(credential: unknown): Record<string, string> {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (typeof credential === "string" && credential.startsWith("capture_")) {
    headers.authorization = `Bearer ${credential}`;
  }
  return headers;
}

export async function postCaptureAttemptBundle(input: {
  readonly bundle: CaptureAttemptBundle;
  readonly endpoint: unknown;
  readonly credential: unknown;
  readonly fetchImpl?: typeof fetch;
}): Promise<CaptureAttemptFlushResult> {
  const fetchImpl = input.fetchImpl ?? fetch;
  try {
    const response = await fetchImpl(captureAttemptEndpoint(input.endpoint), {
      method: "POST",
      headers: captureRequestHeaders(input.credential),
      body: JSON.stringify(input.bundle),
    });
    if (response.ok) {
      const body: unknown = await response.json();
      const parsed = CaptureAttemptAckSchema.safeParse(body);
      if (!parsed.success) {
        return {
          status: "ack_error",
          error: `ACK mismatch: response did not match CaptureAttemptAck (${parsed.error.issues[0]?.message ?? "invalid response"})`,
        };
      }
      if (parsed.data.bundleId !== input.bundle.bundleId) {
        return {
          status: "ack_error",
          error: `ACK mismatch: expected bundle ${input.bundle.bundleId}, received ${parsed.data.bundleId}`,
        };
      }
      return { status: 200, ack: parsed.data };
    }
    const error = await readErrorBody(response);
    if (
      response.status === 400 || response.status === 401 || response.status === 403
      || response.status === 409 || response.status === 413 || response.status === 415
    ) {
      return { status: response.status, error };
    }
    return { status: 500, error };
  } catch (error) {
    return {
      status: "network_error",
      error: error instanceof Error ? error.message : "Network error",
    };
  }
}

async function readErrorBody(response: Response): Promise<string> {
  try {
    const body: unknown = await response.json();
    if (typeof body === "object" && body !== null && "error" in body) {
      return String(body.error);
    }
  } catch (error) {
    if (!(error instanceof SyntaxError)) throw error;
  }
  return response.statusText || `HTTP ${response.status}`;
}
