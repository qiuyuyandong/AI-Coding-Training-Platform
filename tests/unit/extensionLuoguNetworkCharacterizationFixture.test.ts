import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseNetworkTranscriptDocument } from "@/extension/src/networkTranscriptContract";

const fixturePath = "tests/fixtures/luogu/network/luogu-characterization-2026-08-02.json";

describe("Luogu C4 characterized network fixture", () => {
  it("contains only the safe P1001 submit lifecycle and cannot create E2", () => {
    const raw: unknown = JSON.parse(readFileSync(fixturePath, "utf8"));
    const parsed = parseNetworkTranscriptDocument(raw);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;

    expect(parsed.value.meta).toMatchObject({
      fixtureName: "luogu-characterization-2026-08-02",
      authenticated: true,
      sanitized: true,
      evidenceTier: "authenticated-characterization",
      productionEligible: false,
    });
    expect(parsed.value.evidence).toHaveLength(3);
    expect(parsed.value.evidence).toEqual(expect.arrayContaining([
      expect.objectContaining({
        platform: "luogu",
        tier: "E1",
        kind: "network_request_observed",
        requestId: "8116",
        method: "POST",
        normalizedPath: "/fe/api/problem/submit/P1001",
        resourceType: "xmlhttprequest",
        statusCode: 200,
      }),
    ]));
    for (const evidence of parsed.value.evidence) {
      expect(evidence).toMatchObject({
        platform: "luogu",
        tier: "E1",
        kind: "network_request_observed",
        requestId: "8116",
        documentId: "0B0F2A7605D410D910DF94BF4E01ADAE",
        normalizedPath: "/fe/api/problem/submit/P1001",
      });
    }
    expect(JSON.stringify(parsed.value)).not.toContain("submission_confirmed");
    expect(JSON.stringify(parsed.value)).not.toContain("290292547");
  });
});
