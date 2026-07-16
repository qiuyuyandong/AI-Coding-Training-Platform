import { z } from "zod";
import type { Platform } from "@/extension/src/platforms";
import type { FixtureMeta } from "@/tests/helpers/platformFixtureMetadata";

export const FixtureCoverageSchema = z
  .object({
    total: z.number().int().nonnegative(),
    publicContentAccessible: z.number().int().nonnegative(),
    verifiedPublicDom: z.number().int().nonnegative(),
    characterizationDerived: z.number().int().nonnegative(),
  })
  .strict();
export type FixtureCoverage = z.infer<typeof FixtureCoverageSchema>;

export const REASON_MISSING_PUBLIC_CONTENT =
  'No fixture has evidenceTier "public-content-accessible"; URL detection evidence is required.';
export const REASON_MISSING_VERIFIED_DOM =
  'No fixture qualifies as evidenceTier "verified-public-dom": production requires at least one fixture with non-null verdictExpected and non-empty selector provenance proving actual public verdict DOM was observed.';

export function reasonMissingRequiredVerdict(verdict: string): string {
  return `Required verdict "${verdict}" is not covered by any verified-public-dom fixture.`;
}
export function reasonAuthenticatedEvidence(fixtureName: string): string {
  return `Fixture "${fixtureName}" is marked authenticated=true; certifying evidence requires unauthenticated public evidence.`;
}
export function reasonMissingDetectorObservation(fixtureName: string): string {
  return `Missing detector observation for required fixture "${fixtureName}".`;
}
export function reasonUnknownDetectorObservation(fixtureName: string): string {
  return `Detector observation references unknown fixture "${fixtureName}".`;
}
export function reasonDuplicateDetectorObservation(fixtureName: string): string {
  return `Duplicate detector observation for fixture "${fixtureName}".`;
}
export function reasonDetectorObservationsEmpty(): string {
  return "Detector observations are empty; certification requires detector evidence for all retained fixtures.";
}
export function reasonNoPublicTaskIdentity(): string {
  return "No public-content-accessible fixture has a non-null problem identity matching the candidate platform.";
}
export function reasonPlatformMismatch(fixtureName: string, expected: string, candidate: string): string {
  return `Fixture "${fixtureName}" problem identity platform "${expected}" does not match candidate platform "${candidate}".`;
}
export function reasonDuplicateMetadataName(fixtureName: string): string {
  return `Duplicate metadata fixture name "${fixtureName}".`;
}
export function reasonRequiredFixtureMissingProblemExpected(fixtureName: string): string {
  return `Required certifying fixture "${fixtureName}" has null problemExpected.`;
}
export function reasonDetectedIdentityMismatch(params: {
  readonly fixtureName: string;
  readonly field: string;
  readonly expected: string;
  readonly detected: string;
}): string {
  return `Fixture "${params.fixtureName}" detected ${params.field} "${params.detected}" does not match expected "${params.expected}".`;
}
export function reasonDetectedIdentityNull(fixtureName: string, field: string): string {
  return `Fixture "${fixtureName}" detected ${field} is null; expected non-null identity.`;
}

// ---- Detector observation (input — raw detected values, no booleans) ---------

export const DetectorObservationSchema = z
  .object({
    fixtureName: z.string().min(1),
    verdictDetected: z.string().nullable(),
    problemPlatformDetected: z.string().nullable(),
    problemExternalIdDetected: z.string().nullable(),
  })
  .strict();
export type DetectorObservation = z.infer<typeof DetectorObservationSchema>;

// ---- Detector evidence entry (output — evaluator derives all match booleans) ---

export const DetectorEvidenceEntrySchema = z
  .object({
    fixtureName: z.string().min(1),
    verdictExpected: z.string().nullable(),
    verdictDetected: z.string().nullable(),
    verdictMatch: z.boolean(),
    problemPlatformExpected: z.string().nullable(),
    problemPlatformDetected: z.string().nullable(),
    problemExternalIdExpected: z.string().nullable(),
    problemExternalIdDetected: z.string().nullable(),
    problemMatch: z.boolean(),
  })
  .strict();
export type DetectorEvidenceEntry = z.infer<typeof DetectorEvidenceEntrySchema>;

// ---- Gate input / result ----------------------------------------------------

export interface PlatformGateInput {
  readonly platform: Platform;
  readonly metadata: readonly FixtureMeta[];
  readonly requiredVerdicts: readonly string[];
  readonly gateDate: string;
  readonly gateSource: Readonly<Record<string, string>>;
  readonly expectedSourceHost: string;
  readonly requiredSelectorToken: string;
  readonly detectorObservations: readonly DetectorObservation[];
}

export const PlatformGateResultSchema = z
  .object({
    gateVerdict: z.enum(["CERTIFIED", "BLOCKED"]),
    blockingReasons: z.array(z.string().min(1)),
    fixtureCoverage: FixtureCoverageSchema,
    fixtureNames: z.array(z.string().min(1)),
    gateDate: z.string().min(1),
    gateSource: z.record(z.string()),
    candidateCurrentStatus: z.enum(["production", "experimental", "disabled"]),
    detectorEvidence: z.array(DetectorEvidenceEntrySchema),
  })
  .strict();
export type PlatformGateResult = z.infer<typeof PlatformGateResultSchema>;
