import { mkdirSync, rmSync } from "node:fs";
import { isAbsolute, relative, resolve } from "node:path";
import Database from "better-sqlite3";
import { applyMigrations } from "../../lib/db/migrations";

const WORKSPACE_TEMP_ROOT = resolve(process.cwd(), ".tmp");

export const E2E_ROOT = resolve(WORKSPACE_TEMP_ROOT, "playwright");
export const E2E_DB_PATH = resolve(E2E_ROOT, "training-platform.sqlite");

function assertSafeE2eRoot(): void {
  const relativePath = relative(WORKSPACE_TEMP_ROOT, E2E_ROOT);
  if (
    relativePath === "" ||
    relativePath === ".." ||
    relativePath.startsWith("..\\") ||
    relativePath.startsWith("../") ||
    isAbsolute(relativePath)
  ) {
    throw new Error(`Unsafe E2E cleanup path: ${E2E_ROOT}`);
  }
}

export function cleanupE2eDatabase(): void {
  assertSafeE2eRoot();
  rmSync(E2E_ROOT, { recursive: true, force: true });
}

export function prepareE2eDatabase(): void {
  cleanupE2eDatabase();
  mkdirSync(E2E_ROOT, { recursive: true });

  const db = new Database(E2E_DB_PATH);
  try {
    applyMigrations(db, { now: () => "2026-07-11T00:00:00.000Z" });
  } finally {
    db.close();
  }
}
