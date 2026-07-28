/**
 * Extension Characterization Tests (Phase B Task B2).
 *
 * Tests the characterization-only diagnostic mode for NowCoder network
 * observation. Verifies:
 * - Disabled by default and after reload.
 * - NowCoder-only start (rejects other platforms).
 * - Hard short expiry.
 * - Forbidden/unsafe input rejected without retaining raw content.
 * - Bounded record retention.
 * - Export safe transcripts only.
 * - Stop clears all state.
 * - No E2 effects (diagnostic events don't affect production state).
 */

import { describe, expect, it, beforeEach } from "vitest";
import {
  applyCharacterizationAction,
  characterizeSessionStatus,
  canAcceptMoreRecords,
  remainingRecordCapacity,
  isCharacterizationSafeEvidence,
  validateCharacterizationEvidence,
  createCharacterizationController,
  createBrowseOnlyNavigationExportDocument,
  selectCharacterizationExportMode,
} from "@/extension/src/characterization";
import type { NavigationWitness } from "@/extension/src/characterizationNavigationWitness";
import {
  DEFAULT_CHARACTERIZATION_SESSION,
  MAX_CHARACTERIZATION_RECORDS,
  CHARACTERIZATION_TTL_MS,
  readCharacterizationSession,
  isSessionExpired,
  startCharacterizationSession,
  buildCharacterizationRecord,
  pruneExpiredRecords,
  planCharacterizationSessionWrite,
} from "@/extension/src/characterizationStorage";
import type { E1RequestObserved } from "@/extension/src/evidence";
import {
  parseNetworkTranscriptEvidence,
  parseNetworkTranscriptMeta,
} from "@/tests/helpers/networkTranscriptContract";

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

const NOW = "2026-07-26T12:00:00.000Z";

function makeE1(overrides: Partial<E1RequestObserved> = {}): E1RequestObserved {
  return {
    schemaVersion: 1,
    evidenceId: "e1_nowcoder_test-1",
    platform: "nowcoder",
    tier: "E1",
    kind: "request_observed",
    receivedAt: NOW,
    tabId: 1,
    frameId: 0,
    documentId: "doc-test-1",
    adapterVersion: "v4-contract-1",
    requestId: "req-test-1",
    method: "POST",
    endpointKey: "submit",
    resourceType: "xmlhttprequest",
    lifecycle: "before_request",
    apiTimeStamp: 1000,
    ...overrides,
  };
}

function witness(pageClass: "contest_list" | "contest_problem", documentId: string, order: number, tabId = 1): NavigationWitness {
  return {
    schemaVersion: 1, evidenceId: `e0_nowcoder_${documentId}_${pageClass}`, platform: "nowcoder", tier: "E0",
    kind: "navigation_witness", receivedAt: NOW, tabId, frameId: 0, documentId, pageClass,
    relativeTimingOrder: order,
  };
}


// ---------------------------------------------------------------------------
// Disabled by default / after reload
// ---------------------------------------------------------------------------

describe("characterization default state", () => {
  it("is disabled by default", () => {
    const session = DEFAULT_CHARACTERIZATION_SESSION;
    expect(session.active).toBe(false);
    expect(session.startedAt).toBe("");
    expect(session.expiresAt).toBe("");
    expect(session.records).toHaveLength(0);
  });

  it("stopping a disabled session returns the default state", () => {
    const effects = applyCharacterizationAction({ type: "characterization_stop" }, DEFAULT_CHARACTERIZATION_SESSION, NOW);
    expect(effects.session).toEqual(DEFAULT_CHARACTERIZATION_SESSION);
  });

  it("collecting on a disabled session returns the same session", () => {
    const session = DEFAULT_CHARACTERIZATION_SESSION;
    const evidence = makeE1();
    const effects = applyCharacterizationAction({ type: "characterization_collect", hostname: "www.nowcoder.com", evidence }, session, NOW);
    expect(effects.session).toBe(session);
  });
});

// ---------------------------------------------------------------------------
// Start action - NowCoder-only
// ---------------------------------------------------------------------------

describe("characterization start", () => {
  it("starts an active unauthenticated www session", () => {
    const session = DEFAULT_CHARACTERIZATION_SESSION;
    const effects = applyCharacterizationAction({ type: "characterization_start", hostname: "www.nowcoder.com", authenticated: false }, session, NOW);
    expect(effects.session).toMatchObject({ active: true, hostname: "www.nowcoder.com", authenticated: false });
    expect(effects.session.startedAt).toBe(NOW);
    expect(effects.session.records).toHaveLength(0);
    // expiresAt should be approximately 5 minutes from now
    const expiresMs = Date.parse(effects.session.expiresAt);
    const nowMs = Date.parse(NOW);
    expect(expiresMs - nowMs).toBe(CHARACTERIZATION_TTL_MS);
  });

  it("starting an already active session is idempotent", () => {
    const activeSession = startCharacterizationSession(NOW, "www.nowcoder.com", false);
    const effects = applyCharacterizationAction({ type: "characterization_start", hostname: "www.nowcoder.com", authenticated: false }, activeSession, NOW);
    expect(effects.session).toBe(activeSession);
  });

  it("rejects a non-NowCoder hostname", () => {
    const effects = applyCharacterizationAction({
      type: "characterization_start", hostname: "example.com", authenticated: false,
    }, DEFAULT_CHARACTERIZATION_SESSION, NOW);
    expect(effects.session).toEqual(DEFAULT_CHARACTERIZATION_SESSION);
  });
});

// ---------------------------------------------------------------------------
// Collect action - platform validation
// ---------------------------------------------------------------------------

describe("characterization collect", () => {
  it("collects NowCoder evidence when session is active", () => {
    const session = startCharacterizationSession(NOW, "www.nowcoder.com", false);
    const evidence = makeE1();
    const effects = applyCharacterizationAction({ type: "characterization_collect", hostname: "www.nowcoder.com", evidence }, session, NOW);
    expect(effects.session.records).toHaveLength(1);
    expect(effects.session.records[0].platform).toBe("nowcoder");
    expect(effects.session.records[0].requestId).toBe("req-test-1");
    expect(effects.session.records[0].method).toBe("POST");
    expect(effects.session.records[0].endpointKey).toBe("submit");
  });

  it("rejects evidence from other platforms", () => {
    const session = startCharacterizationSession(NOW, "www.nowcoder.com", false);
    const leetcodeEvidence = makeE1({ platform: "leetcode" });
    const effects = applyCharacterizationAction({ type: "characterization_collect", hostname: "www.nowcoder.com", evidence: leetcodeEvidence }, session, NOW);
    expect(effects.session.records).toHaveLength(0);
  });

  it("rejects evidence when session is inactive", () => {
    const session = DEFAULT_CHARACTERIZATION_SESSION;
    const evidence = makeE1();
    const effects = applyCharacterizationAction({ type: "characterization_collect", hostname: "www.nowcoder.com", evidence }, session, NOW);
    expect(effects.session).toBe(session);
    expect(effects.session.records).toHaveLength(0);
  });

  it("records all lifecycle phases (newest first)", () => {
    const session = startCharacterizationSession(NOW, "www.nowcoder.com", false);
    const phases = ["before_request", "before_redirect", "response_started", "completed", "error_occurred"] as const;
    let currentSession = session;
    for (const phase of phases) {
      const evidence = makeE1({ lifecycle: phase, requestId: `req-${phase}` });
      const effects = applyCharacterizationAction({ type: "characterization_collect", hostname: "www.nowcoder.com", evidence }, currentSession, NOW);
      currentSession = effects.session;
    }
    expect(currentSession.records).toHaveLength(5);
    // Records are added newest-first
    expect(currentSession.records.map((r) => r.lifecycle)).toEqual([...phases].reverse());
  });

  it("records statusCode when present", () => {
    const session = startCharacterizationSession(NOW, "www.nowcoder.com", false);
    const evidence = makeE1({ statusCode: 200 });
    const effects = applyCharacterizationAction({ type: "characterization_collect", hostname: "www.nowcoder.com", evidence }, session, NOW);
    expect(effects.session.records[0].statusCode).toBe(200);
  });

  it("records normalizedRedirectPath when redirected", () => {
    const session = startCharacterizationSession(NOW, "www.nowcoder.com", false);
    const evidence = makeE1({ redirectEndpointKey: "status" });
    const effects = applyCharacterizationAction({ type: "characterization_collect", hostname: "www.nowcoder.com", evidence }, session, NOW);
    expect(effects.session.records[0].normalizedRedirectPath).toBe("status");
  });
});

// ---------------------------------------------------------------------------
// Expiry
// ---------------------------------------------------------------------------

describe("characterization expiry", () => {
  it("session expires after TTL", () => {
    const session = startCharacterizationSession(NOW, "www.nowcoder.com", false);
    const expiredNow = new Date(Date.parse(NOW) + CHARACTERIZATION_TTL_MS + 1).toISOString();
    expect(isSessionExpired(session, expiredNow)).toBe(true);
  });

  it("session does not expire before TTL", () => {
    const session = startCharacterizationSession(NOW, "www.nowcoder.com", false);
    const beforeExpiry = new Date(Date.parse(NOW) + CHARACTERIZATION_TTL_MS - 1).toISOString();
    expect(isSessionExpired(session, beforeExpiry)).toBe(false);
  });

  it("collecting after expiry returns same session without records", () => {
    const session = startCharacterizationSession(NOW, "www.nowcoder.com", false);
    const expiredNow = new Date(Date.parse(NOW) + CHARACTERIZATION_TTL_MS + 1).toISOString();
    const evidence = makeE1();
    const effects = applyCharacterizationAction({ type: "characterization_collect", hostname: "www.nowcoder.com", evidence }, session, expiredNow);
    expect(effects.session.active).toBe(false);
    expect(effects.session.records).toHaveLength(0);
  });

  it("pruneExpiredRecords returns default session when expired", () => {
    const session = startCharacterizationSession(NOW, "www.nowcoder.com", false);
    const expiredNow = new Date(Date.parse(NOW) + CHARACTERIZATION_TTL_MS + 1).toISOString();
    const pruned = pruneExpiredRecords(session, expiredNow);
    expect(pruned).toEqual(DEFAULT_CHARACTERIZATION_SESSION);
  });

  it("pruneExpiredRecords returns same session when not expired", () => {
    const session = startCharacterizationSession(NOW, "www.nowcoder.com", false);
    const beforeExpiry = new Date(Date.parse(NOW) + CHARACTERIZATION_TTL_MS - 1).toISOString();
    const pruned = pruneExpiredRecords(session, beforeExpiry);
    expect(pruned).toBe(session);
  });
});

// ---------------------------------------------------------------------------
// Bounded retention
// ---------------------------------------------------------------------------

describe("characterization bounded records", () => {
  it("caps records at MAX_CHARACTERIZATION_RECORDS", () => {
    const session = startCharacterizationSession(NOW, "www.nowcoder.com", false);
    let currentSession = session;
    for (let i = 0; i < MAX_CHARACTERIZATION_RECORDS + 10; i++) {
      const evidence = makeE1({ requestId: `req-${i}` });
      const effects = applyCharacterizationAction({ type: "characterization_collect", hostname: "www.nowcoder.com", evidence }, currentSession, NOW);
      currentSession = effects.session;
    }
    expect(currentSession.records).toHaveLength(MAX_CHARACTERIZATION_RECORDS);
    // Newest records come first (highest requestId at index 0)
    expect(currentSession.records[0].requestId).toBe(`req-${MAX_CHARACTERIZATION_RECORDS + 9}`);
    expect(currentSession.records[MAX_CHARACTERIZATION_RECORDS - 1].requestId).toBe(`req-10`);
  });

  it("canAcceptMoreRecords returns false when at capacity", () => {
    const session = startCharacterizationSession(NOW, "www.nowcoder.com", false);
    let currentSession = session;
    for (let i = 0; i < MAX_CHARACTERIZATION_RECORDS; i++) {
      const evidence = makeE1({ requestId: `req-${i}` });
      const effects = applyCharacterizationAction({ type: "characterization_collect", hostname: "www.nowcoder.com", evidence }, currentSession, NOW);
      currentSession = effects.session;
    }
    expect(canAcceptMoreRecords(currentSession)).toBe(false);
  });

  it("remainingRecordCapacity returns zero when at capacity", () => {
    const session = startCharacterizationSession(NOW, "www.nowcoder.com", false);
    let currentSession = session;
    for (let i = 0; i < MAX_CHARACTERIZATION_RECORDS; i++) {
      const evidence = makeE1({ requestId: `req-${i}` });
      const effects = applyCharacterizationAction({ type: "characterization_collect", hostname: "www.nowcoder.com", evidence }, currentSession, NOW);
      currentSession = effects.session;
    }
    expect(remainingRecordCapacity(currentSession)).toBe(0);
  });

  it("remainingRecordCapacity returns correct count", () => {
    const session = startCharacterizationSession(NOW, "www.nowcoder.com", false);
    expect(remainingRecordCapacity(session)).toBe(MAX_CHARACTERIZATION_RECORDS);
    const evidence = makeE1();
    const effects = applyCharacterizationAction({ type: "characterization_collect", hostname: "www.nowcoder.com", evidence }, session, NOW);
    expect(remainingRecordCapacity(effects.session)).toBe(MAX_CHARACTERIZATION_RECORDS - 1);
  });
});

// ---------------------------------------------------------------------------
// Stop clears state
// ---------------------------------------------------------------------------

describe("characterization stop", () => {
  it("stop returns default session", () => {
    const session = startCharacterizationSession(NOW, "www.nowcoder.com", false);
    const evidence = makeE1();
    const withRecords = applyCharacterizationAction({ type: "characterization_collect", hostname: "www.nowcoder.com", evidence }, session, NOW);
    const effects = applyCharacterizationAction({ type: "characterization_stop" }, withRecords.session, NOW);
    expect(effects.session).toEqual(DEFAULT_CHARACTERIZATION_SESSION);
    expect(effects.session.active).toBe(false);
    expect(effects.session.records).toHaveLength(0);
  });

  it("stop on inactive session returns default", () => {
    const effects = applyCharacterizationAction({ type: "characterization_stop" }, DEFAULT_CHARACTERIZATION_SESSION, NOW);
    expect(effects.session).toEqual(DEFAULT_CHARACTERIZATION_SESSION);
  });
});

// ---------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------

describe("characterization export", () => {
  it.each([
    [true, 0, "b3_browse_only"],
    [true, 1, "b1_network"],
    [true, 25, "b1_network"],
    [false, 0, "b1_network"],
  ] as const)(
    "selects %s/%i as %s without allowing B3 to shadow network evidence",
    (b3CanExport, networkRecordCount, expected) => {
      expect(selectCharacterizationExportMode(
        b3CanExport,
        networkRecordCount,
      )).toBe(expected);
    },
  );

  it("does not export an incomplete B1 document when no records exist", () => {
    const session = DEFAULT_CHARACTERIZATION_SESSION;
    const effects = applyCharacterizationAction({ type: "characterization_export" }, session, NOW);
    expect(effects.exportResult).toEqual({ ok: false, reason: "no records to export" });
  });

  it("export returns all collected records in B1 network_request_observed format", () => {
    const session = startCharacterizationSession(NOW, "www.nowcoder.com", false);
    const evidence1 = makeE1({ requestId: "req-1", endpointKey: "submit" });
    const evidence2 = makeE1({ requestId: "req-2", endpointKey: "status" });
    let currentSession = session;
    currentSession = applyCharacterizationAction({ type: "characterization_collect", hostname: "www.nowcoder.com", evidence: evidence1 }, currentSession, NOW).session;
    currentSession = applyCharacterizationAction({ type: "characterization_collect", hostname: "www.nowcoder.com", evidence: evidence2 }, currentSession, NOW).session;
    const effects = applyCharacterizationAction({ type: "characterization_export" }, currentSession, NOW);
    // Export produces B1 network_request_observed format (not characterization_diagnostic)
    expect(effects.exportResult).toMatchObject({
      ok: true,
      records: [
        {
          schemaVersion: 1,
          tier: "E1",
          kind: "network_request_observed",
          platform: "nowcoder",
          evidenceId: "e1_nowcoder_req-2",
          receivedAt: NOW,
          tabId: 1,
          frameId: 0,
          documentId: "doc-test-1",
          requestId: "req-2",
          method: "POST",
          normalizedPath: "/status",
          resourceType: "xmlhttprequest",
        },
        {
          schemaVersion: 1,
          tier: "E1",
          kind: "network_request_observed",
          platform: "nowcoder",
          evidenceId: "e1_nowcoder_req-1",
          receivedAt: NOW,
          tabId: 1,
          frameId: 0,
          documentId: "doc-test-1",
          requestId: "req-1",
          method: "POST",
          normalizedPath: "/submit",
          resourceType: "xmlhttprequest",
        },
      ],
    });
  });

  it("exports only an ordered same-tab browse-only navigation pair when E1 is absent", () => {
    const document = createBrowseOnlyNavigationExportDocument([
      witness("contest_list", "list-document", 0),
      witness("contest_problem", "problem-document", 1),
    ], NOW, "ac.nowcoder.com", true);
    expect(document).toMatchObject({
      meta: { signals: [{ kind: "navigation_witness", tier: "E0" }], productionEligible: false },
      evidence: [{ pageClass: "contest_list" }, { pageClass: "contest_problem" }],
    });
  });

  it.each([
    ["missing list", [witness("contest_problem", "problem-document", 1)]],
    ["reverse order", [witness("contest_list", "list-document", 2), witness("contest_problem", "problem-document", 1)]],
    ["cross tab", [witness("contest_list", "list-document", 0), witness("contest_problem", "problem-document", 1, 2)]],
    ["same document", [witness("contest_list", "document", 0), witness("contest_problem", "document", 1)]],
    ["reloaded problem", [witness("contest_list", "list-document", 0), witness("contest_problem", "problem-document", 1), witness("contest_problem", "reloaded-document", 2)]],
  ])("rejects browse-only export with %s", (_label, witnesses) => {
    expect(createBrowseOnlyNavigationExportDocument(witnesses, NOW, "ac.nowcoder.com", true)).toBeUndefined();
  });

  it("export does not clear records", () => {
    const session = startCharacterizationSession(NOW, "www.nowcoder.com", false);
    const evidence = makeE1();
    const currentSession = applyCharacterizationAction({ type: "characterization_collect", hostname: "www.nowcoder.com", evidence }, session, NOW).session;
    applyCharacterizationAction({ type: "characterization_export" }, currentSession, NOW);
    expect(currentSession.records).toHaveLength(1);
  });

  it("passes the actual B1 helper parsers for the exported document", () => {
    const session = startCharacterizationSession(NOW, "www.nowcoder.com", false);
    const withRecord = applyCharacterizationAction({
      type: "characterization_collect", hostname: "www.nowcoder.com", evidence: makeE1(),
    }, session, NOW).session;
    const result = applyCharacterizationAction({ type: "characterization_export" }, withRecord, NOW).exportResult;
    expect(result?.ok).toBe(true);
    if (result === undefined || !result.ok) return;
    expect(parseNetworkTranscriptMeta(result.document.meta).ok).toBe(true);
    for (const evidence of result.document.evidence) {
      expect(parseNetworkTranscriptEvidence(evidence).ok).toBe(true);
    }
  });

  it("exports ac.nowcoder.com authenticated provenance exactly", () => {
    const session = startCharacterizationSession(NOW, "ac.nowcoder.com", true);
    const collected = applyCharacterizationAction({
      type: "characterization_collect", hostname: "ac.nowcoder.com", evidence: makeE1(),
    }, session, NOW).session;
    const result = applyCharacterizationAction({ type: "characterization_export" }, collected, NOW).exportResult;
    expect(result).toMatchObject({
      ok: true,
      document: {
        meta: {
          sourceUrl: "https://ac.nowcoder.com/",
          authenticated: true,
          evidenceTier: "authenticated-characterization",
          productionEligible: false,
        },
      },
    });
    if (result?.ok) {
      expect(parseNetworkTranscriptMeta(result.document.meta).ok).toBe(true);
    }
  });

  it("exports redirect metadata without silently dropping it", () => {
    const session = startCharacterizationSession(NOW, "www.nowcoder.com", false);
    const currentSession = applyCharacterizationAction({
      type: "characterization_collect",
      hostname: "www.nowcoder.com",
      evidence: makeE1({ statusCode: 302, redirectEndpointKey: "status" }),
    }, session, NOW).session;
    const effects = applyCharacterizationAction({ type: "characterization_export" }, currentSession, NOW);
    expect(effects.exportResult).toEqual(expect.objectContaining({
      ok: true,
      records: [expect.objectContaining({ statusCode: 302, normalizedRedirectPath: "/status" })],
    }));
  });
});

// ---------------------------------------------------------------------------
// Forbidden input validation
// ---------------------------------------------------------------------------

describe("characterization forbidden input", () => {
  it("rejects evidence with forbidden body key", () => {
    const evidence = makeE1();
    const withBody = { ...evidence, body: "secret" };
    expect(isCharacterizationSafeEvidence(withBody)).toBe(false);
  });

  it("rejects evidence with forbidden requestHeaders key", () => {
    const evidence = makeE1();
    const withHeaders = { ...evidence, requestHeaders: {} };
    expect(isCharacterizationSafeEvidence(withHeaders)).toBe(false);
  });

  it("rejects evidence with forbidden responseHeaders key", () => {
    const evidence = makeE1();
    const withHeaders = { ...evidence, responseHeaders: {} };
    expect(isCharacterizationSafeEvidence(withHeaders)).toBe(false);
  });

  it("rejects evidence with forbidden cookie key", () => {
    const evidence = makeE1();
    const withCookie = { ...evidence, cookie: "token=abc" };
    expect(isCharacterizationSafeEvidence(withCookie)).toBe(false);
  });

  it("rejects evidence with forbidden authorization key", () => {
    const evidence = makeE1();
    const withAuth = { ...evidence, authorization: "Bearer token" };
    expect(isCharacterizationSafeEvidence(withAuth)).toBe(false);
  });

  it("rejects evidence with forbidden csrf key", () => {
    const evidence = makeE1();
    const withCsrf = { ...evidence, csrf: "token123" };
    expect(isCharacterizationSafeEvidence(withCsrf)).toBe(false);
  });

  it("rejects evidence with forbidden token key", () => {
    const evidence = makeE1();
    const withToken = { ...evidence, token: "secrettoken" };
    expect(isCharacterizationSafeEvidence(withToken)).toBe(false);
  });

  it("rejects evidence with forbidden code/source key", () => {
    const evidence = makeE1();
    expect(isCharacterizationSafeEvidence({ ...evidence, code: "print('hello')" })).toBe(false);
    expect(isCharacterizationSafeEvidence({ ...evidence, source: "print('hello')" })).toBe(false);
  });

  it("accepts valid evidence with only safe keys", () => {
    const evidence = makeE1();
    expect(isCharacterizationSafeEvidence(evidence)).toBe(true);
  });

  it("validateCharacterizationEvidence rejects non-nowcoder platform", () => {
    const leetcodeEvidence = makeE1({ platform: "leetcode" });
    const result = validateCharacterizationEvidence(leetcodeEvidence);
    expect(result.safe).toBe(false);
    if (!result.safe) {
      expect(result.reason).toContain("nowcoder");
    }
  });

  it("validateCharacterizationEvidence accepts valid nowcoder evidence", () => {
    const evidence = makeE1();
    const result = validateCharacterizationEvidence(evidence);
    expect(result).toEqual({ safe: true });
  });

});

// ---------------------------------------------------------------------------
// Session status
// ---------------------------------------------------------------------------

describe("characterization session status", () => {
  it("returns inactive message when not started", () => {
    const status = characterizeSessionStatus(DEFAULT_CHARACTERIZATION_SESSION, NOW);
    expect(status).toBe("诊断模式未启用");
  });

  it("returns active message when started", () => {
    const session = startCharacterizationSession(NOW, "www.nowcoder.com", false);
    const status = characterizeSessionStatus(session, NOW);
    expect(status).toContain("诊断模式进行中");
    expect(status).toContain("已记录 0/100 条");
    expect(status).toContain("5分钟后过期");
  });

  it("returns expired message when session is expired", () => {
    const session = startCharacterizationSession(NOW, "www.nowcoder.com", false);
    const expiredNow = new Date(Date.parse(NOW) + CHARACTERIZATION_TTL_MS + 1).toISOString();
    const status = characterizeSessionStatus(session, expiredNow);
    expect(status).toBe("诊断会话已过期");
  });
});

// ---------------------------------------------------------------------------
// Build characterization record
// ---------------------------------------------------------------------------

describe("buildCharacterizationRecord", () => {
  it("builds valid record from nowcoder E1 evidence", () => {
    const evidence = makeE1({ statusCode: 200 });
    const record = buildCharacterizationRecord(evidence, NOW, NOW);
    expect(record).toBeDefined();
    if (record === undefined) return;
    expect(record.schemaVersion).toBe(1);
    expect(record.tier).toBe("E1");
    expect(record.kind).toBe("characterization_diagnostic");
    expect(record.platform).toBe("nowcoder");
    expect(record.requestId).toBe(evidence.requestId);
    expect(record.method).toBe(evidence.method);
    expect(record.endpointKey).toBe(evidence.endpointKey);
    expect(record.resourceType).toBe(evidence.resourceType);
    expect(record.lifecycle).toBe(evidence.lifecycle);
    expect(record.apiTimeStamp).toBe(evidence.apiTimeStamp);
    expect(record.statusCode).toBe(200);
  });

  it("builds record with normalizedRedirectPath when redirectEndpointKey is present", () => {
    // Construct evidence with redirectEndpointKey using Object.assign to bypass type
    const baseEvidence = makeE1();
    const evidence = Object.assign({}, baseEvidence, { redirectEndpointKey: "status" });
    const record = buildCharacterizationRecord(evidence, NOW, NOW);
    expect(record).toBeDefined();
    if (record === undefined) return;
    expect(record.normalizedRedirectPath).toBe("status");
  });

  it("returns undefined for non-nowcoder platform", () => {
    const evidence = makeE1({ platform: "leetcode" });
    const record = buildCharacterizationRecord(evidence, NOW, NOW);
    expect(record).toBeUndefined();
  });

  it("returns undefined for invalid sessionStartedAt", () => {
    const evidence = makeE1();
    const record = buildCharacterizationRecord(evidence, "invalid-date", NOW);
    expect(record).toBeUndefined();
  });

  it("returns undefined for invalid now", () => {
    const evidence = makeE1();
    const record = buildCharacterizationRecord(evidence, NOW, "invalid-date");
    expect(record).toBeUndefined();
  });

  it("returns undefined when statusCode is negative", () => {
    const evidence = makeE1({ statusCode: -1 });
    const record = buildCharacterizationRecord(evidence, NOW, NOW);
    expect(record).toBeUndefined();
  });

  it("record does not contain raw URL", () => {
    const evidence = makeE1();
    const record = buildCharacterizationRecord(evidence, NOW, NOW);
    expect(record).toBeDefined();
    if (record === undefined) return;
    const serialized = JSON.stringify(record);
    expect(serialized).not.toContain("www.nowcoder.com");
    expect(serialized).not.toContain("ac.nowcoder.com");
  });
});

// ---------------------------------------------------------------------------
// Controller with mock storage
// ---------------------------------------------------------------------------

describe("characterization controller", () => {
  const storage = {
    data: {} as Record<string, unknown>,
    get: async (keys: readonly string[]) => {
      const result: Record<string, unknown> = {};
      for (const key of keys) {
        if (key in storage.data) result[key] = storage.data[key];
      }
      return result;
    },
    set: async (items: Record<string, unknown>) => {
      Object.assign(storage.data, items);
    },
    remove: async (key: string) => {
      delete storage.data[key];
    },
  };

  beforeEach(() => {
    storage.data = {};
  });

  it("start creates an active session", async () => {
    const controller = createCharacterizationController(storage, () => NOW);
    const session = await controller.start("www.nowcoder.com", false);
    expect(session.active).toBe(true);
    expect(session.startedAt).toBe(NOW);
  });

  it("stop clears the session", async () => {
    const controller = createCharacterizationController(storage, () => NOW);
    await controller.start("www.nowcoder.com", false);
    const session = await controller.stop();
    expect(session).toEqual(DEFAULT_CHARACTERIZATION_SESSION);
  });

  it("collect stores records in session storage", async () => {
    const controller = createCharacterizationController(storage, () => NOW);
    await controller.start("www.nowcoder.com", false);
    const evidence = makeE1();
    await controller.collect(evidence, "www.nowcoder.com");
    const session = await controller.getSession();
    expect(session.records).toHaveLength(1);
  });

  it("export returns records from storage", async () => {
    const controller = createCharacterizationController(storage, () => NOW);
    await controller.start("www.nowcoder.com", false);
    const evidence = makeE1();
    await controller.collect(evidence, "www.nowcoder.com");
    const result = await controller.export();
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.records).toHaveLength(1);
    }
  });

  it("orders navigation witnesses in the serialized session controller", async () => {
    const controller = createCharacterizationController(storage, () => NOW);
    await controller.start("ac.nowcoder.com", true);
    await controller.recordNavigationWitness(witness("contest_list", "list-document", 99));
    await controller.recordNavigationWitness(witness("contest_problem", "problem-document", 99));
    const result = await controller.export();
    expect(result).toMatchObject({
      ok: true,
      document: { evidence: [{ relativeTimingOrder: 0 }, { relativeTimingOrder: 1 }] },
    });
  });

  it("isActive returns true when started", async () => {
    const controller = createCharacterizationController(storage, () => NOW);
    await controller.start("www.nowcoder.com", false);
    const active = await controller.isActive();
    expect(active).toBe(true);
  });

  it("isActive returns false when stopped", async () => {
    const controller = createCharacterizationController(storage, () => NOW);
    await controller.start("www.nowcoder.com", false);
    await controller.stop();
    const active = await controller.isActive();
    expect(active).toBe(false);
  });

  it("removes an expired session and immediately starts a fresh session", async () => {
    let currentNow = NOW;
    const controller = createCharacterizationController(storage, () => currentNow);
    await controller.start("www.nowcoder.com", false);
    currentNow = new Date(Date.parse(NOW) + CHARACTERIZATION_TTL_MS + 1).toISOString();
    const session = await controller.start("www.nowcoder.com", false);
    expect(session.active).toBe(true);
    expect(session.startedAt).toBe(currentNow);
    expect(storage.data.characterizationSession).toEqual(session);
  });

  it("removes expired state instead of retaining an inactive session record", async () => {
    let currentNow = NOW;
    const controller = createCharacterizationController(storage, () => currentNow);
    await controller.start("www.nowcoder.com", false);
    currentNow = new Date(Date.parse(NOW) + CHARACTERIZATION_TTL_MS + 1).toISOString();
    expect(await controller.isActive()).toBe(false);
    expect("characterizationSession" in storage.data).toBe(false);
  });

  it("takes one clock snapshot per controller operation", async () => {
    let reads = 0;
    const controller = createCharacterizationController(storage, () => {
      reads += 1;
      return NOW;
    });
    await controller.start("www.nowcoder.com", false);
    expect(reads).toBe(1);
    await controller.collect(makeE1(), "www.nowcoder.com");
    expect(reads).toBe(2);
    await controller.export();
    expect(reads).toBe(3);
  });
});

// ---------------------------------------------------------------------------
// No E2 effects
// ---------------------------------------------------------------------------

describe("characterization has no E2 effects", () => {
  it("session does not contain any E2/bundle/attempt fields", () => {
    const session = startCharacterizationSession(NOW, "www.nowcoder.com", false);
    const evidence = makeE1();
    const effects = applyCharacterizationAction({ type: "characterization_collect", hostname: "www.nowcoder.com", evidence }, session, NOW);
    const serialized = JSON.stringify(effects.session);
    expect(serialized).not.toContain("bundle");
    expect(serialized).not.toContain("attempt");
    expect(serialized).not.toContain("externalSubmissionId");
    expect(serialized).not.toContain("confirmed");
  });

  it("stop does not affect production state", () => {
    // Stop should only return the default session
    const session = startCharacterizationSession(NOW, "www.nowcoder.com", false);
    const evidence = makeE1();
    const withRecords = applyCharacterizationAction({ type: "characterization_collect", hostname: "www.nowcoder.com", evidence }, session, NOW);
    const effects = applyCharacterizationAction({ type: "characterization_stop" }, withRecords.session, NOW);
    // The stopped session is default - production state is unaffected
    expect(effects.session).toEqual(DEFAULT_CHARACTERIZATION_SESSION);
  });
});

// ---------------------------------------------------------------------------
// Round-trip through storage
// ---------------------------------------------------------------------------

describe("characterization storage round-trip", () => {
  it("session survives a storage read/write cycle", () => {
    const session = startCharacterizationSession(NOW, "www.nowcoder.com", false);
    const evidence = makeE1({ requestId: "req-roundtrip" });
    const withRecords = applyCharacterizationAction({ type: "characterization_collect", hostname: "www.nowcoder.com", evidence }, session, NOW).session;
    const { items } = planCharacterizationSessionWrite(withRecords);
    const restored = readCharacterizationSession(items);
    expect(restored.active).toBe(withRecords.active);
    expect(restored.startedAt).toBe(withRecords.startedAt);
    expect(restored.records).toHaveLength(1);
    expect(restored.records[0].requestId).toBe("req-roundtrip");
  });

  it("preserves both status and redirect metadata through storage", () => {
    const session = startCharacterizationSession(NOW, "www.nowcoder.com", false);
    const evidence = makeE1({ statusCode: 302, redirectEndpointKey: "status" });
    const withRecords = applyCharacterizationAction({ type: "characterization_collect", hostname: "www.nowcoder.com", evidence }, session, NOW).session;
    const restored = readCharacterizationSession(planCharacterizationSessionWrite(withRecords).items);
    expect(restored.records[0]).toMatchObject({ statusCode: 302, normalizedRedirectPath: "status" });
  });

  it("unknown fields in storage are ignored", () => {
    const corrupted = {
      characterizationSession: {
        active: true,
        startedAt: NOW,
        expiresAt: new Date(Date.parse(NOW) + CHARACTERIZATION_TTL_MS).toISOString(),
        hostname: "www.nowcoder.com",
        authenticated: false,
        records: [],
        unknownField: "should be ignored",
      },
    };
    const session = readCharacterizationSession(corrupted);
    expect(session.active).toBe(true);
  });

  it("invalid records in storage are filtered", () => {
    const withBadRecords = {
      characterizationSession: {
        active: true,
        startedAt: NOW,
        expiresAt: new Date(Date.parse(NOW) + CHARACTERIZATION_TTL_MS).toISOString(),
        hostname: "www.nowcoder.com",
        authenticated: false,
        records: [
          { schemaVersion: 1, tier: "E1", kind: "characterization_diagnostic", platform: "nowcoder", requestId: "valid", method: "POST", endpointKey: "submit", resourceType: "xmlhttprequest", lifecycle: "before_request", apiTimeStamp: 100, tabId: 1, frameId: 0, documentId: "doc-1", sessionStartedAt: NOW, receivedAt: NOW },
          { schemaVersion: 1, tier: "E1", kind: "characterization_diagnostic", platform: "leetcode", requestId: "invalid-platform", method: "POST", endpointKey: "submit", resourceType: "xmlhttprequest", lifecycle: "before_request", apiTimeStamp: 100, tabId: 1, frameId: 0, documentId: "doc-1", sessionStartedAt: NOW, receivedAt: NOW },
        ],
      },
    };
    const session = readCharacterizationSession(withBadRecords);
    expect(session.records).toHaveLength(1);
    expect(session.records[0].requestId).toBe("valid");
  });

  it("filters a polluted navigation witness from session storage", () => {
    const session = readCharacterizationSession({
      characterizationSession: {
        active: true, startedAt: NOW, expiresAt: new Date(Date.parse(NOW) + CHARACTERIZATION_TTL_MS).toISOString(),
        hostname: "ac.nowcoder.com", authenticated: true, records: [],
        navigationWitnesses: [{ ...witness("contest_list", "https://ac.nowcoder.com/private", 0), evidenceId: "e0_nowcoder_https://ac.nowcoder.com/private_contest_list" }],
      },
    });
    expect(session.navigationWitnesses).toEqual([]);
  });
});
