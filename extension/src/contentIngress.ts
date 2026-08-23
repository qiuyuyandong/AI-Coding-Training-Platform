/**
 * Pure content-ingress coordinator for the NowCoder exact result-route.
 *
 * Design contract (per the V4 NowCoder E3 ingress repair plan, Task 1):
 *
 * 1. **Pure URL gate** – `isExactNowCoderResultUrl` accepts only:
 *    - `https:` scheme
 *    - hostname exactly `ac.nowcoder.com`
 *    - no credentials or non-default port
 *    - pathname exactly `/acm/contest/view-submission`
 *    - no hash
 *    - exactly one query key `submissionId` with value `[0-9]{1,20}`
 *
 * 2. **Closed input union** – 7 constructors; no `unknown`, no `any`.
 *
 * 3. **Closed effect union** – `inject`, `ready_record`, `ignored`,
 *    `diagnostic`, `cleanup`; every effect carries `observedAt`.
 *
 * 4. **Pure reducer** – no `chrome.*`, no wall clock, no DOM, no I/O.
 *    Transient entries are bounded by count (max 100) and cleaned up
 *    explicitly via `cleanup` input.
 *
 * 5. **Rules** (plan lines 235-258):
 *    - top frame only (`frameId === 0`)
 *    - document identity preferred over tab/frame when available
 *    - committed → records eligible navigation, no injection
 *    - completed → injects once iff document was committed and not yet ready
 *    - history-state / startup → immediate injection if document has no ready record
 *    - ready → suppresses later injection for that document
 *    - duplicate events remain harmless (idempotent guard in the reducer)
 *    - errors → bounded reason codes only
 *    - cleanup → removes only transient coordinator state
 */

// ---------------------------------------------------------------------------
// URL gate
// ---------------------------------------------------------------------------

/**
 * Returns true iff the parsed URL is the exact NowCoder E3 ingress route:
 *
 *   `https://ac.nowcoder.com/acm/contest/view-submission?submissionId=<1-20 digits>`
 *
 * No hash, no extra query keys, no credentials, no non-default port.
 */
export function isExactNowCoderResultUrl(url: URL): boolean {
  if (url.protocol !== "https:") return false;
  if (url.hostname !== "ac.nowcoder.com") return false;
  if (url.username !== "") return false;
  if (url.password !== "") return false;
  if (url.port !== "") return false;
  if (url.hash !== "") return false;

   // Match the existing E3 policy exactly; it does not accept a trailing slash.
   if (url.pathname !== "/acm/contest/view-submission") {
    return false;
  }

  // Exactly one query key: `submissionId` with 1-20 decimal digits.
  const keys = Array.from(url.searchParams.keys());
  if (keys.length !== 1) return false;
  const id = url.searchParams.get("submissionId");
  if (id === null) return false;
  if (!/^\d{1,20}$/u.test(id)) return false;

  return true;
}

// ---------------------------------------------------------------------------
// Transient document identity
// ---------------------------------------------------------------------------

/** Minimal chrome-owned identity for a content document. */
export interface ContentDocumentIdentity {
  readonly tabId: number;
  readonly frameId: number;
  readonly documentId: string | undefined;
}

export type ContentRuntimeReadyMessage = Readonly<{
  readonly type: "CONTENT_RUNTIME_READY";
  readonly schemaVersion: 1;
  readonly purpose: "capture";
}>;

export function isContentRuntimeReadyMessage(
  value: unknown,
): value is ContentRuntimeReadyMessage {
  if (typeof value !== "object" || value === null) return false;
  return Reflect.get(value, "type") === "CONTENT_RUNTIME_READY"
    && Reflect.get(value, "schemaVersion") === 1
    && Reflect.get(value, "purpose") === "capture"
    && Reflect.ownKeys(value).length === 3;
}

// ---------------------------------------------------------------------------
// Input union
// ---------------------------------------------------------------------------

/**
 * Navigation committed in the browser (webNavigation.onCommitted).
 * Records the eligible document for later injection decisions.
 * Does NOT inject.
 */
export interface CommittedInput {
  readonly kind: "committed";
  readonly url: URL;
  readonly tabId: number;
  readonly frameId: number;
  readonly documentId: string | undefined;
}

/**
 * Navigation completed (webNavigation.onCompleted).
 * Injects if the committed document is still eligible and has no ready record.
 */
export interface CompletedInput {
  readonly kind: "completed";
  readonly url: URL;
  readonly tabId: number;
  readonly frameId: number;
  readonly documentId: string | undefined;
}

/**
 * Same-document SPA transition (webNavigation.onHistoryStateUpdated).
 * Injects immediately only when the document has no ready record.
 */
export interface HistoryStateInput {
  readonly kind: "history_state";
  readonly url: URL;
  readonly tabId: number;
  readonly frameId: number;
  readonly documentId: string | undefined;
}

/**
 * Startup reconciliation: worker/extension started and an eligible
 * result tab is already open. Injects immediately.
 */
export interface StartupInput {
  readonly kind: "startup";
  readonly url: URL;
  readonly tabId: number;
  readonly frameId: number;
  readonly documentId: string | undefined;
}

/**
 * A valid ready handshake arrived from the content runtime.
 * Suppresses later injection for that document.
 */
export interface ReadyInput {
  readonly kind: "ready";
  readonly tabId: number;
  readonly frameId: number;
  readonly documentId: string | undefined;
}

/**
 * Result of a programmatic injection attempt.
 */
export interface InjectionResultInput {
  readonly kind: "injection_result";
  readonly tabId: number;
  readonly frameId: number;
  readonly documentId: string | undefined;
  readonly success: boolean;
  readonly reason?: string;
}

/**
 * Explicit transient-state cleanup (on navigation/error).
 */
export interface CleanupInput {
  readonly kind: "cleanup";
  readonly documentId?: string;
  readonly tabId?: number;
}

export type IngressInput =
  | CommittedInput
  | CompletedInput
  | HistoryStateInput
  | StartupInput
  | ReadyInput
  | InjectionResultInput
  | CleanupInput;

// ---------------------------------------------------------------------------
// Effect union
// ---------------------------------------------------------------------------

/** Bounded diagnostic reason codes – no free text from the page. */
export type IngressDiagnosticCode =
  | "url_rejected"
  | "frame_rejected"
  | "tab_id_invalid"
  | "document_id_missing"
  | "injection_failed"
  | "duplicate_injection";

export interface InjectEffect {
  readonly type: "inject";
  readonly tabId: number;
  readonly frameId: number;
  readonly documentId: string;
  readonly url: URL;
}

export interface ReadyRecordEffect {
  readonly type: "ready_record";
  readonly tabId: number;
  readonly frameId: number;
  readonly documentId: string;
}

export interface IgnoredEffect {
  readonly type: "ignored";
  readonly reason: IngressDiagnosticCode;
}

export interface DiagnosticEffect {
  readonly type: "diagnostic";
  readonly reason: IngressDiagnosticCode;
  readonly documentId: string | undefined;
}

export interface CleanupEffect {
  readonly type: "cleanup";
  readonly documentId: string | undefined;
}

export type IngressEffect =
  | InjectEffect
  | ReadyRecordEffect
  | IgnoredEffect
  | DiagnosticEffect
  | CleanupEffect;

// ---------------------------------------------------------------------------
// Coordinator state
// ---------------------------------------------------------------------------

interface TransientEntry {
  readonly tabId: number;
  readonly frameId: number;
  readonly documentId: string;
  readonly url: URL;
}

const MAX_TRANSIENT_ENTRIES = 100;

export interface IngressCoordinatorState {
  /**
   * Documents that have been committed but not yet completed.
 * Key: Chrome-owned documentId. Frame-only fallback is forbidden.
   */
  readonly committed: ReadonlyMap<string, TransientEntry>;
  /**
   * Documents that have sent a valid ready handshake.
   * Key: same as committed.
   */
  readonly ready: ReadonlySet<string>;
  /**
   * Documents for which injection has been triggered.
   * Key: same as committed.
   */
  readonly injected: ReadonlySet<string>;
  /**
   * Count of cleanup operations performed to support bounded-diagnostic reasoning.
   */
  readonly cleanupCount: number;
}

export const INITIAL_STATE: IngressCoordinatorState = {
  committed: new Map(),
  ready: new Set(),
  injected: new Set(),
  cleanupCount: 0,
};

// ---------------------------------------------------------------------------
// Pure reducer
// ---------------------------------------------------------------------------

function documentKey(documentId: string): string {
  return documentId;
}

function evictOldestEntry(map: Map<string, TransientEntry>): Map<string, TransientEntry> {
  if (map.size < MAX_TRANSIENT_ENTRIES) return map;
  const oldestKey = map.keys().next().value;
  if (oldestKey === undefined) return map;
  const next = new Map(map);
  next.delete(oldestKey);
  return next;
}

function boundedSet(values: ReadonlySet<string>): Set<string> {
  const next = new Set(values);
  while (next.size >= MAX_TRANSIENT_ENTRIES) {
    const oldest = next.values().next().value;
    if (oldest === undefined) break;
    next.delete(oldest);
  }
  return next;
}

/**
 * Pure coordinator reducer.
 *
 * Accepts a state and an closed IngressInput, returns the next state
 * and an array of IngressEffect to be executed by the background.
 *
 * Rules (plan lines 235-258):
 * - accept only the exact result-route gate
 * - accept only top frame (`frameId === 0`)
 * - require Chrome-owned `documentId` targeting
 * - never use `allFrames`
 * - committed → records eligible navigation but does NOT inject
 * - completed → injects once only if the committed document is still
 *   eligible and has not announced readiness
 * - history-state / startup → immediate injection if the same document
 *   has no ready record
 * - ready → suppresses later injection attempts for that document
 * - duplicate events and worker wakeups are harmless (idempotent in reducer)
 * - errors produce bounded reason codes only
 * - cleanup removes only transient coordinator state
 */
export function reduceIngress(
  state: IngressCoordinatorState,
  input: IngressInput,
  // Kept as an ignored compatibility parameter while focused callers migrate.
  // The reducer deliberately has no wall-clock dependency.
  _now?: () => string,
): { readonly state: IngressCoordinatorState; readonly effects: readonly IngressEffect[] } {
  void _now;
  switch (input.kind) {
    case "committed": {
      const { url, tabId, frameId, documentId } = input;

      // Rule: top frame only
      if (frameId !== 0) {
        return { state, effects: [{ type: "ignored", reason: "frame_rejected" }] };
      }

      // Rule: tabId >= 0
      if (tabId < 0) {
        return { state, effects: [{ type: "ignored", reason: "tab_id_invalid" }] };
      }
      if (typeof documentId !== "string" || documentId.length === 0) {
        return { state, effects: [{ type: "ignored", reason: "document_id_missing" }] };
      }

      // Rule: exact URL gate
      if (!isExactNowCoderResultUrl(url)) {
        return { state, effects: [{ type: "ignored", reason: "url_rejected" }] };
      }

      // Record the committed eligible navigation.
      const key = documentKey(documentId);
      const nextCommitted = evictOldestEntry(new Map(state.committed));
      nextCommitted.delete(key);
      nextCommitted.set(key, { tabId, frameId, documentId, url });
      return {
        state: { ...state, committed: nextCommitted },
        effects: [],
      };
    }

    case "completed": {
      const { url, tabId, frameId, documentId } = input;

      // Rule: top frame only
      if (frameId !== 0) {
        return { state, effects: [{ type: "ignored", reason: "frame_rejected" }] };
      }

      // Rule: tabId >= 0
      if (tabId < 0) {
        return { state, effects: [{ type: "ignored", reason: "tab_id_invalid" }] };
      }
      if (typeof documentId !== "string" || documentId.length === 0) {
        return { state, effects: [{ type: "ignored", reason: "document_id_missing" }] };
      }

      // Rule: exact URL gate (eligibility must persist)
      if (!isExactNowCoderResultUrl(url)) {
        return { state, effects: [{ type: "ignored", reason: "url_rejected" }] };
      }

      const key = documentKey(documentId);

      // Rule: injects once only if the committed document is still eligible
      // and has not announced readiness.
      if (!state.committed.has(key)) {
        return { state, effects: [] };
      }
      if (state.ready.has(key)) {
        return { state, effects: [] };
      }
      if (state.injected.has(key)) {
        return { state, effects: [{ type: "ignored", reason: "duplicate_injection" }] };
      }

       const nextInjected = boundedSet(state.injected);
      nextInjected.add(key);
      return {
        state: { ...state, injected: nextInjected },
        effects: [{
          type: "inject",
          tabId,
          frameId,
          documentId,
          url,
        }],
      };
    }

    case "history_state":
    case "startup": {
      const { url, tabId, frameId, documentId } = input;

      // Rule: top frame only
      if (frameId !== 0) {
        return { state, effects: [{ type: "ignored", reason: "frame_rejected" }] };
      }

      // Rule: tabId >= 0
      if (tabId < 0) {
        return { state, effects: [{ type: "ignored", reason: "tab_id_invalid" }] };
      }
      if (typeof documentId !== "string" || documentId.length === 0) {
        return { state, effects: [{ type: "ignored", reason: "document_id_missing" }] };
      }

      // Rule: exact URL gate
      if (!isExactNowCoderResultUrl(url)) {
        return { state, effects: [{ type: "ignored", reason: "url_rejected" }] };
      }

      const key = documentKey(documentId);

      // Rule: immediate injection if the document has no ready record.
      if (state.ready.has(key)) {
        return { state, effects: [] };
      }
      if (state.injected.has(key)) {
        return { state, effects: [{ type: "ignored", reason: "duplicate_injection" }] };
      }

      // Record the committed entry first (evicting oldest if needed).
      const nextCommitted = evictOldestEntry(new Map(state.committed));
      nextCommitted.delete(key);
      nextCommitted.set(key, { tabId, frameId, documentId, url });
       const nextInjected = boundedSet(state.injected);
      nextInjected.add(key);

      return {
        state: { ...state, committed: nextCommitted, injected: nextInjected },
        effects: [{
          type: "inject",
          tabId,
          frameId,
          documentId,
          url,
        }],
      };
    }

    case "ready": {
      const { tabId, frameId, documentId } = input;

      // Rule: top frame only
      if (frameId !== 0) {
        return { state, effects: [{ type: "ignored", reason: "frame_rejected" }] };
      }

      // Rule: tabId >= 0
      if (tabId < 0) {
        return { state, effects: [{ type: "ignored", reason: "tab_id_invalid" }] };
      }
      if (typeof documentId !== "string" || documentId.length === 0) {
        return { state, effects: [{ type: "ignored", reason: "document_id_missing" }] };
      }

      const key = documentKey(documentId);

      // Idempotent: already ready is a no-op.
      if (state.ready.has(key)) {
        return { state, effects: [] };
      }

       const nextReady = boundedSet(state.ready);
      nextReady.add(key);
      return {
        state: { ...state, ready: nextReady },
        effects: [{
          type: "ready_record",
          tabId,
          frameId,
          documentId,
        }],
      };
    }

    case "injection_result": {
      const { tabId, documentId, success } = input;

      // Rule: tabId >= 0
      if (tabId < 0) {
        return { state, effects: [{ type: "ignored", reason: "tab_id_invalid" }] };
      }
      if (typeof documentId !== "string" || documentId.length === 0) {
        return { state, effects: [{ type: "ignored", reason: "document_id_missing" }] };
      }

      if (!success) {
        const key = documentKey(documentId);
        // Remove from injected so a later retry could inject again.
        const nextInjected = new Set(state.injected);
        nextInjected.delete(key);
        return {
          state: { ...state, injected: nextInjected },
          effects: [{
            type: "diagnostic",
            reason: "injection_failed",
            documentId,
          }],
        };
      }

      return { state, effects: [] };
    }

    case "cleanup": {
      const { documentId, tabId } = input;
      const nextCommitted = new Map(state.committed);
      const nextReady = new Set(state.ready);
      const nextInjected = new Set(state.injected);

      if (documentId !== undefined) {
        for (const [key] of nextCommitted) {
          if (key === documentId) {
            nextCommitted.delete(key);
            nextReady.delete(key);
            nextInjected.delete(key);
          }
        }
      } else if (tabId !== undefined) {
        for (const [key, entry] of nextCommitted) {
          if (entry.tabId === tabId) {
            nextCommitted.delete(key);
            nextReady.delete(key);
            nextInjected.delete(key);
          }
        }
      }

      return {
        state: { ...state, committed: nextCommitted, ready: nextReady, injected: nextInjected, cleanupCount: state.cleanupCount + 1 },
        effects: [{ type: "cleanup", documentId: input.documentId }],
      };
    }
  }
}
