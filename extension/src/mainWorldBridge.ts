/**
 * Optional low-trust MAIN bridge (Phase A Task A7).
 *
 * The MAIN bridge is a bounded response-summary channel for platforms that
 * cannot expose submission identity through redirects, navigation, or
 * adapter network policy. It lives in the page's MAIN JavaScript context
 * (`window`), exposes `dispatchResponseSummary(value)` on `window`, and
 * posts a synthetic `V4_MAIN_BRIDGE_SUMMARY` message via
 * `window.postMessage`. The ISOLATED-world relay in
 * `extension/src/mainWorldRelay.ts` receives the message, re-validates it
 * with `parseMainBridgeSummary`, and forwards a `V4_FORWARD_BRIDGE`
 * envelope to the background worker.
 *
 * The bridge is **low-trust**:
 *
 *   - Page messages are forgeable; the correlator never treats the bridge
 *     as a primary evidence channel.
 *   - Each candidate is rejected when its size exceeds 4096 bytes, its
 *     field count exceeds 18, any key in the A1 forbidden list appears at
 *     any depth, any nested object or array is present, or any field is
 *     outside the closed MainBridgeSummary schema.
 *   - `parseMainBridgeSummary` is the final schema gate; the bridge never
 *     re-implements it.
 *
 * The module is pure: no `chrome.*` imports, no DOM reads, no clock, no
 * I/O. The host window, byte encoder, schema validator, and forward
 * callback are dependency-injected so unit tests can exercise every
 * rejection path without a browser.
 */

import {
  parseMainBridgeSummary,
  type MainBridgeSummary,
  type ParseResult,
} from "@/extension/src/submissionCorrelator";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Message type posted by the MAIN bridge to the ISOLATED relay. */
export const MAIN_BRIDGE_MESSAGE_TYPE = "V4_MAIN_BRIDGE_SUMMARY" as const;

/** Maximum number of top-level fields on a synthetic summary. */
export const MAIN_BRIDGE_MAX_FIELDS = 18;

/** Maximum byte size (UTF-8) of a synthetic summary payload. */
export const MAIN_BRIDGE_MAX_BYTES = 4096;

/** Maximum number of summaries retained in the pagehide flush queue. */
export const MAIN_BRIDGE_QUEUE_LIMIT = 16;

/**
 * Field names that must never appear at any depth of a synthetic summary.
 * Intentionally broader than `parseSafeEvidence`'s forbidden keys: the
 * bridge also rejects raw `body` / `code` / `headers` strings,
 * `requestBody` / `responseBody` / `rawHeaders`, network `ip` /
 * `initiator`, and every identity-shaped credential.
 */
const MAIN_BRIDGE_FORBIDDEN_KEYS: ReadonlySet<string> = new Set([
  "body",
  "rawBody",
  "requestBody",
  "responseBody",
  "code",
  "requestHeaders",
  "responseHeaders",
  "rawHeaders",
  "headers",
  "cookie",
  "authorization",
  "csrf",
  "token",
  "username",
  "account",
  "ip",
  "initiator",
]);

/** Closed set of allowed top-level field names on a synthetic summary. */
const MAIN_BRIDGE_ALLOWED_KEYS: ReadonlySet<string> = new Set([
  "platform",
  "tabId",
  "frameId",
  "documentId",
  "method",
  "endpointKey",
  "apiTimeStamp",
  "externalSubmissionId",
  "problemExternalId",
  "redirectEndpointKey",
  "receivedAt",
  "evidenceId",
]);

/** Closed enum of rejection reasons returned by the bridge validator. */
export const MAIN_BRIDGE_REJECTION_REASONS = [
  "summary_missing",
  "summary_empty",
  "summary_too_large",
  "summary_too_many_fields",
  "summary_forbidden_key",
  "summary_unexpected_field",
  "summary_nested_object",
  "summary_nested_array",
  "summary_invalid",
] as const;
export type MainBridgeRejectionReason = typeof MAIN_BRIDGE_REJECTION_REASONS[number];

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/** Message envelope posted by the bridge via `window.postMessage`. */
export type MainBridgeForwardedMessage = {
  readonly type: typeof MAIN_BRIDGE_MESSAGE_TYPE;
  readonly summary: MainBridgeSummary;
};

/**
 * Minimal window interface required by the bridge. Only lists the postMessage,
 * addEventListener, and removeEventListener surface actually used by the bridge
 * and its real-world entry point. The runtime entry point defends against a
 * non-DOM globalThis via the `typeof` guards shown in `createMainWorldScript`
 * and the IIFE entry block, so optional members are typed as `?` rather than
 * asserted through `as unknown` casts.
 */
export interface MainWorldScriptWindow {
  addEventListener(type: string, listener: (event: unknown) => void): void;
  removeEventListener(type: string, listener: (event: unknown) => void): void;
  /** Browser-only: present on `window`, optional in tests and Node harnesses. */
  readonly postMessage?: (message: unknown, targetOrigin: string) => void;
  /** Read-only inspection surface used by tests. Optional in production. */
  readonly dispatchResponseSummary?: MainWorldScript["dispatchResponseSummary"];
}

/** UTF-8 byte counter dependency. `TextEncoder` is the production value. */
export interface ByteEncoder {
  encode(input: string): Uint8Array;
}

/** Dependency injection for the MAIN bridge factory. */
export interface MainWorldScriptDeps {
  readonly window: MainWorldScriptWindow;
  readonly encoder: ByteEncoder;
  readonly validateMessage: (value: unknown) => ParseResult<MainBridgeSummary>;
  readonly forward: (detail: MainBridgeForwardedMessage) => void;
  /** Optional override for tests; defaults to {@link MAIN_BRIDGE_QUEUE_LIMIT}. */
  readonly queueLimit?: number;
}

/** Public handle returned by the MAIN bridge factory. */
export interface MainWorldScript {
  /** Validate and (if accepted) queue + forward a synthetic summary. */
  dispatchResponseSummary(value: unknown): MainBridgeRejectionReason | null;
  /** Drain the bounded queue and forward each retained entry in FIFO order. */
  flushQueue(): number;
  /** Number of entries currently in the bounded queue. */
  queueSize(): number;
  /** Remove the pagehide and unload listeners registered by the factory. */
  dispose(): void;
}

// ---------------------------------------------------------------------------
// Pure structural validation
// ---------------------------------------------------------------------------

function isScalar(value: unknown): boolean {
  if (value === null) return true;
  const kind = typeof value;
  return kind === "string" || kind === "number" || kind === "boolean";
}

/**
 * Recursively walk an object looking for any forbidden key. Returns the
 * first forbidden key found (in pre-order traversal) or null. Cycles are
 * tolerated via a `WeakSet` of visited references.
 */
function findForbiddenKey(node: unknown, visited: WeakSet<object>): string | null {
  if (typeof node !== "object" || node === null) return null;
  if (visited.has(node)) return null;
  visited.add(node);
  if (Array.isArray(node)) {
    for (const item of node) {
      if (typeof item === "object" && item !== null) {
        const found = findForbiddenKey(item, visited);
        if (found !== null) return found;
      }
    }
    return null;
  }
  for (const [key, value] of Object.entries(node)) {
    if (MAIN_BRIDGE_FORBIDDEN_KEYS.has(key)) return key;
    if (typeof value === "object" && value !== null) {
      const found = findForbiddenKey(value, visited);
      if (found !== null) return found;
    }
  }
  return null;
}

function classifyValueShape(value: unknown): MainBridgeRejectionReason | null {
  if (isScalar(value)) return null;
  return Array.isArray(value) ? "summary_nested_array" : "summary_nested_object";
}

/**
 * Bridge-only structural validation. Rejects raw-data shape before the
 * schema validator (`parseMainBridgeSummary`) runs.
 *
 * Check order is significant:
 *
 *   1. Shape gates (`summary_missing`, `summary_empty`,
 *      `summary_too_many_fields`) — the cheapest checks fire first.
 *   2. Forbidden key walk — recursive, surfaces the most security-sensitive
 *      violation (`summary_forbidden_key`) before structural ambiguities.
 *   3. Nested-object/array gate — catches forbidden structure before the
 *      "unexpected field" gate, because a nested value is itself an
 *      ambiguous-shape violation even when the key happens to be unknown.
 *   4. Allowed-keys gate — only after the shape gates have spoken.
 *   5. Byte-size gate — the most expensive check, run last among
 *      structural gates.
 */
function validateStructure(
  value: unknown,
  encoder: ByteEncoder,
): MainBridgeRejectionReason | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return "summary_missing";
  }
  const candidate = value as { readonly [key: string]: unknown };
  const keys = Object.keys(candidate);
  if (keys.length === 0) return "summary_empty";
  if (keys.length > MAIN_BRIDGE_MAX_FIELDS) return "summary_too_many_fields";

  const forbidden = findForbiddenKey(candidate, new WeakSet<object>());
  if (forbidden !== null) return "summary_forbidden_key";

  for (const v of Object.values(candidate)) {
    const shapeRejection = classifyValueShape(v);
    if (shapeRejection !== null) return shapeRejection;
  }

  for (const key of keys) {
    if (!MAIN_BRIDGE_ALLOWED_KEYS.has(key)) return "summary_unexpected_field";
  }

  let serialized: string;
  try {
    serialized = JSON.stringify(candidate);
  } catch {
    return "summary_too_large";
  }
  const bytes = encoder.encode(serialized).byteLength;
  if (bytes > MAIN_BRIDGE_MAX_BYTES) return "summary_too_large";

  return null;
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

/**
 * Build a MAIN-world bridge script handle.
 *
 * The factory:
 *
 *   - exposes `dispatchResponseSummary` on `deps.window` so page code can
 *     invoke it as `window.dispatchResponseSummary(value)`;
 *   - registers `pagehide` and `unload` listeners that drain the bounded
 *     queue in FIFO order, calling `deps.forward` for each retained entry;
 *   - retains a bounded FIFO queue of the last `queueLimit` accepted
 *     summaries so a pagehide flush can replay them on tab close.
 *
 * Every accepted dispatch also calls `deps.forward` immediately so the
 * ISOLATED relay sees real-time traffic without waiting for navigation.
 * The relay must dedup by `evidenceId` because pagehide flushes re-send
 * the same entries.
 */
export function createMainWorldScript(deps: MainWorldScriptDeps): MainWorldScript {
  const queueLimit = deps.queueLimit ?? MAIN_BRIDGE_QUEUE_LIMIT;
  const queue: MainBridgeSummary[] = [];

  function enqueueAndForward(summary: MainBridgeSummary): void {
    if (queue.length >= queueLimit) {
      queue.shift();
    }
    queue.push(summary);
    deps.forward({ type: MAIN_BRIDGE_MESSAGE_TYPE, summary });
  }

  function flushQueue(): number {
    let count = 0;
    while (queue.length > 0) {
      const summary = queue.shift();
      if (summary === undefined) break;
      deps.forward({ type: MAIN_BRIDGE_MESSAGE_TYPE, summary });
      count++;
    }
    return count;
  }

  function dispatchResponseSummary(value: unknown): MainBridgeRejectionReason | null {
    const structural = validateStructure(value, deps.encoder);
    if (structural !== null) return structural;
    const parsed = deps.validateMessage(value);
    if (!parsed.ok) return "summary_invalid";
    enqueueAndForward(parsed.value);
    return null;
  }

  function onPageHide(): void {
    flushQueue();
  }

  deps.window.addEventListener("pagehide", onPageHide);
  deps.window.addEventListener("unload", onPageHide);

  function dispose(): void {
    deps.window.removeEventListener("pagehide", onPageHide);
    deps.window.removeEventListener("unload", onPageHide);
  }

  // Expose dispatchResponseSummary on the window so page code can invoke it.
  (deps.window as {
    dispatchResponseSummary?: MainWorldScript["dispatchResponseSummary"];
  }).dispatchResponseSummary = dispatchResponseSummary;

  return {
    dispatchResponseSummary,
    flushQueue,
    queueSize: () => queue.length,
    dispose,
  };
}

// ---------------------------------------------------------------------------
// Message contract schema (documentation)
// ---------------------------------------------------------------------------

/**
 * Documentation export describing the bridge message contract. Frozen so
 * downstream code can safely import and reference it. Not a runtime
 * validator; the bridge and relay enforce the same constraints.
 */
export const messageSchema = Object.freeze({
  type: MAIN_BRIDGE_MESSAGE_TYPE,
  description: "Synthetic summary candidate posted from the MAIN-world bridge to the ISOLATED relay.",
  maxFields: MAIN_BRIDGE_MAX_FIELDS,
  maxBytes: MAIN_BRIDGE_MAX_BYTES,
  queueLimit: MAIN_BRIDGE_QUEUE_LIMIT,
  forbiddenKeys: Object.freeze([...MAIN_BRIDGE_FORBIDDEN_KEYS]),
  allowedKeys: Object.freeze([...MAIN_BRIDGE_ALLOWED_KEYS]),
  rejectionReasons: Object.freeze([...MAIN_BRIDGE_REJECTION_REASONS]),
  requiredSummaryFields: Object.freeze([
    "platform",
    "tabId",
    "frameId",
    "documentId",
    "method",
    "endpointKey",
    "apiTimeStamp",
    "receivedAt",
    "evidenceId",
  ]),
});

// ---------------------------------------------------------------------------
// IIFE entry point
// ---------------------------------------------------------------------------

/**
 * Wire the bridge in a real browser MAIN world. The block is a no-op
 * under Node.js / vitest because `process.versions.node` is undefined in
 * browsers and defined in every Node.js test runtime. This lets unit
 * tests import the module without triggering the side effect.
 *
 * The injection itself is gated by the adapter registry: the background
 * worker only calls `chrome.scripting.executeScript({ world: "MAIN" })`
 * for adapters whose V4 readiness has reached the opt-in stage. As of
 * Phase A Task A7 no adapter has reached that stage, so the bundle
 * exists for capability declaration but is never injected in practice.
 */
if (typeof process === "undefined" || typeof process.versions?.node === "undefined") {
  const win: MainWorldScriptWindow = globalThis;
  const post = (detail: MainBridgeForwardedMessage): void => {
    // Defensive structural guard: real `window.postMessage` is a function,
    // but the bridge must compile against any globalThis and never assert
    // through `as unknown`. The runtime `typeof` check narrows the optional
    // member so the call is type-safe even when the host lacks postMessage.
    if (typeof win.postMessage === "function") {
      win.postMessage(detail, "*");
    }
  };
  createMainWorldScript({
    window: win,
    encoder: new TextEncoder(),
    validateMessage: parseMainBridgeSummary,
    forward: post,
  });
}