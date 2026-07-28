/**
 * Phase A Task A10 — Global setup for the extension E2E lane.
 *
 * Provisions a fresh disposable SQLite database under `.tmp/` and runs
 * migrations against it. The path is persisted to
 * `.tmp/server-db-path.txt` and to `process.env.TRAINING_DB_PATH` so
 * worker processes can read it for count assertions in `afterEach`.
 *
 * This setup runs in the Playwright main process before any test; it
 * is intentionally NOT a `webServer` lifecycle hook because the A10
 * smoke test does not require the Next.js dev server.
 */

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

import { createDisposableDatabase, runMigrations } from "./database";

const PATH_FILE = resolve(process.cwd(), ".tmp", "server-db-path.txt");

export default async function globalSetup(): Promise<void> {
  if (existsSync(PATH_FILE)) {
    const existing = readFileSync(PATH_FILE, "utf8").trim();
    if (existing.length === 0) throw new Error("Extension E2E DB path file is empty");
    process.env.TRAINING_DB_PATH = existing;
    return;
  }
  const { dbPath } = createDisposableDatabase();
  runMigrations(dbPath);
  writeFileSync(PATH_FILE, dbPath, "utf8");
  process.env.TRAINING_DB_PATH = dbPath;
}
