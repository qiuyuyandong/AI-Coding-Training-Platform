import {
  existsSync,
  lstatSync,
  mkdtempSync,
  readdirSync,
  rmSync,
  rmdirSync,
  unlinkSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

// Canonical nine-stage order for the V0 quality gate. Stage 2 was added by
// Todo 24 so migrations are validated against the committed content package
// before any test runs. Stage 7 (extension:e2e) was added by Task A11 so the
// Fake OJ Playwright lane runs after extension:check (which already validates
// the dist) and before build. Tests and downstream tooling assert against this
// frozen array.
export const QUALITY_GATE_STAGES = Object.freeze([
  Object.freeze(["run", "lint"]),
  Object.freeze(["run", "db:migrate"]),
  Object.freeze(["run", "curriculum:validate"]),
  Object.freeze(["run", "test"]),
  Object.freeze(["run", "typecheck"]),
  Object.freeze(["run", "e2e"]),
  Object.freeze(["run", "extension:check"]),
  Object.freeze(["run", "extension:e2e"]),
  Object.freeze(["run", "build"]),
]);

// Smoke checks paired with the new migrations/content stage. The content
// package manifest is a hard prerequisite for `curriculum:validate`; the
// link-access report is a soft signal that an external link check ran
// recently, so its absence must never fail the gate.
export const CONTENT_PACKAGE_MANIFEST_PATH = resolve(
  "content/tracks/software-development-foundations-v1/manifest.json",
);

export const LINK_ACCESS_CHECK_REPORT_PATH = resolve(
  "work/reports/v0-link-access-check.json",
);

export function hasContentPackageManifest(
  targetPath = CONTENT_PACKAGE_MANIFEST_PATH,
) {
  try {
    return existsSync(targetPath);
  } catch {
    return false;
  }
}

export function hasLinkAccessCheckReport(
  targetPath = LINK_ACCESS_CHECK_REPORT_PATH,
) {
  try {
    return existsSync(targetPath);
  } catch {
    return false;
  }
}

// Windows only: spawn the npm.cmd batch shim through cmd.exe so Node does
// not hand back EINVAL when it tries to launch the batch file directly.
const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";

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

function runStages() {
  if (!hasContentPackageManifest()) {
    console.error(
      `[quality-gate] missing required content package manifest at ${CONTENT_PACKAGE_MANIFEST_PATH}; refusing to run migrations and curriculum:validate against an unknown package.`,
    );
    process.exitCode = 1;
    return;
  }

  // Soft check: log only. The link-access report is produced by an external
  // link checker that may not run on every CI lane, so its absence must
  // never fail the gate.
  if (hasLinkAccessCheckReport()) {
    console.log(
      `[quality-gate] link-access report present at ${LINK_ACCESS_CHECK_REPORT_PATH}`,
    );
  } else {
    console.log(
      `[quality-gate] link-access report absent at ${LINK_ACCESS_CHECK_REPORT_PATH}; skipping soft check`,
    );
  }

  const directory = mkdtempSync(join(tmpdir(), "ai-training-quality-gate-"));
  const trainingDbPath = join(directory, "training-platform.sqlite");
  let exitCode = 0;

  try {
    for (const args of QUALITY_GATE_STAGES) {
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
}

function isMainModule() {
  if (!process.argv[1]) return false;
  try {
    return resolve(process.argv[1]) === fileURLToPath(import.meta.url);
  } catch {
    return false;
  }
}

if (isMainModule()) {
  runStages();
}