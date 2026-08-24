import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type Database from "better-sqlite3";

type MigrationRow = {
  readonly id: string;
};

const FOREIGN_KEYS_OFF_MARKER = "-- codex-migration: foreign-keys-off";

export type MigrationOptions = {
  readonly migrationsDir?: string;
  readonly now?: () => string;
};

export function applyMigrations(
  db: Database.Database,
  options: MigrationOptions = {},
): void {
  const migrationsDir =
    options.migrationsDir ?? join(process.cwd(), "lib", "db", "migrations");
  const now = options.now ?? (() => new Date().toISOString());

  db.exec(
    "CREATE TABLE IF NOT EXISTS schema_migrations (id TEXT PRIMARY KEY, applied_at TEXT NOT NULL)",
  );

  const applied = new Set(
    db
      .prepare<[], MigrationRow>("SELECT id FROM schema_migrations")
      .all()
      .map((row) => row.id),
  );

  const fileNames = readdirSync(migrationsDir)
    .filter((name) => name.endsWith(".sql"))
    .sort();

  for (const fileName of fileNames) {
    if (applied.has(fileName)) continue;

    const sql = readFileSync(join(migrationsDir, fileName), "utf8");
    const requiresForeignKeysOff = sql.startsWith(FOREIGN_KEYS_OFF_MARKER);
    const restoreForeignKeys = requiresForeignKeysOff
      && db.pragma("foreign_keys", { simple: true }) === 1;
    try {
      if (requiresForeignKeysOff) {
        if (db.inTransaction) {
          throw new Error("foreign-keys-off migration cannot run inside an outer transaction");
        }
        db.pragma("foreign_keys = OFF");
      }
      const transaction = db.transaction(() => {
        db.exec(sql);
        if (requiresForeignKeysOff) {
          const violations = db.prepare("PRAGMA foreign_key_check").all();
          if (violations.length !== 0) {
            throw new Error("foreign_key_check failed after table rebuild");
          }
        }
        db
          .prepare<[string, string]>(
            "INSERT INTO schema_migrations (id, applied_at) VALUES (?, ?)",
          )
          .run(fileName, now());
      });
      transaction();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`Migration ${fileName} failed: ${message}`, { cause: error });
    } finally {
      if (restoreForeignKeys) db.pragma("foreign_keys = ON");
    }
  }
}
