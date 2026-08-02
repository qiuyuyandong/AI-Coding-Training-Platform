/**
 * Characterization Mode (Phase B Task B2).
 *
 * A pure module that implements the characterization-only diagnostic mode.
 * It is disabled by default and after reload; scoped exactly to NowCoder;
 * uses a hard short expiry; session-only state; and never affects E2/bundle/
 * attempt/readiness from diagnostic events.
 *
 * Design constraints:
 * - Characterization events never flow into the production state machine.
 * - No direct chrome.* calls — all I/O is through the injected storage.
 * - Export produces only schema-valid safe transcript records.
 * - Start must not accept arbitrary platform.
 */

import type {
  CharacterizationSession,
  CharacterizationSessionStorage,
  B1NetworkRequestRecord,
} from "./characterizationStorage";
import {
  startCharacterizationSession,
  stopCharacterizationSession,
  addCharacterizationRecord,
  addNavigationWitness,
  pruneExpiredRecords,
  isSessionExpired,
  readCharacterizationSession,
  planCharacterizationSessionWrite,
  MAX_CHARACTERIZATION_RECORDS,
  CHARACTERIZATION_TTL_MS,
  toB1NetworkRequest,
  characterizationPlatformForHostname,
  isCharacterizationPlatform,
} from "./characterizationStorage";
import {
  type NavigationWitness,
} from "./characterizationNavigationWitness";
import type { B3Status } from "./b3Witness";
import type { E1RequestObserved } from "./evidence";
import { buildCharacterizationRecord } from "./characterizationStorage";
import {
  parseNetworkTranscriptDocument,
  type E0NavigationWitness,
  type NetworkTranscriptDocument,
} from "./networkTranscriptContract";

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/** Actions that can be applied to the characterization mode. */
export type CharacterizationAction =
  | { readonly type: "characterization_start"; readonly hostname: string; readonly authenticated: boolean }
  | { readonly type: "characterization_stop" }
  | { readonly type: "characterization_collect"; readonly hostname: string; readonly evidence: E1RequestObserved }
  | { readonly type: "characterization_navigation_witness"; readonly witness: NavigationWitness }
  | { readonly type: "characterization_export" };

/** Result of an export action. Exports B1 network_request_observed format. */
export type CharacterizationExportResult =
  | {
    readonly ok: true;
    readonly document: CharacterizationExportDocument;
    readonly records: readonly B1NetworkRequestRecord[];
  }
  | { readonly ok: false; readonly reason: string };

/** Complete safe B1 transcript document, suitable for an explicit local export. */
export type CharacterizationExportDocument = NetworkTranscriptDocument;

/** Effects produced by applying a characterization action. */
export type CharacterizationEffects = Readonly<{
  /** Updated session state (can be used to persist). */
  session: CharacterizationSession;
  /** Export result, if the action was export. */
  exportResult?: CharacterizationExportResult;
}>;

export type CharacterizationExportMode = "b3_browse_only" | "b1_network";

/**
 * B3 owns the browse-only window until its two-page witness is complete.
 * Once ready, subsequent network evidence belongs to B4 and must be retained.
 */
export function shouldCollectCharacterizationEvidence(
  b3Status: B3Status,
): boolean {
  return b3Status === "ready";
}

/**
 * B3 is a zero-network navigation witness. As soon as a safe network record
 * exists, the diagnostic must export the B1 transcript instead of allowing the
 * ready B3 state to shadow the submission evidence.
 */
export function selectCharacterizationExportMode(
  b3CanExport: boolean,
  networkRecordCount: number,
): CharacterizationExportMode {
  return b3CanExport && networkRecordCount === 0
    ? "b3_browse_only"
    : "b1_network";
}

// ---------------------------------------------------------------------------
// Pure session controller
// ---------------------------------------------------------------------------

/**
 * Apply a characterization action to the current session and return effects.
 * This function is pure — no chrome.* calls, no I/O.
 *
 * @param action - The characterization action to apply.
 * @param session - The current characterization session.
 * @param now - The current ISO datetime string.
 * @returns The effects describing state changes and any export result.
 */
export function applyCharacterizationAction(
  action: CharacterizationAction,
  session: CharacterizationSession,
  now: string,
): CharacterizationEffects {
  // Prune expired session first.
  const pruned = pruneExpiredRecords(session, now);
  if (pruned !== session) {
    return { session: pruned };
  }

  switch (action.type) {
    case "characterization_start":
      return handleStart(pruned, now, action.hostname, action.authenticated);
    case "characterization_stop":
      return handleStop();
    case "characterization_collect":
      return handleCollect(pruned, action.evidence, action.hostname, now);
    case "characterization_navigation_witness":
      return { session: addNavigationWitness(pruned, action.witness) };
    case "characterization_export":
      return handleExport(pruned, now);
  }
}

function handleStart(
  session: CharacterizationSession,
  now: string,
  hostname: string,
  authenticated: boolean,
): CharacterizationEffects {
  // If already active, return current session (idempotent)
  if (session.active && !isSessionExpired(session, now)) {
    return { session };
  }
  // Start a fresh session with the provided hostname and authenticated flag
  const next = startCharacterizationSession(now, hostname, authenticated);
  return { session: next };
}

function handleStop(
): CharacterizationEffects {
  // Stop clears all state
  const next = stopCharacterizationSession();
  return { session: next };
}

function handleCollect(
  session: CharacterizationSession,
  evidence: E1RequestObserved,
  hostname: string,
  now: string,
): CharacterizationEffects {
  // Only collect if active and not expired
  if (!session.active || isSessionExpired(session, now) || hostname !== session.hostname) {
    return { session };
  }

  if (session.platform === "" || evidence.platform !== session.platform) {
    return { session };
  }

  // Build a safe characterization record
  const record = buildCharacterizationRecord(evidence, session.startedAt, now);
  if (record === undefined) {
    return { session };
  }

  // Add the record with bounded retention
  const next = addCharacterizationRecord(session, record);
  return { session: next };
}

function handleExport(
  session: CharacterizationSession,
  now: string,
): CharacterizationEffects {
  const pruned = pruneExpiredRecords(session, now);
  // Transform characterization records to B1 network_request_observed format
  // for strict transcript-compatible export
  const b1Records: B1NetworkRequestRecord[] = [];
  for (const record of pruned.records) {
    const b1Result = toB1NetworkRequest(record);
    if (!b1Result.ok) {
      // Return safe error instead of silent drop
      return {
        session: pruned,
        exportResult: { ok: false, reason: `record conversion failed: ${b1Result.reason}` },
      };
    }
    b1Records.push(b1Result.value);
  }

  if (b1Records.length === 0 && pruned.navigationWitnesses.length === 0) {
    return { session: pruned, exportResult: { ok: false, reason: "no records to export" } };
  }

  const document = b1Records.length > 0
    ? createCharacterizationExportDocument(b1Records, now, session.hostname, session.authenticated)
    : createBrowseOnlyNavigationExportDocument(pruned.navigationWitnesses, now, session.hostname, session.authenticated);
  if (document === undefined) {
    return { session: pruned, exportResult: { ok: false, reason: "export document validation failed" } };
  }
  return { session: pruned, exportResult: { ok: true, document, records: b1Records } };
}

/**
 * Build the closed B1 document shape rather than exporting an unframed array.
 * The companion unit test validates this exact output with B1's real parser.
 */
export function createCharacterizationExportDocument(
  records: readonly B1NetworkRequestRecord[],
  now: string,
  hostname: string,
  authenticated: boolean,
): CharacterizationExportDocument | undefined {
  if (!/^\d{4}-\d{2}-\d{2}T/.test(now) || records.length === 0) return undefined;
  const platform = characterizationPlatformForHostname(hostname);
  if (platform === undefined || records.some((record) => record.platform !== platform)) {
    return undefined;
  }
  const signals = Object.freeze([
    Object.freeze({ kind: "network_request_observed", platform, tier: "E1" }),
  ]);
  // sourceUrl uses the actual hostname from the session
  const sourceUrl = `https://${hostname}/`;
  // evidenceTier is authenticated-characterization only when authenticated === true
  const evidenceTier =
    authenticated ? "authenticated-characterization" : "characterization-derived";
  const document = {
    meta: Object.freeze({
      fixtureName: `${platform}-characterization-${now.slice(0, 10)}`,
      sourceUrl,
      captureDate: now.slice(0, 10),
      captureMethod: "extension characterization export",
      authenticated,
      sanitized: true,
      evidenceTier,
      productionEligible: false,
      signals,
    }),
    evidence: Object.freeze([...records]),
  };
  const parsed = parseNetworkTranscriptDocument(document);
  return parsed.ok ? parsed.value : undefined;
}

export function createBrowseOnlyNavigationExportDocument(
  witnesses: readonly NavigationWitness[],
  now: string,
  hostname: string,
  authenticated: boolean,
): CharacterizationExportDocument | undefined {
  if (!/^\d{4}-\d{2}-\d{2}T/.test(now) || hostname !== "ac.nowcoder.com") return undefined;
  if (witnesses.length !== 2) return undefined;
  const list = witnesses.find((item) => item.pageClass === "contest_list");
  const problem = witnesses.find((item) => item.pageClass === "contest_problem");
  if (list === undefined || problem === undefined || list.tabId !== problem.tabId
    || list.documentId === problem.documentId || list.relativeTimingOrder >= problem.relativeTimingOrder) return undefined;
  const evidence: readonly E0NavigationWitness[] = Object.freeze([list, problem]);
  const document = {
    meta: {
      fixtureName: `nowcoder-browse-only-${now.slice(0, 10)}`,
      sourceUrl: "https://ac.nowcoder.com/",
      captureDate: now.slice(0, 10),
      captureMethod: "extension characterization export",
      authenticated,
      sanitized: true,
      evidenceTier: authenticated ? "authenticated-characterization" : "characterization-derived",
      productionEligible: false,
      signals: [{ kind: "navigation_witness", platform: "nowcoder", tier: "E0" }],
    },
    evidence,
  };
  const parsed = parseNetworkTranscriptDocument(document);
  return parsed.ok ? parsed.value : undefined;
}

// ---------------------------------------------------------------------------
// Session storage interface (for background wiring)
// ---------------------------------------------------------------------------

/**
 * Create a characterization controller with injected storage.
 * The controller provides async methods that handle the full read-modify-write
 * cycle for session storage.
 *
 * Expired sessions are pruned on every entry point (start, getSession, export,
 * isActive). When an expired session is detected, it is replaced with the
 * default inactive session and written back to storage.
 */
export function createCharacterizationController(
  storage: CharacterizationSessionStorage,
  now: () => string,
): CharacterizationController {
  async function readCurrent(timestamp: string): Promise<CharacterizationSession> {
    const stored = await storage.get(["characterizationSession"]);
    const current = readCharacterizationSession(stored);
    if (!isSessionExpired(current, timestamp)) {
      // Rewrite the parsed session so malformed stored values are never retained.
      await storage.set(planCharacterizationSessionWrite(current).items);
      return current;
    }
    await storage.remove("characterizationSession");
    return stopCharacterizationSession();
  }

  return Object.freeze({
    start: async (hostname: string, authenticated: boolean): Promise<CharacterizationSession> => {
      const timestamp = now();
      const current = await readCurrent(timestamp);
      const effects = applyCharacterizationAction({ type: "characterization_start", hostname, authenticated }, current, timestamp);
      const { items } = planCharacterizationSessionWrite(effects.session);
      await storage.set(items);
      return effects.session;
    },
    stop: async (): Promise<CharacterizationSession> => {
      const next = stopCharacterizationSession();
      const { items } = planCharacterizationSessionWrite(next);
      await storage.set(items);
      return next;
    },
    collect: async (evidence: E1RequestObserved, hostname: string): Promise<void> => {
      const timestamp = now();
      const current = await readCurrent(timestamp);
      const effects = applyCharacterizationAction({ type: "characterization_collect", evidence, hostname }, current, timestamp);
      const { items } = planCharacterizationSessionWrite(effects.session);
      await storage.set(items);
    },
    recordNavigationWitness: async (witness: NavigationWitness): Promise<void> => {
      const timestamp = now();
      const current = await readCurrent(timestamp);
      // The serialized controller owns ordering; sender callbacks cannot supply it.
      const orderedWitness: NavigationWitness = {
        ...witness,
        relativeTimingOrder: current.navigationWitnesses.length,
      };
      const effects = applyCharacterizationAction({ type: "characterization_navigation_witness", witness: orderedWitness }, current, timestamp);
      const { items } = planCharacterizationSessionWrite(effects.session);
      await storage.set(items);
    },
    export: async (): Promise<CharacterizationExportResult> => {
      const timestamp = now();
      const current = await readCurrent(timestamp);
      const effects = applyCharacterizationAction({ type: "characterization_export" }, current, timestamp);
      const { items } = planCharacterizationSessionWrite(effects.session);
      await storage.set(items);
      return effects.exportResult ?? { ok: false, reason: "export failed" };
    },
    getSession: async (): Promise<CharacterizationSession> => {
      return readCurrent(now());
    },
    isActive: async (): Promise<boolean> => {
      return (await readCurrent(now())).active;
    },
  });
}

export interface CharacterizationController {
  start(hostname: string, authenticated: boolean): Promise<CharacterizationSession>;
  stop(): Promise<CharacterizationSession>;
  collect(evidence: E1RequestObserved, hostname: string): Promise<void>;
  recordNavigationWitness(witness: NavigationWitness): Promise<void>;
  export(): Promise<CharacterizationExportResult>;
  getSession(): Promise<CharacterizationSession>;
  isActive(): Promise<boolean>;
}

// ---------------------------------------------------------------------------
// Query helpers (pure)
// ---------------------------------------------------------------------------

/**
 * Get session status as a human-readable string.
 */
export function characterizeSessionStatus(session: CharacterizationSession, now: string): string {
  if (!session.active) {
    return "诊断模式未启用";
  }
  if (isSessionExpired(session, now)) {
    return "诊断会话已过期";
  }
  const recordCount = session.records.length;
  const maxRecords = MAX_CHARACTERIZATION_RECORDS;
  const ttlMs = CHARACTERIZATION_TTL_MS;
  const ttlMinutes = Math.floor(ttlMs / 60000);
  return `诊断模式进行中 · 已记录 ${recordCount}/${maxRecords} 条 · ${ttlMinutes}分钟后过期`;
}

/**
 * Check if the session can accept more records.
 */
export function canAcceptMoreRecords(session: CharacterizationSession): boolean {
  return session.active && session.records.length < MAX_CHARACTERIZATION_RECORDS;
}

/**
 * Get remaining capacity for records.
 */
export function remainingRecordCapacity(session: CharacterizationSession): number {
  if (!session.active) return 0;
  return Math.max(0, MAX_CHARACTERIZATION_RECORDS - session.records.length);
}

// ---------------------------------------------------------------------------
// Evidence validation for forbidden input
// ---------------------------------------------------------------------------

/** Keys that must never appear in characterization evidence. */
const FORBIDDEN_EVIDENCE_KEYS = [
  "body",
  "rawBody",
  "raw_body",
  "responseBody",
  "response_body",
  "responseText",
  "response_text",
  "code",
  "source",
  "sourceCode",
  "source_code",
  "requestHeaders",
  "request_headers",
  "responseHeaders",
  "response_headers",
  "headers",
  "cookie",
  "cookies",
  "authorization",
  "auth",
  "csrf",
  "csrfToken",
  "csrf_token",
  "token",
  "requestBody",
  "request_body",
  "user",
  "username",
  "account",
  "accountId",
  "account_id",
  "email",
  "userId",
  "user_id",
  "fullStatement",
  "full_statement",
  "problemStatement",
  "problem_statement",
] as const;

/**
 * Check if evidence contains any forbidden keys.
 * Returns true if the evidence is safe for characterization.
 */
export function isCharacterizationSafeEvidence(value: unknown): boolean {
  return findForbiddenEvidenceKey(value) === undefined;
}

function findForbiddenEvidenceKey(
  value: unknown,
  visited = new WeakSet<object>(),
): string | undefined {
  if (typeof value !== "object" || value === null || visited.has(value)) return undefined;
  visited.add(value);
  for (const key of FORBIDDEN_EVIDENCE_KEYS) {
    if (Object.prototype.hasOwnProperty.call(value, key)) return key;
  }
  for (const nested of Object.values(value)) {
    const forbidden = findForbiddenEvidenceKey(nested, visited);
    if (forbidden !== undefined) return forbidden;
  }
  return undefined;
}

/**
 * Reject evidence that is not safe for characterization.
 * Logs no raw objects — returns only a boolean indication.
 */
export function validateCharacterizationEvidence(
  evidence: E1RequestObserved,
): { readonly safe: true } | { readonly safe: false; readonly reason: string } {
  if (!isCharacterizationSafeEvidence(evidence)) {
    return { safe: false, reason: "forbidden keys present in evidence" };
  }
  if (!isCharacterizationPlatform(evidence.platform)) {
    return { safe: false, reason: "characterization platform is not registry-owned" };
  }
  if (typeof evidence.requestId !== "string" || evidence.requestId.length === 0) {
    return { safe: false, reason: "invalid requestId" };
  }
  if (typeof evidence.endpointKey !== "string" || evidence.endpointKey.length === 0) {
    return { safe: false, reason: "invalid endpointKey" };
  }
  return { safe: true };
}
