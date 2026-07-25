/**
 * Phase A Task A10 — Disposable SQLite database helpers.
 *
 * Provides relative-path-based safe DB creation under a fresh
 * `mkdtempSync` directory, schema migration against the disposable file,
 * count readers for `capture_events` / `training_sessions` /
 * `training_attempts`, default database snapshot / verify utilities, and
 * ordered teardown. All paths are validated against the workspace
 * `.tmp/` boundary and the `capture-v4-full-chain-` prefix before any
 * filesystem mutation.
 */

import {
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  rmSync,
  unlinkSync,
} from "node:fs";
import { basename, isAbsolute, join, relative, resolve, sep } from "node:path";
import { spawnSync } from "node:child_process";

import Database from "better-sqlite3";

const WORKSPACE_ROOT = resolve(process.cwd());
const TEMP_ROOT = resolve(WORKSPACE_ROOT, ".tmp");
const DB_PREFIX = "capture-v4-full-chain-";
const PROFILE_PREFIX = "playwright-extension";
const DEFAULT_DB_BASENAME = "training-platform.sqlite";
const DEFAULT_DB_PATH = resolve(WORKSPACE_ROOT, DEFAULT_DB_BASENAME);

function isUnderWorkspace(target: string): boolean {
  if (!isAbsolute(target)) return false;
  const rel = relative(WORKSPACE_ROOT, target);
  return rel !== "" && rel !== ".." && !rel.startsWith(".." + sep) && !rel.startsWith("../") && !isAbsolute(rel);
}

function assertSafePath(target: string, name: string): void {
  if (!isAbsolute(target)) throw new Error(`${name} must be an absolute path: ${target}`);
  if (!isUnderWorkspace(target)) throw new Error(`${name} must be under workspace: ${target}`);
}

function assertSafeDisposableDir(parent: string): void {
  assertSafePath(parent, "disposable directory");
  const name = basename(parent);
  if (!name.startsWith(DB_PREFIX) && !name.startsWith(PROFILE_PREFIX)) {
    throw new Error(`Disposable directory must start with ${DB_PREFIX} or ${PROFILE_PREFIX}: ${name}`);
  }
}

function removePath(target: string): void {
  const stats = lstatSync(target, { throwIfNoEntry: false });
  if (stats === undefined) return;
  if (stats.isSymbolicLink() || !stats.isDirectory()) {
    unlinkSync(target);
    return;
  }
  for (const entry of readdirSync(target)) removePath(resolve(target, entry));
  rmSync(target, { recursive: false });
}

export function createDisposableDirectory(): {
  readonly dirPath: string;
  readonly dispose: () => void;
} {
  mkdirSync(TEMP_ROOT, { recursive: true });
  const tempRoot = mkdtempSync(join(TEMP_ROOT, DB_PREFIX));
  assertSafeDisposableDir(tempRoot);
  return {
    dirPath: tempRoot,
    dispose: (): void => {
      removePath(tempRoot);
    },
  };
}

export function createDisposableDatabase(): {
  readonly dbPath: string;
  readonly dirPath: string;
} {
  const { dirPath } = createDisposableDirectory();
  const dbPath = join(dirPath, DEFAULT_DB_BASENAME);
  assertSafePath(dbPath, "dbPath");
  return { dbPath, dirPath };
}

export function runMigrations(dbPath: string): void {
  assertSafePath(dbPath, "dbPath");
  const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";
  const result = spawnSync(npmCommand, ["run", "db:migrate"], {
    env: { ...process.env, TRAINING_DB_PATH: dbPath },
    stdio: "pipe",
    windowsHide: true,
    shell: process.platform === "win32",
  });
  if (result.status !== 0) {
    const stderr = result.stderr?.toString() ?? "";
    const stdout = result.stdout?.toString() ?? "";
    throw new Error(`Migration failed for ${dbPath}: status=${result.status} stderr=${stderr} stdout=${stdout}`);
  }
}

export function openDisposableDatabase(dbPath: string): Database.Database {
  assertSafePath(dbPath, "dbPath");
  if (!existsSync(dbPath)) {
    throw new Error(`Database file does not exist: ${dbPath}. Run runMigrations() first.`);
  }
  const db = new Database(dbPath);
  db.pragma("foreign_keys = ON");
  return db;
}

export function countCaptureEvents(db: Database.Database): number {
  const row = db.prepare<[], { readonly count: number }>("SELECT count(*) AS count FROM capture_events").get();
  return row?.count ?? 0;
}

export function countTrainingSessions(db: Database.Database): number {
  const row = db.prepare<[], { readonly count: number }>("SELECT count(*) AS count FROM training_sessions").get();
  return row?.count ?? 0;
}

export function countTrainingAttempts(db: Database.Database): number {
  const row = db.prepare<[], { readonly count: number }>("SELECT count(*) AS count FROM training_attempts").get();
  return row?.count ?? 0;
}

export function readDatabaseCounts(dbPath: string): {
  readonly captureEvents: number;
  readonly trainingSessions: number;
  readonly trainingAttempts: number;
} {
  const db = openDisposableDatabase(dbPath);
  try {
    return {
      captureEvents: countCaptureEvents(db),
      trainingSessions: countTrainingSessions(db),
      trainingAttempts: countTrainingAttempts(db),
    };
  } finally {
    db.close();
  }
}

export type DefaultDbSnapshot = Readonly<{
  readonly exists: boolean;
  readonly length: number;
  readonly lastWriteTimeUtc: string | null;
}>;

export function snapshotDefaultDatabase(): DefaultDbSnapshot {
  if (!existsSync(DEFAULT_DB_PATH)) {
    return { exists: false, length: 0, lastWriteTimeUtc: null };
  }
  const stats = lstatSync(DEFAULT_DB_PATH);
  return {
    exists: true,
    length: stats.size,
    lastWriteTimeUtc: stats.mtime.toISOString(),
  };
}

export function verifyDefaultDatabaseUntouched(
  before: DefaultDbSnapshot,
  after: DefaultDbSnapshot,
): boolean {
  return before.exists === after.exists
    && before.length === after.length
    && before.lastWriteTimeUtc === after.lastWriteTimeUtc;
}