/**
 * Phase A Task A10 — Global teardown for the extension E2E lane.
 *
 * Reads the disposable DB path written by globalSetup and removes the
 * directory tree using lstatSync-safe deletion. Also removes the path
 * file itself.
 */

import { existsSync, lstatSync, readdirSync, readFileSync, rmdirSync, unlinkSync } from "node:fs";
import { dirname, isAbsolute, relative, resolve } from "node:path";

const WORKSPACE_TEMP_ROOT = resolve(process.cwd(), ".tmp");
const SERVER_DB_PATH_FILE = resolve(WORKSPACE_TEMP_ROOT, "server-db-path.txt");

function removePath(target: string): void {
  const stats = lstatSync(target, { throwIfNoEntry: false });
  if (stats === undefined) return;
  if (stats.isSymbolicLink() || !stats.isDirectory()) {
    unlinkSync(target);
    return;
  }
  for (const entry of readdirSync(target)) removePath(resolve(target, entry));
  rmdirSync(target);
}

export default function globalTeardown(): void {
  if (!existsSync(SERVER_DB_PATH_FILE)) return;

  const dbPath = readFileSync(SERVER_DB_PATH_FILE, "utf8");
  if (!isAbsolute(dbPath)) throw new Error(`Stored DB path is not absolute: ${dbPath}`);

  const dirPath = dirname(dbPath);
  const rel = relative(WORKSPACE_TEMP_ROOT, dirPath);
  if (rel === "" || rel === ".." || rel.startsWith("..\\") || rel.startsWith("../") || isAbsolute(rel)) {
    throw new Error(`Unsafe teardown path: ${dirPath}`);
  }

  removePath(dirPath);
  removePath(SERVER_DB_PATH_FILE);
}