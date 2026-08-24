import { createServer, type Server } from "node:net";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import Database from "better-sqlite3";
import { afterEach, describe, expect, it } from "vitest";

import { applyMigrations } from "@/lib/db/migrations";
import {
  adoptLegacyDatabase,
  createEmptyVault,
  LocalVaultError,
  readActiveVault,
  resolveVaultConfigDirectory,
  snapshotFile,
  validateVault,
  VAULT_CONFIG_NAME,
  VAULT_DATABASE_NAME,
  VAULT_DESCRIPTOR_NAME,
  writeActiveVaultPointer,
} from "@/lib/vault/localVault";
import {
  assertLocalPortAvailable,
  executeVaultCommand,
  parseVaultArguments,
} from "@/lib/vault/launcher";
import { pickSystemPath } from "@/lib/vault/systemPicker";

const ownedRoots: string[] = [];

afterEach(() => {
  for (const root of ownedRoots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe("Local Vault core", () => {
  it("creates, validates, activates and rereads an empty Vault", () => {
    const root = makeRoot();
    const vaultDirectory = join(root, "vault");
    const configDirectory = join(root, "config");
    mkdirSync(vaultDirectory);

    const vault = createEmptyVault(vaultDirectory, {
      now: () => "2026-08-25T00:00:00.000Z",
      createId: () => "00000000-0000-4000-8000-000000000001",
    });
    expect(vault.descriptor).toEqual({
      format: "ai-coding-training-vault",
      version: 1,
      vaultId: "vault_00000000-0000-4000-8000-000000000001",
      createdAt: "2026-08-25T00:00:00.000Z",
    });
    expect(existsSync(join(vaultDirectory, VAULT_DATABASE_NAME))).toBe(true);
    expect(existsSync(join(vaultDirectory, VAULT_DESCRIPTOR_NAME))).toBe(true);
    expect(readdirSync(vaultDirectory).sort()).toEqual([
      VAULT_DESCRIPTOR_NAME,
      VAULT_DATABASE_NAME,
    ].sort());

    const configPath = writeActiveVaultPointer(vault, configDirectory);
    expect(configPath).toBe(join(configDirectory, VAULT_CONFIG_NAME));
    expect(readActiveVault(configDirectory)).toEqual(vault);
  });

  it("rejects relative paths, non-empty targets and unknown descriptor versions", () => {
    expect(() => createEmptyVault("relative-vault")).toThrow(/absolute path/u);
    const root = makeRoot();
    const collision = join(root, "collision");
    mkdirSync(collision);
    writeFileSync(join(collision, "keep.txt"), "keep", "utf8");
    expect(() => createEmptyVault(collision)).toThrow(/must be empty/u);
    expect(readFileSync(join(collision, "keep.txt"), "utf8")).toBe("keep");

    const vaultDirectory = join(root, "unknown-version");
    mkdirSync(vaultDirectory);
    createEmptyVault(vaultDirectory);
    const descriptorPath = join(vaultDirectory, VAULT_DESCRIPTOR_NAME);
    const descriptor: unknown = JSON.parse(readFileSync(descriptorPath, "utf8"));
    expect(typeof descriptor).toBe("object");
    writeFileSync(descriptorPath, JSON.stringify({
      format: "ai-coding-training-vault",
      version: 2,
      vaultId: "vault_00000000-0000-4000-8000-000000000002",
      createdAt: "2026-08-25T00:00:00.000Z",
    }), "utf8");
    expect(() => validateVault(vaultDirectory)).toThrow();
  });

  it("rejects a directory junction instead of traversing it", () => {
    const root = makeRoot();
    const outside = join(root, "outside");
    const junction = join(root, "junction");
    mkdirSync(outside);
    createEmptyVault(outside);
    symlinkSync(outside, junction, "junction");
    expect(() => validateVault(junction)).toThrow(/link or file|symlink or junction/u);
  });

  it("atomically replaces only the pointer after validating the next Vault", () => {
    const root = makeRoot();
    const firstDirectory = join(root, "first");
    const secondDirectory = join(root, "second");
    const configDirectory = join(root, "config");
    mkdirSync(firstDirectory);
    mkdirSync(secondDirectory);
    const first = createEmptyVault(firstDirectory);
    const second = createEmptyVault(secondDirectory);
    writeActiveVaultPointer(first, configDirectory);
    writeActiveVaultPointer(second, configDirectory);
    expect(readActiveVault(configDirectory)?.descriptor.vaultId).toBe(second.descriptor.vaultId);
    expect(readdirSync(configDirectory)).toEqual([VAULT_CONFIG_NAME]);
  });

  it("keeps the prior pointer when the proposed Vault becomes invalid", () => {
    const root = makeRoot();
    const firstDirectory = join(root, "first");
    const invalidDirectory = join(root, "invalid");
    const configDirectory = join(root, "config");
    mkdirSync(firstDirectory);
    mkdirSync(invalidDirectory);
    const first = createEmptyVault(firstDirectory);
    const invalid = createEmptyVault(invalidDirectory);
    writeActiveVaultPointer(first, configDirectory);
    const pointerBefore = readFileSync(join(configDirectory, VAULT_CONFIG_NAME), "utf8");
    writeFileSync(invalid.descriptorPath, "{}", "utf8");
    expect(() => writeActiveVaultPointer(invalid, configDirectory)).toThrow();
    expect(readFileSync(join(configDirectory, VAULT_CONFIG_NAME), "utf8")).toBe(pointerBefore);
    expect(readActiveVault(configDirectory)?.vaultPath).toBe(first.vaultPath);
  });

  it("rejects a config-directory junction without writing through it", () => {
    const root = makeRoot();
    const vaultDirectory = join(root, "vault");
    const outsideConfig = join(root, "outside-config");
    const linkedConfig = join(root, "linked-config");
    mkdirSync(vaultDirectory);
    mkdirSync(outsideConfig);
    const vault = createEmptyVault(vaultDirectory);
    symlinkSync(outsideConfig, linkedConfig, "junction");
    expect(() => writeActiveVaultPointer(vault, linkedConfig)).toThrow(/link or file|symlink or junction/u);
    expect(readdirSync(outsideConfig)).toEqual([]);
  });

  it("fails a migration without leaving a partial Vault", () => {
    const root = makeRoot();
    const vaultDirectory = join(root, "vault");
    mkdirSync(vaultDirectory);
    expect(() => createEmptyVault(vaultDirectory, {
      migrate: () => {
        throw new Error("injected migration failure");
      },
    })).toThrow(/Could not create/u);
    expect(readdirSync(vaultDirectory)).toEqual([]);
  });

  it("copies an existing database, preserves its bytes and activates the adopted Vault", () => {
    const root = makeRoot();
    const sourcePath = join(root, "source.sqlite");
    const targetDirectory = join(root, "adopted");
    const configDirectory = join(root, "config");
    mkdirSync(targetDirectory);
    const source = new Database(sourcePath);
    try {
      applyMigrations(source);
      source.prepare(
        "INSERT INTO problems (id, platform, external_id, title, canonical_url, tags_json, difficulty, status, content_mode, training_mode, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
      ).run(
        "problem_adopt",
        "manual",
        "adopt-1",
        "Adoption proof",
        "manual://adopt-1",
        "[]",
        "unknown",
        "active",
        "reference",
        "manual",
        "2026-08-25T00:00:00.000Z",
        "2026-08-25T00:00:00.000Z",
      );
    } finally {
      source.close();
    }
    const before = snapshotFile(sourcePath);
    const result = adoptLegacyDatabase(sourcePath, targetDirectory, configDirectory);
    expect(result.sourceBefore).toEqual(before);
    expect(result.sourceAfter).toEqual(before);
    expect(snapshotFile(sourcePath)).toEqual(before);
    const adopted = new Database(result.vault.databasePath, { readonly: true });
    try {
      expect(adopted.prepare("SELECT COUNT(*) AS count FROM problems").get()).toEqual({ count: 1 });
    } finally {
      adopted.close();
    }
    expect(readActiveVault(configDirectory)?.vaultPath).toBe(result.vault.vaultPath);
  });

  it("leaves source, target and prior pointer unchanged when adoption migration fails", () => {
    const root = makeRoot();
    const sourcePath = join(root, "source.sqlite");
    const activeDirectory = join(root, "active");
    const targetDirectory = join(root, "target");
    const configDirectory = join(root, "config");
    mkdirSync(activeDirectory);
    mkdirSync(targetDirectory);
    const active = createEmptyVault(activeDirectory);
    writeActiveVaultPointer(active, configDirectory);
    const source = new Database(sourcePath);
    try {
      applyMigrations(source);
    } finally {
      source.close();
    }
    const sourceBefore = snapshotFile(sourcePath);
    const pointerBefore = readFileSync(join(configDirectory, VAULT_CONFIG_NAME), "utf8");

    expect(() => adoptLegacyDatabase(sourcePath, targetDirectory, configDirectory, {
      migrate: () => {
        throw new Error("injected adoption migration failure");
      },
    })).toThrow(/Could not adopt/u);
    expect(snapshotFile(sourcePath)).toEqual(sourceBefore);
    expect(readdirSync(targetDirectory)).toEqual([]);
    expect(readFileSync(join(configDirectory, VAULT_CONFIG_NAME), "utf8")).toBe(pointerBefore);
  });
});

describe("Local Vault launcher", () => {
  it("parses only absolute, explicitly named paths", () => {
    const root = makeRoot();
    expect(parseVaultArguments(["create", "--vault", root])).toEqual({
      command: "create",
      vaultPath: root,
    });
    expect(() => parseVaultArguments(["create", "--vault", "relative"])).toThrow(/absolute/u);
    expect(() => parseVaultArguments(["switch", "--source", join(root, "db.sqlite")]))
      .toThrow(/only valid/u);
    expect(() => parseVaultArguments(["unknown"])).toThrow(/Unknown/u);
  });

  it("treats picker cancellation as a no-op before port checks", async () => {
    const root = makeRoot();
    const configDirectory = join(root, "config");
    const result = await executeVaultCommand({ command: "create" }, {
      configDirectory,
      pick: () => ({ status: "cancelled" }),
      assertPortAvailable: () => {
        throw new Error("port check must not run after cancellation");
      },
    });
    expect(result).toEqual({ status: "cancelled" });
    expect(existsSync(configDirectory)).toBe(false);
  });

  it("switches only after the stopped-service gate passes", async () => {
    const root = makeRoot();
    const firstDirectory = join(root, "first");
    const secondDirectory = join(root, "second");
    const configDirectory = join(root, "config");
    mkdirSync(firstDirectory);
    mkdirSync(secondDirectory);
    const first = createEmptyVault(firstDirectory);
    const second = createEmptyVault(secondDirectory);
    writeActiveVaultPointer(first, configDirectory);

    await expect(executeVaultCommand({ command: "switch", vaultPath: second.vaultPath }, {
      configDirectory,
      assertPortAvailable: () => Promise.reject(new LocalVaultError("occupied")),
    })).rejects.toThrow(/occupied/u);
    expect(readActiveVault(configDirectory)?.vaultPath).toBe(first.vaultPath);

    const result = await executeVaultCommand({ command: "switch", vaultPath: second.vaultPath }, {
      configDirectory,
      assertPortAvailable: () => Promise.resolve(),
    });
    expect(result).toMatchObject({ status: "configured" });
    expect(readActiveVault(configDirectory)?.vaultPath).toBe(second.vaultPath);
  });

  it("detects a real listener on localhost:3000", async () => {
    const server = await listenOnLocalPort();
    try {
      await expect(assertLocalPortAvailable()).rejects.toThrow(/already in use/u);
    } finally {
      await closeServer(server);
    }
    await expect(assertLocalPortAvailable()).resolves.toBeUndefined();
  });

  it("maps system config roots without falling back to cwd", () => {
    expect(resolveVaultConfigDirectory({
      platform: "win32",
      env: { APPDATA: "C:\\Users\\learner\\AppData\\Roaming" },
      homeDirectory: "C:\\Users\\learner",
    })).toBe("C:\\Users\\learner\\AppData\\Roaming\\AI-Coding-Training-Platform");
    expect(resolveVaultConfigDirectory({
      platform: "darwin",
      env: {},
      homeDirectory: "/Users/learner",
    })).toBe("/Users/learner/Library/Application Support/AI-Coding-Training-Platform");
    expect(resolveVaultConfigDirectory({
      platform: "linux",
      env: { XDG_CONFIG_HOME: "/tmp/config" },
      homeDirectory: "/home/learner",
    })).toBe("/tmp/config/ai-coding-training-platform");
    expect(() => resolveVaultConfigDirectory({
      platform: "linux",
      env: { XDG_CONFIG_HOME: "relative" },
      homeDirectory: "/home/learner",
    })).toThrow(/absolute/u);
  });

  it("reports unavailable and cancelled native pickers without inventing a path", () => {
    expect(pickSystemPath("directory", {
      platform: "linux",
      run: () => ({ status: null, stdout: "", stderr: "", errorCode: "ENOENT" }),
    })).toMatchObject({ status: "unavailable" });
    expect(pickSystemPath("directory", {
      platform: "win32",
      run: () => ({ status: 0, stdout: "", stderr: "" }),
    })).toEqual({ status: "cancelled" });
  });
});

function makeRoot(): string {
  const root = mkdtempSync(join(tmpdir(), "local-vault-unit-"));
  ownedRoots.push(root);
  return root;
}

async function listenOnLocalPort(): Promise<Server> {
  const server = createServer();
  await new Promise<void>((resolveListen, rejectListen) => {
    server.once("error", rejectListen);
    server.listen(3000, "127.0.0.1", () => resolveListen());
  });
  return server;
}

async function closeServer(server: Server): Promise<void> {
  await new Promise<void>((resolveClose, rejectClose) => {
    server.close((error) => {
      if (error === undefined) resolveClose();
      else rejectClose(error);
    });
  });
}
