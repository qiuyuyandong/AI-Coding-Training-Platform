import { join } from "node:path";
import { tmpdir } from "node:os";
import { writeFileSync, mkdtempSync, rmSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  detectProblemFromPage,
  detectVerdictFromDocument,
  type DetectableLocation,
} from "@/extension/src/platforms";
import {
  FixtureMetaSchema,
  FixtureMetadataError,
  loadFixtureHtml,
  loadFixtureNames,
  loadFixtureMetadata,
  readFixtureMeta,
  isCertifyingEvidence,
  type FixtureMeta,
} from "@/tests/helpers/atcoderFixtureMetadata";

function asLocation(url: string): DetectableLocation {
  const parsedUrl = new URL(url);
  return {
    href: parsedUrl.href,
    hostname: parsedUrl.hostname,
    pathname: parsedUrl.pathname,
  };
}

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
  const BASE_BOUNDARY_META = {
    sourceUrl: "https://atcoder.jp/contests/abc001/tasks/abc001_a",
    captureDate: "2026-07-16",
    captureMethod: "test",
    evidenceTier: "verified-public-dom" as const,
    purpose: "detectVerdictFromDocument",
    selectors: ["#judge-status"],
    authenticated: false,
    sanitized: true,
    verdictExpected: { verdict: "Accepted" },
  };
  const BOUNDARY_CASES = [
    ["cross-platform-fixture", { fixtureName: "cross-platform-fixture", problemExpected: { platform: "luogu", externalId: "P1001" } }, "problemExpected.platform"],
    ["auth-true-fixture", { fixtureName: "auth-true-fixture", authenticated: true, problemExpected: null }, "authenticated"],
    ["empty-selectors-fixture", { fixtureName: "empty-selectors-fixture", selectors: [], problemExpected: null }, "selectors"],
  ] as const;
  it.each(BOUNDARY_CASES)(
    "[%s] rejects malformed metadata via real filesystem with typed error",
    (fixtureName, override, expectedMessageContains) => {
      const meta = { ...BASE_BOUNDARY_META, ...override };
      const json = JSON.stringify(meta);
      const dir = mkdtempSync(join(tmpdir(), "atcoder-boundary-"));
      let thrownError: unknown;
      try {
        writeFileSync(join(dir, `${fixtureName}.html`), "<html></html>", "utf8");
        writeFileSync(join(dir, `${fixtureName}.meta.json`), json, "utf8");
        try {
          readFixtureMeta(`${fixtureName}.html`, dir);
          thrownError = null;
        } catch (e) {
          thrownError = e;
        }
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
      expect(thrownError).toBeInstanceOf(FixtureMetadataError);
      if (thrownError instanceof FixtureMetadataError) {
        expect(thrownError.message).toContain(expectedMessageContains);
      }
    },
  );
});

describe("AtCoder page-aware detector against retained fixtures", () => {
  const SUBMISSION_CASES: ReadonlyArray<readonly [
    string,
    string,
    string,
    string,
  ]> = [
    ["submission-agc040-d-ac", "https://atcoder.jp/contests/agc040/submissions/53759742", "agc040_d", "D - Balance Beam"],
    ["submission-abc164-e-wa", "https://atcoder.jp/contests/abc164/submissions/12438513", "abc164_e", "E - Two Currencies"],
    ["submission-abc443-d-tle", "https://atcoder.jp/contests/abc443/submissions/72918187", "abc443_d", "D - Pawn Line"],
  ];
  it.each(SUBMISSION_CASES)(
    "[%s] resolves via page-aware detector to canonical task URL",
    (fixtureName, submissionUrl, expectedId, expectedTitle) => {
      const doc = new DOMParser().parseFromString(loadFixtureHtml(`${fixtureName}.html`, FIXTURES_DIR), "text/html");
      const detected = detectProblemFromPage(asLocation(submissionUrl), doc);
      const contest = expectedId.split("_")[0];
      expect(detected).toEqual({
        platform: "atcoder",
        problemExternalId: expectedId,
        problemTitle: expectedTitle,
        canonicalUrl: `https://atcoder.jp/contests/${contest}/tasks/${expectedId}`,
      });
    },
  );

  it("task fixture still resolves through URL-only detection with matching identity", () => {
    const doc = new DOMParser().parseFromString(loadFixtureHtml("task-agc040-d.html", FIXTURES_DIR), "text/html");
    const taskDetected = detectProblemFromPage(
      asLocation("https://atcoder.jp/contests/agc040/tasks/agc040_d"),
      doc,
    );
    const subDoc = new DOMParser().parseFromString(loadFixtureHtml("submission-agc040-d-ac.html", FIXTURES_DIR), "text/html");
    const subDetected = detectProblemFromPage(
      asLocation("https://atcoder.jp/contests/agc040/submissions/53759742"),
      subDoc,
    );
    expect(taskDetected?.problemExternalId).toBe("agc040_d");
    expect(subDetected?.problemExternalId).toBe("agc040_d");
    expect(taskDetected?.canonicalUrl).toBe(subDetected?.canonicalUrl);
    expect(taskDetected?.canonicalUrl).toBe("https://atcoder.jp/contests/agc040/tasks/agc040_d");
  });
});

describe("AtCoder verdict against retained fixtures", () => {
  const CASES: ReadonlyArray<readonly [string, string | null]> = [
    ["submission-agc040-d-ac", "Accepted"],
    ["submission-abc164-e-wa", "Wrong Answer"],
    ["submission-abc443-d-tle", "Time Limit Exceeded"],
    ["task-agc040-d", null],
  ];
  it.each(CASES)("%s => %s", (f, e) => {
    const raw = loadFixtureHtml(`${f}.html`, FIXTURES_DIR);
    const html = raw.includes("<td ") ? raw.replace("<td ", "<table><tbody><tr><td ").replace("</td>", "</td></tr></tbody></table>") : raw;
    expect(detectVerdictFromDocument("atcoder", new DOMParser().parseFromString(html, "text/html"))).toEqual(e === null ? null : { verdict: e });
  });
});
