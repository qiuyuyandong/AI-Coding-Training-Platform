import { describe, expect, it } from "vitest";
import {
  markConfirmedSubmissionFinalized,
  planConfirmedSubmissionState,
  pruneConfirmedSubmissionState,
  readConfirmedSubmissionState,
  recordConfirmedSubmission,
  type ConfirmedSubmissionRecord,
  type ConfirmedSubmissionState,
} from "@/extension/src/confirmedSubmissionStorage";

const record: ConfirmedSubmissionRecord = Object.freeze({
  schemaVersion: 1,
  status: "confirmed",
  platform: "atcoder",
  problemExternalId: "abc_a",
  externalSubmissionId: "42",
  confirmedAt: "2026-07-24T00:00:00.000Z",
  storageKey: "atcoder:42",
  lastE3At: "2026-07-24T00:00:00.000Z",
});
const empty: ConfirmedSubmissionState = {
  confirmed: [],
  tombstones: [],
};

describe("confirmed submission storage", () => {
  it("round-trips a confirmed record", () => {
    const next = recordConfirmedSubmission(empty, record, record.lastE3At).state;
    expect(readConfirmedSubmissionState(planConfirmedSubmissionState(next).items)).toEqual(next);
  });
  it("finalizes once and is idempotent", () => {
    const first = markConfirmedSubmissionFinalized(empty, record, "2026-07-24T00:01:00.000Z");
    expect(first.state.confirmed[0]?.finalizedAt).toBe("2026-07-24T00:01:00.000Z");
    expect(first.outcome).toBe("finalized");
    const second = markConfirmedSubmissionFinalized(first.state, record, "2026-07-24T00:02:00.000Z");
    expect(second.tombstone).toEqual(first.tombstone);
    expect(second.state).toEqual(first.state);
    expect(second.outcome).toBe("already_finalized");
  });
  it("bounds and expires tombstones without touching unrelated keys", () => {
    const tombstones = Array.from({ length: 3 }, (_v, i) => ({
      submissionKey: `atcoder:${i}`,
      finalizedAt: `2026-07-01T00:0${i}:00.000Z`,
      expiresAt: "2026-07-02T00:00:00.000Z",
    }));
    const state = Object.freeze({ confirmed: Object.freeze([]), tombstones: Object.freeze(tombstones) });
    const pruned = pruneConfirmedSubmissionState(state, "2026-07-24T00:00:00.000Z", {
      maxCount: 1,
      maxAgeMs: 30 * 24 * 60 * 60_000,
    });
    expect(pruned.tombstones).toEqual([]);
    expect(planConfirmedSubmissionState(state).items).not.toHaveProperty("captureOutbox");
    expect(planConfirmedSubmissionState(state).items).not.toHaveProperty("captureQuarantine");
    expect(planConfirmedSubmissionState(state).items).not.toHaveProperty("pairing");
  });
  it("fails closed for wrong versions", () => {
    expect(readConfirmedSubmissionState({ confirmedSubmissions: [{ ...record, schemaVersion: 2 }] })).toEqual(empty);
  });
});

describe("recordConfirmedSubmission idempotency", () => {
  it("rejects a repeated E2 when only an unexpired finalized tombstone remains", () => {
    const finalizedAt = "2026-07-24T00:01:00.000Z";
    const tombstoneOnly = Object.freeze({
      confirmed: Object.freeze([]),
      tombstones: Object.freeze([
        Object.freeze({
          submissionKey: record.storageKey,
          finalizedAt,
          expiresAt: "2026-08-23T00:01:00.000Z",
        }),
      ]),
    });
    const result = recordConfirmedSubmission(
      tombstoneOnly,
      record,
      "2026-07-24T02:00:00.000Z",
    );
    expect(result.outcome).toBe("already_finalized");
    expect(result.state).toBe(tombstoneOnly);
    expect(result.state.confirmed).toEqual([]);
    expect(result.tombstone?.submissionKey).toBe(record.storageKey);
  });
  it("prunes an expired tombstone before accepting a genuinely new record", () => {
    const expired = Object.freeze({
      confirmed: Object.freeze([]),
      tombstones: Object.freeze([
        Object.freeze({
          submissionKey: record.storageKey,
          finalizedAt: "2026-06-01T00:00:00.000Z",
          expiresAt: "2026-07-01T00:00:00.000Z",
        }),
      ]),
    });
    const result = recordConfirmedSubmission(expired, record, record.lastE3At);
    expect(result.outcome).toBe("recorded");
    expect(result.state.confirmed).toHaveLength(1);
    expect(result.state.tombstones).toEqual([]);
  });
  it("preserves the first confirmation timestamp for a repeated E2", () => {
    const first = recordConfirmedSubmission(empty, record, record.lastE3At);
    const repeated = recordConfirmedSubmission(
      first.state,
      {
        ...record,
        confirmedAt: "2026-07-24T00:00:01.000Z",
        lastE3At: "2026-07-24T00:00:01.000Z",
      },
      "2026-07-24T00:00:01.000Z",
    );
    expect(repeated.outcome).toBe("already_confirmed");
    expect(repeated.state).toBe(first.state);
    expect(repeated.state.confirmed[0]?.confirmedAt).toBe(record.confirmedAt);
    expect(repeated.state.confirmed[0]?.lastE3At).toBe(record.lastE3At);
  });
  it("fails closed when one submission ID is repeated for another problem", () => {
    const first = recordConfirmedSubmission(empty, record, record.lastE3At);
    const crossed = recordConfirmedSubmission(
      first.state,
      { ...record, problemExternalId: "different_problem" },
      "2026-07-24T00:00:01.000Z",
    );
    expect(crossed.outcome).toBe("identity_conflict");
    expect(crossed.state).toBe(first.state);
    expect(crossed.state.confirmed[0]?.problemExternalId).toBe(record.problemExternalId);
  });
  it("returns unchanged state when storageKey is already finalized", () => {
    const finalizedAt = "2026-07-24T00:01:00.000Z";
    const seeded = Object.freeze({
      confirmed: Object.freeze([
        Object.freeze({ ...record, finalizedAt }),
      ]),
      tombstones: Object.freeze([
        Object.freeze({
          submissionKey: record.storageKey,
          finalizedAt,
          expiresAt: "2026-07-25T00:01:00.000Z",
        }),
      ]),
    });
    const result = recordConfirmedSubmission(seeded, record, "2026-07-24T02:00:00.000Z");
    expect(result.outcome).toBe("already_finalized");
    expect(result.state).toBe(seeded);
    expect(result.state.confirmed[0]?.finalizedAt).toBe(finalizedAt);
    expect(result.tombstone?.finalizedAt).toBe(finalizedAt);
  });
  it("inserts a new record and reports recorded", () => {
    const result = recordConfirmedSubmission(empty, record, record.lastE3At);
    expect(result.outcome).toBe("recorded");
    expect(result.state.confirmed).toHaveLength(1);
    expect(result.state.confirmed[0]?.storageKey).toBe("atcoder:42");
  });
});

describe("markConfirmedSubmissionFinalized tombstone bound", () => {
  it("bounds tombstones by count and age", () => {
    const baseTime = "2026-07-01T00:00:00.000Z";
    const records = Array.from({ length: 5 }, (_v, i) => ({
      ...record,
      externalSubmissionId: `id_${i}`,
      storageKey: `atcoder:id_${i}`,
    }));
    let state = empty;
    for (let i = 0; i < records.length; i++) {
      const r = records[i];
      if (r === undefined) continue;
      const ts = new Date(Date.parse(baseTime) + i * 60_000).toISOString();
      state = recordConfirmedSubmission(state, { ...r, lastE3At: ts }, ts).state;
      state = markConfirmedSubmissionFinalized(state, r, ts).state;
    }
    // Finalize a brand-new submission after the bound window
    const freshRecord = { ...record, externalSubmissionId: "fresh", storageKey: "atcoder:fresh" };
    state = recordConfirmedSubmission(state, freshRecord, "2026-07-24T00:00:00.000Z").state;
    const finalResult = markConfirmedSubmissionFinalized(state, freshRecord, "2026-07-24T00:00:00.000Z", {
      maxCount: 2,
      maxAgeMs: 30 * 24 * 60 * 60_000,
    });
    expect(finalResult.state.tombstones.length).toBeLessThanOrEqual(2);
    expect(finalResult.state.tombstones.length).toBeGreaterThan(0);
  });
  it("maxCount: 0 yields zero tombstones", () => {
    const result = markConfirmedSubmissionFinalized(empty, record, "2026-07-24T00:01:00.000Z", {
      maxCount: 0,
    });
    expect(result.state.tombstones).toEqual([]);
    // No pre-existing tombstones were deleted; the freshly added one was simply not retained.
    expect(result.deletedTombstoneCount).toBe(0);
  });
  it("preserves order by finalizedAt", () => {
    let state = empty;
    const items = ["a", "b", "c"].map((id) => ({
      ...record,
      externalSubmissionId: id,
      storageKey: `atcoder:${id}`,
    }));
    for (let i = 0; i < items.length; i++) {
      const r = items[i];
      if (r === undefined) continue;
      const ts = new Date(Date.parse("2026-07-24T00:00:00.000Z") + i * 1000).toISOString();
      state = recordConfirmedSubmission(state, r, ts).state;
      state = markConfirmedSubmissionFinalized(state, r, ts).state;
    }
    const finalizedAtList = state.tombstones.map((t) => t.finalizedAt);
    const sorted = [...finalizedAtList].sort();
    expect(finalizedAtList).toEqual(sorted);
  });
});
