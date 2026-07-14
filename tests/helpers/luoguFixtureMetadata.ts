import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";

export const EVIDENCE_TIERS = [
  "public-content-accessible",
  "verified-public-dom",
  "characterization-derived",
] as const;
export type EvidenceTier = (typeof EVIDENCE_TIERS)[number];

export const PURPOSES = [
  "detectProblemFromLocation",
  "detectVerdictFromDocument",
  "both",
  "negative",
] as const;
export type Purpose = (typeof PURPOSES)[number];

export const DEFAULT_FIXTURES_DIR = join(process.cwd(), "tests", "fixtures", "luogu");

function firstPurposeToken(value: string): Purpose | undefined {
  return PURPOSES.find(
    (p) =>
      value === p ||
      value.startsWith(`${p} `) ||
      value.startsWith(`${p} \u2014`) ||
      value.startsWith(`${p}\u2014`),
  );
}

export class FixtureMetadataError extends Error {
  public readonly path: string;

  public constructor(path: string, message: string) {
    super(`${path}: ${message}`);
    this.name = "FixtureMetadataError";
    this.path = path;
  }
}

export const FixtureMetaSchema = z
  .object({
    fixtureName: z.string().min(1),
    sourceUrl: z.string().url(),
    captureDate: z.string().date(),
    captureMethod: z.string().min(1),
    purpose: z.string().min(1).transform((value, context) => {
      const match = firstPurposeToken(value);
      if (match === undefined) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: `purpose must start with one of ${PURPOSES.join(" | ")}; received ${JSON.stringify(value)}`,
        });
        return z.NEVER;
      }
      return match;
    }),
    selectors: z.array(z.string()),
    authenticated: z.boolean(),
    sanitized: z.literal(true),
    evidenceTier: z.enum(EVIDENCE_TIERS),
    verdictExpected: z.object({ verdict: z.string().min(1) }).strict().nullable(),
    problemExpected: z
      .object({ platform: z.literal("luogu"), externalId: z.string().min(1) })
      .strict()
      .nullable(),
  })
  .strict()
  .superRefine((value, context) => {
    const reject = (path: string, message: string): void => {
      context.addIssue({ code: z.ZodIssueCode.custom, path: [path], message });
    };
    if (value.evidenceTier === "public-content-accessible" && value.verdictExpected !== null) {
      reject("verdictExpected", "public-content-accessible MUST have verdictExpected === null");
    }
    if (value.evidenceTier === "characterization-derived" && value.verdictExpected !== null) {
      reject("verdictExpected", "characterization-derived MUST have verdictExpected === null");
    }
    if (value.evidenceTier === "verified-public-dom") {
      if (value.verdictExpected === null) reject("verdictExpected", "verified-public-dom REQUIRES non-null verdictExpected");
      if (value.selectors.length === 0) reject("selectors", "verified-public-dom MUST document selector provenance");
    }
    if (value.purpose === "negative" && value.verdictExpected !== null) {
      reject("verdictExpected", "negative purpose MUST have verdictExpected === null");
    }
  });

export type FixtureMeta = z.infer<typeof FixtureMetaSchema>;

export function parseFixtureMeta(raw: string): FixtureMeta {
  const parsedJson: unknown = JSON.parse(raw);
  return FixtureMetaSchema.parse(parsedJson);
}

export function metaPathFor(htmlFileName: string, fixturesDir: string = DEFAULT_FIXTURES_DIR): string {
  return join(fixturesDir, htmlFileName.replace(/\.html$/, ".meta.json"));
}

export function readFixtureMeta(htmlFileName: string, fixturesDir: string = DEFAULT_FIXTURES_DIR): FixtureMeta {
  const metaPath = metaPathFor(htmlFileName, fixturesDir);
  let raw: string;
  try {
    raw = readFileSync(metaPath, "utf8");
  } catch (_cause) {
    throw new FixtureMetadataError(metaPath, "missing sibling metadata file");
  }
  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(raw);
  } catch (_cause) {
    throw new FixtureMetadataError(metaPath, "metadata is not valid JSON");
  }
  const result = FixtureMetaSchema.safeParse(parsedJson);
  if (!result.success) {
    const detail = result.error.issues
      .map((i) => `${i.path.join(".") || "<root>"}: ${i.message}`)
      .join("; ");
    throw new FixtureMetadataError(metaPath, `metadata rejected: ${detail}`);
  }
  return result.data;
}

export function loadFixtureNames(fixturesDir: string = DEFAULT_FIXTURES_DIR): readonly string[] {
  return readdirSync(fixturesDir)
    .filter((n) => n.endsWith(".html"))
    .sort((a, b) => a.localeCompare(b, "en"))
    .map((e) => e.replace(/\.html$/, ""));
}

export function loadFixtureHtml(htmlFileName: string, fixturesDir: string = DEFAULT_FIXTURES_DIR): string {
  return readFileSync(join(fixturesDir, htmlFileName), "utf8");
}

export function loadFixtureMetadata(fixturesDir: string = DEFAULT_FIXTURES_DIR): readonly FixtureMeta[] {
  return loadFixtureNames(fixturesDir)
    .map((name) => readFixtureMeta(`${name}.html`, fixturesDir))
    .sort((left, right) => left.fixtureName.localeCompare(right.fixtureName, "en"));
}

export function evidenceTierTag(meta: FixtureMeta): EvidenceTier {
  return meta.evidenceTier;
}

export function isCertifyingEvidence(meta: FixtureMeta): boolean {
  return (
    meta.evidenceTier === "verified-public-dom" &&
    meta.verdictExpected !== null &&
    meta.selectors.length > 0
  );
}