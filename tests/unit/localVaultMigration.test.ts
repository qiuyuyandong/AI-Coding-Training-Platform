import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import Database from "better-sqlite3";
import { afterEach, describe, expect, it } from "vitest";

import { applyMigrations } from "@/lib/db/migrations";
import { CaptureProvenanceLevelSchema } from "@/lib/domain/captureCredential";
import {
  adoptLegacyDatabase,
  snapshotFile,
  VAULT_CONFIG_NAME,
  VAULT_DATABASE_NAME,
} from "@/lib/vault/localVault";

const MIGRATIONS_DIRECTORY = join(process.cwd(), "lib", "db", "migrations");
const ownedRoots: string[] = [];
type SqliteRow = Readonly<Record<string, string | number | null>>;

afterEach(() => {
  for (const root of ownedRoots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe("0009_local_vault_extension_origin.sql", () => {
  it("fresh-applies the local provenance and removes Vault authentication metadata", () => {
    const database = openFreshDatabase();
    try {
      expect(appliedMigrationIds(database)).toEqual(repositoryMigrationNames());
      expect(tableExists(database, "capture_installations")).toBe(false);
      expect(tableExists(database, "capture_pairing_codes")).toBe(false);
      expect(CaptureProvenanceLevelSchema.parse("extension_local")).toBe("extension_local");
      expectIntegrity(database);
    } finally {
      database.close();
    }
  });

  it("preserves populated 0008 rows and historical provenance byte-for-byte", () => {
    const root = makeRoot();
    const oldMigrations = join(root, "old-migrations");
    const database = new Database(join(root, "database.sqlite"));
    database.pragma("foreign_keys = ON");
    copyMigrationPrefix(oldMigrations, 8);
    try {
      applyMigrations(database, { migrationsDir: oldMigrations, now: fixedNow });
      insertHistoricalFixture(database);
      const sessionsBefore = readRows(database, "training_sessions", "id");
      const eventsBefore = readRows(database, "capture_events", "id");
      const attemptsBefore = readRows(database, "training_attempts", "id");
      const correctionsBefore = readRows(database, "attempt_corrections", "correction_id");

      applyMigrations(database, { now: fixedNow });

      expect(readRows(database, "training_sessions", "id")).toEqual(sessionsBefore);
      expect(readRows(database, "capture_events", "id")).toEqual(eventsBefore);
      expect(readRows(database, "training_attempts", "id")).toEqual(attemptsBefore);
      expect(readRows(database, "attempt_corrections", "correction_id")).toEqual(correctionsBefore);
      expect(tableExists(database, "capture_installations")).toBe(false);
      expect(tableExists(database, "capture_pairing_codes")).toBe(false);
      expect(indexExists(database, "idx_capture_events_session_time")).toBe(true);
      expect(indexExists(database, "idx_training_sessions_end")).toBe(true);
      expect(
        database.prepare<[], { readonly table: string }>(
          "PRAGMA foreign_key_list(training_attempts)",
        ).all().map((row) => row.table),
      ).toContain("training_sessions");
      expect(() => insertSession(database, "local", "extension_local")).not.toThrow();
      expect(() => insertSession(database, "invalid", "extension_remote")).toThrow();
      expectIntegrity(database);

      applyMigrations(database, { now: fixedNow });
      expect(appliedMigrationIds(database)).toEqual(repositoryMigrationNames());
      expectIntegrity(database);
    } finally {
      database.close();
    }
  });

  it("upgrades and adopts every historical migration prefix without changing the source", () => {
    const migrationNames = repositoryMigrationNames();
    for (let prefixLength = 1; prefixLength < migrationNames.length; prefixLength += 1) {
      const root = makeRoot();
      const prefixDirectory = join(root, "prefix");
      const sourcePath = join(root, "source.sqlite");
      const targetDirectory = join(root, "target");
      const configDirectory = join(root, "config");
      mkdirSync(targetDirectory);
      copyMigrationPrefix(prefixDirectory, prefixLength);
      const source = new Database(sourcePath);
      try {
        source.pragma("foreign_keys = ON");
        applyMigrations(source, { migrationsDir: prefixDirectory, now: fixedNow });
      } finally {
        source.close();
      }
      const sourceBefore = snapshotFile(sourcePath);
      const adopted = adoptLegacyDatabase(sourcePath, targetDirectory, configDirectory, {
        now: fixedNow,
        createId: () => `00000000-0000-4000-8000-${String(prefixLength).padStart(12, "0")}`,
      });
      expect(adopted.sourceBefore).toEqual(sourceBefore);
      expect(adopted.sourceAfter).toEqual(sourceBefore);
      expect(snapshotFile(sourcePath)).toEqual(sourceBefore);
      expect(readFileSync(join(configDirectory, VAULT_CONFIG_NAME), "utf8"))
        .toContain(adopted.vault.vaultPath.replaceAll("\\", "\\\\"));
      const target = new Database(adopted.vault.databasePath, { readonly: true });
      try {
        expect(appliedMigrationIds(target)).toEqual(migrationNames);
        expectIntegrity(target);
      } finally {
        target.close();
      }
    }
  }, 300_000);

  it("rejects a source/target collision without changing the source", () => {
    const root = makeRoot();
    const targetDirectory = join(root, "target");
    const configDirectory = join(root, "config");
    mkdirSync(targetDirectory);
    const sourcePath = join(targetDirectory, VAULT_DATABASE_NAME);
    const source = new Database(sourcePath);
    try {
      applyMigrations(source, { now: fixedNow });
    } finally {
      source.close();
    }
    const before = snapshotFile(sourcePath);
    expect(() => adoptLegacyDatabase(sourcePath, targetDirectory, configDirectory))
      .toThrow(/must be empty|must differ/u);
    expect(snapshotFile(sourcePath)).toEqual(before);
    expect(existsSync(join(configDirectory, VAULT_CONFIG_NAME))).toBe(false);
  });

  it("rejects a copy hash mismatch and cleans only its target temporary file", () => {
    const root = makeRoot();
    const sourcePath = join(root, "source.sqlite");
    const targetDirectory = join(root, "target");
    const configDirectory = join(root, "config");
    mkdirSync(targetDirectory);
    const source = new Database(sourcePath);
    try {
      applyMigrations(source, { now: fixedNow });
    } finally {
      source.close();
    }
    const before = snapshotFile(sourcePath);
    expect(() => adoptLegacyDatabase(sourcePath, targetDirectory, configDirectory, {
      copySource: (_source, target) => writeFileSync(target, "tampered copy", "utf8"),
    })).toThrow(/hash does not match/u);
    expect(snapshotFile(sourcePath)).toEqual(before);
    expect(readdirSync(targetDirectory)).toEqual([]);
    expect(existsSync(join(configDirectory, VAULT_CONFIG_NAME))).toBe(false);
  });
});

function openFreshDatabase(): Database.Database {
  const root = makeRoot();
  const database = new Database(join(root, "fresh.sqlite"));
  database.pragma("foreign_keys = ON");
  applyMigrations(database, { now: fixedNow });
  return database;
}

function insertHistoricalFixture(database: Database.Database): void {
  insertSession(database, "unpaired", "extension_unpaired");
  insertSession(database, "paired", "extension_paired");
  for (const suffix of ["unpaired", "paired"] as const) {
    database.prepare(`
      INSERT INTO capture_events (
        id, schema_version, type, capture_session_id, submission_id,
        installation_id, adapter_version, parser_version, page_origin,
        provenance_level, platform, problem_external_id, problem_title,
        canonical_url, occurred_at, payload_json, event_fingerprint, received_at
      ) VALUES (?, 2, 'SUBMISSION_OBSERVED', ?, ?, ?, 'fixture@1', 'fixture@1',
        'https://leetcode.cn', ?, 'leetcode', ?, ?, ?, ?,
        '{"action":"submission_confirmed"}', ?, ?)
    `).run(
      `event_${suffix}`,
      `session_${suffix}`,
      `submission_${suffix}`,
      `installation_${suffix}`,
      `extension_${suffix}`,
      `problem_${suffix}`,
      `Problem ${suffix}`,
      `https://leetcode.cn/problems/problem-${suffix}/`,
      "2026-08-25T00:01:00.000Z",
      `fingerprint_${suffix}`,
      "2026-08-25T00:01:01.000Z",
    );
  }
  database.prepare(`
    INSERT INTO training_attempts (
      id, capture_session_id, submission_id, record_source, platform,
      problem_external_id, problem_title, canonical_url, started_at, result,
      submission_event_id, revision, created_at, updated_at
    ) VALUES (
      'attempt_paired', 'session_paired', 'submission_paired', 'capture',
      'leetcode', 'problem_paired', 'Problem paired',
      'https://leetcode.cn/problems/problem-paired/',
      '2026-08-25T00:01:00.000Z', 'draft', 'event_paired', 1,
      '2026-08-25T00:01:00.000Z', '2026-08-25T00:01:00.000Z'
    )
  `).run();
  database.prepare(`
    INSERT INTO attempt_corrections (
      correction_id, attempt_id, field_name, old_value, new_value, reason,
      corrected_at, resulting_revision
    ) VALUES (
      'correction_1', 'attempt_paired', 'reflection', NULL, 'kept', 'proof',
      '2026-08-25T00:02:00.000Z', 2
    )
  `).run();
  database.prepare(`
    INSERT INTO capture_installations (
      installation_id, credential_hash, credential_version, status, created_at
    ) VALUES (
      'installation_paired', ?, 1, 'active', '2026-08-25T00:00:00.000Z'
    )
  `).run("a".repeat(64));
  database.prepare(`
    INSERT INTO capture_pairing_codes (
      id, code_hash, target_installation_id, expires_at, created_at
    ) VALUES (
      'pairing_1', ?, 'installation_paired',
      '2026-08-25T00:10:00.000Z', '2026-08-25T00:00:00.000Z'
    )
  `).run("b".repeat(64));
}

function insertSession(database: Database.Database, suffix: string, provenance: string): void {
  database.prepare(`
    INSERT INTO training_sessions (
      id, installation_id, platform, problem_external_id, problem_title,
      canonical_url, provenance_level, started_at, created_at, updated_at
    ) VALUES (?, ?, 'leetcode', ?, ?, ?, ?,
      '2026-08-25T00:00:00.000Z', '2026-08-25T00:00:00.000Z',
      '2026-08-25T00:00:00.000Z')
  `).run(
    `session_${suffix}`,
    `installation_${suffix}`,
    `problem_${suffix}`,
    `Problem ${suffix}`,
    `https://leetcode.cn/problems/problem-${suffix}/`,
    provenance,
  );
}

function readRows(
  database: Database.Database,
  table: string,
  orderColumn: string,
): readonly Readonly<Record<string, string | number | null>>[] {
  const safeTable = quoteIdentifier(table);
  const safeOrder = quoteIdentifier(orderColumn);
  return database.prepare<[], SqliteRow>(
    `SELECT * FROM ${safeTable} ORDER BY ${safeOrder}`,
  ).all();
}

function quoteIdentifier(value: string): string {
  return `"${value.replaceAll('"', '""')}"`;
}

function copyMigrationPrefix(destination: string, count: number): void {
  mkdirSync(destination);
  for (const name of repositoryMigrationNames().slice(0, count)) {
    copyFileSync(join(MIGRATIONS_DIRECTORY, name), join(destination, name));
  }
}

function repositoryMigrationNames(): readonly string[] {
  return readdirSync(MIGRATIONS_DIRECTORY).filter((name) => name.endsWith(".sql")).sort();
}

function appliedMigrationIds(database: Database.Database): readonly string[] {
  return database.prepare<[], { readonly id: string }>(
    "SELECT id FROM schema_migrations ORDER BY id",
  ).all().map((row) => row.id);
}

function tableExists(database: Database.Database, name: string): boolean {
  return database.prepare<string, { readonly name: string }>(
    "SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?",
  ).get(name) !== undefined;
}

function indexExists(database: Database.Database, name: string): boolean {
  return database.prepare<string, { readonly name: string }>(
    "SELECT name FROM sqlite_master WHERE type = 'index' AND name = ?",
  ).get(name) !== undefined;
}

function expectIntegrity(database: Database.Database): void {
  expect(database.prepare<[], { readonly quick_check: string }>("PRAGMA quick_check").get())
    .toEqual({ quick_check: "ok" });
  expect(database.prepare("PRAGMA foreign_key_check").all()).toEqual([]);
}

function fixedNow(): string {
  return "2026-08-25T00:00:00.000Z";
}

function makeRoot(): string {
  const root = mkdtempSync(join(tmpdir(), "local-vault-migration-"));
  ownedRoots.push(root);
  return root;
}
