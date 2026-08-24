/**
 * Pure, privacy-bounded contracts for the Phase D live observation harness.
 *
 * This module deliberately does not import extension runtime code.  The
 * browser-facing observer in v4-live-observation.mjs mirrors these closed
 * projections because the persistent extension page must own the
 * chrome.storage.onChanged subscriptions.
 */

import { lstatSync, realpathSync } from "node:fs";
import { isAbsolute, relative, resolve } from "node:path";

export const APPROVED_NOWCODER_PATH = "/acm/contest/18839/1001";
export const BLOCKED_NOWCODER_PATH = "/acm/problem/319811";

export const LOCAL_TRIGGER_KEYS = Object.freeze([
  "confirmedSubmissions",
  "confirmedSubmissionTombstones",
  "captureOutbox",
  "captureQuarantine",
  "lastCaptureError",
  "lastSuccessfulCaptureAt",
]);

export const SESSION_TRIGGER_KEYS = Object.freeze([
  "uiHints",
  "transientE1",
  "transientPageContexts",
  "transientUnmatchedE3",
  "transientVerdictCandidates",
  "transientAmbiguityDiagnostics",
  "contentIngressReady",
  "contentIngressDiagnostics",
  "leetcodeEndpointDiagnostics",
]);

/**
 * Closed ignore lists: approved-namespace storage keys that are NOT capture
 * state. Batches may carry these keys by name only; their values are never
 * read, counted, or exported. Any key outside trigger ∪ ignored fails closed.
 */
export const IGNORED_SESSION_KEYS = Object.freeze([
  "b3WitnessState",
  "captureRecoveryRetryAttempt",
  "characterizationSession",
  "webRequestSpikeMarkers",
]);

export const IGNORED_LOCAL_KEYS = Object.freeze([
  "installationId",
  "captureCapability",
  "captureCapabilityVersion",
  "captureConnectionStatus",
  "connectedAt",
  "captureEnabled",
  "captureEndpoint",
  "captureProtocolVersion",
  "lastDeliveredAttemptId",
  "lastDeliveredAttemptStatus",
  "v4ClickIntentMigration",
  "discardedPreBundleEventCount",
  "preBundleQueueDiscardedAt",
  "pendingSubmissionIntents",
  "eventQueue",
  "outbox",
  "quarantine",
]);

export const EXACT_LOCAL_SNAPSHOT_KEYS = LOCAL_TRIGGER_KEYS;
export const EXACT_SESSION_SNAPSHOT_KEYS = SESSION_TRIGGER_KEYS;

const LOCAL_KEY_SET = new Set(LOCAL_TRIGGER_KEYS);
const SESSION_KEY_SET = new Set(SESSION_TRIGGER_KEYS);
const IGNORED_LOCAL_KEY_SET = new Set(IGNORED_LOCAL_KEYS);
const IGNORED_SESSION_KEY_SET = new Set(IGNORED_SESSION_KEYS);
const CONFIRMED_KEYS = new Set([
  "schemaVersion",
  "status",
  "platform",
  "problemExternalId",
  "externalSubmissionId",
  "confirmedAt",
  "storageKey",
  "lastE3At",
  "phase",
  "finalizedAt",
]);
const TOMBSTONE_KEYS = new Set(["submissionKey", "finalizedAt", "expiresAt"]);
const PLATFORMS = new Set(["leetcode", "nowcoder"]);
const KNOWN_PLATFORMS = new Set(["leetcode", "nowcoder", "luogu", "codeforces", "atcoder"]);
const UI_HINT_KEYS = new Set([
  "schemaVersion", "tier", "kind", "platform", "problemExternalId",
  "sourceDocumentId", "observedAt",
]);
const UI_HINT_REQUIRED_KEYS = new Set(UI_HINT_KEYS);
const LIFECYCLE_KEYS = new Set([
  "schemaVersion", "tier", "kind", "evidence", "outcome",
  "stableSubmissionId", "rejectionReason", "receivedAt",
]);
const E1_EVIDENCE_KEYS = new Set([
  "schemaVersion", "evidenceId", "platform", "tier", "kind", "receivedAt",
  "tabId", "frameId", "documentId", "adapterVersion", "apiTimeStamp",
  "requestId", "method", "endpointKey", "resourceType", "lifecycle",
  "statusCode", "redirectEndpointKey",
]);
const LIFECYCLE_REQUIRED_KEYS = new Set(LIFECYCLE_KEYS);
const E1_EVIDENCE_REQUIRED_KEYS = new Set([
  "schemaVersion", "evidenceId", "platform", "tier", "kind", "receivedAt",
  "tabId", "frameId", "documentId", "adapterVersion", "apiTimeStamp",
  "requestId", "method", "endpointKey", "resourceType", "lifecycle",
]);
const VALID_E1_METHODS = new Set(["GET", "POST", "PUT", "DELETE", "PATCH", "HEAD", "OPTIONS"]);
const VALID_E1_RESOURCES = new Set(["main_frame", "sub_frame", "xmlhttprequest", "other"]);
const VALID_E1_LIFECYCLES = new Set(["before_request", "before_redirect", "response_started", "completed", "error_occurred"]);
const SAFE_ENDPOINT = /^[A-Za-z0-9/_-]{1,256}$/u;
const SAFE_IDENTIFIER = /^[A-Za-z0-9_.:/-]{1,200}$/u;
const SAFE_STATUS = /^[A-Za-z0-9_.:-]{1,80}$/u;
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
]);
const SAFE_CAPTURE_ERROR_PATTERNS = Object.freeze([
  /^HTTP [1-5][0-9]{2}$/u,
  /^Isolated result: HTTP [1-5][0-9]{2}$/u,
  /^Capability rejected: HTTP 401$/u,
  /^Origin rejected: HTTP 403$/u,
  /^Network unavailable: Network request failed$/u,
]);
const FAILURE_SNAPSHOT_KEYS = new Set([
  "confirmed",
  "tombstones",
  "outbox",
  "quarantine",
  "lastCaptureError",
  "lastSuccessfulCaptureAt",
  "session",
  "target",
]);
const TARGET_COUNT_KEYS = new Set(["e0", "e1", "submit", "status", "statusConfirmedMatch"]);
const TARGET_IDENTITY_MEMORY = new WeakMap();
const CANDIDATE_RECEIPT_KEYS = new Set(["schemaVersion", "candidateSha", "extensionDist", "artifactHashes"]);
const CANDIDATE_ARTIFACT_KEYS = new Set([
  "manifest.json",
  "background.js",
  "content.js",
  "popup.js",
  "main-world-bridge.js",
]);
const CONNECTION_RECEIPT_KEYS = new Set([
  "schemaVersion",
  "candidateSha",
  "platform",
  "profileIdentity",
  "databaseIdentity",
  "vaultConfigIdentity",
  "extensionId",
  "installationIdentity",
  "captureCapabilityVersion",
  "candidateReceiptHash",
  "artifactHashes",
  "database",
  "connection",
  "preparedAt",
]);
const ZERO_DATABASE_KEYS = new Set([
  "captureEvents",
  "trainingSessions",
  "trainingAttempts",
]);

const objectValue = (value) => typeof value === "object" && value !== null;
const nonemptyString = (value) => typeof value === "string" && value.length > 0;
const canonicalIso = (value) => typeof value === "string"
  && Number.isFinite(Date.parse(value))
  && new Date(Date.parse(value)).toISOString() === value;

function hasOnlyKeys(value, allowed) {
  return objectValue(value) && Object.keys(value).every((key) => allowed.has(key));
}

function hasRequiredKeys(value, required) {
  return objectValue(value) && [...required].every((key) => Object.hasOwn(value, key));
}

function readRequiredDataProperties(value, required) {
  if (!objectValue(value)) return undefined;
  const values = {};
  for (const key of required) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (descriptor === undefined || !Object.hasOwn(descriptor, "value")) return undefined;
    values[key] = descriptor.value;
  }
  return values;
}

function readOptionalSafeString(value, field, pattern = SAFE_STATUS) {
  if (!Object.hasOwn(value, field)) return { ok: true, value: undefined };
  const fieldValue = value[field];
  if (fieldValue === undefined) return { ok: true, value: undefined };
  if (typeof fieldValue !== "string" || !pattern.test(fieldValue)) {
    return { ok: false };
  }
  return { ok: true, value: fieldValue };
}

function readCaptureError(value) {
  if (!Object.hasOwn(value, "lastCaptureError")) return { ok: true, value: undefined };
  const raw = value.lastCaptureError;
  if (raw === undefined) return { ok: true, value: undefined };
  if (typeof raw !== "string" || raw.length === 0) return { ok: false };
  if (SAFE_CAPTURE_ERRORS.has(raw) || SAFE_CAPTURE_ERROR_PATTERNS.some((pattern) => pattern.test(raw))) {
    return { ok: true, value: raw };
  }
  return { ok: false };
}

function readArray(value, field) {
  if (!Object.hasOwn(value, field) || value[field] === undefined) return { ok: true, value: [] };
  return Array.isArray(value[field])
    ? { ok: true, value: value[field] }
    : { ok: false };
}

function projectConfirmedRecord(value) {
  if (!hasOnlyKeys(value, CONFIRMED_KEYS)
    || value.schemaVersion !== 1
    || value.status !== "confirmed"
    || !PLATFORMS.has(value.platform)
    || !nonemptyString(value.problemExternalId)
    || !SAFE_IDENTIFIER.test(value.problemExternalId)
    || !nonemptyString(value.externalSubmissionId)
    || !SAFE_IDENTIFIER.test(value.externalSubmissionId)
    || !canonicalIso(value.confirmedAt)
    || !nonemptyString(value.storageKey)
    || value.storageKey !== `${value.platform}:${value.externalSubmissionId}`
    || !canonicalIso(value.lastE3At)) {
    return undefined;
  }
  if (value.phase !== undefined && !["queued", "judging", "running"].includes(value.phase)) {
    return undefined;
  }
  if (value.finalizedAt !== undefined && !canonicalIso(value.finalizedAt)) return undefined;
  return Object.freeze({
    schemaVersion: 1,
    status: "confirmed",
    platform: value.platform,
    problemExternalId: value.problemExternalId,
    externalSubmissionId: value.externalSubmissionId,
    confirmedAt: value.confirmedAt,
    storageKey: value.storageKey,
    lastE3At: value.lastE3At,
    ...(value.phase === undefined ? {} : { phase: value.phase }),
    ...(value.finalizedAt === undefined ? {} : { finalizedAt: value.finalizedAt }),
  });
}

function projectTombstone(value) {
  if (!hasOnlyKeys(value, TOMBSTONE_KEYS)
    || !nonemptyString(value.submissionKey)
    || !SAFE_IDENTIFIER.test(value.submissionKey)
    || !canonicalIso(value.finalizedAt)
    || !canonicalIso(value.expiresAt)) {
    return undefined;
  }
  return Object.freeze({
    submissionKey: value.submissionKey,
    finalizedAt: value.finalizedAt,
    expiresAt: value.expiresAt,
  });
}

function projectClosedArray(value, projector) {
  if (!Array.isArray(value)) return { ok: false };
  const projected = [];
  for (const entry of value) {
    const result = projector(entry);
    if (result === undefined) return { ok: false };
    projected.push(result);
  }
  return { ok: true, value: Object.freeze(projected) };
}

function exactSnapshotKeys(value, allowed) {
  if (!objectValue(value)) return false;
  return Object.keys(value).every((key) => allowed.has(key));
}

function exactDataSnapshotKeys(value, allowed) {
  if (!objectValue(value)) return false;
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) return false;
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (descriptor === undefined || !Object.hasOwn(descriptor, "value")) return false;
  }
  return true;
}

export function validateCandidateReceipt(value, expected) {
  if (!exactDataSnapshotKeys(value, CANDIDATE_RECEIPT_KEYS)
    || value.schemaVersion !== 1
    || !/^[a-f0-9]{40}$/u.test(value.candidateSha)
    || !nonemptyString(value.extensionDist)
    || !exactDataSnapshotKeys(value.artifactHashes, CANDIDATE_ARTIFACT_KEYS)
    || !objectValue(expected)
    || value.candidateSha !== expected.candidateSha
    || resolve(value.extensionDist) !== resolve(expected.extensionDist)) {
    return { ok: false, reason: "observer_candidate_receipt_rejected" };
  }
  for (const key of CANDIDATE_ARTIFACT_KEYS) {
    const receiptHash = value.artifactHashes[key];
    const expectedHash = expected.artifactHashes?.[key];
    if (typeof receiptHash !== "string" || !/^[A-F0-9]{64}$/u.test(receiptHash)
      || receiptHash !== expectedHash) {
      return { ok: false, reason: "observer_candidate_receipt_rejected" };
    }
  }
  return { ok: true };
}

export function validateReadyConnectionReceipt(value, expected) {
  if (!exactDataSnapshotKeys(value, CONNECTION_RECEIPT_KEYS)
    || value.schemaVersion !== 1
    || value.connection !== "connected"
    || !canonicalIso(value.preparedAt)
    || !/^[a-f0-9]{40}$/u.test(value.candidateSha)
    || !/^(?:leetcode|nowcoder)$/u.test(value.platform)
    || !/^[A-F0-9]{64}$/u.test(value.profileIdentity)
    || !/^[A-F0-9]{64}$/u.test(value.databaseIdentity)
    || !/^[A-F0-9]{64}$/u.test(value.vaultConfigIdentity)
    || !/^[a-p]{32}$/u.test(value.extensionId)
    || !/^[A-F0-9]{64}$/u.test(value.installationIdentity)
    || !Number.isInteger(value.captureCapabilityVersion)
    || value.captureCapabilityVersion < 1
    || !/^[A-F0-9]{64}$/u.test(value.candidateReceiptHash)
    || !exactDataSnapshotKeys(value.artifactHashes, CANDIDATE_ARTIFACT_KEYS)
    || !exactDataSnapshotKeys(value.database, ZERO_DATABASE_KEYS)
    || ![...ZERO_DATABASE_KEYS].every((key) => value.database[key] === 0)
    || !objectValue(expected)) {
    return { ok: false, reason: "observer_connection_receipt_rejected" };
  }
  for (const key of [
    "candidateSha",
    "platform",
    "profileIdentity",
    "databaseIdentity",
    "vaultConfigIdentity",
    "extensionId",
    "candidateReceiptHash",
  ]) {
    if (value[key] !== expected[key]) {
      return { ok: false, reason: "observer_connection_receipt_rejected" };
    }
  }
  for (const key of CANDIDATE_ARTIFACT_KEYS) {
    if (typeof value.artifactHashes[key] !== "string"
      || value.artifactHashes[key] !== expected.artifactHashes?.[key]) {
      return { ok: false, reason: "observer_connection_receipt_rejected" };
    }
  }
  return { ok: true };
}

export function createObservationTerminalController({ closeContext, rejectArmed }) {
  let terminal = false;
  let reason;
  return Object.freeze({
    fail(nextReason) {
      if (terminal) return false;
      terminal = true;
      reason = nextReason;
      rejectArmed(new Error(nextReason));
      void Promise.resolve().then(closeContext).catch(() => undefined);
      return true;
    },
    get terminal() {
      return terminal;
    },
    get reason() {
      return reason;
    },
  });
}

function targetValue(target) {
  if (target === undefined) return undefined;
  if (!objectValue(target)
    || !PLATFORMS.has(target.platform)
    || !nonemptyString(target.problemExternalId)
    || !SAFE_IDENTIFIER.test(target.problemExternalId)) {
    return undefined;
  }
  return Object.freeze({ platform: target.platform, problemExternalId: target.problemExternalId });
}

function readE0TargetMatch(value, target) {
  if (!hasOnlyKeys(value, UI_HINT_KEYS)
    || !hasRequiredKeys(value, UI_HINT_REQUIRED_KEYS)) {
    return { ok: false };
  }
  const hint = readRequiredDataProperties(value, UI_HINT_REQUIRED_KEYS);
  if (hint === undefined
    || hint.schemaVersion !== 1
    || hint.tier !== "E0"
    || hint.kind !== "ui_hint"
    || typeof hint.platform !== "string"
    || !KNOWN_PLATFORMS.has(hint.platform)
    || !nonemptyString(hint.problemExternalId)
    || !SAFE_IDENTIFIER.test(hint.problemExternalId)
    || !nonemptyString(hint.sourceDocumentId)
    || !SAFE_IDENTIFIER.test(hint.sourceDocumentId)
    || !canonicalIso(hint.observedAt)) {
    return { ok: false };
  }
  return {
    ok: true,
    matches: target !== undefined
      && hint.platform === target.platform
      && hint.problemExternalId === target.problemExternalId,
    sourceDocumentId: hint.sourceDocumentId,
  };
}

function readE1TargetMatch(value, target) {
  if (!hasOnlyKeys(value, LIFECYCLE_KEYS)
    || !hasRequiredKeys(value, LIFECYCLE_REQUIRED_KEYS)
    || value.schemaVersion !== 1
    || value.tier !== "E1"
    || value.kind !== "request_lifecycle"
    || !objectValue(value.evidence)
    || !hasOnlyKeys(value.evidence, E1_EVIDENCE_KEYS)
    || !hasRequiredKeys(value.evidence, E1_EVIDENCE_REQUIRED_KEYS)) {
    return { ok: false };
  }
  const evidence = value.evidence;
  if (evidence.schemaVersion !== 1
    || evidence.tier !== "E1"
    || evidence.kind !== "request_observed"
    || typeof evidence.platform !== "string"
    || !KNOWN_PLATFORMS.has(evidence.platform)
    || typeof evidence.endpointKey !== "string"
    || !SAFE_ENDPOINT.test(evidence.endpointKey)
    || typeof evidence.method !== "string"
    || !VALID_E1_METHODS.has(evidence.method)
    || typeof evidence.resourceType !== "string"
    || !VALID_E1_RESOURCES.has(evidence.resourceType)
    || typeof evidence.lifecycle !== "string"
    || !VALID_E1_LIFECYCLES.has(evidence.lifecycle)) {
    return { ok: false };
  }
  if (target === undefined) {
    return { ok: true, kind: "unrelated", matches: false };
  }
  if (target.platform === "leetcode") {
    const endpoint = `leetcode/submit/cn/${target.problemExternalId}`;
    if (evidence.endpointKey.startsWith("leetcode/submit/")) {
      if (evidence.platform !== "leetcode" || evidence.endpointKey !== endpoint
        || evidence.method !== "POST" || evidence.resourceType !== "xmlhttprequest") {
        return { ok: false };
      }
      return { ok: true, kind: "submit", matches: true };
    }
    if (/^leetcode\/(?:result|check)\/cn\/[0-9]{1,20}$/u.test(evidence.endpointKey)) {
      if (evidence.platform !== "leetcode" || evidence.method !== "GET"
        || evidence.resourceType !== "xmlhttprequest") {
        return { ok: false };
      }
      return {
        ok: true,
        kind: "status",
        matches: true,
        stableSubmissionId: evidence.endpointKey.replace(/^leetcode\/(?:result|check)\//u, ""),
      };
    }
    return {
      ok: true,
      kind: "unrelated",
      matches: false,
    };
  }
  const nowCoderLike = evidence.endpointKey.startsWith("nowcoder/submit")
    || evidence.endpointKey.startsWith("nowcoder/status");
  if (!nowCoderLike) return { ok: true, kind: "unrelated", matches: false };
  if (evidence.platform !== "nowcoder" || evidence.resourceType !== "xmlhttprequest") {
    return { ok: false };
  }
  if (evidence.endpointKey === "nowcoder/submit" && evidence.method === "POST") {
    return { ok: true, kind: "submit", matches: true };
  }
  if (evidence.endpointKey === "nowcoder/status" && evidence.method === "GET") {
    return { ok: true, kind: "status", matches: true };
  }
  return { ok: false };
}

function projectTargetSession(session, target) {
  const parsedTarget = targetValue(target);
  if (target !== undefined && parsedTarget === undefined) return { ok: false };
  const hints = readArray(session, "uiHints");
  const lifecycles = readArray(session, "transientE1");
  if (!hints.ok || !lifecycles.ok) return { ok: false };
  if (parsedTarget === undefined) {
    return { ok: true, value: Object.freeze({ e0: 0, e1: 0, submit: 0, status: 0 }) };
  }
  const e0Documents = new Set();
  for (const hint of hints.value) {
    const result = readE0TargetMatch(hint, parsedTarget);
    if (!result.ok) return { ok: false };
    if (!result.matches) return { ok: false };
    if (e0Documents.has(result.sourceDocumentId)) return { ok: false };
    e0Documents.add(result.sourceDocumentId);
  }
  const e0 = e0Documents.size === 0 ? 0 : 1;
  let submit = 0;
  let status = 0;
  const statusSubmissionIds = [];
  for (const lifecycle of lifecycles.value) {
    const result = readE1TargetMatch(lifecycle, parsedTarget);
    if (!result.ok) return { ok: false };
    if (!result.matches) continue;
    if (result.kind === "submit") submit += 1;
    if (result.kind === "status") {
      status += 1;
      statusSubmissionIds.push(result.stableSubmissionId);
    }
  }
  const lastStatusSubmissionId = statusSubmissionIds.at(-1);
  return {
    ok: true,
    value: Object.freeze({
      e0,
      e1: submit + status,
      submit,
      status,
    }),
    statusSubmissionIds: lastStatusSubmissionId === undefined
      ? Object.freeze([])
      : Object.freeze([lastStatusSubmissionId]),
  };
}

function bindTargetStatusIdentity(counts, target, confirmed, statusSubmissionIds) {
  const value = {
    e0: counts.e0,
    e1: counts.e1,
    submit: counts.submit,
    status: counts.status,
  };
  if (target?.platform === "leetcode" && confirmed.length > 0) {
    value.statusConfirmedMatch = confirmed.length === 1
      && statusSubmissionIds.length === 1
      && statusSubmissionIds[0] === confirmed[0].externalSubmissionId;
  }
  return Object.freeze(value);
}

/**
 * Project an exact local/session storage read without traversing outbox or
 * quarantine entries.  A failure returns only the fixed rejection reason.
 */
export function projectSafeSnapshot(input, target) {
  if (!objectValue(input) || !exactSnapshotKeys(input.local, LOCAL_KEY_SET)
    || !exactSnapshotKeys(input.session, SESSION_KEY_SET)) {
    return { ok: false, reason: "observer_value_rejected" };
  }
  const local = input.local;
  const session = input.session;
  const confirmedResult = readArray(local, "confirmedSubmissions");
  const tombstoneResult = readArray(local, "confirmedSubmissionTombstones");
  const outboxResult = readArray(local, "captureOutbox");
  const quarantineResult = readArray(local, "captureQuarantine");
  if (!confirmedResult.ok || !tombstoneResult.ok || !outboxResult.ok || !quarantineResult.ok) {
    return { ok: false, reason: "observer_value_rejected" };
  }
  const confirmed = projectClosedArray(confirmedResult.value, projectConfirmedRecord);
  const tombstones = projectClosedArray(tombstoneResult.value, projectTombstone);
  if (!confirmed.ok || !tombstones.ok) {
    return { ok: false, reason: "observer_value_rejected" };
  }
  const lastError = readCaptureError(local);
  const lastSuccess = readOptionalSafeString(local, "lastSuccessfulCaptureAt", /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u);
  if (!lastError.ok || !lastSuccess.ok
    || (lastSuccess.value !== undefined && !canonicalIso(lastSuccess.value))) {
    return { ok: false, reason: "observer_value_rejected" };
  }
  const sessionCounts = {};
  for (const key of SESSION_TRIGGER_KEYS) {
    const result = readArray(session, key);
    if (!result.ok) return { ok: false, reason: "observer_value_rejected" };
    sessionCounts[key] = target === undefined ? result.value.length : 0;
  }
  const targetResult = projectTargetSession(session, target);
  if (!targetResult.ok) return { ok: false, reason: "observer_value_rejected" };
  const projectedTarget = target === undefined
    ? undefined
    : bindTargetStatusIdentity(targetResult.value, target, confirmed.value, targetResult.statusSubmissionIds);
  const value = Object.freeze({
    confirmed: confirmed.value,
    tombstones: tombstones.value,
    outbox: outboxResult.value.length,
    quarantine: quarantineResult.value.length,
    lastCaptureError: lastError.value,
    lastSuccessfulCaptureAt: lastSuccess.value,
    session: Object.freeze(sessionCounts),
    ...(projectedTarget === undefined ? {} : { target: projectedTarget }),
  });
  TARGET_IDENTITY_MEMORY.set(value, targetResult.statusSubmissionIds);
  return {
    ok: true,
    value,
  };
}

function changedNewValue(changes, key) {
  const change = changes[key];
  if (!objectValue(change)) return { ok: false };
  return { ok: true, value: Reflect.get(change, "newValue") };
}

/**
 * Apply one already-key-validated chrome.storage.onChanged batch to a closed
 * projected snapshot. Unknown batches are rejected before any change value is
 * accessed; approved batches read only newValue and never oldValue.
 */
export function applySafeStorageChange(snapshot, areaName, changes, target) {
  const validation = validateStorageChange(areaName, changes);
  if (!validation.ok || !objectValue(snapshot)) return { ok: false, reason: validation.reason ?? "observer_value_rejected" };
  const next = {
    ...snapshot,
    confirmed: [...snapshot.confirmed],
    tombstones: [...snapshot.tombstones],
    session: { ...snapshot.session },
  };
  let statusSubmissionIds = TARGET_IDENTITY_MEMORY.get(snapshot) ?? Object.freeze([]);
  const ignored = areaName === "local" ? IGNORED_LOCAL_KEY_SET : IGNORED_SESSION_KEY_SET;
  for (const key of validation.keys) {
    if (ignored.has(key)) continue;
    const changed = changedNewValue(changes, key);
    if (!changed.ok) return { ok: false, reason: "observer_value_rejected" };
    const value = changed.value;
    if (areaName === "session") {
      if (value !== undefined && !Array.isArray(value)) return { ok: false, reason: "observer_value_rejected" };
      next.session[key] = target === undefined ? (value === undefined ? 0 : value.length) : 0;
      if (target !== undefined && (key === "uiHints" || key === "transientE1")) {
        const targetResult = projectTargetSession({
          uiHints: key === "uiHints" ? (value ?? []) : [],
          transientE1: key === "transientE1" ? (value ?? []) : [],
        }, target);
        if (!targetResult.ok) return { ok: false, reason: "observer_value_rejected" };
        if (key === "transientE1") statusSubmissionIds = targetResult.statusSubmissionIds;
        next.target = {
          ...(next.target ?? { e0: 0, e1: 0, submit: 0, status: 0 }),
          ...(key === "uiHints" ? { e0: targetResult.value.e0 } : {
            e1: targetResult.value.e1,
            submit: targetResult.value.submit,
            status: targetResult.value.status,
          }),
        };
      }
      continue;
    }
    if (key === "confirmedSubmissions") {
      const projected = projectClosedArray(value ?? [], projectConfirmedRecord);
      if (!projected.ok) return { ok: false, reason: "observer_value_rejected" };
      next.confirmed = [...projected.value];
    } else if (key === "confirmedSubmissionTombstones") {
      const projected = projectClosedArray(value ?? [], projectTombstone);
      if (!projected.ok) return { ok: false, reason: "observer_value_rejected" };
      next.tombstones = [...projected.value];
    } else if (key === "captureOutbox" || key === "captureQuarantine") {
      if (value !== undefined && !Array.isArray(value)) return { ok: false, reason: "observer_value_rejected" };
      next[key === "captureOutbox" ? "outbox" : "quarantine"] = value === undefined ? 0 : value.length;
    } else if (key === "lastSuccessfulCaptureAt") {
      if (value !== undefined && !canonicalIso(value)) return { ok: false, reason: "observer_value_rejected" };
      next.lastSuccessfulCaptureAt = value;
    } else if (key === "lastCaptureError") {
      const projected = readCaptureError({ lastCaptureError: value });
      if (!projected.ok) return { ok: false, reason: "observer_value_rejected" };
      next.lastCaptureError = projected.value;
    }
  }
  if (target !== undefined && next.target !== undefined) {
    next.target = bindTargetStatusIdentity(next.target, target, next.confirmed, statusSubmissionIds);
  }
  const value = Object.freeze({ ...next, confirmed: Object.freeze(next.confirmed), tombstones: Object.freeze(next.tombstones), session: Object.freeze(next.session) });
  TARGET_IDENTITY_MEMORY.set(value, statusSubmissionIds);
  return { ok: true, value };
}

export function isExactObserverPageUrl(actual, expected) {
  return typeof actual === "string" && typeof expected === "string" && actual === expected;
}

export function projectStageEvidence(state, database) {
  if (!objectValue(state) || !objectValue(state.latest) || typeof state.stage !== "string") {
    return { ok: false, reason: "observer_value_rejected" };
  }
  const db = databaseValue(database);
  if (db === undefined) return { ok: false, reason: "observer_value_rejected" };
  const latest = state.latest;
  return {
    ok: true,
    value: Object.freeze({
      stage: state.stage,
      extension: Object.freeze({
        confirmed: latest.confirmed,
        tombstones: latest.tombstones,
        outbox: latest.outbox,
        quarantine: latest.quarantine,
        target: latest.target,
        ...(latest.lastSuccessfulCaptureAt === undefined
          ? {}
          : { lastSuccessfulCaptureAt: latest.lastSuccessfulCaptureAt }),
        ...(latest.lastCaptureError === undefined
          ? {}
          : { lastCaptureError: latest.lastCaptureError }),
      }),
      database: db,
    }),
  };
}

/**
 * D4 acceptance projection. Unlike the historical diagnostic projection,
 * this exports only cumulative bounded facts and a closed grade/verdict.
 * Request/document identity, URLs, timestamps, verdict text, storage values,
 * database paths, and stable submission identifiers never cross this seam.
 */
export function projectD4AcceptanceEvidence(state, database) {
  if (!objectValue(state) || !objectValue(state.latest) || typeof state.stage !== "string") {
    return { ok: false, reason: "observer_value_rejected" };
  }
  const db = databaseValue(database);
  const target = readTargetCounts(state.latest, state.latest.target);
  if (db === undefined || target === undefined) {
    return { ok: false, reason: "observer_value_rejected" };
  }
  const baseline = databaseValue(state.databaseBaseline);
  if (baseline === undefined) return { ok: false, reason: "observer_value_rejected" };
  return {
    ok: true,
    value: Object.freeze({
      schemaVersion: 1,
      stage: state.stage,
      causalGrade: state.acknowledged === true ? "ISOLATED" : "UNRESOLVED",
      verdict: state.acknowledged === true ? "PASS" : "PROFILE_UNRESOLVED",
      facts: Object.freeze({
        authorizedActions: target.e0,
        exactSubmitCorroboration: target.submit,
        stableResultLifecycles: target.status,
        e2Confirmed: state.e2Seen === true ? 1 : 0,
        e3Finalized: state.e3Seen === true ? 1 : 0,
        acknowledged: state.acknowledged === true ? 1 : 0,
        waiting: state.latest.confirmed.filter((record) => record.finalizedAt === undefined).length,
        outbox: state.latest.outbox,
        quarantine: state.latest.quarantine,
        databaseDelta: Object.freeze({
          captureEvents: db.captureEvents - baseline.captureEvents,
          trainingSessions: db.trainingSessions - baseline.trainingSessions,
          trainingAttempts: db.trainingAttempts - baseline.trainingAttempts,
        }),
      }),
    }),
  };
}

export function isCanonicalDescendant(parent, child) {
  const inside = relative(parent, child);
  return inside.length > 0 && !inside.startsWith("..") && !isAbsolute(inside);
}

export function validateObservationDatabase({ repoRoot, pointerPath, explicitPath, counts }) {
  if (![repoRoot, pointerPath, explicitPath].every(nonemptyString) || databaseValue(counts) === undefined) {
    return { ok: false, reason: "observer_database_rejected" };
  }
  const root = resolve(repoRoot);
  const allowedRoot = resolve(root, ".tmp", "v4-live-observation-db");
  const pointer = resolve(pointerPath);
  const explicit = resolve(explicitPath);
  if (pointer !== explicit || !isCanonicalDescendant(allowedRoot, explicit)) {
    return { ok: false, reason: "observer_database_rejected" };
  }
  try {
    let current = root;
    if (lstatSync(current).isSymbolicLink()) {
      return { ok: false, reason: "observer_database_rejected" };
    }
    for (const component of relative(root, explicit).split(/[\\/]+/u)) {
      current = resolve(current, component);
      if (lstatSync(current).isSymbolicLink()) {
        return { ok: false, reason: "observer_database_rejected" };
      }
    }
    const realRoot = realpathSync.native(root);
    const realAllowedRoot = realpathSync.native(allowedRoot);
    const realPointer = realpathSync.native(pointer);
    const realExplicit = realpathSync.native(explicit);
    if (realPointer !== realExplicit
      || !isCanonicalDescendant(realRoot, realAllowedRoot)
      || !isCanonicalDescendant(realAllowedRoot, realExplicit)) {
      return { ok: false, reason: "observer_database_rejected" };
    }
  } catch {
    return { ok: false, reason: "observer_database_rejected" };
  }
  if (counts.captureEvents !== 0 || counts.trainingSessions !== 0 || counts.trainingAttempts !== 0) {
    return { ok: false, reason: "observer_database_not_empty" };
  }
  return { ok: true, path: explicit };
}

export function validateObservationTarget(hostname, pathname) {
  if (hostname === "leetcode.cn") return { ok: true, platform: "leetcode" };
  if (hostname !== "ac.nowcoder.com") return { ok: false, reason: "observer_target_rejected" };
  if (pathname === BLOCKED_NOWCODER_PATH) return { ok: false, reason: "observer_target_rejected" };
  if (pathname !== APPROVED_NOWCODER_PATH) return { ok: false, reason: "observer_target_rejected" };
  return { ok: true, platform: "nowcoder" };
}

export function validateStorageChange(areaName, changes) {
  const allowed = areaName === "local"
    ? LOCAL_KEY_SET
    : areaName === "session"
      ? SESSION_KEY_SET
      : undefined;
  const ignored = areaName === "local"
    ? IGNORED_LOCAL_KEY_SET
    : areaName === "session"
      ? IGNORED_SESSION_KEY_SET
      : undefined;
  if (allowed === undefined || ignored === undefined || !objectValue(changes)) {
    return { ok: false, reason: "observer_storage_key_rejected" };
  }
  const keys = Object.keys(changes);
  return keys.every((key) => allowed.has(key) || ignored.has(key))
    ? { ok: true, keys: Object.freeze(keys) }
    : { ok: false, reason: "observer_storage_key_rejected" };
}

function countConfirmed(snapshot) {
  return snapshot.confirmed.length;
}

function countTombstones(snapshot) {
  return snapshot.tombstones.length;
}

function databaseValue(database) {
  if (database === undefined) return { captureEvents: 0, trainingSessions: 0, trainingAttempts: 0 };
  if (!objectValue(database)
    || !["captureEvents", "trainingSessions", "trainingAttempts"].every((key) =>
      Number.isInteger(database[key]) && database[key] >= 0)) {
    return undefined;
  }
  return {
    captureEvents: database.captureEvents,
    trainingSessions: database.trainingSessions,
    trainingAttempts: database.trainingAttempts,
  };
}

function identityOf(snapshot) {
  const item = snapshot.confirmed[0];
  if (item === undefined) return undefined;
  return item.storageKey;
}

function readTargetCounts(snapshot, target) {
  if (target === undefined) return undefined;
  const value = snapshot.target;
  if (!objectValue(value)
    || !exactDataSnapshotKeys(value, TARGET_COUNT_KEYS)
    || !["e0", "e1", "submit", "status"].every((key) => Number.isInteger(value[key]) && value[key] >= 0)
    || (Object.hasOwn(value, "statusConfirmedMatch") && typeof value.statusConfirmedMatch !== "boolean")) {
    return undefined;
  }
  return value;
}

/**
 * Preserve only safe counts from the exact snapshot that carried a terminal
 * allowlisted capture error.  This intentionally does not infer callback
 * ordering: a storage callback is one atomic projected snapshot, so E1/E2
 * membership is reported as counts exactly as observed.  No raw session
 * values, identities, timestamps, or queue entries cross this boundary.
 */
export function projectFailureReceipt(snapshot, database, target) {
  if (!objectValue(snapshot)
    || !exactDataSnapshotKeys(snapshot, FAILURE_SNAPSHOT_KEYS)
    || !Array.isArray(snapshot.confirmed)
    || !Array.isArray(snapshot.tombstones)
    || !objectValue(snapshot.session)
    || !exactDataSnapshotKeys(snapshot.session, SESSION_KEY_SET)) {
    return { ok: false, reason: "observer_value_rejected" };
  }
  const db = databaseValue(database);
  if (db === undefined) return { ok: false, reason: "observer_value_rejected" };
  const error = readCaptureError(snapshot);
  if (!error.ok) return { ok: false, reason: "observer_value_rejected" };
  if (error.value === undefined) return { ok: false, reason: "observer_value_rejected" };
  const targetCounts = readTargetCounts(snapshot, target);
  if (target !== undefined && targetCounts === undefined) {
    return { ok: false, reason: "observer_value_rejected" };
  }
  const counts = {
    confirmed: snapshot.confirmed.length,
    tombstones: snapshot.tombstones.length,
    outbox: Number.isInteger(snapshot.outbox) && snapshot.outbox >= 0 ? snapshot.outbox : undefined,
    quarantine: Number.isInteger(snapshot.quarantine) && snapshot.quarantine >= 0 ? snapshot.quarantine : undefined,
  };
  if (counts.outbox === undefined || counts.quarantine === undefined) {
    return { ok: false, reason: "observer_value_rejected" };
  }
  return {
    ok: true,
    value: Object.freeze({
      reason: "observer_capture_error",
      error: error.value,
      ...(targetCounts === undefined ? {} : {
        target: Object.freeze({
          e0: targetCounts.e0,
          e1: targetCounts.e1,
          submit: targetCounts.submit,
          status: targetCounts.status,
        }),
      }),
      extension: Object.freeze(counts),
      database: Object.freeze(db),
    }),
  };
}

/**
 * Pure ordered stage reducer.  It intentionally accepts only cardinalities
 * for transient E1 and retained outbox/quarantine state.
 */
function stageRejected(diagnostic, diagnosticCode) {
  return diagnostic
    ? { ok: false, reason: "observer_stage_rejected", diagnosticCode }
    : { ok: false, reason: "observer_stage_rejected" };
}

export function reduceObservationSnapshot(previous, snapshot, database, target, diagnostic = false) {
  const db = databaseValue(database);
  if (db === undefined || !snapshot || !Array.isArray(snapshot.confirmed)
    || !Array.isArray(snapshot.tombstones) || !objectValue(snapshot.session)) {
    return stageRejected(diagnostic, "snapshot_shape_invalid");
  }
  if (snapshot.lastCaptureError !== undefined) {
    return { ok: false, reason: "observer_capture_error" };
  }
  if (previous === undefined) {
    if (db.captureEvents !== 0 || db.trainingSessions !== 0 || db.trainingAttempts !== 0) {
      return { ok: false, reason: "observer_database_not_empty" };
    }
    if ((target === undefined && snapshot.session.transientE1 !== 0)
      || countConfirmed(snapshot) !== 0
      || countTombstones(snapshot) !== 0
      || snapshot.outbox !== 0
      || snapshot.quarantine !== 0) {
      return { ok: false, reason: "observer_baseline_rejected" };
    }
    if (target !== undefined) {
      const targetCounts = readTargetCounts(snapshot, target);
      if (targetCounts === undefined || targetCounts.e0 !== 0 || targetCounts.e1 !== 0
        || targetCounts.submit !== 0 || targetCounts.status !== 0) {
        return { ok: false, reason: "observer_baseline_rejected" };
      }
    }
    return {
      ok: true,
      value: Object.freeze({
        stage: "browse_only",
        baseline: snapshot,
        latest: snapshot,
        databaseBaseline: db,
        e1Seen: false,
        e2Seen: false,
        e3Seen: false,
        acknowledged: false,
      }),
    };
  }
  if (!previous.latest || !previous.baseline || previous.acknowledged) {
    if (previous.acknowledged && JSON.stringify(previous.latest) === JSON.stringify(snapshot)
      && JSON.stringify(previous.databaseBaseline) === JSON.stringify(db)) {
      return { ok: true, value: previous };
    }
    return stageRejected(diagnostic, "previous_state_invalid");
  }
  const prior = previous.latest;
  const e1Delta = snapshot.session.transientE1 - prior.session.transientE1;
  const confirmedDelta = countConfirmed(snapshot) - countConfirmed(prior);
  const tombstoneDelta = countTombstones(snapshot) - countTombstones(prior);
  if (target === undefined && e1Delta < 0) {
    return stageRejected(diagnostic, "generic_e1_count_regressed");
  }
  if (confirmedDelta < 0 || confirmedDelta > 1) {
    return stageRejected(diagnostic, "confirmed_count_delta_invalid");
  }
  if (tombstoneDelta < 0 || tombstoneDelta > 1) {
    return stageRejected(diagnostic, "tombstone_count_delta_invalid");
  }
  if (snapshot.outbox < 0 || snapshot.outbox > 1) {
    return stageRejected(diagnostic, "outbox_cardinality_invalid");
  }
  if (snapshot.quarantine < 0 || snapshot.quarantine > 1) {
    return stageRejected(diagnostic, "quarantine_cardinality_invalid");
  }
  const next = {
    ...previous,
    latest: snapshot,
  };
  const currentTarget = readTargetCounts(snapshot, target);
  const priorTarget = readTargetCounts(prior, target);
  if (target !== undefined && (currentTarget === undefined || priorTarget === undefined)) {
    return stageRejected(diagnostic, "target_projection_missing");
  }
  if (previous.e2Seen) {
    if (snapshot.confirmed.length !== 1) {
      return stageRejected(diagnostic, "e2_confirmed_cardinality_drift");
    }
    if (identityOf(snapshot) !== previous.e2Identity) {
      return stageRejected(diagnostic, "e2_confirmed_identity_drift");
    }
    if (target?.platform === "leetcode" && currentTarget?.statusConfirmedMatch !== true) {
      return stageRejected(diagnostic, "leetcode_e2_status_identity_drift");
    }
  }
  if (target !== undefined) {
    const targetCounts = currentTarget;
    const previousTarget = priorTarget;
    if (targetCounts.e0 < previousTarget.e0) {
      return stageRejected(diagnostic, "target_e0_count_regressed");
    }
    if (targetCounts.e1 < previousTarget.e1) {
      return stageRejected(diagnostic, "target_e1_count_regressed");
    }
    if (targetCounts.submit < previousTarget.submit) {
      return stageRejected(diagnostic, "target_submit_count_regressed");
    }
    if (targetCounts.status < previousTarget.status) {
      return stageRejected(diagnostic, "target_status_count_regressed");
    }
    if (targetCounts.e0 > 1) {
      return stageRejected(diagnostic, "e0_cardinality_exceeded");
    }
    if (target.platform === "leetcode" && targetCounts.submit > 1) {
      return stageRejected(diagnostic, "leetcode_submit_cardinality_exceeded");
    }
    if (target.platform === "leetcode" && targetCounts.status > 1) {
      return stageRejected(diagnostic, "leetcode_status_cardinality_exceeded");
    }
    if (target.platform === "nowcoder" && targetCounts.submit > 1) {
      return stageRejected(diagnostic, "nowcoder_submit_cardinality_exceeded");
    }
    if (target.platform === "nowcoder" && targetCounts.status > 1) {
      return stageRejected(diagnostic, "nowcoder_status_cardinality_exceeded");
    }
    if (targetCounts.status > 0 && target.platform === "nowcoder" && targetCounts.submit === 0) {
      return stageRejected(diagnostic, "nowcoder_status_without_submit");
    }
    if (targetCounts.e0 !== previousTarget.e0) {
      // For LeetCode, the E0 seed may land AFTER the historical status
      // noise (login completes, the submit control becomes visible).
      // Status-only E1s with no submit are tolerated here.
      if (previousTarget.e0 !== 0 || targetCounts.e0 !== 1) {
        return stageRejected(diagnostic, "e0_transition_invalid");
      }
      if (previous.e1Seen) {
        return stageRejected(diagnostic, "e0_after_e1");
      }
      if (targetCounts.submit !== 0) {
        return stageRejected(diagnostic, "e0_coalesced_with_submit");
      }
      if (target.platform === "leetcode" && targetCounts.status > 1) {
        return stageRejected(diagnostic, "e0_status_cardinality_exceeded");
      }
      if (target.platform === "nowcoder" && targetCounts.e1 !== 0) {
        return stageRejected(diagnostic, "nowcoder_e0_coalesced_with_e1");
      }
      return { ok: true, value: Object.freeze(next) };
    }
  }
  if (!previous.e1Seen) {
    if (target !== undefined) {
      const targetCounts = currentTarget;
      const previousTarget = priorTarget;
      const targetReady = targetCounts.e0 === 1
        && (target.platform === "leetcode"
          ? targetCounts.status === 1 || targetCounts.submit === 1
          : targetCounts.submit === 1 && targetCounts.status === 0);
      if (targetCounts.e1 === 0) {
        if (confirmedDelta !== 0 || tombstoneDelta !== 0
          || snapshot.outbox !== prior.outbox || snapshot.quarantine !== prior.quarantine) {
          return stageRejected(diagnostic, "pre_e1_side_effect");
        }
        return { ok: true, value: Object.freeze(next) };
      }
      // LeetCode problem pages issue historical check/result requests on load,
      // before any submit control is visible.  Status-only E1 noise without an
      // E0 action must be tolerated: the stage stays browse_only and the E2
      // gate still requires the exact E0 + unique stable-ID match later.
      if (target.platform === "leetcode"
        && targetCounts.submit === 0
        && targetCounts.e0 === 0
        && targetCounts.status >= previousTarget.status
        && confirmedDelta === 0 && tombstoneDelta === 0
        && snapshot.outbox === prior.outbox && snapshot.quarantine === prior.quarantine) {
        return { ok: true, value: Object.freeze(next) };
      }
      if (!targetReady) {
        return stageRejected(diagnostic, "target_not_ready_for_e1");
      }
      if (targetCounts.e1 <= previousTarget.e1) {
        return stageRejected(diagnostic, "target_e1_not_advanced");
      }
      next.e1Seen = true;
      next.stage = "e1_observed";
      return { ok: true, value: Object.freeze(next) };
    }
    if (e1Delta >= 1 && confirmedDelta === 0 && tombstoneDelta === 0
      && snapshot.outbox === prior.outbox && snapshot.quarantine === prior.quarantine) {
      next.e1Seen = true;
      next.stage = "e1_observed";
      return { ok: true, value: Object.freeze(next) };
    }
    if (e1Delta !== 0 || confirmedDelta !== 0 || tombstoneDelta !== 0
      || snapshot.outbox !== prior.outbox || snapshot.quarantine !== prior.quarantine) {
      return stageRejected(diagnostic, "generic_e1_transition_invalid");
    }
    return { ok: true, value: Object.freeze(next) };
  }
  if (target !== undefined) {
    const targetCounts = currentTarget;
    const previousTarget = priorTarget;
    const allowedNowCoderStatusAdvance = target.platform === "nowcoder"
      && !previous.e2Seen
      && previousTarget.submit === 1 && previousTarget.status === 0
      && targetCounts.submit === 1 && targetCounts.status === 1;
    const allowedLeetCodeResultAdvance = target.platform === "leetcode"
      && !previous.e2Seen
      && previousTarget.status === 0
      && targetCounts.status === 1
      && targetCounts.submit === previousTarget.submit;
    if (targetCounts.e1 !== previousTarget.e1
      && !allowedNowCoderStatusAdvance
      && !allowedLeetCodeResultAdvance) {
      return stageRejected(diagnostic, "post_e1_lifecycle_change_invalid");
    }
  }
  if (!previous.e2Seen) {
    if (confirmedDelta === 1 && (target !== undefined || e1Delta >= 0) && tombstoneDelta === 0
      && prior.outbox === snapshot.outbox && prior.quarantine === snapshot.quarantine
      && countConfirmed(snapshot) === 1
      && snapshot.confirmed[0]?.finalizedAt === undefined) {
      const candidate = snapshot.confirmed[0];
      if (target === undefined || candidate.platform !== target.platform
        || candidate.problemExternalId !== target.problemExternalId) {
        return { ok: false, reason: "observer_target_rejected" };
      }
      if (target.platform === "nowcoder"
        && (currentTarget?.submit !== 1 || currentTarget.status !== 1)) {
        return stageRejected(diagnostic, "nowcoder_e2_pair_incomplete");
      }
      if (target.platform === "leetcode"
        && (currentTarget?.status !== 1 || currentTarget.statusConfirmedMatch !== true)) {
        return stageRejected(diagnostic, "leetcode_e2_identity_unmatched");
      }
      next.e2Seen = true;
      next.e2Identity = candidate.storageKey;
      next.stage = "e2_confirmed";
      return { ok: true, value: Object.freeze(next) };
    }
    if ((target !== undefined || e1Delta >= 0) && confirmedDelta === 0 && tombstoneDelta === 0
      && snapshot.outbox === prior.outbox && snapshot.quarantine === prior.quarantine) {
      return { ok: true, value: Object.freeze(next) };
    }
    if (confirmedDelta !== 0 || tombstoneDelta !== 0
      || snapshot.outbox !== prior.outbox || snapshot.quarantine !== prior.quarantine) {
      return stageRejected(diagnostic, "pre_e2_transition_invalid");
    }
    return { ok: true, value: Object.freeze(next) };
  }
  if (!previous.e3Seen) {
    const identity = identityOf(previous.latest);
    const finalized = snapshot.confirmed.find((item) => item.storageKey === identity);
    const matchingTombstone = snapshot.tombstones.find((item) => item.submissionKey === identity);
    const finalizedTogether = finalized?.finalizedAt !== undefined
      && matchingTombstone?.finalizedAt === finalized.finalizedAt;
    if ((target !== undefined || e1Delta === 0) && confirmedDelta === 0 && tombstoneDelta === 1
      && finalizedTogether && snapshot.confirmed.length === 1
      && prior.outbox === 0 && snapshot.outbox === 1
      && snapshot.quarantine === 0) {
      next.e3Seen = true;
      next.stage = "e3_outbox";
      return { ok: true, value: Object.freeze(next) };
    }
    if (finalized?.finalizedAt !== undefined || (target === undefined && e1Delta !== 0) || confirmedDelta !== 0 || tombstoneDelta !== 0
      || snapshot.outbox !== prior.outbox || snapshot.quarantine !== prior.quarantine) {
      return stageRejected(diagnostic, "e3_transition_invalid");
    }
    return { ok: true, value: Object.freeze(next) };
  }
  if (snapshot.outbox === 0
    && snapshot.quarantine === 0
    && snapshot.lastSuccessfulCaptureAt !== undefined
    && db.captureEvents === previous.databaseBaseline.captureEvents
    && db.trainingSessions === previous.databaseBaseline.trainingSessions
    && db.trainingAttempts === previous.databaseBaseline.trainingAttempts) {
    return { ok: true, value: Object.freeze(next) };
  }
  if ((target === undefined && e1Delta !== 0) || confirmedDelta !== 0 || tombstoneDelta !== 0
    || snapshot.quarantine !== 0 || snapshot.outbox !== 0
    || snapshot.lastSuccessfulCaptureAt === undefined
    || db.captureEvents !== previous.databaseBaseline.captureEvents + 4
    || db.trainingSessions !== previous.databaseBaseline.trainingSessions + 1
    || db.trainingAttempts !== previous.databaseBaseline.trainingAttempts + 1) {
    return stageRejected(diagnostic, "ack_transition_invalid");
  }
  next.acknowledged = true;
  next.stage = "acknowledged";
  return { ok: true, value: Object.freeze(next) };
}

function cloneForScript(value) {
  return JSON.stringify(value);
}

/**
 * Return a self-contained function source for the persistent popup page.
 * The harness injects this into `chrome-extension://<id>/popup.html`; no
 * service-worker reference is captured and page close is terminal.
 */
export function persistentObserverEntrypointSource() {
  return `(${persistentObserverEntrypoint.toString()})`;
}

export function persistentObserverEntrypoint(configuration) {
  const localKeys = configuration.localKeys;
  const sessionKeys = configuration.sessionKeys;
  const ignoredLocalKeys = configuration.ignoredLocalKeys;
  const ignoredSessionKeys = configuration.ignoredSessionKeys;
  const target = configuration.target;
  const emit = (event) => {
    if (typeof window.__v4ObservationEvent === "function") window.__v4ObservationEvent(event);
  };
  let closed = false;
  let armed = false;
  let queue = Promise.resolve();
  let initialPromise;
  let projectedSnapshot;
  let targetStatusSubmissionIds = [];
  const stringArray = (value) => Array.isArray(value)
    && value.every((key) => typeof key === "string");
  const validConfiguration = () => stringArray(localKeys)
    && stringArray(sessionKeys)
    && stringArray(ignoredLocalKeys)
    && stringArray(ignoredSessionKeys);
  const reject = (type) => {
    if (closed) return;
    closed = true;
    emit({ type });
  };
  if (!validConfiguration()) {
    reject("observer_value_rejected");
    return;
  }
  const valid = (area, changes) => {
    if (area !== "local" && area !== "session") return false;
    const allowed = new Set(area === "local" ? localKeys : sessionKeys);
    const ignored = new Set(area === "local" ? ignoredLocalKeys : ignoredSessionKeys);
    return Object.keys(changes).every((key) => allowed.has(key) || ignored.has(key));
  };
  const count = (value) => {
    if (value === undefined) return 0;
    if (!Array.isArray(value)) throw new Error("observer_value_rejected");
    return value.length;
  };
  const canonicalIso = (value) => typeof value === "string"
    && Number.isFinite(Date.parse(value))
    && new Date(Date.parse(value)).toISOString() === value;
  const safeIdentifier = (value) => typeof value === "string"
    && /^[A-Za-z0-9_.:/-]{1,200}$/u.test(value);
  const safeCaptureErrors = new Set([
    "ACK mismatch: invalid response", "ACK mismatch: bundle identity",
    "Network request failed", "malformed retained bundle",
    "Storage capacity reached: completed result was not persisted",
    "epoch_control_malformed", "epoch_target_delivery_failed",
    "epoch_started_missing", "epoch_baseline_missing",
    "epoch_identity_conflict", "epoch_timestamp_conflict",
    "epoch_capacity_exceeded", "epoch_result_surface_unchanged",
    "verdict_candidate_adapter_rejected", "verdict_candidate_chronology_mismatch",
  ]);
  const safeCaptureError = (value) => value === undefined
    || (typeof value === "string" && (safeCaptureErrors.has(value)
      || /^HTTP [1-5][0-9]{2}$/u.test(value)
      || /^Isolated result: HTTP [1-5][0-9]{2}$/u.test(value)
      || /^Capability rejected: HTTP 401$/u.test(value)
      || /^Origin rejected: HTTP 403$/u.test(value)
      || /^Network unavailable: Network request failed$/u.test(value)));
  const knownPlatforms = new Set(["leetcode", "nowcoder", "luogu", "codeforces", "atcoder"]);
  const validMethods = new Set(["GET", "POST", "PUT", "DELETE", "PATCH", "HEAD", "OPTIONS"]);
  const validResources = new Set(["main_frame", "sub_frame", "xmlhttprequest", "other"]);
  const validLifecycles = new Set(["before_request", "before_redirect", "response_started", "completed", "error_occurred"]);
  const safeEndpoint = /^[A-Za-z0-9/_-]{1,256}$/u;
  const uiHintKeys = ["schemaVersion", "tier", "kind", "platform", "problemExternalId", "sourceDocumentId", "observedAt"];
  const lifecycleKeys = ["schemaVersion", "tier", "kind", "evidence", "outcome", "stableSubmissionId", "rejectionReason", "receivedAt"];
  const evidenceKeys = ["schemaVersion", "evidenceId", "platform", "tier", "kind", "receivedAt", "tabId", "frameId", "documentId", "adapterVersion", "apiTimeStamp", "requestId", "method", "endpointKey", "resourceType", "lifecycle", "statusCode", "redirectEndpointKey"];
  const onlyKeys = (value, allowed) => typeof value === "object" && value !== null
    && Object.keys(value).every((key) => allowed.includes(key));
  const hasKeys = (value, required) => typeof value === "object" && value !== null
    && required.every((key) => Object.prototype.hasOwnProperty.call(value, key));
  const requiredUiHintKeys = uiHintKeys;
  const requiredLifecycleKeys = lifecycleKeys;
  const requiredEvidenceKeys = ["schemaVersion", "evidenceId", "platform", "tier", "kind", "receivedAt", "tabId", "frameId", "documentId", "adapterVersion", "apiTimeStamp", "requestId", "method", "endpointKey", "resourceType", "lifecycle"];
  const targetProjection = (session) => {
    if (target === undefined) return { counts: { e0: 0, e1: 0, submit: 0, status: 0 } };
    if (typeof target !== "object" || target === null
      || (target.platform !== "leetcode" && target.platform !== "nowcoder")
      || !safeIdentifier(target.problemExternalId)) throw new Error("observer_value_rejected");
    const hints = session.uiHints ?? [];
    const lifecycles = session.transientE1 ?? [];
    if (!Array.isArray(hints) || !Array.isArray(lifecycles)) throw new Error("observer_value_rejected");
    const e0Documents = new Set();
    for (const hint of hints) {
      if (!onlyKeys(hint, uiHintKeys) || !hasKeys(hint, requiredUiHintKeys)) {
        throw new Error("observer_value_rejected");
      }
      const values = {};
      for (const key of requiredUiHintKeys) {
        const descriptor = Object.getOwnPropertyDescriptor(hint, key);
        if (descriptor === undefined || !Object.prototype.hasOwnProperty.call(descriptor, "value")) {
          throw new Error("observer_value_rejected");
        }
        values[key] = descriptor.value;
      }
      if (values.schemaVersion !== 1 || values.tier !== "E0" || values.kind !== "ui_hint"
        || typeof values.platform !== "string" || !knownPlatforms.has(values.platform)
        || !safeIdentifier(values.problemExternalId)
        || !safeIdentifier(values.sourceDocumentId)
        || !canonicalIso(values.observedAt)) throw new Error("observer_value_rejected");
      if (values.platform !== target.platform || values.problemExternalId !== target.problemExternalId
        || e0Documents.has(values.sourceDocumentId)) {
        throw new Error("observer_value_rejected");
      }
      e0Documents.add(values.sourceDocumentId);
    }
    const e0 = e0Documents.size === 0 ? 0 : 1;
    let submit = 0;
    let status = 0;
    const statusSubmissionIds = [];
    for (const lifecycle of lifecycles) {
      if (!onlyKeys(lifecycle, lifecycleKeys) || !hasKeys(lifecycle, requiredLifecycleKeys)
        || lifecycle.schemaVersion !== 1 || lifecycle.tier !== "E1" || lifecycle.kind !== "request_lifecycle"
        || typeof lifecycle.evidence !== "object" || lifecycle.evidence === null
        || !onlyKeys(lifecycle.evidence, evidenceKeys) || !hasKeys(lifecycle.evidence, requiredEvidenceKeys)) throw new Error("observer_value_rejected");
      const evidence = lifecycle.evidence;
      if (evidence.schemaVersion !== 1 || evidence.tier !== "E1" || evidence.kind !== "request_observed"
        || typeof evidence.platform !== "string" || !knownPlatforms.has(evidence.platform)
        || typeof evidence.endpointKey !== "string" || !safeEndpoint.test(evidence.endpointKey)
        || typeof evidence.method !== "string" || !validMethods.has(evidence.method)
        || typeof evidence.resourceType !== "string" || !validResources.has(evidence.resourceType)
        || typeof evidence.lifecycle !== "string" || !validLifecycles.has(evidence.lifecycle)) throw new Error("observer_value_rejected");
      if (target.platform === "leetcode") {
        if (evidence.endpointKey.startsWith("leetcode/submit/")) {
          if (evidence.platform !== "leetcode" || evidence.endpointKey !== `leetcode/submit/cn/${target.problemExternalId}`
            || evidence.method !== "POST" || evidence.resourceType !== "xmlhttprequest") throw new Error("observer_value_rejected");
          submit += 1;
        }
        if (/^leetcode\/(?:result|check)\/cn\/[0-9]{1,20}$/u.test(evidence.endpointKey)) {
          if (evidence.platform !== "leetcode" || evidence.method !== "GET"
            || evidence.resourceType !== "xmlhttprequest") throw new Error("observer_value_rejected");
          status += 1;
          statusSubmissionIds.push(evidence.endpointKey.replace(/^leetcode\/(?:result|check)\//u, ""));
        }
        continue;
      }
      const nowCoderLike = evidence.endpointKey.startsWith("nowcoder/submit") || evidence.endpointKey.startsWith("nowcoder/status");
      if (!nowCoderLike) continue;
      if (evidence.platform !== "nowcoder" || evidence.resourceType !== "xmlhttprequest") throw new Error("observer_value_rejected");
      if (evidence.endpointKey === "nowcoder/submit" && evidence.method === "POST") submit += 1;
      else if (evidence.endpointKey === "nowcoder/status" && evidence.method === "GET") status += 1;
      else throw new Error("observer_value_rejected");
    }
    return {
      counts: { e0, e1: submit + status, submit, status },
      ...(Object.prototype.hasOwnProperty.call(session, "transientE1")
        ? { statusSubmissionIds: statusSubmissionIds.length === 0
          ? []
          : [statusSubmissionIds[statusSubmissionIds.length - 1]] }
        : {}),
    };
  };
  const bindTargetStatusIdentity = (counts, records) => {
    const value = { e0: counts.e0, e1: counts.e1, submit: counts.submit, status: counts.status };
    if (target?.platform === "leetcode" && records.length > 0) {
      value.statusConfirmedMatch = records.length === 1
        && targetStatusSubmissionIds.length === 1
        && targetStatusSubmissionIds[0] === records[0].externalSubmissionId;
    }
    return value;
  };
  const project = (local, session) => {
    if (Object.keys(local).some((key) => !localKeys.includes(key))
      || Object.keys(session).some((key) => !sessionKeys.includes(key))) {
      throw new Error("observer_value_rejected");
    }
    const confirmed = local.confirmedSubmissions;
    const tombstones = local.confirmedSubmissionTombstones;
    if (confirmed !== undefined && !Array.isArray(confirmed)) throw new Error("observer_value_rejected");
    if (tombstones !== undefined && !Array.isArray(tombstones)) throw new Error("observer_value_rejected");
    const records = (confirmed ?? []).map((record) => {
      if (typeof record !== "object" || record === null) throw new Error("observer_value_rejected");
      const keys = Object.keys(record);
      const allowed = ["schemaVersion", "status", "platform", "problemExternalId", "externalSubmissionId", "confirmedAt", "storageKey", "lastE3At", "phase", "finalizedAt"];
      if (keys.some((key) => !allowed.includes(key)) || record.schemaVersion !== 1 || record.status !== "confirmed" || (record.platform !== "leetcode" && record.platform !== "nowcoder") || !safeIdentifier(record.problemExternalId) || !safeIdentifier(record.externalSubmissionId) || !safeIdentifier(record.storageKey) || record.storageKey !== `${record.platform}:${record.externalSubmissionId}` || !canonicalIso(record.confirmedAt) || !canonicalIso(record.lastE3At) || (record.phase !== undefined && !["queued", "judging", "running"].includes(record.phase)) || (record.finalizedAt !== undefined && !canonicalIso(record.finalizedAt))) throw new Error("observer_value_rejected");
      return { platform: record.platform, problemExternalId: record.problemExternalId, externalSubmissionId: record.externalSubmissionId, storageKey: record.storageKey, confirmedAt: record.confirmedAt, lastE3At: record.lastE3At, ...(record.phase === undefined ? {} : { phase: record.phase }), ...(record.finalizedAt === undefined ? {} : { finalizedAt: record.finalizedAt }) };
    });
    const tombstoneItems = (tombstones ?? []).map((record) => {
      if (typeof record !== "object" || record === null || Object.keys(record).some((key) => !["submissionKey", "finalizedAt", "expiresAt"].includes(key)) || !safeIdentifier(record.submissionKey) || !canonicalIso(record.finalizedAt) || !canonicalIso(record.expiresAt)) throw new Error("observer_value_rejected");
      return { submissionKey: record.submissionKey, finalizedAt: record.finalizedAt, expiresAt: record.expiresAt };
    });
    const output = { confirmed: records, tombstones: tombstoneItems, outbox: count(local.captureOutbox), quarantine: count(local.captureQuarantine), session: {} };
    for (const key of sessionKeys) output.session[key] = target === undefined ? count(session[key]) : 0;
    if (local.lastSuccessfulCaptureAt !== undefined && !canonicalIso(local.lastSuccessfulCaptureAt)) throw new Error("observer_value_rejected");
    if (!safeCaptureError(local.lastCaptureError)) throw new Error("observer_value_rejected");
    if (local.lastSuccessfulCaptureAt !== undefined) output.lastSuccessfulCaptureAt = local.lastSuccessfulCaptureAt;
    if (local.lastCaptureError !== undefined) output.lastCaptureError = local.lastCaptureError;
    if (target !== undefined) {
      const projection = targetProjection(session);
      if (projection.statusSubmissionIds !== undefined) {
        targetStatusSubmissionIds = projection.statusSubmissionIds;
      }
      output.target = bindTargetStatusIdentity(projection.counts, records);
    }
    return output;
  };
  const read = async () => {
    const [local, session] = await Promise.all([
      chrome.storage.local.get(localKeys),
      chrome.storage.session.get(sessionKeys),
    ]);
    return project(local, session);
  };
  const onChanged = (changes, area) => {
    if (closed) return;
    if (!valid(area, changes)) {
      reject("observer_storage_key_rejected");
      return;
    }
    queue = queue.then(async () => {
      try {
        await initialPromise;
        if (closed) return;
        const next = { ...projectedSnapshot, confirmed: [...projectedSnapshot.confirmed], tombstones: [...projectedSnapshot.tombstones], session: { ...projectedSnapshot.session } };
        const ignored = new Set(area === "local" ? ignoredLocalKeys : ignoredSessionKeys);
        for (const key of Object.keys(changes)) {
          if (ignored.has(key)) continue;
          const change = changes[key];
          if (typeof change !== "object" || change === null) throw new Error("observer_value_rejected");
          const value = Reflect.get(change, "newValue");
          if (area === "session") {
            if (value !== undefined && !Array.isArray(value)) throw new Error("observer_value_rejected");
            next.session[key] = target === undefined ? (value === undefined ? 0 : value.length) : 0;
            if (target !== undefined && (key === "uiHints" || key === "transientE1")) {
              const projection = targetProjection({
                uiHints: key === "uiHints" ? value : [],
                transientE1: key === "transientE1" ? value : [],
              });
              if (key === "transientE1" && projection.statusSubmissionIds !== undefined) {
                targetStatusSubmissionIds = projection.statusSubmissionIds;
              }
              next.target = key === "uiHints"
                ? { ...(next.target ?? { e0: 0, e1: 0, submit: 0, status: 0 }), e0: projection.counts.e0 }
                : { ...(next.target ?? { e0: 0, e1: 0, submit: 0, status: 0 }), e1: projection.counts.e1, submit: projection.counts.submit, status: projection.counts.status };
            }
          } else if (key === "confirmedSubmissions" || key === "confirmedSubmissionTombstones") {
            const local = {};
            local[key] = value;
            const projected = project(key === "confirmedSubmissions" ? local : {}, key === "confirmedSubmissionTombstones" ? {} : {});
            if (key === "confirmedSubmissions") next.confirmed = projected.confirmed;
            else {
              const tombstoneLocal = { confirmedSubmissionTombstones: value };
              next.tombstones = project(tombstoneLocal, {}).tombstones;
            }
          } else if (key === "captureOutbox" || key === "captureQuarantine") {
            if (value !== undefined && !Array.isArray(value)) throw new Error("observer_value_rejected");
            next[key === "captureOutbox" ? "outbox" : "quarantine"] = value === undefined ? 0 : value.length;
          } else if (key === "lastSuccessfulCaptureAt") {
            if (value !== undefined && !canonicalIso(value)) throw new Error("observer_value_rejected");
            if (value === undefined) delete next.lastSuccessfulCaptureAt; else next.lastSuccessfulCaptureAt = value;
          } else if (key === "lastCaptureError") {
            if (!safeCaptureError(value)) throw new Error("observer_value_rejected");
            if (value === undefined) delete next.lastCaptureError; else next.lastCaptureError = value;
          }
        }
        if (target !== undefined && next.target !== undefined) {
          next.target = bindTargetStatusIdentity(next.target, next.confirmed);
        }
         projectedSnapshot = next;
        emit({ type: "snapshot", snapshot: next });
      } catch {
        reject("observer_value_rejected");
      }
    });
  };
  chrome.storage.onChanged.addListener(onChanged);
  initialPromise = read().then((snapshot) => {
    if (closed) return;
    projectedSnapshot = snapshot;
    armed = true;
    emit({ type: "observer_armed", snapshot });
  }).catch(() => reject("observer_value_rejected"));
  window.addEventListener("pagehide", () => reject("observer_page_closed"), { once: true });
  void armed;
}

/**
 * Testable controller equivalent of the page entrypoint.  It intentionally
 * owns both storage listeners and serializes snapshots so short-lived
 * consecutive changes cannot be dropped.
 */
export function createStorageObserverController({ storage, emit, target }) {
  let closed = false;
  let armed = false;
  let queue = Promise.resolve();
  let listener;
  let snapshot;
  const close = (type) => {
    if (closed) return;
    closed = true;
    emit({ type });
    if (listener !== undefined) storage.onChanged.removeListener?.(listener);
  };
  const read = async () => {
    const [local, session] = await Promise.all([
      storage.local.get(EXACT_LOCAL_SNAPSHOT_KEYS),
      storage.session.get(EXACT_SESSION_SNAPSHOT_KEYS),
    ]);
    const result = projectSafeSnapshot({ local, session }, target);
    if (!result.ok) {
      close(result.reason);
      throw new Error(result.reason);
    }
    return result.value;
  };
  const onChanged = (changes, areaName) => {
    if (closed) return;
    const validation = validateStorageChange(areaName, changes);
    if (!validation.ok) {
      close(validation.reason);
      return;
    }
    queue = queue.then(async () => {
      if (closed) return;
      try {
        const result = applySafeStorageChange(snapshot, areaName, changes, target);
        if (!result.ok) {
          close(result.reason);
          return;
        }
        snapshot = result.value;
        emit({ type: "snapshot", snapshot });
      } catch {
        // `read` emits the fixed rejection and closes the controller.
      }
    });
  };
  listener = (changes, areaName) => onChanged(changes, areaName);
  return {
    async arm() {
      if (closed || armed) throw new Error("observer_not_armed");
      storage.onChanged.addListener(listener);
      try {
        const initialSnapshot = await read();
        if (closed) throw new Error("observer_value_rejected");
        snapshot = initialSnapshot;
        armed = true;
        emit({ type: "observer_armed", snapshot: initialSnapshot });
      } catch (error) {
        if (!closed) close("observer_value_rejected");
        throw error;
      }
    },
    close: () => close("observer_page_closed"),
    flush: async () => {
      await queue;
    },
    get closed() {
      return closed;
    },
    get armed() {
      return armed;
    },
  };
}

void cloneForScript;
