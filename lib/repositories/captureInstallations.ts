import type Database from "better-sqlite3";
import {
  CaptureInstallationSchema,
  CapturePairingCodeRecordSchema,
  type CaptureInstallation,
  type CapturePairingCodeRecord,
} from "@/lib/domain/captureCredential";

type InstallationRow = {
  readonly installation_id: string;
  readonly credential_hash: string;
  readonly credential_version: number;
  readonly status: string;
  readonly created_at: string;
  readonly rotated_at: string | null;
  readonly revoked_at: string | null;
  readonly last_seen_at: string | null;
};

type PairingCodeRow = {
  readonly id: string;
  readonly code_hash: string;
  readonly target_installation_id: string | null;
  readonly expires_at: string;
  readonly consumed_at: string | null;
  readonly created_at: string;
};

export function findCaptureInstallation(
  db: Database.Database,
  installationId: string,
): CaptureInstallation | null {
  const row = db.prepare<string, InstallationRow>(
    "SELECT * FROM capture_installations WHERE installation_id = ?",
  ).get(installationId);
  return row === undefined ? null : installationFromRow(row);
}

export function listCaptureInstallations(
  db: Database.Database,
): readonly CaptureInstallation[] {
  return db.prepare<[], InstallationRow>(`
    SELECT * FROM capture_installations
    ORDER BY created_at DESC, installation_id ASC
  `).all().map(installationFromRow);
}

export function findActiveCaptureInstallationByCredential(
  db: Database.Database,
  credentialHash: string,
): CaptureInstallation | null {
  const row = db.prepare<string, InstallationRow>(`
    SELECT * FROM capture_installations
    WHERE credential_hash = ? AND status = 'active'
  `).get(credentialHash);
  return row === undefined ? null : installationFromRow(row);
}

export function saveCaptureInstallation(
  db: Database.Database,
  installation: CaptureInstallation,
): void {
  const parsed = CaptureInstallationSchema.parse(installation);
  db.prepare(`
    INSERT INTO capture_installations (
      installation_id, credential_hash, credential_version, status,
      created_at, rotated_at, revoked_at, last_seen_at
    ) VALUES (
      @installationId, @credentialHash, @credentialVersion, @status,
      @createdAt, @rotatedAt, @revokedAt, @lastSeenAt
    )
    ON CONFLICT(installation_id) DO UPDATE SET
      credential_hash = excluded.credential_hash,
      credential_version = excluded.credential_version,
      status = excluded.status,
      rotated_at = excluded.rotated_at,
      revoked_at = excluded.revoked_at,
      last_seen_at = excluded.last_seen_at
  `).run({
    ...parsed,
    rotatedAt: parsed.rotatedAt ?? null,
    revokedAt: parsed.revokedAt ?? null,
    lastSeenAt: parsed.lastSeenAt ?? null,
  });
}

export function insertCapturePairingCode(
  db: Database.Database,
  record: CapturePairingCodeRecord,
): void {
  const parsed = CapturePairingCodeRecordSchema.parse(record);
  db.prepare(`
    INSERT INTO capture_pairing_codes (
      id, code_hash, target_installation_id, expires_at, consumed_at, created_at
    ) VALUES (
      @id, @codeHash, @targetInstallationId, @expiresAt, @consumedAt, @createdAt
    )
  `).run({
    ...parsed,
    targetInstallationId: parsed.targetInstallationId ?? null,
    consumedAt: parsed.consumedAt ?? null,
  });
}

export function findCapturePairingCodeByHash(
  db: Database.Database,
  codeHash: string,
): CapturePairingCodeRecord | null {
  const row = db.prepare<string, PairingCodeRow>(
    "SELECT * FROM capture_pairing_codes WHERE code_hash = ?",
  ).get(codeHash);
  return row === undefined ? null : pairingCodeFromRow(row);
}

export function markCapturePairingCodeConsumed(
  db: Database.Database,
  id: string,
  consumedAt: string,
): void {
  db.prepare(`
    UPDATE capture_pairing_codes
    SET consumed_at = ?
    WHERE id = ? AND consumed_at IS NULL
  `).run(consumedAt, id);
}

export function updateCaptureInstallationLastSeen(
  db: Database.Database,
  installationId: string,
  lastSeenAt: string,
): void {
  db.prepare(`
    UPDATE capture_installations
    SET last_seen_at = ?
    WHERE installation_id = ? AND status = 'active'
  `).run(lastSeenAt, installationId);
}

function installationFromRow(row: InstallationRow): CaptureInstallation {
  return CaptureInstallationSchema.parse({
    installationId: row.installation_id,
    credentialHash: row.credential_hash,
    credentialVersion: row.credential_version,
    status: row.status,
    createdAt: row.created_at,
    rotatedAt: row.rotated_at ?? undefined,
    revokedAt: row.revoked_at ?? undefined,
    lastSeenAt: row.last_seen_at ?? undefined,
  });
}

function pairingCodeFromRow(row: PairingCodeRow): CapturePairingCodeRecord {
  return CapturePairingCodeRecordSchema.parse({
    id: row.id,
    codeHash: row.code_hash,
    targetInstallationId: row.target_installation_id ?? undefined,
    expiresAt: row.expires_at,
    consumedAt: row.consumed_at ?? undefined,
    createdAt: row.created_at,
  });
}
