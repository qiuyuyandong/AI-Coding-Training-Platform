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
  }, 300_000);

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

const NEW_TABLE_NAMES_7 = [
  "learner_profiles",
  "learner_goals",
  "diagnostic_sessions",
  "diagnostic_responses",
  "learner_node_baselines",
  "learning_plans",
  "daily_plan_snapshots",
  "plan_items",
  "task_feedback",
  "plan_revision_events",
] as const;

const NEW_INDEX_NAMES_7 = [
  "idx_learner_goals_learner",
  "idx_diagnostic_sessions_learner",
  "idx_learning_plans_learner",
  "idx_daily_plan_snapshots_plan",
  "idx_daily_plan_snapshots_date",
  "idx_plan_items_daily",
  "idx_task_feedback_item",
  "idx_plan_revision_events_after",
] as const;

describe("0007_learner_goals_and_plans.sql", () => {
  it("applies on an empty database with FK enforcement and creates every new table and index", () => {
    const db = openTrackedDatabaseWithForeignKeys("learner-plan-fresh-");

    applyMigrations(db, { now: () => "2026-07-17T00:00:00.000Z" });

    const names = tableNames(db);
    for (const expected of NEW_TABLE_NAMES_7) {
      expect(names).toContain(expected);
    }

    const idx = indexNames(db);
    for (const expected of NEW_INDEX_NAMES_7) {
      expect(idx).toContain(expected);
    }

    assertDatabaseClean(db);
  });

  it("preserves the quick_check guarantee after two consecutive applies through 0007", () => {
    const db = openTrackedDatabaseWithForeignKeys("learner-plan-idempotent-");

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

  it("upgrades every supported schema prefix through 0007 with FK enforcement", () => {
    const migrationNames = repositoryMigrationNames();
    expect(migrationNames.length).toBeGreaterThanOrEqual(7);

    for (
      let prefixLength = 1;
      prefixLength <= migrationNames.length;
      prefixLength += 1
    ) {
      const directory = makeTempDir("learner-plan-prefix-");
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
      for (const expected of NEW_TABLE_NAMES_7) {
        expect(names).toContain(expected);
      }

      assertDatabaseClean(db);
    }
  }, 300_000);

  it("commits a happy-path learner → diagnosis → plan → feedback sequence in one transaction", () => {
    const db = openTrackedDatabaseWithForeignKeys("learner-plan-happy-");

    applyMigrations(db, { now: () => "2026-07-17T00:00:00.000Z" });

    db.transaction(() => {
      db.prepare(
        `
          INSERT INTO curriculum_packages (
            id, track_slug, semantic_version, checksum, source_revision, installed_at
          ) VALUES (
            'pkg_sdf_v1', 'software-development-foundations', '1.0.0',
            'sha256:happy', 'rev-1', '2026-07-17T00:00:00.000Z'
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
          INSERT INTO canonical_problems (id, stable_id, title)
          VALUES ('cp_practice_1', 'practice_1', 'Practice Contest 1')
        `,
      ).run();

      db.prepare(
        `
          INSERT INTO practice_tasks (
            id, stable_id, canonical_problem_id, title, kind, difficulty_band,
            package_id
          ) VALUES (
            'task_practice_1', 'practice-cpp-io-types', 'cp_practice_1',
            'Read and print two integers', 'oj', 'intro', 'pkg_sdf_v1'
          )
        `,
      ).run();

      db.prepare(
        `
          INSERT INTO canonical_problems (id, stable_id, title)
          VALUES ('cp_warmup_1', 'practice_warmup_1', 'Warmup problem')
        `,
      ).run();

      db.prepare(
        `
          INSERT INTO practice_tasks (
            id, stable_id, canonical_problem_id, title, kind, difficulty_band,
            package_id
          ) VALUES (
            'task_warmup_1', 'practice-cpp-warmup', 'cp_warmup_1',
            'Warmup loops', 'oj', 'easy', 'pkg_sdf_v1'
          )
        `,
      ).run();

      db.prepare(
        `
          INSERT INTO learner_profiles (id, onboarding_state, created_at, updated_at)
          VALUES (
            'local-default-learner', 'plan_ready',
            '2026-07-17T00:00:00.000Z', '2026-07-17T00:00:00.000Z'
          )
        `,
      ).run();

      db.prepare(
        `
          INSERT INTO learner_goals (
            id, learner_id, primary_track_id, interest_track_ids_json,
            status, created_at
          ) VALUES (
            'goal_active', 'local-default-learner', NULL,
            '["career_backend"]', 'active',
            '2026-07-17T00:00:01.000Z'
          )
        `,
      ).run();

      db.prepare(
        `
          INSERT INTO diagnostic_sessions (
            id, learner_id, blueprint_version, status, started_at, completed_at
          ) VALUES (
            'session_happy_7', 'local-default-learner',
            'v0-diagnosis-1', 'completed',
            '2026-07-17T00:00:02.000Z', '2026-07-17T00:00:03.000Z'
          )
        `,
      ).run();

      db.prepare(
        `
          INSERT INTO diagnostic_responses (
            session_id, prompt_id, response, created_at
          ) VALUES (
            'session_happy_7', 'cpp-basics', 'can_with_help',
            '2026-07-17T00:00:02.500Z'
          )
        `,
      ).run();

      db.prepare(
        `
          INSERT INTO learner_node_baselines (
            learner_id, node_id, baseline, confidence, source, updated_at
          ) VALUES (
            'local-default-learner', 'node_io', 'ready', 'medium',
            'diagnosis', '2026-07-17T00:00:03.000Z'
          )
        `,
      ).run();

      db.prepare(
        `
          INSERT INTO learning_plans (
            id, learner_id, generator_version, snapshot_json, status, created_at
          ) VALUES (
            'plan_happy_7', 'local-default-learner', 'v0-plan-generator-1',
            '{"mode":"learn"}', 'active',
            '2026-07-17T00:00:04.000Z'
          )
        `,
      ).run();

      db.prepare(
        `
          INSERT INTO daily_plan_snapshots (
            id, learning_plan_id, local_date, effort_boundary_minutes,
            daily_mode, generator_version, supersedes_daily_plan_id, created_at
          ) VALUES (
            'daily_v1', 'plan_happy_7', '2026-07-17', 30, 'learn',
            'v0-plan-generator-1', NULL,
            '2026-07-17T00:00:04.500Z'
          )
        `,
      ).run();

      db.prepare(
        `
          INSERT INTO daily_plan_snapshots (
            id, learning_plan_id, local_date, effort_boundary_minutes,
            daily_mode, generator_version, supersedes_daily_plan_id, created_at
          ) VALUES (
            'daily_v2', 'plan_happy_7', '2026-07-17', 15, 'learn',
            'v0-plan-generator-1', 'daily_v1',
            '2026-07-17T00:00:05.000Z'
          )
        `,
      ).run();

      db.prepare(
        `
          INSERT INTO plan_items (
            id, daily_plan_id, practice_task_id, node_id,
            role, rank, reason_codes_json
          ) VALUES (
            'item_primary', 'daily_v2', 'task_practice_1', 'node_io',
            'primary', 0, '["primary_track_match"]'
          )
        `,
      ).run();

      db.prepare(
        `
          INSERT INTO plan_items (
            id, daily_plan_id, practice_task_id, node_id,
            role, rank, reason_codes_json
          ) VALUES (
            'item_warmup', 'daily_v2', 'task_warmup_1', 'node_io',
            'warmup', 1, '["warmup"]'
          )
        `,
      ).run();

      db.prepare(
        `
          INSERT INTO task_feedback (
            id, plan_item_id, action, reason_code, reason_text,
            attempt_id, successor_daily_plan_id, created_at
          ) VALUES (
            'fb_accept', 'item_primary', 'accepted', NULL, NULL,
            NULL, NULL, '2026-07-17T00:00:06.000Z'
          )
        `,
      ).run();

      db.prepare(
        `
          INSERT INTO task_feedback (
            id, plan_item_id, action, reason_code, reason_text,
            attempt_id, successor_daily_plan_id, created_at
          ) VALUES (
            'fb_start', 'item_primary', 'started', NULL, NULL,
            NULL, NULL, '2026-07-17T00:00:07.000Z'
          )
        `,
      ).run();

      db.prepare(
        `
          INSERT INTO task_feedback (
            id, plan_item_id, action, reason_code, reason_text,
            attempt_id, successor_daily_plan_id, created_at
          ) VALUES (
            'fb_skip', 'item_warmup', 'skipped', 'too_easy', 'Already comfortable',
            NULL, NULL, '2026-07-17T00:00:08.000Z'
          )
        `,
      ).run();

      db.prepare(
        `
          INSERT INTO task_feedback (
            id, plan_item_id, action, reason_code, reason_text,
            attempt_id, successor_daily_plan_id, created_at
          ) VALUES (
            'fb_complete', 'item_primary', 'completed', NULL, NULL,
            NULL, NULL, '2026-07-17T00:00:09.000Z'
          )
        `,
      ).run();

      db.prepare(
        `
          INSERT INTO plan_revision_events (
            id, before_daily_plan_id, after_daily_plan_id, event_type,
            input_fingerprint, created_at
          ) VALUES (
            'rev_initial', NULL, 'daily_v1', 'initial_plan',
            'sha256:initial', '2026-07-17T00:00:04.500Z'
          )
        `,
      ).run();

      db.prepare(
        `
          INSERT INTO plan_revision_events (
            id, before_daily_plan_id, after_daily_plan_id, event_type,
            input_fingerprint, created_at
          ) VALUES (
            'rev_effort', 'daily_v1', 'daily_v2', 'effort_changed',
            'sha256:effort-15', '2026-07-17T00:00:05.000Z'
          )
        `,
      ).run();
    })();

    expect(countRows(db, "learner_profiles")).toBe(1);
    expect(countRows(db, "learner_goals")).toBe(1);
    expect(countRows(db, "diagnostic_sessions")).toBe(1);
    expect(countRows(db, "diagnostic_responses")).toBe(1);
    expect(countRows(db, "learner_node_baselines")).toBe(1);
    expect(countRows(db, "learning_plans")).toBe(1);
    expect(countRows(db, "daily_plan_snapshots")).toBe(2);
    expect(countRows(db, "plan_items")).toBe(2);
    expect(countRows(db, "task_feedback")).toBe(4);
    expect(countRows(db, "plan_revision_events")).toBe(2);

    const learnerGoalColumns = db
      .prepare<[], { readonly name: string }>("PRAGMA table_info(learner_goals)")
      .all()
      .map((row) => row.name);
    expect(learnerGoalColumns).not.toContain("target_level");

    const supersededGoal = db
      .prepare<
        [string],
        { readonly id: string; readonly status: string }
      >(
        "SELECT id, status FROM learner_goals WHERE id = ?",
      )
      .get("goal_active");
    expect(supersededGoal).toEqual({ id: "goal_active", status: "active" });

    const successorDaily = db
      .prepare<
        [string],
        { readonly id: string; readonly supersedes: string | null }
      >(
        "SELECT id, supersedes_daily_plan_id AS supersedes FROM daily_plan_snapshots WHERE id = ?",
      )
      .get("daily_v2");
    expect(successorDaily).toEqual({
      id: "daily_v2",
      supersedes: "daily_v1",
    });

    assertDatabaseClean(db);
  });

  it("rejects a duplicate (session_id, prompt_id) diagnostic_responses row", () => {
    const db = openTrackedDatabaseWithForeignKeys("learner-plan-dup-prompt-");

    applyMigrations(db, { now: () => "2026-07-17T00:00:00.000Z" });

    db.prepare(
      `INSERT INTO learner_profiles (id, onboarding_state, created_at, updated_at)
       VALUES ('local-default-learner', 'new',
               '2026-07-17T00:00:00.000Z', '2026-07-17T00:00:00.000Z')`,
    ).run();
    db.prepare(
      `INSERT INTO diagnostic_sessions (
          id, learner_id, blueprint_version, status, started_at, completed_at
        ) VALUES (
          'session_dup', 'local-default-learner', 'v0-diagnosis-1',
          'in_progress', '2026-07-17T00:00:00.000Z', NULL
        )`,
    ).run();
    db.prepare(
      `INSERT INTO diagnostic_responses (
          session_id, prompt_id, response, created_at
        ) VALUES (
          'session_dup', 'cpp-basics', 'unknown',
          '2026-07-17T00:00:01.000Z'
        )`,
    ).run();

    expect(() =>
      db.prepare(
        `INSERT INTO diagnostic_responses (
            session_id, prompt_id, response, created_at
          ) VALUES (
            'session_dup', 'cpp-basics', 'needs_foundation',
            '2026-07-17T00:00:02.000Z'
          )`,
      ).run(),
    ).toThrow(/UNIQUE constraint failed/);

    expect(countRows(db, "diagnostic_responses")).toBe(1);

    assertDatabaseClean(db);
  });

  it("rejects plan_items with an invalid role CHECK", () => {
    const db = openTrackedDatabaseWithForeignKeys("learner-plan-bad-role-");

    applyMigrations(db, { now: () => "2026-07-17T00:00:00.000Z" });

    db.prepare(
      `INSERT INTO curriculum_packages (
          id, track_slug, semantic_version, checksum, source_revision, installed_at
        ) VALUES (
          'pkg_role', 'software-development-foundations', '1.0.0',
          'sha256:role', 'rev-1', '2026-07-17T00:00:00.000Z'
        )`,
    ).run();
    db.prepare(
      `INSERT INTO knowledge_nodes (
          id, stable_id, title, outcome, rationale, order_index,
          status, provenance_json, package_id
        ) VALUES (
          'node_role', 'role-node', 't', 'o', 'r', 1, 'published',
          '{}', 'pkg_role'
        )`,
    ).run();
    db.prepare(
      `INSERT INTO canonical_problems (id, stable_id, title)
       VALUES ('cp_role', 'role-problem', 'P')`,
    ).run();
    db.prepare(
      `INSERT INTO practice_tasks (
          id, stable_id, canonical_problem_id, title, kind, difficulty_band,
          package_id
        ) VALUES (
          'task_role', 'role-task', 'cp_role', 'T', 'oj', 'intro',
          'pkg_role'
        )`,
    ).run();
    db.prepare(
      `INSERT INTO learner_profiles (id, onboarding_state, created_at, updated_at)
       VALUES ('local-default-learner', 'plan_ready',
               '2026-07-17T00:00:00.000Z', '2026-07-17T00:00:00.000Z')`,
    ).run();
    db.prepare(
      `INSERT INTO learning_plans (
          id, learner_id, generator_version, snapshot_json, status, created_at
        ) VALUES (
          'plan_role', 'local-default-learner', 'v0-plan-generator-1',
          '{}', 'active', '2026-07-17T00:00:00.000Z'
        )`,
    ).run();
    db.prepare(
      `INSERT INTO daily_plan_snapshots (
          id, learning_plan_id, local_date, effort_boundary_minutes,
          daily_mode, generator_version, supersedes_daily_plan_id, created_at
        ) VALUES (
          'daily_role', 'plan_role', '2026-07-17', 30, 'learn',
          'v0-plan-generator-1', NULL,
          '2026-07-17T00:00:00.000Z'
        )`,
    ).run();

    expect(() =>
      db.prepare(
        `INSERT INTO plan_items (
            id, daily_plan_id, practice_task_id, node_id,
            role, rank, reason_codes_json
          ) VALUES (
            'item_bad_role', 'daily_role', 'task_role', 'node_role',
            'optional_project', 0, '[]'
          )`,
      ).run(),
    ).toThrow(/CHECK constraint failed/);

    expect(countRows(db, "plan_items")).toBe(0);

    assertDatabaseClean(db);
  });

  it("rejects a duplicate (plan_item_id, action) task_feedback row", () => {
    const db = openTrackedDatabaseWithForeignKeys("learner-plan-dup-action-");

    applyMigrations(db, { now: () => "2026-07-17T00:00:00.000Z" });

    db.prepare(
      `INSERT INTO curriculum_packages (
          id, track_slug, semantic_version, checksum, source_revision, installed_at
        ) VALUES (
          'pkg_dup', 'software-development-foundations', '1.0.0',
          'sha256:dup', 'rev-1', '2026-07-17T00:00:00.000Z'
        )`,
    ).run();
    db.prepare(
      `INSERT INTO knowledge_nodes (
          id, stable_id, title, outcome, rationale, order_index,
          status, provenance_json, package_id
        ) VALUES (
          'node_dup', 'dup-node', 't', 'o', 'r', 1, 'published',
          '{}', 'pkg_dup'
        )`,
    ).run();
    db.prepare(
      `INSERT INTO canonical_problems (id, stable_id, title)
       VALUES ('cp_dup', 'dup-problem', 'P')`,
    ).run();
    db.prepare(
      `INSERT INTO practice_tasks (
          id, stable_id, canonical_problem_id, title, kind, difficulty_band,
          package_id
        ) VALUES (
          'task_dup', 'dup-task', 'cp_dup', 'T', 'oj', 'intro',
          'pkg_dup'
        )`,
    ).run();
    db.prepare(
      `INSERT INTO learner_profiles (id, onboarding_state, created_at, updated_at)
       VALUES ('local-default-learner', 'plan_ready',
               '2026-07-17T00:00:00.000Z', '2026-07-17T00:00:00.000Z')`,
    ).run();
    db.prepare(
      `INSERT INTO learning_plans (
          id, learner_id, generator_version, snapshot_json, status, created_at
        ) VALUES (
          'plan_dup', 'local-default-learner', 'v0-plan-generator-1',
          '{}', 'active', '2026-07-17T00:00:00.000Z'
        )`,
    ).run();
    db.prepare(
      `INSERT INTO daily_plan_snapshots (
          id, learning_plan_id, local_date, effort_boundary_minutes,
          daily_mode, generator_version, supersedes_daily_plan_id, created_at
        ) VALUES (
          'daily_dup', 'plan_dup', '2026-07-17', 30, 'learn',
          'v0-plan-generator-1', NULL,
          '2026-07-17T00:00:00.000Z'
        )`,
    ).run();
    db.prepare(
      `INSERT INTO plan_items (
          id, daily_plan_id, practice_task_id, node_id,
          role, rank, reason_codes_json
        ) VALUES (
          'item_dup', 'daily_dup', 'task_dup', 'node_dup',
          'primary', 0, '["primary"]'
        )`,
    ).run();
    db.prepare(
      `INSERT INTO task_feedback (
          id, plan_item_id, action, reason_code, reason_text,
          attempt_id, successor_daily_plan_id, created_at
        ) VALUES (
          'fb_dup_first', 'item_dup', 'accepted', NULL, NULL,
          NULL, NULL, '2026-07-17T00:00:01.000Z'
        )`,
    ).run();

    expect(() =>
      db.prepare(
        `INSERT INTO task_feedback (
            id, plan_item_id, action, reason_code, reason_text,
            attempt_id, successor_daily_plan_id, created_at
          ) VALUES (
            'fb_dup_second', 'item_dup', 'accepted', NULL, NULL,
            NULL, NULL, '2026-07-17T00:00:02.000Z'
          )`,
      ).run(),
    ).toThrow(/UNIQUE constraint failed/);

    expect(countRows(db, "task_feedback")).toBe(1);

    assertDatabaseClean(db);
  });

  it("rejects invalid baseline or source values on learner_node_baselines", () => {
    const db = openTrackedDatabaseWithForeignKeys("learner-plan-bad-baseline-");

    applyMigrations(db, { now: () => "2026-07-17T00:00:00.000Z" });

    db.prepare(
      `INSERT INTO curriculum_packages (
          id, track_slug, semantic_version, checksum, source_revision, installed_at
        ) VALUES (
          'pkg_bl', 'software-development-foundations', '1.0.0',
          'sha256:bl', 'rev-1', '2026-07-17T00:00:00.000Z'
        )`,
    ).run();
    db.prepare(
      `INSERT INTO knowledge_nodes (
          id, stable_id, title, outcome, rationale, order_index,
          status, provenance_json, package_id
        ) VALUES (
          'node_bl', 'bl-node', 't', 'o', 'r', 1, 'published',
          '{}', 'pkg_bl'
        )`,
    ).run();
    db.prepare(
      `INSERT INTO learner_profiles (id, onboarding_state, created_at, updated_at)
       VALUES ('local-default-learner', 'plan_ready',
               '2026-07-17T00:00:00.000Z', '2026-07-17T00:00:00.000Z')`,
    ).run();

    expect(() =>
      db.prepare(
        `INSERT INTO learner_node_baselines (
            learner_id, node_id, baseline, confidence, source, updated_at
          ) VALUES (
            'local-default-learner', 'node_bl', 'mastered', 'low',
            'diagnosis', '2026-07-17T00:00:00.000Z'
          )`,
      ).run(),
    ).toThrow(/CHECK constraint failed/);

    expect(() =>
      db.prepare(
        `INSERT INTO learner_node_baselines (
            learner_id, node_id, baseline, confidence, source, updated_at
          ) VALUES (
            'local-default-learner', 'node_bl', 'ready', 'low',
            'self_report', '2026-07-17T00:00:00.000Z'
          )`,
      ).run(),
    ).toThrow(/CHECK constraint failed/);

    expect(countRows(db, "learner_node_baselines")).toBe(0);

    assertDatabaseClean(db);
  });

  it("preserves an existing 0006 capture attempt when 0007 is applied", () => {
    const directory = makeTempDir("learner-plan-preserve-");
    const oldMigrationsDir = join(directory, "old-migrations");
    mkdirSync(oldMigrationsDir);
    for (const name of [
      "0001_initial.sql",
      "0002_attempt_capture_source.sql",
      "0003_capture_sessions_and_submissions.sql",
      "0004_capture_credentials.sql",
      "0005_attempt_manual_corrections.sql",
      "0006_curriculum_catalog.sql",
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
        'session_preserve_7', 'installation_7', 'atcoder', 'practice_1',
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
        'event_preserve_7', 2, 'SUBMISSION_OBSERVED', 'session_preserve_7',
        'submission_preserve_7', 'installation_7', 'test@0.2.0', 'test@0.2.0',
        'https://atcoder.jp', 'extension_paired', 'atcoder', 'practice_1',
        'Practice Contest 1',
        'https://atcoder.jp/contests/practice/tasks/practice_1',
        '2026-07-17T00:00:30.000Z', '{"action":"submit_clicked"}',
        'fingerprint_7', '2026-07-17T00:00:30.000Z'
      );

      INSERT INTO training_attempts (
        id, capture_session_id, submission_id, record_source, platform,
        problem_external_id, problem_title, canonical_url,
        started_at, ended_at, result, verdict, language, duration_minutes,
        reflection, submission_event_id, verdict_event_id, revision,
        voided_at, void_reason, created_at, updated_at
      ) VALUES (
        'attempt_preserve_7', 'session_preserve_7', 'submission_preserve_7',
        'capture', 'atcoder', 'practice_1', 'Practice Contest 1',
        'https://atcoder.jp/contests/practice/tasks/practice_1',
        '2026-07-17T00:00:00.000Z', '2026-07-17T00:01:00.000Z',
        'passed', 'AC', 'cpp', 1, 'Keep this reflection.',
        'event_preserve_7', 'event_verdict_7', 1,
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
    for (const expected of NEW_TABLE_NAMES_7) {
      expect(names).toContain(expected);
    }

    const preservedRow = db
      .prepare<[string], { readonly id: string; readonly result: string }>(
        "SELECT id, result FROM training_attempts WHERE id = ?",
      )
      .get("attempt_preserve_7");
    expect(preservedRow).toEqual({
      id: "attempt_preserve_7",
      result: "passed",
    });

    expect(countRows(db, "learner_profiles")).toBe(0);
    expect(countRows(db, "daily_plan_snapshots")).toBe(0);

    assertDatabaseClean(db);
  });

  it("accepts every documented CHECK enum value and rejects one invalid value", () => {
    const db = openTrackedDatabaseWithForeignKeys("learner-plan-enum-");

    applyMigrations(db, { now: () => "2026-07-17T00:00:00.000Z" });

    expect(() =>
      db.prepare(
        `INSERT INTO learner_profiles (id, onboarding_state, created_at, updated_at)
         VALUES ('profile_a', 'new', '2026-07-17T00:00:00.000Z', '2026-07-17T00:00:00.000Z')`,
      ).run(),
    ).not.toThrow();
    expect(() =>
      db.prepare(
        `INSERT INTO learner_profiles (id, onboarding_state, created_at, updated_at)
         VALUES ('profile_b', 'goal_resolved', '2026-07-17T00:00:00.000Z', '2026-07-17T00:00:00.000Z')`,
      ).run(),
    ).not.toThrow();
    expect(() =>
      db.prepare(
        `INSERT INTO learner_profiles (id, onboarding_state, created_at, updated_at)
         VALUES ('profile_c', 'diagnosing', '2026-07-17T00:00:00.000Z', '2026-07-17T00:00:00.000Z')`,
      ).run(),
    ).not.toThrow();
    expect(() =>
      db.prepare(
        `INSERT INTO learner_profiles (id, onboarding_state, created_at, updated_at)
         VALUES ('profile_d', 'plan_ready', '2026-07-17T00:00:00.000Z', '2026-07-17T00:00:00.000Z')`,
      ).run(),
    ).not.toThrow();
    expect(() =>
      db.prepare(
        `INSERT INTO learner_profiles (id, onboarding_state, created_at, updated_at)
         VALUES ('profile_e', 'committed', '2026-07-17T00:00:00.000Z', '2026-07-17T00:00:00.000Z')`,
      ).run(),
    ).toThrow(/CHECK constraint failed/);

    db.prepare(
      `INSERT INTO learner_goals (
          id, learner_id, primary_track_id, interest_track_ids_json,
          status, created_at
        ) VALUES (
          'goal_active_e', 'profile_a', NULL, '[]', 'active',
          '2026-07-17T00:00:00.000Z'
        )`,
    ).run();
    expect(() =>
      db.prepare(
        `INSERT INTO learner_goals (
            id, learner_id, primary_track_id, interest_track_ids_json,
            status, created_at
          ) VALUES (
            'goal_superseded_e', 'profile_a', NULL, '[]', 'superseded',
            '2026-07-17T00:00:00.000Z'
          )`,
      ).run(),
    ).not.toThrow();
    expect(() =>
      db.prepare(
        `INSERT INTO learner_goals (
            id, learner_id, primary_track_id, interest_track_ids_json,
            status, created_at
          ) VALUES (
            'goal_bad_e', 'profile_a', NULL, '[]', 'archived',
            '2026-07-17T00:00:00.000Z'
          )`,
      ).run(),
    ).toThrow(/CHECK constraint failed/);

    db.prepare(
      `INSERT INTO diagnostic_sessions (
          id, learner_id, blueprint_version, status, started_at, completed_at
        ) VALUES (
          'sess_in_prog', 'profile_a', 'v0-diagnosis-1', 'in_progress',
          '2026-07-17T00:00:00.000Z', NULL
        )`,
    ).run();
    expect(() =>
      db.prepare(
        `INSERT INTO diagnostic_sessions (
            id, learner_id, blueprint_version, status, started_at, completed_at
          ) VALUES (
            'sess_done', 'profile_a', 'v0-diagnosis-1', 'completed',
            '2026-07-17T00:00:00.000Z', '2026-07-17T00:00:01.000Z'
          )`,
      ).run(),
    ).not.toThrow();
    expect(() =>
      db.prepare(
        `INSERT INTO diagnostic_sessions (
            id, learner_id, blueprint_version, status, started_at, completed_at
          ) VALUES (
            'sess_bad', 'profile_a', 'v0-diagnosis-1', 'abandoned',
            '2026-07-17T00:00:00.000Z', NULL
          )`,
      ).run(),
    ).toThrow(/CHECK constraint failed/);

    expect(() =>
      db.prepare(
        `INSERT INTO diagnostic_responses (
            session_id, prompt_id, response, created_at
          ) VALUES (
            'sess_in_prog', 'cpp-basics', 'unknown',
            '2026-07-17T00:00:00.000Z'
          )`,
      ).run(),
    ).not.toThrow();
    expect(() =>
      db.prepare(
        `INSERT INTO diagnostic_responses (
            session_id, prompt_id, response, created_at
          ) VALUES (
            'sess_in_prog', 'containers-functions', 'needs_foundation',
            '2026-07-17T00:00:00.000Z'
          )`,
      ).run(),
    ).not.toThrow();
    expect(() =>
      db.prepare(
        `INSERT INTO diagnostic_responses (
            session_id, prompt_id, response, created_at
          ) VALUES (
            'sess_in_prog', 'debugging-testing', 'can_with_help',
            '2026-07-17T00:00:00.000Z'
          )`,
      ).run(),
    ).not.toThrow();
    expect(() =>
      db.prepare(
        `INSERT INTO diagnostic_responses (
            session_id, prompt_id, response, created_at
          ) VALUES (
            'sess_in_prog', 'git-build', 'ready',
            '2026-07-17T00:00:00.000Z'
          )`,
      ).run(),
    ).not.toThrow();
    expect(() =>
      db.prepare(
        `INSERT INTO diagnostic_responses (
            session_id, prompt_id, response, created_at
          ) VALUES (
            'sess_in_prog', 'trees-graphs', 'confident',
            '2026-07-17T00:00:00.000Z'
          )`,
      ).run(),
    ).toThrow(/CHECK constraint failed/);

    db.prepare(
      `INSERT INTO curriculum_packages (
          id, track_slug, semantic_version, checksum, source_revision, installed_at
        ) VALUES (
          'pkg_enum7', 'software-development-foundations', '1.0.0',
          'sha256:enum7', 'rev-1', '2026-07-17T00:00:00.000Z'
        )`,
    ).run();
    db.prepare(
      `INSERT INTO knowledge_nodes (
          id, stable_id, title, outcome, rationale, order_index,
          status, provenance_json, package_id
        ) VALUES (
          'node_enum7', 'enum7-node', 't', 'o', 'r', 1, 'published',
          '{}', 'pkg_enum7'
        )`,
    ).run();

    expect(() =>
      db.prepare(
        `INSERT INTO learner_node_baselines (
            learner_id, node_id, baseline, confidence, source, updated_at
          ) VALUES (
            'profile_a', 'node_enum7', 'unknown', 'low', 'diagnosis',
            '2026-07-17T00:00:00.000Z'
          )`,
      ).run(),
    ).not.toThrow();
    expect(() =>
      db.prepare(
        `INSERT INTO learner_node_baselines (
            learner_id, node_id, baseline, confidence, source, updated_at
          ) VALUES (
            'profile_b', 'node_enum7', 'needs_foundation', 'medium',
            'manual_override',
            '2026-07-17T00:00:00.000Z'
          )`,
      ).run(),
    ).not.toThrow();
    expect(() =>
      db.prepare(
        `INSERT INTO learner_node_baselines (
            learner_id, node_id, baseline, confidence, source, updated_at
          ) VALUES (
            'profile_c', 'node_enum7', 'self_reported', 'medium', 'diagnosis',
            '2026-07-17T00:00:00.000Z'
          )`,
      ).run(),
    ).not.toThrow();
    expect(() =>
      db.prepare(
        `INSERT INTO learner_node_baselines (
            learner_id, node_id, baseline, confidence, source, updated_at
          ) VALUES (
            'profile_d', 'node_enum7', 'ready', 'high', 'manual_override',
            '2026-07-17T00:00:00.000Z'
          )`,
      ).run(),
    ).not.toThrow();
    expect(() =>
      db.prepare(
        `INSERT INTO learner_node_baselines (
            learner_id, node_id, baseline, confidence, source, updated_at
          ) VALUES (
            'profile_a', 'node_enum7', 'mastered', 'high', 'diagnosis',
            '2026-07-17T00:00:00.000Z'
          )`,
      ).run(),
    ).toThrow(/CHECK constraint failed/);
    expect(() =>
      db.prepare(
        `INSERT INTO learner_node_baselines (
            learner_id, node_id, baseline, confidence, source, updated_at
          ) VALUES (
            'profile_b', 'node_enum7', 'ready', 'extreme', 'diagnosis',
            '2026-07-17T00:00:00.000Z'
          )`,
      ).run(),
    ).toThrow(/CHECK constraint failed/);
    expect(() =>
      db.prepare(
        `INSERT INTO learner_node_baselines (
            learner_id, node_id, baseline, confidence, source, updated_at
          ) VALUES (
            'profile_c', 'node_enum7', 'ready', 'high', 'guess',
            '2026-07-17T00:00:00.000Z'
          )`,
      ).run(),
    ).toThrow(/CHECK constraint failed/);

    db.prepare(
      `INSERT INTO learning_plans (
          id, learner_id, generator_version, snapshot_json, status, created_at
        ) VALUES (
          'plan_enum7', 'profile_a', 'v0-plan-generator-1', '{}', 'active',
          '2026-07-17T00:00:00.000Z'
        )`,
    ).run();
    expect(() =>
      db.prepare(
        `INSERT INTO learning_plans (
            id, learner_id, generator_version, snapshot_json, status, created_at
          ) VALUES (
            'plan_enum7_superseded', 'profile_a', 'v0-plan-generator-1',
            '{}', 'superseded', '2026-07-17T00:00:00.000Z'
          )`,
      ).run(),
    ).not.toThrow();
    expect(() =>
      db.prepare(
        `INSERT INTO learning_plans (
            id, learner_id, generator_version, snapshot_json, status, created_at
          ) VALUES (
            'plan_bad', 'profile_a', 'v0-plan-generator-1', '{}', 'archived',
            '2026-07-17T00:00:00.000Z'
          )`,
      ).run(),
    ).toThrow(/CHECK constraint failed/);

    expect(() =>
      db.prepare(
        `INSERT INTO daily_plan_snapshots (
            id, learning_plan_id, local_date, effort_boundary_minutes,
            daily_mode, generator_version, supersedes_daily_plan_id, created_at
          ) VALUES (
            'daily_e15', 'plan_enum7', '2026-07-17', 15, 'learn',
            'v0-plan-generator-1', NULL,
            '2026-07-17T00:00:00.000Z'
          )`,
      ).run(),
    ).not.toThrow();
    expect(() =>
      db.prepare(
        `INSERT INTO daily_plan_snapshots (
            id, learning_plan_id, local_date, effort_boundary_minutes,
            daily_mode, generator_version, supersedes_daily_plan_id, created_at
          ) VALUES (
            'daily_e30', 'plan_enum7', '2026-07-18', 30, 'practice',
            'v0-plan-generator-1', NULL,
            '2026-07-17T00:00:00.000Z'
          )`,
      ).run(),
    ).not.toThrow();
    expect(() =>
      db.prepare(
        `INSERT INTO daily_plan_snapshots (
            id, learning_plan_id, local_date, effort_boundary_minutes,
            daily_mode, generator_version, supersedes_daily_plan_id, created_at
          ) VALUES (
            'daily_e60', 'plan_enum7', '2026-07-19', 60, 'recover',
            'v0-plan-generator-1', NULL,
            '2026-07-17T00:00:00.000Z'
          )`,
      ).run(),
    ).not.toThrow();
    expect(() =>
      db.prepare(
        `INSERT INTO daily_plan_snapshots (
            id, learning_plan_id, local_date, effort_boundary_minutes,
            daily_mode, generator_version, supersedes_daily_plan_id, created_at
          ) VALUES (
            'daily_e90', 'plan_enum7', '2026-07-20', 90, 'learn',
            'v0-plan-generator-1', NULL,
            '2026-07-17T00:00:00.000Z'
          )`,
      ).run(),
    ).not.toThrow();
    expect(() =>
      db.prepare(
        `INSERT INTO daily_plan_snapshots (
            id, learning_plan_id, local_date, effort_boundary_minutes,
            daily_mode, generator_version, supersedes_daily_plan_id, created_at
          ) VALUES (
            'daily_bad', 'plan_enum7', '2026-07-21', 5, 'learn',
            'v0-plan-generator-1', NULL,
            '2026-07-17T00:00:00.000Z'
          )`,
      ).run(),
    ).toThrow(/CHECK constraint failed/);
    expect(() =>
      db.prepare(
        `INSERT INTO daily_plan_snapshots (
            id, learning_plan_id, local_date, effort_boundary_minutes,
            daily_mode, generator_version, supersedes_daily_plan_id, created_at
          ) VALUES (
            'daily_bad_mode', 'plan_enum7', '2026-07-22', 30, 'study',
            'v0-plan-generator-1', NULL,
            '2026-07-17T00:00:00.000Z'
          )`,
      ).run(),
    ).toThrow(/CHECK constraint failed/);

    db.prepare(
      `INSERT INTO canonical_problems (id, stable_id, title)
       VALUES ('cp_enum7', 'enum7-problem', 'P')`,
    ).run();
    db.prepare(
      `INSERT INTO practice_tasks (
          id, stable_id, canonical_problem_id, title, kind, difficulty_band,
          package_id
        ) VALUES (
          'task_enum7', 'enum7-task', 'cp_enum7', 'T', 'oj', 'intro',
          'pkg_enum7'
        )`,
    ).run();

    expect(() =>
      db.prepare(
        `INSERT INTO plan_items (
            id, daily_plan_id, practice_task_id, node_id,
            role, rank, reason_codes_json
          ) VALUES (
            'item_primary7', 'daily_e15', 'task_enum7', 'node_enum7',
            'primary', 0, '["primary"]'
          )`,
      ).run(),
    ).not.toThrow();
    expect(() =>
      db.prepare(
        `INSERT INTO plan_items (
            id, daily_plan_id, practice_task_id, node_id,
            role, rank, reason_codes_json
          ) VALUES (
            'item_warmup7', 'daily_e30', 'task_enum7', 'node_enum7',
            'warmup', 0, '["warmup"]'
          )`,
      ).run(),
    ).not.toThrow();
    expect(() =>
      db.prepare(
        `INSERT INTO plan_items (
            id, daily_plan_id, practice_task_id, node_id,
            role, rank, reason_codes_json
          ) VALUES (
            'item_alt', 'daily_e60', 'task_enum7', 'node_enum7',
            'same_goal_alternative', 0, '["alt"]'
          )`,
      ).run(),
    ).not.toThrow();
    expect(() =>
      db.prepare(
        `INSERT INTO plan_items (
            id, daily_plan_id, practice_task_id, node_id,
            role, rank, reason_codes_json
          ) VALUES (
            'item_weak', 'daily_e90', 'task_enum7', 'node_enum7',
            'weakness_review', 0, '["weak"]'
          )`,
      ).run(),
    ).not.toThrow();
    expect(() =>
      db.prepare(
        `INSERT INTO plan_items (
            id, daily_plan_id, practice_task_id, node_id,
            role, rank, reason_codes_json
          ) VALUES (
            'item_warmup_dup', 'daily_e30', 'task_enum7', 'node_enum7',
            'warmup', 1, '["dup"]'
          )`,
      ).run(),
    ).toThrow(/UNIQUE constraint failed/);
    expect(() =>
      db.prepare(
        `INSERT INTO plan_items (
            id, daily_plan_id, practice_task_id, node_id,
            role, rank, reason_codes_json
          ) VALUES (
            'item_bad_role', 'daily_e15', 'task_enum7', 'node_enum7',
            'optional', 4, '[]'
          )`,
      ).run(),
    ).toThrow(/CHECK constraint failed/);

    expect(() =>
      db.prepare(
        `INSERT INTO task_feedback (
            id, plan_item_id, action, reason_code, reason_text,
            attempt_id, successor_daily_plan_id, created_at
          ) VALUES (
            'fb_a', 'item_primary7', 'accepted', NULL, NULL,
            NULL, NULL, '2026-07-17T00:00:00.000Z'
          )`,
      ).run(),
    ).not.toThrow();
    expect(() =>
      db.prepare(
        `INSERT INTO task_feedback (
            id, plan_item_id, action, reason_code, reason_text,
            attempt_id, successor_daily_plan_id, created_at
          ) VALUES (
            'fb_b', 'item_primary7', 'started', NULL, NULL,
            NULL, NULL, '2026-07-17T00:00:01.000Z'
          )`,
      ).run(),
    ).not.toThrow();
    expect(() =>
      db.prepare(
        `INSERT INTO task_feedback (
            id, plan_item_id, action, reason_code, reason_text,
            attempt_id, successor_daily_plan_id, created_at
          ) VALUES (
            'fb_c', 'item_primary7', 'completed', NULL, NULL,
            NULL, NULL, '2026-07-17T00:00:02.000Z'
          )`,
      ).run(),
    ).not.toThrow();
    expect(() =>
      db.prepare(
        `INSERT INTO task_feedback (
            id, plan_item_id, action, reason_code, reason_text,
            attempt_id, successor_daily_plan_id, created_at
          ) VALUES (
            'fb_d', 'item_alt', 'skipped', 'too_hard', NULL,
            NULL, NULL, '2026-07-17T00:00:03.000Z'
          )`,
      ).run(),
    ).not.toThrow();
    expect(() =>
      db.prepare(
        `INSERT INTO task_feedback (
            id, plan_item_id, action, reason_code, reason_text,
            attempt_id, successor_daily_plan_id, created_at
          ) VALUES (
            'fb_bad_action', 'item_weak', 'paused', NULL, NULL,
            NULL, NULL, '2026-07-17T00:00:04.000Z'
          )`,
      ).run(),
    ).toThrow(/CHECK constraint failed/);
    expect(() =>
      db.prepare(
        `INSERT INTO task_feedback (
            id, plan_item_id, action, reason_code, reason_text,
            attempt_id, successor_daily_plan_id, created_at
          ) VALUES (
            'fb_bad_reason', 'item_weak', 'skipped', 'too_long', NULL,
            NULL, NULL, '2026-07-17T00:00:05.000Z'
          )`,
      ).run(),
    ).toThrow(/CHECK constraint failed/);

    expect(() =>
      db.prepare(
        `INSERT INTO plan_revision_events (
            id, before_daily_plan_id, after_daily_plan_id, event_type,
            input_fingerprint, created_at
          ) VALUES (
            'rev_initial_e', NULL, 'daily_e15', 'initial_plan',
            'sha256:e0', '2026-07-17T00:00:00.000Z'
          )`,
      ).run(),
    ).not.toThrow();
    expect(() =>
      db.prepare(
        `INSERT INTO plan_revision_events (
            id, before_daily_plan_id, after_daily_plan_id, event_type,
            input_fingerprint, created_at
          ) VALUES (
            'rev_goal', 'daily_e15', 'daily_e30', 'goal_changed',
            'sha256:eg', '2026-07-17T00:00:01.000Z'
          )`,
      ).run(),
    ).not.toThrow();
    expect(() =>
      db.prepare(
        `INSERT INTO plan_revision_events (
            id, before_daily_plan_id, after_daily_plan_id, event_type,
            input_fingerprint, created_at
          ) VALUES (
            'rev_diag', 'daily_e30', 'daily_e60', 'diagnosis_completed',
            'sha256:ed', '2026-07-17T00:00:02.000Z'
          )`,
      ).run(),
    ).not.toThrow();
    expect(() =>
      db.prepare(
        `INSERT INTO plan_revision_events (
            id, before_daily_plan_id, after_daily_plan_id, event_type,
            input_fingerprint, created_at
          ) VALUES (
            'rev_eff', 'daily_e60', 'daily_e90', 'effort_changed',
            'sha256:ee', '2026-07-17T00:00:03.000Z'
          )`,
      ).run(),
    ).not.toThrow();
    expect(() =>
      db.prepare(
        `INSERT INTO plan_revision_events (
            id, before_daily_plan_id, after_daily_plan_id, event_type,
            input_fingerprint, created_at
          ) VALUES (
            'rev_skip', 'daily_e90', 'daily_e15', 'item_skipped',
            'sha256:es', '2026-07-17T00:00:04.000Z'
          )`,
      ).run(),
    ).not.toThrow();
    expect(() =>
      db.prepare(
        `INSERT INTO plan_revision_events (
            id, before_daily_plan_id, after_daily_plan_id, event_type,
            input_fingerprint, created_at
          ) VALUES (
            'rev_done', 'daily_e15', 'daily_e30', 'item_completed',
            'sha256:eco', '2026-07-17T00:00:05.000Z'
          )`,
      ).run(),
    ).not.toThrow();
    expect(() =>
      db.prepare(
        `INSERT INTO plan_revision_events (
            id, before_daily_plan_id, after_daily_plan_id, event_type,
            input_fingerprint, created_at
          ) VALUES (
            'rev_corrected', 'daily_e30', 'daily_e60', 'attempt_corrected',
            'sha256:ecr', '2026-07-17T00:00:06.000Z'
          )`,
      ).run(),
    ).not.toThrow();
    expect(() =>
      db.prepare(
        `INSERT INTO plan_revision_events (
            id, before_daily_plan_id, after_daily_plan_id, event_type,
            input_fingerprint, created_at
          ) VALUES (
            'rev_voided', 'daily_e60', 'daily_e90', 'attempt_voided',
            'sha256:ev', '2026-07-17T00:00:07.000Z'
          )`,
      ).run(),
    ).not.toThrow();
    expect(() =>
      db.prepare(
        `INSERT INTO plan_revision_events (
            id, before_daily_plan_id, after_daily_plan_id, event_type,
            input_fingerprint, created_at
          ) VALUES (
            'rev_bad_type', 'daily_e90', 'daily_e15', 'pause_changed',
            'sha256:ept', '2026-07-17T00:00:08.000Z'
          )`,
      ).run(),
    ).toThrow(/CHECK constraint failed/);

    assertDatabaseClean(db);
  });
});
