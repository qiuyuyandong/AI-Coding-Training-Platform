import { getPlatformAdapterStatus } from "@/extension/src/platforms";
import {
  FixtureCoverageSchema,
  DetectorEvidenceEntrySchema,
  PlatformGateResultSchema,
  REASON_MISSING_PUBLIC_CONTENT,
  REASON_MISSING_VERIFIED_DOM,
  reasonMissingRequiredVerdict,
  reasonAuthenticatedEvidence,
  reasonMissingDetectorObservation,
  reasonUnknownDetectorObservation,
  reasonDuplicateDetectorObservation,
  reasonDetectorObservationsEmpty,
  reasonNoPublicTaskIdentity,
  reasonPlatformMismatch,
  reasonDuplicateMetadataName,
  reasonRequiredFixtureMissingProblemExpected,
  reasonDetectedIdentityMismatch,
  reasonDetectedIdentityNull,
  type FixtureCoverage,
  type DetectorEvidenceEntry,
  type PlatformGateInput,
  type PlatformGateResult,
} from "@/tests/helpers/platformCertificationContract";

export {
  FixtureCoverageSchema,
  REASON_MISSING_PUBLIC_CONTENT,
  REASON_MISSING_VERIFIED_DOM,
  reasonMissingRequiredVerdict,
  reasonAuthenticatedEvidence,
  reasonMissingDetectorObservation,
  reasonUnknownDetectorObservation,
  reasonDuplicateDetectorObservation,
  reasonDetectorObservationsEmpty,
  reasonNoPublicTaskIdentity,
  reasonDuplicateMetadataName,
  type FixtureCoverage,
} from "@/tests/helpers/platformCertificationContract";

export function computeFixtureCoverage(md: PlatformGateInput["metadata"]): FixtureCoverage {
  const pc = md.filter((m) => m.evidenceTier === "public-content-accessible").length;
  const vd = md.filter(
    (m) => m.evidenceTier === "verified-public-dom" && m.verdictExpected !== null && m.selectors.length > 0,
  ).length;
  const cd = md.filter((m) => m.evidenceTier === "characterization-derived").length;
  return FixtureCoverageSchema.parse({ total: md.length, publicContentAccessible: pc, verifiedPublicDom: vd, characterizationDerived: cd });
}

function requiredNames(input: PlatformGateInput): string[] {
  const names: string[] = [];
  for (const m of input.metadata) {
    if (m.evidenceTier === "public-content-accessible" && m.problemExpected !== null && m.problemExpected.platform === input.platform) {
      names.push(m.fixtureName);
    }
    if (m.evidenceTier === "verified-public-dom" && m.verdictExpected !== null && m.selectors.length > 0) {
      names.push(m.fixtureName);
    }
  }
  return names;
}

export function evaluatePlatformGate(input: PlatformGateInput): PlatformGateResult {
  const R: string[] = [];
  const cov = computeFixtureCoverage(input.metadata);

  // --- Metadata blockers ---
  if (cov.publicContentAccessible === 0) R.push(REASON_MISSING_PUBLIC_CONTENT);
  if (cov.verifiedPublicDom === 0) R.push(REASON_MISSING_VERIFIED_DOM);

  if (!input.metadata.some(
    (m) => m.evidenceTier === "public-content-accessible" && m.problemExpected !== null && m.problemExpected.platform === input.platform,
  )) R.push(reasonNoPublicTaskIdentity());

  for (const m of input.metadata) {
    if (m.problemExpected !== null && m.problemExpected.platform !== input.platform) {
      R.push(reasonPlatformMismatch(m.fixtureName, m.problemExpected.platform, input.platform));
    }
  }

  // Duplicate metadata names
  const seenMeta = new Set<string>();
  for (const m of input.metadata) {
    if (seenMeta.has(m.fixtureName)) R.push(reasonDuplicateMetadataName(m.fixtureName));
    seenMeta.add(m.fixtureName);
  }

  const vdFixtures = input.metadata.filter(
    (m) => m.evidenceTier === "verified-public-dom" && m.verdictExpected !== null && m.selectors.length > 0,
  );
  // Host + auth for ALL certifying fixtures (public task + verified-dom)
  const certifyingFixtures = input.metadata.filter(
    (m) =>
      (m.evidenceTier === "public-content-accessible" && m.problemExpected !== null && m.problemExpected.platform === input.platform) ||
      (m.evidenceTier === "verified-public-dom" && m.verdictExpected !== null && m.selectors.length > 0),
  );
  for (const m of certifyingFixtures) {
    const hn = new URL(m.sourceUrl).hostname;
    if (hn !== input.expectedSourceHost) {
      R.push(`Fixture "${m.fixtureName}" sourceUrl hostname "${hn}" does not match expected host "${input.expectedSourceHost}".`);
    }
    if (m.authenticated !== false) R.push(reasonAuthenticatedEvidence(m.fixtureName));
  }
  // Selector requirement only for verified verdict fixtures
  for (const m of vdFixtures) {
    if (!m.selectors.some((s) => s.includes(input.requiredSelectorToken))) {
      R.push(`Fixture "${m.fixtureName}" selectors do not contain "${input.requiredSelectorToken}".`);
    }
  }

  if (cov.verifiedPublicDom > 0) {
    const covered = new Set(vdFixtures.map((m) => m.verdictExpected?.verdict).filter((v): v is string => typeof v === "string"));
    for (const rv of input.requiredVerdicts) {
      if (!covered.has(rv)) R.push(reasonMissingRequiredVerdict(rv));
    }
  }

  // --- Detector evidence: required ONLY when metadata would CERTIFY ---
  const metaWouldCertify = R.length === 0;
  const reqNames = metaWouldCertify ? requiredNames(input) : [];

  if (reqNames.length > 0 && input.detectorObservations.length === 0) {
    R.push(reasonDetectorObservationsEmpty());
  }

  const obsNames = new Set<string>();
  for (const o of input.detectorObservations) {
    if (obsNames.has(o.fixtureName)) R.push(reasonDuplicateDetectorObservation(o.fixtureName));
    obsNames.add(o.fixtureName);
  }
  for (const n of reqNames) {
    if (!obsNames.has(n)) R.push(reasonMissingDetectorObservation(n));
  }

  const reqSet = new Set(reqNames);
  const evidence: DetectorEvidenceEntry[] = [];
  for (const o of input.detectorObservations) {
    const meta = input.metadata.find((m) => m.fixtureName === o.fixtureName);
    if (meta === undefined) { R.push(reasonUnknownDetectorObservation(o.fixtureName)); continue; }
    if (metaWouldCertify && !reqSet.has(o.fixtureName)) continue;

    const ve = meta.verdictExpected?.verdict ?? null;
    const vd = o.verdictDetected;
    const pe = meta.problemExpected?.platform ?? null;
    const pd = o.problemPlatformDetected;
    const xe = meta.problemExpected?.externalId ?? null;
    const xd = o.problemExternalIdDetected;

    // --- Unified identity validation for required certifying fixtures ---
    if (metaWouldCertify && reqSet.has(meta.fixtureName)) {
      if (meta.problemExpected === null) {
        R.push(reasonRequiredFixtureMissingProblemExpected(meta.fixtureName));
      } else {
        const mpe = meta.problemExpected.platform;
        const mxe = meta.problemExpected.externalId;
        if (mpe !== input.platform) R.push(reasonPlatformMismatch(meta.fixtureName, mpe, input.platform));
        if (pd === null) R.push(reasonDetectedIdentityNull(meta.fixtureName, "problemPlatformDetected"));
        else if (pd !== mpe) R.push(reasonDetectedIdentityMismatch({ fixtureName: meta.fixtureName, field: "problemPlatformDetected", expected: mpe, detected: pd }));
        if (xd === null) R.push(reasonDetectedIdentityNull(meta.fixtureName, "problemExternalIdDetected"));
        else if (xd !== mxe) R.push(reasonDetectedIdentityMismatch({ fixtureName: meta.fixtureName, field: "problemExternalIdDetected", expected: mxe, detected: xd }));
      }
    }

    // --- Tier-specific verdict checks ---
    if (meta.evidenceTier === "public-content-accessible") {
      if (vd !== null) {
        R.push(`Fixture "${meta.fixtureName}" is public-content-accessible but detector returned non-null verdict.`);
      }
    }
    if (meta.evidenceTier === "verified-public-dom") {
      if (ve === null || ve === undefined) {
        R.push(`Fixture "${meta.fixtureName}" is verified-public-dom but has null verdictExpected.`);
      } else if (vd === null) {
        R.push(`Fixture "${meta.fixtureName}" detector returned null verdict, expected "${ve}".`);
      } else if (ve !== vd) {
        R.push(`Fixture "${meta.fixtureName}" detector verdict mismatch: expected "${ve}", got "${vd}".`);
      }
    }

    evidence.push(DetectorEvidenceEntrySchema.parse({
      fixtureName: meta.fixtureName,
      verdictExpected: ve,
      verdictDetected: vd,
      verdictMatch: ve === vd,
      problemPlatformExpected: pe,
      problemPlatformDetected: pd,
      problemExternalIdExpected: xe,
      problemExternalIdDetected: xd,
      problemMatch: pe === pd && xe === xd,
    }));
  }

  const sorted = [...evidence].sort((a, b) => a.fixtureName.localeCompare(b.fixtureName, "en"));
  return PlatformGateResultSchema.parse({
    gateVerdict: R.length === 0 ? "CERTIFIED" : "BLOCKED",
    blockingReasons: R,
    fixtureCoverage: cov,
    fixtureNames: input.metadata.map((m) => m.fixtureName),
    gateDate: input.gateDate,
    gateSource: input.gateSource,
    candidateCurrentStatus: getPlatformAdapterStatus(input.platform),
    detectorEvidence: sorted,
  });
}
