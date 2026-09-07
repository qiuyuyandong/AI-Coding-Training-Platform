import { spawn } from "node:child_process";
import { pathToFileURL } from "node:url";
import { readActiveVault } from "../lib/vault/localVault";
import { diagnoseVault } from "../lib/vault/operations";

type WindowsCommand = "setup" | "start" | "diagnose";

export async function main(args = process.argv.slice(2)): Promise<number> {
  try {
    if (process.platform !== "win32") throw new Error("This command is only for Windows");
    const command = requireCommand(args[0]);
    const nodeMajor = Number.parseInt(process.versions.node.split(".")[0] ?? "0", 10);
    if (nodeMajor < 20) throw new Error("Node.js 20 or newer is required");
    if (command === "setup") {
      process.stdout.write("Windows environment check passed. No installer or system setting was changed.\n");
      return 0;
    }
    const vault = readActiveVault();
    if (vault === null) throw new Error("No active Local Vault is configured");
    if (command === "diagnose") {
      process.stdout.write(`${JSON.stringify(diagnoseVault(vault), null, 2)}\n`);
      return 0;
    }
    return await new Promise<number>((resolve) => {
      const child = spawn(process.execPath, ["--import", "tsx", "scripts/local-vault.ts", "serve"], {
        cwd: process.cwd(), stdio: "inherit", windowsHide: true,
      });
      child.once("exit", (code) => resolve(code ?? 1));
      child.once("error", () => resolve(1));
    });
  } catch (error) {
    process.stderr.write(`Windows local command failed: ${error instanceof Error ? error.message : "unknown error"}\n`);
    return 1;
  }
}

function requireCommand(value: string | undefined): WindowsCommand {
  if (value === "setup" || value === "start" || value === "diagnose") return value;
  throw new Error("Expected Windows command: setup, start, or diagnose");
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) process.exitCode = await main();
