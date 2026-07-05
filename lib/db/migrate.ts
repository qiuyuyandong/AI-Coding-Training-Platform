import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { openDatabase } from "./client";

// Migration filenames MUST use 4-digit zero-padded numeric prefixes (e.g., 0001_initial.sql)
// so that lexicographic sort matches numeric ordering. The runner relies on this.
const db = openDatabase();
const migrationsDir = join(process.cwd(), "lib", "db", "migrations");

db.exec("CREATE TABLE IF NOT EXISTS schema_migrations (id TEXT PRIMARY KEY, applied_at TEXT NOT NULL)");

const applied = new Set(
  db.prepare("SELECT id FROM schema_migrations").all().map((row) => (row as { id: string }).id),
);

try {
  for (const fileName of readdirSync(migrationsDir).filter((name) => name.endsWith(".sql")).sort()) {
    if (applied.has(fileName)) continue;
    const sql = readFileSync(join(migrationsDir, fileName), "utf8");
    try {
      const transaction = db.transaction(() => {
        db.exec(sql);
        db.prepare("INSERT INTO schema_migrations (id, applied_at) VALUES (?, ?)").run(fileName, new Date().toISOString());
      });
      transaction();
    } catch (err) {
      throw new Error(`Migration ${fileName} failed: ${(err as Error).message}`, { cause: err });
    }
  }
} finally {
  db.close();
}
