import { CAPTURE_EXTENSION_ORIGIN } from "@/lib/extension/identity";
import { CAPTURE_CAPABILITY_PATTERN } from "@/lib/services/captureCapability";

export const MAX_CAPTURE_JSON_BYTES = 64 * 1024;

export class CaptureRequestError extends Error {
  readonly status: 400 | 401 | 403 | 413 | 415;

  constructor(
    status: 400 | 401 | 403 | 413 | 415,
    message: string,
  ) {
    super(message);
    this.name = "CaptureRequestError";
    this.status = status;
  }
}

export async function readBoundedJson(
  request: Request,
  maxBytes = MAX_CAPTURE_JSON_BYTES,
): Promise<unknown> {
  const mediaType = request.headers.get("content-type")
    ?.split(";", 1)[0]
    ?.trim()
    .toLowerCase();
  if (mediaType !== "application/json") {
    throw new CaptureRequestError(415, "Content-Type must be application/json");
  }

  const declaredLength = request.headers.get("content-length");
  if (
    declaredLength !== null
    && Number.isFinite(Number(declaredLength))
    && Number(declaredLength) > maxBytes
  ) {
    throw new CaptureRequestError(413, "Request body is too large");
  }

  if (request.body === null) {
    throw new CaptureRequestError(400, "Request body must contain JSON");
  }
  const reader = request.body.getReader();
  const decoder = new TextDecoder("utf-8", { fatal: true });
  let totalBytes = 0;
  let text = "";
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      totalBytes += chunk.value.byteLength;
      if (totalBytes > maxBytes) {
        await reader.cancel();
        throw new CaptureRequestError(413, "Request body is too large");
      }
      text += decoder.decode(chunk.value, { stream: true });
    }
    text += decoder.decode();
  } catch (error) {
    if (error instanceof CaptureRequestError) throw error;
    throw new CaptureRequestError(400, "Request body must contain valid UTF-8 JSON");
  }

  try {
    return JSON.parse(text);
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new CaptureRequestError(400, "Request body must contain valid JSON");
    }
    throw error;
  }
}

export function requireSameOrigin(request: Request): void {
  const origin = request.headers.get("origin");
  if (origin === null || origin !== new URL(request.url).origin) {
    throw new CaptureRequestError(403, "Request origin is not allowed");
  }
}

export function statusForRangeError(error: RangeError): 400 | 404 | 409 {
  const message = error.message.toLowerCase();
  if (message.includes("not found")) return 404;
  if (message.includes("not active") || message.includes("already")
    || message.includes("different") || message.includes("conflict") || message.includes("stale")) return 409;
  return 400;
}

export function requireCanonicalLocalCaptureHost(request: Request): void {
  const url = new URL(request.url);
  if (
    url.protocol !== "http:"
    || url.hostname !== "localhost"
    || url.port !== "3000"
    || url.username !== ""
    || url.password !== ""
  ) {
    throw new CaptureRequestError(403, "Capture host is not allowed");
  }
}

export function requireExactCaptureExtensionOrigin(request: Request): void {
  if (request.headers.get("origin") !== CAPTURE_EXTENSION_ORIGIN) {
    throw new CaptureRequestError(403, "Request origin is not allowed");
  }
}

export function readBearerCapability(request: Request): string {
  const authorization = request.headers.get("authorization");
  const credential = authorization?.startsWith("Bearer ") === true
    ? authorization.slice("Bearer ".length)
    : undefined;
  if (credential === undefined || !CAPTURE_CAPABILITY_PATTERN.test(credential)) {
    throw new CaptureRequestError(401, "Capture capability is not authorized");
  }
  return credential;
}

export function captureExtensionCorsHeaders(): Readonly<Record<string, string>> {
  return {
    "Access-Control-Allow-Origin": CAPTURE_EXTENSION_ORIGIN,
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Authorization, Content-Type",
    "Access-Control-Max-Age": "600",
    Vary: "Origin",
  };
}
