import { createHash } from "node:crypto";
import { z } from "zod";
import type { Platform, PlatformAdapterStatus } from "@/extension/src/platforms";
import { ADAPTER_VERSION, PARSER_VERSION } from "@/extension/src/attemptCapture";
import type {
  FixtureCoverage, PlatformGateResult,
} from "@/tests/helpers/platformCertificationContract";
import type { FixtureMeta } from "@/tests/helpers/atcoderFixtureMetadata";
import {
  type AtcoderGateArtifact, parseAtcoderArtifact,
} from "@/tests/helpers/atcoderCertificationData";

// ---- PROMOTION GUARD ----

export class PromotionGuardRejected extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PromotionGuardRejected";
  }
}

export function computeSha256Hex(raw: string): string {
  return createHash("sha256").update(raw).digest("hex").toUpperCase();
}

function guardParse(raw: string): AtcoderGateArtifact {
  try {
    return parseAtcoderArtifact(raw);
  } catch (cause) {
    if (cause instanceof SyntaxError || cause instanceof z.ZodError) {
      throw new PromotionGuardRejected(
        `Promotion denied: invalid gate artifact — ${String(cause)}`,
      );
    }
    throw cause;
  }
}

export interface PromotionGuardResult {
  readonly prePromotion: AtcoderGateArtifact;
  readonly sha256: string;
}

export function atcoderPromotionGuard(raw: string): PromotionGuardResult {
  const artifact = guardParse(raw);
  const verdict: AtcoderGateArtifact["gateVerdict"] = artifact.gateVerdict;
  const status: AtcoderGateArtifact["atcoderCurrentStatus"] = artifact.atcoderCurrentStatus;
  if (verdict !== "CERTIFIED") {
    throw new PromotionGuardRejected(
      `Promotion denied: gate verdict is "${verdict}", must be CERTIFIED`,
    );
  }
  if (status !== "experimental") {
    throw new PromotionGuardRejected(
      `Promotion denied: pre-promotion status is "${status}", must be experimental`,
    );
  }
  if (artifact.fixtureCoverage.verifiedPublicDom < 3) {
    throw new PromotionGuardRejected(
      "Promotion denied: insufficient verified-public-dom fixtures",
    );
  }
  if (artifact.detectorEvidence.length < 4) {
    throw new PromotionGuardRejected("Promotion denied: incomplete detector evidence");
  }
  return { prePromotion: artifact, sha256: computeSha256Hex(raw) };
}

// ---- LIVE CERTIFIED GATE ----

export interface LiveCertifiedGate {
  readonly evaluation: PlatformGateResult;
}

export function requireLiveCertifiedGate(evaluation: PlatformGateResult): LiveCertifiedGate {
  if (evaluation.gateVerdict !== "CERTIFIED") {
    throw new PromotionGuardRejected(
      `Live gate not CERTIFIED: verdict is "${evaluation.gateVerdict}"`,
    );
  }
  if (evaluation.blockingReasons.length > 0) {
    throw new PromotionGuardRejected(
      `Live gate has blocking reasons: ${evaluation.blockingReasons.join("; ")}`,
    );
  }
  if (evaluation.candidateCurrentStatus !== "production") {
    throw new PromotionGuardRejected(
      `Live gate candidate status is "${evaluation.candidateCurrentStatus}", must be production`,
    );
  }
  if (evaluation.detectorEvidence.length !== 4) {
    throw new PromotionGuardRejected(
      `Live gate detector evidence count is ${evaluation.detectorEvidence.length}, must be 4`,
    );
  }
  for (const e of evaluation.detectorEvidence) {
    if (e.verdictMatch !== true || e.problemMatch !== true) {
      throw new PromotionGuardRejected(
        `Live gate detector evidence mismatch: fixture "${e.fixtureName}" verdictMatch=${String(e.verdictMatch)} problemMatch=${String(e.problemMatch)}`,
      );
    }
  }
  return { evaluation };
}

// ---- LUOGU GATE PARSER ----

const LuoguGateSchema = z.object({
  gateVerdict: z.literal("BLOCKED"),
  luoguCurrentStatus: z.literal("experimental"),
}).passthrough();

export type LuoguGate = z.infer<typeof LuoguGateSchema>;

export function parseLuoguGate(raw: string): LuoguGate {
  return LuoguGateSchema.parse(JSON.parse(raw));
}

// ---- PRODUCTION ARTIFACT ----

export interface PromotionBuildInput {
  readonly guard: PromotionGuardResult;
  readonly liveGate: LiveCertifiedGate;
  readonly atcoderStatus: PlatformAdapterStatus;
  readonly productionPlatforms: readonly Platform[];
  readonly metadata: readonly FixtureMeta[];
  readonly fixtureCoverage: FixtureCoverage;
  readonly luoguGate: LuoguGate;
  readonly luoguRegistryStatus: PlatformAdapterStatus;
  readonly certificationDate: string;
}

const FIXTURE_NAME_LITERALS = [
  "submission-abc164-e-wa",
  "submission-abc443-d-tle",
  "submission-agc040-d-ac",
  "task-agc040-d",
] as const;

const ProductionCertificationSchema = z.object({
  plan: z.literal(
    "docs/superpowers/plans/2026-07-16-phase-0-atcoder-production-certification.md#T7",
  ),
  candidate: z.literal("atcoder"),
  terminalState: z.literal("CERTIFIED"),
  liveStatus: z.literal("production"),
  productionPlatforms: z.tuple([z.literal("atcoder")]),
  fixtureCoverage: z.object({
    total: z.literal(4),
    publicContentAccessible: z.literal(1),
    verifiedPublicDom: z.literal(3),
    characterizationDerived: z.literal(0),
  }).strict(),
  fixtureSourceUrls: z.tuple([
    z.object({
      fixtureName: z.literal(FIXTURE_NAME_LITERALS[0]),
      sourceUrl: z.literal(
        "https://atcoder.jp/contests/abc164/submissions/12438513?lang=en",
      ),
    }).strict(),
    z.object({
      fixtureName: z.literal(FIXTURE_NAME_LITERALS[1]),
      sourceUrl: z.literal(
        "https://atcoder.jp/contests/abc443/submissions/72918187?lang=en",
      ),
    }).strict(),
    z.object({
      fixtureName: z.literal(FIXTURE_NAME_LITERALS[2]),
      sourceUrl: z.literal(
        "https://atcoder.jp/contests/agc040/submissions/53759742?lang=en",
      ),
    }).strict(),
    z.object({
      fixtureName: z.literal(FIXTURE_NAME_LITERALS[3]),
      sourceUrl: z.literal(
        "https://atcoder.jp/contests/agc040/tasks/agc040_d?lang=en",
      ),
    }).strict(),
  ]),
  adapterVersion: z.literal(ADAPTER_VERSION),
  parserVersion: z.literal(PARSER_VERSION),
  t6GateArtifact: z.object({
    path: z.literal("work/reports/atcoder-certification-gate-verdict.json"),
    sha256: z.string().length(64).regex(/^[0-9A-F]+$/u),
  }).strict(),
  certificationDate: z.literal("2026-07-17"),
  luoguHistoricalState: z.object({
    status: z.literal("BLOCKED"),
    registry: z.literal("experimental"),
    gateArtifactPath: z.literal("work/reports/certification-gate-verdict.json"),
    blockerArtifactPath: z.literal("work/reports/luogu-adapter-blocker.json"),
  }).strict(),
  consistency: z.object({
    soleProductionPlatform: z.literal(true),
    gateCertified: z.literal(true),
    detectorEvidenceComplete: z.literal(true),
    luoguNotPromoted: z.literal(true),
  }).strict(),
}).strict();

export type ProductionCertification = z.infer<typeof ProductionCertificationSchema>;

export function buildProductionArtifact(input: PromotionBuildInput): ProductionCertification {
  const sorted = [...input.metadata]
    .sort((a, b) => a.fixtureName.localeCompare(b.fixtureName, "en"));
  const sourceUrls = sorted.map((m) => ({
    fixtureName: m.fixtureName,
    sourceUrl: m.sourceUrl,
  }));
  return ProductionCertificationSchema.parse({
    plan: "docs/superpowers/plans/2026-07-16-phase-0-atcoder-production-certification.md#T7",
    candidate: "atcoder",
    terminalState: "CERTIFIED",
    liveStatus: input.atcoderStatus,
    productionPlatforms: input.productionPlatforms,
    fixtureCoverage: input.fixtureCoverage,
    fixtureSourceUrls: sourceUrls,
    adapterVersion: ADAPTER_VERSION,
    parserVersion: PARSER_VERSION,
    t6GateArtifact: {
      path: "work/reports/atcoder-certification-gate-verdict.json",
      sha256: input.guard.sha256,
    },
    certificationDate: input.certificationDate,
    luoguHistoricalState: {
      status: input.luoguGate.gateVerdict,
      registry: input.luoguRegistryStatus,
      gateArtifactPath: "work/reports/certification-gate-verdict.json",
      blockerArtifactPath: "work/reports/luogu-adapter-blocker.json",
    },
    consistency: {
      soleProductionPlatform:
        input.productionPlatforms.length === 1 && input.productionPlatforms[0] === "atcoder",
      gateCertified:
        input.guard.prePromotion.gateVerdict === "CERTIFIED"
        && input.liveGate.evaluation.gateVerdict === "CERTIFIED",
      detectorEvidenceComplete:
        input.guard.prePromotion.detectorEvidence.length === 4
        && input.liveGate.evaluation.detectorEvidence.length === 4,
      luoguNotPromoted:
        input.luoguGate.gateVerdict === "BLOCKED" && input.luoguRegistryStatus !== "production",
    },
  });
}

export { FIXTURE_NAME_LITERALS };
