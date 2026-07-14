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
const MISSING_PUBLIC_CONTENT_REASON =
  "No fixture has evidenceTier \"public-content-accessible\"; URL detection evidence is required.";
const MISSING_VERDICT_DOM_REASON =
  "No fixture qualifies as evidenceTier \"verified-public-dom\": production requires at least one fixture with non-null verdictExpected and non-empty selector provenance proving actual public verdict DOM was observed.";

const FixtureCoverageSchema = z
  .object({
    total: z.number().int().nonnegative(),
    publicContentAccessible: z.number().int().nonnegative(),
    verifiedPublicDom: z.number().int().nonnegative(),
    characterizationDerived: z.number().int().nonnegative(),
  })
  .strict();
type FixtureCoverage = z.infer<typeof FixtureCoverageSchema>;

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
const GateVerdictSchema = z.discriminatedUnion("gateVerdict", [
  z
    .object({ gateVerdict: z.literal("CERTIFIED"), blockingReasons: z.array(z.string()).length(0), ...GateSharedShape })
    .strict(),
  z
    .object({ gateVerdict: z.literal("BLOCKED"), blockingReasons: z.array(z.string().min(1)).min(1), ...GateSharedShape })
    .strict(),
]);
type GateVerdict = z.infer<typeof GateVerdictSchema>;

function fixtureCoverage(metadata: readonly FixtureMeta[]): FixtureCoverage {
  return FixtureCoverageSchema.parse({
    total: metadata.length,
    publicContentAccessible: metadata.filter((meta) => meta.evidenceTier === "public-content-accessible").length,
    verifiedPublicDom: metadata.filter(
      (meta) => meta.evidenceTier === "verified-public-dom" && meta.verdictExpected !== null && meta.selectors.length > 0,
    ).length,
    characterizationDerived: metadata.filter((meta) => meta.evidenceTier === "characterization-derived").length,
  });
}

function buildGateVerdict(metadata: readonly FixtureMeta[]): GateVerdict {
  const coverage = fixtureCoverage(metadata);
  const blockingReasons = [
    ...(coverage.publicContentAccessible === 0 ? [MISSING_PUBLIC_CONTENT_REASON] : []),
    ...(coverage.verifiedPublicDom === 0 ? [MISSING_VERDICT_DOM_REASON] : []),
  ];
  return GateVerdictSchema.parse({
    gateVerdict: blockingReasons.length === 0 ? "CERTIFIED" : "BLOCKED",
    blockingReasons,
    fixtureCoverage: coverage,
    fixtureNames: metadata.map((meta) => meta.fixtureName),
    luoguCurrentStatus: getPlatformAdapterStatus("luogu"),
    gateDate: GATE_DATE,
    gateSource: GATE_SOURCE,
  });
}

function parseGateVerdict(raw: string): GateVerdict {
  const parsedJson: unknown = JSON.parse(raw);
  return GateVerdictSchema.parse(parsedJson);
}

const metadata = loadFixtureMetadata(FIXTURES_DIR);
const verdict = buildGateVerdict(metadata);
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
    const coverage = fixtureCoverage(metadata);
    expect(coverage).toEqual(EXPECTED_COVERAGE);
    expect(
      coverage.publicContentAccessible + coverage.verifiedPublicDom + coverage.characterizationDerived,
    ).toBe(coverage.total);
  });

  it("requires public-content URL evidence", () => {
    expect(fixtureCoverage(metadata).publicContentAccessible).toBeGreaterThan(0);
  });

  it("blocks Luogu production and production-list inclusion without public verdict DOM", () => {
    expect(verdict.gateVerdict).toBe("BLOCKED");
    expect(getPlatformAdapterStatus("luogu")).toBe("experimental");
    expect(getProductionPlatforms()).not.toContain("luogu");
  });

  it("writes the deterministic typed BLOCKED artifact", () => {
    const artifact = parseGateVerdict(readFileSync(REPORT_PATH, "utf8"));
    expect(artifact).toEqual(verdict);
    expect(artifact.blockingReasons).toEqual([MISSING_VERDICT_DOM_REASON]);
  });

  it("rejects a stale artifact date", () => {
    const staleArtifact = JSON.stringify({ ...verdict, gateDate: "2026-07-13" });
    expect(GateVerdictSchema.safeParse(JSON.parse(staleArtifact)).success).toBe(false);
  });

  it("rejects corrupt artifact JSON", () => {
    expect(() => parseGateVerdict('{"gateVerdict":"BLOCKED"')).toThrow(SyntaxError);
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
        problemExpected: null,
      },
    ]);
    const syntheticVerdict = buildGateVerdict(syntheticMetadata);
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
});