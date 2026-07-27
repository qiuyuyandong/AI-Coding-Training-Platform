import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { parseNetworkTranscriptDocument } from "@/extension/src/networkTranscriptContract";

const fixturePath = resolve("tests/fixtures/nowcoder/network/nowcoder-browse-only-2026-07-27.json");

describe("NowCoder B3 browse-only fixture", () => {
  it("contains the authenticated list-to-problem E0 pair and no network or submission evidence", () => {
    const fixture: unknown = JSON.parse(readFileSync(fixturePath, "utf8"));
    const parsed = parseNetworkTranscriptDocument(fixture);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.value.meta).toMatchObject({
      authenticated: true,
      productionEligible: false,
      signals: [{ kind: "navigation_witness", platform: "nowcoder", tier: "E0" }],
    });
    expect(parsed.value.evidence).toMatchObject([
      { pageClass: "contest_list", frameId: 0, relativeTimingOrder: 0 },
      { pageClass: "contest_problem", frameId: 0, relativeTimingOrder: 1 },
    ]);
    expect(parsed.value.evidence).toHaveLength(2);
  });
});
