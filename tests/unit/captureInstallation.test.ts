import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  CaptureCapabilityAuthenticationError,
  authorizeLocalCaptureCapability,
  readLocalCaptureInstallation,
  rotateLocalCaptureInstallation,
  touchLocalCaptureInstallation,
} from "@/lib/vault/captureInstallation";

const INSTALLATION_ID = "installation_55555555-5555-4555-8555-555555555555";
const FIRST_CAPABILITY = `capture_${"A".repeat(43)}`;
const SECOND_CAPABILITY = `capture_${"B".repeat(43)}`;

describe("Route H local capture installation", () => {
  let configDirectory = "";

  beforeEach(() => {
    configDirectory = mkdtempSync(join(tmpdir(), "capture-installation-"));
  });

  afterEach(() => {
    rmSync(configDirectory, { recursive: true, force: true });
  });

  it("stores only a hash and authorizes the exact capability", () => {
    const installation = rotateLocalCaptureInstallation({
      installationId: INSTALLATION_ID,
      capability: FIRST_CAPABILITY,
    }, {
      configDirectory,
      now: () => "2026-08-25T00:00:00.000Z",
    });

    const raw = readFileSync(join(configDirectory, "capture-installation.json"), "utf8");
    expect(raw).not.toContain(FIRST_CAPABILITY);
    expect(installation.credentialHash).toMatch(/^[a-f0-9]{64}$/u);
    expect(authorizeLocalCaptureCapability(FIRST_CAPABILITY, configDirectory))
      .toEqual(installation);
    expect(() => authorizeLocalCaptureCapability(SECOND_CAPABILITY, configDirectory))
      .toThrow(CaptureCapabilityAuthenticationError);
  });

  it("rotates atomically and invalidates the old capability", () => {
    rotateLocalCaptureInstallation({
      installationId: INSTALLATION_ID,
      capability: FIRST_CAPABILITY,
    }, { configDirectory, now: () => "2026-08-25T00:00:00.000Z" });
    const rotated = rotateLocalCaptureInstallation({
      installationId: INSTALLATION_ID,
      capability: SECOND_CAPABILITY,
    }, { configDirectory, now: () => "2026-08-25T00:01:00.000Z" });

    expect(rotated).toMatchObject({
      credentialVersion: 2,
      createdAt: "2026-08-25T00:00:00.000Z",
      rotatedAt: "2026-08-25T00:01:00.000Z",
    });
    expect(() => authorizeLocalCaptureCapability(FIRST_CAPABILITY, configDirectory))
      .toThrow(CaptureCapabilityAuthenticationError);
    expect(authorizeLocalCaptureCapability(SECOND_CAPABILITY, configDirectory).credentialVersion)
      .toBe(2);
  });

  it("updates only bounded installation health metadata", () => {
    rotateLocalCaptureInstallation({
      installationId: INSTALLATION_ID,
      capability: FIRST_CAPABILITY,
    }, { configDirectory, now: () => "2026-08-25T00:00:00.000Z" });
    touchLocalCaptureInstallation(INSTALLATION_ID, {
      configDirectory,
      now: () => "2026-08-25T00:02:00.000Z",
    });

    expect(readLocalCaptureInstallation(configDirectory)?.lastSeenAt)
      .toBe("2026-08-25T00:02:00.000Z");
    expect(() => touchLocalCaptureInstallation(
      "installation_66666666-6666-4666-8666-666666666666",
      { configDirectory },
    )).toThrow(CaptureCapabilityAuthenticationError);
  });
});
