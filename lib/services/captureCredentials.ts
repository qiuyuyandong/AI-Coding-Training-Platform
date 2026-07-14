import { createHash, randomBytes, randomUUID } from "node:crypto";
import type Database from "better-sqlite3";
import type { CaptureInstallation } from "@/lib/domain/captureCredential";
import {
  findActiveCaptureInstallationByCredential,
  findCaptureInstallation,
  findCapturePairingCodeByHash,
  insertCapturePairingCode,
  markCapturePairingCodeConsumed,
  saveCaptureInstallation,
  updateCaptureInstallationLastSeen,
} from "@/lib/repositories/captureInstallations";

const PAIRING_CODE_TTL_MS = 10 * 60 * 1000;

type SecretDependencies = {
  readonly now?: () => string;
  readonly createSecret?: (prefix: "pair" | "capture") => string;
  readonly createId?: () => string;
};

export class CaptureCredentialConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CaptureCredentialConflictError";
  }
}

export class CaptureCredentialAuthenticationError extends Error {
  constructor() {
    super("Capture credential is not authorized");
    this.name = "CaptureCredentialAuthenticationError";
  }
}

export function hashCaptureSecret(secret: string): string {
  return createHash("sha256").update(secret, "utf8").digest("hex");
}

export function createCaptureSecret(prefix: "pair" | "capture"): string {
  return `${prefix}_${randomBytes(32).toString("base64url")}`;
}

export function issueCapturePairingCode(
  db: Database.Database,
  targetInstallationId?: string,
  dependencies: SecretDependencies = {},
): { readonly code: string; readonly expiresAt: string } {
  if (
    targetInstallationId !== undefined
    && findCaptureInstallation(db, targetInstallationId) === null
  ) {
    throw new CaptureCredentialConflictError("Capture installation was not found");
  }

  const now = dependencies.now?.() ?? new Date().toISOString();
  const code = dependencies.createSecret?.("pair") ?? createCaptureSecret("pair");
  const expiresAt = new Date(Date.parse(now) + PAIRING_CODE_TTL_MS).toISOString();
  insertCapturePairingCode(db, {
    id: dependencies.createId?.() ?? `pairing_${randomUUID()}`,
    codeHash: hashCaptureSecret(code),
    targetInstallationId,
    expiresAt,
    createdAt: now,
  });
  return { code, expiresAt };
}

export function pairCaptureInstallation(
  db: Database.Database,
  input: { readonly code: string; readonly installationId: string },
  dependencies: SecretDependencies = {},
): { readonly credential: string; readonly installation: CaptureInstallation } {
  return db.transaction(() => {
    const now = dependencies.now?.() ?? new Date().toISOString();
    const pairingCode = findCapturePairingCodeByHash(db, hashCaptureSecret(input.code));
    if (
      pairingCode === null
      || pairingCode.consumedAt !== undefined
      || pairingCode.expiresAt <= now
      || (
        pairingCode.targetInstallationId !== undefined
        && pairingCode.targetInstallationId !== input.installationId
      )
    ) {
      throw new CaptureCredentialAuthenticationError();
    }

    const existing = findCaptureInstallation(db, input.installationId);
    if (pairingCode.targetInstallationId === undefined && existing !== null) {
      throw new CaptureCredentialConflictError(
        "Existing installations require a targeted rotation code",
      );
    }

    const credential = dependencies.createSecret?.("capture")
      ?? createCaptureSecret("capture");
    const installation = {
      installationId: input.installationId,
      credentialHash: hashCaptureSecret(credential),
      credentialVersion: (existing?.credentialVersion ?? 0) + 1,
      status: "active" as const,
      createdAt: existing?.createdAt ?? now,
      rotatedAt: existing === null ? undefined : now,
      revokedAt: undefined,
      lastSeenAt: existing?.lastSeenAt,
    };
    saveCaptureInstallation(db, installation);
    markCapturePairingCodeConsumed(db, pairingCode.id, now);
    return { credential, installation };
  })();
}

export function authorizeCaptureInstallation(
  db: Database.Database,
  credential: string,
  installationId: string,
): CaptureInstallation {
  const installation = findActiveCaptureInstallationByCredential(
    db,
    hashCaptureSecret(credential),
  );
  if (installation === null || installation.installationId !== installationId) {
    throw new CaptureCredentialAuthenticationError();
  }
  return installation;
}

export function revokeCaptureInstallation(
  db: Database.Database,
  installationId: string,
  now = new Date().toISOString(),
): CaptureInstallation {
  const installation = findCaptureInstallation(db, installationId);
  if (installation === null) {
    throw new CaptureCredentialConflictError("Capture installation was not found");
  }
  const revoked = {
    ...installation,
    status: "revoked" as const,
    revokedAt: now,
  };
  saveCaptureInstallation(db, revoked);
  return revoked;
}

export function touchCaptureInstallation(
  db: Database.Database,
  installationId: string,
  now: string,
): void {
  updateCaptureInstallationLastSeen(db, installationId, now);
}
