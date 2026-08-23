import { z } from "zod";
import {
  DEFAULT_CAPTURE_ENDPOINT,
  captureEndpointStatus,
  readCaptureEndpoint,
} from "./captureTransport";
import { CaptureProvenanceLevelSchema } from "@/lib/domain/captureCredential";
import {
  readConfirmedSubmissionState,
  type ConfirmedSubmissionRecord,
  type ConfirmedSubmissionTombstone,
} from "./confirmedSubmissionStorage";
import {
  readTransientSessionEvidenceState,
  type TransientSessionEvidenceState,
} from "./transientEvidenceStorage";
import {
  safeStoredCaptureError,
  sanitizeCaptureOutboxRecords,
  sanitizeCaptureQuarantineRecords,
} from "./captureErrorPrivacy";

export const CAPTURE_PROTOCOL_VERSION = 4 as const;

export type V4ClickIntentMigration = {
  readonly removedActiveIntentCount: number;
  readonly migratedAt: string;
  readonly sourceProtocolVersion: 3;
  readonly targetProtocolVersion: 4;
  readonly reason: "click_only_intents_not_server_confirmed";
};

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
  readonly captureProtocolVersion: 4;
  readonly transientSessionEvidence: TransientSessionEvidenceState | undefined;
  readonly confirmedSubmissions: readonly ConfirmedSubmissionRecord[];
  readonly confirmedSubmissionTombstones: readonly ConfirmedSubmissionTombstone[];
  readonly v4ClickIntentMigration?: V4ClickIntentMigration;
  readonly captureOutbox: readonly unknown[];
  readonly captureQuarantine: readonly unknown[];
  readonly lastCaptureError?: string;
  readonly discardedPreBundleEventCount: number;
  readonly preBundleQueueDiscardedAt?: string;
  readonly shouldRemoveLegacyEventQueue: boolean;
  readonly shouldRemovePendingSubmissionIntents: boolean;
  readonly shouldRemoveLastCaptureError: boolean;
};

/**
 * Legacy storage surface: only `set` and `remove`. Supports the first-authoritative
 * migration path by writing the full combined initialization record. To enable
 * incremental diff updates (avoid rewriting unchanged durable fields), provide an
 * optional `get` so the apply function can compare plan values against prior state.
 */
export type ExtensionInitializationStorage = {
  readonly set: (items: Record<string, unknown>) => Promise<void>;
  readonly remove: (key: string) => Promise<void>;
  readonly get?: (keys: readonly string[]) => Promise<Record<string, unknown>>;
};

/**
 * Split storage surface: separates chrome.storage.local (durable delivery,
 * pairing, E2 confirmed, tombstones, V4 audit) from chrome.storage.session
 * (transient E0/E1/E3/diagnostic evidence). The apply function reads prior
 * state from each area, computes a per-area diff, and writes only keys whose
 * value differs from the prior read.
 */
export type ExtensionInitializationAreaStorage = {
  readonly get: (keys: readonly string[]) => Promise<Record<string, unknown>>;
  readonly set: (items: Record<string, unknown>) => Promise<void>;
  readonly remove: (key: string) => Promise<void>;
};

export type ExtensionInitializationStorageSplit = {
  readonly local: ExtensionInitializationAreaStorage;
  readonly session: ExtensionInitializationAreaStorage;
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
  const isV4 = stored.captureProtocolVersion === CAPTURE_PROTOCOL_VERSION;
  const isV3 = stored.captureProtocolVersion === 3;
  const isBundleProtocol = isV3 || isV4;
  const rawQueue = Array.isArray(stored.eventQueue) ? stored.eventQueue : [];
  const installationId = typeof stored.installationId === "string" && stored.installationId.length > 0
    ? stored.installationId
    : options.createInstallationId();
  const discardedPreBundleEventCount = isBundleProtocol
    ? readNonnegativeInteger(stored.discardedPreBundleEventCount)
    : rawQueue.length;
  const preBundleQueueDiscardedAt = isBundleProtocol
    ? readNonemptyString(stored.preBundleQueueDiscardedAt)
    : options.now;
  const pendingSubmissionIntents = Array.isArray(stored.pendingSubmissionIntents)
    ? stored.pendingSubmissionIntents
    : [];
  const endpoint = captureEndpointStatus(stored.captureEndpoint ?? DEFAULT_CAPTURE_ENDPOINT);
  const storedCaptureError = safeStoredCaptureError(stored.lastCaptureError);
  const lastCaptureError = endpoint.status === "unsupported"
    ? "unsupported_capture_endpoint"
    : storedCaptureError === "unsupported_capture_endpoint"
      ? undefined
      : storedCaptureError;
  const v4ClickIntentMigration = isV4
    ? readV4ClickIntentMigration(stored.v4ClickIntentMigration)
    : isV3
      ? {
          removedActiveIntentCount: pendingSubmissionIntents.filter(isActiveLegacyIntent).length,
          migratedAt: options.now,
          sourceProtocolVersion: 3 as const,
          targetProtocolVersion: CAPTURE_PROTOCOL_VERSION,
          reason: "click_only_intents_not_server_confirmed" as const,
        }
      : undefined;
  const confirmed = isV4 ? readConfirmedSubmissionState(stored) : { confirmed: [], tombstones: [] };
  const base = {
    installationId,
    captureCredential: readNonemptyString(stored.captureCredential),
    captureEnabled: stored.captureEnabled !== false,
    captureEndpoint: readCaptureEndpoint(endpoint.endpoint),
    captureProtocolVersion: CAPTURE_PROTOCOL_VERSION,
    transientSessionEvidence: isV4 ? readTransientSessionEvidenceState(stored) : undefined,
    confirmedSubmissions: confirmed.confirmed,
    confirmedSubmissionTombstones: confirmed.tombstones,
    ...(v4ClickIntentMigration === undefined ? {} : { v4ClickIntentMigration }),
    captureOutbox: isBundleProtocol
      ? sanitizeCaptureOutboxRecords(stored.captureOutbox)
      : [],
    captureQuarantine: isBundleProtocol
      ? sanitizeCaptureQuarantineRecords(stored.captureQuarantine)
      : [],
    ...(lastCaptureError === undefined ? {} : { lastCaptureError }),
    discardedPreBundleEventCount,
    shouldRemoveLegacyEventQueue: !isBundleProtocol || rawQueue.length > 0,
    shouldRemovePendingSubmissionIntents: Object.hasOwn(stored, "pendingSubmissionIntents"),
    shouldRemoveLastCaptureError: Object.hasOwn(stored, "lastCaptureError")
      && lastCaptureError === undefined,
  };
  return preBundleQueueDiscardedAt === undefined
    ? base
    : { ...base, preBundleQueueDiscardedAt };
}

function isActiveLegacyIntent(value: unknown): boolean {
  return typeof value === "object"
    && value !== null
    && "status" in value
    && value.status === "active";
}

/**
 * Local-only items: durable state written to chrome.storage.local.
 * Session evidence is intentionally excluded.
 */
export function extensionInitializationLocalStorage(
  plan: ExtensionInitializationPlan,
): Record<string, unknown> {
  return {
    installationId: plan.installationId,
    ...(plan.captureCredential === undefined
      ? {}
      : { captureCredential: plan.captureCredential }),
    captureEnabled: plan.captureEnabled,
    captureEndpoint: plan.captureEndpoint,
    captureProtocolVersion: plan.captureProtocolVersion,
    confirmedSubmissions: plan.confirmedSubmissions,
    confirmedSubmissionTombstones: plan.confirmedSubmissionTombstones,
    ...(plan.v4ClickIntentMigration === undefined
      ? {}
      : { v4ClickIntentMigration: plan.v4ClickIntentMigration }),
    captureOutbox: plan.captureOutbox,
    captureQuarantine: plan.captureQuarantine,
    ...(plan.lastCaptureError === undefined ? {} : { lastCaptureError: plan.lastCaptureError }),
    discardedPreBundleEventCount: plan.discardedPreBundleEventCount,
    ...(plan.preBundleQueueDiscardedAt === undefined
      ? {}
      : { preBundleQueueDiscardedAt: plan.preBundleQueueDiscardedAt }),
  };
}

/**
 * Session-only items: transient evidence written to chrome.storage.session.
 * Local durable state is intentionally excluded.
 */
export function extensionInitializationSessionStorage(
  plan: ExtensionInitializationPlan,
): Record<string, unknown> {
  if (plan.transientSessionEvidence === undefined) return {};
  return {
    uiHints: plan.transientSessionEvidence.uiHints,
    transientE1: plan.transientSessionEvidence.requestLifecycles,
    transientPageContexts: plan.transientSessionEvidence.pageContexts,
    transientUnmatchedE3: plan.transientSessionEvidence.unmatchedE3,
    transientVerdictCandidates: plan.transientSessionEvidence.verdictCandidates,
    transientAmbiguityDiagnostics: plan.transientSessionEvidence.ambiguityDiagnostics,
  };
}

/**
 * Combined legacy view (local + session). Used by callers that merge both
 * areas into a single Record before passing to planExtensionInitialization.
 */
export function extensionInitializationStorage(
  plan: ExtensionInitializationPlan,
): Record<string, unknown> {
  return {
    ...extensionInitializationLocalStorage(plan),
    ...extensionInitializationSessionStorage(plan),
  };
}

/**
 * Local storage keys used by initialization. Must include
 * confirmedSubmissionTombstones so the apply diff never silently drops the
 * existing tombstone array.
 */
export const LOCAL_INITIALIZATION_KEYS: readonly string[] = [
  "installationId",
  "captureCredential",
  "captureEnabled",
  "captureEndpoint",
  "captureProtocolVersion",
  "confirmedSubmissions",
  "confirmedSubmissionTombstones",
  "captureOutbox",
  "captureQuarantine",
  "lastCaptureError",
  "v4ClickIntentMigration",
  "discardedPreBundleEventCount",
  "preBundleQueueDiscardedAt",
];

export const SESSION_INITIALIZATION_KEYS: readonly string[] = [
  "uiHints",
  "transientE1",
  "transientPageContexts",
  "transientUnmatchedE3",
  "transientVerdictCandidates",
  "transientAmbiguityDiagnostics",
];

export async function applyExtensionInitialization(
  storage: ExtensionInitializationStorage,
  plan: ExtensionInitializationPlan,
): Promise<void> {
  if (storage.get !== undefined) {
    const prior = await storage.get(LOCAL_INITIALIZATION_KEYS);
    const items = buildDiffItems(
      extensionInitializationLocalStorage(plan),
      prior,
      ["confirmedSubmissionTombstones"],
    );
    if (Object.keys(items).length > 0) await storage.set(items);
  } else {
    // Legacy fallback: write the full combined initialization record.
    // This path only supports first-authoritative migration; use
    // applyExtensionInitializationSplit for incremental diff updates.
    await storage.set(extensionInitializationStorage(plan));
  }
  if (plan.shouldRemovePendingSubmissionIntents) {
    await storage.remove("pendingSubmissionIntents");
  }
  if (plan.shouldRemoveLastCaptureError) await storage.remove("lastCaptureError");
  if (plan.shouldRemoveLegacyEventQueue) await storage.remove("eventQueue");
  await storage.remove("outbox");
  await storage.remove("quarantine");
}

/**
 * Split-aware apply: writes transient evidence to chrome.storage.session and
 * durable delivery / pairing / confirmed / tombstones to chrome.storage.local.
 * Reads prior state from each area, computes a per-area diff, and writes only
 * keys whose plan value differs from the prior read. The local diff preserves
 * an existing confirmedSubmissionTombstones array when the caller forgot to
 * pass tombstones into the plan input.
 */
export async function applyExtensionInitializationSplit(
  storage: ExtensionInitializationStorageSplit,
  plan: ExtensionInitializationPlan,
): Promise<void> {
  const [priorLocal, priorSession] = await Promise.all([
    storage.local.get(LOCAL_INITIALIZATION_KEYS),
    storage.session.get(SESSION_INITIALIZATION_KEYS),
  ]);
  const localItems = buildDiffItems(
    extensionInitializationLocalStorage(plan),
    priorLocal,
    ["confirmedSubmissionTombstones"],
  );
  if (Object.keys(localItems).length > 0) await storage.local.set(localItems);
  const sessionItems = buildDiffItems(
    extensionInitializationSessionStorage(plan),
    priorSession,
    [],
  );
  if (Object.keys(sessionItems).length > 0) await storage.session.set(sessionItems);
  if (plan.shouldRemovePendingSubmissionIntents) {
    await storage.local.remove("pendingSubmissionIntents");
  }
  if (plan.shouldRemoveLastCaptureError) await storage.local.remove("lastCaptureError");
  if (plan.shouldRemoveLegacyEventQueue) await storage.local.remove("eventQueue");
  await storage.local.remove("outbox");
  await storage.local.remove("quarantine");
}

function buildDiffItems(
  planItems: Record<string, unknown>,
  prior: Record<string, unknown>,
  preserveKeys: readonly string[],
): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(planItems)) {
    const priorValue = prior[key];
    let next: unknown = value;
    if (preserveKeys.includes(key)) {
      const planArr = Array.isArray(value) ? value : [];
      const priorArr = Array.isArray(priorValue) ? priorValue : [];
      next = planArr.length > 0 ? planArr : priorArr;
    }
    if (!deepEqual(priorValue, next)) {
      result[key] = next;
    }
  }
  return result;
}

function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== typeof b) return false;
  if (a === null || b === null) return false;
  if (typeof a !== "object") return false;
  const aArray = Array.isArray(a);
  const bArray = Array.isArray(b);
  if (aArray !== bArray) return false;
  if (aArray) {
    const aArr = a as readonly unknown[];
    const bArr = b as readonly unknown[];
    if (aArr.length !== bArr.length) return false;
    for (let i = 0; i < aArr.length; i++) {
      if (!deepEqual(aArr[i], bArr[i])) return false;
    }
    return true;
  }
  const aRec = a as Record<string, unknown>;
  const bRec = b as Record<string, unknown>;
  const aKeys = Object.keys(aRec);
  const bKeys = Object.keys(bRec);
  if (aKeys.length !== bKeys.length) return false;
  for (const k of aKeys) {
    if (!deepEqual(aRec[k], bRec[k])) return false;
  }
  return true;
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
  return typeof value === "number" && Number.isInteger(value) && value >= 0 ? value : 0;
}

function readNonemptyString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function readV4ClickIntentMigration(value: unknown): V4ClickIntentMigration | undefined {
  if (typeof value !== "object" || value === null) return undefined;
  if (
    !("removedActiveIntentCount" in value)
    || typeof value.removedActiveIntentCount !== "number"
    || !Number.isInteger(value.removedActiveIntentCount)
    || value.removedActiveIntentCount < 0
  ) return undefined;
  if (!("migratedAt" in value) || typeof value.migratedAt !== "string"
    || value.migratedAt.length === 0) return undefined;
  if (!("sourceProtocolVersion" in value) || value.sourceProtocolVersion !== 3) return undefined;
  if (!("targetProtocolVersion" in value) || value.targetProtocolVersion !== 4) return undefined;
  if (!("reason" in value) || value.reason !== "click_only_intents_not_server_confirmed") return undefined;
  return {
    removedActiveIntentCount: value.removedActiveIntentCount,
    migratedAt: value.migratedAt,
    sourceProtocolVersion: value.sourceProtocolVersion,
    targetProtocolVersion: value.targetProtocolVersion,
    reason: value.reason,
  };
}
