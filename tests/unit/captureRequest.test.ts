import { describe, expect, it } from "vitest";
import {
  CaptureRequestError,
  readBearerCredential,
  readBoundedJson,
  requireExtensionOrMissingOrigin,
  requireSameOrigin,
} from "@/lib/http/captureRequest";

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
      origin: "http://localhost",
    }))).not.toThrow();
    expect(() => requireSameOrigin(request("{}", {
      origin: "https://example.com",
    }))).toThrow(CaptureRequestError);
    expect(() => requireSameOrigin(request("{}"))).toThrow(CaptureRequestError);
  });

  it("allows extension or absent origins but rejects web origins", () => {
    expect(() => requireExtensionOrMissingOrigin(request("{}"))).not.toThrow();
    expect(() => requireExtensionOrMissingOrigin(request("{}", {
      origin: `chrome-extension://${"a".repeat(32)}`,
    }))).not.toThrow();
    expect(() => requireExtensionOrMissingOrigin(request("{}", {
      origin: "https://leetcode.com",
    }))).toThrow(CaptureRequestError);
  });

  it("accepts only capture bearer credentials", () => {
    expect(readBearerCredential(request("{}", {
      authorization: "Bearer capture_abc-123_DEF",
    }))).toBe("capture_abc-123_DEF");
    expect(() => readBearerCredential(request("{}"))).toThrow(CaptureRequestError);
    expect(() => readBearerCredential(request("{}", {
      authorization: "Bearer pair_secret",
    }))).toThrow(CaptureRequestError);
  });
});

function request(body: string, headers: Record<string, string> = {}): Request {
  return new Request("http://localhost/api/capture/events", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...headers,
    },
    body,
  });
}
