import {
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";
import { afterEach, describe, expect, it } from "vitest";
import { applyMigrations } from "@/lib/db/migrations";

const tempDirs: string[] = [];
const tempDatabases: Database.Database[] = [];

const MIGRATIONS_DIR = join(process.cwd(), "lib", "db", "migrations");

const NEW_TABLE_NAMES = [
  "curriculum_packages",
  "career_tracks",
  "knowledge_nodes",
  "knowledge_edges",
  "learning_resources",
  "canonical_problems",
  "canonical_problem_sources",
  "practice_tasks",
  "node_resources",
  "node_practice_mappings",
] as const;

const NEW_INDEX_NAMES = [
  "idx_career_tracks_status",
  "idx_knowledge_nodes_status_order",
  "idx_knowledge_nodes_package",
  "idx_knowledge_edges_from",
  "idx_knowledge_edges_to",
  "idx_learning_resources_status",
  "idx_practice_tasks_package",
  "idx_node_resources_node",
  "idx_node_practice_node",
] as const;

function makeTempDir(prefix: string): string {
  const directory = mkdtempSync(join(tmpdir(), prefix));
  tempDirs.push(directory);
  return directory;
}

function openTrackedDatabase(directory: string, fileName = "test.sqlite"): Database.Database {
  const db = new Database(join(directory, fileName));
  tempDatabases.push(db);
  return db;
}

function openTrackedDatabaseWithForeignKeys(prefix: string): Database.Database {
  const directory = makeTempDir(prefix);
  const db = openTrackedDatabase(directory);
  // Enable foreign-key enforcement for every curriculum test. The Todo 2
  // acceptance criteria require that the schema is FK-safe under this mode
  // so that lib/db/client.ts can safely turn the pragma ON at runtime.
  db.pragma("foreign_keys = ON");
  return db;
}

function repositoryMigrationNames(): readonly string[] {
  return readdirSync(MIGRATIONS_DIR)
    .filter((name) => name.endsWith(".sql"))
    .sort();
}

function tableNames(database: Database.Database): readonly string[] {
  return database
    .prepare<[], { readonly name: string }>(
      "SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name",
    )
    .all()
    .map((row) => row.name);
}

function indexNames(database: Database.Database): readonly string[] {
  return database
    .prepare<[], { readonly name: string }>(
      "SELECT name FROM sqlite_master WHERE type = 'index' ORDER BY name",
    )
    .all()
    .map((row) => row.name);
}

function countRows(database: Database.Database, table: string): number {
  return (
    database
      .prepare<[], { readonly count: number }>(
        `SELECT COUNT(*) AS count FROM ${table}`,
      )
      .get()?.count ?? 0
  );
}

function assertDatabaseClean(database: Database.Database): void {
  expect(
    database
      .prepare<[], { readonly table: string }>("PRAGMA foreign_key_check")
      .all(),
  ).toEqual([]);
  expect(
    database
      .prepare<[], { readonly quick_check: string }>("PRAGMA quick_check")
      .get(),
  ).toEqual({ quick_check: "ok" });
}

afterEach(() => {
  for (const db of tempDatabases.splice(0)) {
    try {
      db.close();
    } catch {
      // Already closed by the test body.
    }
  }
  for (const directory of tempDirs.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe("0006_curriculum_catalog.sql", () => {
  it("applies on an empty database with FK enforcement and creates every new table and index", () => {
    const db = openTrackedDatabaseWithForeignKeys("curriculum-fresh-");

    applyMigrations(db, { now: () => "2026-07-17T00:00:00.000Z" });

    const names = tableNames(db);
    for (const expected of NEW_TABLE_NAMES) {
      expect(names).toContain(expected);
    }

    const idx = indexNames(db);
    for (const expected of NEW_INDEX_NAMES) {
      expect(idx).toContain(expected);
    }

    assertDatabaseClean(db);
  });

  it("preserves the quick_check guarantee after two consecutive runs", () => {
    const db = openTrackedDatabaseWithForeignKeys("curriculum-idempotent-");

    applyMigrations(db, { now: () => "2026-07-17T00:00:00.000Z" });
    applyMigrations(db, { now: () => "2026-07-17T00:00:01.000Z" });

    assertDatabaseClean(db);

    const migrationRows = db
      .prepare<[], { readonly id: string }>(
        "SELECT id FROM schema_migrations ORDER BY id",
      )
      .all()
      .map((row) => row.id);
    expect(migrationRows).toEqual(repositoryMigrationNames());
  });

  it("upgrades every supported schema prefix through 0006 with FK enforcement", () => {
    const migrationNames = repositoryMigrationNames();

    for (
      let prefixLength = 1;
      prefixLength < migrationNames.length;
      prefixLength += 1
    ) {
      const directory = makeTempDir("curriculum-prefix-");
      const oldMigrationsDir = join(directory, "old-migrations");
      mkdirSync(oldMigrationsDir);
      for (const name of migrationNames.slice(0, prefixLength)) {
        copyFileSync(join(MIGRATIONS_DIR, name), join(oldMigrationsDir, name));
      }

      const db = openTrackedDatabase(directory);
      db.pragma("foreign_keys = ON");

      applyMigrations(db, {
        migrationsDir: oldMigrationsDir,
        now: () => "2026-07-17T00:00:00.000Z",
      });
      applyMigrations(db, { now: () => "2026-07-17T00:00:01.000Z" });

      const names = tableNames(db);
      for (const expected of NEW_TABLE_NAMES) {
        expect(names).toContain(expected);
      }
      if (prefixLength >= 2) {
        expect(names).toContain("training_sessions");
        expect(names).toContain("capture_events");
        expect(names).toContain("training_attempts");
      }
      if (prefixLength >= 5) {
        expect(names).toContain("attempt_corrections");
      }

      assertDatabaseClean(db);
    }
  });

  it("commits a happy-path curriculum insert in a single transaction", () => {
    const db = openTrackedDatabaseWithForeignKeys("curriculum-happy-");

    applyMigrations(db, { now: () => "2026-07-17T00:00:00.000Z" });

    db.transaction(() => {
      db.prepare(
        `
          INSERT INTO curriculum_packages (
            id, track_slug, semantic_version, checksum, source_revision, installed_at
          ) VALUES (
            'pkg_sdf_v1', 'software-development-foundations',
            '1.0.0', 'sha256:fresh-happy', 'rev-1',
            '2026-07-17T00:00:00.000Z'
          )
        `,
      ).run();

      db.prepare(
        `
          INSERT INTO career_tracks (
            id, slug, name, summary, status, package_id
          ) VALUES (
            'career_backend', 'backend-server', 'Backend Server',
            'Build server-side systems.', 'published', 'pkg_sdf_v1'
          )
        `,
      ).run();

      db.prepare(
        `
          INSERT INTO knowledge_nodes (
            id, stable_id, title, outcome, rationale, order_index,
            status, provenance_json, package_id
          ) VALUES (
            'node_io', 'cpp-io-types', 'C++ I/O types',
            'Use cin/cout correctly.', 'Foundation for all OJ work.',
            1, 'published', '{"source":"cppreference"}',
            'pkg_sdf_v1'
          )
        `,
      ).run();

      db.prepare(
        `
          INSERT INTO knowledge_nodes (
            id, stable_id, title, outcome, rationale, order_index,
            status, provenance_json, package_id
          ) VALUES (
            'node_control', 'cpp-control-flow-functions',
            'C++ control flow & functions',
            'Compose branches and helpers.', 'Required before containers.',
            2, 'published', '{"source":"cppreference"}',
            'pkg_sdf_v1'
          )
        `,
      ).run();

      db.prepare(
        `
          INSERT INTO knowledge_edges (
            id, from_node_id, to_node_id, edge_type
          ) VALUES (
            'edge_io_to_control', 'node_io', 'node_control',
            'required_prerequisite'
          )
        `,
      ).run();

      db.prepare(
        `
          INSERT INTO learning_resources (
            id, stable_id, title, url, author, language, cost, access,
            license_boundary, review_status, reviewed_at, stopping_guidance,
            package_id
          ) VALUES (
            'res_io', 'cppreference-cpp-io',
            'C++ I/O library',
            'https://en.cppreference.com/w/cpp/io',
            'cppreference.com', 'en', 'free', 'open',
            'permissive_open', 'reviewed',
            '2026-07-17T00:00:00.000Z',
            'Stop after you can read/write a vector of ints.',
            'pkg_sdf_v1'
          )
        `,
      ).run();

      db.prepare(
        `
          INSERT INTO node_resources (
            node_id, resource_id, role, sort_order
          ) VALUES ('node_io', 'res_io', 'primary', 0)
        `,
      ).run();

      db.prepare(
        `
          INSERT INTO canonical_problems (id, stable_id, title) VALUES (
            'cp_practice_1', 'practice_1', 'Practice Contest 1'
          )
        `,
      ).run();

      db.prepare(
        `
          INSERT INTO canonical_problem_sources (
            id, canonical_problem_id, platform, external_id, url, is_primary
          ) VALUES (
            'cpsrc_practice_1', 'cp_practice_1', 'atcoder',
            'practice_1', 'https://atcoder.jp/contests/practice/tasks/practice_1',
            1
          )
        `,
      ).run();

      db.prepare(
        `
          INSERT INTO practice_tasks (
            id, stable_id, canonical_problem_id, title, kind, difficulty_band,
            package_id
          ) VALUES (
            'task_practice_1', 'practice-cpp-io-types',
            'cp_practice_1', 'Read and print two integers', 'oj',
            'intro', 'pkg_sdf_v1'
          )
        `,
      ).run();

      db.prepare(
        `
          INSERT INTO node_practice_mappings (
            node_id, practice_task_id, measurement_role,
            variant_family_id, sort_order
          ) VALUES (
            'node_io', 'task_practice_1', 'primary', 'family_io', 0
          )
        `,
      ).run();
    })();

    expect(countRows(db, "curriculum_packages")).toBe(1);
    expect(countRows(db, "career_tracks")).toBe(1);
    expect(countRows(db, "knowledge_nodes")).toBe(2);
    expect(countRows(db, "knowledge_edges")).toBe(1);
    expect(countRows(db, "learning_resources")).toBe(1);
    expect(countRows(db, "canonical_problems")).toBe(1);
    expect(countRows(db, "canonical_problem_sources")).toBe(1);
    expect(countRows(db, "practice_tasks")).toBe(1);
    expect(countRows(db, "node_resources")).toBe(1);
    expect(countRows(db, "node_practice_mappings")).toBe(1);

    assertDatabaseClean(db);
  });

  it("rejects a duplicate canonical_problem_sources row and rolls back the whole transaction", () => {
    const db = openTrackedDatabaseWithForeignKeys("curriculum-dup-source-");

    applyMigrations(db, { now: () => "2026-07-17T00:00:00.000Z" });

    expect(() => {
      db.transaction(() => {
        db.prepare(
          `
            INSERT INTO curriculum_packages (
              id, track_slug, semantic_version, checksum, source_revision, installed_at
            ) VALUES (
              'pkg_sdf_v1', 'software-development-foundations', '1.0.0',
              'sha256:dup', 'rev-1', '2026-07-17T00:00:00.000Z'
            )
          `,
        ).run();

        db.prepare(
          `
            INSERT INTO canonical_problems (id, stable_id, title) VALUES (
              'cp_a', 'problem-a', 'Problem A'
            )
          `,
        ).run();

        db.prepare(
          `
            INSERT INTO canonical_problem_sources (
              id, canonical_problem_id, platform, external_id, url, is_primary
            ) VALUES (
              'cpsrc_first', 'cp_a', 'atcoder', 'practice_1',
              'https://atcoder.jp/contests/practice/tasks/practice_1', 1
            )
          `,
        ).run();

        db.prepare(
          `
            INSERT INTO canonical_problem_sources (
              id, canonical_problem_id, platform, external_id, url, is_primary
            ) VALUES (
              'cpsrc_second', 'cp_a', 'atcoder', 'practice_1',
              'https://atcoder.jp/contests/practice/tasks/practice_1', 1
            )
          `,
        ).run();
      })();
    }).toThrow(/UNIQUE constraint failed/);

    expect(countRows(db, "curriculum_packages")).toBe(0);
    expect(countRows(db, "canonical_problems")).toBe(0);
    expect(countRows(db, "canonical_problem_sources")).toBe(0);

    assertDatabaseClean(db);
  });

  it("rejects a self-edge knowledge_edge with CHECK (from_node_id <> to_node_id)", () => {
    const db = openTrackedDatabaseWithForeignKeys("curriculum-self-edge-");

    applyMigrations(db, { now: () => "2026-07-17T00:00:00.000Z" });

    expect(() => {
      db.transaction(() => {
        db.prepare(
          `
            INSERT INTO curriculum_packages (
              id, track_slug, semantic_version, checksum, source_revision, installed_at
            ) VALUES (
              'pkg_sdf_v1', 'software-development-foundations', '1.0.0',
              'sha256:self', 'rev-1', '2026-07-17T00:00:00.000Z'
            )
          `,
        ).run();

        db.prepare(
          `
            INSERT INTO knowledge_nodes (
              id, stable_id, title, outcome, rationale, order_index,
              status, provenance_json, package_id
            ) VALUES (
              'node_io', 'cpp-io-types', 'I/O', 'Read/write ints.',
              'Foundation.', 1, 'published', '{}', 'pkg_sdf_v1'
            )
          `,
        ).run();

        db.prepare(
          `
            INSERT INTO knowledge_edges (
              id, from_node_id, to_node_id, edge_type
            ) VALUES (
              'edge_self', 'node_io', 'node_io', 'required_prerequisite'
            )
          `,
        ).run();
      })();
    }).toThrow(/CHECK constraint failed/);

    expect(countRows(db, "knowledge_edges")).toBe(0);

    assertDatabaseClean(db);
  });

  it("rejects a node_practice_mappings row referencing a non-existent node_id", () => {
    const db = openTrackedDatabaseWithForeignKeys("curriculum-orphan-fk-");

    applyMigrations(db, { now: () => "2026-07-17T00:00:00.000Z" });

    expect(() => {
      db.transaction(() => {
        db.prepare(
          `
            INSERT INTO curriculum_packages (
              id, track_slug, semantic_version, checksum, source_revision, installed_at
            ) VALUES (
              'pkg_sdf_v1', 'software-development-foundations', '1.0.0',
              'sha256:orphan', 'rev-1', '2026-07-17T00:00:00.000Z'
            )
          `,
        ).run();

        db.prepare(
          `
            INSERT INTO canonical_problems (id, stable_id, title) VALUES (
              'cp_a', 'problem-a', 'Problem A'
            )
          `,
        ).run();

        db.prepare(
          `
            INSERT INTO practice_tasks (
              id, stable_id, canonical_problem_id, title, kind, difficulty_band,
              package_id
            ) VALUES (
              'task_a', 'practice-a', 'cp_a', 'Practice A',
              'oj', 'intro', 'pkg_sdf_v1'
            )
          `,
        ).run();

        db.prepare(
          `
            INSERT INTO node_practice_mappings (
              node_id, practice_task_id, measurement_role,
              variant_family_id, sort_order
            ) VALUES (
              'node_missing', 'task_a', 'primary', NULL, 0
            )
          `,
        ).run();
      })();
    }).toThrow(/FOREIGN KEY constraint failed/);

    expect(countRows(db, "node_practice_mappings")).toBe(0);
    expect(countRows(db, "knowledge_nodes")).toBe(0);

    assertDatabaseClean(db);
  });

  it("preserves a 0005 capture event and manual attempt when 0006 is applied", () => {
    const directory = makeTempDir("curriculum-preserve-");
    const oldMigrationsDir = join(directory, "old-migrations");
    mkdirSync(oldMigrationsDir);
    for (const name of [
      "0001_initial.sql",
      "0002_attempt_capture_source.sql",
      "0003_capture_sessions_and_submissions.sql",
      "0004_capture_credentials.sql",
      "0005_attempt_manual_corrections.sql",
    ]) {
      copyFileSync(join(MIGRATIONS_DIR, name), join(oldMigrationsDir, name));
    }

    const db = openTrackedDatabase(directory);
    db.pragma("foreign_keys = ON");

    applyMigrations(db, {
      migrationsDir: oldMigrationsDir,
      now: () => "2026-07-17T00:00:00.000Z",
    });

    db.exec(`
      INSERT INTO training_sessions (
        id, installation_id, platform, problem_external_id, problem_title,
        canonical_url, provenance_level, started_at, ended_at, end_reason,
        created_at, updated_at
      ) VALUES (
        'session_preserve_6', 'installation_6', 'atcoder', 'practice_1',
        'Practice Contest 1',
        'https://atcoder.jp/contests/practice/tasks/practice_1',
        'extension_paired',
        '2026-07-17T00:00:00.000Z', '2026-07-17T00:01:00.000Z',
        'pagehide',
        '2026-07-17T00:00:00.000Z', '2026-07-17T00:01:00.000Z'
      );

      INSERT INTO capture_events (
        id, schema_version, type, capture_session_id, submission_id,
        installation_id, adapter_version, parser_version, page_origin,
        provenance_level, platform, problem_external_id, problem_title,
        canonical_url, occurred_at, payload_json, event_fingerprint, received_at
      ) VALUES (
        'event_preserve_6', 2, 'SUBMISSION_OBSERVED', 'session_preserve_6',
        'submission_preserve_6', 'installation_6', 'test@0.2.0', 'test@0.2.0',
        'https://atcoder.jp', 'extension_paired', 'atcoder', 'practice_1',
        'Practice Contest 1',
        'https://atcoder.jp/contests/practice/tasks/practice_1',
        '2026-07-17T00:00:30.000Z', '{"action":"submit_clicked"}',
        'fingerprint_6', '2026-07-17T00:00:30.000Z'
      );

      INSERT INTO training_attempts (
        id, capture_session_id, submission_id, record_source, platform,
        problem_external_id, problem_title, canonical_url,
        started_at, ended_at, result, verdict, language, duration_minutes,
        reflection, submission_event_id, verdict_event_id, revision,
        voided_at, void_reason, created_at, updated_at
      ) VALUES (
        'attempt_preserve_6', 'session_preserve_6', 'submission_preserve_6',
        'capture', 'atcoder', 'practice_1', 'Practice Contest 1',
        'https://atcoder.jp/contests/practice/tasks/practice_1',
        '2026-07-17T00:00:00.000Z', '2026-07-17T00:01:00.000Z',
        'passed', 'AC', 'cpp', 1, 'Keep this reflection.',
        'event_preserve_6', 'event_verdict_6', 1,
        NULL, NULL,
        '2026-07-17T00:00:00.000Z', '2026-07-17T00:01:00.000Z'
      );
    `);

    const attemptsBefore = countRows(db, "training_attempts");
    const capturesBefore = countRows(db, "capture_events");
    const sessionsBefore = countRows(db, "training_sessions");

    expect(attemptsBefore).toBe(1);
    expect(capturesBefore).toBe(1);
    expect(sessionsBefore).toBe(1);

    applyMigrations(db, { now: () => "2026-07-17T00:01:30.000Z" });

    expect(countRows(db, "training_attempts")).toBe(attemptsBefore);
    expect(countRows(db, "capture_events")).toBe(capturesBefore);
    expect(countRows(db, "training_sessions")).toBe(sessionsBefore);

    const names = tableNames(db);
    for (const expected of NEW_TABLE_NAMES) {
      expect(names).toContain(expected);
    }

    const preservedRow = db
      .prepare<[string], { readonly id: string; readonly result: string }>(
        "SELECT id, result FROM training_attempts WHERE id = ?",
      )
      .get("attempt_preserve_6");
    expect(preservedRow).toEqual({
      id: "attempt_preserve_6",
      result: "passed",
    });

    assertDatabaseClean(db);
  });

  it("accepts every documented CHECK enum value and rejects one invalid value", () => {
    const db = openTrackedDatabaseWithForeignKeys("curriculum-enum-");

    applyMigrations(db, { now: () => "2026-07-17T00:00:00.000Z" });

    db.transaction(() => {
      db.prepare(
        `
          INSERT INTO curriculum_packages (
            id, track_slug, semantic_version, checksum, source_revision, installed_at
          ) VALUES (
            'pkg_enum', 'software-development-foundations', '1.0.0',
            'sha256:enum', 'rev-1', '2026-07-17T00:00:00.000Z'
          )
        `,
      ).run();

      db.prepare(
        `INSERT INTO career_tracks (id, slug, name, summary, status, package_id)
         VALUES ('career_pub', 'published-slug', 'P', 'p', 'published', 'pkg_enum')`,
      ).run();
      db.prepare(
        `INSERT INTO career_tracks (id, slug, name, summary, status, package_id)
         VALUES ('career_plan', 'planned-slug', 'P', 'p', 'planned', 'pkg_enum')`,
      ).run();

      db.prepare(
        `INSERT INTO knowledge_nodes (
            id, stable_id, title, outcome, rationale, order_index,
            status, provenance_json, package_id
          ) VALUES (
            'node_enum_planned', 'enum-planned', 't', 'o', 'r',
            1, 'planned', '{}', 'pkg_enum'
          )`,
      ).run();
      db.prepare(
        `INSERT INTO knowledge_nodes (
            id, stable_id, title, outcome, rationale, order_index,
            status, provenance_json, package_id
          ) VALUES (
            'node_enum_draft', 'enum-draft', 't', 'o', 'r',
            2, 'draft', '{}', 'pkg_enum'
          )`,
      ).run();
      db.prepare(
        `INSERT INTO knowledge_nodes (
            id, stable_id, title, outcome, rationale, order_index,
            status, provenance_json, package_id
          ) VALUES (
            'node_enum_pub', 'enum-published', 't', 'o', 'r',
            3, 'published', '{}', 'pkg_enum'
          )`,
      ).run();
      db.prepare(
        `INSERT INTO knowledge_nodes (
            id, stable_id, title, outcome, rationale, order_index,
            status, provenance_json, package_id
          ) VALUES (
            'node_enum_dep', 'enum-deprecated', 't', 'o', 'r',
            4, 'deprecated', '{}', 'pkg_enum'
          )`,
      ).run();

      db.prepare(
        `INSERT INTO knowledge_edges (
            id, from_node_id, to_node_id, edge_type
          ) VALUES (
            'edge_req', 'node_enum_planned', 'node_enum_draft',
            'required_prerequisite'
          )`,
      ).run();
      db.prepare(
        `INSERT INTO knowledge_edges (
            id, from_node_id, to_node_id, edge_type
          ) VALUES (
            'edge_rec', 'node_enum_draft', 'node_enum_pub',
            'recommended_prerequisite'
          )`,
      ).run();

      db.prepare(
        `INSERT INTO learning_resources (
            id, stable_id, title, url, author, language, cost, access,
            license_boundary, review_status, reviewed_at, stopping_guidance,
            package_id
          ) VALUES (
            'res_zh', 'enum-zh', '中文资源', 'https://example.com/zh',
            'editor', 'zh-CN', 'free', 'open',
            'permissive_open', 'reviewed', '2026-07-17T00:00:00.000Z',
            'stop here', 'pkg_enum'
          )`,
      ).run();
      db.prepare(
        `INSERT INTO learning_resources (
            id, stable_id, title, url, author, language, cost, access,
            license_boundary, review_status, reviewed_at, stopping_guidance,
            package_id
          ) VALUES (
            'res_multi', 'enum-multi', 'Multilingual resource',
            'https://example.com/multi', 'editor', 'multilingual',
            'freemium', 'registration', 'official_public_docs',
            'draft', '2026-07-17T00:00:00.000Z', 'stop here', 'pkg_enum'
          )`,
      ).run();
      db.prepare(
        `INSERT INTO learning_resources (
            id, stable_id, title, url, author, language, cost, access,
            license_boundary, review_status, reviewed_at, stopping_guidance,
            package_id
          ) VALUES (
            'res_paid', 'enum-paid', 'Paid resource',
            'https://example.com/paid', 'editor', 'en', 'paid',
            'regional_restricted', 'deep_link_only', 'broken',
            '2026-07-17T00:00:00.000Z', 'stop here', 'pkg_enum'
          )`,
      ).run();

      db.prepare(
        `INSERT INTO canonical_problems (id, stable_id, title)
         VALUES ('cp_enum_a', 'enum-problem-a', 'Problem A')`,
      ).run();
      db.prepare(
        `INSERT INTO canonical_problem_sources (
            id, canonical_problem_id, platform, external_id, url, is_primary
          ) VALUES (
            'cpsrc_enum_a', 'cp_enum_a', 'atcoder', 'practice_1',
            'https://atcoder.jp/contests/practice/tasks/practice_1', 1
          )`,
      ).run();
      db.prepare(
        `INSERT INTO canonical_problem_sources (
            id, canonical_problem_id, platform, external_id, url, is_primary
          ) VALUES (
            'cpsrc_enum_b', 'cp_enum_a', 'manual', 'manual_1',
            'https://example.com/manual', 0
          )`,
      ).run();

      db.prepare(
        `INSERT INTO practice_tasks (
            id, stable_id, canonical_problem_id, title, kind, difficulty_band,
            package_id
          ) VALUES (
            'task_enum_a', 'practice-enum-a', 'cp_enum_a', 'Practice A',
            'oj', 'easy', 'pkg_enum'
          )`,
      ).run();
      db.prepare(
        `INSERT INTO practice_tasks (
            id, stable_id, canonical_problem_id, title, kind, difficulty_band,
            package_id
          ) VALUES (
            'task_enum_b', 'practice-enum-b', 'cp_enum_a', 'Manual drill B',
            'manual_exercise', 'medium', 'pkg_enum'
          )`,
      ).run();

      db.prepare(
        `INSERT INTO node_resources (
            node_id, resource_id, role, sort_order
          ) VALUES ('node_enum_planned', 'res_zh', 'primary', 0)`,
      ).run();

      db.prepare(
        `INSERT INTO node_practice_mappings (
            node_id, practice_task_id, measurement_role,
            variant_family_id, sort_order
          ) VALUES (
            'node_enum_planned', 'task_enum_a', 'primary', 'fam_a', 0
          )`,
      ).run();
      db.prepare(
        `INSERT INTO node_practice_mappings (
            node_id, practice_task_id, measurement_role,
            variant_family_id, sort_order
          ) VALUES (
            'node_enum_planned', 'task_enum_b', 'supporting', NULL, 1
          )`,
      ).run();
    })();

    expect(() =>
      db.prepare(
        `INSERT INTO career_tracks (id, slug, name, summary, status, package_id)
         VALUES ('career_bad', 'bad-slug', 'B', 'b', 'archived', 'pkg_enum')`,
      ).run(),
    ).toThrow(/CHECK constraint failed/);

    expect(() =>
      db.prepare(
        `INSERT INTO knowledge_nodes (
            id, stable_id, title, outcome, rationale, order_index,
            status, provenance_json, package_id
          ) VALUES (
            'node_enum_bad', 'enum-bad', 't', 'o', 'r',
            5, 'archived', '{}', 'pkg_enum'
          )`,
      ).run(),
    ).toThrow(/CHECK constraint failed/);

    expect(() =>
      db.prepare(
        `INSERT INTO knowledge_edges (
            id, from_node_id, to_node_id, edge_type
          ) VALUES (
            'edge_bad', 'node_enum_planned', 'node_enum_draft', 'suggested'
          )`,
      ).run(),
    ).toThrow(/CHECK constraint failed/);

    expect(() =>
      db.prepare(
        `INSERT INTO canonical_problem_sources (
            id, canonical_problem_id, platform, external_id, url, is_primary
          ) VALUES (
            'cpsrc_bad', 'cp_enum_a', 'wakatime', 'practice_99',
            'https://example.com', 1
          )`,
      ).run(),
    ).toThrow(/CHECK constraint failed/);

    expect(() =>
      db.prepare(
        `INSERT INTO canonical_problem_sources (
            id, canonical_problem_id, platform, external_id, url, is_primary
          ) VALUES (
            'cpsrc_bad_2', 'cp_enum_a', 'atcoder', 'practice_99', 'https://x', 2
          )`,
      ).run(),
    ).toThrow(/CHECK constraint failed/);

    expect(() =>
      db.prepare(
        `INSERT INTO practice_tasks (
            id, stable_id, canonical_problem_id, title, kind, difficulty_band,
            package_id
          ) VALUES (
            'task_bad', 'practice-bad', 'cp_enum_a', 'Bad', 'simulation',
            'intro', 'pkg_enum'
          )`,
      ).run(),
    ).toThrow(/CHECK constraint failed/);

    expect(() =>
      db.prepare(
        `INSERT INTO practice_tasks (
            id, stable_id, canonical_problem_id, title, kind, difficulty_band,
            package_id
          ) VALUES (
            'task_bad_2', 'practice-bad-2', 'cp_enum_a', 'Bad 2', 'oj',
            'novice', 'pkg_enum'
          )`,
      ).run(),
    ).toThrow(/CHECK constraint failed/);

    expect(() =>
      db.prepare(
        `INSERT INTO node_resources (
            node_id, resource_id, role, sort_order
          ) VALUES ('node_enum_draft', 'res_multi', 'secondary', 0)`,
      ).run(),
    ).toThrow(/CHECK constraint failed/);

    expect(() =>
      db.prepare(
        `INSERT INTO node_practice_mappings (
            node_id, practice_task_id, measurement_role,
            variant_family_id, sort_order
          ) VALUES (
            'node_enum_draft', 'task_enum_a', 'stretch', NULL, 2
          )`,
      ).run(),
    ).toThrow(/CHECK constraint failed/);

    assertDatabaseClean(db);
  });
});