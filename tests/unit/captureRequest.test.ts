import { describe, expect, it } from "vitest";
import {
  CaptureRequestError,
  readBearerCapability,
  readBoundedJson,
  requireCanonicalLocalCaptureHost,
  requireExactCaptureExtensionOrigin,
  requireSameOrigin,
} from "@/lib/http/captureRequest";
import { CAPTURE_EXTENSION_ORIGIN } from "@/lib/extension/identity";

describe("capture request boundary", () => {
  it("accepts JSON with a charset and rejects other media types", async () => {
    await expect(readBoundedJson(request("{}", {
      "content-type": "application/json; charset=utf-8",
    }))).resolves.toEqual({});
    await expect(readBoundedJson(request("{}", {
      "content-type": "text/plain",
    }))).rejects.toMatchObject({ status: 415 });
  });

  it("rejects malformed and oversized JSON", async () => {
    await expect(readBoundedJson(request("{"))).rejects.toMatchObject({
      status: 400,
    });
    await expect(readBoundedJson(request(JSON.stringify({ value: "x".repeat(70_000) }))))
      .rejects.toMatchObject({ status: 413 });
  });

  it("requires exact same origin for management requests", () => {
    expect(() => requireSameOrigin(request("{}", {
      origin: "http://localhost:3000",
    }))).not.toThrow();
    expect(() => requireSameOrigin(request("{}", {
      origin: "https://example.com",
    }))).toThrow(CaptureRequestError);
    expect(() => requireSameOrigin(request("{}"))).toThrow(CaptureRequestError);
  });

  it("requires the canonical host and exact frozen extension origin", () => {
    expect(() => requireCanonicalLocalCaptureHost(request("{}"))).not.toThrow();
    expect(() => requireExactCaptureExtensionOrigin(request("{}", {
      origin: CAPTURE_EXTENSION_ORIGIN,
    }))).not.toThrow();
    expect(() => requireExactCaptureExtensionOrigin(request("{}", {
      origin: `chrome-extension://${"a".repeat(32)}`,
    }))).toThrow(CaptureRequestError);
    expect(() => requireExactCaptureExtensionOrigin(request("{}", {
      origin: "https://leetcode.com",
    }))).toThrow(CaptureRequestError);
  });

  it("accepts only an exact-length capture bearer capability", () => {
    const capability = `capture_${"A".repeat(43)}`;
    expect(readBearerCapability(request("{}", {
      authorization: `Bearer ${capability}`,
    }))).toBe(capability);
    expect(() => readBearerCapability(request("{}"))).toThrow(CaptureRequestError);
    expect(() => readBearerCapability(request("{}", {
      authorization: "Bearer pair_secret",
    }))).toThrow(CaptureRequestError);
  });
});

function request(body: string, headers: Record<string, string> = {}): Request {
  return new Request("http://localhost:3000/api/capture/events", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...headers,
    },
    body,
  });
}
