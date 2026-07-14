import { describe, expect, it } from "vitest";
import {
  isPairCaptureInstallationMessage,
  pairingEndpointFromCaptureEndpoint,
  parsePairCaptureApiResponse,
} from "@/extension/src/pairing";

describe("extension pairing", () => {
  it("validates popup pairing messages", () => {
    expect(isPairCaptureInstallationMessage({
      type: "PAIR_CAPTURE_INSTALLATION",
      code: "pair_secret",
    })).toBe(true);
    expect(isPairCaptureInstallationMessage({
      type: "PAIR_CAPTURE_INSTALLATION",
      code: "",
    })).toBe(false);
  });

  it("derives the pairing endpoint from the configured capture endpoint", () => {
    expect(pairingEndpointFromCaptureEndpoint(
      "http://127.0.0.1:3001/api/capture/events?old=true",
    )).toBe("http://127.0.0.1:3001/api/capture/pair");
  });

  it("accepts only a matching successful pairing response", () => {
    expect(parsePairCaptureApiResponse({
      ok: true,
      credential: "capture_abc_123",
      installationId: "installation_1",
      credentialVersion: 2,
    }, "installation_1")).toEqual({
      credential: "capture_abc_123",
      installationId: "installation_1",
      credentialVersion: 2,
    });
    expect(() => parsePairCaptureApiResponse({
      ok: true,
      credential: "capture_abc_123",
      installationId: "installation_other",
      credentialVersion: 2,
    }, "installation_1")).toThrow("does not match");
  });
});
