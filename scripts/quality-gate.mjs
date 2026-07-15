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

function removePath(target) {
  const stats = lstatSync(target, { throwIfNoEntry: false });
  if (stats === undefined) return;
  if (stats.isDirectory()) {
    for (const entry of readdirSync(target)) {
      removePath(join(target, entry));
    }
    rmdirSync(target);
    return;
  }
  unlinkSync(target);
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
  rmSync(directory, { recursive: true, force: true });
  removePath(directory);
}

process.exitCode = exitCode;
