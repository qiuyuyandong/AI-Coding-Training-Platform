import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { openDatabase } from "@/lib/db/client";
import { applyMigrations } from "@/lib/db/migrations";

let tempDir = "";

beforeEach(() => {
  tempDir = mkdtempSync(join(tmpdir(), "attempt-api-"));
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

describe("manual attempt API", () => {
  it("creates a manual attempt and assigns source on the server", async () => {
    const route = await import("@/app/api/attempts/route");
    const response = await route.POST(manualRequest(manualBody()));
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(body.attempt).toMatchObject({
      recordSource: "manual",
      platform: "leetcode",
      problemExternalId: "two-sum",
      result: "failed",
      revision: 1,
    });
    expect(body.attempt).not.toHaveProperty("captureSessionId");
    expect(body.attempt).not.toHaveProperty("submissionId");
  });

  it.each([
    ["recordSource", "capture"],
    ["captureSessionId", "session_fake"],
    ["submissionId", "submission_fake"],
    ["submissionEventId", "event_fake"],
    ["verdictEventId", "verdict_event_fake"],
    ["revision", 99],
    ["verdict", "Accepted"],
    ["voidedAt", "2026-07-14T02:00:00.000Z"],
  ])("rejects client-owned field %s", async (field, value) => {
    const route = await import("@/app/api/attempts/route");
    const response = await route.POST(manualRequest({
      ...manualBody(),
      [field]: value,
    }));

    expect(response.status).toBe(400);
    const db = openDatabase();
    try {
      expect(db.prepare<[], { readonly count: number }>(
        "SELECT COUNT(*) AS count FROM training_attempts",
      ).get()).toEqual({ count: 0 });
    } finally {
      db.close();
    }
  });

  it("requires same-origin bounded JSON", async () => {
    const route = await import("@/app/api/attempts/route");
    const response = await route.POST(new Request("http://localhost/api/attempts", {
      method: "POST",
      headers: { "content-type": "application/json", origin: "https://evil.test" },
      body: JSON.stringify(manualBody()),
    }));

    expect(response.status).toBe(403);
  });
});

function manualBody(): Record<string, unknown> {
  return {
    platform: "leetcode",
    problemExternalId: "TWO-SUM",
    problemTitle: "Two Sum",
    startedAt: "2026-07-14T01:00:00.000Z",
    endedAt: "2026-07-14T01:20:00.000Z",
    result: "failed",
    language: "C++17",
    durationMinutes: 20,
    reflection: "Missed one edge case.",
  };
}

function manualRequest(body: Record<string, unknown>): Request {
  return new Request("http://localhost/api/attempts", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      origin: "http://localhost",
    },
    body: JSON.stringify(body),
  });
}
