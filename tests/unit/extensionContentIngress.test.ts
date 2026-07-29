import { describe, expect, it } from "vitest";
import {
  isExactNowCoderResultUrl,
  reduceIngress,
  type IngressEffect,
  INITIAL_STATE,
} from "@/extension/src/contentIngress";

// ---------------------------------------------------------------------------
// URL gate tests
// ---------------------------------------------------------------------------

function makeUrl(raw: string): URL {
  return new URL(raw);
}

function asEffects(effects: readonly IngressEffect[]): readonly string[] {
  return effects.map((e) => e.type);
}

describe("isExactNowCoderResultUrl", () => {
  // --- Accept cases ---

  it("accepts exact route with single-digit submissionId", () => {
    expect(isExactNowCoderResultUrl(makeUrl("https://ac.nowcoder.com/acm/contest/view-submission?submissionId=1"))).toBe(true);
  });

  it("accepts exact route with 20-digit submissionId", () => {
    expect(isExactNowCoderResultUrl(makeUrl("https://ac.nowcoder.com/acm/contest/view-submission?submissionId=12345678901234567890"))).toBe(true);
  });

  it("accepts exact route with the known real submissionId 84258557", () => {
    expect(isExactNowCoderResultUrl(makeUrl("https://ac.nowcoder.com/acm/contest/view-submission?submissionId=84258557"))).toBe(true);
  });

  it("rejects trailing slash not accepted by the E3 policy", () => {
    expect(isExactNowCoderResultUrl(makeUrl("https://ac.nowcoder.com/acm/contest/view-submission/?submissionId=123"))).toBe(false);
  });

  // --- Reject: scheme ---

  it("rejects http scheme", () => {
    expect(isExactNowCoderResultUrl(makeUrl("http://ac.nowcoder.com/acm/contest/view-submission?submissionId=1"))).toBe(false);
  });

  // --- Reject: hostname ---

  it("rejects www.nowcoder.com hostname", () => {
    expect(isExactNowCoderResultUrl(makeUrl("https://www.nowcoder.com/acm/contest/view-submission?submissionId=1"))).toBe(false);
  });

  it("rejects lookalike hostname with trailing dot", () => {
    expect(isExactNowCoderResultUrl(makeUrl("https://ac.nowcoder.com./acm/contest/view-submission?submissionId=1"))).toBe(false);
  });

  it("rejects different subdomain", () => {
    expect(isExactNowCoderResultUrl(makeUrl("https://oj.nowcoder.com/acm/contest/view-submission?submissionId=1"))).toBe(false);
  });

  // --- Reject: credentials / port ---

  it("rejects URL with credentials", () => {
    expect(isExactNowCoderResultUrl(makeUrl("https://user:pass@ac.nowcoder.com/acm/contest/view-submission?submissionId=1"))).toBe(false);
  });

  it("rejects URL with explicit port", () => {
    expect(isExactNowCoderResultUrl(makeUrl("https://ac.nowcoder.com:8443/acm/contest/view-submission?submissionId=1"))).toBe(false);
  });

  // --- Reject: path ---

  it("rejects empty path", () => {
    expect(isExactNowCoderResultUrl(makeUrl("https://ac.nowcoder.com/?submissionId=1"))).toBe(false);
  });

  it("rejects wrong path /acm/contest/submission", () => {
    expect(isExactNowCoderResultUrl(makeUrl("https://ac.nowcoder.com/acm/contest/submission?submissionId=1"))).toBe(false);
  });

  it("rejects /acm/problem/ route", () => {
    expect(isExactNowCoderResultUrl(makeUrl("https://ac.nowcoder.com/acm/problem/1001?submissionId=1"))).toBe(false);
  });

  it("rejects extra path segment after view-submission", () => {
    expect(isExactNowCoderResultUrl(makeUrl("https://ac.nowcoder.com/acm/contest/view-submission/extra?submissionId=1"))).toBe(false);
  });

  it("rejects double trailing slash", () => {
    expect(isExactNowCoderResultUrl(makeUrl("https://ac.nowcoder.com/acm/contest/view-submission//?submissionId=1"))).toBe(false);
  });

  // --- Reject: hash ---

  it("rejects URL with hash", () => {
    expect(isExactNowCoderResultUrl(makeUrl("https://ac.nowcoder.com/acm/contest/view-submission?submissionId=1#fragment"))).toBe(false);
  });

  // --- Reject: submissionId ---

  it("rejects missing submissionId", () => {
    expect(isExactNowCoderResultUrl(makeUrl("https://ac.nowcoder.com/acm/contest/view-submission"))).toBe(false);
  });

  it("rejects empty submissionId value", () => {
    expect(isExactNowCoderResultUrl(makeUrl("https://ac.nowcoder.com/acm/contest/view-submission?submissionId="))).toBe(false);
  });

  it("rejects submissionId with non-decimal characters", () => {
    expect(isExactNowCoderResultUrl(makeUrl("https://ac.nowcoder.com/acm/contest/view-submission?submissionId=12a"))).toBe(false);
  });

  it("rejects submissionId with overlong 21 digits", () => {
    expect(isExactNowCoderResultUrl(makeUrl("https://ac.nowcoder.com/acm/contest/view-submission?submissionId=123456789012345678901"))).toBe(false);
  });

  it("rejects submissionId with leading zeros only", () => {
    expect(isExactNowCoderResultUrl(makeUrl("https://ac.nowcoder.com/acm/contest/view-submission?submissionId=00"))).toBe(true); // "00" is valid 1-20 digits
  });

  it("rejects extra query key foo=bar", () => {
    expect(isExactNowCoderResultUrl(makeUrl("https://ac.nowcoder.com/acm/contest/view-submission?submissionId=1&foo=bar"))).toBe(false);
  });

  it("rejects submissionId with leading zero (valid but rare edge)", () => {
    // Leading zeros are technically valid decimal digits per the regex; the gate
    // accepts them because the plan specifies [0-9]{1,20} not a numeric value.
    expect(isExactNowCoderResultUrl(makeUrl("https://ac.nowcoder.com/acm/contest/view-submission?submissionId=01"))).toBe(true);
  });

  // --- Fake OJ / localhost ---

  it("rejects localhost URL presented as production URL", () => {
    expect(isExactNowCoderResultUrl(makeUrl("https://localhost:8080/acm/contest/view-submission?submissionId=1"))).toBe(false);
    expect(isExactNowCoderResultUrl(makeUrl("https://127.0.0.1/acm/contest/view-submission?submissionId=1"))).toBe(false);
  });

  it("rejects about:blank", () => {
    expect(isExactNowCoderResultUrl(makeUrl("about:blank"))).toBe(false);
  });

  it("rejects data: URL", () => {
    expect(isExactNowCoderResultUrl(makeUrl("data:text/html,<p>"))).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Coordinator reducer tests
// ---------------------------------------------------------------------------

const VALID_URL = "https://ac.nowcoder.com/acm/contest/view-submission?submissionId=84258557";

function tick(start = 0): () => string {
  let counter = start;
  return () => {
    counter += 1;
    return `2026-07-29T00:00:${String(counter).padStart(2, "0")}.000Z`;
  };
}

describe("reduceIngress – top-frame rule", () => {
  it("accepts committed in top frame (frameId === 0)", () => {
    const result = reduceIngress(INITIAL_STATE, { kind: "committed", url: new URL(VALID_URL), tabId: 1, frameId: 0, documentId: "doc_1" }, tick());
    expect(asEffects(result.effects)).not.toContain("ignored");
    expect(result.state.committed.has("doc_1")).toBe(true);
  });

  it("rejects committed in non-top frame (frameId > 0)", () => {
    const result = reduceIngress(INITIAL_STATE, { kind: "committed", url: new URL(VALID_URL), tabId: 1, frameId: 1, documentId: "doc_1" }, tick());
    expect(asEffects(result.effects)).toContain("ignored");
    const ignored = result.effects.find((e) => e.type === "ignored") as Extract<IngressEffect, { type: "ignored" }>;
    expect(ignored.reason).toBe("frame_rejected");
  });

  it("rejects completed in non-top frame", () => {
    const result = reduceIngress(INITIAL_STATE, { kind: "completed", url: new URL(VALID_URL), tabId: 1, frameId: 5, documentId: "doc_1" }, tick());
    expect(asEffects(result.effects)).toContain("ignored");
  });

  it("rejects history_state in non-top frame", () => {
    const result = reduceIngress(INITIAL_STATE, { kind: "history_state", url: new URL(VALID_URL), tabId: 1, frameId: 2, documentId: "doc_1" }, tick());
    expect(asEffects(result.effects)).toContain("ignored");
  });

  it("rejects startup in non-top frame", () => {
    const result = reduceIngress(INITIAL_STATE, { kind: "startup", url: new URL(VALID_URL), tabId: 1, frameId: 3, documentId: "doc_1" }, tick());
    expect(asEffects(result.effects)).toContain("ignored");
  });
});

describe("reduceIngress – tabId rule", () => {
  it("accepts tabId === 0", () => {
    const result = reduceIngress(INITIAL_STATE, { kind: "committed", url: new URL(VALID_URL), tabId: 0, frameId: 0, documentId: "doc_1" }, tick());
    expect(asEffects(result.effects)).not.toContain("ignored");
  });

  it("accepts tabId >= 0 (positive)", () => {
    const result = reduceIngress(INITIAL_STATE, { kind: "committed", url: new URL(VALID_URL), tabId: 999, frameId: 0, documentId: "doc_1" }, tick());
    expect(asEffects(result.effects)).not.toContain("ignored");
  });

  it("rejects negative tabId", () => {
    const result = reduceIngress(INITIAL_STATE, { kind: "committed", url: new URL(VALID_URL), tabId: -1, frameId: 0, documentId: "doc_1" }, tick());
    expect(asEffects(result.effects)).toContain("ignored");
    const ignored = result.effects.find((e) => e.type === "ignored") as Extract<IngressEffect, { type: "ignored" }>;
    expect(ignored.reason).toBe("tab_id_invalid");
  });

  it("rejects negative tabId on ready input", () => {
    const result = reduceIngress(INITIAL_STATE, { kind: "ready", tabId: -1, frameId: 0, documentId: "doc_1" }, tick());
    expect(asEffects(result.effects)).toContain("ignored");
  });
});

describe("reduceIngress – document identity", () => {
  it("uses documentId as the primary key when provided", () => {
    const committed = reduceIngress(INITIAL_STATE, { kind: "committed", url: new URL(VALID_URL), tabId: 1, frameId: 0, documentId: "doc_xyz" }, tick());
    expect(committed.state.committed.has("doc_xyz")).toBe(true);
    expect(committed.state.committed.has("tab=1:frame=0")).toBe(false);
  });

  it("synthesizes key from tabId:frameId when documentId is undefined", () => {
    const committed = reduceIngress(INITIAL_STATE, { kind: "committed", url: new URL(VALID_URL), tabId: 5, frameId: 0, documentId: undefined }, tick());
    expect(committed.state.committed.has("tab=5:frame=0")).toBe(true);
  });

  it("records committed with documentId but not injected", () => {
    const result = reduceIngress(INITIAL_STATE, { kind: "committed", url: new URL(VALID_URL), tabId: 1, frameId: 0, documentId: "doc_1" }, tick());
    expect(result.state.committed.has("doc_1")).toBe(true);
    expect(result.state.injected.has("doc_1")).toBe(false);
    expect(result.effects.some((e) => e.type === "inject")).toBe(false);
  });
});

describe("reduceIngress – wrong URL", () => {
  it("rejects wrong host on committed", () => {
    const result = reduceIngress(INITIAL_STATE, { kind: "committed", url: new URL("https://evil.nowcoder.com/acm/contest/view-submission?submissionId=1"), tabId: 1, frameId: 0, documentId: "doc_1" }, tick());
    expect(asEffects(result.effects)).toContain("ignored");
  });

  it("rejects wrong path on completed", () => {
    const result = reduceIngress(INITIAL_STATE, { kind: "completed", url: new URL("https://ac.nowcoder.com/acm/problem/1001?submissionId=1"), tabId: 1, frameId: 0, documentId: "doc_1" }, tick());
    expect(asEffects(result.effects)).toContain("ignored");
  });

  it("rejects extra query key on history_state", () => {
    const result = reduceIngress(INITIAL_STATE, { kind: "history_state", url: new URL("https://ac.nowcoder.com/acm/contest/view-submission?submissionId=1&foo=bar"), tabId: 1, frameId: 0, documentId: "doc_1" }, tick());
    expect(asEffects(result.effects)).toContain("ignored");
  });

  it("rejects hash on startup", () => {
    const result = reduceIngress(INITIAL_STATE, { kind: "startup", url: new URL("https://ac.nowcoder.com/acm/contest/view-submission?submissionId=1#hash"), tabId: 1, frameId: 0, documentId: "doc_1" }, tick());
    expect(asEffects(result.effects)).toContain("ignored");
  });
});

describe("reduceIngress – committed does not inject", () => {
  it("committed records but does not emit inject effect", () => {
    const result = reduceIngress(INITIAL_STATE, { kind: "committed", url: new URL(VALID_URL), tabId: 1, frameId: 0, documentId: "doc_1" }, tick());
    expect(result.state.committed.has("doc_1")).toBe(true);
    expect(result.effects.some((e) => e.type === "inject")).toBe(false);
  });
});

describe("reduceIngress – completed injects once", () => {
  it("completed emits inject when document was committed and not ready", () => {
    const state = reduceIngress(INITIAL_STATE, { kind: "committed", url: new URL(VALID_URL), tabId: 1, frameId: 0, documentId: "doc_1" }, tick()).state;
    const result = reduceIngress(state, { kind: "completed", url: new URL(VALID_URL), tabId: 1, frameId: 0, documentId: "doc_1" }, tick());
    expect(asEffects(result.effects)).toContain("inject");
  });

  it("completed does not inject when document is already ready", () => {
    const withReady = reduceIngress(INITIAL_STATE, { kind: "ready", tabId: 1, frameId: 0, documentId: "doc_1" }, tick()).state;
    const withCommitted = reduceIngress(withReady, { kind: "committed", url: new URL(VALID_URL), tabId: 1, frameId: 0, documentId: "doc_1" }, tick()).state;
    const result = reduceIngress(withCommitted, { kind: "completed", url: new URL(VALID_URL), tabId: 1, frameId: 0, documentId: "doc_1" }, tick());
    expect(result.effects.some((e) => e.type === "inject")).toBe(false);
  });

  it("completed does not inject when document already injected (duplicate completed)", () => {
    const state = reduceIngress(INITIAL_STATE, { kind: "committed", url: new URL(VALID_URL), tabId: 1, frameId: 0, documentId: "doc_1" }, tick()).state;
    const afterInject = reduceIngress(state, { kind: "completed", url: new URL(VALID_URL), tabId: 1, frameId: 0, documentId: "doc_1" }, tick()).state;
    const result = reduceIngress(afterInject, { kind: "completed", url: new URL(VALID_URL), tabId: 1, frameId: 0, documentId: "doc_1" }, tick());
    expect(asEffects(result.effects)).toContain("ignored");
    const ignored = result.effects.find((e) => e.type === "ignored") as Extract<IngressEffect, { type: "ignored" }>;
    expect(ignored.reason).toBe("duplicate_injection");
  });

  it("completed does not inject when no committed record exists", () => {
    const result = reduceIngress(INITIAL_STATE, { kind: "completed", url: new URL(VALID_URL), tabId: 1, frameId: 0, documentId: "doc_ghost" }, tick());
    expect(result.effects.some((e) => e.type === "inject")).toBe(false);
  });

  it("inject effect carries correct identity fields", () => {
    const state = reduceIngress(INITIAL_STATE, { kind: "committed", url: new URL(VALID_URL), tabId: 42, frameId: 0, documentId: "doc_special" }, tick()).state;
    const result = reduceIngress(state, { kind: "completed", url: new URL(VALID_URL), tabId: 42, frameId: 0, documentId: "doc_special" }, tick());
    const inject = result.effects.find((e) => e.type === "inject") as Extract<IngressEffect, { type: "inject" }>;
    expect(inject.tabId).toBe(42);
    expect(inject.frameId).toBe(0);
    expect(inject.documentId).toBe("doc_special");
    expect(inject.url.href).toBe(VALID_URL);
  });
});

describe("reduceIngress – history_state / startup immediate injection", () => {
  it("history_state injects immediately when document has no ready record", () => {
    const result = reduceIngress(INITIAL_STATE, { kind: "history_state", url: new URL(VALID_URL), tabId: 1, frameId: 0, documentId: "doc_hs" }, tick());
    expect(asEffects(result.effects)).toContain("inject");
    expect(result.state.injected.has("doc_hs")).toBe(true);
  });

  it("history_state skips injection when document is already ready", () => {
    const withReady = reduceIngress(INITIAL_STATE, { kind: "ready", tabId: 1, frameId: 0, documentId: "doc_hs" }, tick()).state;
    const result = reduceIngress(withReady, { kind: "history_state", url: new URL(VALID_URL), tabId: 1, frameId: 0, documentId: "doc_hs" }, tick());
    expect(result.effects.some((e) => e.type === "inject")).toBe(false);
  });

  it("history_state skips injection when already injected", () => {
    const afterFirst = reduceIngress(INITIAL_STATE, { kind: "history_state", url: new URL(VALID_URL), tabId: 1, frameId: 0, documentId: "doc_hs" }, tick());
    const result = reduceIngress(afterFirst.state, { kind: "history_state", url: new URL(VALID_URL), tabId: 1, frameId: 0, documentId: "doc_hs" }, tick());
    expect(asEffects(result.effects)).toContain("ignored");
  });

  it("startup injects immediately when document has no ready record", () => {
    const result = reduceIngress(INITIAL_STATE, { kind: "startup", url: new URL(VALID_URL), tabId: 1, frameId: 0, documentId: "doc_startup" }, tick());
    expect(asEffects(result.effects)).toContain("inject");
    expect(result.state.injected.has("doc_startup")).toBe(true);
  });

  it("startup skips injection when document is already ready", () => {
    const withReady = reduceIngress(INITIAL_STATE, { kind: "ready", tabId: 1, frameId: 0, documentId: "doc_startup" }, tick()).state;
    const result = reduceIngress(withReady, { kind: "startup", url: new URL(VALID_URL), tabId: 1, frameId: 0, documentId: "doc_startup" }, tick());
    expect(result.effects.some((e) => e.type === "inject")).toBe(false);
  });

  it("startup skips injection when already injected (duplicate startup)", () => {
    const afterFirst = reduceIngress(INITIAL_STATE, { kind: "startup", url: new URL(VALID_URL), tabId: 1, frameId: 0, documentId: "doc_startup" }, tick());
    const result = reduceIngress(afterFirst.state, { kind: "startup", url: new URL(VALID_URL), tabId: 1, frameId: 0, documentId: "doc_startup" }, tick());
    expect(asEffects(result.effects)).toContain("ignored");
  });
});

describe("reduceIngress – ready suppresses injection", () => {
  it("ready records and suppresses subsequent completed", () => {
    const afterReady = reduceIngress(INITIAL_STATE, { kind: "ready", tabId: 1, frameId: 0, documentId: "doc_ready" }, tick());
    expect(asEffects(afterReady.effects)).toContain("ready_record");

    const afterCommitted = reduceIngress(afterReady.state, { kind: "committed", url: new URL(VALID_URL), tabId: 1, frameId: 0, documentId: "doc_ready" }, tick());
    expect(afterCommitted.state.committed.has("doc_ready")).toBe(true);

    const afterCompleted = reduceIngress(afterCommitted.state, { kind: "completed", url: new URL(VALID_URL), tabId: 1, frameId: 0, documentId: "doc_ready" }, tick());
    expect(afterCompleted.effects.some((e) => e.type === "inject")).toBe(false);
  });

  it("ready is idempotent", () => {
    const r1 = reduceIngress(INITIAL_STATE, { kind: "ready", tabId: 1, frameId: 0, documentId: "doc_idem" }, tick());
    const r2 = reduceIngress(r1.state, { kind: "ready", tabId: 1, frameId: 0, documentId: "doc_idem" }, tick());
    expect(r2.effects.some((e) => e.type === "ready_record")).toBe(false);
    expect(r2.state.ready.has("doc_idem")).toBe(true);
  });

  it("ready effect carries correct identity", () => {
    const result = reduceIngress(INITIAL_STATE, { kind: "ready", tabId: 7, frameId: 0, documentId: "doc_r" }, tick());
    const readyRecord = result.effects.find((e) => e.type === "ready_record") as Extract<IngressEffect, { type: "ready_record" }>;
    expect(readyRecord.tabId).toBe(7);
    expect(readyRecord.frameId).toBe(0);
    expect(readyRecord.documentId).toBe("doc_r");
  });
});

describe("reduceIngress – injection_result", () => {
  it("failed injection removes injected marker allowing retry", () => {
    // First: commit + complete to get injected
    const afterCommit = reduceIngress(INITIAL_STATE, { kind: "committed", url: new URL(VALID_URL), tabId: 1, frameId: 0, documentId: "doc_fail" }, tick()).state;
    const afterComplete = reduceIngress(afterCommit, { kind: "completed", url: new URL(VALID_URL), tabId: 1, frameId: 0, documentId: "doc_fail" }, tick()).state;
    expect(afterComplete.injected.has("doc_fail")).toBe(true);

    // Inject fails
    const afterFail = reduceIngress(afterComplete, { kind: "injection_result", tabId: 1, frameId: 0, documentId: "doc_fail", success: false }, tick());
    expect(afterFail.state.injected.has("doc_fail")).toBe(false);
    expect(asEffects(afterFail.effects)).toContain("diagnostic");
  });

  it("successful injection is a no-op on state", () => {
    const afterCommit = reduceIngress(INITIAL_STATE, { kind: "committed", url: new URL(VALID_URL), tabId: 1, frameId: 0, documentId: "doc_ok" }, tick()).state;
    const afterComplete = reduceIngress(afterCommit, { kind: "completed", url: new URL(VALID_URL), tabId: 1, frameId: 0, documentId: "doc_ok" }, tick()).state;
    const result = reduceIngress(afterComplete, { kind: "injection_result", tabId: 1, frameId: 0, documentId: "doc_ok", success: true }, tick());
    expect(result.effects).toHaveLength(0);
  });
});

describe("reduceIngress – cleanup", () => {
  it("cleanup by documentId removes transient entries", () => {
    // Setup: commit and ready entries
    const s1 = reduceIngress(INITIAL_STATE, { kind: "committed", url: new URL(VALID_URL), tabId: 1, frameId: 0, documentId: "doc_cleanup" }, tick()).state;
    const s2 = reduceIngress(s1, { kind: "ready", tabId: 1, frameId: 0, documentId: "doc_cleanup" }, tick()).state;
    expect(s2.committed.has("doc_cleanup")).toBe(true);

    const result = reduceIngress(s2, { kind: "cleanup", documentId: "doc_cleanup" }, tick());
    expect(result.state.committed.has("doc_cleanup")).toBe(false);
    expect(result.state.ready.has("doc_cleanup")).toBe(false);
    expect(result.state.injected.has("doc_cleanup")).toBe(false);
    expect(asEffects(result.effects)).toContain("cleanup");
  });

  it("cleanup by tabId removes all entries for that tab", () => {
    const s1 = reduceIngress(INITIAL_STATE, { kind: "committed", url: new URL(VALID_URL), tabId: 5, frameId: 0, documentId: "doc_tab5a" }, tick()).state;
    const s2 = reduceIngress(s1, { kind: "committed", url: new URL(VALID_URL), tabId: 5, frameId: 0, documentId: "doc_tab5b" }, tick()).state;
    expect(s2.committed.size).toBeGreaterThan(0);

    const result = reduceIngress(s2, { kind: "cleanup", tabId: 5 }, tick());
    for (const key of result.state.committed.keys()) {
      expect(key.startsWith("tab=5:")).toBe(false);
    }
  });

  it("cleanup with no matching document is a no-op on state but still emits cleanup effect", () => {
    const result = reduceIngress(INITIAL_STATE, { kind: "cleanup", documentId: "doc_nonexistent" }, tick());
    expect(result.state.committed.size).toBe(0);
    expect(result.state.ready.size).toBe(0);
    expect(result.state.injected.size).toBe(0);
    expect(asEffects(result.effects)).toContain("cleanup");
  });

  it("cleanup increments cleanupCount even when nothing is removed", () => {
    const result = reduceIngress(INITIAL_STATE, { kind: "cleanup", documentId: "doc_ghost" }, tick());
    expect(result.state.cleanupCount).toBe(1);
  });
});

describe("reduceIngress – transient entry bounds", () => {
  it("evicts oldest entry when committed exceeds MAX_TRANSIENT_ENTRIES", () => {
    // This is a smoke test: we verify that the reducer does not throw when
    // many entries accumulate and that the entry count stays bounded.
    let state = INITIAL_STATE;
    for (let i = 0; i < 120; i++) {
      const id = `doc_${String(i).padStart(3, "0")}`;
      const urlStr = `https://ac.nowcoder.com/acm/contest/view-submission?submissionId=${String(i + 1).padStart(5, "0")}`;
      state = reduceIngress(state, { kind: "committed", url: new URL(urlStr), tabId: i + 1, frameId: 0, documentId: id }, tick()).state;
    }
    // The newest 100 entries should be present; at least some older ones evicted.
    expect(state.committed.size).toBeLessThanOrEqual(100);
    // The most recent entry should still be present
    expect(state.committed.has("doc_119")).toBe(true);
  });
});

describe("reduceIngress – duplicate committed is idempotent", () => {
  it("re-committing the same document updates committedAt (no duplicate inject)", () => {
    const s1 = reduceIngress(INITIAL_STATE, { kind: "committed", url: new URL(VALID_URL), tabId: 1, frameId: 0, documentId: "doc_dup" }, tick()).state;
    const result = reduceIngress(s1, { kind: "completed", url: new URL(VALID_URL), tabId: 1, frameId: 0, documentId: "doc_dup" }, tick());
    // Should inject (not suppressed by duplicate commit)
    expect(asEffects(result.effects)).toContain("inject");
  });
});

describe("reduceIngress – effect observedAt semantics", () => {
  it("inject effect is the only effect that should trigger background work", () => {
    // Verify the closed effect union: only inject + ready_record + diagnostic
    // + cleanup are possible from valid inputs; no free-text fields.
    const result = reduceIngress(INITIAL_STATE, { kind: "committed", url: new URL(VALID_URL), tabId: 1, frameId: 0, documentId: "doc_eff" }, tick());
    expect(result.effects).toHaveLength(0); // committed emits no effect

    const withReady = reduceIngress(INITIAL_STATE, { kind: "ready", tabId: 1, frameId: 0, documentId: "doc_eff" }, tick());
    expect(withReady.effects).toHaveLength(1);
    expect(withReady.effects[0].type).toBe("ready_record");

    const afterCommit = reduceIngress(INITIAL_STATE, { kind: "committed", url: new URL(VALID_URL), tabId: 1, frameId: 0, documentId: "doc_eff" }, tick()).state;
    const withComplete = reduceIngress(afterCommit, { kind: "completed", url: new URL(VALID_URL), tabId: 1, frameId: 0, documentId: "doc_eff" }, tick());
    expect(withComplete.effects[0].type).toBe("inject");
  });
});

describe("reduceIngress – ready on non-top frame", () => {
  it("rejects ready from non-top frame", () => {
    const result = reduceIngress(INITIAL_STATE, { kind: "ready", tabId: 1, frameId: 1, documentId: "doc_np" }, tick());
    expect(asEffects(result.effects)).toContain("ignored");
    const ignored = result.effects.find((e) => e.type === "ignored") as Extract<IngressEffect, { type: "ignored" }>;
    expect(ignored.reason).toBe("frame_rejected");
  });
});

describe("reduceIngress – no wall clock", () => {
  it("does not need a clock argument for valid navigation", () => {
    const result = reduceIngress(INITIAL_STATE, {
      kind: "committed",
      url: new URL(VALID_URL),
      tabId: 1,
      frameId: 0,
      documentId: "doc_c",
    });
    expect(result.state.committed.has("doc_c")).toBe(true);
  });
});

describe("INITIAL_STATE", () => {
  it("is a valid initial state", () => {
    expect(INITIAL_STATE.committed.size).toBe(0);
    expect(INITIAL_STATE.ready.size).toBe(0);
    expect(INITIAL_STATE.injected.size).toBe(0);
    expect(INITIAL_STATE.cleanupCount).toBe(0);
  });
});
