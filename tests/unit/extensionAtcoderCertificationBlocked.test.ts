import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { type FixtureMeta, loadFixtureMetadata } from "@/tests/helpers/atcoderFixtureMetadata";
import {
  evaluatePlatformGate,
  REASON_MISSING_VERIFIED_DOM,
  reasonMissingRequiredVerdict,
  reasonMissingDetectorObservation,
  reasonUnknownDetectorObservation,
  reasonDuplicateDetectorObservation,
  reasonDetectorObservationsEmpty,
  reasonNoPublicTaskIdentity,
  reasonDuplicateMetadataName,
} from "@/tests/helpers/platformCertification";
import type { DetectorObservation, PlatformGateInput } from "@/tests/helpers/platformCertificationContract";
import {
  GATE_DATE,
  REQUIRED_VERDICTS,
  GATE_SOURCE,
  AtcoderGateArtifactSchema,
  parseAtcoderArtifact,
  buildDetectorObservations,
} from "@/tests/helpers/atcoderCertificationData";

const FIXTURES_DIR = join(process.cwd(), "tests", "fixtures", "atcoder");
const REPORT_PATH = join(process.cwd(), "work", "reports", "atcoder-certification-gate-verdict.json");
const metadata = loadFixtureMetadata(FIXTURES_DIR);
const validObservations = buildDetectorObservations(FIXTURES_DIR);

function readArtifact(): string { return readFileSync(REPORT_PATH, "utf8"); }

function baseInput(overrides?: {
  metadata?: readonly FixtureMeta[];
  detectorObservations?: readonly DetectorObservation[];
}): PlatformGateInput {
  return {
    platform: "atcoder",
    metadata: overrides?.metadata ?? metadata,
    requiredVerdicts: [...REQUIRED_VERDICTS],
    gateDate: GATE_DATE,
    gateSource: GATE_SOURCE,
    expectedSourceHost: "atcoder.jp",
    requiredSelectorToken: "#judge-status",
    detectorObservations: overrides?.detectorObservations ?? validObservations,
  };
}

const EMPTY_OBS: readonly DetectorObservation[] = [];

function mutObs(obs: readonly DetectorObservation[], name: string, patch: Partial<DetectorObservation>): DetectorObservation[] {
  return obs.map((o) => (o.fixtureName === name ? { ...o, ...patch } : o));
}

describe("AtCoder Oracle blocker regressions", () => {
  it("BLOCKED when detector observations are empty", () => {
    const r = evaluatePlatformGate(baseInput({ detectorObservations: EMPTY_OBS }));
    expect(r.gateVerdict).toBe("BLOCKED");
    expect(r.blockingReasons).toContain(reasonDetectorObservationsEmpty());
  });

  it("BLOCKED when a required observation is missing (AC only)", () => {
    const r = evaluatePlatformGate(baseInput({ detectorObservations: validObservations.filter((o) => o.fixtureName === "submission-agc040-d-ac") }));
    expect(r.gateVerdict).toBe("BLOCKED");
    for (const n of ["submission-abc164-e-wa", "submission-abc443-d-tle", "task-agc040-d"]) {
      expect(r.blockingReasons).toContain(reasonMissingDetectorObservation(n));
    }
  });

  it("BLOCKED when verdictDetected contradicts expected", () => {
    const r = evaluatePlatformGate(baseInput({ detectorObservations: mutObs(validObservations, "submission-agc040-d-ac", { verdictDetected: "Wrong Answer" }) }));
    expect(r.gateVerdict).toBe("BLOCKED");
    expect(r.blockingReasons.some((s) => s.includes("detector verdict mismatch"))).toBe(true);
  });

  it("BLOCKED when duplicate fixture names in observations", () => {
    const r = evaluatePlatformGate(baseInput({ detectorObservations: [...validObservations, validObservations[0]] }));
    expect(r.gateVerdict).toBe("BLOCKED");
    expect(r.blockingReasons).toContain(reasonDuplicateDetectorObservation(validObservations[0].fixtureName));
  });

  it("BLOCKED when unknown fixture name in observations", () => {
    const unk: DetectorObservation = { fixtureName: "nonexistent-fixture", verdictDetected: null, problemPlatformDetected: null, problemExternalIdDetected: null };
    const r = evaluatePlatformGate(baseInput({ detectorObservations: [unk] }));
    expect(r.gateVerdict).toBe("BLOCKED");
    expect(r.blockingReasons).toContain(reasonUnknownDetectorObservation("nonexistent-fixture"));
  });

  it("BLOCKED when task fixture has null detected problem identity", () => {
    const r = evaluatePlatformGate(baseInput({ detectorObservations: mutObs(validObservations, "task-agc040-d", { problemPlatformDetected: null, problemExternalIdDetected: null }) }));
    expect(r.gateVerdict).toBe("BLOCKED");
    expect(r.blockingReasons.some((s) => s.includes("detected problemPlatformDetected is null"))).toBe(true);
  });

  // Table-driven identity mutations across all four retained fixtures
  const IDENTITY_FIXTURES = ["submission-abc164-e-wa", "submission-abc443-d-tle", "submission-agc040-d-ac", "task-agc040-d"] as const;
  type IdFix = (typeof IDENTITY_FIXTURES)[number];

  const ID_MUTATIONS: { label: string; patch: Partial<DetectorObservation>; match: string }[] = [
    { label: "null platform", patch: { problemPlatformDetected: null }, match: "detected problemPlatformDetected is null" },
    { label: "wrong platform", patch: { problemPlatformDetected: "luogu" }, match: "problemPlatformDetected" },
    { label: "null external ID", patch: { problemExternalIdDetected: null }, match: "detected problemExternalIdDetected is null" },
    { label: "wrong external ID", patch: { problemExternalIdDetected: "xxx_wrong" }, match: "problemExternalIdDetected" },
  ];

  it.each(
    IDENTITY_FIXTURES.flatMap((name: IdFix) => ID_MUTATIONS.map((mut) => [name, mut] as const)),
  )("BLOCKED when [%s] has [%s]", (name, mut) => {
    const r = evaluatePlatformGate(baseInput({ detectorObservations: mutObs(validObservations, name, mut.patch) }));
    expect(r.gateVerdict).toBe("BLOCKED");
    expect(r.blockingReasons.some((s) => s.includes(mut.match))).toBe(true);
    expect(readArtifact()).toBeTruthy();
  });

  // Public task host/auth regressions (RED → GREEN)
  it("BLOCKED when public task fixture has wrong source host", () => {
    const altHost = metadata.map((m) =>
      m.fixtureName === "task-agc040-d" ? { ...m, sourceUrl: "https://fake.example/tasks/agc040_d" } : m,
    );
    const r = evaluatePlatformGate(baseInput({ metadata: altHost }));
    expect(r.gateVerdict).toBe("BLOCKED");
    expect(r.blockingReasons.some((s) => s.includes("task-agc040-d") && s.includes("does not match expected host"))).toBe(true);
  });

  it("BLOCKED when public task fixture is marked authenticated", () => {
    const altAuth = metadata.map((m) =>
      m.fixtureName === "task-agc040-d" ? { ...m, authenticated: true } : m,
    );
    const r = evaluatePlatformGate(baseInput({ metadata: altAuth }));
    expect(r.gateVerdict).toBe("BLOCKED");
    expect(r.blockingReasons.some((s) => s.includes("task-agc040-d") && s.includes("is marked authenticated"))).toBe(true);
  });

  it("BLOCKED when duplicate metadata fixture names", () => {
    const dupMeta: FixtureMeta[] = [...metadata, metadata[0]];
    const r = evaluatePlatformGate(baseInput({ metadata: dupMeta }));
    expect(r.gateVerdict).toBe("BLOCKED");
    expect(r.blockingReasons).toContain(reasonDuplicateMetadataName(metadata[0].fixtureName));
  });

  it("BLOCKED when task fixture verdict is non-null", () => {
    const r = evaluatePlatformGate(baseInput({ detectorObservations: mutObs(validObservations, "task-agc040-d", { verdictDetected: "Accepted" }) }));
    expect(r.gateVerdict).toBe("BLOCKED");
    expect(r.blockingReasons.some((s) => s.includes("public-content-accessible but detector returned non-null verdict"))).toBe(true);
  });

  it("rejects CERTIFIED artifact with forged fixtureCoverage", () => {
    const art = parseAtcoderArtifact(readArtifact());
    const forged = { ...art, fixtureCoverage: { total: 3, publicContentAccessible: 0, verifiedPublicDom: 3, characterizationDerived: 0 } };
    expect(AtcoderGateArtifactSchema.safeParse(forged).success).toBe(false);
  });

  it("rejects CERTIFIED artifact with forged atcoderCurrentStatus", () => {
    const art = parseAtcoderArtifact(readArtifact());
    const forged = { ...art, atcoderCurrentStatus: "production" };
    expect(AtcoderGateArtifactSchema.safeParse(forged).success).toBe(false);
  });
});

describe("AtCoder BLOCKED paths (in-memory, never alter disk)", () => {
  it("BLOCKED when missing required verdict — WA metadata removed", () => {
    const noWa = metadata.filter((m) => m.verdictExpected?.verdict !== "Wrong Answer");
    const noWaObs = validObservations.filter((o) => o.fixtureName !== "submission-abc164-e-wa");
    const r = evaluatePlatformGate(baseInput({ metadata: noWa, detectorObservations: noWaObs }));
    expect(r.gateVerdict).toBe("BLOCKED");
    expect(r.blockingReasons).toContain(reasonMissingRequiredVerdict("Wrong Answer"));
    expect(readArtifact()).toBeTruthy();
  });

  it("BLOCKED when authenticated evidence", () => {
    const alt = metadata.map((m) => m.evidenceTier === "verified-public-dom" ? { ...m, authenticated: true } : m);
    const r = evaluatePlatformGate(baseInput({ metadata: alt }));
    expect(r.gateVerdict).toBe("BLOCKED");
    expect(r.blockingReasons.some((s) => s.includes("is marked authenticated"))).toBe(true);
  });

  it("BLOCKED when source host is wrong", () => {
    const alt = metadata.map((m) => m.evidenceTier !== "verified-public-dom" ? m : { ...m, sourceUrl: m.sourceUrl.replace("atcoder.jp", "fake.example") });
    const r = evaluatePlatformGate(baseInput({ metadata: alt }));
    expect(r.gateVerdict).toBe("BLOCKED");
    expect(r.blockingReasons.some((s) => s.includes("does not match expected host"))).toBe(true);
  });

  it("BLOCKED when selectors missing #judge-status", () => {
    const alt = metadata.map((m) => m.evidenceTier === "verified-public-dom" ? { ...m, selectors: [".other"] } : m);
    const r = evaluatePlatformGate(baseInput({ metadata: alt }));
    expect(r.gateVerdict).toBe("BLOCKED");
    expect(r.blockingReasons.some((s) => s.includes("#judge-status"))).toBe(true);
  });

  it("BLOCKED when no verified-public-dom fixtures", () => {
    const onlyPublic = metadata.filter((m) => m.evidenceTier === "public-content-accessible");
    const r = evaluatePlatformGate(baseInput({ metadata: onlyPublic, detectorObservations: validObservations.filter((o) => o.fixtureName === "task-agc040-d") }));
    expect(r.gateVerdict).toBe("BLOCKED");
    expect(r.blockingReasons).toContain(REASON_MISSING_VERIFIED_DOM);
  });

  it("BLOCKED when no public-content-accessible fixture", () => {
    const onlyVd = metadata.filter((m) => m.evidenceTier === "verified-public-dom");
    const r = evaluatePlatformGate(baseInput({ metadata: onlyVd, detectorObservations: validObservations.filter((o) => o.fixtureName !== "task-agc040-d") }));
    expect(r.gateVerdict).toBe("BLOCKED");
    expect(r.blockingReasons).toContain(reasonNoPublicTaskIdentity());
  });
});
