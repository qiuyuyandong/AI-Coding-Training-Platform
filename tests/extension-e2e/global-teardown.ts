/**
 * Phase A Task A10 — Global teardown for the extension E2E lane.
 *
 * Reads the disposable DB path written by `scripts/a10-bootstrap.mjs`
 * and removes the disposable DB directory. Also walks the
 * `.tmp/playwright-extension/` tree (A0's profile cleanup) so the
 * A0 extension E2E lane and the new A10 full-chain lane do not leak
 * Chromium profiles between runs. All paths are validated against the
 * `.tmp/` boundary before deletion.
 */

import { existsSync, lstatSync, readdirSync, readFileSync, rmdirSync, unlinkSync } from "node:fs";
import { dirname, isAbsolute, relative, resolve, sep } from "node:path";

const WORKSPACE_TEMP_ROOT = resolve(process.cwd(), ".tmp");
const SERVER_DB_PATH_FILE = resolve(WORKSPACE_TEMP_ROOT, "server-db-path.txt");
const EXTENSION_TEMP_ROOT = resolve(WORKSPACE_TEMP_ROOT, "playwright-extension");

function isUnderTemp(target: string): boolean {
  if (!isAbsolute(target)) return false;
  const rel = relative(WORKSPACE_TEMP_ROOT, target);
  return rel !== "" && rel !== ".." && !rel.startsWith(".." + sep) && !rel.startsWith("../") && !isAbsolute(rel);
}

function assertSafeUnderTemp(target: string, name: string): void {
  if (!isAbsolute(target)) throw new Error(`${name} must be absolute: ${target}`);
  if (!isUnderTemp(target)) throw new Error(`${name} must be under .tmp/: ${target}`);
}

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

function removeExtensionProfiles(): void {
  if (!existsSync(EXTENSION_TEMP_ROOT)) return;
  assertSafeUnderTemp(EXTENSION_TEMP_ROOT, "extension profiles root");
  for (const entry of readdirSync(EXTENSION_TEMP_ROOT)) {
    removePath(resolve(EXTENSION_TEMP_ROOT, entry));
  }
}

export default function globalTeardown(): void {
  removeExtensionProfiles();

  if (!existsSync(SERVER_DB_PATH_FILE)) return;

  const dbPath = readFileSync(SERVER_DB_PATH_FILE, "utf8").trim();
  if (!isAbsolute(dbPath)) throw new Error(`Stored DB path is not absolute: ${dbPath}`);

  const dirPath = dirname(dbPath);
  assertSafeUnderTemp(dirPath, "disposable DB directory");
  const rel = relative(WORKSPACE_TEMP_ROOT, dirPath);
  if (rel === "" || rel === ".." || rel.startsWith(".." + sep) || rel.startsWith("../") || isAbsolute(rel)) {
    throw new Error(`Unsafe teardown path: ${dirPath}`);
  }

  removePath(dirPath);
  removePath(SERVER_DB_PATH_FILE);
}