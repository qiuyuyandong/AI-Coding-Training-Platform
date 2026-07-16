import { join } from "node:path";
import { tmpdir } from "node:os";
import { writeFileSync, mkdtempSync, rmSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  FixtureMetaSchema,
  FixtureMetadataError,
  loadFixtureNames,
  loadFixtureMetadata,
  readFixtureMeta,
  isCertifyingEvidence,
  type FixtureMeta,
} from "@/tests/helpers/atcoderFixtureMetadata";

const FIXTURES_DIR = join(process.cwd(), "tests", "fixtures", "atcoder");

const RETAINED_FIXTURE_NAMES = [
  "submission-abc164-e-wa",
  "submission-abc443-d-tle",
  "submission-agc040-d-ac",
  "task-agc040-d",
] as const;
type FixtureName = (typeof RETAINED_FIXTURE_NAMES)[number];

const DETECTION_TIER_BY_FIXTURE: Readonly<Record<FixtureName, string>> = {
  "task-agc040-d": "public-content-accessible",
  "submission-agc040-d-ac": "verified-public-dom",
  "submission-abc164-e-wa": "verified-public-dom",
  "submission-abc443-d-tle": "verified-public-dom",
};

const PURPOSE_BY_FIXTURE: Readonly<Record<FixtureName, string>> = {
  "task-agc040-d": "both",
  "submission-agc040-d-ac": "detectVerdictFromDocument",
  "submission-abc164-e-wa": "detectVerdictFromDocument",
  "submission-abc443-d-tle": "detectVerdictFromDocument",
};

const VERDICT_EXPECTED_BY_FIXTURE: Readonly<Record<FixtureName, string | null>> = {
  "task-agc040-d": null,
  "submission-agc040-d-ac": "Accepted",
  "submission-abc164-e-wa": "Wrong Answer",
  "submission-abc443-d-tle": "Time Limit Exceeded",
};

const PROBLEM_EXPECTED_BY_FIXTURE: Readonly<Record<FixtureName, { platform: string; externalId: string } | null>> = {
  "task-agc040-d": { platform: "atcoder", externalId: "agc040_d" },
  "submission-agc040-d-ac": { platform: "atcoder", externalId: "agc040_d" },
  "submission-abc164-e-wa": { platform: "atcoder", externalId: "abc164_e" },
  "submission-abc443-d-tle": { platform: "atcoder", externalId: "abc443_d" },
};

const BASE_META: FixtureMeta = {
  fixtureName: "fixture-rejection",
  sourceUrl: "https://atcoder.jp/contests/abc001/tasks/abc001_a",
  captureDate: "2026-07-16",
  captureMethod: "test",
  evidenceTier: "public-content-accessible",
  purpose: "detectProblemFromLocation",
  selectors: [],
  authenticated: false,
  sanitized: true,
  verdictExpected: null,
  problemExpected: { platform: "atcoder", externalId: "abc001_a" },
};

const REJECTION_FIXTURES: { name: string; override: Record<string, unknown> }[] = [
  { name: "verified-public-dom-missing-verdict", override: { evidenceTier: "verified-public-dom", purpose: "detectVerdictFromDocument", selectors: ["#judge-status"], authenticated: false, verdictExpected: null, problemExpected: null } },
  { name: "sanitized-false", override: { sanitized: false } },
  { name: "unknown-evidence-tier", override: { evidenceTier: "speculative-public-dom" } },
  { name: "public-tier-smuggles-verdictExpected", override: { purpose: "detectVerdictFromDocument", selectors: [".status"], verdictExpected: { verdict: "Accepted" }, problemExpected: null } },
  { name: "characterization-derived-with-verdict", override: { evidenceTier: "characterization-derived", verdictExpected: { verdict: "Wrong Answer" }, problemExpected: null } },
  { name: "negative-purpose-with-verdictExpected", override: { evidenceTier: "characterization-derived", purpose: "negative", verdictExpected: { verdict: "Accepted" }, problemExpected: null } },
  { name: "undocumented-purpose", override: { purpose: "verdictTextExtraction" } },
];

describe("AtCoder fixture corpus", () => {
  it("exposes exactly the four retained fixture names in deterministic order", () => {
    expect(loadFixtureNames(FIXTURES_DIR)).toEqual(RETAINED_FIXTURE_NAMES);
  });

  it.each(
    RETAINED_FIXTURE_NAMES.map((name) => [
      `[${DETECTION_TIER_BY_FIXTURE[name]}] ${name} exercises its declared purpose`,
      name,
    ] as const),
  )("%s", (_label, fixtureName) => {
    const meta = readFixtureMeta(`${fixtureName}.html`, FIXTURES_DIR);
    expect(meta.fixtureName).toBe(fixtureName);
    expect(meta.evidenceTier).toBe(DETECTION_TIER_BY_FIXTURE[fixtureName]);
    expect(meta.purpose).toBe(PURPOSE_BY_FIXTURE[fixtureName]);
    expect(meta.verdictExpected?.verdict ?? null).toBe(VERDICT_EXPECTED_BY_FIXTURE[fixtureName]);
    const problemExpected = PROBLEM_EXPECTED_BY_FIXTURE[fixtureName];
    if (problemExpected === null) {
      expect(meta.problemExpected).toBeNull();
    } else {
      expect(meta.problemExpected).not.toBeNull();
      if (meta.problemExpected !== null) {
        expect(meta.problemExpected.platform).toBe(problemExpected.platform);
        expect(meta.problemExpected.externalId).toBe(problemExpected.externalId);
      }
    }
  });

  it("all verified-public-dom fixtures have non-empty selectors and authenticated=false", () => {
    const metadata = loadFixtureMetadata(FIXTURES_DIR);
    const verifiedDom = metadata.filter((m) => m.evidenceTier === "verified-public-dom");
    expect(verifiedDom.length).toBeGreaterThan(0);
    for (const meta of verifiedDom) {
      expect(meta.selectors.length).toBeGreaterThan(0);
      expect(meta.authenticated).toBe(false);
      expect(meta.verdictExpected).not.toBeNull();
    }
  });

  it("task fixture has no verdictExpected and empty selectors", () => {
    const meta = readFixtureMeta("task-agc040-d.html", FIXTURES_DIR);
    expect(meta.evidenceTier).toBe("public-content-accessible");
    expect(meta.verdictExpected).toBeNull();
    expect(meta.selectors).toEqual([]);
  });
});

describe("AtCoder fixture metadata governance", () => {
  it.each(REJECTION_FIXTURES.map((f) => [f.name] as const))(
    "rejects malformed metadata case [%s] with a non-success parse result",
    (caseName) => {
      const entry = REJECTION_FIXTURES.find((c) => c.name === caseName);
      expect(entry).toBeDefined();
      if (entry === undefined) return;
      const merged = { ...BASE_META, ...entry.override };
      expect(FixtureMetaSchema.safeParse(merged).success).toBe(false);
    },
  );

  it("pins the corpus as zero characterization-derived, three verified-public-dom, one public-content-accessible fixtures", () => {
    const metadata = loadFixtureMetadata(FIXTURES_DIR);
    expect(metadata.filter((m) => m.evidenceTier === "characterization-derived")).toHaveLength(0);
    expect(metadata.filter((m) => m.evidenceTier === "verified-public-dom")).toHaveLength(3);
    expect(metadata.filter((m) => m.evidenceTier === "public-content-accessible")).toHaveLength(1);
  });
});

describe("AtCoder isCertifyingEvidence", () => {
  it("returns true for verified-public-dom fixture with non-null verdict and non-empty selectors", () => {
    const meta = readFixtureMeta("submission-agc040-d-ac.html", FIXTURES_DIR);
    expect(isCertifyingEvidence(meta)).toBe(true);
  });

  it("returns false for public-content-accessible task fixture", () => {
    const meta = readFixtureMeta("task-agc040-d.html", FIXTURES_DIR);
    expect(isCertifyingEvidence(meta)).toBe(false);
  });
});

describe("AtCoder readFixtureMeta filesystem boundary", () => {
  it("rejects cross-platform problemExpected.platform via real filesystem", () => {
    const meta = {
      fixtureName: "cross-platform-fixture",
      sourceUrl: "https://atcoder.jp/contests/abc001/tasks/abc001_a",
      captureDate: "2026-07-16",
      captureMethod: "test",
      evidenceTier: "verified-public-dom",
      purpose: "detectVerdictFromDocument",
      selectors: ["#judge-status"],
      authenticated: false,
      sanitized: true,
      verdictExpected: { verdict: "Accepted" },
      problemExpected: { platform: "luogu", externalId: "P1001" },
    };
    const json = JSON.stringify(meta);
    const dir = mkdtempSync(join(tmpdir(), "atcoder-boundary-"));
    let thrownError: unknown;
    try {
      writeFileSync(join(dir, "cross-platform-fixture.html"), "<html></html>", "utf8");
      writeFileSync(join(dir, "cross-platform-fixture.meta.json"), json, "utf8");
      try {
        readFixtureMeta("cross-platform-fixture.html", dir);
        thrownError = null;
      } catch (e) {
        thrownError = e;
      }
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
    expect(thrownError).toBeInstanceOf(FixtureMetadataError);
    if (thrownError instanceof FixtureMetadataError) {
      expect(thrownError.message).toContain("problemExpected.platform");
    }
  });

  it("rejects authenticated=true with verified-public-dom via real filesystem", () => {
    const meta = {
      fixtureName: "auth-true-fixture",
      sourceUrl: "https://atcoder.jp/contests/abc001/tasks/abc001_a",
      captureDate: "2026-07-16",
      captureMethod: "test",
      evidenceTier: "verified-public-dom",
      purpose: "detectVerdictFromDocument",
      selectors: ["#judge-status"],
      authenticated: true,
      sanitized: true,
      verdictExpected: { verdict: "Accepted" },
      problemExpected: null,
    };
    const json = JSON.stringify(meta);
    const dir = mkdtempSync(join(tmpdir(), "atcoder-boundary-"));
    let thrownError: unknown;
    try {
      writeFileSync(join(dir, "auth-true-fixture.html"), "<html></html>", "utf8");
      writeFileSync(join(dir, "auth-true-fixture.meta.json"), json, "utf8");
      try {
        readFixtureMeta("auth-true-fixture.html", dir);
        thrownError = null;
      } catch (e) {
        thrownError = e;
      }
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
    expect(thrownError).toBeInstanceOf(FixtureMetadataError);
    if (thrownError instanceof FixtureMetadataError) {
      expect(thrownError.message).toContain("authenticated");
    }
  });

  it("rejects empty selectors with verified-public-dom via real filesystem", () => {
    const meta = {
      fixtureName: "empty-selectors-fixture",
      sourceUrl: "https://atcoder.jp/contests/abc001/tasks/abc001_a",
      captureDate: "2026-07-16",
      captureMethod: "test",
      evidenceTier: "verified-public-dom",
      purpose: "detectVerdictFromDocument",
      selectors: [],
      authenticated: false,
      sanitized: true,
      verdictExpected: { verdict: "Accepted" },
      problemExpected: null,
    };
    const json = JSON.stringify(meta);
    const dir = mkdtempSync(join(tmpdir(), "atcoder-boundary-"));
    let thrownError: unknown;
    try {
      writeFileSync(join(dir, "empty-selectors-fixture.html"), "<html></html>", "utf8");
      writeFileSync(join(dir, "empty-selectors-fixture.meta.json"), json, "utf8");
      try {
        readFixtureMeta("empty-selectors-fixture.html", dir);
        thrownError = null;
      } catch (e) {
        thrownError = e;
      }
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
    expect(thrownError).toBeInstanceOf(FixtureMetadataError);
    if (thrownError instanceof FixtureMetadataError) {
      expect(thrownError.message).toContain("selectors");
    }
  });
});
