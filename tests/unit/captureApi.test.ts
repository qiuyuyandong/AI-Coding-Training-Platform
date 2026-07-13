import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { openDatabase } from "@/lib/db/client";
import { applyMigrations } from "@/lib/db/migrations";
import type {
  CaptureEvent,
  SessionStartedEvent,
  SubmissionObservedEvent,
  VerdictObservedEvent,
} from "@/lib/capture/protocol";

let tempDir = "";

const baseEvent = {
  schemaVersion: 2 as const,
  captureSessionId: "session_api_1",
  installationId: "installation_api_1",
  adapterVersion: "leetcode@0.1.0",
  parserVersion: "verdict@0.1.0",
  pageOrigin: "https://leetcode.com",
  provenanceLevel: "extension_unpaired" as const,
  platform: "leetcode" as const,
  problemExternalId: "two-sum",
  problemTitle: "Two Sum",
  canonicalUrl: "https://leetcode.com/problems/two-sum/",
};

beforeEach(() => {
  tempDir = mkdtempSync(join(tmpdir(), "capture-api-v2-"));
  process.env.TRAINING_DB_PATH = join(tempDir, "test.sqlite");
  const db = openDatabase();
  try {
    applyMigrations(db, { now: () => "2026-07-14T00:00:00.000Z" });
  } finally {
    db.close();
  }
});

afterEach(() => {
  delete process.env.TRAINING_DB_PATH;
  rmSync(tempDir, { recursive: true, force: true });
});

function sessionStarted(
  overrides: Partial<SessionStartedEvent> = {},
): SessionStartedEvent {
  return {
    ...baseEvent,
    id: "evt_session_api_1",
    type: "SESSION_STARTED",
    occurredAt: "2026-07-14T00:00:00.000Z",
    payload: { source: "content_script" },
    ...overrides,
  };
}

function submissionObserved(
  submissionId = "submission_api_1",
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
  submissionId = "submission_api_1",
  verdict = "Accepted",
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

function requestWithBody(body: unknown): Request {
  return new Request("http://localhost/api/capture/events", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

async function postEvent(event: CaptureEvent) {
  const { POST } = await import("@/app/api/capture/events/route");
  return POST(requestWithBody(event));
}

describe("capture API V2", () => {
  it("creates an open session without inventing an attempt", async () => {
    const response = await postEvent(sessionStarted());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      ok: true,
      eventId: "evt_session_api_1",
      captureSessionId: "session_api_1",
      replayed: false,
    });

    const db = openDatabase();
    try {
      expect(rowCount(db, "capture_events")).toBe(1);
      expect(rowCount(db, "training_sessions")).toBe(1);
      expect(rowCount(db, "training_attempts")).toBe(0);
    } finally {
      db.close();
    }
  });

  it("materializes a submission and verdict", async () => {
    await postEvent(sessionStarted());
    await postEvent(submissionObserved());
    const response = await postEvent(verdictObserved());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      attemptId: "attempt_submission_api_1",
      attemptStatus: "passed",
      replayed: false,
    });

    const db = openDatabase();
    try {
      expect(
        db.prepare("SELECT result, verdict FROM training_attempts").get(),
      ).toEqual({ result: "passed", verdict: "Accepted" });
    } finally {
      db.close();
    }
  });

  it("keeps the same verdict on separate submissions", async () => {
    await postEvent(sessionStarted());
    for (const submissionId of ["submission_api_1", "submission_api_2"]) {
      await postEvent(submissionObserved(submissionId));
      await postEvent(verdictObserved(submissionId, "Wrong Answer"));
    }

    const db = openDatabase();
    try {
      expect(rowCount(db, "training_attempts")).toBe(2);
      expect(
        db.prepare<[], { readonly verdict: string }>(
          "SELECT verdict FROM training_attempts ORDER BY submission_id",
        ).all(),
      ).toEqual([{ verdict: "Wrong Answer" }, { verdict: "Wrong Answer" }]);
    } finally {
      db.close();
    }
  });

  it("returns exact replay as HTTP 200", async () => {
    const first = await postEvent(sessionStarted());
    const replay = await postEvent(sessionStarted());

    expect(first.status).toBe(200);
    expect(replay.status).toBe(200);
    expect(await replay.json()).toMatchObject({ replayed: true });
  });

  it("returns HTTP 409 when an event ID is reused with changed content", async () => {
    await postEvent(sessionStarted());
    const response = await postEvent(
      sessionStarted({ problemTitle: "Changed title" }),
    );

    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ ok: false });
  });

  it("returns HTTP 409 for a session identity conflict and rolls back the raw event", async () => {
    await postEvent(sessionStarted());
    const response = await postEvent(
      sessionStarted({
        id: "evt_session_conflict",
        problemExternalId: "valid-parentheses",
        problemTitle: "Valid Parentheses",
        canonicalUrl: "https://leetcode.com/problems/valid-parentheses/",
      }),
    );

    expect(response.status).toBe(409);
    const db = openDatabase();
    try {
      expect(
        db.prepare<string, { readonly count: number }>(
          "SELECT COUNT(*) AS count FROM capture_events WHERE id = ?",
        ).get("evt_session_conflict"),
      ).toEqual({ count: 0 });
    } finally {
      db.close();
    }
  });

  it("rejects V1 events with HTTP 400", async () => {
    const { POST } = await import("@/app/api/capture/events/route");
    const response = await POST(
      requestWithBody({
        id: "evt_v1",
        type: "PAGE_DETECTED",
        platform: "leetcode",
        problemExternalId: "two-sum",
        problemTitle: "Two Sum",
        canonicalUrl: "https://leetcode.com/problems/two-sum/",
        occurredAt: "2026-07-14T00:00:00.000Z",
        payload: {},
      }),
    );

    expect(response.status).toBe(400);
    const db = openDatabase();
    try {
      expect(rowCount(db, "capture_events")).toBe(0);
    } finally {
      db.close();
    }
  });

  it("updates reflection and returns it in recent attempts", async () => {
    await postEvent(sessionStarted());
    await postEvent(submissionObserved());
    await postEvent(verdictObserved());
    const reflection = await import("@/app/api/attempts/[id]/reflection/route");

    const response = await reflection.PATCH(
      new Request(
        "http://localhost/api/attempts/attempt_submission_api_1/reflection",
        {
          method: "PATCH",
          body: JSON.stringify({
            reflection: "Missed the hash-map invariant on the first pass.",
          }),
        },
      ),
      { params: Promise.resolve({ id: "attempt_submission_api_1" }) },
    );

    expect(response.status).toBe(200);
    expect((await response.json()).attempt.reflection).toContain("hash-map");
    const recent = await import("@/app/api/attempts/recent/route");
    const recentBody = await (await recent.GET()).json();
    expect(recentBody.recentAttempts[0].reflection).toContain("hash-map");
  });

  it("returns recent V2 capture status", async () => {
    await postEvent(sessionStarted());
    const status = await import("@/app/api/capture/status/route");
    const response = await status.GET();

    expect(response.status).toBe(200);
    expect((await response.json()).recentEvents[0]).toMatchObject({
      id: "evt_session_api_1",
      schemaVersion: 2,
      type: "SESSION_STARTED",
    });
  });
});

function rowCount(db: Database.Database, table: string): number {
  return db
    .prepare<[], { readonly count: number }>(`SELECT COUNT(*) AS count FROM ${table}`)
    .get()?.count ?? 0;
}
