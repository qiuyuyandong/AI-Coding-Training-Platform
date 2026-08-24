import identity from "@/extension/identity.json";
import {
  CAPTURE_EXTENSION_ID,
  CAPTURE_EXTENSION_ORIGIN,
  deriveChromeExtensionId,
} from "@/lib/extension/identity";
import { isExactCaptureExtensionOrigin } from "@/lib/http/extensionOrigin";
import { describe, expect, it } from "vitest";

describe("capture extension identity", () => {
  it("independently derives the frozen Chrome extension ID from the public key", () => {
    expect(deriveChromeExtensionId(identity.manifestKey)).toBe(identity.extensionId);
    expect(CAPTURE_EXTENSION_ID).toBe("oldmkbngfokmhlkjmlichccmbebipmei");
    expect(CAPTURE_EXTENSION_ORIGIN).toBe(
      "chrome-extension://oldmkbngfokmhlkjmlichccmbebipmei",
    );
  });

  it.each([
    null,
    "null",
    "https://example.com",
    "http://localhost:3000",
    "chrome-extension://aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    "chrome-extension://oldmkbngfokmhlkjmlichccmbebipmej",
    "chrome-extension://OLDMKBNGFOKMHLKJMLICHCCMBEBIPMEI",
    "chrome-extension://oldmkbngfokmhlkjmlichccmbebipmei/",
    "not an origin",
  ])("rejects every non-exact origin value: %s", (origin) => {
    expect(isExactCaptureExtensionOrigin(origin)).toBe(false);
  });

  it("accepts only the exact frozen extension origin", () => {
    expect(isExactCaptureExtensionOrigin(CAPTURE_EXTENSION_ORIGIN)).toBe(true);
  });
});
