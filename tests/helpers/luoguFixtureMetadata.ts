/**
 * Luogu fixture metadata compatibility wrapper.
 * Preserves all existing export names and DEFAULT_FIXTURES_DIR for Luogu.
 * The actual schema and parsing logic is shared in platformFixtureMetadata.ts.
 */
import { join } from "node:path";
import {
  EVIDENCE_TIERS,
  type EvidenceTier,
  NONCERTIFYING_EVIDENCE_TIERS,
  type NoncertifyingEvidenceTier,
  ALL_EVIDENCE_TIERS,
  type AllEvidenceTier,
  PURPOSES,
  type Purpose,
  FixtureMetadataError,
  PlatformFixtureMetaSchema,
  type FixtureMeta as SharedFixtureMeta,
  metaPathFor as sharedMetaPathFor,
  readFixtureMeta as sharedReadFixtureMeta,
  loadFixtureNames as sharedLoadFixtureNames,
  loadFixtureHtml as sharedLoadFixtureHtml,
  loadFixtureMetadata as sharedLoadFixtureMetadata,
  evidenceTierTag,
  isCertifyingEvidence,
  isNoncertifyingEvidence,
} from "@/tests/helpers/platformFixtureMetadata";

// Platform-scoped schema for Luogu
const LuoguMetaSchema = PlatformFixtureMetaSchema("luogu");

// Re-export all platform-agnostic types and values unchanged
export {
  EVIDENCE_TIERS,
  EvidenceTier,
  NONCERTIFYING_EVIDENCE_TIERS,
  NoncertifyingEvidenceTier,
  ALL_EVIDENCE_TIERS,
  AllEvidenceTier,
  PURPOSES,
  Purpose,
  FixtureMetadataError,
};
export type { SharedFixtureMeta as FixtureMeta };

// The schema export for Luogu - used by tests that import FixtureMetaSchema
export const FixtureMetaSchema = LuoguMetaSchema;

// Keep the Luogu-specific default directory
export const DEFAULT_FIXTURES_DIR = join(process.cwd(), "tests", "fixtures", "luogu");

// Re-exported parse with Luogu schema
export function parseFixtureMeta(raw: string): SharedFixtureMeta {
  const parsedJson: unknown = JSON.parse(raw);
  return LuoguMetaSchema.parse(parsedJson);
}

// Re-exported with default fixtures dir
export function metaPathFor(htmlFileName: string, fixturesDir: string = DEFAULT_FIXTURES_DIR): string {
  return sharedMetaPathFor(htmlFileName, fixturesDir);
}

// Re-exported with default fixtures dir and Luogu schema
export function readFixtureMeta(htmlFileName: string, fixturesDir: string = DEFAULT_FIXTURES_DIR): SharedFixtureMeta {
  return sharedReadFixtureMeta(htmlFileName, fixturesDir, LuoguMetaSchema);
}

// Re-exported with default fixtures dir and Luogu schema
export function loadFixtureMetadata(fixturesDir: string = DEFAULT_FIXTURES_DIR): readonly SharedFixtureMeta[] {
  return sharedLoadFixtureMetadata(fixturesDir, LuoguMetaSchema);
}

// Re-exported from shared module with Luogu-specific default directory
export function loadFixtureNames(fixturesDir: string = DEFAULT_FIXTURES_DIR): readonly string[] {
  return sharedLoadFixtureNames(fixturesDir);
}

export function loadFixtureHtml(htmlFileName: string, fixturesDir: string = DEFAULT_FIXTURES_DIR): string {
  return sharedLoadFixtureHtml(htmlFileName, fixturesDir);
}

export { evidenceTierTag, isCertifyingEvidence, isNoncertifyingEvidence };
