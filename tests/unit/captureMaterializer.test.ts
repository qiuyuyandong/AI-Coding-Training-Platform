import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";
import { afterEach, describe, expect, it } from "vitest";
import type {
  CaptureEvent,
  SessionEndedEvent,
  SessionStartedEvent,
  SubmissionObservedEvent,
  VerdictObservedEvent,
} from "@/lib/capture/protocol";
import { applyMigrations } from "@/lib/db/migrations";
import type { TrainingAttempt, TrainingSession } from "@/lib/domain/training";
import {
  CaptureConflictError,
  transitionCaptureState,
} from "@/lib/services/captureTransition";
import { ingestCaptureEvent } from "@/lib/services/captureMaterializer";

const tempDirs: string[] = [];
const NOW = "2026-07-14T01:00:00.000Z";

const baseEvent = {
  schemaVersion: 2 as const,
  captureSessionId: "session_1",
  installationId: "installation_1",
  adapterVersion: "leetcode@0.1.0",
  parserVersion: "verdict@0.1.0",
  pageOrigin: "https://leetcode.com",
  provenanceLevel: "extension_unpaired" as const,
  platform: "leetcode" as const,
  problemExternalId: "two-sum",
  problemTitle: "Two Sum",
  canonicalUrl: "https://leetcode.com/problems/two-sum/",
};

function sessionStarted(
  overrides: Partial<SessionStartedEvent> = {},
): SessionStartedEvent {
  return {
    ...baseEvent,
    id: "evt_session_1",
    type: "SESSION_STARTED",
    occurredAt: "2026-07-14T00:00:00.000Z",
    payload: { source: "content_script" },
    ...overrides,
  };
}

function submissionObserved(
  submissionId: string,
  overrides: Partial<SubmissionObservedEvent> = {},
): SubmissionObservedEvent {
  return {
    ...baseEvent,
    id: `evt_${submissionId}`,
    type: "SUBMISSION_OBSERVED",
    submissionId,
    occurredAt: "2026-07-14T00:01:00.000Z",
    payload: { action: "submit_clicked" },
    ...overrides,
  };
}

function verdictObserved(
  submissionId: string,
  verdict = "Wrong Answer",
  overrides: Partial<VerdictObservedEvent> = {},
): VerdictObservedEvent {
  return {
    ...baseEvent,
    id: `evt_verdict_${submissionId}`,
    type: "VERDICT_OBSERVED",
    submissionId,
    occurredAt: "2026-07-14T00:02:00.000Z",
    payload: { verdict },
    ...overrides,
  };
}

function sessionEnded(
  overrides: Partial<SessionEndedEvent> = {},
): SessionEndedEvent {
  return {
    ...baseEvent,
    id: "evt_session_end_1",
    type: "SESSION_ENDED",
    occurredAt: "2026-07-14T00:10:00.000Z",
    payload: { endReason: "pagehide" },
    ...overrides,
  };
}

function session(): TrainingSession {
  return {
    id: "session_1",
    installationId: "installation_1",
    platform: "leetcode",
    problemExternalId: "two-sum",
    problemTitle: "Two Sum",
    canonicalUrl: "https://leetcode.com/problems/two-sum/",
    provenanceLevel: "extension_unpaired",
    startedAt: "2026-07-14T00:00:00.000Z",
    createdAt: NOW,
    updatedAt: NOW,
  };
}

function draftAttempt(): TrainingAttempt {
  return {
    id: "attempt_submission_1",
    captureSessionId: "session_1",
    submissionId: "submission_1",
    platform: "leetcode",
    problemExternalId: "two-sum",
    problemTitle: "Two Sum",
    canonicalUrl: "https://leetcode.com/problems/two-sum/",
    startedAt: "2026-07-14T00:01:00.000Z",
    result: "draft",
    submissionEventId: "evt_submission_1",
    createdAt: NOW,
    updatedAt: NOW,
  };
}

function openDatabase(): Database.Database {
  const directory = mkdtempSync(join(tmpdir(), "capture-v2-"));
  tempDirs.push(directory);
  const db = new Database(join(directory, "test.sqlite"));
  applyMigrations(db, { now: () => NOW });
  return db;
}

afterEach(() => {
  for (const directory of tempDirs.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe("transitionCaptureState", () => {
  it("creates a completed attempt when verdict arrives before submission", () => {
    const transition = transitionCaptureState(
      { session: session(), attempt: null },
      verdictObserved("submission_1", "Accepted"),
      NOW,
    );

    expect(transition.attempt).toMatchObject({
      submissionId: "submission_1",
      result: "passed",
      verdict: "Accepted",
    });
  });

  it("does not let a later-arriving submission event revert a completed attempt", () => {
    const completed = transitionCaptureState(
      { session: session(), attempt: null },
      verdictObserved("submission_1", "Accepted"),
      NOW,
    ).attempt;
    expect(completed).toBeDefined();
    if (completed === undefined) return;

    const transition = transitionCaptureState(
      { session: session(), attempt: completed },
      submissionObserved("submission_1", {
        occurredAt: "2026-07-14T00:01:00.000Z",
      }),
      NOW,
    );

    expect(transition.attempt).toMatchObject({
      result: "passed",
      startedAt: "2026-07-14T00:01:00.000Z",
    });
  });

  it("ignores a verdict older than the projected verdict", () => {
    const current: TrainingAttempt = {
      ...draftAttempt(),
      result: "passed",
      verdict: "Accepted",
      endedAt: "2026-07-14T00:05:00.000Z",
      verdictEventId: "evt_verdict_new",
    };

    const transition = transitionCaptureState(
      { session: session(), attempt: current },
      verdictObserved("submission_1", "Wrong Answer", {
        id: "evt_verdict_old",
        occurredAt: "2026-07-14T00:04:00.000Z",
      }),
      NOW,
    );

    expect(transition.attempt).toMatchObject({
      result: "passed",
      verdict: "Accepted",
      verdictEventId: "evt_verdict_new",
    });
  });

  it("closes a session without changing a draft attempt", () => {
    const transition = transitionCaptureState(
      { session: session(), attempt: draftAttempt() },
      sessionEnded(),
      NOW,
    );

    expect(transition.session).toMatchObject({
      endedAt: "2026-07-14T00:10:00.000Z",
      endReason: "pagehide",
    });
    expect(transition.attempt).toBeUndefined();
  });

  it("rejects a session ID reused for another problem", () => {
    expect(() =>
      transitionCaptureState(
        { session: session(), attempt: null },
        sessionStarted({
          problemExternalId: "valid-parentheses",
          problemTitle: "Valid Parentheses",
          canonicalUrl: "https://leetcode.com/problems/valid-parentheses/",
        }),
        NOW,
      ),
    ).toThrow(CaptureConflictError);
  });

  it("rejects a new submission occurring after session end", () => {
    const endedSession: TrainingSession = {
      ...session(),
      endedAt: "2026-07-14T00:10:00.000Z",
      endReason: "pagehide",
    };
    expect(() =>
      transitionCaptureState(
        { session: endedSession, attempt: null },
        submissionObserved("submission_late", {
          occurredAt: "2026-07-14T00:11:00.000Z",
        }),
        NOW,
      ),
    ).toThrow(CaptureConflictError);
  });
});

describe("ingestCaptureEvent", () => {
  it("keeps identical verdicts as separate attempts when submission IDs differ", () => {
    const db = openDatabase();
    try {
      ingest(db, sessionStarted());
      for (const submissionId of ["submission_1", "submission_2"]) {
        ingest(db, submissionObserved(submissionId));
        ingest(db, verdictObserved(submissionId));
      }

      const attempts = db
        .prepare<[], { readonly submission_id: string; readonly verdict: string }>(
          "SELECT submission_id, verdict FROM training_attempts ORDER BY submission_id",
        )
        .all();
      expect(attempts).toEqual([
        { submission_id: "submission_1", verdict: "Wrong Answer" },
        { submission_id: "submission_2", verdict: "Wrong Answer" },
      ]);
    } finally {
      db.close();
    }
  });

  it("treats exact event replay as idempotent", () => {
    const db = openDatabase();
    try {
      const first = ingest(db, sessionStarted());
      const replay = ingest(db, sessionStarted());

      expect(first.replayed).toBe(false);
      expect(replay.replayed).toBe(true);
      expect(rowCount(db, "capture_events")).toBe(1);
      expect(rowCount(db, "training_sessions")).toBe(1);
    } finally {
      db.close();
    }
  });

  it("rejects a changed payload under an existing event ID", () => {
    const db = openDatabase();
    try {
      ingest(db, sessionStarted());
      expect(() =>
        ingest(
          db,
          sessionStarted({
            problemTitle: "Changed title",
          }),
        ),
      ).toThrow(CaptureConflictError);
      expect(rowCount(db, "capture_events")).toBe(1);
    } finally {
      db.close();
    }
  });

  it("rolls a conflicting projection back with its raw event", () => {
    const db = openDatabase();
    try {
      ingest(db, sessionStarted());
      const conflicting: SessionStartedEvent = sessionStarted({
        id: "evt_conflict",
        problemExternalId: "valid-parentheses",
        problemTitle: "Valid Parentheses",
        canonicalUrl: "https://leetcode.com/problems/valid-parentheses/",
      });

      expect(() => ingest(db, conflicting)).toThrow(CaptureConflictError);
      expect(
        db.prepare<string, { readonly count: number }>(
          "SELECT COUNT(*) AS count FROM capture_events WHERE id = ?",
        ).get("evt_conflict"),
      ).toEqual({ count: 0 });
    } finally {
      db.close();
    }
  });
});

function ingest(db: Database.Database, event: CaptureEvent) {
  return ingestCaptureEvent(db, event, { now: () => NOW });
}

function rowCount(db: Database.Database, table: string): number {
  return db
    .prepare<[], { readonly count: number }>(`SELECT COUNT(*) AS count FROM ${table}`)
    .get()?.count ?? 0;
}
