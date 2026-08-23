import { CaptureAttemptAckSchema, type CaptureAttemptAck } from "@/lib/capture/attemptBundle";
import type { CaptureAttemptBundle } from "@/lib/capture/attemptBundle";

export const DEFAULT_CAPTURE_ENDPOINT = "http://localhost:3000/api/capture/attempts";
export const LEGACY_DEFAULT_CAPTURE_ENDPOINT = "http://localhost:3000/api/capture/events";
export const MAX_RETRY_ATTEMPTS = 3;

export type CaptureEndpointStatus = Readonly<{
  readonly endpoint: string;
  readonly status: "supported" | "unsupported";
}>;

export type CaptureAttemptFlushResult =
  | { readonly status: 200; readonly ack: CaptureAttemptAck }
  | { readonly status: "ack_error"; readonly error: string }
  | { readonly status: "endpoint_error"; readonly error: "unsupported_capture_endpoint" }
  | { readonly status: 400 | 401 | 403 | 409 | 413 | 415 | 500; readonly error: string }
  | { readonly status: "network_error"; readonly error: string };

export function readCaptureEndpoint(value: unknown): string {
  return captureEndpointStatus(value).endpoint;
}

export function captureEndpointStatus(value: unknown): CaptureEndpointStatus {
  if (typeof value !== "string") {
    return { endpoint: DEFAULT_CAPTURE_ENDPOINT, status: "supported" };
  }
  try {
    const url = new URL(value);
    const isLoopback = url.hostname === "localhost"
      || url.hostname === "127.0.0.1"
      || url.hostname === "[::1]";
    if (url.protocol !== "http:" || !isLoopback
      || url.username !== "" || url.password !== "") {
      return { endpoint: DEFAULT_CAPTURE_ENDPOINT, status: "supported" };
    }
    const normalized = url.toString();
    if (normalized === DEFAULT_CAPTURE_ENDPOINT || normalized === LEGACY_DEFAULT_CAPTURE_ENDPOINT) {
      return { endpoint: DEFAULT_CAPTURE_ENDPOINT, status: "supported" };
    }
    return { endpoint: normalized, status: "unsupported" };
  } catch (error) {
    if (error instanceof TypeError) {
      return { endpoint: DEFAULT_CAPTURE_ENDPOINT, status: "supported" };
    }
    throw error;
  }
}

export function captureAttemptEndpoint(value: unknown): string | undefined {
  const endpoint = captureEndpointStatus(value);
  return endpoint.status === "supported" ? DEFAULT_CAPTURE_ENDPOINT : undefined;
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
  const endpoint = captureAttemptEndpoint(input.endpoint);
  if (endpoint === undefined) {
    return { status: "endpoint_error", error: "unsupported_capture_endpoint" };
  }
  try {
    const response = await fetchImpl(endpoint, {
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
          error: "ACK mismatch: invalid response",
        };
      }
      if (parsed.data.bundleId !== input.bundle.bundleId) {
        return {
          status: "ack_error",
          error: "ACK mismatch: bundle identity",
        };
      }
      return { status: 200, ack: parsed.data };
    }
    const error = `HTTP ${response.status}`;
    if (
      response.status === 400 || response.status === 401 || response.status === 403
      || response.status === 409 || response.status === 413 || response.status === 415
    ) {
      return { status: response.status, error };
    }
    return { status: 500, error };
  } catch (error) {
    void error;
    return {
      status: "network_error",
      error: "Network request failed",
    };
  }
}
