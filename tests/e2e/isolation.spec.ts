import { readdirSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test } from "@playwright/test";
import { openDatabase } from "@/lib/db/client";
import { E2E_DB_PATH } from "./database";

test("uses the migrated disposable database", () => {
  const defaultDatabasePath = resolve(process.cwd(), "training-platform.sqlite");
  const configuredPath = process.env.TRAINING_DB_PATH;

  expect(configuredPath).toBe(E2E_DB_PATH);
  expect(resolve(configuredPath ?? defaultDatabasePath)).not.toBe(defaultDatabasePath);

  const db = openDatabase();
  try {
    const migrationCount = db
      .prepare<[], { readonly count: number }>("SELECT COUNT(*) AS count FROM schema_migrations")
      .get();
    const expectedMigrationCount = readdirSync(
      resolve(process.cwd(), "lib", "db", "migrations"),
    ).filter((name) => name.endsWith(".sql")).length;

    expect(resolve(db.name)).toBe(resolve(E2E_DB_PATH));
    expect(migrationCount).toEqual({ count: expectedMigrationCount });
  } finally {
    db.close();
  }
});
