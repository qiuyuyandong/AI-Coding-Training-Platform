/**
 * Isolated-world relay for the MAIN bridge (Phase A Task A7).
 *
 * The relay lives in the ISOLATED world as a content script and listens
 * for `message` events on the same window. Each event must satisfy four
 * gates before `deps.relay` is called:
 *
 *   1. `event.source === deps.window` — same window only (cross-window
 *      rejection).
 *   2. `event.data.type === "V4_MAIN_BRIDGE_SUMMARY"` — message-type gate.
 *   3. `parseMainBridgeSummary(data.summary)` — schema gate, also
 *      enforced by the MAIN bridge; defense in depth.
 *   4. `summary.documentId === deps.capturedDocumentId` — document
 *      context match. The relay must not accept a summary stamped with a
 *      foreign `documentId`.
 *
 * On success, the relay emits a frozen `V4_FORWARD_BRIDGE` envelope
 * containing the summary plus its document context. The background
 * worker is responsible for routing the envelope into the correlator;
 * the relay never imports storage, state, or outbox helpers.
 *
 * The module is pure: no `chrome.*` imports, no DOM, no clock. Every
 * dependency — host window, captured documentId, sink callback — is
 * injected so unit tests can exercise each rejection branch without a
 * browser.
 */

import {
  parseMainBridgeSummary,
  type MainBridgeSummary,
} from "@/extension/src/submissionCorrelator";

import {
  MAIN_BRIDGE_MESSAGE_TYPE,
  type MainWorldScriptWindow,
} from "@/extension/src/mainWorldBridge";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Envelope type emitted to the background worker via `deps.relay`. */
export const MAIN_WORLD_RELAY_FORWARD_TYPE = "V4_FORWARD_BRIDGE" as const;

const RELAY_FORBIDDEN_KEYS: ReadonlySet<string> = new Set([
  "body",
  "rawBody",
  "responseBody",
  "code",
  "headers",
  "requestHeaders",
  "responseHeaders",
  "extraHeaders",
  "cookie",
  "authorization",
  "csrf",
  "token",
  "username",
  "account",
]);

function hasRelayForbiddenKey(value: unknown, visited: Set<object> = new Set()): boolean {
  if (typeof value !== "object" || value === null) return false;
  if (visited.has(value)) return false;
  visited.add(value);
  for (const key of Object.keys(value)) {
    if (RELAY_FORBIDDEN_KEYS.has(key)) return true;
    if (hasRelayForbiddenKey(Reflect.get(value, key), visited)) return true;
  }
  return false;
}

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/** Envelope relayed to the background worker. */
export type MainWorldRelayEnvelope = {
  readonly type: typeof MAIN_WORLD_RELAY_FORWARD_TYPE;
  readonly summary: MainBridgeSummary;
  readonly document: {
    readonly tabId: MainBridgeSummary["tabId"];
    readonly frameId: MainBridgeSummary["frameId"];
    readonly documentId: MainBridgeSummary["documentId"];
    readonly platform: MainBridgeSummary["platform"];
  };
};

/** Dependency injection for the relay factory. */
export interface MainWorldRelayDeps {
  readonly window: MainWorldScriptWindow;
  readonly capturedDocumentId: string;
  readonly relay: (envelope: MainWorldRelayEnvelope) => void;
}

/** Public handle returned by the relay factory. */
export interface MainWorldRelay {
  /** Test seam that exercises the message-handler logic directly. */
  handleEvent(event: unknown): void;
  /** Remove the `message` listener the factory registered. */
  dispose(): void;
}

// ---------------------------------------------------------------------------
// Pure message-event gate
// ---------------------------------------------------------------------------

/**
 * Validate one `message` event against the four gates above. Returns the
 * parsed envelope when all gates pass, or `null` when any gate rejects
 * the event. Pure: no I/O, no clock, no chrome.* call.
 */
export function evaluateMainBridgeMessage(
  event: unknown,
  expectedWindow: MainWorldScriptWindow,
  capturedDocumentId: string,
): MainWorldRelayEnvelope | null {
  if (typeof event !== "object" || event === null) return null;
  const candidate = event as { source?: unknown; data?: unknown };
  if (candidate.source !== expectedWindow) return null;
  if (typeof candidate.data !== "object" || candidate.data === null) return null;
  const data = candidate.data as { type?: unknown; summary?: unknown };
  if (data.type !== MAIN_BRIDGE_MESSAGE_TYPE) return null;
  if (typeof data.summary !== "object" || data.summary === null) return null;

  const parsed = parseMainBridgeSummary(data.summary);
  if (!parsed.ok) return null;
  if (hasRelayForbiddenKey(data.summary)) return null;
  const summary = parsed.value;

  if (summary.documentId !== capturedDocumentId) return null;

  return {
    type: MAIN_WORLD_RELAY_FORWARD_TYPE,
    summary,
    document: {
      tabId: summary.tabId,
      frameId: summary.frameId,
      documentId: summary.documentId,
      platform: summary.platform,
    },
  };
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

/**
 * Build an ISOLATED-world relay. Registers a single `message` listener
 * that funnels every `message` event through {@link evaluateMainBridgeMessage}
 * and forwards accepted envelopes to `deps.relay`.
 */
export function createMainWorldRelay(deps: MainWorldRelayDeps): MainWorldRelay {
  function handleEvent(event: unknown): void {
    const envelope = evaluateMainBridgeMessage(
      event,
      deps.window,
      deps.capturedDocumentId,
    );
    if (envelope === null) return;
    deps.relay(envelope);
  }

  deps.window.addEventListener("message", handleEvent);

  function dispose(): void {
    deps.window.removeEventListener("message", handleEvent);
  }

  return {
    handleEvent,
    dispose,
  };
}

// ---------------------------------------------------------------------------
// Message contract schema (documentation)
// ---------------------------------------------------------------------------

/**
 * Documentation export describing the relay message contract. Frozen so
 * downstream code can safely reference the same constants the relay uses
 * at runtime.
 */
export const messageSchema = Object.freeze({
  sourceMessageType: MAIN_BRIDGE_MESSAGE_TYPE,
  forwardType: MAIN_WORLD_RELAY_FORWARD_TYPE,
  description: "ISOLATED-world relay receives V4_MAIN_BRIDGE_SUMMARY from the same window and re-emits a V4_FORWARD_BRIDGE envelope.",
  forwardEnvelope: Object.freeze({
    type: MAIN_WORLD_RELAY_FORWARD_TYPE,
    summary: "Frozen MainBridgeSummary validated by parseMainBridgeSummary.",
    document: Object.freeze({
      tabId: "non-negative integer (taken from the validated summary)",
      frameId: "non-negative integer (taken from the validated summary)",
      documentId: "non-empty string (must equal capturedDocumentId)",
      platform: "closed Platform enum (leetcode | nowcoder | luogu | codeforces | atcoder)",
    }),
  }),
  requirements: Object.freeze([
    "event.source === window (cross-window rejection)",
    "data.type === V4_MAIN_BRIDGE_SUMMARY",
    "parseMainBridgeSummary(data.summary) succeeds (defense in depth)",
    "summary.documentId === capturedDocumentId (document context match)",
  ]),
});