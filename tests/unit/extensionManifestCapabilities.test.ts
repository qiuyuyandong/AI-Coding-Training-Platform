import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

type ExtensionManifest = Readonly<{
  readonly minimum_chrome_version?: string;
  readonly permissions?: readonly string[];
}>;

describe("extension browser capability baseline", () => {
  it("requires Chrome 106 and unlimited storage without broad tab authority", () => {
    const manifest = JSON.parse(
      readFileSync(resolve("extension/manifest.json"), "utf8"),
    ) as ExtensionManifest;
    expect(manifest.minimum_chrome_version).toBe("106");
    expect(manifest.permissions).toContain("unlimitedStorage");
    expect(manifest.permissions).not.toContain("tabs");
    expect(manifest.permissions).not.toContain("activeTab");
    expect(manifest.permissions).not.toContain("<all_urls>");
  });
});
