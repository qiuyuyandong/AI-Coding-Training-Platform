import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { z } from "zod";
import { beforeAll, describe, expect, it } from "vitest";
import { getPlatformAdapterStatus, getProductionPlatforms } from "@/extension/src/platforms";
import {
  EVIDENCE_TIERS,
  FixtureMetaSchema,
  type FixtureMeta,
  loadFixtureMetadata,
  loadFixtureNames,
} from "@/tests/helpers/luoguFixtureMetadata";
import {
  computeFixtureCoverage,
  evaluatePlatformGate,
  FixtureCoverageSchema,
  REASON_MISSING_PUBLIC_CONTENT,
  REASON_MISSING_VERIFIED_DOM,
} from "@/tests/helpers/platformCertification";

const FIXTURES_DIR = join(process.cwd(), "tests", "fixtures", "luogu");
const REPORT_PATH = join(process.cwd(), "work", "reports", "certification-gate-verdict.json");
const GATE_DATE = "2026-07-14" as const;
const EXPECTED_FIXTURE_NAMES = [
  "no-verdict-problem",
  "problem-b3619",
  "problem-cf-1a",
  "problem-p1001",
] as const;
const EXPECTED_COVERAGE = {
  total: 4,
  publicContentAccessible: 3,
  verifiedPublicDom: 0,
  characterizationDerived: 1,
} as const;
const GATE_SOURCE = {
  planTask: "docs/superpowers/plans/2026-07-14-phase-0b4-luogu-adapter-certification.md#Task-3",
  fixtureMetadataGlob: "tests/fixtures/luogu/*.meta.json",
  adapterRegistry: "extension/src/platforms.ts",
  dateBasis: "fixture metadata captureDate",
} as const;

// Luogu-specific artifact schema (preserved byte-identical)
const GateSharedShape = {
  fixtureCoverage: FixtureCoverageSchema,
  fixtureNames: z.array(z.string().min(1)),
  luoguCurrentStatus: z.enum(["production", "experimental", "disabled"]),
  gateDate: z.literal(GATE_DATE),
  gateSource: z
    .object({
      planTask: z.literal(GATE_SOURCE.planTask),
      fixtureMetadataGlob: z.literal(GATE_SOURCE.fixtureMetadataGlob),
      adapterRegistry: z.literal(GATE_SOURCE.adapterRegistry),
      dateBasis: z.literal(GATE_SOURCE.dateBasis),
    })
    .strict(),
} as const;
const LuoguGateVerdictSchema = z.discriminatedUnion("gateVerdict", [
  z
    .object({ gateVerdict: z.literal("CERTIFIED"), blockingReasons: z.array(z.string()).length(0), ...GateSharedShape })
    .strict(),
  z
    .object({ gateVerdict: z.literal("BLOCKED"), blockingReasons: z.array(z.string().min(1)).min(1), ...GateSharedShape })
    .strict(),
]);
type LuoguGateVerdict = z.infer<typeof LuoguGateVerdictSchema>;

function buildLuoguGateVerdict(metadata: readonly FixtureMeta[]): LuoguGateVerdict {
  const evaluation = evaluatePlatformGate({
    platform: "luogu",
    metadata,
    requiredVerdicts: [],
    gateDate: GATE_DATE,
    gateSource: GATE_SOURCE,
    expectedSourceHost: "www.luogu.com.cn",
    requiredSelectorToken: ".status",
    detectorObservations: [],
  });
  return LuoguGateVerdictSchema.parse({
    gateVerdict: evaluation.gateVerdict,
    blockingReasons: evaluation.blockingReasons,
    fixtureCoverage: evaluation.fixtureCoverage,
    fixtureNames: evaluation.fixtureNames,
    luoguCurrentStatus: evaluation.candidateCurrentStatus,
    gateDate: GATE_DATE,
    gateSource: GATE_SOURCE,
  });
}

function parseLuoguGateVerdict(raw: string): LuoguGateVerdict {
  const parsedJson: unknown = JSON.parse(raw);
  return LuoguGateVerdictSchema.parse(parsedJson);
}

const metadata = loadFixtureMetadata(FIXTURES_DIR);
const verdict = buildLuoguGateVerdict(metadata);
const ARTIFACT_TEXT = `${JSON.stringify(verdict, null, 2)}\n`;

const MALFORMED_BASE = {
  fixtureName: "probe",
  sourceUrl: "https://www.luogu.com.cn/problem/P1001",
  captureDate: GATE_DATE,
  captureMethod: "test probe",
  purpose: "detectProblemFromLocation",
  selectors: [],
  authenticated: false,
  sanitized: true,
  evidenceTier: "public-content-accessible",
  verdictExpected: null,
  problemExpected: { platform: "luogu", externalId: "P1001" },
} as const;
const MALFORMED_METADATA = [
  { name: "unknown evidence tier", value: { ...MALFORMED_BASE, evidenceTier: "speculative" } },
  {
    name: "verified tier without verdict",
    value: { ...MALFORMED_BASE, evidenceTier: "verified-public-dom", selectors: [".status"] },
  },
  {
    name: "verified tier without selector provenance",
    value: { ...MALFORMED_BASE, evidenceTier: "verified-public-dom", verdictExpected: { verdict: "Accepted" } },
  },
  { name: "public-content tier smuggling a verdict", value: { ...MALFORMED_BASE, verdictExpected: { verdict: "Accepted" } } },
] as const;
const EXPECTED_TIERS = EVIDENCE_TIERS;

beforeAll(() => {
  mkdirSync(dirname(REPORT_PATH), { recursive: true });
  writeFileSync(REPORT_PATH, ARTIFACT_TEXT, "utf8");
});

describe("Luogu platform certification gate", () => {
  it("pins every metadata fixture in deterministic name order", () => {
    expect(metadata.map((meta) => meta.fixtureName)).toEqual(EXPECTED_FIXTURE_NAMES);
    expect(metadata.map((meta) => meta.captureDate)).toEqual(EXPECTED_FIXTURE_NAMES.map(() => GATE_DATE));
  });

  it.each(MALFORMED_METADATA)("rejects malformed metadata: $name", ({ value }) => {
    expect(FixtureMetaSchema.safeParse(value).success).toBe(false);
  });

  it("categorizes all metadata exactly once with qualified verdict evidence", () => {
    const coverage = computeFixtureCoverage(metadata);
    expect(coverage).toEqual(EXPECTED_COVERAGE);
    expect(
      coverage.publicContentAccessible + coverage.verifiedPublicDom + coverage.characterizationDerived,
    ).toBe(coverage.total);
  });

  it("requires public-content URL evidence", () => {
    expect(computeFixtureCoverage(metadata).publicContentAccessible).toBeGreaterThan(0);
  });

  it("blocks Luogu production and production-list inclusion without public verdict DOM", () => {
    expect(verdict.gateVerdict).toBe("BLOCKED");
    expect(getPlatformAdapterStatus("luogu")).toBe("experimental");
    expect(getProductionPlatforms()).not.toContain("luogu");
  });

  it("writes the deterministic typed BLOCKED artifact", () => {
    const artifact = parseLuoguGateVerdict(readFileSync(REPORT_PATH, "utf8"));
    expect(artifact).toEqual(verdict);
    expect(artifact.blockingReasons).toEqual([REASON_MISSING_VERIFIED_DOM]);
  });

  it("rejects a stale artifact date", () => {
    const staleArtifact = JSON.stringify({ ...verdict, gateDate: "2026-07-13" });
    expect(LuoguGateVerdictSchema.safeParse(JSON.parse(staleArtifact)).success).toBe(false);
  });

  it("rejects corrupt artifact JSON", () => {
    expect(() => parseLuoguGateVerdict('{"gateVerdict":"BLOCKED"')).toThrow(SyntaxError);
  });

  it("would CERTIFY for synthetic in-memory verified-public-dom evidence without promoting Luogu", () => {
    const syntheticMetadata: readonly FixtureMeta[] = FixtureMetaSchema.array().parse([
      {
        fixtureName: "synth-public-content-p1001",
        sourceUrl: "https://www.luogu.com.cn/problem/P1001",
        captureDate: GATE_DATE,
        captureMethod: "synthetic in-memory probe",
        purpose: "detectProblemFromLocation",
        selectors: [],
        authenticated: false,
        sanitized: true,
        evidenceTier: "public-content-accessible",
        verdictExpected: null,
        problemExpected: { platform: "luogu", externalId: "P1001" },
      },
      {
        fixtureName: "synth-verified-public-dom-accepted",
        sourceUrl: "https://www.luogu.com.cn/record/example",
        captureDate: GATE_DATE,
        captureMethod: "synthetic in-memory probe",
        purpose: "detectVerdictFromDocument",
        selectors: [".status"],
        authenticated: false,
        sanitized: true,
        evidenceTier: "verified-public-dom",
        verdictExpected: { verdict: "Accepted" },
        problemExpected: { platform: "luogu", externalId: "P1001" },
      },
    ]);
    const syntheticObs = [
      { fixtureName: "synth-public-content-p1001", verdictDetected: null, problemPlatformDetected: "luogu", problemExternalIdDetected: "P1001" },
      { fixtureName: "synth-verified-public-dom-accepted", verdictDetected: "Accepted", problemPlatformDetected: "luogu", problemExternalIdDetected: "P1001" },
    ];
    const syntheticEvaluation = evaluatePlatformGate({
      platform: "luogu",
      metadata: syntheticMetadata,
      requiredVerdicts: [],
      gateDate: GATE_DATE,
      gateSource: GATE_SOURCE,
      expectedSourceHost: "www.luogu.com.cn",
      requiredSelectorToken: ".status",
      detectorObservations: syntheticObs,
    });
    const syntheticVerdict = LuoguGateVerdictSchema.parse({
      gateVerdict: syntheticEvaluation.gateVerdict,
      blockingReasons: syntheticEvaluation.blockingReasons,
      fixtureCoverage: syntheticEvaluation.fixtureCoverage,
      fixtureNames: syntheticEvaluation.fixtureNames,
      luoguCurrentStatus: syntheticEvaluation.candidateCurrentStatus,
      gateDate: GATE_DATE,
      gateSource: GATE_SOURCE,
    });
    expect(syntheticVerdict.gateVerdict).toBe("CERTIFIED");
    expect(syntheticVerdict.blockingReasons).toEqual([]);
    expect(syntheticVerdict.fixtureCoverage.verifiedPublicDom).toBeGreaterThanOrEqual(1);
    expect(loadFixtureNames(FIXTURES_DIR)).not.toContain("synth-public-content-p1001");
    expect(loadFixtureNames(FIXTURES_DIR)).not.toContain("synth-verified-public-dom-accepted");
    expect(getPlatformAdapterStatus("luogu")).toBe("experimental");
    expect(getProductionPlatforms()).not.toContain("luogu");
    expect(readFileSync(REPORT_PATH, "utf8")).toBe(ARTIFACT_TEXT);
  });

  it("exposes the canonical evidence-tier taxonomy", () => {
    expect(EXPECTED_TIERS).toEqual(["public-content-accessible", "verified-public-dom", "characterization-derived"]);
  });

  // Verify shared evaluator reason constants are used
  it("uses shared evaluator reason constants for consistency", () => {
    expect(REASON_MISSING_PUBLIC_CONTENT).toBe(
      'No fixture has evidenceTier "public-content-accessible"; URL detection evidence is required.',
    );
    expect(REASON_MISSING_VERIFIED_DOM).toContain("verified-public-dom");
  });
});
