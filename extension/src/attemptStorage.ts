import { CaptureAttemptBundleSchema, type CaptureAttemptBundle } from "@/lib/capture/attemptBundle";
import type { CaptureProvenanceLevel } from "@/lib/domain/captureCredential";
import {
  PARSER_VERSION,
  type PendingSubmissionIntent,
  type SubmissionIntentDraft,
  type VerdictCandidateMessage,
} from "./attemptCapture";

export const SUBMISSION_INTENT_TTL_MS = 24 * 60 * 60 * 1000;

export type CaptureOutboxItem = {
  readonly id: string;
  readonly kind: "attempt_bundle";
  readonly bundle: CaptureAttemptBundle;
  readonly attempts: number;
  readonly createdAt: string;
  readonly nextAttemptAt?: string;
  readonly automaticRetryBlocked?: boolean;
};

export type CaptureQuarantineItem = {
  readonly id: string;
  readonly item: CaptureOutboxItem;
  readonly error: string;
  readonly quarantinedAt: string;
};

export function isCaptureOutboxItem(value: unknown): value is CaptureOutboxItem {
  if (typeof value !== "object" || value === null) return false;
  const id = readStoredString(Reflect.get(value, "id"));
  const kind = Reflect.get(value, "kind");
  const bundle = Reflect.get(value, "bundle");
  const parsedBundle = CaptureAttemptBundleSchema.safeParse(bundle);
  const attempts = Reflect.get(value, "attempts");
  const createdAt = Reflect.get(value, "createdAt");
  const nextAttemptAt = Reflect.get(value, "nextAttemptAt");
  const automaticRetryBlocked = Reflect.get(value, "automaticRetryBlocked");
  return id !== undefined
    && kind === "attempt_bundle"
    && parsedBundle.success
    && id === parsedBundle.data.bundleId
    && parsedBundle.data.events.every((event) => isStoredTimestamp(event.occurredAt))
    && typeof attempts === "number"
    && Number.isInteger(attempts)
    && attempts >= 0
    && isStoredTimestamp(createdAt)
    && (nextAttemptAt === undefined || isStoredTimestamp(nextAttemptAt))
    && (automaticRetryBlocked === undefined || typeof automaticRetryBlocked === "boolean");
}

export function isCaptureQuarantineItem(value: unknown): value is CaptureQuarantineItem {
  if (typeof value !== "object" || value === null) return false;
  const id = readStoredString(Reflect.get(value, "id"));
  const item = Reflect.get(value, "item");
  return id !== undefined
    && isCaptureOutboxItem(item)
    && id === item.id
    && readStoredString(Reflect.get(value, "error")) !== undefined
    && isStoredTimestamp(Reflect.get(value, "quarantinedAt"));
}

function readStoredString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function isStoredTimestamp(value: unknown): value is string {
  if (typeof value !== "string" || value.length === 0) return false;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) && new Date(parsed).toISOString() === value;
}

export function submissionIntentKey(
  intent: Pick<SubmissionIntentDraft, "installationId" | "platform" | "problemExternalId">,
): string {
  return `${intent.installationId}:${intent.platform}:${intent.problemExternalId}`;
}

export function recordSubmissionIntent(
  intents: readonly PendingSubmissionIntent[],
  draft: SubmissionIntentDraft,
  sourceDocumentId?: string,
): readonly PendingSubmissionIntent[] {
  const key = submissionIntentKey(draft);
  const superseded = intents.map((intent) =>
    intent.status === "active" && submissionIntentKey(intent) === key
      ? { ...intent, status: "superseded" as const }
      : intent);
  return [...superseded, {
    ...draft,
    ...(sourceDocumentId === undefined ? {} : { sourceDocumentId }),
    status: "active" as const,
  }];
}

export function expireSubmissionIntents(
  intents: readonly PendingSubmissionIntent[],
  now: string,
): readonly PendingSubmissionIntent[] {
  const nowMs = Date.parse(now);
  return intents.map((intent) =>
    intent.status === "active"
      && nowMs - Date.parse(intent.occurredAt) > SUBMISSION_INTENT_TTL_MS
      ? { ...intent, status: "expired" as const }
      : intent);
}

export function consumeVerdictCandidate(input: {
  readonly intents: readonly PendingSubmissionIntent[];
  readonly candidate: VerdictCandidateMessage["candidate"];
  readonly installationId: string;
  readonly provenanceLevel: CaptureProvenanceLevel;
}): {
  readonly intents: readonly PendingSubmissionIntent[];
  readonly outboxItem?: CaptureOutboxItem;
} {
  const candidate = input.candidate;
  const index = input.intents.findIndex((intent) =>
    intent.status === "active"
      && intent.installationId === input.installationId
      && intent.platform === candidate.platform
      && intent.problemExternalId === candidate.problemExternalId);
  if (index < 0) return { intents: input.intents };
  const intent = input.intents[index];
  if (intent === undefined) return { intents: input.intents };
  const elapsedMs = Date.parse(candidate.observedAt) - Date.parse(intent.occurredAt);
  if (!Number.isFinite(elapsedMs) || elapsedMs < 0 || elapsedMs > SUBMISSION_INTENT_TTL_MS) {
    return { intents: input.intents };
  }
  if (
    candidate.transitionEvidence === "exact_result_document"
    && (intent.sourceDocumentId === undefined
      || candidate.sourceDocumentId === undefined
      || intent.sourceDocumentId === candidate.sourceDocumentId)
  ) {
    return { intents: input.intents };
  }
  if (
    candidate.transitionEvidence === "same_document_transition"
    && intent.sourceDocumentId !== undefined
    && candidate.sourceDocumentId !== undefined
    && intent.sourceDocumentId !== candidate.sourceDocumentId
  ) {
    return { intents: input.intents };
  }
  const bundle = buildCaptureAttemptBundle(intent, candidate, input.provenanceLevel);
  return {
    intents: input.intents.filter((_value, intentIndex) => intentIndex !== index),
    outboxItem: {
      id: bundle.bundleId,
      kind: "attempt_bundle",
      bundle,
      attempts: 0,
      createdAt: candidate.observedAt,
    },
  };
}

export function buildCaptureAttemptBundle(
  intent: PendingSubmissionIntent,
  candidate: VerdictCandidateMessage["candidate"],
  provenanceLevel: CaptureProvenanceLevel,
): CaptureAttemptBundle {
  const pageOrigin = new URL(intent.canonicalUrl).origin;
  const common = {
    schemaVersion: 2 as const,
    captureSessionId: intent.captureSessionId,
    installationId: intent.installationId,
    adapterVersion: "atomic-bundle@0.1.0",
    parserVersion: PARSER_VERSION,
    pageOrigin,
    provenanceLevel,
    platform: intent.platform,
    problemExternalId: intent.problemExternalId,
    problemTitle: intent.problemTitle,
    canonicalUrl: intent.canonicalUrl,
  };
  return CaptureAttemptBundleSchema.parse({
    schemaVersion: 1,
    bundleId: `bundle_${intent.submissionId}`,
    events: [
      {
        ...common,
        id: `event_${intent.submissionId}_started`,
        type: "SESSION_STARTED",
        occurredAt: intent.occurredAt,
        payload: { source: "content_script" },
      },
      {
        ...common,
        id: `event_${intent.submissionId}_submitted`,
        type: "SUBMISSION_OBSERVED",
        submissionId: intent.submissionId,
        occurredAt: intent.occurredAt,
        payload: { action: "submit_clicked" },
      },
      {
        ...common,
        id: `event_${intent.submissionId}_verdict`,
        type: "VERDICT_OBSERVED",
        submissionId: intent.submissionId,
        occurredAt: candidate.observedAt,
        payload: { verdict: candidate.verdict },
      },
      {
        ...common,
        id: `event_${intent.submissionId}_ended`,
        type: "SESSION_ENDED",
        occurredAt: candidate.observedAt,
        payload: { endReason: "capture_disabled" },
      },
    ],
  });
}

export function retryQuarantined(
  outbox: readonly CaptureOutboxItem[],
  quarantine: readonly CaptureQuarantineItem[],
  id: string,
): { readonly outbox: readonly CaptureOutboxItem[]; readonly quarantine: readonly CaptureQuarantineItem[] } {
  const selected = quarantine.find((entry) => entry.id === id);
  if (selected === undefined) return { outbox, quarantine };
  return {
    outbox: [...outbox, {
      ...selected.item,
      attempts: 0,
      nextAttemptAt: undefined,
      automaticRetryBlocked: undefined,
    }],
    quarantine: quarantine.filter((entry) => entry.id !== id),
  };
}

export function deleteQuarantined(
  quarantine: readonly CaptureQuarantineItem[],
  id: string,
): { readonly quarantine: readonly CaptureQuarantineItem[]; readonly deletedCount: number } {
  const next = quarantine.filter((entry) => entry.id !== id);
  return { quarantine: next, deletedCount: quarantine.length - next.length };
}
