import { z } from "zod";
import {
  DEFAULT_CAPTURE_ENDPOINT,
  isQueueItem,
  readCaptureEndpoint,
  type CaptureQueueItem,
} from "./transport";
import { CaptureProvenanceLevelSchema } from "@/lib/domain/captureCredential";

export const CAPTURE_PROTOCOL_VERSION = 2 as const;

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
  readonly captureProtocolVersion: 2;
  readonly eventQueue: readonly CaptureQueueItem[];
  readonly discardedLegacyEventCount: number;
  readonly legacyQueueDiscardedAt?: string;
  readonly shouldLogLegacyDiscard: boolean;
};

export function planExtensionInitialization(
  stored: Record<string, unknown>,
  options: {
    readonly now: string;
    readonly createInstallationId: () => string;
  },
): ExtensionInitializationPlan {
  const isV2 = stored.captureProtocolVersion === CAPTURE_PROTOCOL_VERSION;
  const rawQueue = Array.isArray(stored.eventQueue) ? stored.eventQueue : [];
  const eventQueue = isV2 ? rawQueue.filter(isQueueItem) : [];
  const installationId = typeof stored.installationId === "string" && stored.installationId.length > 0
    ? stored.installationId
    : options.createInstallationId();
  const discardedLegacyEventCount = isV2
    ? readNonnegativeInteger(stored.discardedLegacyEventCount)
    : rawQueue.length;
  const legacyQueueDiscardedAt = isV2
    ? readNonemptyString(stored.legacyQueueDiscardedAt)
    : options.now;
  const base = {
    installationId,
    captureCredential: readNonemptyString(stored.captureCredential),
    captureEnabled: stored.captureEnabled !== false,
    captureEndpoint: readCaptureEndpoint(
      stored.captureEndpoint ?? DEFAULT_CAPTURE_ENDPOINT,
    ),
    captureProtocolVersion: CAPTURE_PROTOCOL_VERSION,
    eventQueue,
    discardedLegacyEventCount,
    shouldLogLegacyDiscard: !isV2,
  };
  return legacyQueueDiscardedAt === undefined
    ? base
    : { ...base, legacyQueueDiscardedAt };
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
