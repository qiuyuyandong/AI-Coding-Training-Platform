import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { validateNowCoderAdapterDesign } from "@/scripts/validate-v4-nowcoder-adapter-design.mjs";

const designPath = "docs/superpowers/specs/2026-07-24-v4-nowcoder-network-adapter-design.md";

describe("NowCoder B5 adapter design validator", () => {
  it("accepts the evidence-backed design", () => {
    expect(validateNowCoderAdapterDesign(readFileSync(designPath, "utf8"))).toEqual({ ok: true });
  });

  it.each([
    "POST /nccommon/submit_cd",
    "GET /nccommon/status",
    "## Business-success predicate",
    "## Stable ID extractor",
    "## Correlator window",
    "## Final-verdict identity rule",
    "## Retained safe fields",
    "## Fail-closed cases",
    "## Known unknowns",
    "no nearest-request fallback",
    "remain forbidden",
  ])("rejects a design missing %s", (marker) => {
    const valid = readFileSync(designPath, "utf8");
    const result = validateNowCoderAdapterDesign(valid.replace(marker, ""));
    expect(result.ok).toBe(false);
  });
});
