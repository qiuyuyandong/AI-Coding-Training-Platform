/**
 * Bootstrap script for the A10 extension E2E lane.
 *
 * Playwright starts `webServer` BEFORE `globalSetup`, so the Next.js dev
 * server subprocess cannot rely on `globalSetup` to have set
 * `TRAINING_DB_PATH`. This script runs inside the webServer command,
 * creates a fresh disposable SQLite file, runs migrations, exports the
 * path via stdout (consumed by the spec via process.env), and writes the
 * path to `.tmp/server-db-path.txt` so worker processes can read it
 * after Playwright forks them.
 *
 * The script does NOT start the dev server. Playwright's webServer
 * lifecycle wraps it as `<bootstrap> && <next dev>`.
 */

import {
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { basename, isAbsolute, join, relative, resolve, sep } from "node:path";
import { spawnSync } from "node:child_process";

const WORKSPACE_ROOT = resolve(process.cwd());
const TEMP_ROOT = resolve(WORKSPACE_ROOT, ".tmp");
const DB_PREFIX = "capture-v4-full-chain-";
const DB_FILENAME = "training-platform.sqlite";
const PATH_FILE = resolve(TEMP_ROOT, "server-db-path.txt");

function isUnderTemp(target) {
  if (!isAbsolute(target)) return false;
  const rel = relative(TEMP_ROOT, target);
  return rel !== "" && rel !== ".." && !rel.startsWith(".." + sep) && !rel.startsWith("../") && !isAbsolute(rel);
}

function assertSafeRelativeParent(parent) {
  if (!isAbsolute(parent)) throw new Error(`Disposable DB parent must be absolute: ${parent}`);
  if (!isUnderTemp(parent)) throw new Error(`Disposable DB parent must be under .tmp/: ${parent}`);
  const name = basename(parent);
  if (!name.startsWith(DB_PREFIX)) {
    throw new Error(`Disposable DB parent must start with ${DB_PREFIX}: ${name}`);
  }
}

function removePath(target) {
  const stats = lstatSync(target, { throwIfNoEntry: false });
  if (stats === undefined) return;
  if (stats.isSymbolicLink() || !stats.isDirectory()) {
    unlinkSync(target);
    return;
  }
  for (const entry of readdirSync(target)) removePath(resolve(target, entry));
  rmSync(target, { recursive: false });
}

mkdirSync(TEMP_ROOT, { recursive: true });

if (existsSync(PATH_FILE)) {
  const stale = readFileSync(PATH_FILE, "utf8");
  const staleParent = resolve(stale, "..");
  if (isAbsolute(stale) && isUnderTemp(staleParent)) {
    if (existsSync(stale)) removePath(stale);
  }
  unlinkSync(PATH_FILE);
}

let dirPath;
try {
  dirPath = mkdtempSync(join(TEMP_ROOT, DB_PREFIX));
} catch (error) {
  throw new Error(`Failed to create disposable DB directory under ${TEMP_ROOT}: ${String(error)}`);
}
assertSafeRelativeParent(dirPath);

const dbPath = join(dirPath, DB_FILENAME);
if (!isUnderTemp(dbPath)) throw new Error(`Disposable DB path must be under .tmp/: ${dbPath}`);

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
  removePath(dirPath);
  throw new Error(
    `Migration failed for ${dbPath}: status=${result.status} stderr=${stderr} stdout=${stdout}`,
  );
}

writeFileSync(PATH_FILE, dbPath, "utf8");

process.env.TRAINING_DB_PATH = dbPath;
console.log(`[a10-bootstrap] disposable DB ready at ${dbPath}`);