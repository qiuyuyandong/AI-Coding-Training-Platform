import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import Database from "better-sqlite3";
import { afterEach, describe, expect, it } from "vitest";
import { getOrCreateLocalProfile } from "@/lib/repositories/learnerProfiles";
import { buildFeedbackBundle, readMetricsEnabled, saveMetricsEnabled } from "@/lib/services/pilotSupport";
import { createEmptyVault, snapshotFile } from "@/lib/vault/localVault";
import { backupVault, diagnoseVault, restoreVault, validateBackup, VAULT_BACKUP_MANIFEST } from "@/lib/vault/operations";

const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe("Local Vault backup, restore, and support diagnostics", () => {
  it("backs up a consistent database and restores it with a retained safety backup", async () => {
    const root = makeRoot();
    const vaultDirectory = join(root, "vault");
    const backupDirectory = join(root, "backup");
    mkdirSync(vaultDirectory);
    mkdirSync(backupDirectory);
    const vault = createEmptyVault(vaultDirectory);
    insertProblem(vault.databasePath, "before-backup");
    const manifest = await backupVault(vault, backupDirectory, { now: () => "2026-09-07T13:00:00.000Z" });
    expect(manifest.files.map((file) => file.path)).toContain("training-platform.sqlite");
    expect(JSON.stringify(manifest)).not.toContain(vault.vaultPath);
    insertProblem(vault.databasePath, "after-backup");

    const restored = await restoreVault(vault, backupDirectory, {
      now: () => "2026-09-07T13:01:00.000Z",
      assertStopped: () => Promise.resolve(),
    });
    expect(problemIds(vault.databasePath)).toEqual(["before-backup"]);
    expect(validateBackup(restored.safetyBackupPath, vault.descriptor.vaultId).files.length).toBeGreaterThanOrEqual(2);
    expect(diagnoseVault(vault).status).toBe("ok");
  });

  it("rejects a damaged package before replacement", async () => {
    const root = makeRoot();
    const vaultDirectory = join(root, "vault");
    const backupDirectory = join(root, "backup");
    mkdirSync(vaultDirectory);
    mkdirSync(backupDirectory);
    const vault = createEmptyVault(vaultDirectory);
    insertProblem(vault.databasePath, "keep-original");
    await backupVault(vault, backupDirectory);
    writeFileSync(join(backupDirectory, "training-platform.sqlite"), "damaged", "utf8");
    const before = snapshotFile(vault.databasePath);
    await expect(restoreVault(vault, backupDirectory, { assertStopped: () => Promise.resolve() })).rejects.toThrow(/hash mismatch/u);
    expect(snapshotFile(vault.databasePath)).toEqual(before);
    expect(problemIds(vault.databasePath)).toEqual(["keep-original"]);
  });

  it("rejects unknown migrations and unlisted files", async () => {
    const root = makeRoot();
    const vaultDirectory = join(root, "vault");
    const backupDirectory = join(root, "backup");
    mkdirSync(vaultDirectory);
    mkdirSync(backupDirectory);
    const vault = createEmptyVault(vaultDirectory);
    await backupVault(vault, backupDirectory);
    const manifestPath = join(backupDirectory, VAULT_BACKUP_MANIFEST);
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
    manifest.schemaMigrations.push("9999_future.sql");
    writeFileSync(manifestPath, JSON.stringify(manifest), "utf8");
    expect(() => validateBackup(backupDirectory)).toThrow(/unknown migration/u);
  });

  it("rolls back cleanly when restoration fails before the swap", async () => {
    const root = makeRoot();
    const vaultDirectory = join(root, "vault");
    const backupDirectory = join(root, "backup");
    mkdirSync(vaultDirectory);
    mkdirSync(backupDirectory);
    const vault = createEmptyVault(vaultDirectory);
    insertProblem(vault.databasePath, "original");
    await backupVault(vault, backupDirectory);
    const before = snapshotFile(vault.databasePath);
    await expect(restoreVault(vault, backupDirectory, {
      assertStopped: () => Promise.resolve(),
      beforeSwap: () => { throw new Error("injected pre-swap failure"); },
    })).rejects.toThrow(/original data was restored/u);
    expect(snapshotFile(vault.databasePath)).toEqual(before);
  });

  it("keeps metrics off by default and exports only selected aggregates", () => {
    const root = makeRoot();
    const vaultDirectory = join(root, "vault");
    mkdirSync(vaultDirectory);
    const vault = createEmptyVault(vaultDirectory);
    const db = new Database(vault.databasePath);
    try {
      getOrCreateLocalProfile(db, { now: () => "2026-09-07T13:00:00.000Z" });
      expect(readMetricsEnabled(db)).toBe(false);
      const bundle = buildFeedbackBundle(db, {
        categories: ["vault_health", "schema"], diagnosis: diagnoseVault(vault), now: "2026-09-07T13:00:00.000Z",
      });
      const text = JSON.stringify(bundle);
      expect(text).not.toContain(vault.vaultPath);
      expect(text).not.toMatch(/api[_-]?key|prompt|reflection|identity/iu);
      expect(saveMetricsEnabled(db, true, "2026-09-07T13:01:00.000Z")).toBe(true);
      buildFeedbackBundle(db, { categories: ["feature_counts"], diagnosis: diagnoseVault(vault), now: "2026-09-07T13:02:00.000Z" });
      expect(db.prepare("SELECT event_type, metric_value FROM pilot_support_events").all())
        .toEqual([{ event_type: "feedback_exported", metric_value: 1 }]);
    } finally {
      db.close();
    }
  });
});

function makeRoot(): string {
  const root = mkdtempSync(join(tmpdir(), "vault-operations-"));
  roots.push(root);
  return root;
}

function insertProblem(databasePath: string, id: string): void {
  const db = new Database(databasePath);
  try {
    db.prepare(`
      INSERT INTO problems (
        id, platform, external_id, title, canonical_url, tags_json,
        difficulty, status, content_mode, training_mode, created_at, updated_at
      ) VALUES (?, 'manual', ?, 'Local test', ?, '[]', 'unknown', 'active', 'reference', 'manual', ?, ?)
    `).run(id, id, `manual://${id}`, "2026-09-07T13:00:00.000Z", "2026-09-07T13:00:00.000Z");
  } finally {
    db.close();
  }
}

function problemIds(databasePath: string): readonly string[] {
  const db = new Database(databasePath, { readonly: true });
  try {
    return db.prepare<[], { readonly id: string }>("SELECT id FROM problems ORDER BY id").all().map((row) => row.id);
  } finally {
    db.close();
  }
}
