import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { evaluatePlatformGate } from "@/tests/helpers/platformCertification";
import type { PlatformGateInput } from "@/tests/helpers/platformCertificationContract";
import { loadFixtureMetadata } from "@/tests/helpers/atcoderFixtureMetadata";
import {
  GATE_DATE, REQUIRED_VERDICTS, GATE_SOURCE,
  buildDetectorObservations,
} from "@/tests/helpers/atcoderCertificationData";
import {
  atcoderPromotionGuard, requireLiveCertifiedGate,
  buildProductionArtifact, parseLuoguGate,
  PromotionGuardRejected,
} from "@/tests/helpers/atcoderPromotion";

const FIXTURES_DIR = join(process.cwd(), "tests", "fixtures", "atcoder");
const REPORT_PATH = join(process.cwd(), "work", "reports", "atcoder-certification-gate-verdict.json");
const PRODUCTION_ARTIFACT_PATH = join(process.cwd(), "work", "reports", "atcoder-adapter-certification.json");
const LUOGU_GATE_PATH = join(process.cwd(), "work", "reports", "certification-gate-verdict.json");
const metadata = loadFixtureMetadata(FIXTURES_DIR);
const validObservations = buildDetectorObservations(FIXTURES_DIR);

function readGateArtifact(): string { return readFileSync(REPORT_PATH, "utf8"); }

function readProductionArtifact(): string {
  return readFileSync(PRODUCTION_ARTIFACT_PATH, "utf8");
}

const T6_RAW = readGateArtifact();

function liveGateInput(): PlatformGateInput {
  return {
    platform: "atcoder", metadata, requiredVerdicts: [...REQUIRED_VERDICTS],
    gateDate: GATE_DATE, gateSource: GATE_SOURCE, expectedSourceHost: "atcoder.jp",
    requiredSelectorToken: "#judge-status", detectorObservations: validObservations,
  };
}

// ---- HISTORICAL GUARD TESTS ----

describe("atcoderPromotionGuard (historical T6)", () => {
  it("passes the real T6 CERTIFIED artifact", () => {
    const result = atcoderPromotionGuard(T6_RAW);
    expect(result.prePromotion.gateVerdict).toBe("CERTIFIED");
    expect(result.prePromotion.atcoderCurrentStatus).toBe("experimental");
    expect(result.sha256.length).toBe(64);
  });

  it("rejects BLOCKED artifact", () => {
    const blocked = T6_RAW.replace('"CERTIFIED"', '"BLOCKED"').replace(
      '"blockingReasons": []', '"blockingReasons": ["test blocking reason"]',
    );
    expect(() => atcoderPromotionGuard(blocked)).toThrow(PromotionGuardRejected);
  });

  it("rejects malformed JSON (wraps SyntaxError as PromotionGuardRejected)", () => {
    expect(() => atcoderPromotionGuard('{"gateVerdict":"CERTIFIED"')).toThrow(PromotionGuardRejected);
  });

  it("rejects artifact with atcoderCurrentStatus already production", () => {
    const forged = T6_RAW.replace(
      '"atcoderCurrentStatus": "experimental"', '"atcoderCurrentStatus": "production"',
    );
    expect(() => atcoderPromotionGuard(forged)).toThrow(PromotionGuardRejected);
  });

  it("rejects artifact with insufficient verifiedPublicDom", () => {
    const forged = T6_RAW.replace('"verifiedPublicDom": 3', '"verifiedPublicDom": 1');
    expect(() => atcoderPromotionGuard(forged)).toThrow(PromotionGuardRejected);
  });

  it("rejects artifact with incomplete detector evidence", () => {
    const forged = T6_RAW.replace(/"detectorEvidence": \[([\s\S]*?)\]/, '"detectorEvidence": []');
    expect(() => atcoderPromotionGuard(forged)).toThrow(PromotionGuardRejected);
  });

  it("rejects CERTIFIED artifact with forged verdictDetected", () => {
    const forged = T6_RAW.replace(
      '"verdictDetected": "Accepted"', '"verdictDetected": "Wrong Answer"',
    );
    expect(() => atcoderPromotionGuard(forged)).toThrow(PromotionGuardRejected);
  });

  it("produces typed PromotionGuardRejected, error must be thrown", () => {
    const blockedBlob = JSON.stringify({
      gateVerdict: "BLOCKED", blockingReasons: ["t"],
      fixtureCoverage: { total: 4, publicContentAccessible: 1, verifiedPublicDom: 3, characterizationDerived: 0 },
      fixtureNames: ["a", "b", "c", "d"], atcoderCurrentStatus: "experimental", gateDate: "2026-07-16",
      gateSource: { planTask: "x", fixtureMetadataGlob: "x", adapterRegistry: "x", dateBasis: "x" },
      detectorEvidence: [
        { fixtureName: "a", verdictExpected: "Accepted", verdictDetected: "Accepted", verdictMatch: true, problemPlatformExpected: "atcoder", problemPlatformDetected: "atcoder", problemExternalIdExpected: "x", problemExternalIdDetected: "x", problemMatch: true },
        { fixtureName: "b", verdictExpected: "Wrong Answer", verdictDetected: "Wrong Answer", verdictMatch: true, problemPlatformExpected: "atcoder", problemPlatformDetected: "atcoder", problemExternalIdExpected: "x", problemExternalIdDetected: "x", problemMatch: true },
        { fixtureName: "c", verdictExpected: "Time Limit Exceeded", verdictDetected: "Time Limit Exceeded", verdictMatch: true, problemPlatformExpected: "atcoder", problemPlatformDetected: "atcoder", problemExternalIdExpected: "x", problemExternalIdDetected: "x", problemMatch: true },
        { fixtureName: "d", verdictExpected: null, verdictDetected: null, verdictMatch: true, problemPlatformExpected: "atcoder", problemPlatformDetected: "atcoder", problemExternalIdExpected: "x", problemExternalIdDetected: "x", problemMatch: true },
      ],
    });
    let caught: unknown = undefined;
    try {
      atcoderPromotionGuard(blockedBlob);
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(PromotionGuardRejected);
    expect(caught).toBeInstanceOf(Error);
    if (caught instanceof Error) {
      expect(typeof caught.message).toBe("string");
    }
  });

  it("never mutates disk T6 gate artifact during failure probes", () => {
    const before = readFileSync(REPORT_PATH, "utf8");
    expect(() => atcoderPromotionGuard(T6_RAW.replace('"CERTIFIED"', '"BLOCKED"').replace(
      '"blockingReasons": []', '"blockingReasons": ["probe"]',
    ))).toThrow();
    expect(readFileSync(REPORT_PATH, "utf8")).toBe(before);
  });
});

// ---- LIVE CERTIFIED GATE TESTS ----

describe("requireLiveCertifiedGate", () => {
  it("passes the real live CERTIFIED evaluation", () => {
    const eval_ = evaluatePlatformGate(liveGateInput());
    const live = requireLiveCertifiedGate(eval_);
    expect(live.evaluation.gateVerdict).toBe("CERTIFIED");
    expect(live.evaluation.candidateCurrentStatus).toBe("production");
  });

  it("rejects when live gate candidate status is not production", () => {
    const liveEval = evaluatePlatformGate(liveGateInput());
    const experimentalEval = { ...liveEval, candidateCurrentStatus: "experimental" as const };
    expect(() => requireLiveCertifiedGate(experimentalEval)).toThrow(PromotionGuardRejected);
  });

  it("rejects when live gate detector evidence mismatches", () => {
    const wrongObs = validObservations.map((o) =>
      o.fixtureName === "submission-agc040-d-ac"
        ? { ...o, verdictDetected: "Wrong Answer" }
        : o,
    );
    const input: PlatformGateInput = {
      platform: "atcoder", metadata, requiredVerdicts: [...REQUIRED_VERDICTS],
      gateDate: GATE_DATE, gateSource: GATE_SOURCE, expectedSourceHost: "atcoder.jp",
      requiredSelectorToken: "#judge-status", detectorObservations: wrongObs,
    };
    const eval_ = evaluatePlatformGate(input);
    expect(() => requireLiveCertifiedGate(eval_)).toThrow(PromotionGuardRejected);
  });
});

// ---- BUILDER + SPOOF TESTS ----

describe("buildProductionArtifact guard + spoof rejection", () => {
  const guardResult = atcoderPromotionGuard(T6_RAW);
  const liveEval = evaluatePlatformGate(liveGateInput());
  const liveGate = requireLiveCertifiedGate(liveEval);
  const luoguRaw = readFileSync(LUOGU_GATE_PATH, "utf8");
  const luoguGate = parseLuoguGate(luoguRaw);

  it("builds successfully with valid guard + live gate", () => {
    const artifact = buildProductionArtifact({
      guard: guardResult,
      liveGate,
      atcoderStatus: "production",
      productionPlatforms: ["atcoder"],
      metadata,
      fixtureCoverage: { total: 4, publicContentAccessible: 1, verifiedPublicDom: 3, characterizationDerived: 0 },
      luoguGate,
      luoguRegistryStatus: "experimental",
      certificationDate: "2026-07-17",
    });
    expect(artifact.terminalState).toBe("CERTIFIED");
  });

  it("rejects build with spoof metadata URL (schema rejects changed URL)", () => {
    const spoofMeta = metadata.map((m) =>
      m.fixtureName === "submission-abc164-e-wa"
        ? { ...m, sourceUrl: "https://atcoder.jp/contests/abc164/submissions/99999999?lang=en" }
        : m,
    );
    expect(() => buildProductionArtifact({
      guard: guardResult, liveGate,
      atcoderStatus: "production",
      productionPlatforms: ["atcoder"],
      metadata: spoofMeta,
      fixtureCoverage: { total: 4, publicContentAccessible: 1, verifiedPublicDom: 3, characterizationDerived: 0 },
      luoguGate, luoguRegistryStatus: "experimental",
      certificationDate: "2026-07-17",
    })).toThrow(z.ZodError);
  });

  it("rejects build with spoof host URL", () => {
    const spoofMeta = metadata.map((m) =>
      m.fixtureName === "task-agc040-d"
        ? { ...m, sourceUrl: "https://evil.example/contests/agc040/tasks/agc040_d?lang=en" }
        : m,
    );
    expect(() => buildProductionArtifact({
      guard: guardResult, liveGate,
      atcoderStatus: "production",
      productionPlatforms: ["atcoder"],
      metadata: spoofMeta,
      fixtureCoverage: { total: 4, publicContentAccessible: 1, verifiedPublicDom: 3, characterizationDerived: 0 },
      luoguGate, luoguRegistryStatus: "experimental",
      certificationDate: "2026-07-17",
    })).toThrow(z.ZodError);
  });

  it("production artifact bytes unchanged after historical T6 valid + live BLOCKED throws before build", () => {
    const before = readProductionArtifact();
    const blockedEval = { ...liveEval, gateVerdict: "BLOCKED" as const, blockingReasons: ["probe"] };
    expect(() => requireLiveCertifiedGate(blockedEval)).toThrow(PromotionGuardRejected);
    // Production artifact must remain byte-identical — no write occurred
    expect(readProductionArtifact()).toBe(before);
  });
});
