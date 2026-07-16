import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { getPlatformAdapterStatus, getProductionPlatforms } from "@/extension/src/platforms";
import { loadFixtureMetadata, loadFixtureNames } from "@/tests/helpers/atcoderFixtureMetadata";
import { computeFixtureCoverage, evaluatePlatformGate } from "@/tests/helpers/platformCertification";
import type { PlatformGateInput } from "@/tests/helpers/platformCertificationContract";
import {
  GATE_DATE,
  REQUIRED_VERDICTS,
  GATE_SOURCE,
  EXPECTED_FIXTURE_NAMES,
  AtcoderGateArtifactSchema,
  type AtcoderGateArtifact,
  parseAtcoderArtifact,
  buildDetectorObservations,
} from "@/tests/helpers/atcoderCertificationData";

const FIXTURES_DIR = join(process.cwd(), "tests", "fixtures", "atcoder");
const REPORT_PATH = join(process.cwd(), "work", "reports", "atcoder-certification-gate-verdict.json");
const detectorObservations = buildDetectorObservations(FIXTURES_DIR);
const metadata = loadFixtureMetadata(FIXTURES_DIR);

const gateInput: PlatformGateInput = {
  platform: "atcoder",
  metadata,
  requiredVerdicts: [...REQUIRED_VERDICTS],
  gateDate: GATE_DATE,
  gateSource: GATE_SOURCE,
  expectedSourceHost: "atcoder.jp",
  requiredSelectorToken: "#judge-status",
  detectorObservations,
};

const evaluation = evaluatePlatformGate(gateInput);
const ARTIFACT: AtcoderGateArtifact = AtcoderGateArtifactSchema.parse({
  gateVerdict: evaluation.gateVerdict,
  blockingReasons: evaluation.blockingReasons,
  fixtureCoverage: evaluation.fixtureCoverage,
  fixtureNames: evaluation.fixtureNames,
  atcoderCurrentStatus: evaluation.candidateCurrentStatus,
  gateDate: GATE_DATE,
  gateSource: GATE_SOURCE,
  detectorEvidence: evaluation.detectorEvidence,
});
const ARTIFACT_TEXT = `${JSON.stringify(ARTIFACT, null, 2)}\n`;

beforeAll(() => {
  mkdirSync(dirname(REPORT_PATH), { recursive: true });
  writeFileSync(REPORT_PATH, ARTIFACT_TEXT, "utf8");
});

describe("AtCoder platform certification gate", () => {
  it("exposes precisely the four retained fixture names", () => {
    expect(loadFixtureNames(FIXTURES_DIR)).toEqual(EXPECTED_FIXTURE_NAMES);
  });

  it("categorizes all metadata exactly once with correct evidence tiers", () => {
    const c = computeFixtureCoverage(metadata);
    expect(c.total).toBe(4);
    expect(c.publicContentAccessible).toBe(1);
    expect(c.verifiedPublicDom).toBe(3);
    expect(c.characterizationDerived).toBe(0);
  });

  it("verified-public-dom fixtures all satisfy host/auth/selector rules", () => {
    for (const m of metadata.filter((m) => m.evidenceTier === "verified-public-dom")) {
      expect(new URL(m.sourceUrl).hostname).toBe("atcoder.jp");
      expect(m.authenticated).toBe(false);
      expect(m.selectors.some((s) => s.includes("#judge-status"))).toBe(true);
    }
  });

  it("returns CERTIFIED with four evidence entries, all matches true", () => {
    expect(evaluation.gateVerdict).toBe("CERTIFIED");
    expect(evaluation.blockingReasons).toEqual([]);
    expect(evaluation.detectorEvidence).toHaveLength(4);
    for (const e of evaluation.detectorEvidence) {
      expect(e.verdictMatch).toBe(true);
      expect(e.problemMatch).toBe(true);
    }
  });

  it("keeps AtCoder experimental", () => {
    expect(getPlatformAdapterStatus("atcoder")).toBe("experimental");
    expect(getProductionPlatforms()).not.toContain("atcoder");
  });

  it("writes the deterministic CERTIFIED artifact", () => {
    const art = parseAtcoderArtifact(readFileSync(REPORT_PATH, "utf8"));
    expect(art).toEqual(ARTIFACT);
  });

  it("rejects stale artifact date", () => {
    const stale = { ...parseAtcoderArtifact(readFileSync(REPORT_PATH, "utf8")), gateDate: "2026-07-15" };
    expect(AtcoderGateArtifactSchema.safeParse(stale).success).toBe(false);
  });

  it("rejects corrupt artifact JSON", () => {
    expect(() => parseAtcoderArtifact('{"gateVerdict":"CERTIFIED"')).toThrow(SyntaxError);
  });

  it("rejects CERTIFIED artifact with forged fixtureCoverage", () => {
    const parsed = parseAtcoderArtifact(readFileSync(REPORT_PATH, "utf8"));
    const forged = {
      ...parsed,
      fixtureCoverage: { total: 3, publicContentAccessible: 0, verifiedPublicDom: 3, characterizationDerived: 0 },
    };
    expect(AtcoderGateArtifactSchema.safeParse(forged).success).toBe(false);
  });

  it("rejects CERTIFIED artifact with forged atcoderCurrentStatus", () => {
    const parsed = parseAtcoderArtifact(readFileSync(REPORT_PATH, "utf8"));
    const forged = { ...parsed, atcoderCurrentStatus: "production" };
    expect(AtcoderGateArtifactSchema.safeParse(forged).success).toBe(false);
  });

  it("rejects CERTIFIED artifact with a forged verdictDetected (Accepted→Wrong Answer)", () => {
    const parsed = parseAtcoderArtifact(readFileSync(REPORT_PATH, "utf8"));
    const ev = [...parsed.detectorEvidence];
    ev[2] = { ...ev[2], verdictDetected: "Wrong Answer" };
    expect(AtcoderGateArtifactSchema.safeParse({ ...parsed, detectorEvidence: ev }).success).toBe(false);
  });
});
