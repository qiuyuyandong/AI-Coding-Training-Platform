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

export function requireExtensionOrMissingOrigin(request: Request): void {
  const origin = request.headers.get("origin");
  if (origin === null) return;
  try {
    const parsed = new URL(origin);
    if (
      parsed.protocol === "chrome-extension:"
      && /^[a-p]{32}$/.test(parsed.hostname)
      && parsed.pathname === ""
    ) {
      return;
    }
  } catch (error) {
    if (!(error instanceof TypeError)) throw error;
  }
  throw new CaptureRequestError(403, "Request origin is not allowed");
}

export function readBearerCredential(request: Request): string {
  const authorization = request.headers.get("authorization");
  const match = authorization?.match(/^Bearer (capture_[A-Za-z0-9_-]+)$/);
  if (match?.[1] === undefined) {
    throw new CaptureRequestError(401, "Capture credential is not authorized");
  }
  return match[1];
}
