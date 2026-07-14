import {
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";
import { afterEach, describe, expect, it } from "vitest";
import { applyMigrations } from "@/lib/db/migrations";

const tempDirs: string[] = [];

function makeTempDir(prefix: string): string {
  const directory = mkdtempSync(join(tmpdir(), prefix));
  tempDirs.push(directory);
  return directory;
}

afterEach(() => {
  for (const directory of tempDirs.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe("applyMigrations", () => {
  it("applies every repository migration exactly once", () => {
    const directory = makeTempDir("migration-runner-");
    const db = new Database(join(directory, "test.sqlite"));

    try {
      const options = { now: () => "2026-07-11T00:00:00.000Z" };
      applyMigrations(db, options);
      applyMigrations(db, options);

      const migrationCount = db
        .prepare<[], { readonly count: number }>("SELECT COUNT(*) AS count FROM schema_migrations")
        .get();
      const attemptColumns = db
        .prepare<[], { readonly name: string }>("PRAGMA table_info(training_attempts)")
        .all()
        .map((column) => column.name);
      const expectedMigrationCount = readdirSync(
        join(process.cwd(), "lib", "db", "migrations"),
      ).filter((name) => name.endsWith(".sql")).length;

      expect(migrationCount).toEqual({ count: expectedMigrationCount });
      expect(attemptColumns).toContain("capture_session_id");
      expect(attemptColumns).toContain("submission_id");
    } finally {
      db.close();
    }
  });

  it("rolls back a failed migration and reports its filename", () => {
    const directory = makeTempDir("migration-failure-");
    const migrationsDir = join(directory, "migrations");
    const db = new Database(join(directory, "test.sqlite"));
    mkdirSync(migrationsDir);
    writeFileSync(
      join(migrationsDir, "0001_broken.sql"),
      "CREATE TABLE broken (id TEXT PRIMARY KEY); THIS IS NOT SQL;",
      "utf8",
    );

    try {
      expect(() =>
        applyMigrations(db, {
          migrationsDir,
          now: () => "2026-07-11T00:00:00.000Z",
        }),
      ).toThrow("Migration 0001_broken.sql failed");

      const migrationCount = db
        .prepare<[], { readonly count: number }>("SELECT COUNT(*) AS count FROM schema_migrations")
        .get();
      const brokenTable = db
        .prepare<[], { readonly name: string }>("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'broken'")
        .get();

      expect(migrationCount).toEqual({ count: 0 });
      expect(brokenTable).toBeUndefined();
    } finally {
      db.close();
    }
  });

  it("cuts synthetic V1 capture data over to an empty V2 schema", () => {
    const directory = makeTempDir("migration-v2-cutover-");
    const oldMigrationsDir = join(directory, "old-migrations");
    const db = new Database(join(directory, "test.sqlite"));
    mkdirSync(oldMigrationsDir);
    for (const name of ["0001_initial.sql", "0002_attempt_capture_source.sql"]) {
      copyFileSync(
        join(process.cwd(), "lib", "db", "migrations", name),
        join(oldMigrationsDir, name),
      );
    }

    try {
      applyMigrations(db, {
        migrationsDir: oldMigrationsDir,
        now: () => "2026-07-14T00:00:00.000Z",
      });
      db.prepare(`
        INSERT INTO problems (
          id, platform, external_id, title, canonical_url, tags_json, difficulty,
          status, content_mode, training_mode, created_at, updated_at
        ) VALUES (
          'problem_1', 'leetcode', 'two-sum', 'Two Sum',
          'https://leetcode.com/problems/two-sum/', '[]', 'easy', 'active',
          'metadata_only', 'original_platform',
          '2026-07-14T00:00:00.000Z', '2026-07-14T00:00:00.000Z'
        )
      `).run();
      db.prepare(`
        INSERT INTO capture_events (
          id, type, platform, problem_external_id, problem_title, canonical_url,
          occurred_at, payload_json
        ) VALUES (
          'evt_e2e_1', 'PAGE_DETECTED', 'leetcode', 'two-sum', 'Two Sum',
          'https://leetcode.com/problems/two-sum/',
          '2026-07-14T00:00:00.000Z', '{"source":"e2e"}'
        )
      `).run();
      db.prepare(`
        INSERT INTO training_attempts (
          id, platform, problem_external_id, problem_title, canonical_url,
          started_at, result, source_event_id, created_at, updated_at
        ) VALUES (
          'attempt_evt_e2e_1', 'leetcode', 'two-sum', 'Two Sum',
          'https://leetcode.com/problems/two-sum/',
          '2026-07-14T00:00:00.000Z', 'draft', 'evt_e2e_1',
          '2026-07-14T00:00:00.000Z', '2026-07-14T00:00:00.000Z'
        )
      `).run();

      applyMigrations(db, { now: () => "2026-07-14T00:01:00.000Z" });

      expect(countRows(db, "capture_events")).toBe(0);
      expect(countRows(db, "training_attempts")).toBe(0);
      expect(countRows(db, "training_sessions")).toBe(0);
      expect(countRows(db, "problems")).toBe(1);

      db.prepare(`
        INSERT INTO training_sessions (
          id, installation_id, platform, problem_external_id, problem_title,
          canonical_url, provenance_level, started_at, ended_at, end_reason,
          created_at, updated_at
        ) VALUES (
          'session_open', 'installation_1', 'leetcode', 'two-sum', 'Two Sum',
          'https://leetcode.com/problems/two-sum/', 'extension_unpaired',
          '2026-07-14T00:00:00.000Z', NULL, NULL,
          '2026-07-14T00:00:00.000Z', '2026-07-14T00:00:00.000Z'
        )
      `).run();
      expect(countRows(db, "training_sessions")).toBe(1);
      expect(() =>
        db.prepare(`
          INSERT INTO training_sessions (
            id, installation_id, platform, problem_external_id, problem_title,
            canonical_url, provenance_level, started_at, ended_at, end_reason,
            created_at, updated_at
          ) VALUES (
            'session_invalid', 'installation_1', 'leetcode', 'two-sum', 'Two Sum',
            'https://leetcode.com/problems/two-sum/', 'extension_unpaired',
            '2026-07-14T00:00:00.000Z', '2026-07-14T00:02:00.000Z', NULL,
            '2026-07-14T00:00:00.000Z', '2026-07-14T00:00:00.000Z'
          )
        `).run(),
      ).toThrow();
    } finally {
      db.close();
    }
  });

  it("preserves V2 capture rows while adding paired provenance and credentials", () => {
    const directory = makeTempDir("migration-credentials-");
    const oldMigrationsDir = join(directory, "old-migrations");
    const db = new Database(join(directory, "test.sqlite"));
    mkdirSync(oldMigrationsDir);
    for (const name of [
      "0001_initial.sql",
      "0002_attempt_capture_source.sql",
      "0003_capture_sessions_and_submissions.sql",
    ]) {
      copyFileSync(
        join(process.cwd(), "lib", "db", "migrations", name),
        join(oldMigrationsDir, name),
      );
    }

    try {
      applyMigrations(db, {
        migrationsDir: oldMigrationsDir,
        now: () => "2026-07-14T00:00:00.000Z",
      });
      db.exec(`
        INSERT INTO training_sessions (
          id, installation_id, platform, problem_external_id, problem_title,
          canonical_url, provenance_level, started_at, ended_at, end_reason,
          created_at, updated_at
        ) VALUES (
          'session_preserved', 'installation_1', 'leetcode', 'two-sum', 'Two Sum',
          'https://leetcode.com/problems/two-sum/', 'extension_unpaired',
          '2026-07-14T00:00:00.000Z', NULL, NULL,
          '2026-07-14T00:00:00.000Z', '2026-07-14T00:00:00.000Z'
        );
        INSERT INTO capture_events (
          id, schema_version, type, capture_session_id, submission_id,
          installation_id, adapter_version, parser_version, page_origin,
          provenance_level, platform, problem_external_id, problem_title,
          canonical_url, occurred_at, payload_json, event_fingerprint, received_at
        ) VALUES (
          'event_preserved', 2, 'SUBMISSION_OBSERVED', 'session_preserved',
          'submission_preserved', 'installation_1', 'test@0.2.0', 'test@0.2.0',
          'https://leetcode.com', 'extension_unpaired', 'leetcode', 'two-sum',
          'Two Sum', 'https://leetcode.com/problems/two-sum/',
          '2026-07-14T00:01:00.000Z', '{"action":"submit_clicked"}',
          'fingerprint', '2026-07-14T00:01:00.000Z'
        );
        INSERT INTO training_attempts (
          id, capture_session_id, submission_id, platform, problem_external_id,
          problem_title, canonical_url, started_at, result, submission_event_id,
          created_at, updated_at
        ) VALUES (
          'attempt_preserved', 'session_preserved', 'submission_preserved',
          'leetcode', 'two-sum', 'Two Sum',
          'https://leetcode.com/problems/two-sum/',
          '2026-07-14T00:01:00.000Z', 'draft', 'event_preserved',
          '2026-07-14T00:01:00.000Z', '2026-07-14T00:01:00.000Z'
        );
      `);

      applyMigrations(db, { now: () => "2026-07-14T00:02:00.000Z" });

      expect(countRows(db, "training_sessions")).toBe(1);
      expect(countRows(db, "capture_events")).toBe(1);
      expect(countRows(db, "training_attempts")).toBe(1);
      expect(countRows(db, "capture_installations")).toBe(0);
      expect(
        db.prepare<[], { readonly table: string }>(
          "PRAGMA foreign_key_list(training_attempts)",
        ).all().map((row) => row.table),
      ).toContain("training_sessions");
      expect(() => db.prepare(`
        INSERT INTO training_sessions (
          id, installation_id, platform, problem_external_id, problem_title,
          canonical_url, provenance_level, started_at, ended_at, end_reason,
          created_at, updated_at
        ) VALUES (
          'session_paired', 'installation_2', 'leetcode', 'three-sum', '3Sum',
          'https://leetcode.com/problems/3sum/', 'extension_paired',
          '2026-07-14T00:02:00.000Z', NULL, NULL,
          '2026-07-14T00:02:00.000Z', '2026-07-14T00:02:00.000Z'
        )
      `).run()).not.toThrow();
    } finally {
      db.close();
    }
  });

  it("preserves V2 attempts while adding manual source and correction storage", () => {
    const directory = makeTempDir("migration-manual-corrections-");
    const oldMigrationsDir = join(directory, "old-migrations");
    const db = new Database(join(directory, "test.sqlite"));
    mkdirSync(oldMigrationsDir);
    for (const name of [
      "0001_initial.sql",
      "0002_attempt_capture_source.sql",
      "0003_capture_sessions_and_submissions.sql",
      "0004_capture_credentials.sql",
    ]) {
      copyFileSync(
        join(process.cwd(), "lib", "db", "migrations", name),
        join(oldMigrationsDir, name),
      );
    }

    try {
      applyMigrations(db, {
        migrationsDir: oldMigrationsDir,
        now: () => "2026-07-14T00:00:00.000Z",
      });
      db.exec(`
        INSERT INTO training_sessions (
          id, installation_id, platform, problem_external_id, problem_title,
          canonical_url, provenance_level, started_at, created_at, updated_at
        ) VALUES (
          'session_preserved_0c2', 'installation_0c2', 'leetcode', 'two-sum',
          'Two Sum', 'https://leetcode.com/problems/two-sum/',
          'extension_paired', '2026-07-14T00:00:00.000Z',
          '2026-07-14T00:00:00.000Z', '2026-07-14T00:00:00.000Z'
        );
        INSERT INTO capture_events (
          id, schema_version, type, capture_session_id, submission_id,
          installation_id, adapter_version, parser_version, page_origin,
          provenance_level, platform, problem_external_id, problem_title,
          canonical_url, occurred_at, payload_json, event_fingerprint, received_at
        ) VALUES (
          'event_submission_0c2', 2, 'SUBMISSION_OBSERVED',
          'session_preserved_0c2', 'submission_preserved_0c2',
          'installation_0c2', 'test@0.2.0', 'test@0.2.0',
          'https://leetcode.com', 'extension_paired', 'leetcode', 'two-sum',
          'Two Sum', 'https://leetcode.com/problems/two-sum/',
          '2026-07-14T00:01:00.000Z', '{"action":"submit_clicked"}',
          'fingerprint_0c2', '2026-07-14T00:01:00.000Z'
        );
        INSERT INTO training_attempts (
          id, capture_session_id, submission_id, platform, problem_external_id,
          problem_title, canonical_url, started_at, ended_at, result, verdict,
          language, duration_minutes, reflection, submission_event_id,
          verdict_event_id, created_at, updated_at
        ) VALUES (
          'attempt_preserved_0c2', 'session_preserved_0c2',
          'submission_preserved_0c2', 'leetcode', 'two-sum', 'Two Sum',
          'https://leetcode.com/problems/two-sum/',
          '2026-07-14T00:01:00.000Z', '2026-07-14T00:02:00.000Z',
          'failed', 'Wrong Answer', 'cpp', 1, 'Keep this reflection',
          'event_submission_0c2', 'event_verdict_0c2',
          '2026-07-14T00:01:00.000Z', '2026-07-14T00:02:00.000Z'
        );
      `);

      applyMigrations(db, { now: () => "2026-07-14T00:03:00.000Z" });

      expect(db.prepare<[], {
        readonly id: string;
        readonly capture_session_id: string;
        readonly submission_id: string;
        readonly result: string;
        readonly reflection: string;
        readonly record_source: string;
        readonly revision: number;
        readonly voided_at: string | null;
        readonly void_reason: string | null;
      }>(`
        SELECT id, capture_session_id, submission_id, result, reflection,
          record_source, revision, voided_at, void_reason
        FROM training_attempts
      `).get()).toEqual({
        id: "attempt_preserved_0c2",
        capture_session_id: "session_preserved_0c2",
        submission_id: "submission_preserved_0c2",
        result: "failed",
        reflection: "Keep this reflection",
        record_source: "capture",
        revision: 1,
        voided_at: null,
        void_reason: null,
      });
      expect(countRows(db, "capture_events")).toBe(1);
      expect(countRows(db, "training_sessions")).toBe(1);
      expect(countRows(db, "training_attempts")).toBe(1);
      expect(countRows(db, "attempt_corrections")).toBe(0);
    } finally {
      db.close();
    }
  });
});

function countRows(db: Database.Database, table: string): number {
  return db
    .prepare<[], { readonly count: number }>(`SELECT COUNT(*) AS count FROM ${table}`)
    .get()?.count ?? 0;
}
