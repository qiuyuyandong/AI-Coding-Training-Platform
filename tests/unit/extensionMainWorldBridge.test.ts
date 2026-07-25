/**
 * Phase A Task A7 — optional low-trust MAIN bridge unit tests.
 *
 * Both `mainWorldBridge.ts` and `mainWorldRelay.ts` are pure modules:
 * no `chrome.*` imports, no DOM, no clock, no I/O. Each factory accepts
 * dependency-injected listeners and sinks. The tests below pin:
 *
 *   - the closed rejection-reason enum;
 *   - the size, field-count, forbidden-key, and nested-shape gates;
 *   - the schema gate (`parseMainBridgeSummary`) the bridge shares with
 *     the correlator (defense in depth);
 *   - the queue's FIFO eviction at the bounded limit;
 *   - the `pagehide` / `unload` flush that re-forwards retained entries;
 *   - the relay's same-window / cross-window / document-context gates.
 */
import { describe, expect, it } from "vitest";

import { parseMainBridgeSummary } from "@/extension/src/submissionCorrelator";
import {
  MAIN_BRIDGE_MAX_BYTES,
  MAIN_BRIDGE_MAX_FIELDS,
  MAIN_BRIDGE_MESSAGE_TYPE,
  MAIN_BRIDGE_QUEUE_LIMIT,
  MAIN_BRIDGE_REJECTION_REASONS,
  createMainWorldScript,
  messageSchema as bridgeMessageSchema,
  type MainBridgeForwardedMessage,
  type MainWorldScript,
  type MainWorldScriptWindow,
} from "@/extension/src/mainWorldBridge";
import {
  MAIN_WORLD_RELAY_FORWARD_TYPE,
  createMainWorldRelay,
  evaluateMainBridgeMessage,
  messageSchema as relayMessageSchema,
  type MainWorldRelayEnvelope,
} from "@/extension/src/mainWorldRelay";

// ---------------------------------------------------------------------------
// Fakes
// ---------------------------------------------------------------------------

class FakeWindow implements MainWorldScriptWindow {
  private readonly listeners = new Map<string, Set<(event: unknown) => void>>();
  dispatchResponseSummary?: MainWorldScript["dispatchResponseSummary"];

  addEventListener(type: string, listener: (event: unknown) => void): void {
    let bucket = this.listeners.get(type);
    if (bucket === undefined) {
      bucket = new Set();
      this.listeners.set(type, bucket);
    }
    bucket.add(listener);
  }

  removeEventListener(type: string, listener: (event: unknown) => void): void {
    this.listeners.get(type)?.delete(listener);
  }

  dispatch(type: string, event: unknown): void {
    const bucket = this.listeners.get(type);
    if (bucket === undefined) return;
    for (const listener of bucket) listener(event);
  }

  listenerCount(type: string): number {
    return this.listeners.get(type)?.size ?? 0;
  }
}

const BASE_SUMMARY: Record<string, unknown> = {
  platform: "leetcode",
  tabId: 0,
  frameId: 0,
  documentId: "doc_1",
  method: "POST",
  endpointKey: "submit",
  apiTimeStamp: 1_000_000,
  receivedAt: "2026-07-24T00:00:00.000Z",
  evidenceId: "ev_1",
};

interface BridgeHarness {
  readonly win: FakeWindow;
  readonly forwarded: MainBridgeForwardedMessage[];
  readonly script: MainWorldScript;
}

function setupBridge(opts: { queueLimit?: number } = {}): BridgeHarness {
  const win = new FakeWindow();
  const forwarded: MainBridgeForwardedMessage[] = [];
  const script = createMainWorldScript({
    window: win,
    encoder: new TextEncoder(),
    validateMessage: parseMainBridgeSummary,
    forward: (detail) => forwarded.push(detail),
    ...(opts.queueLimit !== undefined ? { queueLimit: opts.queueLimit } : {}),
  });
  return { win, forwarded, script };
}

interface RelayHarness {
  readonly win: FakeWindow;
  readonly otherWin: FakeWindow;
  readonly relayed: MainWorldRelayEnvelope[];
  readonly relay: ReturnType<typeof createMainWorldRelay>;
}

function setupRelay(documentId: string): RelayHarness {
  const win = new FakeWindow();
  const otherWin = new FakeWindow();
  const relayed: MainWorldRelayEnvelope[] = [];
  const relay = createMainWorldRelay({
    window: win,
    capturedDocumentId: documentId,
    relay: (envelope) => relayed.push(envelope),
  });
  return { win, otherWin, relayed, relay };
}

// ---------------------------------------------------------------------------
// Closed enums + module constants (Phase A Task A7)
// ---------------------------------------------------------------------------

describe("MAIN bridge — closed enums and constants (Phase A Task A7)", () => {
  it("MAIN_BRIDGE_REJECTION_REASONS contains exactly nine closed values", () => {
    expect(MAIN_BRIDGE_REJECTION_REASONS).toEqual([
      "summary_missing",
      "summary_empty",
      "summary_too_large",
      "summary_too_many_fields",
      "summary_forbidden_key",
      "summary_unexpected_field",
      "summary_nested_object",
      "summary_nested_array",
      "summary_invalid",
    ]);
    expect(new Set(MAIN_BRIDGE_REJECTION_REASONS).size).toBe(
      MAIN_BRIDGE_REJECTION_REASONS.length,
    );
  });

  it("MAIN_BRIDGE_MESSAGE_TYPE is the unguessable constant V4_MAIN_BRIDGE_SUMMARY", () => {
    expect(MAIN_BRIDGE_MESSAGE_TYPE).toBe("V4_MAIN_BRIDGE_SUMMARY");
  });

  it("size, field-count, and queue-limit constants match the spec", () => {
    expect(MAIN_BRIDGE_MAX_FIELDS).toBe(18);
    expect(MAIN_BRIDGE_MAX_BYTES).toBe(4096);
    expect(MAIN_BRIDGE_QUEUE_LIMIT).toBe(16);
  });

  it("bridge messageSchema is frozen and references the closed constants", () => {
    expect(Object.isFrozen(bridgeMessageSchema)).toBe(true);
    expect(bridgeMessageSchema.type).toBe(MAIN_BRIDGE_MESSAGE_TYPE);
    expect(bridgeMessageSchema.maxFields).toBe(MAIN_BRIDGE_MAX_FIELDS);
    expect(bridgeMessageSchema.maxBytes).toBe(MAIN_BRIDGE_MAX_BYTES);
    expect(bridgeMessageSchema.queueLimit).toBe(MAIN_BRIDGE_QUEUE_LIMIT);
    expect(bridgeMessageSchema.rejectionReasons).toEqual([...MAIN_BRIDGE_REJECTION_REASONS]);
  });

  it("relay messageSchema is frozen and references both closed types", () => {
    expect(Object.isFrozen(relayMessageSchema)).toBe(true);
    expect(relayMessageSchema.sourceMessageType).toBe(MAIN_BRIDGE_MESSAGE_TYPE);
    expect(relayMessageSchema.forwardType).toBe(MAIN_WORLD_RELAY_FORWARD_TYPE);
  });
});

// ---------------------------------------------------------------------------
// MAIN bridge — happy path (Phase A Task A7)
// ---------------------------------------------------------------------------

describe("MAIN bridge — happy path (Phase A Task A7)", () => {
  it("accepts a valid synthetic summary, forwards once, and enqueues", () => {
    const { script, forwarded } = setupBridge();
    expect(script.dispatchResponseSummary({ ...BASE_SUMMARY })).toBeNull();
    expect(forwarded).toHaveLength(1);
    expect(forwarded[0]?.type).toBe(MAIN_BRIDGE_MESSAGE_TYPE);
    expect(forwarded[0]?.summary.platform).toBe("leetcode");
    expect(script.queueSize()).toBe(1);
  });

  it("valid summary bytes are well under 4096 and fields are under 18", () => {
    const serialized = JSON.stringify(BASE_SUMMARY);
    expect(new TextEncoder().encode(serialized).byteLength).toBeLessThanOrEqual(
      MAIN_BRIDGE_MAX_BYTES,
    );
    expect(Object.keys(BASE_SUMMARY).length).toBeLessThanOrEqual(MAIN_BRIDGE_MAX_FIELDS);
  });

  it("dispatches many accepted summaries back-to-back without losing forwards", () => {
    const { script, forwarded } = setupBridge();
    for (let i = 0; i < 5; i++) {
      script.dispatchResponseSummary({ ...BASE_SUMMARY, evidenceId: `ev_${i}` });
    }
    expect(forwarded).toHaveLength(5);
    expect(forwarded.map((f) => f.summary.evidenceId)).toEqual([
      "ev_0",
      "ev_1",
      "ev_2",
      "ev_3",
      "ev_4",
    ]);
  });

  it("exposes dispatchResponseSummary on the supplied window", () => {
    const { win, script } = setupBridge();
    expect(win.dispatchResponseSummary).toBe(script.dispatchResponseSummary);
  });
});

// ---------------------------------------------------------------------------
// MAIN bridge — rejection gates (Phase A Task A7)
// ---------------------------------------------------------------------------

describe("MAIN bridge — rejection gates (Phase A Task A7)", () => {
  it.each([
    ["body at top level", { ...BASE_SUMMARY, body: "raw text" }, "summary_forbidden_key"],
    ["requestBody at top level", { ...BASE_SUMMARY, requestBody: "x" }, "summary_forbidden_key"],
    ["responseBody at top level", { ...BASE_SUMMARY, responseBody: "x" }, "summary_forbidden_key"],
    ["token at top level", { ...BASE_SUMMARY, token: "secret" }, "summary_forbidden_key"],
    ["headers at top level", { ...BASE_SUMMARY, headers: { a: 1 } }, "summary_forbidden_key"],
    ["code at top level", { ...BASE_SUMMARY, code: "raw" }, "summary_forbidden_key"],
    ["ip field present", { ...BASE_SUMMARY, ip: "1.2.3.4" }, "summary_forbidden_key"],
    ["initiator field present", { ...BASE_SUMMARY, initiator: "page" }, "summary_forbidden_key"],
  ])("rejects %s with %s", (_label, payload, expected) => {
    const { script } = setupBridge();
    expect(script.dispatchResponseSummary(payload)).toBe(expected);
  });

  it("rejects forbidden keys nested inside arrays", () => {
    const { script } = setupBridge();
    const payload = { ...BASE_SUMMARY, items: [{ body: "secret" }] };
    // Forbidden-key walk fires first; the security-sensitive reason wins
    // over the structural shape reason so callers always see the actionable
    // diagnostic.
    expect(script.dispatchResponseSummary(payload)).toBe("summary_forbidden_key");
  });

  it("rejects a forbidden key nested inside a plain object value", () => {
    const { script } = setupBridge();
    const payload = { ...BASE_SUMMARY, nested: { token: "secret" } };
    expect(script.dispatchResponseSummary(payload)).toBe("summary_forbidden_key");
  });

  it("rejects non-canonical receivedAt with summary_invalid", () => {
    const { script } = setupBridge();
    const payload = { ...BASE_SUMMARY, receivedAt: "2026-07-24 12:00:00Z" };
    expect(script.dispatchResponseSummary(payload)).toBe("summary_invalid");
  });

  it("rejects negative apiTimeStamp with summary_invalid", () => {
    const { script } = setupBridge();
    const payload = { ...BASE_SUMMARY, apiTimeStamp: -1 };
    expect(script.dispatchResponseSummary(payload)).toBe("summary_invalid");
  });

  it("rejects Infinity apiTimeStamp with summary_invalid", () => {
    const { script } = setupBridge();
    const payload = { ...BASE_SUMMARY, apiTimeStamp: Number.POSITIVE_INFINITY };
    expect(script.dispatchResponseSummary(payload)).toBe("summary_invalid");
  });

  it("rejects NaN apiTimeStamp with summary_invalid", () => {
    const { script } = setupBridge();
    const payload = { ...BASE_SUMMARY, apiTimeStamp: Number.NaN };
    expect(script.dispatchResponseSummary(payload)).toBe("summary_invalid");
  });

  it("rejects empty payload {} with summary_empty", () => {
    const { script } = setupBridge();
    expect(script.dispatchResponseSummary({})).toBe("summary_empty");
  });

  it("rejects a payload with one non-scalar value (non-numeric unexpected)", () => {
    const { script } = setupBridge();
    const payload = { ...BASE_SUMMARY, surprise: "not allowed" };
    expect(script.dispatchResponseSummary(payload)).toBe("summary_unexpected_field");
  });

  it("rejects a payload with more than 18 fields with summary_too_many_fields", () => {
    const { script } = setupBridge();
    const payload = {
      ...BASE_SUMMARY,
      extra1: "a", extra2: "a", extra3: "a", extra4: "a", extra5: "a",
      extra6: "a", extra7: "a", extra8: "a", extra9: "a", extra10: "a",
    };
    expect(Object.keys(payload).length).toBeGreaterThan(MAIN_BRIDGE_MAX_FIELDS);
    expect(script.dispatchResponseSummary(payload)).toBe("summary_too_many_fields");
  });

  it("rejects a payload exceeding 4096 bytes with summary_too_large", () => {
    const { script } = setupBridge();
    const huge = "x".repeat(MAIN_BRIDGE_MAX_BYTES + 100);
    const payload = { ...BASE_SUMMARY, externalSubmissionId: huge };
    expect(script.dispatchResponseSummary(payload)).toBe("summary_too_large");
  });

  it("rejects a payload containing a nested object with summary_nested_object", () => {
    const { script } = setupBridge();
    const payload = { ...BASE_SUMMARY, nested: { foo: "bar" } };
    expect(script.dispatchResponseSummary(payload)).toBe("summary_nested_object");
  });

  it("rejects a payload containing a nested array with summary_nested_array", () => {
    const { script } = setupBridge();
    const payload = { ...BASE_SUMMARY, items: ["a", "b"] };
    expect(script.dispatchResponseSummary(payload)).toBe("summary_nested_array");
  });

  it.each([
    ["null", null],
    ["undefined", undefined],
    ["string", "not-a-summary"],
    ["number", 42],
    ["array", []],
    ["boolean", true],
  ])("rejects non-object input %s with summary_missing", (_label, input) => {
    const { script } = setupBridge();
    expect(script.dispatchResponseSummary(input)).toBe("summary_missing");
  });

  it("rejection does not enqueue nor forward", () => {
    const { script, forwarded } = setupBridge();
    expect(script.dispatchResponseSummary({ body: "secret" })).toBe("summary_forbidden_key");
    expect(forwarded).toHaveLength(0);
    expect(script.queueSize()).toBe(0);
  });

  it("rejects an unknown platform via the schema gate with summary_invalid", () => {
    const { script } = setupBridge();
    const payload = { ...BASE_SUMMARY, platform: "foobar" };
    expect(script.dispatchResponseSummary(payload)).toBe("summary_invalid");
  });
});

// ---------------------------------------------------------------------------
// MAIN bridge — queue retention (Phase A Task A7)
// ---------------------------------------------------------------------------

describe("MAIN bridge — bounded queue retention (Phase A Task A7)", () => {
  it("keeps the queue at or below queueLimit, evicting the oldest entry first", () => {
    const { script } = setupBridge({ queueLimit: 3 });
    for (let i = 0; i < 5; i++) {
      script.dispatchResponseSummary({ ...BASE_SUMMARY, evidenceId: `ev_${i}` });
    }
    expect(script.queueSize()).toBe(3);
    // Immediate forward happened 5 times; queue retains only the last 3.
    // The flush below must forward ev_2, ev_3, ev_4 in FIFO order.
    const flushed = script.flushQueue();
    expect(flushed).toBe(3);
  });

  it("default queueLimit is MAIN_BRIDGE_QUEUE_LIMIT (16)", () => {
    const { script } = setupBridge();
    for (let i = 0; i < MAIN_BRIDGE_QUEUE_LIMIT + 1; i++) {
      script.dispatchResponseSummary({ ...BASE_SUMMARY, evidenceId: `ev_${i}` });
    }
    expect(script.queueSize()).toBe(MAIN_BRIDGE_QUEUE_LIMIT);
  });
});

// ---------------------------------------------------------------------------
// MAIN bridge — pagehide / unload flush (Phase A Task A7)
// ---------------------------------------------------------------------------

describe("MAIN bridge — pagehide flush (Phase A Task A7)", () => {
  it("forwards every queued payload in FIFO order on pagehide", () => {
    const { win, script, forwarded } = setupBridge();
    script.dispatchResponseSummary({ ...BASE_SUMMARY, evidenceId: "ev_1" });
    script.dispatchResponseSummary({ ...BASE_SUMMARY, evidenceId: "ev_2" });
    script.dispatchResponseSummary({ ...BASE_SUMMARY, evidenceId: "ev_3" });
    // 3 immediate forwards happened during dispatch.
    expect(forwarded).toHaveLength(3);
    win.dispatch("pagehide", { type: "pagehide" });
    // 3 more forwards from the flush — total 6.
    expect(forwarded).toHaveLength(6);
    // FIFO replay: last 3 entries mirror ev_1, ev_2, ev_3.
    expect(forwarded[3]?.summary.evidenceId).toBe("ev_1");
    expect(forwarded[4]?.summary.evidenceId).toBe("ev_2");
    expect(forwarded[5]?.summary.evidenceId).toBe("ev_3");
    expect(script.queueSize()).toBe(0);
  });

  it("unload event triggers the same FIFO flush", () => {
    const { win, script, forwarded } = setupBridge();
    script.dispatchResponseSummary({ ...BASE_SUMMARY, evidenceId: "ev_1" });
    expect(forwarded).toHaveLength(1);
    win.dispatch("unload", { type: "unload" });
    expect(forwarded).toHaveLength(2);
  });

  it("pagehide flush is a no-op when the queue is empty", () => {
    const { win, script, forwarded } = setupBridge();
    win.dispatch("pagehide", { type: "pagehide" });
    expect(forwarded).toHaveLength(0);
    expect(script.queueSize()).toBe(0);
  });

  it("queueSize never exceeds queueLimit across many pagehide cycles", () => {
    const { win, script } = setupBridge({ queueLimit: 4 });
    for (let cycle = 0; cycle < 3; cycle++) {
      for (let i = 0; i < 6; i++) {
        script.dispatchResponseSummary({
          ...BASE_SUMMARY,
          evidenceId: `cycle_${cycle}_ev_${i}`,
        });
      }
      expect(script.queueSize()).toBeLessThanOrEqual(4);
      win.dispatch("pagehide", { type: "pagehide" });
      expect(script.queueSize()).toBe(0);
    }
  });

  it("dispose removes the pagehide and unload listeners", () => {
    const { win, script, forwarded } = setupBridge();
    script.dispatchResponseSummary({ ...BASE_SUMMARY, evidenceId: "ev_1" });
    script.dispose();
    expect(win.listenerCount("pagehide")).toBe(0);
    expect(win.listenerCount("unload")).toBe(0);
    win.dispatch("pagehide", { type: "pagehide" });
    // Only the initial forward is recorded; the flush never fires.
    expect(forwarded).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// MAIN relay — message-event gates (Phase A Task A7)
// ---------------------------------------------------------------------------

describe("MAIN relay — message-event gates (Phase A Task A7)", () => {
  it("accepts V4_MAIN_BRIDGE_SUMMARY from the same window and forwards", () => {
    const { win, relayed } = setupRelay("doc_1");
    win.dispatch("message", {
      type: "message",
      data: { type: MAIN_BRIDGE_MESSAGE_TYPE, summary: { ...BASE_SUMMARY } },
      source: win,
    });
    expect(relayed).toHaveLength(1);
    expect(relayed[0]?.type).toBe(MAIN_WORLD_RELAY_FORWARD_TYPE);
    expect(relayed[0]?.summary.platform).toBe("leetcode");
    expect(relayed[0]?.document.documentId).toBe("doc_1");
    expect(relayed[0]?.document.platform).toBe("leetcode");
  });

  it("ignores messages whose type is not V4_MAIN_BRIDGE_SUMMARY", () => {
    const { win, relayed } = setupRelay("doc_1");
    win.dispatch("message", {
      type: "message",
      data: { type: "UNRELATED_MESSAGE", summary: { ...BASE_SUMMARY } },
      source: win,
    });
    expect(relayed).toHaveLength(0);
  });

  it("drops messages whose event.source is not the host window (cross-window rejection)", () => {
    const { win, otherWin, relayed } = setupRelay("doc_1");
    win.dispatch("message", {
      type: "message",
      data: { type: MAIN_BRIDGE_MESSAGE_TYPE, summary: { ...BASE_SUMMARY } },
      source: otherWin,
    });
    expect(relayed).toHaveLength(0);
  });

  it("drops messages whose summary.documentId does not match capturedDocumentId", () => {
    const { win, relayed } = setupRelay("doc_captured");
    win.dispatch("message", {
      type: "message",
      data: {
        type: MAIN_BRIDGE_MESSAGE_TYPE,
        summary: { ...BASE_SUMMARY, documentId: "doc_other" },
      },
      source: win,
    });
    expect(relayed).toHaveLength(0);
  });

  it("re-validates the summary through parseMainBridgeSummary (defense in depth)", () => {
    const { win, relayed } = setupRelay("doc_1");
    win.dispatch("message", {
      type: "message",
      data: {
        type: MAIN_BRIDGE_MESSAGE_TYPE,
        summary: { ...BASE_SUMMARY, platform: "unknown" },
      },
      source: win,
    });
    expect(relayed).toHaveLength(0);
  });

  it("drops messages whose data is malformed or summary is not an object", () => {
    const { win, relayed } = setupRelay("doc_1");
    win.dispatch("message", {
      type: "message",
      data: { type: MAIN_BRIDGE_MESSAGE_TYPE, summary: null },
      source: win,
    });
    win.dispatch("message", {
      type: "message",
      data: { type: MAIN_BRIDGE_MESSAGE_TYPE, summary: "not-an-object" },
      source: win,
    });
    win.dispatch("message", {
      type: "message",
      data: null,
      source: win,
    });
    expect(relayed).toHaveLength(0);
  });

  it("dispose removes the message listener", () => {
    const { win, relayed, relay } = setupRelay("doc_1");
    relay.dispose();
    expect(win.listenerCount("message")).toBe(0);
    win.dispatch("message", {
      type: "message",
      data: { type: MAIN_BRIDGE_MESSAGE_TYPE, summary: { ...BASE_SUMMARY } },
      source: win,
    });
    expect(relayed).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// MAIN relay — pure gate (Phase A Task A7)
// ---------------------------------------------------------------------------

describe("MAIN relay — pure gate evaluateMainBridgeMessage (Phase A Task A7)", () => {
  it("returns null for non-object events", () => {
    expect(evaluateMainBridgeMessage(null, new FakeWindow(), "doc_1")).toBeNull();
    expect(evaluateMainBridgeMessage("string", new FakeWindow(), "doc_1")).toBeNull();
    expect(evaluateMainBridgeMessage(42, new FakeWindow(), "doc_1")).toBeNull();
  });

  it("returns null when event.source is not the expected window", () => {
    const win = new FakeWindow();
    const other = new FakeWindow();
    const result = evaluateMainBridgeMessage(
      { source: other, data: { type: MAIN_BRIDGE_MESSAGE_TYPE, summary: { ...BASE_SUMMARY } } },
      win,
      "doc_1",
    );
    expect(result).toBeNull();
  });

  it("rejects a relay summary with a forbidden top-level key", () => {
    const win = new FakeWindow();
    expect(evaluateMainBridgeMessage(
      {
        source: win,
        data: {
          type: MAIN_BRIDGE_MESSAGE_TYPE,
          summary: { ...BASE_SUMMARY, body: "leaked" },
        },
      },
      win,
      "doc_1",
    )).toBeNull();
  });

  it("rejects a relay summary with a forbidden nested key", () => {
    const win = new FakeWindow();
    expect(evaluateMainBridgeMessage(
      {
        source: win,
        data: {
          type: MAIN_BRIDGE_MESSAGE_TYPE,
          summary: { ...BASE_SUMMARY, nested: { token: "leaked" } },
        },
      },
      win,
      "doc_1",
    )).toBeNull();
  });

  it("accepts a valid summary containing every A1-safe optional field", () => {
    const win = new FakeWindow();
    const result = evaluateMainBridgeMessage(
      {
        source: win,
        data: {
          type: MAIN_BRIDGE_MESSAGE_TYPE,
          summary: {
            ...BASE_SUMMARY,
            externalSubmissionId: "submission_1",
            problemExternalId: "problem_1",
            redirectEndpointKey: "result",
          },
        },
      },
      win,
      "doc_1",
    );
    expect(result?.summary.externalSubmissionId).toBe("submission_1");
    expect(result?.summary.problemExternalId).toBe("problem_1");
    expect(result?.summary.redirectEndpointKey).toBe("result");
  });

  it("returns the envelope when every gate passes", () => {
    const win = new FakeWindow();
    const result = evaluateMainBridgeMessage(
      { source: win, data: { type: MAIN_BRIDGE_MESSAGE_TYPE, summary: { ...BASE_SUMMARY } } },
      win,
      "doc_1",
    );
    expect(result).not.toBeNull();
    if (result === null) throw new Error("expected envelope");
    expect(result.type).toBe(MAIN_WORLD_RELAY_FORWARD_TYPE);
    expect(result.document.documentId).toBe("doc_1");
  });
});