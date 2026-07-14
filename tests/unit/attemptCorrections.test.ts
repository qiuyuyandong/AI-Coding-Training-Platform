import Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { applyMigrations } from "@/lib/db/migrations";
import {
  aggregateAttempts,
  findAttemptByIdIncludingVoided,
  listAttempts,
} from "@/lib/repositories/attempts";
import { listAttemptCorrections } from "@/lib/repositories/attemptCorrections";
import {
  AttemptCorrectionValidationError,
  AttemptRevisionConflictError,
  correctAttempt,
  voidAttempt,
} from "@/lib/services/attemptCorrections";
import { createManualAttempt } from "@/lib/services/manualAttempts";

describe("attempt corrections", () => {
  let db: Database.Database;
  const attemptId = "manual_attempt_correction";

  beforeEach(() => {
    db = new Database(":memory:");
    applyMigrations(db, { now: () => "2026-07-14T00:00:00.000Z" });
    createManualAttempt(db, {
      platform: "leetcode",
      problemExternalId: "two-sum",
      problemTitle: "Two Sum",
      startedAt: "2026-07-14T01:00:00.000Z",
      endedAt: "2026-07-14T01:20:00.000Z",
      result: "failed",
      language: "C++17",
      durationMinutes: 20,
      reflection: "Missed one edge case.",
    }, {
      id: () => attemptId,
      now: () => "2026-07-14T01:21:00.000Z",
    });
  });

  afterEach(() => {
    db.close();
  });

  it("updates only actual allowlisted changes and records one grouped correction", () => {
    const updated = correctAttempt(db, attemptId, {
      expectedRevision: 1,
      reason: "Verified the solve after reviewing the edge case.",
      changes: {
        result: "passed",
        language: "C++17",
        reflection: null,
      },
    }, {
      id: () => "correction_test_1",
      now: () => "2026-07-14T01:30:00.000Z",
    });

    expect(updated).toMatchObject({
      result: "passed",
      language: "C++17",
      reflection: undefined,
      revision: 2,
    });
    expect(aggregateAttempts(db, {}).totalAttempts).toBe(1);
    expect(listAttemptCorrections(db, attemptId)).toEqual([{
      id: "correction_test_1",
      attemptId,
      reason: "Verified the solve after reviewing the edge case.",
      correctedAt: "2026-07-14T01:30:00.000Z",
      resultingRevision: 2,
      changes: [
        { field: "reflection", oldValue: "Missed one edge case.", newValue: null },
        { field: "result", oldValue: "failed", newValue: "passed" },
      ],
    }]);
  });

  it("rejects no-op and stale corrections without changing the row", () => {
    expect(() => correctAttempt(db, attemptId, {
      expectedRevision: 1,
      reason: "No actual difference.",
      changes: { result: "failed" },
    })).toThrow(AttemptCorrectionValidationError);

    correctAttempt(db, attemptId, {
      expectedRevision: 1,
      reason: "First valid update.",
      changes: { result: "passed" },
    });
    expect(() => correctAttempt(db, attemptId, {
      expectedRevision: 1,
      reason: "Stale client update.",
      changes: { result: "stuck" },
    })).toThrow(AttemptRevisionConflictError);
    expect(findAttemptByIdIncludingVoided(db, attemptId)?.result).toBe("passed");
    expect(listAttemptCorrections(db, attemptId)).toHaveLength(1);
  });

  it("rolls back the value update when correction history insertion fails", () => {
    db.exec(`
      CREATE TRIGGER fail_correction_insert
      BEFORE INSERT ON attempt_corrections
      BEGIN SELECT RAISE(ABORT, 'forced correction failure'); END;
    `);

    expect(() => correctAttempt(db, attemptId, {
      expectedRevision: 1,
      reason: "This transaction must roll back.",
      changes: { result: "passed" },
    })).toThrow("forced correction failure");
    expect(findAttemptByIdIncludingVoided(db, attemptId)).toMatchObject({
      result: "failed",
      revision: 1,
    });
  });

  it("voids once, excludes the attempt by default, and replays later voids", () => {
    const first = voidAttempt(db, attemptId, {
      expectedRevision: 1,
      reason: "This record belongs to another problem.",
    }, {
      id: () => "correction_void_1",
      now: () => "2026-07-14T02:00:00.000Z",
    });
    const replay = voidAttempt(db, attemptId, {
      expectedRevision: 1,
      reason: "A different later reason must not replace the original.",
    }, {
      id: () => "correction_void_2",
      now: () => "2026-07-14T03:00:00.000Z",
    });

    expect(first.replayed).toBe(false);
    expect(replay.replayed).toBe(true);
    expect(replay.attempt).toMatchObject({
      revision: 2,
      voidedAt: "2026-07-14T02:00:00.000Z",
      voidReason: "This record belongs to another problem.",
    });
    expect(listAttempts(db, { limit: 10 })).toEqual([]);
    expect(aggregateAttempts(db, {}).totalAttempts).toBe(0);
    expect(listAttemptCorrections(db, attemptId)).toEqual([expect.objectContaining({
      id: "correction_void_1",
      changes: [{
        field: "voidedAt",
        oldValue: null,
        newValue: "2026-07-14T02:00:00.000Z",
      }],
    })]);
  });

  it("rejects corrections after voiding", () => {
    voidAttempt(db, attemptId, {
      expectedRevision: 1,
      reason: "Invalid evidence.",
    });

    expect(() => correctAttempt(db, attemptId, {
      expectedRevision: 2,
      reason: "Cannot revive through correction.",
      changes: { result: "passed" },
    })).toThrow(AttemptRevisionConflictError);
  });
});
