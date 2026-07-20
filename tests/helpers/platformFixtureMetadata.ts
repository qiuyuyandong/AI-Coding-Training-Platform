import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import type { Platform } from "@/lib/domain/source";

// The certifying evidence taxonomy used by the platform certification gate.
// `authenticated-characterization` lives outside this taxonomy because it
// can NEVER contribute to a production-promotion gate; keeping it here would
// either restrict the metadata schema (breaking the "locally observed with
// sanitization" use case) or weaken the certifying arithmetic (letting a
// non-certifying fixture silently bump a coverage counter).
export const EVIDENCE_TIERS = [
  "public-content-accessible",
  "verified-public-dom",
  "characterization-derived",
] as const;
export type EvidenceTier = (typeof EVIDENCE_TIERS)[number];

// Non-certifying evidence tiers accepted by the metadata schema. Each tier
// in this list deliberately fails `isCertifyingEvidence` and never contributes
// to the certification coverage counters. The single entry represents
// characterization-only fixtures backed by user-authorized, sanitized DOM
// captured from a logged-in browser session.
export const NONCERTIFYING_EVIDENCE_TIERS = ["authenticated-characterization"] as const;
export type NoncertifyingEvidenceTier = (typeof NONCERTIFYING_EVIDENCE_TIERS)[number];

export const ALL_EVIDENCE_TIERS = [
  ...EVIDENCE_TIERS,
  ...NONCERTIFYING_EVIDENCE_TIERS,
] as const;
export type AllEvidenceTier = (typeof ALL_EVIDENCE_TIERS)[number];

export const PURPOSES = [
  "detectProblemFromLocation",
  "detectProblemFromPage",
  "detectVerdictFromDocument",
  "both",
  "negative",
] as const;
export type Purpose = (typeof PURPOSES)[number];

export class FixtureMetadataError extends Error {
  public readonly path: string;

  public constructor(path: string, message: string) {
    super(`${path}: ${message}`);
    this.name = "FixtureMetadataError";
    this.path = path;
  }
}

function firstPurposeToken(value: string): Purpose | undefined {
  return PURPOSES.find(
    (p) =>
      value === p ||
      value.startsWith(`${p} `) ||
      value.startsWith(`${p} \u2014`) ||
      value.startsWith(`${p}\u2014`),
  );
}

/**
 * Creates a platform-scoped fixture metadata schema.
 * @param expectedPlatform - The platform this schema should validate against
 */
export function PlatformFixtureMetaSchema(expectedPlatform: Platform) {
  return z
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
      evidenceTier: z.enum(ALL_EVIDENCE_TIERS),
      verdictExpected: z.object({ verdict: z.string().min(1) }).strict().nullable(),
      problemExpected: z
        .object({ platform: z.literal(expectedPlatform), externalId: z.string().min(1) })
        .strict()
        .nullable(),
    })
    .strict()
    .superRefine((value, context) => {
      const reject = (path: string, message: string): void => {
        context.addIssue({ code: z.ZodIssueCode.custom, path: [path], message });
      };

      // verified-public-dom requires authenticated === false
      if (value.evidenceTier === "verified-public-dom") {
        if (value.authenticated !== false) {
          reject("authenticated", "verified-public-dom REQUIRES authenticated === false");
        }
        if (value.verdictExpected === null) {
          reject("verdictExpected", "verified-public-dom REQUIRES non-null verdictExpected");
        }
        if (value.selectors.length === 0) {
          reject("selectors", "verified-public-dom MUST document selector provenance");
        }
      }

      if (value.evidenceTier === "public-content-accessible" && value.verdictExpected !== null) {
        reject("verdictExpected", "public-content-accessible MUST have verdictExpected === null");
      }
      if (value.evidenceTier === "characterization-derived" && value.verdictExpected !== null) {
        reject("verdictExpected", "characterization-derived MUST have verdictExpected === null");
      }
      if (value.evidenceTier === "characterization-derived" && value.selectors.length > 0) {
        reject("selectors", "characterization-derived MUST have empty selectors");
      }

      // authenticated-characterization is the non-certifying tier recorded
      // from user-authorized logged-in DOM. It explicitly REQUIRES:
      //   authenticated === true (we did observe inside a login session)
      //   sanitized === true (already pinned by the literal above)
      //   non-null verdictExpected (some visible verdict was observed)
      //   non-empty selector provenance (the exact narrow selector or
      //   semantic extractor used to capture it)
      // It MUST NEVER contribute to any certifying gate.
      if (value.evidenceTier === "authenticated-characterization") {
        if (value.authenticated !== true) {
          reject(
            "authenticated",
            "authenticated-characterization REQUIRES authenticated === true",
          );
        }
        if (value.verdictExpected === null) {
          reject(
            "verdictExpected",
            "authenticated-characterization REQUIRES non-null verdictExpected",
          );
        }
        if (value.selectors.length === 0) {
          reject(
            "selectors",
            "authenticated-characterization REQUIRES non-empty selector/extractor provenance",
          );
        }
      }

      if (value.purpose === "negative" && value.verdictExpected !== null) {
        reject("verdictExpected", "negative purpose MUST have verdictExpected === null");
      }
    });
}

export type FixtureMeta = z.infer<ReturnType<typeof PlatformFixtureMetaSchema>>;

type PlatformFixtureSchema = ReturnType<typeof PlatformFixtureMetaSchema>;

export function parseFixtureMeta<Schema extends PlatformFixtureSchema>(
  raw: string,
  schema: Schema,
): z.infer<Schema> {
  const parsedJson: unknown = JSON.parse(raw);
  return schema.parse(parsedJson);
}

export function metaPathFor(
  htmlFileName: string,
  fixturesDir: string,
): string {
  return join(fixturesDir, htmlFileName.replace(/\.html$/, ".meta.json"));
}

export function readFixtureMeta<Schema extends PlatformFixtureSchema>(
  htmlFileName: string,
  fixturesDir: string,
  schema: Schema,
): z.infer<Schema> {
  const metaPath = metaPathFor(htmlFileName, fixturesDir);
  let raw: string;
  try {
    raw = readFileSync(metaPath, "utf8");
  } catch {
    throw new FixtureMetadataError(metaPath, "missing sibling metadata file");
  }
  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(raw);
  } catch {
    throw new FixtureMetadataError(metaPath, "metadata is not valid JSON");
  }
  const result = schema.safeParse(parsedJson);
  if (!result.success) {
    const detail = result.error.issues
      .map((i) => `${i.path.join(".") || "<root>"}: ${i.message}`)
      .join("; ");
    throw new FixtureMetadataError(metaPath, `metadata rejected: ${detail}`);
  }
  return result.data;
}

export function loadFixtureNames(fixturesDir: string): readonly string[] {
  return readdirSync(fixturesDir)
    .filter((n) => n.endsWith(".html"))
    .sort((a, b) => a.localeCompare(b, "en"))
    .map((e) => e.replace(/\.html$/, ""));
}

export function loadFixtureHtml(
  htmlFileName: string,
  fixturesDir: string,
): string {
  return readFileSync(join(fixturesDir, htmlFileName), "utf8");
}

export function loadFixtureMetadata<Schema extends PlatformFixtureSchema>(
  fixturesDir: string,
  schema: Schema,
): readonly z.infer<Schema>[] {
  return loadFixtureNames(fixturesDir)
    .map((name) => readFixtureMeta(`${name}.html`, fixturesDir, schema))
    .sort((left, right) => left.fixtureName.localeCompare(right.fixtureName, "en"));
}

export function evidenceTierTag(meta: FixtureMeta): AllEvidenceTier {
  return meta.evidenceTier;
}

/**
 * True iff the metadata's evidence tier falls within the non-certifying
 * subset. Such fixtures may be recorded for characterization but never
 * contribute to a production-promotion gate. Pinning this set explicitly
 * makes it impossible for a future caller to silently inflate a coverage
 * counter by accepting an authenticated-characterization fixture as if it
 * were public evidence.
 */
export function isNoncertifyingEvidence(meta: FixtureMeta): boolean {
  return meta.evidenceTier === "authenticated-characterization";
}

export function isCertifyingEvidence(meta: FixtureMeta): boolean {
  return (
    meta.evidenceTier === "verified-public-dom" &&
    meta.verdictExpected !== null &&
    meta.selectors.length > 0 &&
    meta.authenticated === false
  );
}
