import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { getPlatformAdapterStatus, getProductionPlatforms } from "@/extension/src/platforms";
import { ADAPTER_VERSION, PARSER_VERSION } from "@/extension/src/attemptCapture";
import { loadFixtureMetadata, loadFixtureNames } from "@/tests/helpers/atcoderFixtureMetadata";
import { computeFixtureCoverage, evaluatePlatformGate } from "@/tests/helpers/platformCertification";
import type { PlatformGateInput } from "@/tests/helpers/platformCertificationContract";
import {
  GATE_DATE, REQUIRED_VERDICTS, GATE_SOURCE, EXPECTED_FIXTURE_NAMES,
  parseAtcoderArtifact, buildDetectorObservations,
} from "@/tests/helpers/atcoderCertificationData";
import {
  atcoderPromotionGuard, requireLiveCertifiedGate,
  buildProductionArtifact, parseLuoguGate, computeSha256Hex,
} from "@/tests/helpers/atcoderPromotion";

const FIXTURES_DIR = join(process.cwd(), "tests", "fixtures", "atcoder");
const T6_GATE_PATH = join(process.cwd(), "work", "reports", "atcoder-certification-gate-verdict.json");
const PRODUCTION_ARTIFACT_PATH = join(process.cwd(), "work", "reports", "atcoder-adapter-certification.json");
const LUOGU_GATE_PATH = join(process.cwd(), "work", "reports", "certification-gate-verdict.json");
const CERTIFICATION_DATE = "2026-07-17";

const T6_RAW = readFileSync(T6_GATE_PATH, "utf8");
const T6_SHA256 = computeSha256Hex(T6_RAW);

// 1. Historical guard (T6 artifact must be CERTIFIED pre-promotion)
const guardResult = atcoderPromotionGuard(T6_RAW);

// 2. Live gate evaluation against production registry
const metadata = loadFixtureMetadata(FIXTURES_DIR);
const detectorObservations = buildDetectorObservations(FIXTURES_DIR);
const gateInput: PlatformGateInput = {
  platform: "atcoder", metadata, requiredVerdicts: [...REQUIRED_VERDICTS],
  gateDate: GATE_DATE, gateSource: GATE_SOURCE, expectedSourceHost: "atcoder.jp",
  requiredSelectorToken: "#judge-status", detectorObservations,
};
const productionEvaluation = evaluatePlatformGate(gateInput);

// 3. Require live certified gate (throws if not CERTIFIED/production/4 matched)
const liveGate = requireLiveCertifiedGate(productionEvaluation);

// 4. Build production artifact (requires both guard + liveGate)
const luoguRaw = readFileSync(LUOGU_GATE_PATH, "utf8");
const luoguGate = parseLuoguGate(luoguRaw);
const productionArtifact = buildProductionArtifact({
  guard: guardResult,
  liveGate,
  atcoderStatus: getPlatformAdapterStatus("atcoder"),
  productionPlatforms: getProductionPlatforms(),
  metadata,
  fixtureCoverage: computeFixtureCoverage(metadata),
  luoguGate,
  luoguRegistryStatus: getPlatformAdapterStatus("luogu"),
  certificationDate: CERTIFICATION_DATE,
});

const t6Artifact = parseAtcoderArtifact(T6_RAW);

// 5. Register beforeAll write only after all guards pass
beforeAll(() => {
  writeFileSync(PRODUCTION_ARTIFACT_PATH, `${JSON.stringify(productionArtifact, null, 2)}\n`, "utf8");
});

describe("AtCoder production promotion", () => {
  it("T6 gate artifact is CERTIFIED, unchanged bytes", () => {
    expect(t6Artifact.gateVerdict).toBe("CERTIFIED");
    expect(t6Artifact.blockingReasons).toEqual([]);
    expect(t6Artifact.detectorEvidence).toHaveLength(4);
    for (const e of t6Artifact.detectorEvidence) {
      expect(e.verdictMatch).toBe(true);
      expect(e.problemMatch).toBe(true);
    }
    expect(computeSha256Hex(T6_RAW)).toBe(T6_SHA256);
    expect(guardResult.sha256).toBe(T6_SHA256);
  });

  it("AtCoder is production, sole production platform, others experimental", () => {
    expect(getPlatformAdapterStatus("atcoder")).toBe("production");
    expect(getProductionPlatforms()).toEqual(["atcoder"]);
    for (const p of ["leetcode", "codeforces", "nowcoder", "luogu"] as const) {
      expect(getPlatformAdapterStatus(p)).toBe("experimental");
    }
  });

  it("live gate is CERTIFIED with production registry and 4 matched evidence", () => {
    expect(liveGate.evaluation.gateVerdict).toBe("CERTIFIED");
    expect(liveGate.evaluation.blockingReasons).toEqual([]);
    expect(liveGate.evaluation.candidateCurrentStatus).toBe("production");
    expect(liveGate.evaluation.detectorEvidence).toHaveLength(4);
    for (const e of liveGate.evaluation.detectorEvidence) {
      expect(e.verdictMatch).toBe(true);
      expect(e.problemMatch).toBe(true);
    }
  });

  it("production artifact is deterministic with trailing newline", () => {
    const onDisk = readFileSync(PRODUCTION_ARTIFACT_PATH, "utf8");
    expect(onDisk).toBe(`${JSON.stringify(productionArtifact, null, 2)}\n`);
    expect(onDisk.endsWith("\n")).toBe(true);
  });

  it("production artifact records derived fields from live data", () => {
    expect(productionArtifact.plan).toContain("T7");
    expect(productionArtifact.candidate).toBe("atcoder");
    expect(productionArtifact.terminalState).toBe("CERTIFIED");
    expect(productionArtifact.liveStatus).toBe("production");
    expect(productionArtifact.adapterVersion).toBe(ADAPTER_VERSION);
    expect(productionArtifact.parserVersion).toBe(PARSER_VERSION);
    expect(productionArtifact.t6GateArtifact.path).toBe("work/reports/atcoder-certification-gate-verdict.json");
    expect(productionArtifact.t6GateArtifact.sha256).toBe(T6_SHA256);
    expect(productionArtifact.certificationDate).toBe(CERTIFICATION_DATE);
  });

  it("production artifact fixture coverage matches computeFixtureCoverage", () => {
    expect(productionArtifact.fixtureCoverage).toEqual(computeFixtureCoverage(metadata));
  });

  it("production artifact source URLs come from metadata with ?lang=en", () => {
    expect(productionArtifact.fixtureSourceUrls).toHaveLength(4);
    const metaByName = new Map(metadata.map((m) => [m.fixtureName, m.sourceUrl]));
    for (const f of productionArtifact.fixtureSourceUrls) {
      expect(metaByName.get(f.fixtureName)).toBe(f.sourceUrl);
      expect(f.sourceUrl).toContain("?lang=en");
    }
  });

  it("production artifact consistency derived from both historical and live gates", () => {
    const c = productionArtifact.consistency;
    expect(c.soleProductionPlatform).toBe(true);
    expect(c.gateCertified).toBe(true);
    expect(c.detectorEvidenceComplete).toBe(true);
    expect(c.luoguNotPromoted).toBe(true);
  });

  it("fixtures: exactly four retained names, metadata tiers 4/1/3/0", () => {
    expect(loadFixtureNames(FIXTURES_DIR)).toEqual(EXPECTED_FIXTURE_NAMES);
    expect(computeFixtureCoverage(metadata)).toEqual({
      total: 4, publicContentAccessible: 1, verifiedPublicDom: 3, characterizationDerived: 0,
    });
  });

  it("verified-public-dom fixtures satisfy host/auth/selector rules", () => {
    for (const m of metadata.filter((m) => m.evidenceTier === "verified-public-dom")) {
      expect(new URL(m.sourceUrl).hostname).toBe("atcoder.jp");
      expect(m.authenticated).toBe(false);
      expect(m.selectors.some((s) => s.includes("#judge-status"))).toBe(true);
    }
  });

  it("Luogu gate is BLOCKED/experimental, never in production", () => {
    expect(luoguGate.gateVerdict).toBe("BLOCKED");
    expect(luoguGate.luoguCurrentStatus).toBe("experimental");
    expect(getProductionPlatforms()).not.toContain("luogu");
  });
});
