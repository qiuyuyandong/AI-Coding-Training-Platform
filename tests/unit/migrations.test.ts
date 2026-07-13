import {
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
      expect(attemptColumns).toContain("source_event_id");
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
});
