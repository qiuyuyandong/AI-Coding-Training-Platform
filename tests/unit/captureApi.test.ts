import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { openDatabase } from "@/lib/db/client";
import { applyMigrations } from "@/lib/db/migrations";
import type { CaptureEvent } from "@/lib/capture/events";

let tempDir = "";

beforeEach(() => {
  tempDir = mkdtempSync(join(tmpdir(), "capture-api-"));
  process.env.TRAINING_DB_PATH = join(tempDir, "test.sqlite");
  const db = openDatabase();
  try {
    applyMigrations(db, { now: () => "2026-07-11T00:00:00.000Z" });
  } finally {
    db.close();
  }
});

afterEach(() => {
  delete process.env.TRAINING_DB_PATH;
  rmSync(tempDir, { recursive: true, force: true });
});

function validEvent(overrides: Partial<CaptureEvent> = {}): CaptureEvent {
  return {
    id: "evt_api_1",
    type: "PAGE_DETECTED",
    platform: "leetcode",
    problemExternalId: "two-sum",
    problemTitle: "Two Sum",
    canonicalUrl: "https://leetcode.com/problems/two-sum/",
    occurredAt: "2026-07-06T00:00:00.000Z",
    payload: { source: "test" },
    ...overrides,
  };
}

function requestWithEvent(event: CaptureEvent): Request {
  return new Request("http://localhost/api/capture/events", { method: "POST", body: JSON.stringify(event) });
}

function rowCount(db: Database.Database, table: string): number {
  return db.prepare<[], { c: number }>(`SELECT COUNT(*) AS c FROM ${table}`).get()?.c ?? 0;
}

describe("capture API", () => {
  it("creates a draft attempt for valid PAGE_DETECTED events", async () => {
    const { POST } = await import("@/app/api/capture/events/route");

    const response = await POST(requestWithEvent(validEvent()));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({ ok: true, eventId: "evt_api_1", attemptId: "attempt_evt_api_1", attemptStatus: "draft" });

    const verifyDb = openDatabase();
    try {
      expect(rowCount(verifyDb, "capture_events")).toBe(1);
      expect(rowCount(verifyDb, "training_attempts")).toBe(1);
      const attempt = verifyDb
        .prepare<[], { result: string; source_event_id: string | null }>(
          "SELECT result, source_event_id FROM training_attempts",
        )
        .get();
      expect(attempt).toEqual({ result: "draft", source_event_id: "evt_api_1" });
    } finally {
      verifyDb.close();
    }
  });

  it("updates the draft attempt for verdict events", async () => {
    const { POST } = await import("@/app/api/capture/events/route");

    const pageResponse = await POST(requestWithEvent(validEvent()));
    expect(pageResponse.status).toBe(200);

    const verdictResponse = await POST(
      requestWithEvent(
        validEvent({
          id: "evt_verdict_1",
          type: "VERDICT_UPDATED",
          payload: { verdict: "Accepted" },
        }),
      ),
    );
    const verdictBody = await verdictResponse.json();

    expect(verdictResponse.status).toBe(200);
    expect(verdictBody.attemptId).toBe("attempt_evt_api_1");
    expect(verdictBody.attemptStatus).toBe("passed");

    const verifyDb = openDatabase();
    try {
      expect(rowCount(verifyDb, "capture_events")).toBe(2);
      expect(rowCount(verifyDb, "training_attempts")).toBe(1);
      const row = verifyDb
        .prepare<[], { result: string; verdict: string | null }>("SELECT result, verdict FROM training_attempts")
        .get();
      expect(row).toEqual({ result: "passed", verdict: "Accepted" });
    } finally {
      verifyDb.close();
    }
  });

  it("updates the draft attempt to partial for runtime-like verdict events", async () => {
    const { POST } = await import("@/app/api/capture/events/route");

    const pageResponse = await POST(requestWithEvent(validEvent()));
    expect(pageResponse.status).toBe(200);

    const verdictResponse = await POST(
      requestWithEvent(
        validEvent({
          id: "evt_verdict_partial_1",
          type: "VERDICT_UPDATED",
          payload: { verdict: "Time Limit Exceeded" },
        }),
      ),
    );
    const verdictBody = await verdictResponse.json();

    expect(verdictResponse.status).toBe(200);
    expect(verdictBody.attemptId).toBe("attempt_evt_api_1");
    expect(verdictBody.attemptStatus).toBe("partial");

    const verifyDb = openDatabase();
    try {
      expect(rowCount(verifyDb, "capture_events")).toBe(2);
      expect(rowCount(verifyDb, "training_attempts")).toBe(1);
      const row = verifyDb
        .prepare<[], { result: string; verdict: string | null }>("SELECT result, verdict FROM training_attempts")
        .get();
      expect(row).toEqual({ result: "partial", verdict: "Time Limit Exceeded" });
    } finally {
      verifyDb.close();
    }
  });

  it("updates attempt reflection and returns it in recent attempts", async () => {
    const { POST } = await import("@/app/api/capture/events/route");
    await POST(requestWithEvent(validEvent()));
    await POST(requestWithEvent(validEvent({ id: "evt_verdict_1", type: "VERDICT_UPDATED", payload: { verdict: "Accepted" } })));
    const reflection = await import("@/app/api/attempts/[id]/reflection/route");

    const response = await reflection.PATCH(
      new Request("http://localhost/api/attempts/attempt_evt_api_1/reflection", {
        method: "PATCH",
        body: JSON.stringify({ reflection: "Missed the hash-map invariant on the first pass." }),
      }),
      { params: Promise.resolve({ id: "attempt_evt_api_1" }) },
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.attempt.reflection).toBe("Missed the hash-map invariant on the first pass.");

    const recent = await import("@/app/api/attempts/recent/route");
    const recentBody = await (await recent.GET()).json();
    expect(recentBody.recentAttempts[0].reflection).toBe("Missed the hash-map invariant on the first pass.");
  });

  it("rejects empty attempt reflections", async () => {
    const reflection = await import("@/app/api/attempts/[id]/reflection/route");

    const response = await reflection.PATCH(
      new Request("http://localhost/api/attempts/missing/reflection", {
        method: "PATCH",
        body: JSON.stringify({ reflection: "   " }),
      }),
      { params: Promise.resolve({ id: "missing" }) },
    );

    expect(response.status).toBe(400);
  });

  it("returns 404 when updating reflection for a missing attempt", async () => {
    const reflection = await import("@/app/api/attempts/[id]/reflection/route");

    const response = await reflection.PATCH(
      new Request("http://localhost/api/attempts/missing/reflection", {
        method: "PATCH",
        body: JSON.stringify({ reflection: "Review binary search bounds." }),
      }),
      { params: Promise.resolve({ id: "missing" }) },
    );

    expect(response.status).toBe(404);
  });

  it("does not duplicate attempts on replayed events", async () => {
    const { POST } = await import("@/app/api/capture/events/route");

    const firstResponse = await POST(requestWithEvent(validEvent()));
    const firstBody = await firstResponse.json();
    expect(firstResponse.status).toBe(200);

    const secondResponse = await POST(requestWithEvent(validEvent()));
    const secondBody = await secondResponse.json();

    expect(secondResponse.status).toBe(200);
    expect(secondBody.eventId).toBe(firstBody.eventId);
    expect(secondBody.attemptId).toBe(firstBody.attemptId);
    expect(secondBody.attemptStatus).toBe(firstBody.attemptStatus);

    const verifyDb = openDatabase();
    try {
      expect(rowCount(verifyDb, "capture_events")).toBe(1);
      expect(rowCount(verifyDb, "training_attempts")).toBe(1);
    } finally {
      verifyDb.close();
    }
  });

  it("returns 400 for invalid capture events without writing attempts", async () => {
    const { POST } = await import("@/app/api/capture/events/route");

    const response = await POST(
      new Request("http://localhost/api/capture/events", { method: "POST", body: JSON.stringify({ id: "bad" }) }),
    );
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.ok).toBe(false);
    expect(body.error).toBe("Invalid capture event");

    const verifyDb = openDatabase();
    try {
      expect(rowCount(verifyDb, "capture_events")).toBe(0);
      expect(rowCount(verifyDb, "training_attempts")).toBe(0);
    } finally {
      verifyDb.close();
    }
  });

  it("returns recent capture status", async () => {
    const events = await import("@/app/api/capture/events/route");
    await events.POST(requestWithEvent(validEvent()));
    const status = await import("@/app/api/capture/status/route");

    const response = await status.GET();

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.recentEvents[0].id).toBe("evt_api_1");
  });
});

describe("recent attempts API", () => {
  it("returns recent attempts after a materialized page event", async () => {
    const events = await import("@/app/api/capture/events/route");
    await events.POST(requestWithEvent(validEvent()));
    const recent = await import("@/app/api/attempts/recent/route");

    const response = await recent.GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.recentAttempts).toHaveLength(1);
    expect(body.recentAttempts[0]).toMatchObject({
      id: "attempt_evt_api_1",
      result: "draft",
      platform: "leetcode",
      problemExternalId: "two-sum",
    });
  });
});
