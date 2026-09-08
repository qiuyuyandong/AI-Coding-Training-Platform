import { createHash, randomUUID } from "node:crypto";
import {
  constants,
  copyFileSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  realpathSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import {
  basename,
  dirname,
  isAbsolute,
  join,
  normalize,
  parse,
  posix,
  resolve,
  win32,
} from "node:path";

import Database from "better-sqlite3";
import { z } from "zod";

import { applyMigrations } from "@/lib/db/migrations";

export const VAULT_DESCRIPTOR_NAME = ".ai-coding-training-vault.json";
export const VAULT_DATABASE_NAME = "training-platform.sqlite";
export const VAULT_CONFIG_NAME = "vault.json";
export const VAULT_FORMAT = "ai-coding-training-vault";

const MAX_JSON_BYTES = 16 * 1024;

const VaultDescriptorSchema = z.object({
  format: z.literal(VAULT_FORMAT),
  version: z.literal(1),
  vaultId: z.string().regex(/^vault_[0-9a-f-]{36}$/u),
  createdAt: z.string().datetime(),
}).strict();

const ActiveVaultPointerSchema = z.object({
  version: z.literal(1),
  activeVaultPath: z.string().min(1),
}).strict();

export type VaultDescriptor = z.infer<typeof VaultDescriptorSchema>;

export type ValidatedVault = Readonly<{
  vaultPath: string;
  databasePath: string;
  descriptorPath: string;
  descriptor: VaultDescriptor;
}>;

export type SourceSnapshot = Readonly<{
  size: number;
  mtimeMs: number;
  sha256: string;
}>;

export type AdoptVaultResult = Readonly<{
  vault: ValidatedVault;
  sourceBefore: SourceSnapshot;
  sourceAfter: SourceSnapshot;
}>;

export type LocalVaultPlatform = "win32" | "darwin" | "linux";

export class LocalVaultError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "LocalVaultError";
  }
}

export function resolveVaultConfigDirectory(options: {
  readonly platform?: NodeJS.Platform;
  readonly env?: Readonly<Record<string, string | undefined>>;
  readonly homeDirectory?: string;
} = {}): string {
  const platform = options.platform ?? process.platform;
  const environment = options.env ?? process.env;
  const homeDirectory = options.homeDirectory ?? homedir();
  const pathApi = platform === "win32" ? win32 : posix;
  if (!pathApi.isAbsolute(homeDirectory)) {
    throw new LocalVaultError("The operating-system home directory must be absolute");
  }
  if (platform === "win32") {
    const appData = environment.APPDATA;
    if (appData === undefined || !win32.isAbsolute(appData)) {
      throw new LocalVaultError("APPDATA must be an absolute path");
    }
    return pathApi.join(pathApi.normalize(appData), "AI-Coding-Training-Platform");
  }
  if (platform === "darwin") {
    return pathApi.join(pathApi.normalize(homeDirectory), "Library", "Application Support", "AI-Coding-Training-Platform");
  }
  if (platform === "linux") {
    const xdg = environment.XDG_CONFIG_HOME;
    if (xdg !== undefined && !posix.isAbsolute(xdg)) {
      throw new LocalVaultError("XDG_CONFIG_HOME must be an absolute path");
    }
    return pathApi.join(
      pathApi.normalize(xdg ?? pathApi.join(homeDirectory, ".config")),
      "ai-coding-training-platform",
    );
  }
  throw new LocalVaultError(`Unsupported local Vault platform: ${platform}`);
}

export function createEmptyVault(
  requestedPath: string,
  options: {
    readonly now?: () => string;
    readonly createId?: () => string;
    readonly migrate?: (database: Database.Database) => void;
  } = {},
): ValidatedVault {
  const vaultPath = requireSafeDirectory(requestedPath, "Vault directory");
  if (readdirSync(vaultPath).length !== 0) {
    throw new LocalVaultError("A new Vault directory must be empty");
  }
  const now = options.now?.() ?? new Date().toISOString();
  const descriptor: VaultDescriptor = VaultDescriptorSchema.parse({
    format: VAULT_FORMAT,
    version: 1,
    vaultId: `vault_${options.createId?.() ?? randomUUID()}`,
    createdAt: now,
  });
  const databasePath = join(vaultPath, VAULT_DATABASE_NAME);
  const descriptorPath = join(vaultPath, VAULT_DESCRIPTOR_NAME);
  const temporaryDatabasePath = join(vaultPath, `.vault-db-${randomUUID()}.tmp`);
  const temporaryDescriptorPath = join(vaultPath, `.vault-descriptor-${randomUUID()}.tmp`);

  try {
    const database = new Database(temporaryDatabasePath);
    try {
      database.pragma("foreign_keys = ON");
      (options.migrate ?? applyMigrations)(database);
    } finally {
      database.close();
    }
    validateSqliteDatabase(temporaryDatabasePath);
    writeJsonExclusive(temporaryDescriptorPath, descriptor);
    renameSync(temporaryDatabasePath, databasePath);
    try {
      renameSync(temporaryDescriptorPath, descriptorPath);
    } catch (error) {
      removeOwnedRegularFile(databasePath);
      throw error;
    }
    return validateVault(vaultPath);
  } catch (error) {
    removeOwnedRegularFile(temporaryDatabasePath);
    removeOwnedRegularFile(temporaryDescriptorPath);
    throw toVaultError("Could not create the local Vault", error);
  }
}

export function validateVault(requestedPath: string): ValidatedVault {
  const vaultPath = requireSafeDirectory(requestedPath, "Vault directory");
  const databasePath = join(vaultPath, VAULT_DATABASE_NAME);
  const descriptorPath = join(vaultPath, VAULT_DESCRIPTOR_NAME);
  requireSafeRegularFile(databasePath, "Vault database");
  requireSafeRegularFile(descriptorPath, "Vault descriptor");
  const descriptor = VaultDescriptorSchema.parse(readBoundedJson(descriptorPath));
  validateSqliteDatabase(databasePath);
  return { vaultPath, databasePath, descriptorPath, descriptor };
}

export function writeActiveVaultPointer(
  vault: ValidatedVault,
  configDirectory = resolveVaultConfigDirectory(),
): string {
  const validated = validateVault(vault.vaultPath);
  return writeLocalConfigJson(VAULT_CONFIG_NAME, {
    version: 1,
    activeVaultPath: validated.vaultPath,
  }, configDirectory);
}

export function readActiveVault(
  configDirectory = resolveVaultConfigDirectory(),
): ValidatedVault | null {
  const stored = readLocalConfigJson(VAULT_CONFIG_NAME, configDirectory);
  if (stored === null) return null;
  const pointer = ActiveVaultPointerSchema.parse(stored);
  if (!isAbsolute(pointer.activeVaultPath)) {
    throw new LocalVaultError("The active Vault pointer must contain an absolute path");
  }
  const vault = validateVault(pointer.activeVaultPath);
  if (!pathsEqual(pointer.activeVaultPath, vault.vaultPath)) {
    throw new LocalVaultError("The active Vault pointer is not canonical");
  }
  return vault;
}

export function resolveRuntimeVaultConfigDirectory(): string {
  const configured = process.env.TRAINING_VAULT_CONFIG_DIR;
  if (configured === undefined) return resolveVaultConfigDirectory();
  if (!isAbsolute(configured)) {
    throw new LocalVaultError("TRAINING_VAULT_CONFIG_DIR must be an absolute path");
  }
  return normalize(configured);
}

export function readLocalConfigJson(
  fileName: string,
  configDirectory = resolveRuntimeVaultConfigDirectory(),
): unknown | null {
  requireConfigFileName(fileName);
  if (!pathEntryExists(configDirectory)) return null;
  const safeConfigDirectory = requireSafeDirectory(configDirectory, "Vault config directory");
  const configPath = join(safeConfigDirectory, fileName);
  if (!pathEntryExists(configPath)) return null;
  requireSafeRegularFile(configPath, "Local config file");
  return readBoundedJson(configPath);
}

export function writeLocalConfigJson(
  fileName: string,
  value: unknown,
  configDirectory = resolveRuntimeVaultConfigDirectory(),
): string {
  requireConfigFileName(fileName);
  const safeConfigDirectory = ensureSafeConfigDirectory(configDirectory);
  const configPath = join(safeConfigDirectory, fileName);
  if (pathEntryExists(configPath)) requireSafeRegularFile(configPath, "Local config file");
  const temporaryPath = join(safeConfigDirectory, `.${fileName}-${randomUUID()}.tmp`);
  try {
    writeJsonExclusive(temporaryPath, value);
    renameSync(temporaryPath, configPath);
  } catch (error) {
    removeOwnedRegularFile(temporaryPath);
    throw toVaultError(`Could not update ${fileName}`, error);
  }
  return configPath;
}

export function adoptLegacyDatabase(
  sourcePath: string,
  requestedVaultPath: string,
  configDirectory = resolveVaultConfigDirectory(),
  options: {
    readonly now?: () => string;
    readonly createId?: () => string;
    readonly migrate?: (database: Database.Database) => void;
    readonly copySource?: (sourcePath: string, targetPath: string) => void;
  } = {},
): AdoptVaultResult {
  const canonicalSource = requireSafeRegularFile(sourcePath, "Source database");
  for (const suffix of ["-journal", "-shm", "-wal"]) {
    if (pathEntryExists(`${canonicalSource}${suffix}`)) {
      throw new LocalVaultError(`Source database has an active SQLite sidecar: ${suffix}`);
    }
  }
  const vaultPath = requireSafeDirectory(requestedVaultPath, "Target Vault directory");
  if (readdirSync(vaultPath).length !== 0) {
    throw new LocalVaultError("The target Vault directory must be empty");
  }
  const databasePath = join(vaultPath, VAULT_DATABASE_NAME);
  if (pathsEqual(canonicalSource, databasePath)) {
    throw new LocalVaultError("Source and target database paths must differ");
  }

  validateSqliteDatabase(canonicalSource);
  const sourceCounts = readTableCounts(canonicalSource);
  const sourceBefore = snapshotFile(canonicalSource);
  const temporaryDatabasePath = join(vaultPath, `.vault-adopt-db-${randomUUID()}.tmp`);
  const temporaryDescriptorPath = join(vaultPath, `.vault-adopt-descriptor-${randomUUID()}.tmp`);
  const descriptorPath = join(vaultPath, VAULT_DESCRIPTOR_NAME);
  const now = options.now?.() ?? new Date().toISOString();
  const descriptor: VaultDescriptor = VaultDescriptorSchema.parse({
    format: VAULT_FORMAT,
    version: 1,
    vaultId: `vault_${options.createId?.() ?? randomUUID()}`,
    createdAt: now,
  });
  let databaseCommitted = false;
  let descriptorCommitted = false;
  try {
    (options.copySource ?? copySourceExclusive)(canonicalSource, temporaryDatabasePath);
    if (snapshotFile(temporaryDatabasePath).sha256 !== sourceBefore.sha256) {
      throw new LocalVaultError("The copied database hash does not match the source");
    }
    const copiedDatabase = new Database(temporaryDatabasePath);
    try {
      copiedDatabase.pragma("foreign_keys = ON");
      (options.migrate ?? applyMigrations)(copiedDatabase);
    } finally {
      copiedDatabase.close();
    }
    validateSqliteDatabase(temporaryDatabasePath);
    assertTableCountsPreserved(sourceCounts, readTableCounts(temporaryDatabasePath));
    const sourceAfter = snapshotFile(canonicalSource);
    if (!sameSnapshot(sourceBefore, sourceAfter)) {
      throw new LocalVaultError("The source database changed during adoption");
    }
    writeJsonExclusive(temporaryDescriptorPath, descriptor);
    renameSync(temporaryDatabasePath, databasePath);
    databaseCommitted = true;
    renameSync(temporaryDescriptorPath, descriptorPath);
    descriptorCommitted = true;
    const vault = validateVault(vaultPath);
    writeActiveVaultPointer(vault, configDirectory);
    return { vault, sourceBefore, sourceAfter };
  } catch (error) {
    removeOwnedRegularFile(temporaryDatabasePath);
    removeOwnedRegularFile(temporaryDescriptorPath);
    if (descriptorCommitted) removeOwnedRegularFile(descriptorPath);
    if (databaseCommitted) removeOwnedRegularFile(databasePath);
    throw toVaultError("Could not adopt the existing database", error);
  }
}

export function snapshotFile(filePath: string): SourceSnapshot {
  const canonicalPath = requireSafeRegularFile(filePath, "Snapshot file");
  const stats = lstatSync(canonicalPath);
  return {
    size: stats.size,
    mtimeMs: stats.mtimeMs,
    sha256: createHash("sha256").update(readFileSync(canonicalPath)).digest("hex"),
  };
}

export function validateSqliteDatabase(databasePath: string): void {
  requireSafeRegularFile(databasePath, "SQLite database");
  let database: Database.Database;
  try {
    database = new Database(databasePath, { readonly: true, fileMustExist: true });
  } catch (error) {
    throw toVaultError("The Vault database could not be opened read-only", error);
  }
  try {
    const quickRows = database.prepare<[], { readonly quick_check: string }>("PRAGMA quick_check").all();
    if (quickRows.length !== 1 || quickRows[0]?.quick_check !== "ok") {
      throw new LocalVaultError("The Vault database failed PRAGMA quick_check");
    }
    const foreignRows = database.prepare("PRAGMA foreign_key_check").all();
    if (foreignRows.length !== 0) {
      throw new LocalVaultError("The Vault database failed PRAGMA foreign_key_check");
    }
  } finally {
    database.close();
  }
}

function copySourceExclusive(sourcePath: string, targetPath: string): void {
  copyFileSync(sourcePath, targetPath, constants.COPYFILE_EXCL);
}

function readTableCounts(databasePath: string): ReadonlyMap<string, number> {
  const database = new Database(databasePath, { readonly: true, fileMustExist: true });
  try {
    const tables = database.prepare<[], { readonly name: string }>(
      `SELECT name FROM sqlite_master
       WHERE type = 'table'
         AND name NOT LIKE 'sqlite_%'
         AND name NOT IN ('schema_migrations', 'capture_installations', 'capture_pairing_codes')
       ORDER BY name`,
    ).all();
    return new Map(tables.map(({ name }) => {
      const escapedName = name.replaceAll('"', '""');
      const row = database.prepare<[], { readonly count: number }>(
        `SELECT COUNT(*) AS count FROM "${escapedName}"`,
      ).get();
      return [name, row?.count ?? 0] as const;
    }));
  } finally {
    database.close();
  }
}

function assertTableCountsPreserved(
  source: ReadonlyMap<string, number>,
  target: ReadonlyMap<string, number>,
): void {
  for (const [name, count] of source) {
    if (target.get(name) !== count) {
      throw new LocalVaultError(`Adoption changed row count for table ${name}`);
    }
  }
}

function ensureSafeConfigDirectory(configDirectory: string): string {
  requireAbsolutePath(configDirectory, "Vault config directory");
  if (!pathEntryExists(configDirectory)) {
    const existingParent = findExistingAncestor(configDirectory);
    requireSafeDirectory(existingParent, "Vault config parent");
    mkdirSync(configDirectory, { recursive: true });
  }
  return requireSafeDirectory(configDirectory, "Vault config directory");
}

function requireConfigFileName(fileName: string): void {
  if (!/^[a-z][a-z0-9-]*\.json$/u.test(fileName) || basename(fileName) !== fileName) {
    throw new LocalVaultError("Local config file name is invalid");
  }
}

function findExistingAncestor(requestedPath: string): string {
  let current = resolve(requestedPath);
  while (!pathEntryExists(current)) {
    const parent = dirname(current);
    if (parent === current) throw new LocalVaultError("No existing config ancestor was found");
    current = parent;
  }
  return current;
}

export function requireSafeDirectory(requestedPath: string, label: string): string {
  requireAbsolutePath(requestedPath, label);
  let stats: ReturnType<typeof lstatSync>;
  try {
    stats = lstatSync(requestedPath);
  } catch (error) {
    throw toVaultError(`${label} does not exist`, error);
  }
  if (stats.isSymbolicLink() || !stats.isDirectory()) {
    throw new LocalVaultError(`${label} must be a real directory, not a link or file`);
  }
  requireNoLinkedAncestors(requestedPath, label);
  return realpathSync.native(requestedPath);
}

export function requireSafeRegularFile(requestedPath: string, label: string): string {
  requireAbsolutePath(requestedPath, label);
  let stats: ReturnType<typeof lstatSync>;
  try {
    stats = lstatSync(requestedPath);
  } catch (error) {
    throw toVaultError(`${label} does not exist`, error);
  }
  if (stats.isSymbolicLink() || !stats.isFile()) {
    throw new LocalVaultError(`${label} must be a regular file, not a link or directory`);
  }
  requireNoLinkedAncestors(requestedPath, label);
  return realpathSync.native(requestedPath);
}

function requireAbsolutePath(value: string, label: string): void {
  if (!isAbsolute(value)) throw new LocalVaultError(`${label} must be an absolute path`);
}

function requireNoLinkedAncestors(requestedPath: string, label: string): void {
  let current = dirname(resolve(requestedPath));
  const root = parse(current).root;
  while (current !== root) {
    let stats: ReturnType<typeof lstatSync>;
    try {
      stats = lstatSync(current);
    } catch (error) {
      throw toVaultError(`${label} ancestor does not exist`, error);
    }
    if (stats.isSymbolicLink()) {
      throw new LocalVaultError(`${label} cannot traverse a symlink or junction`);
    }
    current = dirname(current);
  }
}

function pathsEqual(left: string, right: string): boolean {
  const normalizedLeft = normalize(resolve(left));
  const normalizedRight = normalize(resolve(right));
  return process.platform === "win32"
    ? normalizedLeft.toLocaleLowerCase("en-US") === normalizedRight.toLocaleLowerCase("en-US")
    : normalizedLeft === normalizedRight;
}

function readBoundedJson(filePath: string): unknown {
  const stats = lstatSync(filePath);
  if (stats.size > MAX_JSON_BYTES) throw new LocalVaultError(`${basename(filePath)} is too large`);
  try {
    return JSON.parse(readFileSync(filePath, "utf8"));
  } catch (error) {
    throw toVaultError(`${basename(filePath)} is not valid JSON`, error);
  }
}

function writeJsonExclusive(filePath: string, value: unknown): void {
  writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, {
    encoding: "utf8",
    flag: "wx",
    mode: 0o600,
  });
}

function removeOwnedRegularFile(filePath: string): void {
  const stats = lstatSync(filePath, { throwIfNoEntry: false });
  if (stats === undefined) return;
  if (stats.isSymbolicLink() || !stats.isFile()) {
    throw new LocalVaultError(`Refusing to clean a non-regular owned file: ${filePath}`);
  }
  unlinkSync(filePath);
}

export function pathEntryExists(filePath: string): boolean {
  return lstatSync(filePath, { throwIfNoEntry: false }) !== undefined;
}

function sameSnapshot(left: SourceSnapshot, right: SourceSnapshot): boolean {
  return left.size === right.size && left.mtimeMs === right.mtimeMs && left.sha256 === right.sha256;
}

function toVaultError(message: string, error: unknown): LocalVaultError {
  return error instanceof LocalVaultError
    ? error
    : new LocalVaultError(message, { cause: error });
}
