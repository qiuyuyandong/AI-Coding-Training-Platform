import Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { applyMigrations } from "@/lib/db/migrations";
import { listAttempts } from "@/lib/repositories/attempts";
import { createManualAttempt } from "@/lib/services/manualAttempts";

describe("createManualAttempt", () => {
  let db: Database.Database;

  beforeEach(() => {
    db = new Database(":memory:");
    applyMigrations(db, { now: () => "2026-07-14T00:00:00.000Z" });
  });

  afterEach(() => {
    db.close();
  });

  it("creates a normalized manual attempt without capture identity", () => {
    const created = createManualAttempt(db, {
      platform: "leetcode",
      problemExternalId: "TWO-SUM",
      problemTitle: "Two Sum",
      startedAt: "2026-07-14T01:00:00.000Z",
      endedAt: "2026-07-14T01:20:00.000Z",
      result: "failed",
      language: "C++17",
      durationMinutes: 20,
      reflection: "Forgot to preserve the complement invariant.",
    }, {
      id: () => "manual_attempt_test",
      now: () => "2026-07-14T01:21:00.000Z",
    });

    expect(created).toEqual({
      id: "manual_attempt_test",
      recordSource: "manual",
      platform: "leetcode",
      problemExternalId: "two-sum",
      problemTitle: "Two Sum",
      canonicalUrl: "https://leetcode.com/problems/two-sum/",
      startedAt: "2026-07-14T01:00:00.000Z",
      endedAt: "2026-07-14T01:20:00.000Z",
      result: "failed",
      language: "C++17",
      durationMinutes: 20,
      reflection: "Forgot to preserve the complement invariant.",
      revision: 1,
      createdAt: "2026-07-14T01:21:00.000Z",
      updatedAt: "2026-07-14T01:21:00.000Z",
    });
    expect(listAttempts(db, { limit: 10 })).toEqual([created]);
  });

  it("requires an observed URL for the manual platform", () => {
    const input = {
      platform: "manual" as const,
      problemExternalId: "local-task-1",
      problemTitle: "Local Task",
      startedAt: "2026-07-14T01:00:00.000Z",
      result: "passed" as const,
    };

    expect(() => createManualAttempt(db, input)).toThrow(
      "Manual problems require an observed URL",
    );
    expect(createManualAttempt(db, {
      ...input,
      canonicalUrl: "https://example.test/task/1?from=notes#answer",
    }, {
      id: () => "manual_local_task",
      now: () => "2026-07-14T01:10:00.000Z",
    }).canonicalUrl).toBe("https://example.test/task/1");
  });

  it("rejects an end time before the start time", () => {
    expect(() => createManualAttempt(db, {
      platform: "leetcode",
      problemExternalId: "two-sum",
      problemTitle: "Two Sum",
      startedAt: "2026-07-14T02:00:00.000Z",
      endedAt: "2026-07-14T01:00:00.000Z",
      result: "failed",
    })).toThrow("Attempt end time cannot precede start time");
  });
});
