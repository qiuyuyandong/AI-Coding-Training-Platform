export const LOCAL_CAPTURE_SETTINGS_URL = "http://localhost:3000/settings";
export const LOCAL_CAPTURE_COMPLETION_ENDPOINT =
  "http://localhost:3000/api/capture/connect/complete";
export const LOCAL_CAPTURE_STATUS_ENDPOINT = "http://localhost:3000/api/capture/status";

const CAPABILITY_PREFIX = "capture_";
const BASE64URL_ALPHABET =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";

export type CaptureConnectionStatus =
  | "connected"
  | "connection_required"
  | "service_unreachable"
  | "capability_rejected";

export type ExternalCaptureConnectionRequest = Readonly<{
  schemaVersion: 1;
  type: "capture.install.connect";
  challengeId: string;
  nonce: string;
}>;

export type CaptureConnectionCompletion = Readonly<{
  credentialVersion: number;
}>;

export function readExternalCaptureConnectionRequest(
  value: unknown,
  senderUrl: unknown,
): ExternalCaptureConnectionRequest | undefined {
  if (senderUrl !== LOCAL_CAPTURE_SETTINGS_URL
    || typeof value !== "object" || value === null || Array.isArray(value)
    || Reflect.ownKeys(value).length !== 4
    || Reflect.get(value, "schemaVersion") !== 1
    || Reflect.get(value, "type") !== "capture.install.connect") {
    return undefined;
  }
  const challengeId = Reflect.get(value, "challengeId");
  const nonce = Reflect.get(value, "nonce");
  if (typeof challengeId !== "string"
    || !/^challenge_[0-9a-f-]{36}$/u.test(challengeId)
    || typeof nonce !== "string"
    || !/^[A-Za-z0-9_-]{43}$/u.test(nonce)) {
    return undefined;
  }
  return { schemaVersion: 1, type: "capture.install.connect", challengeId, nonce };
}

export function createExtensionCaptureCapability(
  fillRandom: (bytes: Uint8Array) => Uint8Array = (bytes) => crypto.getRandomValues(bytes),
): string {
  const bytes = fillRandom(new Uint8Array(32));
  if (bytes.length !== 32) throw new Error("Capture capability entropy length mismatch");
  return `${CAPABILITY_PREFIX}${encodeBase64Url(bytes)}`;
}

export async function completeLocalCaptureConnection(input: {
  readonly request: ExternalCaptureConnectionRequest;
  readonly installationId: string;
  readonly capability: string;
  readonly fetchImpl?: typeof fetch;
}): Promise<CaptureConnectionCompletion> {
  const response = await (input.fetchImpl ?? fetch)(LOCAL_CAPTURE_COMPLETION_ENDPOINT, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      schemaVersion: 1,
      challengeId: input.request.challengeId,
      nonce: input.request.nonce,
      installationId: input.installationId,
      capability: input.capability,
    }),
  });
  if (response.status !== 201) throw new Error("Capture connection was rejected");
  const body: unknown = await response.json();
  if (typeof body !== "object" || body === null || Array.isArray(body)
    || Reflect.ownKeys(body).length !== 2
    || Reflect.get(body, "ok") !== true) {
    throw new Error("Capture connection response is invalid");
  }
  const credentialVersion = Reflect.get(body, "credentialVersion");
  if (typeof credentialVersion !== "number"
    || !Number.isInteger(credentialVersion) || credentialVersion < 1) {
    throw new Error("Capture connection version is invalid");
  }
  return { credentialVersion };
}

export async function probeLocalCaptureConnection(
  capability: string,
  fetchImpl: typeof fetch = fetch,
): Promise<CaptureConnectionStatus> {
  try {
    const response = await fetchImpl(LOCAL_CAPTURE_STATUS_ENDPOINT, {
      method: "GET",
      headers: { authorization: `Bearer ${capability}` },
    });
    if (response.status === 401) return "capability_rejected";
    if (!response.ok) return "service_unreachable";
    const body: unknown = await response.json();
    return isHealthyCaptureStatus(body) ? "connected" : "service_unreachable";
  } catch {
    return "service_unreachable";
  }
}

export function readCaptureConnectionStatus(
  value: unknown,
  hasCapability: boolean,
): CaptureConnectionStatus {
  if (!hasCapability) return "connection_required";
  if (value === "connected" || value === "service_unreachable"
    || value === "capability_rejected") return value;
  return "service_unreachable";
}

function isHealthyCaptureStatus(value: unknown): boolean {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    && Reflect.ownKeys(value).length === 3
    && Reflect.get(value, "schemaVersion") === 1
    && Reflect.get(value, "connection") === "connected"
    && Reflect.get(value, "service") === "ready";
}

function encodeBase64Url(bytes: Uint8Array): string {
  let encoded = "";
  for (let offset = 0; offset < bytes.length; offset += 3) {
    const first = bytes[offset] ?? 0;
    const second = bytes[offset + 1];
    const third = bytes[offset + 2];
    encoded += BASE64URL_ALPHABET[first >> 2];
    encoded += BASE64URL_ALPHABET[((first & 0x03) << 4) | ((second ?? 0) >> 4)];
    if (second !== undefined) {
      encoded += BASE64URL_ALPHABET[((second & 0x0f) << 2) | ((third ?? 0) >> 6)];
    }
    if (third !== undefined) encoded += BASE64URL_ALPHABET[third & 0x3f];
  }
  return encoded;
}
