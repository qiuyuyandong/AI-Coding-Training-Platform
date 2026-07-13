import { existsSync, readdirSync } from "node:fs";
import { relative, resolve } from "node:path";
import Database from "better-sqlite3";
import { afterEach, describe, expect, it } from "vitest";
import {
  cleanupE2eDatabase,
  E2E_DB_PATH,
  E2E_ROOT,
  prepareE2eDatabase,
} from "@/tests/e2e/database";

afterEach(() => {
  cleanupE2eDatabase();
});

describe("E2E database lifecycle", () => {
  it("prepares a migrated database only under the workspace temp root", () => {
    const workspaceTempRoot = resolve(process.cwd(), ".tmp");
    const defaultDatabasePath = resolve(process.cwd(), "training-platform.sqlite");

    prepareE2eDatabase();

    expect(relative(workspaceTempRoot, E2E_ROOT)).toBe("playwright");
    expect(resolve(E2E_DB_PATH)).not.toBe(defaultDatabasePath);
    expect(existsSync(E2E_DB_PATH)).toBe(true);

    const db = new Database(E2E_DB_PATH, { readonly: true });
    try {
      const migrationCount = db
        .prepare<[], { readonly count: number }>("SELECT COUNT(*) AS count FROM schema_migrations")
        .get();
      const expectedMigrationCount = readdirSync(
        resolve(process.cwd(), "lib", "db", "migrations"),
      ).filter((name) => name.endsWith(".sql")).length;
      expect(migrationCount).toEqual({ count: expectedMigrationCount });
    } finally {
      db.close();
    }
  });
});
