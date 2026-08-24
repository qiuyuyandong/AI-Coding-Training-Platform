import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

export const CAPTURE_CAPABILITY_PATTERN = /^capture_[A-Za-z0-9_-]{43}$/u;

export function createCaptureCapability(): string {
  return `capture_${randomBytes(32).toString("base64url")}`;
}

export function hashCaptureCapability(capability: string): string {
  return createHash("sha256").update(capability, "utf8").digest("hex");
}

export function captureCapabilityHashMatches(expectedHash: string, capability: string): boolean {
  const actualHash = hashCaptureCapability(capability);
  const expected = Buffer.from(expectedHash, "hex");
  const actual = Buffer.from(actualHash, "hex");
  return expected.length === 32 && actual.length === 32 && timingSafeEqual(expected, actual);
}
