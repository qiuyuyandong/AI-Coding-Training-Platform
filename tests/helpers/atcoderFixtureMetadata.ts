/**
 * AtCoder fixture metadata API.
 * Provides platform-scoped parsing and loading for the AtCoder DOM fixture corpus.
 * Parallel minimal API suitable for T3/T4/T6 without broad abstraction.
 */
import { join } from "node:path";
import {
  EVIDENCE_TIERS,
  type EvidenceTier,
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
} from "@/tests/helpers/platformFixtureMetadata";

// Platform-scoped schema for AtCoder
const AtCoderMetaSchema = PlatformFixtureMetaSchema("atcoder");

// Re-export platform-agnostic types and values
export { EVIDENCE_TIERS, EvidenceTier, PURPOSES, Purpose, FixtureMetadataError };
export type { SharedFixtureMeta as FixtureMeta };

// The schema export for AtCoder - used by tests that import FixtureMetaSchema
export const FixtureMetaSchema = AtCoderMetaSchema;

// AtCoder-specific fixtures directory
export const DEFAULT_FIXTURES_DIR = join(process.cwd(), "tests", "fixtures", "atcoder");

// Parse with AtCoder schema
export function parseFixtureMeta(raw: string): SharedFixtureMeta {
  const parsedJson: unknown = JSON.parse(raw);
  return AtCoderMetaSchema.parse(parsedJson);
}

// Meta path for AtCoder fixtures
export function metaPathFor(htmlFileName: string, fixturesDir: string = DEFAULT_FIXTURES_DIR): string {
  return sharedMetaPathFor(htmlFileName, fixturesDir);
}

// Read AtCoder fixture metadata
export function readFixtureMeta(htmlFileName: string, fixturesDir: string = DEFAULT_FIXTURES_DIR): SharedFixtureMeta {
  return sharedReadFixtureMeta(htmlFileName, fixturesDir, AtCoderMetaSchema);
}

// Load all AtCoder fixture names (HTML files only)
export function loadFixtureNames(fixturesDir: string = DEFAULT_FIXTURES_DIR): readonly string[] {
  return sharedLoadFixtureNames(fixturesDir);
}

// Load fixture HTML content
export function loadFixtureHtml(htmlFileName: string, fixturesDir: string = DEFAULT_FIXTURES_DIR): string {
  return sharedLoadFixtureHtml(htmlFileName, fixturesDir);
}

// Load all AtCoder fixture metadata
export function loadFixtureMetadata(fixturesDir: string = DEFAULT_FIXTURES_DIR): readonly SharedFixtureMeta[] {
  return sharedLoadFixtureMetadata(fixturesDir, AtCoderMetaSchema);
}

// Utility functions - unchanged semantics from shared module
export { evidenceTierTag, isCertifyingEvidence };
