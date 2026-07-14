import Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { applyMigrations } from "@/lib/db/migrations";
import { findCapturePairingCodeByHash } from "@/lib/repositories/captureInstallations";
import {
  CaptureCredentialAuthenticationError,
  CaptureCredentialConflictError,
  authorizeCaptureInstallation,
  hashCaptureSecret,
  issueCapturePairingCode,
  pairCaptureInstallation,
  revokeCaptureInstallation,
} from "@/lib/services/captureCredentials";

const NOW = "2026-07-14T08:00:00.000Z";

describe("capture credential lifecycle", () => {
  let db: Database.Database;
  let sequence: number;

  beforeEach(() => {
    db = new Database(":memory:");
    applyMigrations(db, { now: () => NOW });
    sequence = 0;
  });

  afterEach(() => {
    db.close();
  });

  it("stores only hashes and consumes a first-pairing code once", () => {
    const issued = issueCapturePairingCode(db, undefined, dependencies());
    const paired = pairCaptureInstallation(
      db,
      { code: issued.code, installationId: "installation_1" },
      dependencies(),
    );

    expect(issued.code).toBe("pair_secret_1");
    expect(paired.credential).toBe("capture_secret_3");
    expect(
      db.prepare<[], { readonly credential_hash: string }>(
        "SELECT credential_hash FROM capture_installations",
      ).get(),
    ).toEqual({ credential_hash: hashCaptureSecret("capture_secret_3") });
    expect(
      db.prepare<[], { readonly code_hash: string; readonly consumed_at: string }>(
        "SELECT code_hash, consumed_at FROM capture_pairing_codes",
      ).get(),
    ).toEqual({ code_hash: hashCaptureSecret("pair_secret_1"), consumed_at: NOW });
    expect(() => pairCaptureInstallation(
      db,
      { code: issued.code, installationId: "installation_1" },
      dependencies(),
    )).toThrow(CaptureCredentialAuthenticationError);
  });

  it("expires pairing codes after ten minutes", () => {
    const issued = issueCapturePairingCode(db, undefined, dependencies());
    expect(issued.expiresAt).toBe("2026-07-14T08:10:00.000Z");

    expect(() => pairCaptureInstallation(
      db,
      { code: issued.code, installationId: "installation_1" },
      { ...dependencies(), now: () => "2026-07-14T08:10:00.000Z" },
    )).toThrow(CaptureCredentialAuthenticationError);
  });

  it("requires a targeted code to rotate an existing installation", () => {
    const first = issueCapturePairingCode(db, undefined, dependencies());
    const paired = pairCaptureInstallation(
      db,
      { code: first.code, installationId: "installation_1" },
      dependencies(),
    );
    const unscoped = issueCapturePairingCode(db, undefined, dependencies());
    expect(() => pairCaptureInstallation(
      db,
      { code: unscoped.code, installationId: "installation_1" },
      dependencies(),
    )).toThrow(CaptureCredentialConflictError);

    const rotation = issueCapturePairingCode(
      db,
      "installation_1",
      dependencies(),
    );
    expect(() => pairCaptureInstallation(
      db,
      { code: rotation.code, installationId: "installation_other" },
      dependencies(),
    )).toThrow(CaptureCredentialAuthenticationError);
    const rotated = pairCaptureInstallation(
      db,
      { code: rotation.code, installationId: "installation_1" },
      dependencies(),
    );

    expect(rotated.installation.credentialVersion).toBe(2);
    expect(() => authorizeCaptureInstallation(
      db,
      paired.credential,
      "installation_1",
    )).toThrow(CaptureCredentialAuthenticationError);
    expect(authorizeCaptureInstallation(
      db,
      rotated.credential,
      "installation_1",
    ).credentialVersion).toBe(2);
  });

  it("rejects installation mismatch and revoked credentials uniformly", () => {
    const issued = issueCapturePairingCode(db, undefined, dependencies());
    const paired = pairCaptureInstallation(
      db,
      { code: issued.code, installationId: "installation_1" },
      dependencies(),
    );

    expect(() => authorizeCaptureInstallation(
      db,
      paired.credential,
      "installation_2",
    )).toThrow(CaptureCredentialAuthenticationError);
    revokeCaptureInstallation(db, "installation_1", NOW);
    expect(() => authorizeCaptureInstallation(
      db,
      paired.credential,
      "installation_1",
    )).toThrow(CaptureCredentialAuthenticationError);
  });

  it("does not consume a code when pairing fails", () => {
    const first = issueCapturePairingCode(db, undefined, dependencies());
    pairCaptureInstallation(
      db,
      { code: first.code, installationId: "installation_1" },
      dependencies(),
    );
    const unscoped = issueCapturePairingCode(db, undefined, dependencies());
    expect(() => pairCaptureInstallation(
      db,
      { code: unscoped.code, installationId: "installation_1" },
      dependencies(),
    )).toThrow(CaptureCredentialConflictError);

    expect(
      findCapturePairingCodeByHash(db, hashCaptureSecret(unscoped.code))?.consumedAt,
    ).toBeUndefined();
  });

  function dependencies() {
    return {
      now: () => NOW,
      createSecret: (prefix: "pair" | "capture") => {
        sequence += 1;
        return `${prefix}_secret_${sequence}`;
      },
      createId: () => {
        sequence += 1;
        return `pairing_${sequence}`;
      },
    };
  }
});
