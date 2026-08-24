import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { createInterface } from "node:readline/promises";
import { isAbsolute, resolve } from "node:path";
import { pathToFileURL } from "node:url";

import {
  adoptLegacyDatabase,
  createEmptyVault,
  LocalVaultError,
  readActiveVault,
  resolveVaultConfigDirectory,
  validateVault,
  writeActiveVaultPointer,
  type ValidatedVault,
} from "@/lib/vault/localVault";
import { pickSystemPath, type PickerResult } from "@/lib/vault/systemPicker";

export type VaultCommand = "serve" | "create" | "switch" | "adopt";

export type ParsedVaultArguments = Readonly<{
  command: VaultCommand;
  vaultPath?: string;
  sourcePath?: string;
}>;

export type VaultCommandResult =
  | Readonly<{ status: "cancelled" }>
  | Readonly<{ status: "configured"; vault: ValidatedVault }>
  | Readonly<{ status: "exited"; exitCode: number }>;

type ExecuteOptions = Readonly<{
  configDirectory?: string;
  pick?: (kind: "directory" | "sqlite") => PickerResult;
  assertPortAvailable?: () => Promise<void>;
  chooseInitialCommand?: () => Promise<Exclude<VaultCommand, "serve">>;
  startApplication?: (vault: ValidatedVault) => Promise<number>;
}>;

export function parseVaultArguments(args: readonly string[]): ParsedVaultArguments {
  const first = args[0] ?? "serve";
  if (!isVaultCommand(first)) throw new LocalVaultError(`Unknown local Vault command: ${first}`);
  let vaultPath: string | undefined;
  let sourcePath: string | undefined;
  for (let index = 1; index < args.length; index += 2) {
    const flag = args[index];
    const value = args[index + 1];
    if (value === undefined) throw new LocalVaultError(`Missing value for ${flag ?? "argument"}`);
    if (flag === "--vault") {
      if (vaultPath !== undefined) throw new LocalVaultError("--vault may be provided only once");
      if (!isAbsolute(value)) throw new LocalVaultError("--vault must be an absolute path");
      vaultPath = value;
    } else if (flag === "--source") {
      if (sourcePath !== undefined) throw new LocalVaultError("--source may be provided only once");
      if (!isAbsolute(value)) throw new LocalVaultError("--source must be an absolute path");
      sourcePath = value;
    } else {
      throw new LocalVaultError(`Unknown local Vault flag: ${flag ?? "argument"}`);
    }
  }
  if (sourcePath !== undefined && first !== "adopt" && first !== "serve") {
    throw new LocalVaultError("--source is only valid for adopt or first-run serve");
  }
  return {
    command: first,
    ...(vaultPath === undefined ? {} : { vaultPath }),
    ...(sourcePath === undefined ? {} : { sourcePath }),
  };
}

export async function executeVaultCommand(
  input: ParsedVaultArguments,
  options: ExecuteOptions = {},
): Promise<VaultCommandResult> {
  const configDirectory = options.configDirectory ?? resolveVaultConfigDirectory();
  const pick = options.pick ?? pickSystemPath;
  const checkPort = options.assertPortAvailable ?? assertLocalPortAvailable;
  const start = options.startApplication ?? startLocalApplication;
  let command = input.command;

  if (command === "serve") {
    const active = readActiveVault(configDirectory);
    if (active !== null && input.vaultPath === undefined && input.sourcePath === undefined) {
      await checkPort();
      return { status: "exited", exitCode: await start(active) };
    }
    command = input.sourcePath !== undefined
      ? "adopt"
      : input.vaultPath !== undefined
        ? "switch"
        : await (options.chooseInitialCommand ?? chooseInitialCommand)();
  }

  const selectedVaultPath = selectPath(input.vaultPath, "directory", pick);
  if (selectedVaultPath === null) return { status: "cancelled" };
  await checkPort();

  let vault: ValidatedVault;
  if (command === "create") {
    vault = createEmptyVault(selectedVaultPath);
    try {
      writeActiveVaultPointer(vault, configDirectory);
    } catch (error) {
      throw new LocalVaultError(
        "The Vault was created, but activating it failed; it was not deleted",
        { cause: error },
      );
    }
  } else if (command === "switch") {
    vault = validateVault(selectedVaultPath);
    writeActiveVaultPointer(vault, configDirectory);
  } else {
    const selectedSourcePath = selectPath(input.sourcePath, "sqlite", pick);
    if (selectedSourcePath === null) return { status: "cancelled" };
    vault = adoptLegacyDatabase(
      selectedSourcePath,
      selectedVaultPath,
      configDirectory,
    ).vault;
  }

  if (input.command === "serve") {
    return { status: "exited", exitCode: await start(vault) };
  }
  return { status: "configured", vault };
}

export async function assertLocalPortAvailable(): Promise<void> {
  const server = createServer();
  await new Promise<void>((resolveCheck, rejectCheck) => {
    server.once("error", (error: NodeJS.ErrnoException) => {
      rejectCheck(error.code === "EADDRINUSE"
        ? new LocalVaultError("localhost:3000 is already in use; stop the current app before switching Vaults")
        : new LocalVaultError("Could not verify localhost:3000 availability", { cause: error }));
    });
    server.listen({ host: "127.0.0.1", port: 3000, exclusive: true }, () => {
      server.close((error) => {
        if (error === undefined) resolveCheck();
        else rejectCheck(new LocalVaultError("Could not release the localhost:3000 probe", { cause: error }));
      });
    });
  });
}

export async function startLocalApplication(vault: ValidatedVault): Promise<number> {
  const nextCli = resolve(process.cwd(), "node_modules", "next", "dist", "bin", "next");
  const child = spawn(process.execPath, [
    nextCli,
    "dev",
    "--hostname",
    "localhost",
    "--port",
    "3000",
  ], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      TRAINING_DB_PATH: vault.databasePath,
      TRAINING_VAULT_PATH: vault.vaultPath,
      TRAINING_VAULT_ID: vault.descriptor.vaultId,
    },
    shell: false,
    stdio: "inherit",
    windowsHide: true,
  });
  return new Promise<number>((resolveExit, rejectExit) => {
    child.once("error", (error) => {
      rejectExit(new LocalVaultError("The local application could not start", { cause: error }));
    });
    child.once("exit", (code, signal) => {
      if (signal !== null) {
        rejectExit(new LocalVaultError(`The local application stopped by signal ${signal}`));
        return;
      }
      resolveExit(code ?? 1);
    });
  });
}

export async function chooseInitialCommand(): Promise<Exclude<VaultCommand, "serve">> {
  const terminal = createInterface({ input: process.stdin, output: process.stdout });
  try {
    const answer = (await terminal.question(
      "首次运行：请选择 1 创建空 Vault，2 采用现有数据库，3 使用已有 Vault：",
    )).trim();
    if (answer === "1") return "create";
    if (answer === "2") return "adopt";
    if (answer === "3") return "switch";
    throw new LocalVaultError("必须明确选择 1、2 或 3；未修改任何配置");
  } finally {
    terminal.close();
  }
}

export function isDirectScriptExecution(metaUrl: string, argvEntry: string | undefined): boolean {
  return argvEntry !== undefined && metaUrl === pathToFileURL(resolve(argvEntry)).href;
}

function selectPath(
  explicitPath: string | undefined,
  kind: "directory" | "sqlite",
  pick: (kind: "directory" | "sqlite") => PickerResult,
): string | null {
  if (explicitPath !== undefined) return explicitPath;
  const selected = pick(kind);
  if (selected.status === "cancelled") return null;
  if (selected.status === "unavailable") {
    const flag = kind === "directory" ? "--vault" : "--source";
    throw new LocalVaultError(`${selected.reason}; provide ${flag} with an absolute path`);
  }
  if (!isAbsolute(selected.path)) {
    throw new LocalVaultError("The system picker returned a non-absolute path");
  }
  return selected.path;
}

function isVaultCommand(value: string): value is VaultCommand {
  return value === "serve" || value === "create" || value === "switch" || value === "adopt";
}
