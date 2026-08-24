import {
  lstatSync,
  mkdirSync,
  readdirSync,
  rmdirSync,
  unlinkSync,
} from "node:fs";
import { isAbsolute, relative, resolve } from "node:path";
import Database from "better-sqlite3";
import { applyMigrations } from "../../lib/db/migrations";
import { rotateLocalCaptureInstallation } from "../../lib/vault/captureInstallation";

const WORKSPACE_TEMP_ROOT = resolve(process.cwd(), ".tmp");

export const E2E_ROOT = resolve(WORKSPACE_TEMP_ROOT, "playwright");
export const E2E_DB_PATH = resolve(E2E_ROOT, "training-platform.sqlite");
export const E2E_VAULT_CONFIG_DIR = resolve(E2E_ROOT, "config");
export const E2E_CAPTURE_CAPABILITY = `capture_${"E".repeat(43)}`;
export const E2E_CAPTURE_INSTALLATION_ID =
  "installation_44444444-4444-4444-8444-444444444444";

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

function removePath(target: string): void {
  // lstatSync is required: statSync follows symlinks/junctions/reparse
  // points, so a walker built on statSync will recursively delete the
  // external target of any link under E2E_ROOT. lstatSync returns the
  // link itself, not its target, which lets us remove only the link.
  //
  // throwIfNoEntry:false is required because existsSync returns false for
  // broken symlinks/junctions (the link target is gone), which would
  // otherwise make the walker skip the link itself and leave the dangling
  // reparse point behind. lstatSync on a broken link still returns the
  // link's Stats, so the link is unlinked as a leaf.
  const linkStats = lstatSync(target, { throwIfNoEntry: false });
  if (linkStats === undefined) return;
  if (linkStats.isSymbolicLink() || linkStats.isDirectory() === false) {
    unlinkSync(target);
    return;
  }
  for (const entry of readdirSync(target)) {
    removePath(resolve(target, entry));
  }
  rmdirSync(target);
}

export function cleanupE2eDatabase(): void {
  assertSafeE2eRoot();
  removePath(E2E_ROOT);
}

export function prepareE2eDatabase(): void {
  cleanupE2eDatabase();
  mkdirSync(E2E_ROOT, { recursive: true });

  const db = new Database(E2E_DB_PATH);
  try {
    applyMigrations(db, { now: () => "2026-07-11T00:00:00.000Z" });
    rotateLocalCaptureInstallation({
      installationId: E2E_CAPTURE_INSTALLATION_ID,
      capability: E2E_CAPTURE_CAPABILITY,
    }, {
      configDirectory: E2E_VAULT_CONFIG_DIR,
      now: () => "2026-07-11T00:00:00.000Z",
    });
  } finally {
    db.close();
  }
}
