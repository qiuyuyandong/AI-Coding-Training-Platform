import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { spawn, spawnSync } from "node:child_process";

const workspaceRoot = resolve(process.cwd());
const pathFile = resolve(workspaceRoot, ".tmp", "server-db-path.txt");
const nextCli = resolve(workspaceRoot, "node_modules", "next", "dist", "bin", "next");

const bootstrap = spawnSync(process.execPath, ["scripts/a10-bootstrap.mjs"], {
  cwd: workspaceRoot,
  stdio: "inherit",
  windowsHide: true,
});
if (bootstrap.status !== 0 || !existsSync(pathFile)) {
  throw new Error(`Extension E2E database bootstrap failed with status ${bootstrap.status}`);
}

const dbPath = readFileSync(pathFile, "utf8").trim();
if (dbPath.length === 0) throw new Error("Extension E2E database path is empty");

const server = spawn(process.execPath, [nextCli, "dev"], {
  cwd: workspaceRoot,
  env: { ...process.env, TRAINING_DB_PATH: dbPath },
  stdio: "inherit",
  windowsHide: true,
});

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    if (!server.killed) server.kill(signal);
  });
}

server.on("error", (error) => {
  console.error(error);
  process.exitCode = 1;
});
server.on("exit", (code, signal) => {
  if (signal !== null) {
    process.kill(process.pid, signal);
    return;
  }
  process.exitCode = code ?? 1;
});
