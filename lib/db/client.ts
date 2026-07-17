import Database from "better-sqlite3";

export function openDatabase() {
  const databasePath = process.env.TRAINING_DB_PATH ?? "training-platform.sqlite";
  const database = new Database(databasePath);
  // Enable FK enforcement at runtime. The upgrade matrix in
  // tests/unit/curriculumMigration.test.ts (Wave 1 / Todo 2) verifies that
  // every-prefix migrations, fresh apply, and 0005->0006 preservation all
  // pass PRAGMA foreign_key_check and PRAGMA quick_check under this mode,
  // so it is safe to turn the pragma on unconditionally for new
  // connections. Existing Phase 0 fixtures remain intact because no
  // existing row violates any new FK constraint and the schema itself is
  // not rebuilt.
  database.pragma("foreign_keys = ON");
  return database;
}