import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseNetworkTranscriptDocument } from "@/extension/src/networkTranscriptContract";

describe("NowCoder characterized network fixture", () => {
  it("contains the exact safe E1 -> E2 chain and remains non-certifying", () => {
    const raw: unknown = JSON.parse(readFileSync(
      "tests/fixtures/nowcoder/network/nowcoder-submission-chain-2026-07-28.json",
      "utf8",
    ));
    const parsed = parseNetworkTranscriptDocument(raw);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.value.meta).toMatchObject({
      authenticated: true,
      evidenceTier: "authenticated-characterization",
      productionEligible: false,
    });
    expect(parsed.value.evidence).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: "network_request_observed", method: "POST", normalizedPath: "/nccommon/submit_cd", statusCode: 200 }),
      expect.objectContaining({ kind: "network_request_observed", method: "GET", normalizedPath: "/nccommon/status", statusCode: 200 }),
      expect.objectContaining({ kind: "submission_confirmed", externalSubmissionId: "84257292", problemExternalId: "acm/contest/18839/1001" }),
    ]));
  });
});
