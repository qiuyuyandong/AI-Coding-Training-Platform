import { z } from "zod";

import {
  CAPTURE_CAPABILITY_PATTERN,
  captureCapabilityHashMatches,
  hashCaptureCapability,
} from "@/lib/services/captureCapability";
import {
  readLocalConfigJson,
  resolveRuntimeVaultConfigDirectory,
  writeLocalConfigJson,
} from "@/lib/vault/localVault";

export const CAPTURE_INSTALLATION_CONFIG_NAME = "capture-installation.json";

export const LocalCaptureInstallationSchema = z.object({
  schemaVersion: z.literal(1),
  installationId: z.string().regex(
    /^installation_[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/u,
  ),
  credentialVersion: z.number().int().positive(),
  credentialHash: z.string().regex(/^[a-f0-9]{64}$/u),
  createdAt: z.string().datetime(),
  rotatedAt: z.string().datetime().optional(),
  lastSeenAt: z.string().datetime().optional(),
}).strict();

export type LocalCaptureInstallation = z.infer<typeof LocalCaptureInstallationSchema>;

export class CaptureCapabilityAuthenticationError extends Error {
  constructor() {
    super("Capture capability is not authorized");
    this.name = "CaptureCapabilityAuthenticationError";
  }
}

export function readLocalCaptureInstallation(
  configDirectory = resolveRuntimeVaultConfigDirectory(),
): LocalCaptureInstallation | null {
  const stored = readLocalConfigJson(CAPTURE_INSTALLATION_CONFIG_NAME, configDirectory);
  return stored === null ? null : LocalCaptureInstallationSchema.parse(stored);
}

export function rotateLocalCaptureInstallation(
  input: {
    readonly installationId: string;
    readonly capability: string;
  },
  options: {
    readonly configDirectory?: string;
    readonly now?: () => string;
  } = {},
): LocalCaptureInstallation {
  if (!/^installation_[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/u
    .test(input.installationId)) {
    throw new CaptureCapabilityAuthenticationError();
  }
  if (!CAPTURE_CAPABILITY_PATTERN.test(input.capability)) {
    throw new CaptureCapabilityAuthenticationError();
  }
  const configDirectory = options.configDirectory ?? resolveRuntimeVaultConfigDirectory();
  const previous = readLocalCaptureInstallation(configDirectory);
  const now = options.now?.() ?? new Date().toISOString();
  const next = LocalCaptureInstallationSchema.parse({
    schemaVersion: 1,
    installationId: input.installationId,
    credentialVersion: (previous?.credentialVersion ?? 0) + 1,
    credentialHash: hashCaptureCapability(input.capability),
    createdAt: previous?.createdAt ?? now,
    ...(previous === null ? {} : { rotatedAt: now }),
  });
  writeLocalConfigJson(CAPTURE_INSTALLATION_CONFIG_NAME, next, configDirectory);
  return next;
}

export function authorizeLocalCaptureCapability(
  capability: string,
  configDirectory = resolveRuntimeVaultConfigDirectory(),
): LocalCaptureInstallation {
  if (!CAPTURE_CAPABILITY_PATTERN.test(capability)) {
    throw new CaptureCapabilityAuthenticationError();
  }
  const installation = readLocalCaptureInstallation(configDirectory);
  if (
    installation === null
    || !captureCapabilityHashMatches(installation.credentialHash, capability)
  ) {
    throw new CaptureCapabilityAuthenticationError();
  }
  return installation;
}

export function touchLocalCaptureInstallation(
  expectedInstallationId: string,
  options: {
    readonly configDirectory?: string;
    readonly now?: () => string;
  } = {},
): LocalCaptureInstallation {
  const configDirectory = options.configDirectory ?? resolveRuntimeVaultConfigDirectory();
  const installation = readLocalCaptureInstallation(configDirectory);
  if (installation === null || installation.installationId !== expectedInstallationId) {
    throw new CaptureCapabilityAuthenticationError();
  }
  const touched = LocalCaptureInstallationSchema.parse({
    ...installation,
    lastSeenAt: options.now?.() ?? new Date().toISOString(),
  });
  writeLocalConfigJson(CAPTURE_INSTALLATION_CONFIG_NAME, touched, configDirectory);
  return touched;
}
