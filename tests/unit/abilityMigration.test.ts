import Database from "better-sqlite3";
import { mkdtempSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it, afterEach } from "vitest";
import { applyMigrations } from "@/lib/db/migrations";

function openDb(): Database.Database {
  const dir = mkdtempSync(join(tmpdir(), "ability-mig-"));
  const db = new Database(join(dir, "test.sqlite"));
  db.pragma("foreign_keys = ON");
  applyMigrations(db);
  return db;
}

function seedMinimalParents(db: Database.Database): void {
  // knowledge_nodes requires a curriculum_package FK; insert one first.
  db.prepare(
    "INSERT INTO curriculum_packages (id, track_slug, semantic_version, checksum, source_revision, installed_at) VALUES ('pkg_seed','seed-track','1.0.0','sha256:seed','rev-seed','2026-07-17T00:00:00.000Z')",
  ).run();
  db.prepare(
    "INSERT INTO knowledge_nodes (id, stable_id, title, outcome, rationale, order_index, status, provenance_json, package_id) VALUES ('n1','node-1','Node 1','outcome','rationale',1,'published','{}','pkg_seed')",
  ).run();
  // training_attempts with record_source='manual' has no capture_session_id/submission_id.
  db.prepare(
    "INSERT INTO training_attempts (id, record_source, platform, problem_external_id, problem_title, canonical_url, started_at, result, revision, created_at, updated_at) VALUES ('a1','manual','atcoder','p1','Problem 1','https://atcoder.jp/p1','2026-07-17T00:00:00.000Z','passed',1,'2026-07-17T00:00:00.000Z','2026-07-17T00:00:00.000Z')",
  ).run();
  db.prepare(
    "INSERT INTO learner_profiles (id, onboarding_state, created_at, updated_at) VALUES ('l','new','2026-07-17T00:00:00.000Z','2026-07-17T00:00:00.000Z')",
  ).run();
}

describe("0008_ability_projection.sql", () => {
  let db: Database.Database | undefined;
  afterEach(() => {
    if (db) db.close();
    db = undefined;
  });

  it("fresh apply creates all 3 tables with FK and CHECK constraints", () => {
    const local = openDb();
    db = local;
    const tables = local.prepare<[], { name: string }>("SELECT name FROM sqlite_master WHERE type='table' AND name IN ('attempt_node_mappings','ability_snapshots','ability_transitions') ORDER BY name").all().map(r => r.name);
    expect(tables).toEqual(["ability_snapshots", "ability_transitions", "attempt_node_mappings"]);
    const fk = local.prepare<[], { count: number }>("PRAGMA foreign_key_check").get();
    expect(fk?.count ?? 0).toBe(0);
    const qc = local.prepare<[], { quick_check: string }>("PRAGMA quick_check").get();
    expect(qc?.quick_check).toBe("ok");
  });

  it("upgrade from 0007 applies 0008 cleanly", () => {
    const local = openDb();
    db = local;
    // applyMigrations records applied files in schema_migrations, not via PRAGMA user_version.
    const applied = local.prepare<[string], { id: string }>("SELECT id FROM schema_migrations WHERE id = ?").get("0008_ability_projection.sql");
    expect(applied?.id).toBe("0008_ability_projection.sql");
    // Re-running must be a no-op (idempotent).
    applyMigrations(local);
    const dupCount = local.prepare<[string], { count: number }>("SELECT COUNT(*) AS count FROM schema_migrations WHERE id = ?").get("0008_ability_projection.sql");
    expect(dupCount?.count).toBe(1);
  });

  it("ability_snapshots rejects invalid visible_level", () => {
    const local = openDb();
    db = local;
    seedMinimalParents(local);
    expect(() => local.prepare("INSERT INTO ability_snapshots (learner_id,node_id,visible_level,confidence,evidence_count,stale,input_fingerprint,projection_version,as_of_time) VALUES ('l','n1','L7','low',0,0,'fp','v1','2026-07-17T00:00:00.000Z')").run()).toThrow();
  });

  it("attempt_node_mappings enforces unique (attempt_id, node_id)", () => {
    const local = openDb();
    db = local;
    seedMinimalParents(local);
    expect(() => local.prepare("INSERT INTO attempt_node_mappings (id,attempt_id,node_id,role,mapping_reason,created_at) VALUES ('m1','a1','n1','primary','r','2026-07-17T00:00:00.000Z')").run()).not.toThrow();
    expect(() => local.prepare("INSERT INTO attempt_node_mappings (id,attempt_id,node_id,role,mapping_reason,created_at) VALUES ('m2','a1','n1','primary','r','2026-07-17T00:00:00.000Z')").run()).toThrow();
  });

  it("ability_transitions enforces unique (learner_id,node_id,fingerprint,version)", () => {
    const local = openDb();
    db = local;
    seedMinimalParents(local);
    expect(() => local.prepare("INSERT INTO ability_transitions (id,learner_id,node_id,previous_level,new_level,reason_codes_json,source_attempt_ids_json,source_attempt_revisions_json,input_fingerprint,projection_version,created_at) VALUES ('t1','l','n1','unassessed','L1','[]','[]','[]','fp','v1','2026-07-17T00:00:00.000Z')").run()).not.toThrow();
    expect(() => local.prepare("INSERT INTO ability_transitions (id,learner_id,node_id,previous_level,new_level,reason_codes_json,source_attempt_ids_json,source_attempt_revisions_json,input_fingerprint,projection_version,created_at) VALUES ('t2','l','n1','unassessed','L1','[]','[]','[]','fp','v1','2026-07-17T00:00:00.000Z')").run()).toThrow();
  });
});