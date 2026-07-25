import { describe, expect, it } from "vitest";
import {
  parseSafeEvidence,
  SAFE_EVIDENCE_TIERS,
  type SafeEvidence,
} from "@/extension/src/evidence";

// ---------------------------------------------------------------------------
// Test fixtures – minimal clean objects per kind
// ---------------------------------------------------------------------------

const BASE = {
  schemaVersion: 1,
  evidenceId: "ev_test_abc123",
  platform: "leetcode" as const,
  receivedAt: "2026-07-24T12:00:00.000Z",
  tabId: 1,
  frameId: 0,
  documentId: "doc_test_001",
  adapterVersion: "v4-ev-core-0-1-0",
};

function e0(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return { ...BASE, tier: "E0", kind: "ui_hint", problemExternalId: "two-sum", ...overrides };
}

function e1(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    ...BASE,
    tier: "E1",
    kind: "request_observed",
    requestId: "req_test_001",
    method: "POST",
    endpointKey: "submit_solution",
    resourceType: "xmlhttprequest",
    lifecycle: "before_request",
    apiTimeStamp: 1753363200000,
    ...overrides,
  };
}

function e2(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    ...BASE,
    tier: "E2",
    kind: "submission_confirmed",
    requestEvidenceId: "ev_e1_ref",
    externalSubmissionId: "LC_sub_12345",
    problemExternalId: "two-sum",
    ...overrides,
  };
}

function e3(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    ...BASE,
    tier: "E3",
    kind: "final_verdict_confirmed",
    externalSubmissionId: "LC_sub_12345",
    problemExternalId: "two-sum",
    verdict: "Accepted",
    ...overrides,
  };
}

function ambiguity(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    ...BASE,
    tier: "E1",
    kind: "ambiguous_correlation",
    requestId: "req_amb",
    method: "POST",
    endpointKey: "submit_solution",
    resourceType: "xmlhttprequest",
    lifecycle: "before_request",
    apiTimeStamp: 1753363200000,
    candidateCount: 3,
    reason: "multiple_e1_candidates",
    ...overrides,
  };
}

function rejected(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    ...BASE,
    tier: "E1",
    kind: "request_rejected",
    requestId: "req_rej",
    method: "POST",
    endpointKey: "submit_solution",
    resourceType: "xmlhttprequest",
    lifecycle: "completed",
    apiTimeStamp: 1753363200000,
    rejectionReason: "csrf_invalid",
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Basic kind parsing
// ---------------------------------------------------------------------------

describe("Safe Evidence – valid kind parsing", () => {
  it("parses E0 ui_hint", () => { expect(parseSafeEvidence(e0()).ok).toBe(true); });
  it("parses E1 request_observed", () => { expect(parseSafeEvidence(e1()).ok).toBe(true); });
  it("parses E2 submission_confirmed", () => { expect(parseSafeEvidence(e2()).ok).toBe(true); });
  it("parses E3 final_verdict_confirmed", () => { expect(parseSafeEvidence(e3()).ok).toBe(true); });
  it("parses ambiguity evidence", () => { expect(parseSafeEvidence(ambiguity()).ok).toBe(true); });
  it("parses rejection evidence", () => { expect(parseSafeEvidence(rejected()).ok).toBe(true); });
});

// ---------------------------------------------------------------------------
// E3 verdict taxonomy values
// ---------------------------------------------------------------------------

describe("Safe Evidence – E3 accepts all final verdict taxonomy values", () => {
  const verdicts = [
    "Accepted", "Partially Accepted", "Time Limit Exceeded", "Memory Limit Exceeded",
    "Output Limit Exceeded", "Idleness Limit Exceeded", "Runtime Error",
    "Wrong Answer", "Presentation Error", "Compile Error", "Judge Error", "Other Failure",
  ] as const;
  for (const verdict of verdicts) {
    it(`verdict: ${verdict}`, () => {
      expect(parseSafeEvidence(e3({ verdict })).ok).toBe(true);
    });
  }
});

// ---------------------------------------------------------------------------
// Tier/kind mismatch
// ---------------------------------------------------------------------------

describe("Safe Evidence – tier/kind mismatch", () => {
  it("rejects E0 with wrong kind (request_observed)", () => {
    expect(parseSafeEvidence({ ...e0(), kind: "request_observed" }).ok).toBe(false);
  });
  it("rejects E1 with tier=E0 but request_observed kind", () => {
    expect(parseSafeEvidence(e1({ tier: "E0" })).ok).toBe(false);
  });
  it("rejects E2 missing requestEvidenceId", () => {
    const raw = e2();
    delete raw.requestEvidenceId;
    expect(parseSafeEvidence(raw).ok).toBe(false);
  });
  it("rejects E3 missing problemExternalId", () => {
    const raw = e3();
    delete raw.problemExternalId;
    expect(parseSafeEvidence(raw).ok).toBe(false);
  });
  it("rejects E3 missing externalSubmissionId", () => {
    const raw = e3();
    delete raw.externalSubmissionId;
    expect(parseSafeEvidence(raw).ok).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Missing required fields
// ---------------------------------------------------------------------------

describe("Safe Evidence – missing required fields", () => {
  it("rejects missing evidenceId", () => {
    const raw = e1(); delete raw.evidenceId;
    expect(parseSafeEvidence(raw).ok).toBe(false);
  });
  it("rejects missing receivedAt", () => {
    const raw = e1(); delete raw.receivedAt;
    expect(parseSafeEvidence(raw).ok).toBe(false);
  });
  it("rejects missing tabId", () => {
    const raw = e1(); delete raw.tabId;
    expect(parseSafeEvidence(raw).ok).toBe(false);
  });
  it("rejects missing documentId", () => {
    const raw = e1(); delete raw.documentId;
    expect(parseSafeEvidence(raw).ok).toBe(false);
  });
  it("rejects E0 missing problemExternalId", () => {
    const raw = e0(); delete raw.problemExternalId;
    expect(parseSafeEvidence(raw).ok).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Forbidden field rejection (top-level, nested, null, array)
// ---------------------------------------------------------------------------

describe("Safe Evidence – forbidden field rejection", () => {
  const forbiddenKeys = [
    "body", "rawBody", "responseBody", "code", "source",
    "requestHeaders", "responseHeaders", "cookie", "authorization",
    "csrf", "token", "username", "account",
  ] as const;

  for (const key of forbiddenKeys) {
    it(`top-level: ${key}`, () => {
      expect(parseSafeEvidence(e0({ [key]: "x" })).ok).toBe(false);
    });
    it(`nested: ${key}`, () => {
      expect(parseSafeEvidence(e0({ meta: { [key]: "x" } })).ok).toBe(false);
    });
    it(`null value: ${key}`, () => {
      expect(parseSafeEvidence(e0({ [key]: null })).ok).toBe(false);
    });
    it(`in array: ${key}`, () => {
      expect(parseSafeEvidence(e0({ items: [{ [key]: "x" }] })).ok).toBe(false);
    });
  }
});

// ---------------------------------------------------------------------------
// Cycle detection
// ---------------------------------------------------------------------------

describe("Safe Evidence – cycle detection", () => {
  it("self-reference", () => {
    const raw = e0(); raw.self = raw;
    expect(() => parseSafeEvidence(raw)).not.toThrow();
    expect(parseSafeEvidence(raw).ok).toBe(false);
  });
  it("mutual reference", () => {
    const a = e0(); const b = e0({ evidenceId: "ev_b" }); a.b = b; b.a = a;
    expect(() => parseSafeEvidence(a)).not.toThrow();
    expect(parseSafeEvidence(a).ok).toBe(false);
  });
  it("cycle through array", () => {
    const raw = e0();
    const arr: unknown[] = [raw];
    raw.arr = arr;
    expect(() => parseSafeEvidence(arr)).not.toThrow();
    expect(parseSafeEvidence(arr).ok).toBe(false);
  });
  it("fails closed when a property getter throws", () => {
    const raw = e1();
    Object.defineProperty(raw, "requestId", {
      enumerable: true,
      get: () => { throw new Error("getter must not escape"); },
    });
    expect(() => parseSafeEvidence(raw)).not.toThrow();
    expect(parseSafeEvidence(raw).ok).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Endpoint key normalized syntax
// ---------------------------------------------------------------------------

describe("Safe Evidence – endpoint key normalized syntax", () => {
  it("accepts alphanumeric with hyphen underscore and slash", () => {
    expect(parseSafeEvidence(e1({ endpointKey: "submit-solution_v2/beta" })).ok).toBe(true);
  });
  it("accepts key with slashes and hyphens", () => {
    expect(parseSafeEvidence(e1({ endpointKey: "problems/two-sum/submit" })).ok).toBe(true);
  });
  it("accepts http_ prefix (no scheme)", () => {
    expect(parseSafeEvidence(e1({ endpointKey: "http_leetcode_submit" })).ok).toBe(true);
  });
  it("rejects :// anywhere (URL scheme)", () => {
    expect(parseSafeEvidence(e1({ endpointKey: "https://leetcode.com/api" })).ok).toBe(false);
  });
  it("rejects URL schemes without ://", () => {
    expect(parseSafeEvidence(e1({ endpointKey: "javascript:submit" })).ok).toBe(false);
    expect(parseSafeEvidence(e1({ endpointKey: "data:text" })).ok).toBe(false);
  });
  it("rejects query ?", () => {
    expect(parseSafeEvidence(e1({ endpointKey: "submit?problem=two-sum" })).ok).toBe(false);
  });
  it("rejects fragment #", () => {
    expect(parseSafeEvidence(e1({ endpointKey: "submit#frag" })).ok).toBe(false);
  });
  it("rejects ampersand &", () => {
    expect(parseSafeEvidence(e1({ endpointKey: "submit&other=val" })).ok).toBe(false);
  });
  it("rejects redirectEndpointKey as raw URL", () => {
    expect(parseSafeEvidence(e1({ redirectEndpointKey: "https://example.com/redir" })).ok).toBe(false);
  });
  it("accepts redirectEndpointKey as normalized key", () => {
    expect(parseSafeEvidence(e1({ redirectEndpointKey: "problems/two-sum/result" })).ok).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Timestamps and length bounds
// ---------------------------------------------------------------------------

describe("Safe Evidence – timestamps and length bounds", () => {
  it("rejects receivedAt without time portion", () => {
    expect(parseSafeEvidence(e1({ receivedAt: "2026-07-24" })).ok).toBe(false);
  });
  it("rejects receivedAt with invalid month 13", () => {
    expect(parseSafeEvidence(e1({ receivedAt: "2026-13-24T12:00:00.000Z" })).ok).toBe(false);
  });
  it("rejects receivedAt with invalid month 00", () => {
    expect(parseSafeEvidence(e1({ receivedAt: "2026-00-24T12:00:00.000Z" })).ok).toBe(false);
  });
  it("rejects receivedAt with an impossible calendar date", () => {
    expect(parseSafeEvidence(e1({ receivedAt: "2026-02-31T12:00:00.000Z" })).ok).toBe(false);
    expect(parseSafeEvidence(e1({ receivedAt: "2025-02-29T12:00:00.000Z" })).ok).toBe(false);
  });
  it("accepts receivedAt on a leap day", () => {
    expect(parseSafeEvidence(e1({ receivedAt: "2024-02-29T12:00:00.000Z" })).ok).toBe(true);
  });
  it("accepts receivedAt with milliseconds", () => {
    expect(parseSafeEvidence(e1({ receivedAt: "2026-07-24T12:00:00.123Z" })).ok).toBe(true);
  });
  it("accepts receivedAt without milliseconds", () => {
    expect(parseSafeEvidence(e1({ receivedAt: "2026-07-24T12:00:00Z" })).ok).toBe(true);
  });
  it("rejects evidenceId > 128 chars", () => {
    expect(parseSafeEvidence(e1({ evidenceId: "a".repeat(129) })).ok).toBe(false);
  });
  it("accepts evidenceId = 128 chars", () => {
    expect(parseSafeEvidence(e1({ evidenceId: "a".repeat(128) })).ok).toBe(true);
  });
  it("rejects adapterVersion > 256 chars", () => {
    expect(parseSafeEvidence(e1({ adapterVersion: "v".repeat(257) })).ok).toBe(false);
  });
  it("accepts adapterVersion = 256 chars", () => {
    expect(parseSafeEvidence(e1({ adapterVersion: "v".repeat(256) })).ok).toBe(true);
  });
  it("rejects whitespace-only evidenceId", () => {
    expect(parseSafeEvidence(e1({ evidenceId: "   " })).ok).toBe(false);
  });
  it("rejects empty evidenceId", () => {
    expect(parseSafeEvidence(e1({ evidenceId: "" })).ok).toBe(false);
  });
  it("accepts apiTimeStamp as 0", () => {
    expect(parseSafeEvidence(e1({ apiTimeStamp: 0 })).ok).toBe(true);
  });
  it("rejects apiTimeStamp as negative", () => {
    expect(parseSafeEvidence(e1({ apiTimeStamp: -1 })).ok).toBe(false);
  });
  it("rejects apiTimeStamp as Infinity", () => {
    expect(parseSafeEvidence(e1({ apiTimeStamp: Infinity })).ok).toBe(false);
  });
  it("rejects apiTimeStamp as NaN", () => {
    expect(parseSafeEvidence(e1({ apiTimeStamp: NaN })).ok).toBe(false);
  });
  it("rejects E1 without apiTimeStamp", () => {
    const raw = e1();
    delete raw.apiTimeStamp;
    expect(parseSafeEvidence(raw).ok).toBe(false);
  });
  it("rejects apiTimeStamp on non-webRequest evidence", () => {
    expect(parseSafeEvidence(e0({ apiTimeStamp: 1 })).ok).toBe(false);
    expect(parseSafeEvidence(e2({ apiTimeStamp: 1 })).ok).toBe(false);
    expect(parseSafeEvidence(e3({ apiTimeStamp: 1 })).ok).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Status code range
// ---------------------------------------------------------------------------

describe("Safe Evidence – statusCode range", () => {
  it("accepts 200", () => { expect(parseSafeEvidence(e1({ statusCode: 200 })).ok).toBe(true); });
  it("accepts 100", () => { expect(parseSafeEvidence(e1({ statusCode: 100 })).ok).toBe(true); });
  it("accepts 599", () => { expect(parseSafeEvidence(e1({ statusCode: 599 })).ok).toBe(true); });
  it("rejects 99", () => { expect(parseSafeEvidence(e1({ statusCode: 99 })).ok).toBe(false); });
  it("rejects 600", () => { expect(parseSafeEvidence(e1({ statusCode: 600 })).ok).toBe(false); });
  it("rejects float 200.5", () => { expect(parseSafeEvidence(e1({ statusCode: 200.5 })).ok).toBe(false); });
  it("rejects string value", () => { expect(parseSafeEvidence(e1({ statusCode: "200" })).ok).toBe(false); });
});

// ---------------------------------------------------------------------------
// Ambiguity candidateCount
// ---------------------------------------------------------------------------

describe("Safe Evidence – ambiguity candidateCount", () => {
  it("accepts 2", () => { expect(parseSafeEvidence(ambiguity({ candidateCount: 2 })).ok).toBe(true); });
  it("rejects 0", () => { expect(parseSafeEvidence(ambiguity({ candidateCount: 0 })).ok).toBe(false); });
  it("rejects -1", () => { expect(parseSafeEvidence(ambiguity({ candidateCount: -1 })).ok).toBe(false); });
  it("rejects float 2.5", () => { expect(parseSafeEvidence(ambiguity({ candidateCount: 2.5 })).ok).toBe(false); });
  it("rejects unknown reason", () => {
    expect(parseSafeEvidence(ambiguity({ reason: "unknown_reason" })).ok).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Rejection reason enum
// ---------------------------------------------------------------------------

describe("Safe Evidence – rejection reason enum", () => {
  const reasons = [
    "csrf_invalid", "csrf_expired", "auth_required", "auth_expired",
    "rate_limited", "business_rejection", "network_error", "timeout",
    "server_error", "malformed_response",
  ] as const;
  for (const reason of reasons) {
    it(`accepts: ${reason}`, () => {
      expect(parseSafeEvidence(rejected({ rejectionReason: reason })).ok).toBe(true);
    });
  }
  it("rejects unknown reason", () => {
    expect(parseSafeEvidence(rejected({ rejectionReason: "unknown" })).ok).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Ambiguity reason enum
// ---------------------------------------------------------------------------

describe("Safe Evidence – ambiguity reason enum", () => {
  const reasons = ["multiple_e1_candidates", "e1_window_expired", "bridge_message_unmatched"] as const;
  for (const reason of reasons) {
    it(`accepts: ${reason}`, () => {
      expect(parseSafeEvidence(ambiguity({ reason })).ok).toBe(true);
    });
  }
});

// ---------------------------------------------------------------------------
// E1 lifecycle phases
// ---------------------------------------------------------------------------

describe("Safe Evidence – E1 lifecycle phases", () => {
  const phases = ["before_request", "before_redirect", "response_started", "completed", "error_occurred"] as const;
  for (const phase of phases) {
    it(`accepts: ${phase}`, () => {
      expect(parseSafeEvidence(e1({ lifecycle: phase })).ok).toBe(true);
    });
  }
  it("rejects unknown lifecycle", () => {
    expect(parseSafeEvidence(e1({ lifecycle: "unknown_phase" })).ok).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// E1 resource types
// ---------------------------------------------------------------------------

describe("Safe Evidence – E1 resource types", () => {
  const types = [
    "main_frame", "sub_frame", "xmlhttprequest", "other",
  ] as const;
  for (const rt of types) {
    it(`accepts: ${rt}`, () => {
      expect(parseSafeEvidence(e1({ resourceType: rt })).ok).toBe(true);
    });
  }
  it("rejects unknown resourceType", () => {
    expect(parseSafeEvidence(e1({ resourceType: "unknown_resource" })).ok).toBe(false);
  });
  it("rejects fetch because Chrome webRequest reports fetch as xmlhttprequest", () => {
    expect(parseSafeEvidence(e1({ resourceType: "fetch" })).ok).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Strict mode rejects unknown fields
// ---------------------------------------------------------------------------

describe("Safe Evidence – strict mode rejects unknown fields", () => {
  it("rejects extra string field", () => {
    expect(parseSafeEvidence(e0({ extraField: "x" })).ok).toBe(false);
  });
  it("rejects extra numeric field", () => {
    expect(parseSafeEvidence(e0({ extraNumber: 42 })).ok).toBe(false);
  });
  it("rejects extra boolean field", () => {
    expect(parseSafeEvidence(e0({ extraBool: true })).ok).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Serialization roundtrip
// ---------------------------------------------------------------------------

describe("Safe Evidence – serialization roundtrip", () => {
  it("serializes no forbidden key names", () => {
    const result = parseSafeEvidence(e1({ statusCode: 200, apiTimeStamp: 1753363200000 }));
    expect(result.ok).toBe(true);
    if (result.ok) {
      const serialized = JSON.stringify(result.value);
      for (const key of [
        "body", "rawBody", "responseBody", "code", "source",
        "requestHeaders", "responseHeaders", "cookie", "authorization",
        "csrf", "token", "username", "account",
      ]) {
        expect(serialized).not.toContain(`"${key}"`);
      }
    }
  });

  it("returns a plain safe object when the input inherits an unsafe toJSON", () => {
    const raw = e1();
    const prototype = {};
    Object.defineProperty(prototype, "toJSON", {
      enumerable: false,
      value: () => ({ body: "secret" }),
    });
    Object.setPrototypeOf(raw, prototype);
    expect(JSON.stringify(raw)).toContain('"body"');

    const result = parseSafeEvidence(raw);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(Object.getPrototypeOf(result.value)).toBe(Object.prototype);
      expect(JSON.stringify(result.value)).not.toContain('"body"');
    }
  });

  it("E0 roundtrip", () => {
    const result = parseSafeEvidence(e0({ sourceDocumentId: "doc_src", observedAt: "2026-07-24T11:59:00.000Z" }));
    expect(result.ok).toBe(true);
    if (result.ok) {
      const re = parseSafeEvidence(JSON.parse(JSON.stringify(result.value)));
      expect(re.ok).toBe(true);
    }
  });

  it("E1 roundtrip", () => {
    const result = parseSafeEvidence(e1({ statusCode: 200, redirectEndpointKey: "result_page", apiTimeStamp: 1753363200000 }));
    expect(result.ok).toBe(true);
    if (result.ok) {
      const re = parseSafeEvidence(JSON.parse(JSON.stringify(result.value)));
      expect(re.ok).toBe(true);
    }
  });

  it("E2 roundtrip", () => {
    const result = parseSafeEvidence(e2({ phase: "judging" }));
    expect(result.ok).toBe(true);
    if (result.ok) {
      const re = parseSafeEvidence(JSON.parse(JSON.stringify(result.value)));
      expect(re.ok).toBe(true);
    }
  });

  it("E3 roundtrip", () => {
    const result = parseSafeEvidence(e3({ verdict: "Wrong Answer" }));
    expect(result.ok).toBe(true);
    if (result.ok) {
      const re = parseSafeEvidence(JSON.parse(JSON.stringify(result.value)));
      expect(re.ok).toBe(true);
    }
  });

  it("ambiguity roundtrip", () => {
    const result = parseSafeEvidence(ambiguity({ candidateCount: 4 }));
    expect(result.ok).toBe(true);
    if (result.ok) {
      const re = parseSafeEvidence(JSON.parse(JSON.stringify(result.value)));
      expect(re.ok).toBe(true);
    }
  });

  it("rejection roundtrip", () => {
    const result = parseSafeEvidence(rejected({ statusCode: 403 }));
    expect(result.ok).toBe(true);
    if (result.ok) {
      const re = parseSafeEvidence(JSON.parse(JSON.stringify(result.value)));
      expect(re.ok).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// Post-parse forbidden-field mutation rejection
// ---------------------------------------------------------------------------

describe("Safe Evidence – post-parse mutation rejection", () => {
  it("adding forbidden key after parse makes it invalid", () => {
    const result = parseSafeEvidence(e1());
    expect(result.ok).toBe(true);
    if (result.ok) {
      const ev = { ...result.value, body: "secret" };
      expect(parseSafeEvidence(ev).ok).toBe(false);
    }
  });

  it("nested forbidden key makes it invalid", () => {
    const result = parseSafeEvidence(e1());
    expect(result.ok).toBe(true);
    if (result.ok) {
      const ev = { ...result.value, nested: { authorization: "Bearer x" } };
      expect(parseSafeEvidence(ev).ok).toBe(false);
    }
  });

  it("adding forbidden key in array makes it invalid", () => {
    const result = parseSafeEvidence(e1());
    expect(result.ok).toBe(true);
    if (result.ok) {
      const ev = { ...result.value, items: [{ token: "secret" }] };
      expect(parseSafeEvidence(ev).ok).toBe(false);
    }
  });
});

// ---------------------------------------------------------------------------
// E0 observedAt
// ---------------------------------------------------------------------------

describe("Safe Evidence – E0 observedAt", () => {
  it("accepts valid ISO datetime", () => {
    expect(parseSafeEvidence(e0({ observedAt: "2026-07-24T11:59:00.000Z" })).ok).toBe(true);
  });
  it("accepts without milliseconds", () => {
    expect(parseSafeEvidence(e0({ observedAt: "2026-07-24T11:59:00Z" })).ok).toBe(true);
  });
  it("rejects invalid format", () => {
    expect(parseSafeEvidence(e0({ observedAt: "2026-07-24" })).ok).toBe(false);
  });
  it("rejects invalid month 13", () => {
    expect(parseSafeEvidence(e0({ observedAt: "2026-13-24T11:59:00.000Z" })).ok).toBe(false);
  });
  it("rejects an impossible calendar date", () => {
    expect(parseSafeEvidence(e0({ observedAt: "2026-02-31T11:59:00.000Z" })).ok).toBe(false);
    expect(parseSafeEvidence(e0({ observedAt: "2025-02-29T11:59:00.000Z" })).ok).toBe(false);
  });
  it("accepts a leap-day calendar date", () => {
    expect(parseSafeEvidence(e0({ observedAt: "2024-02-29T11:59:00.000Z" })).ok).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// E2 phase enum
// ---------------------------------------------------------------------------

describe("Safe Evidence – E2 phase enum", () => {
  const phases = ["queued", "judging", "running"] as const;
  for (const phase of phases) {
    it(`accepts: ${phase}`, () => {
      expect(parseSafeEvidence(e2({ phase })).ok).toBe(true);
    });
  }
  it("rejects unknown phase", () => {
    expect(parseSafeEvidence(e2({ phase: "unknown_phase" })).ok).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Exported constants
// ---------------------------------------------------------------------------

describe("Safe Evidence – exported constants", () => {
  it("SAFE_EVIDENCE_TIERS has all four tiers", () => {
    expect(SAFE_EVIDENCE_TIERS).toEqual(["E0", "E1", "E2", "E3"]);
  });
});

// ---------------------------------------------------------------------------
// Discriminated union exhaustiveness
// ---------------------------------------------------------------------------

describe("Safe Evidence – discriminated union exhaustiveness", () => {
  it("switch covers all six kinds", () => {
    function kindOf(ev: SafeEvidence): string {
      switch (ev.kind) {
        case "ui_hint": return "E0";
        case "request_observed": return "E1_req";
        case "submission_confirmed": return "E2";
        case "final_verdict_confirmed": return "E3";
        case "ambiguous_correlation": return "E1_amb";
        case "request_rejected": return "E1_rej";
      }
    }
    const vals = [
      parseSafeEvidence(e0()),
      parseSafeEvidence(e1()),
      parseSafeEvidence(e2()),
      parseSafeEvidence(e3()),
      parseSafeEvidence(ambiguity()),
      parseSafeEvidence(rejected()),
    ];
    expect(vals.map((v) => v.ok && kindOf(v.value))).toEqual([
      "E0", "E1_req", "E2", "E3", "E1_amb", "E1_rej",
    ]);
  });
});
