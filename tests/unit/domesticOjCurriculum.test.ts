import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import Database from "better-sqlite3";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { applyMigrations } from "@/lib/db/migrations";
import {
  importPackage,
  loadPackageFromDisk,
} from "@/lib/curriculum/importPackage";
import {
  computeChecksumInput,
  validatePackage,
} from "@/lib/curriculum/validatePackage";

/**
 * Domestic-OJ curriculum package (1.0.1) assertions.
 *
 * 2026-07-20 1.0.1 promotion:
 *   - 12 published node identities stay stable while OJ-specific stopping
 *     guidance follows the domestic practice links.
 *   - 11 OJ practice tasks route exclusively through the three domestic
 *     platforms (`luogu`, `leetcode` (CN), `nowcoder`); the 12th is the
 *     unchanged Git manual tutorial.
 *   - No learner-facing practice URL points at `atcoder.jp`,
 *     `leetcode.com`, or any `codeforces.com` host.
 *   - The different-slug 1.0.0 synthetic sample package and the real 1.0.1
 *     software-development-foundations package coexist: the 1.0.0 install replays as
 *     `replayed=true`; the 1.0.1 install lands as a fresh package with
 *     the latest-installed ordering winning for `findActiveCurriculumPackageId`.
 *   - Existing learner/attempt rows must remain untouched by the second
 *     install.
 */

const V101_PACKAGE = join(
  process.cwd(),
  "content",
  "tracks",
  "software-development-foundations-v1",
);
const SAMPLE_FIXTURE = join(
  process.cwd(),
  "tests",
  "fixtures",
  "curriculum",
  "sample-package",
);

const FORBIDDEN_HOSTS = [
  "atcoder.jp",
  "leetcode.com",
  "codeforces.com",
];

function collectPracticeUrls(): readonly { url: string; platform: string }[] {
  const raw = loadPackageFromDisk(V101_PACKAGE).practiceMappings;
  const urls: { url: string; platform: string }[] = [];
  for (const mapping of raw) {
    for (const source of mapping.sources ?? []) {
      urls.push({ url: source.url, platform: source.platform });
    }
  }
  return urls;
}

function collectResourceUrls(): readonly { url: string }[] {
  const raw = loadPackageFromDisk(V101_PACKAGE).resources;
  return raw.map((entry) => ({ url: entry.url }));
}

describe("curriculum package 1.0.1 metadata", () => {
  it("uses semantic_version 1.0.1 and the 2026-07-20 source revision", () => {
    const manifest = loadPackageFromDisk(V101_PACKAGE).manifest;
    expect(manifest.semantic_version).toBe("1.0.1");
    expect(manifest.source_revision).toBe("v0-domestic-oj-2026-07-20");
  });

  it("has a checksum_input that matches the canonical concatenation of the package files", () => {
    const loaded = loadPackageFromDisk(V101_PACKAGE);
    const expected = computeChecksumInput(loaded);
    expect(loaded.manifest.checksum_input).toBe(expected);
  });

  it("validates end-to-end via validatePackage", () => {
    const loaded = loadPackageFromDisk(V101_PACKAGE);
    const result = validatePackage(loaded);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.normalized.packageId).toBe(
      "pkg_software-development-foundations-v1_1_0_1",
    );
    expect(result.normalized.counts).toEqual({
      nodes: 12,
      edges: 13,
      resources: 12,
      practiceMappings: 12,
      careers: 9,
    });
  });
});

describe("curriculum package 1.0.1 platform coverage", () => {
  const practiceUrls = collectPracticeUrls();
  const resourceUrls = collectResourceUrls();

  it("contains 11 OJ practice tasks plus 1 manual exercise", () => {
    const ojTasks = practiceUrls.filter(
      (entry) => entry.platform !== "manual",
    );
    const manualTasks = practiceUrls.filter(
      (entry) => entry.platform === "manual",
    );
    expect(ojTasks.length).toBe(11);
    expect(manualTasks.length).toBe(1);
  });

  it("uses all three domestic OJ platforms (luogu, leetcode, nowcoder)", () => {
    const domesticPlatforms = new Set(
      practiceUrls.map((entry) => entry.platform),
    );
    expect(domesticPlatforms.has("luogu")).toBe(true);
    expect(domesticPlatforms.has("leetcode")).toBe(true);
    expect(domesticPlatforms.has("nowcoder")).toBe(true);
  });

  it("does not place any learner-facing practice URL on a foreign OJ host", () => {
    for (const entry of practiceUrls) {
      for (const host of FORBIDDEN_HOSTS) {
        expect(entry.url.includes(host)).toBe(false);
      }
    }
  });

  it("keeps every URL on the http(s) scheme with a parseable hostname", () => {
    for (const entry of [...practiceUrls, ...resourceUrls]) {
      const parsed = new URL(entry.url);
      expect(parsed.protocol).toMatch(/^https?:$/);
      expect(parsed.hostname.length).toBeGreaterThan(0);
    }
  });
});

describe("curriculum package 1.0.1 coexistence with the 1.0.0 synthetic fixture", () => {
  let tmp = "";
  let db: Database.Database | undefined;

  function currentDb(): Database.Database {
    if (db === undefined) throw new Error("Domestic curriculum test database is not open");
    return db;
  }

  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), "domestic-oj-coexist-"));
    db = new Database(join(tmp, "test.sqlite"));
    applyMigrations(db);
  });

  afterEach(() => {
    if (db !== undefined) {
      db.close();
      db = undefined;
    }
    if (tmp !== "") {
      try {
        rmSync(tmp, { recursive: true, force: true });
      } catch {
        /* ignore */
      }
      tmp = "";
    }
  });

  it("imports the 1.0.1 package after a 1.0.0 synthetic install and keeps both rows", () => {
    const handle = currentDb();
    const first = importPackage(handle, SAMPLE_FIXTURE, {
      now: () => "2026-07-20T00:00:00.000Z",
    });
    if (!first.ok) throw new Error(`sample import failed: ${JSON.stringify(first.errors)}`);
    expect(first.semantic_version).toBe("1.0.0");

    // Capture pre-existing learner/attempt state so we can confirm the
    // 1.0.1 install does not delete it.
    handle
      .prepare(
        `INSERT INTO learner_profiles (id, onboarding_state, created_at, updated_at)
         VALUES (?, ?, ?, ?)`,
      )
      .run(
        "local-default-learner",
        "new",
        "2026-07-17T00:00:00.000Z",
        "2026-07-17T00:00:00.000Z",
      );
    const learnerRowCount = (
      handle.prepare<[], { readonly c: number }>(
        "SELECT COUNT(*) AS c FROM learner_profiles",
      ).get()?.c ?? 0
    );

    const second = importPackage(handle, V101_PACKAGE, {
      now: () => "2026-07-20T00:00:01.000Z",
    });
    if (!second.ok) throw new Error(`1.0.1 import failed: ${JSON.stringify(second.errors)}`);
    expect(second.semantic_version).toBe("1.0.1");
    expect(second.replayed).toBe(false);
    expect(second.package_id).toBe(
      "pkg_software-development-foundations-v1_1_0_1",
    );

    const packages = handle
      .prepare<[], { readonly id: string; readonly semantic_version: string }>(
        `SELECT id, semantic_version FROM curriculum_packages ORDER BY semantic_version ASC`,
      )
      .all();
    expect(packages.map((row) => row.semantic_version)).toEqual([
      "1.0.0",
      "1.0.1",
    ]);

    // The real package was installed later and therefore wins under the
    // production active-package ordering rule.
    const active = handle
      .prepare<[], { readonly id: string }>(
        `SELECT id FROM curriculum_packages ORDER BY installed_at DESC, id DESC LIMIT 1`,
      )
      .get();
    expect(active?.id).toBe("pkg_software-development-foundations-v1_1_0_1");

    // Learner rows survive the second import.
    const afterLearnerCount = (
      handle.prepare<[], { readonly c: number }>(
        "SELECT COUNT(*) AS c FROM learner_profiles",
      ).get()?.c ?? 0
    );
    expect(afterLearnerCount).toBe(learnerRowCount);
  });

  it("a re-import of the 1.0.1 package replays without duplicating rows", () => {
    const handle = currentDb();
    const first = importPackage(handle, V101_PACKAGE);
    if (!first.ok) throw new Error(`first 1.0.1 import failed: ${JSON.stringify(first.errors)}`);
    expect(first.replayed).toBe(false);

    const beforeCount = (
      handle.prepare<[], { readonly c: number }>(
        "SELECT COUNT(*) AS c FROM curriculum_packages",
      ).get()?.c ?? 0
    );

    const second = importPackage(handle, V101_PACKAGE);
    if (!second.ok) throw new Error(`second 1.0.1 import failed: ${JSON.stringify(second.errors)}`);
    expect(second.replayed).toBe(true);
    expect(second.package_id).toBe(first.package_id);

    const afterCount = (
      handle.prepare<[], { readonly c: number }>(
        "SELECT COUNT(*) AS c FROM curriculum_packages",
      ).get()?.c ?? 0
    );
    expect(afterCount).toBe(beforeCount);

    const practiceRows = (
      handle.prepare<[], { readonly c: number }>(
        "SELECT COUNT(*) AS c FROM practice_tasks",
      ).get()?.c ?? 0
    );
    expect(practiceRows).toBe(12);
  });
});
