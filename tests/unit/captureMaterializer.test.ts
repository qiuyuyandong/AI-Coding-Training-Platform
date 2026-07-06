import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";
import { describe, expect, it } from "vitest";
import type { CaptureEvent } from "@/lib/capture/events";
import { materializeCaptureEvent } from "@/lib/services/captureMaterializer";

function openTestDatabase(): Database.Database {
  const db = new Database(join(mkdtempSync(join(tmpdir(), "training-loop-")), "test.sqlite"));
  db.exec(`
    CREATE TABLE training_attempts (
      id TEXT PRIMARY KEY,
      platform TEXT NOT NULL,
      problem_external_id TEXT NOT NULL,
      problem_title TEXT NOT NULL,
      canonical_url TEXT NOT NULL,
      started_at TEXT NOT NULL,
      ended_at TEXT,
      result TEXT NOT NULL,
      verdict TEXT,
      language TEXT,
      duration_minutes INTEGER,
      reflection TEXT,
      source_event_id TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE UNIQUE INDEX idx_training_attempts_source_event_id
      ON training_attempts(source_event_id)
      WHERE source_event_id IS NOT NULL;
    CREATE INDEX idx_training_attempts_problem_open
      ON training_attempts(platform, problem_external_id, result, updated_at);
  `);
  return db;
}

function event(overrides: Partial<CaptureEvent> = {}): CaptureEvent {
  return {
    id: "evt_1",
    type: "PAGE_DETECTED",
    platform: "leetcode",
    problemExternalId: "two-sum",
    problemTitle: "Two Sum",
    canonicalUrl: "https://leetcode.com/problems/two-sum/",
    occurredAt: "2026-07-06T00:00:00.000Z",
    payload: {},
    ...overrides,
  };
}

describe("materializeCaptureEvent", () => {
  it("creates a draft attempt from PAGE_DETECTED", () => {
    const db = openTestDatabase();
    try {
      const result = materializeCaptureEvent(db, event());

      expect(result).toEqual({ attemptId: result.attemptId, attemptStatus: "draft" });
      expect(db.prepare("SELECT COUNT(*) AS count FROM training_attempts").get()).toEqual({ count: 1 });
    } finally {
      db.close();
    }
  });

  it("reuses an open draft for repeated page detection", () => {
    const db = openTestDatabase();
    try {
      const first = materializeCaptureEvent(db, event({ id: "evt_1" }));
      const second = materializeCaptureEvent(db, event({ id: "evt_2" }));

      expect(second.attemptId).toBe(first.attemptId);
      expect(db.prepare("SELECT COUNT(*) AS count FROM training_attempts").get()).toEqual({ count: 1 });
    } finally {
      db.close();
    }
  });

  it("updates an open draft from a verdict event", () => {
    const db = openTestDatabase();
    try {
      const draft = materializeCaptureEvent(db, event({ id: "evt_1" }));
      const completed = materializeCaptureEvent(
        db,
        event({ id: "evt_2", type: "VERDICT_UPDATED", payload: { verdict: "Accepted", language: "TypeScript" } }),
      );

      expect(completed).toEqual({ attemptId: draft.attemptId, attemptStatus: "passed" });
      expect(
        db.prepare("SELECT result, verdict, language FROM training_attempts").get(),
      ).toEqual({ result: "passed", verdict: "Accepted", language: "TypeScript" });
    } finally {
      db.close();
    }
  });

  it("creates and completes an attempt when verdict arrives before a draft", () => {
    const db = openTestDatabase();
    try {
      const completed = materializeCaptureEvent(
        db,
        event({ id: "evt_1", type: "SUBMISSION_DETECTED", payload: { verdict: "Wrong Answer" } }),
      );

      expect(completed.attemptStatus).toBe("failed");
      expect(
        db.prepare("SELECT COUNT(*) AS count FROM training_attempts WHERE result = 'failed'").get(),
      ).toEqual({ count: 1 });
    } finally {
      db.close();
    }
  });

  it("does not duplicate attempts for the same source event", () => {
    const db = openTestDatabase();
    try {
      const first = materializeCaptureEvent(db, event({ id: "evt_1" }));
      const second = materializeCaptureEvent(db, event({ id: "evt_1" }));

      expect(second).toEqual(first);
      expect(db.prepare("SELECT COUNT(*) AS count FROM training_attempts").get()).toEqual({ count: 1 });
    } finally {
      db.close();
    }
  });
});
