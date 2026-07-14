import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  detectProblemFromLocation,
  detectVerdictFromDocument,
  type DetectableLocation,
  type DetectedProblem,
  type DetectedVerdict,
} from "@/extension/src/platforms";
import {
  FixtureMetaSchema,
  type EvidenceTier,
  type FixtureMeta,
  type Purpose,
  loadFixtureHtml,
  loadFixtureNames,
  readFixtureMeta,
} from "@/tests/helpers/luoguFixtureMetadata";

const FIXTURES_DIR = join(process.cwd(), "tests", "fixtures", "luogu");

const RETAINED_FIXTURE_NAMES = [
  "no-verdict-problem",
  "problem-b3619",
  "problem-cf-1a",
  "problem-p1001",
] as const;
type FixtureName = (typeof RETAINED_FIXTURE_NAMES)[number];

const DETECTION_TIER_BY_FIXTURE: Readonly<Record<FixtureName, EvidenceTier>> = {
  "no-verdict-problem": "characterization-derived",
  "problem-b3619": "public-content-accessible",
  "problem-cf-1a": "public-content-accessible",
  "problem-p1001": "public-content-accessible",
};

const PURPOSE_BY_FIXTURE: Readonly<Record<FixtureName, Purpose>> = {
  "no-verdict-problem": "detectVerdictFromDocument",
  "problem-b3619": "detectProblemFromLocation",
  "problem-cf-1a": "detectProblemFromLocation",
  "problem-p1001": "detectProblemFromLocation",
};

function asLocation(url: string): DetectableLocation {
  const parsed = new URL(url);
  return { href: parsed.href, hostname: parsed.hostname, pathname: parsed.pathname };
}

function titleFromHtml(html: string): string {
  return new DOMParser().parseFromString(html, "text/html").title;
}

function documentFromHtml(html: string): Document {
  return new DOMParser().parseFromString(html, "text/html");
}

function runProblemDetection(meta: FixtureMeta, html: string): DetectedProblem | null {
  return detectProblemFromLocation(asLocation(meta.sourceUrl), titleFromHtml(html));
}

function runVerdictDetection(meta: FixtureMeta, html: string): DetectedVerdict | null {
  return detectVerdictFromDocument("luogu", documentFromHtml(html));
}

function runFixtureCase(fixtureName: FixtureName): void {
  const meta = readFixtureMeta(`${fixtureName}.html`, FIXTURES_DIR);
  const html = loadFixtureHtml(`${fixtureName}.html`, FIXTURES_DIR);
  expect(meta.evidenceTier).toBe(DETECTION_TIER_BY_FIXTURE[fixtureName]);
  expect(meta.purpose).toBe(PURPOSE_BY_FIXTURE[fixtureName]);
  if (fixtureName === "no-verdict-problem") {
    expect(runVerdictDetection(meta, html)).toBeNull();
    return;
  }
  const detected = runProblemDetection(meta, html);
  const problemExpected = meta.problemExpected;
  expect(detected).not.toBeNull();
  expect(problemExpected).not.toBeNull();
  if (detected === null || problemExpected === null) throw new Error("unreachable");
  expect(detected.platform).toBe(problemExpected.platform);
  expect(detected.problemExternalId).toBe(problemExpected.externalId);
}

const REJECTION_BASE = {
  fixtureName: "fixture-rejection",
  sourceUrl: "https://www.luogu.com.cn/problem/P1001",
  captureDate: "2026-07-14",
  captureMethod: "test",
  evidenceTier: "public-content-accessible",
  purpose: "detectProblemFromLocation",
  selectors: [],
  authenticated: false,
  sanitized: true,
  verdictExpected: null,
  problemExpected: { platform: "luogu", externalId: "P1001" },
};

const REJECTION_FIXTURES: ReadonlyArray<{ readonly name: string; readonly override: Record<string, unknown> }> = [
  { name: "sanitized=false", override: { sanitized: false } },
  { name: "unknown-evidence-tier", override: { evidenceTier: "speculative-public-dom" } },
  {
    name: "public-tier-smuggles-verdictExpected",
    override: { purpose: "detectVerdictFromDocument", selectors: [".status"], verdictExpected: { verdict: "Accepted" }, problemExpected: null },
  },
  {
    name: "verified-tier-missing-verdictExpected",
    override: { evidenceTier: "verified-public-dom", purpose: "detectVerdictFromDocument", selectors: [".status"], problemExpected: null },
  },
  {
    name: "verified-tier-missing-selector-provenance",
    override: { evidenceTier: "verified-public-dom", purpose: "detectVerdictFromDocument", verdictExpected: { verdict: "Accepted" }, problemExpected: null },
  },
  {
    name: "negative-purpose-with-verdictExpected",
    override: { evidenceTier: "characterization-derived", purpose: "negative", verdictExpected: { verdict: "Accepted" }, problemExpected: null },
  },
  { name: "undocumented-purpose", override: { purpose: "verdictTextExtraction" } },
];

function readHtmlFile(name: string): string {
  return readFileSync(join(FIXTURES_DIR, name), "utf8");
}

describe("Luogu fixture corpus", () => {
  it("exposes exactly the four retained fixture names in deterministic order", () => {
    expect(loadFixtureNames(FIXTURES_DIR)).toEqual(RETAINED_FIXTURE_NAMES);
  });

  it.each(
    RETAINED_FIXTURE_NAMES.map((name) => [
      `[${DETECTION_TIER_BY_FIXTURE[name]}] ${name} exercises its declared purpose without DOM certification leakage`,
      name,
    ] as const),
  )("%s", (_label, fixtureName) => {
    runFixtureCase(fixtureName);
  });

  it("reads each retained fixture HTML body without DOM fabrication", () => {
    for (const name of RETAINED_FIXTURE_NAMES) {
      const html = readHtmlFile(`${name}.html`);
      expect(typeof html).toBe("string");
      const meta = readFixtureMeta(`${name}.html`, FIXTURES_DIR);
      expect(meta.fixtureName).toBe(name);
    }
  });
});

describe("Luogu fixture metadata governance", () => {
  it.each(REJECTION_FIXTURES.map((f) => [f.name] as const))(
    "rejects malformed metadata case [%s] with a non-success parse result",
    (caseName) => {
      const entry = REJECTION_FIXTURES.find((c) => c.name === caseName);
      if (entry === undefined) throw new Error(`rejection fixture ${caseName} missing`);
      const merged = { ...REJECTION_BASE, ...entry.override };
      expect(FixtureMetaSchema.safeParse(merged).success).toBe(false);
    },
  );

  it("pins the corpus as one characterization-derived negative fixture and zero verified-public-dom fixtures", () => {
    expect(RETAINED_FIXTURE_NAMES.filter((n) => DETECTION_TIER_BY_FIXTURE[n] === "characterization-derived")).toEqual(["no-verdict-problem"]);
    expect(RETAINED_FIXTURE_NAMES.filter((n) => DETECTION_TIER_BY_FIXTURE[n] === "verified-public-dom")).toEqual([]);
  });
});