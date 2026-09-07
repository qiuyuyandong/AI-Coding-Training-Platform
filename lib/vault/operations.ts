import { createHash, randomUUID } from "node:crypto";
import {
  constants,
  copyFileSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import Database from "better-sqlite3";
import { z } from "zod";
import { applyMigrations } from "@/lib/db/migrations";
import { assertLocalPortAvailable } from "@/lib/vault/launcher";
import {
  LocalVaultError,
  VAULT_DATABASE_NAME,
  VAULT_DESCRIPTOR_NAME,
  pathEntryExists,
  requireSafeDirectory,
  requireSafeRegularFile,
  validateSqliteDatabase,
  validateVault,
  type ValidatedVault,
} from "@/lib/vault/localVault";

export const VAULT_BACKUP_MANIFEST = "backup-manifest.json";
const BACKUP_FORMAT = "ai-coding-training-backup";
const EVIDENCE_DIRECTORY = ".training-evidence";
const MAX_MANIFEST_BYTES = 1024 * 1024;

const ManifestSchema = z.object({
  format: z.literal(BACKUP_FORMAT),
  version: z.literal(1),
  createdAt: z.string().datetime(),
  sourceVaultId: z.string().regex(/^vault_[0-9a-f-]{36}$/u),
  schemaMigrations: z.array(z.string().regex(/^\d{4}_[a-z0-9_]+\.sql$/u)),
  files: z.array(z.object({
    path: z.string().regex(/^(?:training-platform\.sqlite|\.ai-coding-training-vault\.json|evidence\/[a-f0-9]{64}\.snapshot)$/u),
    size: z.number().int().nonnegative(),
    sha256: z.string().regex(/^[a-f0-9]{64}$/u),
  }).strict()).min(2),
}).strict();

export type VaultBackupManifest = z.infer<typeof ManifestSchema>;

export async function backupVault(
  vaultInput: ValidatedVault,
  targetInput: string,
  options: { readonly now?: () => string } = {},
): Promise<VaultBackupManifest> {
  const vault = validateVault(vaultInput.vaultPath);
  const target = requireSafeDirectory(targetInput, "Backup target directory");
  if (readdirSync(target).length !== 0) throw new LocalVaultError("Backup target directory must be empty");
  if (isDescendant(vault.vaultPath, target)) {
    const relativeTarget = relative(vault.vaultPath, target);
    if (!relativeTarget.startsWith(`.restore-safety${sep}`)) {
      throw new LocalVaultError("Backup target inside the Vault is reserved for automatic restore safety copies");
    }
  }
  try {
    const databaseTarget = join(target, VAULT_DATABASE_NAME);
    const source = new Database(vault.databasePath, { readonly: true, fileMustExist: true });
    try {
      await source.backup(databaseTarget);
    } finally {
      source.close();
    }
    validateSqliteDatabase(databaseTarget);
    copyFileSync(vault.descriptorPath, join(target, VAULT_DESCRIPTOR_NAME), constants.COPYFILE_EXCL);
    const evidenceSource = join(vault.vaultPath, EVIDENCE_DIRECTORY);
    if (pathEntryExists(evidenceSource)) copyEvidenceStore(evidenceSource, join(target, "evidence"));
    const files = listManifestFiles(target).map((path) => snapshotManifestFile(target, path));
    const schemaMigrations = readSchemaMigrations(databaseTarget);
    const manifest = ManifestSchema.parse({
      format: BACKUP_FORMAT,
      version: 1,
      createdAt: options.now?.() ?? new Date().toISOString(),
      sourceVaultId: vault.descriptor.vaultId,
      schemaMigrations,
      files,
    });
    writeFileSync(join(target, VAULT_BACKUP_MANIFEST), `${JSON.stringify(manifest, null, 2)}\n`, {
      encoding: "utf8", flag: "wx", mode: 0o600,
    });
    validateBackup(target, vault.descriptor.vaultId);
    return manifest;
  } catch (error) {
    clearOwnedDirectory(target);
    throw new LocalVaultError("Could not create Vault backup", { cause: error });
  }
}

export function validateBackup(backupInput: string, expectedVaultId?: string): VaultBackupManifest {
  const backup = requireSafeDirectory(backupInput, "Backup directory");
  const manifestPath = requireSafeRegularFile(join(backup, VAULT_BACKUP_MANIFEST), "Backup manifest");
  if (lstatSync(manifestPath).size > MAX_MANIFEST_BYTES) throw new LocalVaultError("Backup manifest is too large");
  const manifest = ManifestSchema.parse(JSON.parse(readFileSync(manifestPath, "utf8")));
  if (expectedVaultId !== undefined && manifest.sourceVaultId !== expectedVaultId) {
    throw new LocalVaultError("Backup belongs to a different Vault identity");
  }
  const listed = new Set(manifest.files.map((file) => file.path));
  const topLevel = readdirSync(backup).sort();
  const allowedTopLevel = new Set([VAULT_BACKUP_MANIFEST, VAULT_DATABASE_NAME, VAULT_DESCRIPTOR_NAME, "evidence"]);
  if (topLevel.some((name) => !allowedTopLevel.has(name))) {
    throw new LocalVaultError("Backup contains an unlisted top-level entry");
  }
  const actual = listManifestFiles(backup).map((path) => toPortableRelative(backup, path));
  if (actual.length !== listed.size || actual.some((path) => !listed.has(path))) {
    throw new LocalVaultError("Backup contains an unlisted or missing file");
  }
  for (const file of manifest.files) {
    const path = requireSafeRegularFile(joinPortable(backup, file.path), "Backup file");
    const stat = lstatSync(path);
    const hash = sha256(path);
    if (stat.size !== file.size || hash !== file.sha256) throw new LocalVaultError(`Backup hash mismatch for ${file.path}`);
  }
  validateSqliteDatabase(join(backup, VAULT_DATABASE_NAME));
  validateBackupSnapshotReferences(join(backup, VAULT_DATABASE_NAME), backup);
  validateMigrationCompatibility(manifest.schemaMigrations);
  return manifest;
}

export async function restoreVault(
  vaultInput: ValidatedVault,
  backupInput: string,
  options: {
    readonly now?: () => string;
    readonly assertStopped?: () => Promise<void>;
    readonly beforeSwap?: () => void;
  } = {},
): Promise<{ readonly safetyBackupPath: string; readonly restoredManifest: VaultBackupManifest }> {
  const vault = validateVault(vaultInput.vaultPath);
  await (options.assertStopped ?? assertLocalPortAvailable)();
  assertNoSqliteSidecars(vault.databasePath);
  const manifest = validateBackup(backupInput, vault.descriptor.vaultId);
  const token = randomUUID();
  const safetyRoot = join(vault.vaultPath, ".restore-safety");
  if (!pathEntryExists(safetyRoot)) mkdirSync(safetyRoot);
  const safetyBackupPath = join(safetyRoot, token);
  mkdirSync(safetyBackupPath);
  await backupVault(vault, safetyBackupPath, { now: options.now });

  const stage = join(vault.vaultPath, `.restore-stage-${token}`);
  const oldDatabase = join(vault.vaultPath, `.restore-old-${token}.sqlite`);
  const liveEvidence = join(vault.vaultPath, EVIDENCE_DIRECTORY);
  const oldEvidence = join(vault.vaultPath, `.restore-old-evidence-${token}`);
  mkdirSync(stage);
  let databaseMoved = false;
  let replacementDatabaseMoved = false;
  let evidenceMoved = false;
  let replacementEvidenceMoved = false;
  try {
    const stagedDatabase = join(stage, VAULT_DATABASE_NAME);
    copyFileSync(join(backupInput, VAULT_DATABASE_NAME), stagedDatabase, constants.COPYFILE_EXCL);
    const staged = new Database(stagedDatabase);
    try {
      staged.pragma("foreign_keys = ON");
      applyMigrations(staged);
    } finally {
      staged.close();
    }
    validateSqliteDatabase(stagedDatabase);
    const backupEvidence = join(backupInput, "evidence");
    const stagedEvidence = join(stage, EVIDENCE_DIRECTORY);
    mkdirSync(stagedEvidence);
    if (pathEntryExists(backupEvidence)) copyEvidenceStore(backupEvidence, stagedEvidence);
    options.beforeSwap?.();
    assertNoSqliteSidecars(vault.databasePath);
    renameSync(vault.databasePath, oldDatabase);
    databaseMoved = true;
    renameSync(stagedDatabase, vault.databasePath);
    replacementDatabaseMoved = true;
    if (pathEntryExists(liveEvidence)) {
      requireSafeDirectory(liveEvidence, "Live evidence store");
      renameSync(liveEvidence, oldEvidence);
      evidenceMoved = true;
    }
    renameSync(stagedEvidence, liveEvidence);
    replacementEvidenceMoved = true;
    validateVault(vault.vaultPath);
    validateRestoredSnapshotReferences(vault.databasePath, liveEvidence);
    removeOwnedPath(vault.vaultPath, oldDatabase);
    if (evidenceMoved) removeOwnedPath(vault.vaultPath, oldEvidence);
    removeOwnedPath(vault.vaultPath, stage);
    return { safetyBackupPath, restoredManifest: manifest };
  } catch (error) {
    if (replacementEvidenceMoved) removeOwnedPath(vault.vaultPath, liveEvidence);
    if (evidenceMoved && pathEntryExists(oldEvidence)) renameSync(oldEvidence, liveEvidence);
    if (replacementDatabaseMoved) removeOwnedPath(vault.vaultPath, vault.databasePath);
    if (databaseMoved && pathEntryExists(oldDatabase)) renameSync(oldDatabase, vault.databasePath);
    if (pathEntryExists(stage)) removeOwnedPath(vault.vaultPath, stage);
    throw new LocalVaultError("Could not restore Vault; original data was restored", { cause: error });
  }
}

export function diagnoseVault(vaultInput: ValidatedVault): Readonly<{
  status: "ok" | "error";
  database: "ok" | "error";
  sidecars: number;
  schemaMigrationCount: number;
  retainedSnapshotCount: number;
  missingSnapshotCount: number;
}> {
  try {
    const vault = validateVault(vaultInput.vaultPath);
    const sidecars = countSqliteSidecars(vault.databasePath);
    const db = new Database(vault.databasePath, { readonly: true, fileMustExist: true });
    try {
      const snapshots = db.prepare<[], { readonly storage_path: string }>(`
        SELECT storage_path FROM code_snapshot_refs
        WHERE deleted_at IS NULL AND storage_path IS NOT NULL
      `).all();
      const evidenceRoot = resolve(vault.vaultPath, EVIDENCE_DIRECTORY);
      let missing = 0;
      for (const snapshot of snapshots) {
        const path = resolve(snapshot.storage_path);
        if (!path.startsWith(`${evidenceRoot}${sep}`) || !path.endsWith(".snapshot") || !pathEntryExists(path)) missing += 1;
      }
      return {
        status: sidecars === 0 && missing === 0 ? "ok" : "error",
        database: "ok",
        sidecars,
        schemaMigrationCount: readSchemaMigrations(vault.databasePath).length,
        retainedSnapshotCount: snapshots.length,
        missingSnapshotCount: missing,
      };
    } finally {
      db.close();
    }
  } catch {
    return { status: "error", database: "error", sidecars: 0, schemaMigrationCount: 0, retainedSnapshotCount: 0, missingSnapshotCount: 0 };
  }
}

function copyEvidenceStore(sourceInput: string, target: string): void {
  const source = requireSafeDirectory(sourceInput, "Evidence store");
  mkdirSync(target, { recursive: true });
  for (const name of readdirSync(source)) {
    if (!/^[a-f0-9]{64}\.snapshot$/u.test(name)) continue;
    copyFileSync(requireSafeRegularFile(join(source, name), "Evidence snapshot"), join(target, name), constants.COPYFILE_EXCL);
  }
}

function listManifestFiles(root: string): readonly string[] {
  const output: string[] = [];
  for (const name of [VAULT_DATABASE_NAME, VAULT_DESCRIPTOR_NAME]) {
    const path = join(root, name);
    if (pathEntryExists(path)) output.push(requireSafeRegularFile(path, "Backup file"));
  }
  const evidence = join(root, "evidence");
  if (pathEntryExists(evidence)) {
    const safe = requireSafeDirectory(evidence, "Backup evidence directory");
    for (const name of readdirSync(safe).sort()) output.push(requireSafeRegularFile(join(safe, name), "Backup evidence file"));
  }
  return output;
}

function snapshotManifestFile(root: string, path: string) {
  return { path: toPortableRelative(root, path), size: lstatSync(path).size, sha256: sha256(path) };
}

function toPortableRelative(root: string, path: string): string {
  return relative(root, path).split(sep).join("/");
}

function joinPortable(root: string, path: string): string {
  return join(root, ...path.split("/"));
}

function sha256(path: string): string {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function readSchemaMigrations(databasePath: string): readonly string[] {
  const db = new Database(databasePath, { readonly: true, fileMustExist: true });
  try {
    return db.prepare<[], { readonly id: string }>("SELECT id FROM schema_migrations ORDER BY id").all().map((row) => row.id);
  } finally {
    db.close();
  }
}

function validateMigrationCompatibility(migrations: readonly string[]): void {
  const available = new Set(readdirSync(join(process.cwd(), "lib", "db", "migrations")).filter((name) => name.endsWith(".sql")));
  const unknown = migrations.find((migration) => !available.has(migration));
  if (unknown !== undefined) throw new LocalVaultError(`Backup requires unknown migration ${unknown}`);
}

function validateRestoredSnapshotReferences(databasePath: string, evidenceRoot: string): void {
  const result = diagnoseVault(validateVault(dirname(databasePath)));
  if (result.status !== "ok") throw new LocalVaultError("Restored database contains invalid snapshot references");
  requireSafeDirectory(evidenceRoot, "Restored evidence store");
}

function validateBackupSnapshotReferences(databasePath: string, backupRoot: string): void {
  const db = new Database(databasePath, { readonly: true, fileMustExist: true });
  try {
    const rows = db.prepare<[], { readonly content_hash: string; readonly storage_path: string }>(`
      SELECT content_hash, storage_path FROM code_snapshot_refs
      WHERE deleted_at IS NULL AND storage_path IS NOT NULL
    `).all();
    for (const row of rows) {
      const expectedName = `${row.content_hash}.snapshot`;
      if (row.storage_path.split(/[\\/]/u).at(-1) !== expectedName) {
        throw new LocalVaultError("Backup database contains a malformed snapshot reference");
      }
      const artifact = join(backupRoot, "evidence", expectedName);
      if (!pathEntryExists(artifact) || sha256(requireSafeRegularFile(artifact, "Backup snapshot")) !== row.content_hash) {
        throw new LocalVaultError("Backup is missing a referenced snapshot");
      }
    }
  } finally {
    db.close();
  }
}

function assertNoSqliteSidecars(databasePath: string): void {
  if (countSqliteSidecars(databasePath) !== 0) throw new LocalVaultError("Vault database has an active SQLite sidecar");
}

function countSqliteSidecars(databasePath: string): number {
  return ["-journal", "-shm", "-wal"].filter((suffix) => pathEntryExists(`${databasePath}${suffix}`)).length;
}

function clearOwnedDirectory(directory: string): void {
  const root = requireSafeDirectory(directory, "Owned cleanup directory");
  for (const name of readdirSync(root)) removeOwnedPath(root, join(root, name));
}

function removeOwnedPath(parent: string, target: string): void {
  const canonicalParent = resolve(parent);
  const canonicalTarget = resolve(target);
  if (!isAbsolute(canonicalTarget) || !canonicalTarget.startsWith(`${canonicalParent}${sep}`)) {
    throw new LocalVaultError("Refusing cleanup outside the owned directory");
  }
  rmSync(canonicalTarget, { recursive: true, force: true });
}

function isDescendant(parent: string, child: string): boolean {
  const value = relative(resolve(parent), resolve(child));
  return value.length > 0 && !value.startsWith("..") && !isAbsolute(value);
}
