import { describe, expect, it } from "vitest";
import {
  APPROVED_LOCAL_STORAGE_KEYS,
  APPROVED_SESSION_STORAGE_KEYS,
  assertCaptureStorageKeys,
} from "@/extension/src/storagePrivacy";

describe("extension storage privacy boundary", () => {
  it("accepts the closed local and session inventories", () => {
    expect(() => assertCaptureStorageKeys("local", APPROVED_LOCAL_STORAGE_KEYS)).not.toThrow();
    expect(() => assertCaptureStorageKeys("session", APPROVED_SESSION_STORAGE_KEYS)).not.toThrow();
  });

  it("fails closed on unknown and cross-area keys without including the key in the error", () => {
    expect(() => assertCaptureStorageKeys("local", ["transientE1"]))
      .toThrow("capture_storage_local_key_rejected");
    expect(() => assertCaptureStorageKeys("session", ["captureCredential"]))
      .toThrow("capture_storage_session_key_rejected");
    expect(() => assertCaptureStorageKeys("local", ["token=secret"]))
      .toThrow("capture_storage_local_key_rejected");
    try {
      assertCaptureStorageKeys("local", ["token=secret"]);
    } catch (error) {
      expect(String(error)).not.toContain("secret");
    }
  });
});
