import { CaptureAttemptBundleSchema } from "@/lib/capture/attemptBundle";
import {
  isCaptureOutboxItem,
  isCaptureQuarantineItem,
  type CaptureOutboxItem,
  type CaptureQuarantineItem,
} from "./attemptStorage";

const SAFE_CAPTURE_ERRORS = new Set([
  "ACK mismatch: invalid response",
  "ACK mismatch: bundle identity",
  "Network request failed",
  "malformed retained bundle",
  "Storage capacity reached: completed result was not persisted",
  "epoch_control_malformed",
  "epoch_target_delivery_failed",
  "epoch_started_missing",
  "epoch_baseline_missing",
  "epoch_identity_conflict",
  "epoch_timestamp_conflict",
  "epoch_capacity_exceeded",
  "epoch_result_surface_unchanged",
  "verdict_candidate_adapter_rejected",
  "verdict_candidate_chronology_mismatch",
  "unsupported_capture_endpoint",
  "unsupported_browser",
  "capture_recovery_capacity_exceeded",
  "capture_recovery_failed",
  "initialization_failed",
  "persistence_failed",
]);

const SAFE_CAPTURE_ERROR_PATTERNS: readonly RegExp[] = [
  /^HTTP [1-5][0-9]{2}$/u,
  /^Isolated result: HTTP [1-5][0-9]{2}$/u,
  /^Pairing required: HTTP 401$/u,
  /^Origin rejected: HTTP 403$/u,
  /^Network unavailable: Network request failed$/u,
];

export function safeStoredCaptureError(value: unknown): string | undefined {
  if (typeof value !== "string" || value.length === 0) return undefined;
  if (SAFE_CAPTURE_ERRORS.has(value) || SAFE_CAPTURE_ERROR_PATTERNS.some((pattern) => pattern.test(value))) {
    return value;
  }
  return "Retained capture error";
}

export function safeQuarantineSummary(value: unknown): string {
  void value;
  return "Retained quarantine diagnostic";
}

function safeRetainedId(value: unknown): string | undefined {
  return typeof value === "string" && /^[A-Za-z0-9_.:-]{1,200}$/u.test(value) ? value : undefined;
}

function sanitizeOutboxItem(value: CaptureOutboxItem): CaptureOutboxItem | undefined {
  const parsedBundle = CaptureAttemptBundleSchema.safeParse(value.bundle);
  if (!parsedBundle.success) return undefined;
  return {
    id: parsedBundle.data.bundleId,
    kind: "attempt_bundle",
    bundle: parsedBundle.data,
    attempts: value.attempts,
    createdAt: value.createdAt,
    ...(value.nextAttemptAt === undefined ? {} : { nextAttemptAt: value.nextAttemptAt }),
    ...(value.automaticRetryBlocked === undefined
      ? {}
      : { automaticRetryBlocked: value.automaticRetryBlocked }),
  };
}

function safeRetainedTimestamp(value: unknown): string | undefined {
  if (typeof value !== "string" || !Number.isFinite(Date.parse(value))) return undefined;
  return new Date(Date.parse(value)).toISOString() === value ? value : undefined;
}

function malformedRetainedRecord(value: unknown, includeError: boolean): Readonly<Record<string, unknown>> {
  const id = typeof value === "object" && value !== null
    ? safeRetainedId(Reflect.get(value, "id"))
    : undefined;
  const quarantinedAt = includeError && typeof value === "object" && value !== null
    ? safeRetainedTimestamp(Reflect.get(value, "quarantinedAt"))
    : undefined;
  return {
    ...(id === undefined ? {} : { id }),
    ...(includeError ? { error: "malformed retained bundle" } : {}),
    ...(quarantinedAt === undefined ? {} : { quarantinedAt }),
  };
}

export function sanitizeCaptureOutboxRecords(value: unknown): readonly unknown[] {
  if (!Array.isArray(value)) return [];
  return value.map((candidate) => {
    if (isCaptureOutboxItem(candidate)) {
      return sanitizeOutboxItem(candidate) ?? malformedRetainedRecord(candidate, false);
    }
    return malformedRetainedRecord(candidate, false);
  });
}

export function sanitizeCaptureQuarantineRecords(value: unknown): readonly unknown[] {
  if (!Array.isArray(value)) return [];
  return value.map((candidate) => {
    if (!isCaptureQuarantineItem(candidate)) return malformedRetainedRecord(candidate, true);
    const item = sanitizeOutboxItem(candidate.item);
    if (item === undefined) return malformedRetainedRecord(candidate, true);
    return {
      id: item.id,
      item,
      error: safeStoredCaptureError(candidate.error) ?? "Retained capture error",
      quarantinedAt: candidate.quarantinedAt,
    } satisfies CaptureQuarantineItem;
  });
}
