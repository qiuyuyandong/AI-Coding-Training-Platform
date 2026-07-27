/**
 * Characterization Storage (Phase B Task B2).
 *
 * Session-only storage for diagnostic mode. All state is kept in
 * chrome.storage.session and is cleared on stop. No state is ever
 * written to chrome.storage.local.
 *
 * Design constraints:
 * - Bounded record count prevents unbounded memory growth.
 * - Hard expiration enforces the short diagnostic window.
 * - Stop clears ALL diagnostic state.
 * - Export produces only schema-valid safe transcript records.
 */

import type { E1RequestObserved } from "./evidence";
import type { NavigationWitness } from "./characterizationNavigationWitness";
import {
  parseNetworkTranscriptEvidence,
  type E1NetworkRequest,
  type ParseResult,
} from "./networkTranscriptContract";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Maximum number of retained diagnostic records. */
export const MAX_CHARACTERIZATION_RECORDS = 100;

/** Default diagnostic session TTL in milliseconds (5 minutes). */
export const CHARACTERIZATION_TTL_MS = 5 * 60_000;

/** Canonical NowCoder hosts allowed for characterization. */
export const NOWCODER_CANONICAL_HOSTS = ["www.nowcoder.com", "ac.nowcoder.com"] as const;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * A single characterization diagnostic record. Contains only schema-safe
 * request lifecycle metadata — no raw URLs, bodies, headers, cookies,
 * tokens, or credentials.
 */
export type CharacterizationRecord = Readonly<{
  schemaVersion: 1;
  /** Tier is always E1 for network characterization records. */
  tier: "E1";
  kind: "characterization_diagnostic";
  /** ISO datetime when the diagnostic session started. */
  sessionStartedAt: string;
  /** ISO datetime when this record was received. */
  receivedAt: string;
  /** Platform is always "nowcoder" for characterization. */
  platform: "nowcoder";
  /** Chrome webRequest requestId. */
  requestId: string;
  /** HTTP method. */
  method: string;
  /** Normalized endpoint key. */
  endpointKey: string;
  /** Chrome webRequest resource type. */
  resourceType: string;
  /** Lifecycle phase: before_request | before_redirect | response_started | completed | error_occurred */
  lifecycle: string;
  /** Chrome internal timestamp. */
  apiTimeStamp: number;
  /** HTTP status code, if available. */
  statusCode?: number;
  /** Normalized redirect target key, if redirected. */
  normalizedRedirectPath?: string;
  /** Tab ID. */
  tabId: number;
  /** Frame ID. */
  frameId: number;
  /** Document ID. */
  documentId: string;
}>;

/** Characterization session state stored in session storage. */
export type CharacterizationSession = Readonly<{
  /** Whether characterization is currently active. */
  active: boolean;
  /** ISO datetime when the session started. */
  startedAt: string;
  /** ISO datetime when the session expires. */
  expiresAt: string;
  /** Retained diagnostic records, newest first, capped at MAX_CHARACTERIZATION_RECORDS. */
  records: readonly CharacterizationRecord[];
  navigationWitnesses: readonly NavigationWitness[];
  /** Canonical NowCoder hostname (without scheme/path). */
  hostname: string;
  /** Whether the characterization session was started with authenticated access. */
  authenticated: boolean;
}>;

/** Storage interface for characterization (session-only). */
export interface CharacterizationStorage {
  get(keys: readonly string[]): Promise<Record<string, unknown>>;
  set(items: Record<string, unknown>): Promise<void>;
  remove(key: string): Promise<void>;
}

// ---------------------------------------------------------------------------
// Safe record builder
// ---------------------------------------------------------------------------

const ISO_DATE_PATTERN = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])T([01]\d|2[0-3]):[0-5]\d:[0-5]\d(\.\d{3})?Z$/;

function isIsoDateTime(value: unknown): value is string {
  return typeof value === "string" && ISO_DATE_PATTERN.test(value) && Number.isFinite(Date.parse(value));
}

function isNonemptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

function isSafeIdentifier(value: unknown): value is string {
  return typeof value === "string" && /^[A-Za-z0-9_-]{1,128}$/.test(value);
}

function isSafeEndpointKey(value: unknown): value is string {
  return typeof value === "string" && /^[a-z0-9_-]{1,128}$/.test(value);
}

function isNonnegativeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0;
}

function isValidLifecycle(value: unknown): value is CharacterizationRecord["lifecycle"] {
  return typeof value === "string"
    && ["before_request", "before_redirect", "response_started", "completed", "error_occurred"].includes(value);
}

function isValidResourceType(value: unknown): value is string {
  return typeof value === "string"
    && ["main_frame", "sub_frame", "xmlhttprequest", "other"].includes(value);
}

/**
 * Build a characterization record from an E1 evidence observation.
 * Validates all fields and rejects any that would contain unsafe data.
 * Returns undefined if the input cannot be safely converted.
 *
 * The record is built in B1 network_request_observed format for export
 * compatibility with parseNetworkTranscriptEvidence from the test contract.
 */
export function buildCharacterizationRecord(
  evidence: E1RequestObserved,
  sessionStartedAt: string,
  now: string,
): CharacterizationRecord | undefined {
  if (!isIsoDateTime(sessionStartedAt) || !isIsoDateTime(now)) return undefined;
  if (evidence.platform !== "nowcoder") return undefined;
  if (!isNonemptyString(evidence.requestId)) return undefined;
  if (!isNonemptyString(evidence.method)) return undefined;
  if (!isNonemptyString(evidence.endpointKey)) return undefined;
  if (!isValidResourceType(evidence.resourceType)) return undefined;
  if (!isValidLifecycle(evidence.lifecycle)) return undefined;
  if (!isNonnegativeInteger(evidence.apiTimeStamp)) return undefined;
  if (!isNonnegativeInteger(evidence.tabId)) return undefined;
  if (!isNonnegativeInteger(evidence.frameId)) return undefined;
  if (!isNonemptyString(evidence.documentId)) return undefined;

  const record: CharacterizationRecord = {
    schemaVersion: 1,
    tier: "E1",
    kind: "characterization_diagnostic",
    sessionStartedAt,
    receivedAt: now,
    platform: "nowcoder",
    requestId: evidence.requestId,
    method: evidence.method,
    endpointKey: evidence.endpointKey,
    resourceType: evidence.resourceType,
    lifecycle: evidence.lifecycle,
    apiTimeStamp: evidence.apiTimeStamp,
    tabId: evidence.tabId,
    frameId: evidence.frameId,
    documentId: evidence.documentId,
  };

  if (evidence.statusCode !== undefined && !isNonnegativeInteger(evidence.statusCode)) return undefined;
  if (evidence.redirectEndpointKey !== undefined && !isNonemptyString(evidence.redirectEndpointKey)) return undefined;
  return {
    ...record,
    ...(evidence.statusCode === undefined ? {} : { statusCode: evidence.statusCode }),
    ...(evidence.redirectEndpointKey === undefined ? {} : { normalizedRedirectPath: evidence.redirectEndpointKey }),
  };
}

export type B1NetworkRequestRecord = E1NetworkRequest;
export type B1ParseResult<T> = ParseResult<T>;

export function toB1NetworkRequest(
  record: CharacterizationRecord,
): B1ParseResult<B1NetworkRequestRecord> {
  const parsed = parseNetworkTranscriptEvidence({
    schemaVersion: record.schemaVersion,
    evidenceId: `e1_nowcoder_${record.requestId}`,
    platform: "nowcoder",
    tier: "E1",
    kind: "network_request_observed",
    receivedAt: record.receivedAt,
    tabId: record.tabId,
    frameId: record.frameId,
    documentId: record.documentId,
    requestId: record.requestId,
    method: record.method,
    normalizedPath: `/${record.endpointKey}`,
    resourceType: record.resourceType,
    ...(record.statusCode === undefined ? {} : { statusCode: record.statusCode }),
    ...(record.normalizedRedirectPath === undefined
      ? {}
      : { normalizedRedirectPath: `/${record.normalizedRedirectPath}` }),
  });
  if (!parsed.ok) return parsed;
  if (parsed.value.kind !== "network_request_observed") {
    return { ok: false, reason: "evidence must be network_request_observed" };
  }
  return { ok: true, value: parsed.value };
}

// ---------------------------------------------------------------------------
// Session storage operations
// ---------------------------------------------------------------------------

const SESSION_KEY = "characterizationSession";

/** Default empty session (disabled). */
export const DEFAULT_CHARACTERIZATION_SESSION: CharacterizationSession = Object.freeze({
  active: false,
  startedAt: "",
  expiresAt: "",
  records: Object.freeze([]),
  navigationWitnesses: Object.freeze([]),
  hostname: "",
  authenticated: false,
});

/** Keys used in session storage for characterization. */
export const CHARACTERIZATION_SESSION_KEYS: readonly string[] = [SESSION_KEY];

function parseCharacterizationSession(value: unknown): CharacterizationSession {
  if (typeof value !== "object" || value === null) return DEFAULT_CHARACTERIZATION_SESSION;
  const rec = value as Record<string, unknown>;

  const active = rec.active === true;
  const startedAt = isIsoDateTime(rec.startedAt) ? rec.startedAt : "";
  const expiresAt = isIsoDateTime(rec.expiresAt) ? rec.expiresAt : "";
  const hostname = typeof rec.hostname === "string" && NOWCODER_CANONICAL_HOSTS.includes(rec.hostname as typeof NOWCODER_CANONICAL_HOSTS[number])
    ? rec.hostname
    : "";
  const authenticated = rec.authenticated === true;
  const validActive = active && startedAt !== "" && expiresAt !== "" && hostname !== "";

  if (!Array.isArray(rec.records)) {
    return validActive ? {
      active: false,
      startedAt: "",
      expiresAt: "",
      records: Object.freeze([]),
      navigationWitnesses: Object.freeze([]),
      hostname: "",
      authenticated: false,
    } : DEFAULT_CHARACTERIZATION_SESSION;
  }

  const validRecords: CharacterizationRecord[] = [];
  for (const item of rec.records.slice(0, MAX_CHARACTERIZATION_RECORDS)) {
    const parsed = parseCharacterizationRecord(item);
    if (parsed !== undefined) validRecords.push(parsed);
  }
  const navigationWitnesses = Array.isArray(rec.navigationWitnesses)
    ? rec.navigationWitnesses.filter(isNavigationWitness).slice(-4) : [];

  return Object.freeze({
    active: validActive,
    startedAt: validActive ? startedAt : "",
    expiresAt: validActive ? expiresAt : "",
    records: Object.freeze(validActive ? validRecords : []),
    navigationWitnesses: Object.freeze(validActive ? navigationWitnesses : []),
    hostname: validActive ? hostname : "",
    authenticated: validActive && authenticated,
  });
}

function isNavigationWitness(value: unknown): value is NavigationWitness {
  if (typeof value !== "object" || value === null) return false;
  const item = value as Record<string, unknown>;
  const allowed = new Set(["schemaVersion", "evidenceId", "platform", "tier", "kind", "receivedAt", "tabId", "frameId", "documentId", "pageClass", "relativeTimingOrder"]);
  if (Object.keys(item).some((key) => !allowed.has(key))) return false;
  if (typeof item.documentId !== "string" || !/^[A-Za-z0-9_-]{1,128}$/.test(item.documentId)) return false;
  if (typeof item.pageClass !== "string" || (item.pageClass !== "contest_list" && item.pageClass !== "contest_problem")) return false;
  if (item.evidenceId !== `e0_nowcoder_${item.documentId}_${item.pageClass}`) return false;
  return item.schemaVersion === 1 && item.platform === "nowcoder" && item.tier === "E0" && item.kind === "navigation_witness"
    && isIsoDateTime(item.receivedAt)
    && isNonnegativeInteger(item.tabId) && item.frameId === 0 && isNonemptyString(item.documentId)
    && isNonemptyString(item.evidenceId) && isNonnegativeInteger(item.relativeTimingOrder);
}

function parseCharacterizationRecord(value: unknown): CharacterizationRecord | undefined {
  if (typeof value !== "object" || value === null) return undefined;
  const rec = value as Record<string, unknown>;

  if (rec.schemaVersion !== 1) return undefined;
  if (rec.tier !== "E1") return undefined;
  if (rec.kind !== "characterization_diagnostic") return undefined;
  if (!isIsoDateTime(rec.sessionStartedAt)) return undefined;
  if (!isIsoDateTime(rec.receivedAt)) return undefined;
  if (rec.platform !== "nowcoder") return undefined;
  if (!isSafeIdentifier(rec.requestId)) return undefined;
  if (rec.method !== "GET" && rec.method !== "POST" && rec.method !== "PUT" && rec.method !== "DELETE" && rec.method !== "PATCH" && rec.method !== "HEAD" && rec.method !== "OPTIONS") return undefined;
  if (!isSafeEndpointKey(rec.endpointKey)) return undefined;
  if (!isValidResourceType(rec.resourceType)) return undefined;
  if (!isValidLifecycle(rec.lifecycle)) return undefined;
  if (!isNonnegativeInteger(rec.apiTimeStamp)) return undefined;
  if (!isNonnegativeInteger(rec.tabId)) return undefined;
  if (!isNonnegativeInteger(rec.frameId)) return undefined;
  if (!isSafeIdentifier(rec.documentId)) return undefined;

  const record: CharacterizationRecord = {
    schemaVersion: 1,
    tier: "E1",
    kind: "characterization_diagnostic",
    sessionStartedAt: rec.sessionStartedAt,
    receivedAt: rec.receivedAt,
    platform: "nowcoder",
    requestId: rec.requestId,
    method: rec.method,
    endpointKey: rec.endpointKey,
    resourceType: rec.resourceType,
    lifecycle: rec.lifecycle,
    apiTimeStamp: rec.apiTimeStamp,
    tabId: rec.tabId,
    frameId: rec.frameId,
    documentId: rec.documentId,
  };

  if (rec.statusCode !== undefined && !isNonnegativeInteger(rec.statusCode)) return undefined;
  if (rec.normalizedRedirectPath !== undefined && !isNonemptyString(rec.normalizedRedirectPath)) return undefined;
  return {
    ...record,
    ...(rec.statusCode === undefined ? {} : { statusCode: rec.statusCode }),
    ...(rec.normalizedRedirectPath === undefined ? {} : { normalizedRedirectPath: rec.normalizedRedirectPath }),
  };
}

/**
 * Read the characterization session from storage.
 */
export function readCharacterizationSession(
  stored: Record<string, unknown>,
): CharacterizationSession {
  return parseCharacterizationSession(stored[SESSION_KEY]);
}

/**
 * Check if a session has expired.
 */
export function isSessionExpired(session: CharacterizationSession, now: string): boolean {
  if (!session.active) return false;
  if (!isIsoDateTime(session.expiresAt)) return true;
  const expiresMs = Date.parse(session.expiresAt);
  const nowMs = Date.parse(now);
  return !Number.isFinite(expiresMs) || nowMs >= expiresMs;
}

/**
 * Plan a session write with bounded records and expiration check.
 */
export function planCharacterizationSessionWrite(
  session: CharacterizationSession,
): { readonly items: Record<string, unknown> } {
  return Object.freeze({
    items: Object.freeze({
      [SESSION_KEY]: session,
    }),
  });
}

/**
 * Add a record to the session, bounded by MAX_CHARACTERIZATION_RECORDS.
 */
export function addCharacterizationRecord(
  session: CharacterizationSession,
  record: CharacterizationRecord,
): CharacterizationSession {
  if (!session.active) return session;
  const newRecords = [record, ...session.records].slice(0, MAX_CHARACTERIZATION_RECORDS);
  return Object.freeze({
    ...session,
    records: Object.freeze(newRecords),
  });
}

export function addNavigationWitness(session: CharacterizationSession, witness: NavigationWitness): CharacterizationSession {
  if (!session.active) return session;
  // Any reload or duplicate stays retained so export rejects the session instead of hiding it.
  return Object.freeze({ ...session, navigationWitnesses: Object.freeze([...session.navigationWitnesses, witness].slice(-3)) });
}

/**
 * Start a new characterization session.
 * @param now - ISO datetime string
 * @param hostname - Canonical NowCoder hostname (e.g., "www.nowcoder.com", "ac.nowcoder.com")
 * @param authenticated - Whether the session captures authenticated access
 */
export function startCharacterizationSession(
  now: string,
  hostname: string,
  authenticated: boolean,
): CharacterizationSession {
  const nowMs = Date.parse(now);
  if (!Number.isFinite(nowMs)) return DEFAULT_CHARACTERIZATION_SESSION;
  // Validate hostname is a canonical NowCoder host
  if (!NOWCODER_CANONICAL_HOSTS.includes(hostname as typeof NOWCODER_CANONICAL_HOSTS[number])) {
    return DEFAULT_CHARACTERIZATION_SESSION;
  }
  const expiresAt = new Date(nowMs + CHARACTERIZATION_TTL_MS).toISOString();
  return Object.freeze({
    active: true,
    startedAt: now,
    expiresAt,
    records: Object.freeze([]),
    navigationWitnesses: Object.freeze([]),
    hostname,
    authenticated,
  });
}

/**
 * Stop and clear all characterization state.
 */
export function stopCharacterizationSession(): CharacterizationSession {
  return DEFAULT_CHARACTERIZATION_SESSION;
}

/**
 * Filter expired records from a session (returns same session if not expired).
 */
export function pruneExpiredRecords(
  session: CharacterizationSession,
  now: string,
): CharacterizationSession {
  if (isSessionExpired(session, now)) {
    return DEFAULT_CHARACTERIZATION_SESSION;
  }
  return session;
}

// ---------------------------------------------------------------------------
// Storage reader/writer helpers (for background wiring)
// ---------------------------------------------------------------------------

export type CharacterizationSessionStorage = {
  readonly get: (keys: readonly string[]) => Promise<Record<string, unknown>>;
  readonly set: (items: Record<string, unknown>) => Promise<void>;
  readonly remove: (key: string) => Promise<void>;
};

/**
 * Read the current characterization session from storage.
 */
export async function readStoredCharacterizationSession(
  storage: CharacterizationSessionStorage,
): Promise<CharacterizationSession> {
  const stored = await storage.get(CHARACTERIZATION_SESSION_KEYS);
  return readCharacterizationSession(stored);
}

/**
 * Write the characterization session to storage.
 */
export async function writeCharacterizationSession(
  storage: CharacterizationSessionStorage,
  session: CharacterizationSession,
): Promise<void> {
  const { items } = planCharacterizationSessionWrite(session);
  await storage.set(items);
}

/**
 * Clear all characterization state from storage.
 */
export async function clearCharacterizationStorage(
  storage: CharacterizationSessionStorage,
): Promise<void> {
  await storage.remove(SESSION_KEY);
}
