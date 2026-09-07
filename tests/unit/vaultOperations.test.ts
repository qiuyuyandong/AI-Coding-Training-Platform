import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import Database from "better-sqlite3";
import { afterEach, describe, expect, it } from "vitest";
import { importPackage } from "@/lib/curriculum/importPackage";
import { getOrCreateLocalProfile } from "@/lib/repositories/learnerProfiles";
import { startDefaultProject } from "@/lib/services/projectEvidence";
import { recordProjectArtifactEvidence } from "@/lib/services/projectEvidenceIntake";
import { buildFeedbackBundle, readMetricsEnabled, saveMetricsEnabled } from "@/lib/services/pilotSupport";
import { createEmptyVault, snapshotFile } from "@/lib/vault/localVault";
import {
  backupVault,
  diagnoseVault,
  restoreVault,
  validateBackup,
  VAULT_BACKUP_MANIFEST,
  type VaultRestoreStep,
} from "@/lib/vault/operations";

const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe("Local Vault backup, restore, and support diagnostics", () => {
  it("restores full snapshots and can use the retained safety backup to reverse the restore", async () => {
    const root = makeRoot();
    const vaultDirectory = join(root, "vault");
    const backupDirectory = join(root, "backup");
    mkdirSync(vaultDirectory);
    mkdirSync(backupDirectory);
    const vault = createEmptyVault(vaultDirectory);
    insertProblem(vault.databasePath, "before-backup");
    const firstSnapshot = insertFullSnapshot(vault, "int before = 1;", "full-before");
    const manifest = await backupVault(vault, backupDirectory, { now: () => "2026-09-07T13:00:00.000Z" });
    expect(manifest.files.map((file) => file.path)).toContain("training-platform.sqlite");
    expect(manifest.files.map((file) => file.path)).toContain(`evidence/${firstSnapshot.hash}.snapshot`);
    expect(JSON.stringify(manifest)).not.toContain(vault.vaultPath);
    insertProblem(vault.databasePath, "after-backup");
    const secondSnapshot = insertFullSnapshot(vault, "int after = 2;", "full-after");

    const restored = await restoreVault(vault, backupDirectory, {
      now: () => "2026-09-07T13:01:00.000Z",
      assertStopped: () => Promise.resolve(),
    });
    expect(problemIds(vault.databasePath)).toEqual(["before-backup"]);
    expect(snapshotContents(vault.databasePath)).toEqual(["int before = 1;"]);
    expect(validateBackup(restored.safetyBackupPath, vault.descriptor.vaultId).files.length).toBeGreaterThanOrEqual(2);
    expect(diagnoseVault(vault).status).toBe("ok");

    await restoreVault(vault, restored.safetyBackupPath, {
      now: () => "2026-09-07T13:02:00.000Z",
      assertStopped: () => Promise.resolve(),
    });
    expect(problemIds(vault.databasePath)).toEqual(["after-backup", "before-backup"]);
    expect(snapshotContents(vault.databasePath)).toEqual(["int after = 2;", "int before = 1;"]);
    expect(readFileSync(secondSnapshot.path, "utf8")).toBe("int after = 2;");
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

  it.each([
    "live_database_moved",
    "replacement_database_moved",
    "live_evidence_moved",
    "replacement_evidence_moved",
    "replacement_validated",
  ] as const)("rolls back database, snapshots, and references after %s", async (failureStep) => {
    const root = makeRoot();
    const vaultDirectory = join(root, "vault");
    const backupDirectory = join(root, "backup");
    mkdirSync(vaultDirectory);
    mkdirSync(backupDirectory);
    const vault = createEmptyVault(vaultDirectory);
    insertProblem(vault.databasePath, "backup-state");
    insertFullSnapshot(vault, "int backup = 1;", "rollback-backup");
    await backupVault(vault, backupDirectory);
    insertProblem(vault.databasePath, "live-state");
    insertFullSnapshot(vault, "int live = 2;", "rollback-live");
    const beforeDatabase = snapshotFile(vault.databasePath);
    const beforeProblems = problemIds(vault.databasePath);
    const beforeSnapshots = snapshotContents(vault.databasePath);

    await expect(restoreVault(vault, backupDirectory, {
      assertStopped: () => Promise.resolve(),
      afterStep: (step: VaultRestoreStep) => {
        if (step === failureStep) throw new Error(`injected ${failureStep}`);
      },
    })).rejects.toThrow(/original data was restored/u);

    expect(snapshotFile(vault.databasePath)).toEqual(beforeDatabase);
    expect(problemIds(vault.databasePath)).toEqual(beforeProblems);
    expect(snapshotContents(vault.databasePath)).toEqual(beforeSnapshots);
    expect(diagnoseVault(vault).status).toBe("ok");
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

function insertFullSnapshot(
  vault: ReturnType<typeof createEmptyVault>,
  content: string,
  idempotencyKey: string,
): { readonly hash: string; readonly path: string } {
  const db = new Database(vault.databasePath);
  try {
    db.pragma("foreign_keys = ON");
    const imported = importPackage(db, join(process.cwd(), "content", "tracks", "software-development-foundations-v1"));
    if (!imported.ok) throw new Error("Curriculum import failed");
    getOrCreateLocalProfile(db, { now: () => "2026-09-07T13:00:00.000Z" });
    const started = startDefaultProject(db, { captureMode: "full", now: "2026-09-07T13:00:00.000Z" });
    const stored = recordProjectArtifactEvidence(db, join(vault.vaultPath, ".training-evidence"), {
      projectSessionId: started.sessionId,
      kind: "snapshot",
      purpose: "Vault backup test",
      captureMode: "full",
      relativePath: `${idempotencyKey}.cpp`,
      content,
      idempotencyKey,
      recordedAt: "2026-09-07T13:00:00.000Z",
    });
    if (stored.artifact.reference === null) throw new Error("Snapshot path is missing");
    return { hash: stored.artifact.contentHash, path: stored.artifact.reference };
  } finally {
    db.close();
  }
}

function snapshotContents(databasePath: string): readonly string[] {
  const db = new Database(databasePath, { readonly: true });
  try {
    return db.prepare<[], { readonly storage_path: string }>(`
      SELECT storage_path FROM code_snapshot_refs
      WHERE deleted_at IS NULL AND storage_path IS NOT NULL
      ORDER BY storage_path
    `).all().map((row) => readFileSync(row.storage_path, "utf8")).sort();
  } finally {
    db.close();
  }
}
