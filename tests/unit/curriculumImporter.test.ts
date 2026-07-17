import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it, afterEach } from "vitest";
import Database from "better-sqlite3";
import { applyMigrations } from "@/lib/db/migrations";
import {
  importPackage,
  type ImportResult,
} from "@/lib/curriculum/importPackage";
import { computeChecksumInput } from "@/lib/curriculum/validatePackage";
import { loadPackageFromDisk } from "@/lib/curriculum/importPackage";

const SAMPLE_FIXTURE = join(process.cwd(), "tests", "fixtures", "curriculum", "sample-package");

function openTmpDbWithDir(): { db: Database.Database; tmp: string } {
  const tmp = mkdtempSync(join(tmpdir(), "curriculum-importer-test-"));
  const db = new Database(join(tmp, "test.sqlite"));
  applyMigrations(db);
  return { db, tmp };
}

describe("importPackage", () => {
  let db: Database.Database;
  let tmp: string;

  afterEach(() => {
    if (db) {
      db.close();
      db = undefined as unknown as Database.Database;
    }
    if (tmp) {
      try {
        rmSync(tmp, { recursive: true, force: true });
      } catch { /* ignore */ }
      tmp = undefined as unknown as string;
    }
  });

  it("imports sample-package fixture successfully", () => {
    const opened = openTmpDbWithDir();
    db = opened.db;
    tmp = opened.tmp;
    const result = importPackage(db, SAMPLE_FIXTURE) as ImportResult & { ok: true };
    expect(result.ok).toBe(true);
    expect(result.replayed).toBe(false);

    const row = db.prepare("SELECT * FROM curriculum_packages WHERE id = ?").get(result.package_id) as {
      track_slug: string;
      semantic_version: string;
      checksum: string;
    };
    expect(row.track_slug).toBe("sample-package");
    expect(row.semantic_version).toBe("1.0.0");
    expect(row.checksum).toMatch(/^[a-f0-9]{64}$/);

    const careerCount = (db.prepare("SELECT COUNT(*) AS c FROM career_tracks").get() as { c: number }).c;
    expect(careerCount).toBe(9);

    const fkCheck = db.prepare(`
      SELECT COUNT(*) AS c FROM curriculum_packages cp
      LEFT JOIN knowledge_nodes kn ON kn.package_id = cp.id
      LEFT JOIN career_tracks ct ON ct.package_id = cp.id
      WHERE cp.id = ?
    `).get(result.package_id) as { c: number };
    expect(fkCheck.c).toBeGreaterThan(0);

    const quickCheck = db.prepare("PRAGMA quick_check").get() as { quick_check: string };
    expect(quickCheck.quick_check).toBe("ok");
  });

  it("re-importing identical fixture returns replayed=true", () => {
    const opened = openTmpDbWithDir();
    db = opened.db;
    tmp = opened.tmp;
    const first = importPackage(db, SAMPLE_FIXTURE) as ImportResult & { ok: true };
    expect(first.ok).toBe(true);
    expect(first.replayed).toBe(false);

    const second = importPackage(db, SAMPLE_FIXTURE) as ImportResult & { ok: true };
    expect(second.ok).toBe(true);
    expect(second.replayed).toBe(true);
    expect(second.package_id).toBe(first.package_id);
  });

  it("importing 1.0.1 after 1.0.0 succeeds", () => {
    const opened = openTmpDbWithDir();
    db = opened.db;
    tmp = opened.tmp;
    const loaded = loadPackageFromDisk(SAMPLE_FIXTURE);

    const pkg101 = join(tmp, "v101");
    mkdirSync(pkg101, { recursive: true });
    const { manifest, nodes, edges, resources, practiceMappings, careers } = loaded;
    const v101 = {
      manifest: { ...manifest, semantic_version: "1.0.1" },
      nodes,
      edges,
      resources,
      practiceMappings,
      careers,
    };
    v101.manifest.checksum_input = computeChecksumInput(v101);

    writeFileSync(join(pkg101, "manifest.json"), JSON.stringify(v101.manifest));
    writeFileSync(join(pkg101, "nodes.json"), JSON.stringify(v101.nodes));
    writeFileSync(join(pkg101, "edges.json"), JSON.stringify(v101.edges));
    writeFileSync(join(pkg101, "resources.json"), JSON.stringify(v101.resources));
    writeFileSync(join(pkg101, "practice-mappings.json"), JSON.stringify(v101.practiceMappings));
    const careersDir = join(pkg101, "careers");
    mkdirSync(careersDir, { recursive: true });
    writeFileSync(join(careersDir, "career-directions-v1.json"), JSON.stringify(v101.careers));

    const r1 = importPackage(db, SAMPLE_FIXTURE) as ImportResult & { ok: true };
    expect(r1.ok).toBe(true);
    expect(r1.semantic_version).toBe("1.0.0");

    const r2 = importPackage(db, pkg101) as ImportResult & { ok: true };
    expect(r2.ok).toBe(true);
    expect(r2.semantic_version).toBe("1.0.1");

    const rows = db.prepare("SELECT COUNT(*) AS c FROM curriculum_packages").get() as { c: number };
    expect(rows.c).toBe(2);
  });

  it("importing 1.0.0 after 1.0.1 throws ImmutableError", async () => {
    const opened = openTmpDbWithDir();
    db = opened.db;
    tmp = opened.tmp;
    const loaded = loadPackageFromDisk(SAMPLE_FIXTURE);

    const pkg101 = join(tmp, "v101");
    mkdirSync(pkg101, { recursive: true });
    const { manifest, nodes, edges, resources, practiceMappings, careers } = loaded;
    const v101 = {
      manifest: { ...manifest, semantic_version: "1.0.1" },
      nodes,
      edges,
      resources,
      practiceMappings,
      careers,
    };
    v101.manifest.checksum_input = computeChecksumInput(v101);

    writeFileSync(join(pkg101, "manifest.json"), JSON.stringify(v101.manifest));
    writeFileSync(join(pkg101, "nodes.json"), JSON.stringify(v101.nodes));
    writeFileSync(join(pkg101, "edges.json"), JSON.stringify(v101.edges));
    writeFileSync(join(pkg101, "resources.json"), JSON.stringify(v101.resources));
    writeFileSync(join(pkg101, "practice-mappings.json"), JSON.stringify(v101.practiceMappings));
    const careersDir = join(pkg101, "careers");
    mkdirSync(careersDir, { recursive: true });
    writeFileSync(join(careersDir, "career-directions-v1.json"), JSON.stringify(v101.careers));

    expect(importPackage(db, pkg101)).toMatchObject({ ok: true });

    expect(() => importPackage(db, SAMPLE_FIXTURE)).toThrow("cannot replace the higher");
  });

  it("importing with bad checksum_input returns ok=false and inserts no rows", () => {
    const opened = openTmpDbWithDir();
    db = opened.db;
    tmp = opened.tmp;
    const countBefore = (db.prepare("SELECT COUNT(*) AS c FROM curriculum_packages").get() as { c: number }).c;

    const loaded = loadPackageFromDisk(SAMPLE_FIXTURE);
    const badChecksum = loaded;
    badChecksum.manifest.checksum_input = "this-is-a-bad-checksum";

    const badPkg = join(tmp, "bad");
    mkdirSync(badPkg, { recursive: true });
    writeFileSync(join(badPkg, "manifest.json"), JSON.stringify(badChecksum.manifest));
    writeFileSync(join(badPkg, "nodes.json"), JSON.stringify(badChecksum.nodes));
    writeFileSync(join(badPkg, "edges.json"), JSON.stringify(badChecksum.edges));
    writeFileSync(join(badPkg, "resources.json"), JSON.stringify(badChecksum.resources));
    writeFileSync(join(badPkg, "practice-mappings.json"), JSON.stringify(badChecksum.practiceMappings));
    const careersDir = join(badPkg, "careers");
    mkdirSync(careersDir, { recursive: true });
    writeFileSync(join(careersDir, "career-directions-v1.json"), JSON.stringify(badChecksum.careers));

    const result = importPackage(db, badPkg);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    const codes = result.errors.map((e) => e.code);
    expect(codes.some((c) => c.includes("checksum") || c.includes("Checksum"))).toBe(true);

    const countAfter = (db.prepare("SELECT COUNT(*) AS c FROM curriculum_packages").get() as { c: number }).c;
    expect(countAfter).toBe(countBefore);
  });
});
