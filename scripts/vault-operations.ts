import { existsSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute } from "node:path";
import { pathToFileURL } from "node:url";
import Database from "better-sqlite3";
import { getOrCreateLocalProfile } from "../lib/repositories/learnerProfiles";
import { buildFeedbackBundle, FeedbackCategorySchema } from "../lib/services/pilotSupport";
import { readActiveVault, requireSafeDirectory } from "../lib/vault/localVault";
import { backupVault, diagnoseVault, restoreVault } from "../lib/vault/operations";

type Operation = "backup" | "restore" | "diagnose" | "feedback";

export async function main(args = process.argv.slice(2)): Promise<number> {
  try {
    const operation = requireOperation(args[0]);
    const vault = readActiveVault();
    if (vault === null) throw new Error("No active Local Vault is configured");
    if (operation === "diagnose") {
      process.stdout.write(`${JSON.stringify(diagnoseVault(vault), null, 2)}\n`);
      return 0;
    }
    if (operation === "backup") {
      const target = requiredAbsoluteArgument(args, "--target");
      const manifest = await backupVault(vault, target);
      process.stdout.write(`Backup completed: ${manifest.files.length} files; format version ${manifest.version}.\n`);
      return 0;
    }
    if (operation === "restore") {
      const backup = requiredAbsoluteArgument(args, "--backup");
      const result = await restoreVault(vault, backup);
      process.stdout.write(`Restore completed; safety backup retained at ${result.safetyBackupPath}.\n`);
      return 0;
    }
    const target = requiredAbsoluteArgument(args, "--target");
    if (existsSync(target)) throw new Error("Feedback target must not already exist");
    requireSafeDirectory(dirname(target), "Feedback target parent");
    const include = requiredValue(args, "--include").split(",").map((value) => FeedbackCategorySchema.parse(value.trim()));
    const db = new Database(vault.databasePath);
    try {
      db.pragma("foreign_keys = ON");
      getOrCreateLocalProfile(db);
      const bundle = buildFeedbackBundle(db, { categories: include, diagnosis: diagnoseVault(vault), now: new Date().toISOString() });
      writeFileSync(target, `${JSON.stringify(bundle, null, 2)}\n`, { encoding: "utf8", flag: "wx", mode: 0o600 });
    } finally {
      db.close();
    }
    process.stdout.write("Feedback bundle created locally; nothing was uploaded.\n");
    return 0;
  } catch (error) {
    process.stderr.write(`Vault operation failed: ${error instanceof Error ? error.message : "unknown error"}\n`);
    return 1;
  }
}

function requireOperation(value: string | undefined): Operation {
  if (value === "backup" || value === "restore" || value === "diagnose" || value === "feedback") return value;
  throw new Error("Expected operation: backup, restore, diagnose, or feedback");
}

function requiredAbsoluteArgument(args: readonly string[], name: string): string {
  const value = requiredValue(args, name);
  if (!isAbsolute(value)) throw new Error(`${name} must be an absolute path`);
  return value;
}

function requiredValue(args: readonly string[], name: string): string {
  const index = args.indexOf(name);
  const value = index < 0 ? undefined : args[index + 1];
  if (value === undefined || value.length === 0 || value.startsWith("--")) throw new Error(`${name} is required`);
  return value;
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) process.exitCode = await main();
