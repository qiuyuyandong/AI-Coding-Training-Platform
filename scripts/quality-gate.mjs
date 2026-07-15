import {
  lstatSync,
  mkdtempSync,
  readdirSync,
  rmSync,
  rmdirSync,
  unlinkSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

const directory = mkdtempSync(join(tmpdir(), "ai-training-quality-gate-"));
const trainingDbPath = join(directory, "training-platform.sqlite");
// Windows only: spawn the npm.cmd batch shim through cmd.exe so Node does
// not hand back EINVAL when it tries to launch the batch file directly.
const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";
const commands = [
  ["run", "lint"],
  ["run", "db:migrate"],
  ["run", "test"],
  ["run", "typecheck"],
  ["run", "e2e"],
  ["run", "extension:check"],
  ["run", "build"],
];
let exitCode = 0;

// Mirrors the canonical safe-delete walker in tests/e2e/database.ts:
// lstat must see the link itself (not its target) and symbolic links or
// any non-directory must be unlinked as a leaf before traversing, so a
// junction or symlink under the owned temp tree cannot drag the walker
// outside it.
function removePath(target) {
  const linkStats = lstatSync(target, { throwIfNoEntry: false });
  if (linkStats === undefined) return;
  if (linkStats.isSymbolicLink() || linkStats.isDirectory() === false) {
    unlinkSync(target);
    return;
  }
  for (const entry of readdirSync(target)) {
    removePath(join(target, entry));
  }
  rmdirSync(target);
}

try {
  for (const args of commands) {
    const result = spawnSync(npmCommand, args, {
      cwd: process.cwd(),
      env: { ...process.env, TRAINING_DB_PATH: trainingDbPath },
      stdio: "inherit",
      shell: process.platform === "win32",
    });
    if (result.error) throw result.error;
    if (result.status !== 0) {
      exitCode = result.status ?? 1;
      break;
    }
  }
} finally {
  // rmSync is the primary cleanup; the removePath fallback handles hosts
  // where rmSync leaves files behind inside the OS temp directory (for
  // example a Unicode Windows temp path that rmSync does not clean up
  // until a later process releases the database lock).
  rmSync(directory, { recursive: true, force: true });
  removePath(directory);
}

process.exitCode = exitCode;
