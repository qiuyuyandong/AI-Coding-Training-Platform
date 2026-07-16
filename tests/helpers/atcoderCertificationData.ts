import { z } from "zod";
import type { DetectableLocation } from "@/extension/src/platforms";
import { detectProblemFromPage, detectVerdictFromDocument } from "@/extension/src/platforms";
import { loadFixtureHtml } from "@/tests/helpers/atcoderFixtureMetadata";
import {
  FixtureCoverageSchema,
  DetectorObservationSchema,
  DetectorEvidenceEntrySchema,
  type DetectorObservation,
} from "@/tests/helpers/platformCertificationContract";

export const GATE_DATE = "2026-07-16" as const;
export const EXPECTED_COVERAGE = z.object({ total: z.literal(4), publicContentAccessible: z.literal(1), verifiedPublicDom: z.literal(3), characterizationDerived: z.literal(0) }).strict();
export const REQUIRED_VERDICTS = ["Accepted", "Wrong Answer", "Time Limit Exceeded"] as const;
export const GATE_SOURCE = {
  planTask: "docs/superpowers/plans/2026-07-16-phase-0-atcoder-production-certification.md#T6",
  fixtureMetadataGlob: "tests/fixtures/atcoder/*.meta.json",
  adapterRegistry: "extension/src/platforms.ts",
  dateBasis: "fixture metadata captureDate",
} as const;
export const EXPECTED_FIXTURE_NAMES = [
  "submission-abc164-e-wa",
  "submission-abc443-d-tle",
  "submission-agc040-d-ac",
  "task-agc040-d",
] as const;

const fixtureNamesTuple = z.tuple([z.literal("submission-abc164-e-wa"), z.literal("submission-abc443-d-tle"), z.literal("submission-agc040-d-ac"), z.literal("task-agc040-d")]);

// --- CERTIFIED artifact schema (exact immutable facts) ---

const AtCoderCertifiedSchema = z.object({
  gateVerdict: z.literal("CERTIFIED"),
  blockingReasons: z.array(z.string()).length(0),
  fixtureCoverage: EXPECTED_COVERAGE,
  fixtureNames: fixtureNamesTuple,
  atcoderCurrentStatus: z.literal("experimental"),
  gateDate: z.literal(GATE_DATE),
  gateSource: z.object({
    planTask: z.literal(GATE_SOURCE.planTask),
    fixtureMetadataGlob: z.literal(GATE_SOURCE.fixtureMetadataGlob),
    adapterRegistry: z.literal(GATE_SOURCE.adapterRegistry),
    dateBasis: z.literal(GATE_SOURCE.dateBasis),
  }).strict(),
  detectorEvidence: z.tuple([
    z.object({fixtureName:z.literal("submission-abc164-e-wa"),verdictExpected:z.literal("Wrong Answer"),verdictDetected:z.literal("Wrong Answer"),verdictMatch:z.literal(true),problemPlatformExpected:z.literal("atcoder"),problemPlatformDetected:z.literal("atcoder"),problemExternalIdExpected:z.literal("abc164_e"),problemExternalIdDetected:z.literal("abc164_e"),problemMatch:z.literal(true)}).strict(),
    z.object({fixtureName:z.literal("submission-abc443-d-tle"),verdictExpected:z.literal("Time Limit Exceeded"),verdictDetected:z.literal("Time Limit Exceeded"),verdictMatch:z.literal(true),problemPlatformExpected:z.literal("atcoder"),problemPlatformDetected:z.literal("atcoder"),problemExternalIdExpected:z.literal("abc443_d"),problemExternalIdDetected:z.literal("abc443_d"),problemMatch:z.literal(true)}).strict(),
    z.object({fixtureName:z.literal("submission-agc040-d-ac"),verdictExpected:z.literal("Accepted"),verdictDetected:z.literal("Accepted"),verdictMatch:z.literal(true),problemPlatformExpected:z.literal("atcoder"),problemPlatformDetected:z.literal("atcoder"),problemExternalIdExpected:z.literal("agc040_d"),problemExternalIdDetected:z.literal("agc040_d"),problemMatch:z.literal(true)}).strict(),
    z.object({fixtureName:z.literal("task-agc040-d"),verdictExpected:z.literal(null),verdictDetected:z.literal(null),verdictMatch:z.literal(true),problemPlatformExpected:z.literal("atcoder"),problemPlatformDetected:z.literal("atcoder"),problemExternalIdExpected:z.literal("agc040_d"),problemExternalIdDetected:z.literal("agc040_d"),problemMatch:z.literal(true)}).strict(),
  ]),
}).strict();

// --- BLOCKED artifact schema ---

const AtCoderBlockedSchema = z.object({
  gateVerdict: z.literal("BLOCKED"),
  blockingReasons: z.array(z.string().min(1)).min(1),
  fixtureCoverage: FixtureCoverageSchema,
  fixtureNames: z.array(z.string().min(1)),
  atcoderCurrentStatus: z.enum(["production", "experimental", "disabled"]),
  gateDate: z.literal(GATE_DATE),
  gateSource: z.object({
    planTask: z.literal(GATE_SOURCE.planTask),
    fixtureMetadataGlob: z.literal(GATE_SOURCE.fixtureMetadataGlob),
    adapterRegistry: z.literal(GATE_SOURCE.adapterRegistry),
    dateBasis: z.literal(GATE_SOURCE.dateBasis),
  }).strict(),
  detectorEvidence: z.array(DetectorEvidenceEntrySchema),
}).strict();

export const AtcoderGateArtifactSchema = z.discriminatedUnion("gateVerdict", [AtCoderCertifiedSchema, AtCoderBlockedSchema]);
export type AtcoderGateArtifact = z.infer<typeof AtcoderGateArtifactSchema>;

export function parseAtcoderArtifact(raw: string): AtcoderGateArtifact {
  const parsedJson: unknown = JSON.parse(raw);
  return AtcoderGateArtifactSchema.parse(parsedJson);
}

// --- Detector helpers ---

function asLocation(url: string): DetectableLocation {
  const u = new URL(url);
  return { href: u.href, hostname: u.hostname, pathname: u.pathname };
}

function wrapTableHtml(raw: string): string {
  return raw.includes("<td ") ? raw.replace("<td ", "<table><tbody><tr><td ").replace("</td>", "</td></tr></tbody></table>") : raw;
}

interface ObservationSourceMapping { readonly fixtureName: string; readonly sourceUrl: string; }

const ALL_OBSERVATION_MAPPINGS: readonly ObservationSourceMapping[] = [
  { fixtureName: "submission-agc040-d-ac", sourceUrl: "https://atcoder.jp/contests/agc040/submissions/53759742?lang=en" },
  { fixtureName: "submission-abc164-e-wa", sourceUrl: "https://atcoder.jp/contests/abc164/submissions/12438513?lang=en" },
  { fixtureName: "submission-abc443-d-tle", sourceUrl: "https://atcoder.jp/contests/abc443/submissions/72918187?lang=en" },
  { fixtureName: "task-agc040-d", sourceUrl: "https://atcoder.jp/contests/agc040/tasks/agc040_d?lang=en" },
];

export function buildDetectorObservations(fixturesDir: string): DetectorObservation[] {
  return ALL_OBSERVATION_MAPPINGS.map((mapping) => {
    const rawHtml = loadFixtureHtml(`${mapping.fixtureName}.html`, fixturesDir);
    const verdictDoc = new DOMParser().parseFromString(wrapTableHtml(rawHtml), "text/html");
    const verdictResult = detectVerdictFromDocument("atcoder", verdictDoc);
    const verdictDetected = verdictResult?.verdict ?? null;
    const problemDoc = new DOMParser().parseFromString(rawHtml, "text/html");
    const problemResult = detectProblemFromPage(asLocation(mapping.sourceUrl), problemDoc);
    const problemPlatformDetected = problemResult?.platform ?? null;
    const problemExternalIdDetected = problemResult?.problemExternalId ?? null;
    return DetectorObservationSchema.parse({
      fixtureName: mapping.fixtureName,
      verdictDetected,
      problemPlatformDetected,
      problemExternalIdDetected,
    });
  });
}

export { ALL_OBSERVATION_MAPPINGS };
export type { ObservationSourceMapping };
