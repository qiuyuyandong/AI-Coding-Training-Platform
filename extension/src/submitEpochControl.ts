/**
 * LeetCode submit-epoch control plane.
 *
 * This module is deliberately Chrome/storage/DOM free. It owns the closed
 * internal message contract used to arm a content runtime before a network
 * submit and to confirm that exact epoch after E2 persistence. Its delivery
 * seam accepts an injected sender so routing remains behavior-testable.
 */

export const LEETCODE_SUBMIT_EPOCH_STARTED = "LEETCODE_SUBMIT_EPOCH_STARTED" as const;
export const LEETCODE_SUBMIT_EPOCH_CONFIRMED = "LEETCODE_SUBMIT_EPOCH_CONFIRMED" as const;
export const SUBMIT_EPOCH_SCHEMA_VERSION = 1 as const;
export const SUBMIT_EPOCH_MAX_ENTRIES = 32 as const;
export const SUBMIT_EPOCH_TTL_MS = 5 * 60 * 1000;

export type SubmitEpochDiagnostic =
  | "epoch_control_malformed"
  | "epoch_target_delivery_failed"
  | "epoch_started_missing"
  | "epoch_baseline_missing"
  | "epoch_identity_conflict"
  | "epoch_timestamp_conflict"
  | "epoch_capacity_exceeded"
  | "epoch_result_surface_unchanged"
  | "verdict_candidate_adapter_rejected"
  | "verdict_candidate_chronology_mismatch";

export type LeetCodeSubmitEpochStartedMessage = Readonly<{
  readonly type: typeof LEETCODE_SUBMIT_EPOCH_STARTED;
  readonly schemaVersion: 1;
  readonly platform: "leetcode";
  readonly problemExternalId: string;
  readonly submitRequestId: string;
  readonly receivedAt: string;
}>;

export type LeetCodeSubmitEpochConfirmedMessage = Readonly<{
  readonly type: typeof LEETCODE_SUBMIT_EPOCH_CONFIRMED;
  readonly schemaVersion: 1;
  readonly platform: "leetcode";
  readonly problemExternalId: string;
  readonly submitRequestId: string;
  readonly confirmedAt: string;
  /** Exact trusted E0 used only when the stable result request is the root. */
  readonly actionObservedAt?: string;
  /** Stable result identities observed at or before that trusted action. */
  readonly baselineSubmissionIds?: readonly string[];
}>;

export type LeetCodeSubmitEpochControlMessage =
  | LeetCodeSubmitEpochStartedMessage
  | LeetCodeSubmitEpochConfirmedMessage;

/** Closed response returned by the content runtime to the exact sender. */
export type SubmitEpochControlResponse = Readonly<{
  readonly ok: true;
}> | Readonly<{
  readonly ok: false;
  readonly diagnostic: SubmitEpochDiagnostic;
}>;

export type SubmitEpochDeliveryTarget = Readonly<{
  readonly tabId: number;
  readonly frameId: number;
  readonly documentId: string;
}>;

export type SubmitEpochMessageSendOptions = Readonly<{
  readonly frameId: number;
  readonly documentId: string;
}>;

export type SubmitEpochDeliveryDependencies = Readonly<{
  readonly sendMessage: (
    tabId: number,
    message: LeetCodeSubmitEpochControlMessage,
    options: SubmitEpochMessageSendOptions,
  ) => Promise<unknown>;
  readonly recordDiagnostic: (reason: SubmitEpochDiagnostic) => Promise<void> | void;
}>;

export type SubmitEpochDeliveryResult =
  | "delivered"
  | "diagnostic"
  | "skipped_persistence";

export type SubmitEpochPersistenceDeliveryDependencies = Readonly<{
  readonly persist: () => Promise<boolean>;
  readonly deliver: () => Promise<void>;
}>;

/** Persists E2 before allowing the exact CONFIRMED control delivery. */
export async function persistThenDeliverSubmitEpochConfirmed(
  dependencies: SubmitEpochPersistenceDeliveryDependencies,
): Promise<"delivered" | "skipped_persistence"> {
  if (!await dependencies.persist()) return "skipped_persistence";
  await dependencies.deliver();
  return "delivered";
}

export type ParsedSubmitEpochControlMessage =
  | { readonly ok: true; readonly value: LeetCodeSubmitEpochControlMessage }
  | { readonly ok: false; readonly reason: "epoch_control_malformed" };

const CONTROL_CHAR_PATTERN = /[\u0000-\u001f\u007f]/u;
const IDENTITY_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,199}$/u;
const PROBLEM_PATTERN = /^[a-z0-9][a-z0-9-]{0,127}$/u;

/**
 * Canonical UTC date-time parser shared by both control messages.  The
 * round-trip check rejects impossible Gregorian dates as well as alternate
 * offsets, omitted milliseconds, and extra whitespace.
 */
export function isCanonicalSubmitEpochTimestamp(value: unknown): value is string {
  if (typeof value !== "string" || CONTROL_CHAR_PATTERN.test(value)) return false;
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u.test(value)) return false;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) && new Date(parsed).toISOString() === value;
}

function ownKeysExactly(value: object, keys: readonly string[]): boolean {
  const actual = Reflect.ownKeys(value);
  return actual.length === keys.length && keys.every((key) => actual.includes(key));
}

function validProblemExternalId(value: unknown): value is string {
  return typeof value === "string"
    && value.length > 0
    && value.length <= 128
    && !CONTROL_CHAR_PATTERN.test(value)
    && PROBLEM_PATTERN.test(value);
}

function validSubmitRequestId(value: unknown): value is string {
  return typeof value === "string"
    && value.length > 0
    && value.length <= 200
    && !CONTROL_CHAR_PATTERN.test(value)
    && IDENTITY_PATTERN.test(value);
}

function validCommonFields(value: object, type: LeetCodeSubmitEpochControlMessage["type"]): boolean {
  return Reflect.get(value, "type") === type
    && Reflect.get(value, "schemaVersion") === SUBMIT_EPOCH_SCHEMA_VERSION
    && Reflect.get(value, "platform") === "leetcode"
    && validProblemExternalId(Reflect.get(value, "problemExternalId"))
    && validSubmitRequestId(Reflect.get(value, "submitRequestId"));
}

/** Strictly parse a control message before any DOM observation. */
export function parseLeetCodeSubmitEpochControlMessage(
  value: unknown,
): ParsedSubmitEpochControlMessage {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return { ok: false, reason: "epoch_control_malformed" };
  }
  if (Reflect.get(value, "type") === LEETCODE_SUBMIT_EPOCH_STARTED) {
    if (!ownKeysExactly(value, [
      "type", "schemaVersion", "platform", "problemExternalId", "submitRequestId", "receivedAt",
    ]) || !validCommonFields(value, LEETCODE_SUBMIT_EPOCH_STARTED)
      || !isCanonicalSubmitEpochTimestamp(Reflect.get(value, "receivedAt"))) {
      return { ok: false, reason: "epoch_control_malformed" };
    }
    return {
      ok: true,
      value: Object.freeze({
        type: LEETCODE_SUBMIT_EPOCH_STARTED,
        schemaVersion: 1,
        platform: "leetcode",
        problemExternalId: Reflect.get(value, "problemExternalId") as string,
        submitRequestId: Reflect.get(value, "submitRequestId") as string,
        receivedAt: Reflect.get(value, "receivedAt") as string,
      }),
    };
  }
  if (Reflect.get(value, "type") === LEETCODE_SUBMIT_EPOCH_CONFIRMED) {
    const actionObservedAt = Reflect.get(value, "actionObservedAt");
    const baselineSubmissionIds = Reflect.get(value, "baselineSubmissionIds");
    const confirmedAt = Reflect.get(value, "confirmedAt");
    const hasActionObservedAt = Object.prototype.hasOwnProperty.call(value, "actionObservedAt");
    const hasBaselineSubmissionIds = Object.prototype.hasOwnProperty.call(value, "baselineSubmissionIds");
    const keys = hasActionObservedAt
      ? ["type", "schemaVersion", "platform", "problemExternalId", "submitRequestId", "confirmedAt", "actionObservedAt", "baselineSubmissionIds"]
      : ["type", "schemaVersion", "platform", "problemExternalId", "submitRequestId", "confirmedAt"];
    if (!ownKeysExactly(value, keys)
      || !validCommonFields(value, LEETCODE_SUBMIT_EPOCH_CONFIRMED)
      || !isCanonicalSubmitEpochTimestamp(confirmedAt)
      || hasActionObservedAt !== hasBaselineSubmissionIds
      || (hasActionObservedAt && !isCanonicalSubmitEpochTimestamp(actionObservedAt))
      || (hasActionObservedAt && Date.parse(String(actionObservedAt)) > Date.parse(String(confirmedAt)))
      || (hasBaselineSubmissionIds && (!Array.isArray(baselineSubmissionIds)
        || baselineSubmissionIds.length > SUBMIT_EPOCH_MAX_ENTRIES
        || !baselineSubmissionIds.every((entry) =>
          typeof entry === "string" && /^(?:cn|com)\/[0-9]{1,20}$/u.test(entry))
        || new Set(baselineSubmissionIds).size !== baselineSubmissionIds.length))) {
      return { ok: false, reason: "epoch_control_malformed" };
    }
    return {
      ok: true,
      value: Object.freeze({
        type: LEETCODE_SUBMIT_EPOCH_CONFIRMED,
        schemaVersion: 1,
        platform: "leetcode",
        problemExternalId: Reflect.get(value, "problemExternalId") as string,
        submitRequestId: Reflect.get(value, "submitRequestId") as string,
        confirmedAt: confirmedAt as string,
        ...(hasActionObservedAt ? { actionObservedAt: actionObservedAt as string } : {}),
        ...(hasBaselineSubmissionIds
          ? { baselineSubmissionIds: Object.freeze([...(baselineSubmissionIds as string[])]) }
          : {}),
      }),
    };
  }
  return { ok: false, reason: "epoch_control_malformed" };
}

/** Platform-specific name aliases kept intentionally small for call sites. */
export const parseSubmitEpochControlMessage = parseLeetCodeSubmitEpochControlMessage;

export function isLeetCodeSubmitEpochControlMessage(
  value: unknown,
): value is LeetCodeSubmitEpochControlMessage {
  return parseLeetCodeSubmitEpochControlMessage(value).ok;
}

export const isSubmitEpochControlMessage = isLeetCodeSubmitEpochControlMessage;

/** Parse only the closed, identity-free response from a content runtime. */
export function isSubmitEpochControlResponse(value: unknown): value is SubmitEpochControlResponse {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const keys = Reflect.ownKeys(value);
  const ok = Reflect.get(value, "ok");
  if (ok === true) {
    return keys.length === 1 && keys.includes("ok");
  }
  return keys.length === 2
    && keys.includes("ok")
    && keys.includes("diagnostic")
    && ok === false
    && isSubmitEpochDiagnostic(Reflect.get(value, "diagnostic"));
}

export function isSubmitEpochDiagnostic(value: unknown): value is SubmitEpochDiagnostic {
  return typeof value === "string" && [
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
  ].includes(value);
}

/** A fixed response for malformed control payloads; it contains no identity. */
export function malformedSubmitEpochResponse(): SubmitEpochControlResponse {
  return Object.freeze({ ok: false, diagnostic: "epoch_control_malformed" });
}

export function acceptedSubmitEpochResponse(): SubmitEpochControlResponse {
  return Object.freeze({ ok: true });
}

export function diagnosticSubmitEpochResponse(
  diagnostic: SubmitEpochDiagnostic,
): SubmitEpochControlResponse {
  return Object.freeze({ ok: false, diagnostic });
}

/**
 * Exact, dependency-injected delivery seam.  It performs one send attempt
 * only, never retries or broadens the target, and reports fixed diagnostics
 * through the caller-owned orchestrator path.
 */
export async function deliverLeetCodeSubmitEpochControl(
  target: SubmitEpochDeliveryTarget,
  message: LeetCodeSubmitEpochControlMessage,
  dependencies: SubmitEpochDeliveryDependencies,
  persistenceComplete = true,
): Promise<SubmitEpochDeliveryResult> {
  if (!persistenceComplete) return "skipped_persistence";
  if (typeof target !== "object" || target === null
    || !Number.isInteger(target.tabId) || target.tabId < 0
    || !Number.isInteger(target.frameId) || target.frameId < 0
    || typeof target.documentId !== "string" || target.documentId.length === 0) {
    await dependencies.recordDiagnostic("epoch_target_delivery_failed");
    return "diagnostic";
  }
  try {
    const response = await dependencies.sendMessage(
      target.tabId,
      message,
      { frameId: target.frameId, documentId: target.documentId },
    );
    if (!isSubmitEpochControlResponse(response)) {
      await dependencies.recordDiagnostic("epoch_target_delivery_failed");
      return "diagnostic";
    }
    if (response.ok === false) {
      await dependencies.recordDiagnostic(response.diagnostic);
      return "diagnostic";
    }
    return "delivered";
  } catch {
    await dependencies.recordDiagnostic("epoch_target_delivery_failed");
    return "diagnostic";
  }
}
