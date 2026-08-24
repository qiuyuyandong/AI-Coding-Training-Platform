import { createHash } from "node:crypto";

import identity from "@/extension/identity.json";

export interface CaptureExtensionIdentity {
  readonly formatVersion: 1;
  readonly manifestKey: string;
  readonly extensionId: string;
  readonly origin: string;
}

function parseIdentity(value: typeof identity): CaptureExtensionIdentity {
  if (value.formatVersion !== 1) {
    throw new Error(`Unsupported capture extension identity format: ${value.formatVersion}`);
  }
  if (!/^[a-p]{32}$/u.test(value.extensionId)) {
    throw new Error("Capture extension ID must contain 32 Chrome ID characters");
  }
  if (value.origin !== `chrome-extension://${value.extensionId}`) {
    throw new Error("Capture extension origin does not match its extension ID");
  }
  if (deriveChromeExtensionId(value.manifestKey) !== value.extensionId) {
    throw new Error("Capture extension manifest key does not derive the frozen ID");
  }
  return {
    formatVersion: 1,
    manifestKey: value.manifestKey,
    extensionId: value.extensionId,
    origin: value.origin,
  };
}

export function deriveChromeExtensionId(manifestKey: string): string {
  const publicKey = Buffer.from(manifestKey, "base64");
  if (publicKey.length === 0 || publicKey.toString("base64") !== manifestKey) {
    throw new Error("Capture extension manifest key must be canonical base64");
  }
  const digest = createHash("sha256").update(publicKey).digest().subarray(0, 16);
  let extensionId = "";
  for (const byte of digest) {
    extensionId += String.fromCharCode(97 + (byte >> 4), 97 + (byte & 0x0f));
  }
  return extensionId;
}

export const CAPTURE_EXTENSION_IDENTITY = Object.freeze(parseIdentity(identity));
export const CAPTURE_EXTENSION_ID = CAPTURE_EXTENSION_IDENTITY.extensionId;
export const CAPTURE_EXTENSION_ORIGIN = CAPTURE_EXTENSION_IDENTITY.origin;
