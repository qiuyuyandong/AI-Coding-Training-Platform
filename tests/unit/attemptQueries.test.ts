import Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { applyMigrations } from "@/lib/db/migrations";
import type { AttemptResult, TrainingAttempt } from "@/lib/domain/training";
import {
  aggregateAttempts,
  findLatestAttempt,
  listAttempts,
  saveTrainingAttempt,
} from "@/lib/repositories/attempts";
import { saveTrainingSession } from "@/lib/repositories/trainingSessions";

describe("attempt repository queries", () => {
  let db: Database.Database;

  beforeEach(() => {
    db = new Database(":memory:");
    applyMigrations(db, { now: () => "2026-07-14T00:00:00.000Z" });
    saveTrainingSession(db, {
      id: "session_queries",
      installationId: "installation_queries",
      platform: "leetcode",
      problemExternalId: "two-sum",
      problemTitle: "Two Sum",
      canonicalUrl: "https://leetcode.com/problems/two-sum/",
      provenanceLevel: "extension_paired",
      startedAt: "2026-07-14T00:00:00.000Z",
      createdAt: "2026-07-14T00:00:00.000Z",
      updatedAt: "2026-07-14T00:00:00.000Z",
    });
  });

  afterEach(() => {
    db.close();
  });

  it("finds the latest attempt inside a normalized problem scope", () => {
    saveTrainingAttempt(db, attempt({
      id: "attempt_two_sum_old",
      submissionId: "submission_two_sum_old",
      updatedAt: "2026-07-14T01:00:00.000Z",
    }));
    saveTrainingAttempt(db, attempt({
      id: "attempt_two_sum_latest",
      submissionId: "submission_two_sum_latest",
      updatedAt: "2026-07-14T03:00:00.000Z",
    }));
    saveTrainingAttempt(db, attempt({
      id: "attempt_other",
      submissionId: "submission_other",
      problemExternalId: "valid-parentheses",
      problemTitle: "Valid Parentheses",
      canonicalUrl: "https://leetcode.com/problems/valid-parentheses/",
      updatedAt: "2026-07-14T04:00:00.000Z",
    }));

    expect(findLatestAttempt(db, {
      platform: "leetcode",
      externalId: "TWO-SUM",
    })?.id).toBe("attempt_two_sum_latest");
  });

  it("orders deterministically and applies inclusive/exclusive time bounds", () => {
    for (const [id, updatedAt] of [
      ["attempt_before", "2026-07-14T00:59:59.999Z"],
      ["attempt_lower", "2026-07-14T01:00:00.000Z"],
      ["attempt_same_b", "2026-07-14T02:00:00.000Z"],
      ["attempt_same_a", "2026-07-14T02:00:00.000Z"],
      ["attempt_upper", "2026-07-14T03:00:00.000Z"],
    ] as const) {
      saveTrainingAttempt(db, attempt({
        id,
        submissionId: `submission_${id}`,
        updatedAt,
      }));
    }

    expect(listAttempts(db, {
      limit: 10,
      updatedFrom: "2026-07-14T01:00:00.000Z",
      updatedBefore: "2026-07-14T03:00:00.000Z",
    }).map((item) => item.id)).toEqual([
      "attempt_same_b",
      "attempt_same_a",
      "attempt_lower",
    ]);
  });

  it.each([0, -1, 1.5, 101])("rejects invalid limit %s", (limit) => {
    expect(() => listAttempts(db, { limit })).toThrow("Attempt query limit");
  });

  it("rejects invalid or reversed time windows", () => {
    expect(() => listAttempts(db, {
      limit: 10,
      updatedFrom: "not-a-date",
    })).toThrow("updatedFrom");
    expect(() => listAttempts(db, {
      limit: 10,
      updatedFrom: "2026-07-14T03:00:00.000Z",
      updatedBefore: "2026-07-14T03:00:00.000Z",
    })).toThrow("before");
  });

  it("aggregates the full eligible dataset without a row limit", () => {
    for (let index = 0; index < 60; index += 1) {
      saveTrainingAttempt(db, attempt({
        id: `attempt_${index.toString().padStart(2, "0")}`,
        submissionId: `submission_${index}`,
        result: resultFor(index),
        updatedAt: new Date(Date.UTC(2026, 6, 14, 0, index)).toISOString(),
      }));
    }

    expect(aggregateAttempts(db, {})).toEqual({
      totalAttempts: 60,
      completedAttempts: 55,
      passedAttempts: 30,
      resultDistribution: {
        draft: 5,
        passed: 30,
        failed: 15,
        partial: 5,
        stuck: 5,
      },
    });
    expect(aggregateAttempts(db, {
      updatedFrom: "2030-01-01T00:00:00.000Z",
    })).toEqual({
      totalAttempts: 0,
      completedAttempts: 0,
      passedAttempts: 0,
      resultDistribution: {
        draft: 0,
        passed: 0,
        failed: 0,
        partial: 0,
        stuck: 0,
      },
    });
  });
});

function attempt(overrides: Partial<TrainingAttempt>): TrainingAttempt {
  return {
    id: "attempt_default",
    captureSessionId: "session_queries",
    submissionId: "submission_default",
    platform: "leetcode",
    problemExternalId: "two-sum",
    problemTitle: "Two Sum",
    canonicalUrl: "https://leetcode.com/problems/two-sum/",
    startedAt: "2026-07-14T00:00:00.000Z",
    result: "passed",
    createdAt: "2026-07-14T00:00:00.000Z",
    updatedAt: "2026-07-14T00:00:00.000Z",
    ...overrides,
  };
}

function resultFor(index: number): AttemptResult {
  if (index < 5) return "draft";
  if (index < 35) return "passed";
  if (index < 50) return "failed";
  if (index < 55) return "partial";
  return "stuck";
}
