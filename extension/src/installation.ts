import { z } from "zod";
import {
  DEFAULT_CAPTURE_ENDPOINT,
  readCaptureEndpoint,
} from "./captureTransport";
import type {
  CaptureOutboxItem,
  CaptureQuarantineItem,
} from "./attemptStorage";
import type { PendingSubmissionIntent } from "./attemptCapture";
import { CaptureProvenanceLevelSchema } from "@/lib/domain/captureCredential";

export const CAPTURE_PROTOCOL_VERSION = 3 as const;

export const CaptureRuntimeContextSchema = z.object({
  installationId: z.string().min(1),
  captureEnabled: z.boolean(),
  provenanceLevel: CaptureProvenanceLevelSchema,
}).strict();

export type CaptureRuntimeContext = z.infer<typeof CaptureRuntimeContextSchema>;

export type ExtensionInitializationPlan = {
  readonly installationId: string;
  readonly captureCredential?: string;
  readonly captureEnabled: boolean;
  readonly captureEndpoint: string;
  readonly captureProtocolVersion: 3;
  readonly pendingSubmissionIntents: readonly PendingSubmissionIntent[];
  readonly captureOutbox: readonly CaptureOutboxItem[];
  readonly captureQuarantine: readonly CaptureQuarantineItem[];
  readonly discardedPreBundleEventCount: number;
  readonly preBundleQueueDiscardedAt?: string;
  readonly shouldRemoveLegacyEventQueue: boolean;
};

export type ExtensionInitializationStorage = {
  readonly set: (items: Record<string, unknown>) => Promise<void>;
  readonly remove: (key: string) => Promise<void>;
};

export type TrustedStorageAccessController = {
  readonly setAccessLevel?: (
    accessOptions: { readonly accessLevel: "TRUSTED_CONTEXTS" },
  ) => Promise<void>;
};

export async function restrictStorageToTrustedContexts(
  storage: TrustedStorageAccessController,
): Promise<boolean> {
  if (storage.setAccessLevel === undefined) return false;
  await storage.setAccessLevel({ accessLevel: "TRUSTED_CONTEXTS" });
  return true;
}

export function planExtensionInitialization(
  stored: Record<string, unknown>,
  options: {
    readonly now: string;
    readonly createInstallationId: () => string;
  },
): ExtensionInitializationPlan {
  const isV3 = stored.captureProtocolVersion === CAPTURE_PROTOCOL_VERSION;
  const rawQueue = Array.isArray(stored.eventQueue) ? stored.eventQueue : [];
  const installationId = typeof stored.installationId === "string" && stored.installationId.length > 0
    ? stored.installationId
    : options.createInstallationId();
  const discardedPreBundleEventCount = isV3
    ? readNonnegativeInteger(stored.discardedPreBundleEventCount)
    : rawQueue.length;
  const preBundleQueueDiscardedAt = isV3
    ? readNonemptyString(stored.preBundleQueueDiscardedAt)
    : options.now;
  const base = {
    installationId,
    captureCredential: readNonemptyString(stored.captureCredential),
    captureEnabled: stored.captureEnabled !== false,
    captureEndpoint: readCaptureEndpoint(
      stored.captureEndpoint ?? DEFAULT_CAPTURE_ENDPOINT,
    ),
    captureProtocolVersion: CAPTURE_PROTOCOL_VERSION,
    pendingSubmissionIntents: isV3 && Array.isArray(stored.pendingSubmissionIntents)
      ? stored.pendingSubmissionIntents as readonly PendingSubmissionIntent[]
      : [],
    captureOutbox: isV3 && Array.isArray(stored.captureOutbox)
      ? stored.captureOutbox as readonly CaptureOutboxItem[]
      : [],
    captureQuarantine: isV3 && Array.isArray(stored.captureQuarantine)
      ? stored.captureQuarantine as readonly CaptureQuarantineItem[]
      : [],
    discardedPreBundleEventCount,
    shouldRemoveLegacyEventQueue: !isV3 || rawQueue.length > 0,
  };
  return preBundleQueueDiscardedAt === undefined
    ? base
    : { ...base, preBundleQueueDiscardedAt };
}

export function extensionInitializationStorage(
  plan: ExtensionInitializationPlan,
): Record<string, unknown> {
  return {
    installationId: plan.installationId,
    ...(plan.captureCredential === undefined ? {} : { captureCredential: plan.captureCredential }),
    captureEnabled: plan.captureEnabled,
    captureEndpoint: plan.captureEndpoint,
    captureProtocolVersion: plan.captureProtocolVersion,
    pendingSubmissionIntents: plan.pendingSubmissionIntents,
    captureOutbox: plan.captureOutbox,
    captureQuarantine: plan.captureQuarantine,
    discardedPreBundleEventCount: plan.discardedPreBundleEventCount,
    ...(plan.preBundleQueueDiscardedAt === undefined
      ? {}
      : { preBundleQueueDiscardedAt: plan.preBundleQueueDiscardedAt }),
  };
}

export async function applyExtensionInitialization(
  storage: ExtensionInitializationStorage,
  plan: ExtensionInitializationPlan,
): Promise<void> {
  await storage.set(extensionInitializationStorage(plan));
  if (plan.shouldRemoveLegacyEventQueue) await storage.remove("eventQueue");
  await storage.remove("outbox");
  await storage.remove("quarantine");
}

export function runtimeContextFromPlan(
  plan: ExtensionInitializationPlan,
): CaptureRuntimeContext {
  return {
    installationId: plan.installationId,
    captureEnabled: plan.captureEnabled,
    provenanceLevel: plan.captureCredential === undefined
      ? "extension_unpaired"
      : "extension_paired",
  };
}

export function runtimeContextFromStored(
  stored: Record<string, unknown>,
): CaptureRuntimeContext {
  return CaptureRuntimeContextSchema.parse({
    installationId: stored.installationId,
    captureEnabled: stored.captureEnabled !== false,
    provenanceLevel: readNonemptyString(stored.captureCredential) === undefined
      ? "extension_unpaired"
      : "extension_paired",
  });
}

function readNonnegativeInteger(value: unknown): number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0
    ? value
    : 0;
}

function readNonemptyString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}
