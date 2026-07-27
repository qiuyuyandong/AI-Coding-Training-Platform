/**
 * B3 Navigation Witness State Machine (Phase B Task B3.1).
 *
 * A SEPARATE persistent state machine from CharacterizationSession.navigationWitnesses.
 * Stores only document identity fields (no URLs/paths/origins).
 *
 * Schema: schemaVersion=2, buildSha, sessionId, revision, status,
 *         startedAt, expiresAt, optional tabId/docIds, invalidReason
 *
 * Key design constraints from review:
 * 1. B3WitnessState is the ONLY authority for B3 transitions.
 *    CharacterizationSession.navigationWitnesses is NOT used for B3 state.
 * 2. background synchronously sanitizes sender then serially:
 *    get -> validate -> pure transition -> save.
 * 3. Invalid state persists "invalid" and cannot recover.
 * 4. Export ONLY when ready + matching build + valid unexpired + exact 2 E0.
 * 5. Serialize transitions to prevent concurrent get-modify-set races.
 * 6. chrome.storage.session persists across MV3 worker restarts.
 * 7. Extension reload: storage.session naturally disappears.
 */

import type { NavigationWitness } from "./characterizationNavigationWitness";

// ---------------------------------------------------------------------------
// Build SHA
// ---------------------------------------------------------------------------

/** Build identifier for strict mismatch detection. */
declare const __B3_BUILD_SHA__: string | undefined;

export const B3_BUILD_SHA = typeof __B3_BUILD_SHA__ === "string" ? __B3_BUILD_SHA__ : "test-build";

// ---------------------------------------------------------------------------
// B3 Witness State
// ---------------------------------------------------------------------------

/**
 * B3 witness lifecycle state machine states:
 * - armed: session active, no navigation observed yet
 * - list_seen: contest_list witnessed, waiting for contest_problem
 * - ready: valid list->problem pair observed on same tab, correct order
 * - invalid: transition error (wrong order, cross-tab, reload, duplicate, expired, corruption)
 */
export type B3Status = "armed" | "list_seen" | "ready" | "invalid";

export type B3InvalidReason = "build_mismatch" | "expired" | "invalid_state" | "invalid_transition" | "storage_failure";

export type B3WitnessState = Readonly<{
  schemaVersion: 1;
  buildSha: string;
  sessionId: string;
  revision: number;
  status: B3Status;
  startedAt: string;
  expiresAt: string;
  /** Tab ID when list was first observed. */
  tabId?: number;
  listDocumentId?: string;
  problemDocumentId?: string;
  listObservedAt?: string;
  problemObservedAt?: string;
  invalidReason?: B3InvalidReason;
}>;

export const DEFAULT_B3_STATE: B3WitnessState = Object.freeze({
  schemaVersion: 1,
  buildSha: "",
  sessionId: "",
  revision: 0,
  status: "armed",
  startedAt: "",
  expiresAt: "",
});

const B3_TTL_MS = 5 * 60_000; // 5 minutes, same as characterization TTL

// ---------------------------------------------------------------------------
// Pure transition function
// ---------------------------------------------------------------------------

/**
 * Allowed contest list page path constant.
 */
const CONTEST_LIST_PATH = "/acm/contest/18839";

/**
 * Allowed contest problem page path constant.
 */
const CONTEST_PROBLEM_PATH = "/acm/contest/18839/1001";

/**
 * Allowed page classes as constants (no string values in code).
 */
const PAGE_CLASS_LIST = "contest_list" as const;
const PAGE_CLASS_PROBLEM = "contest_problem" as const;

export type PageClass = typeof PAGE_CLASS_LIST | typeof PAGE_CLASS_PROBLEM;

/** Revalidate a stored B3 state to detect tampering. */
export function validateB3WitnessState(state: unknown): state is B3WitnessState {
  if (typeof state !== "object" || state === null) return false;
  const s = state as Record<string, unknown>;
  if (s.schemaVersion !== 1) return false;
  const allowed = new Set(["schemaVersion", "buildSha", "sessionId", "revision", "status", "startedAt", "expiresAt", "tabId", "listDocumentId", "problemDocumentId", "listObservedAt", "problemObservedAt", "invalidReason"]);
  if (Object.keys(s).some((key) => !allowed.has(key))) return false;
  if (!isSafeIdentifier(s.buildSha)) return false;
  if (!isSafeIdentifier(s.sessionId)) return false;
  if (typeof s.revision !== "number" || !Number.isInteger(s.revision) || s.revision < 0) return false;
  if (!isValidB3Status(s.status)) return false;
  if (!isIsoDateTime(s.startedAt) || !isIsoDateTime(s.expiresAt)) return false;
  // tabId must be non-negative integer if present
  if (s.tabId !== undefined && (typeof s.tabId !== "number" || !Number.isInteger(s.tabId) || s.tabId < 0)) return false;
  // doc ids must be safe identifiers if present
  if (s.listDocumentId !== undefined && !isSafeIdentifier(s.listDocumentId)) return false;
  if (s.problemDocumentId !== undefined && !isSafeIdentifier(s.problemDocumentId)) return false;
  if (s.listObservedAt !== undefined && !isIsoDateTime(s.listObservedAt)) return false;
  if (s.problemObservedAt !== undefined && !isIsoDateTime(s.problemObservedAt)) return false;
  if (s.invalidReason !== undefined && !isB3InvalidReason(s.invalidReason)) return false;
  if (s.status === "armed" && (s.revision !== 0 || s.tabId !== undefined || s.listDocumentId !== undefined || s.problemDocumentId !== undefined)) return false;
  if (s.status === "list_seen" && (s.revision !== 1 || s.tabId === undefined || s.listDocumentId === undefined || s.listObservedAt === undefined || s.problemDocumentId !== undefined)) return false;
  if (s.status === "ready" && (s.revision !== 2 || s.tabId === undefined || s.listDocumentId === undefined || s.problemDocumentId === undefined || s.listDocumentId === s.problemDocumentId || s.listObservedAt === undefined || s.problemObservedAt === undefined)) return false;
  return true;
}

function isB3InvalidReason(value: unknown): value is B3InvalidReason {
  return value === "build_mismatch" || value === "expired" || value === "invalid_state"
    || value === "invalid_transition" || value === "storage_failure";
}

function isValidB3Status(v: unknown): v is B3Status {
  return v === "armed" || v === "list_seen" || v === "ready" || v === "invalid";
}

function isIsoDateTime(v: unknown): boolean {
  return typeof v === "string" && /^\d{4}-\d{2}-\d{2}T/.test(v) && Number.isFinite(Date.parse(v));
}

function isSafeIdentifier(v: unknown): v is string {
  return typeof v === "string" && /^[A-Za-z0-9_-]{1,128}$/.test(v);
}

/**
 * Check if a B3 state is expired.
 */
export function isB3StateExpired(state: B3WitnessState, now: string): boolean {
  if (state.sessionId === "") return false;
  if (state.status === "invalid") return false; // invalid persists
  if (!isIsoDateTime(state.expiresAt)) return true;
  const expiresMs = Date.parse(state.expiresAt);
  const nowMs = Date.parse(now);
  return !Number.isFinite(expiresMs) || nowMs >= expiresMs;
}

/**
 * Determine if B3 state can export E0 transcript.
 * Requires: status=ready, valid buildSha, unexpired, has sessionId.
 */
export function canB3Export(state: B3WitnessState, now: string, buildSha: string): boolean {
  if (state.status !== "ready") return false;
  if (state.buildSha !== buildSha) return false;
  if (state.sessionId === "") return false;
  if (isB3StateExpired(state, now)) return false;
  if (state.listDocumentId === undefined || state.problemDocumentId === undefined) return false;
  if (state.tabId === undefined) return false;
  if (state.revision !== 2 || state.listDocumentId === state.problemDocumentId) return false;
  return true;
}

/**
 * Pure transition function: takes current B3 state + new sanitized witness fields,
 * returns NEXT B3 state (or undefined if transition is invalid).
 *
 * Fails closed: returns undefined for any malformed input or illegal transition.
 *
 * @param current - Current B3 state
 * @param pageClass - Observed page class
 * @param documentId - Observed document ID
 * @param tabId - Tab ID
 * @param receivedAt - ISO datetime of observation
 * @param buildSha - Current build SHA for mismatch detection
 */
export function transitionB3Witness(
  current: B3WitnessState,
  pageClass: PageClass,
  documentId: string,
  tabId: number,
  receivedAt: string,
  buildSha: string,
): B3WitnessState | undefined {
  // Validate inputs
  if (!isSafeIdentifier(documentId)) return undefined;
  if (!Number.isInteger(tabId) || tabId < 0) return undefined;
  if (!isIsoDateTime(receivedAt)) return undefined;

  if (!validateB3WitnessState(current)) {
    return invalidateB3State(DEFAULT_B3_STATE, "invalid_state", buildSha);
  }
  if (current.buildSha !== buildSha) {
    return invalidateB3State(current, "build_mismatch", buildSha);
  }
  if (isB3StateExpired(current, receivedAt)) {
    return invalidateB3State(current, "expired", buildSha);
  }

  // Handle invalid state - once invalid, cannot recover
  if (current.status === "invalid") return undefined;

  // Build transition context
  const nextRevision = current.revision + 1;

  switch (current.status) {
    case "armed": {
      // In armed state, only contest_list is valid first transition
      if (pageClass !== PAGE_CLASS_LIST) {
        return Object.freeze({
          schemaVersion: 1,
          buildSha,
          sessionId: current.sessionId,
          revision: nextRevision,
          status: "invalid" as const,
          startedAt: current.startedAt,
          expiresAt: current.expiresAt,
          tabId: undefined,
          listDocumentId: undefined,
          problemDocumentId: undefined,
          listObservedAt: undefined,
          problemObservedAt: undefined,
          invalidReason: "invalid_transition",
        });
      }
      // contest_list starts the session
      return Object.freeze({
        schemaVersion: 1,
        buildSha,
        sessionId: current.sessionId,
        revision: nextRevision,
        status: "list_seen" as const,
        startedAt: receivedAt,
        expiresAt: new Date(Date.parse(receivedAt) + B3_TTL_MS).toISOString(),
        tabId,
        listDocumentId: documentId,
        problemDocumentId: undefined,
        listObservedAt: receivedAt,
        problemObservedAt: undefined,
      });
    }

    case "list_seen": {
      // list_seen requires same tabId
      if (current.tabId !== tabId) {
        return Object.freeze({
          schemaVersion: 1,
          buildSha,
          sessionId: current.sessionId,
          revision: nextRevision,
          status: "invalid" as const,
          startedAt: current.startedAt,
          expiresAt: current.expiresAt,
          tabId: current.tabId,
          listDocumentId: current.listDocumentId,
          problemDocumentId: undefined,
          listObservedAt: current.listObservedAt,
          problemObservedAt: undefined,
          invalidReason: "invalid_transition",
        });
      }
      // Must be contest_problem next
      if (pageClass !== PAGE_CLASS_PROBLEM) {
        return Object.freeze({
          schemaVersion: 1,
          buildSha,
          sessionId: current.sessionId,
          revision: nextRevision,
          status: "invalid" as const,
          startedAt: current.startedAt,
          expiresAt: current.expiresAt,
          tabId: current.tabId,
          listDocumentId: current.listDocumentId,
          problemDocumentId: undefined,
          listObservedAt: current.listObservedAt,
          problemObservedAt: undefined,
          invalidReason: "invalid_transition",
        });
      }
      // No reload: problemDocumentId must be different from listDocumentId
      if (current.listDocumentId === documentId) {
        return Object.freeze({
          schemaVersion: 1,
          buildSha,
          sessionId: current.sessionId,
          revision: nextRevision,
          status: "invalid" as const,
          startedAt: current.startedAt,
          expiresAt: current.expiresAt,
          tabId: current.tabId,
          listDocumentId: current.listDocumentId,
          problemDocumentId: undefined,
          listObservedAt: current.listObservedAt,
          problemObservedAt: undefined,
          invalidReason: "invalid_transition",
        });
      }
      // Valid list->problem transition
      return Object.freeze({
        schemaVersion: 1,
        buildSha,
        sessionId: current.sessionId,
        revision: nextRevision,
        status: "ready" as const,
        startedAt: current.startedAt,
        expiresAt: current.expiresAt,
        tabId: current.tabId,
        listDocumentId: current.listDocumentId,
        problemDocumentId: documentId,
        listObservedAt: current.listObservedAt,
        problemObservedAt: receivedAt,
      });
    }

    case "ready": {
      // After ready, any additional witness is invalid
      return Object.freeze({
        schemaVersion: 1,
        buildSha,
        sessionId: current.sessionId,
        revision: nextRevision,
        status: "invalid" as const,
        startedAt: current.startedAt,
        expiresAt: current.expiresAt,
        tabId: current.tabId,
        listDocumentId: current.listDocumentId,
        problemDocumentId: current.problemDocumentId,
        listObservedAt: current.listObservedAt,
        problemObservedAt: current.problemObservedAt,
        invalidReason: "invalid_transition",
      });
    }

    default:
      return undefined;
  }
}

/**
 * Start B3 state with a new session ID.
 * Called when characterization START is triggered.
 */
export function startB3State(now: string, buildSha: string): B3WitnessState {
  const sessionId = `b3-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  return Object.freeze({
    schemaVersion: 1,
    buildSha,
    sessionId,
    revision: 0,
    status: "armed",
    startedAt: now,
    expiresAt: new Date(Date.parse(now) + B3_TTL_MS).toISOString(),
  });
}

/**
 * Transition B3 state to invalid (e.g., on expiry or explicit stop).
 * Once invalid, it stays invalid until a new session starts.
 */
export function invalidateB3State(current: B3WitnessState, reason: B3InvalidReason, buildSha: string): B3WitnessState {
  return Object.freeze({
    schemaVersion: 1,
    buildSha: current.buildSha !== "" ? current.buildSha : buildSha,
    sessionId: current.sessionId,
    revision: current.revision + 1,
    status: "invalid",
    startedAt: current.startedAt,
    expiresAt: current.expiresAt,
    tabId: current.tabId,
    listDocumentId: current.listDocumentId,
    problemDocumentId: current.problemDocumentId,
    listObservedAt: current.listObservedAt,
    problemObservedAt: current.problemObservedAt,
    invalidReason: reason,
  });
}

/**
 * Stop B3 state - returns default armed state with sessionId cleared.
 */
export function stopB3State(current: B3WitnessState, buildSha: string): B3WitnessState {
  return Object.freeze({
    schemaVersion: 1,
    buildSha: current.buildSha !== "" ? current.buildSha : buildSha,
    sessionId: "", // cleared on stop
    revision: current.revision + 1,
    status: "armed",
    startedAt: "",
    expiresAt: "",
    tabId: undefined,
    listDocumentId: undefined,
    problemDocumentId: undefined,
    listObservedAt: undefined,
    problemObservedAt: undefined,
    invalidReason: undefined,
  });
}

/**
 * Build exact 2 E0 NavigationWitness records for B3 export.
 * Uses ONLY the document IDs and constants from B3WitnessState.
 * Does NOT read from CharacterizationSession.navigationWitnesses.
 */
export function buildB3E0Records(state: B3WitnessState): readonly NavigationWitness[] | undefined {
  if (state.status !== "ready") return undefined;
  if (state.listDocumentId === undefined || state.problemDocumentId === undefined || state.listObservedAt === undefined || state.problemObservedAt === undefined) return undefined;
  if (state.tabId === undefined) return undefined;
  if (state.sessionId === "") return undefined;

  const listWitness: NavigationWitness = Object.freeze({
    schemaVersion: 1,
    evidenceId: `e0_nowcoder_${state.listDocumentId}_contest_list`,
    platform: "nowcoder",
    tier: "E0",
    kind: "navigation_witness",
    receivedAt: state.listObservedAt,
    tabId: state.tabId,
    frameId: 0,
    documentId: state.listDocumentId,
    pageClass: "contest_list",
    relativeTimingOrder: 0,
  });

  const problemWitness: NavigationWitness = Object.freeze({
    schemaVersion: 1,
    evidenceId: `e0_nowcoder_${state.problemDocumentId}_contest_problem`,
    platform: "nowcoder",
    tier: "E0",
    kind: "navigation_witness",
    receivedAt: state.problemObservedAt,
    tabId: state.tabId,
    frameId: 0,
    documentId: state.problemDocumentId,
    pageClass: "contest_problem",
    relativeTimingOrder: 1,
  });

  return Object.freeze([listWitness, problemWitness]);
}

/**
 * Parse page class from URL pathname.
 * Returns undefined if path doesn't match allowed constants.
 */
export function parsePageClassFromPath(pathname: string): PageClass | undefined {
  const normalized = pathname.replace(/\/$/u, "");
  if (normalized === CONTEST_LIST_PATH) return PAGE_CLASS_LIST;
  if (normalized === CONTEST_PROBLEM_PATH) return PAGE_CLASS_PROBLEM;
  return undefined;
}

// ---------------------------------------------------------------------------
// Storage helpers
// ---------------------------------------------------------------------------

const B3_STORAGE_KEY = "b3WitnessState";

/**
 * Read B3 state from storage result.
 * Returns DEFAULT_B3_STATE if missing or invalid.
 */
export function readB3WitnessState(stored: Record<string, unknown>): B3WitnessState {
  const raw = stored[B3_STORAGE_KEY];
  if (!validateB3WitnessState(raw)) return DEFAULT_B3_STATE;
  return raw;
}

/**
 * Plan a B3 state write.
 */
export function planB3WitnessStateWrite(state: B3WitnessState): { readonly items: Record<string, unknown> } {
  return Object.freeze({
    items: Object.freeze({ [B3_STORAGE_KEY]: state }),
  });
}
