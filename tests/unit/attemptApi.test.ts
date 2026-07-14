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

describe("attempt correction API", () => {
  it("corrects allowlisted fields and returns grouped history", async () => {
    const attempt = await createManualViaApi();
    const correction = await import("@/app/api/attempts/[id]/route");
    const response = await correction.PATCH(attemptRequest(
      `http://localhost/api/attempts/${attempt.id}`,
      {
        expectedRevision: attempt.revision,
        reason: "Reviewed the failed edge case.",
        changes: { result: "passed", reflection: null },
      },
    ), { params: Promise.resolve({ id: attempt.id }) });

    expect(response.status).toBe(200);
    const history = await import("@/app/api/attempts/[id]/corrections/route");
    const historyResponse = await history.GET(
      new Request(`http://localhost/api/attempts/${attempt.id}/corrections`),
      { params: Promise.resolve({ id: attempt.id }) },
    );
    const historyBody = await historyResponse.json();
    expect(historyBody.corrections).toEqual([expect.objectContaining({
      reason: "Reviewed the failed edge case.",
      resultingRevision: 2,
    })]);

    const db = openDatabase();
    try {
      expect(db.prepare<[], { readonly count: number }>(
        "SELECT COUNT(*) AS count FROM training_attempts",
      ).get()).toEqual({ count: 1 });
    } finally {
      db.close();
    }
  });

  it.each([
    ["problemExternalId", "three-sum"],
    ["recordSource", "capture"],
    ["captureSessionId", "session_fake"],
    ["verdict", "Accepted"],
  ])("rejects correction field %s", async (field, value) => {
    const attempt = await createManualViaApi();
    const correction = await import("@/app/api/attempts/[id]/route");
    const response = await correction.PATCH(attemptRequest(
      `http://localhost/api/attempts/${attempt.id}`,
      {
        expectedRevision: attempt.revision,
        reason: "Forbidden field test.",
        changes: { [field]: value },
      },
    ), { params: Promise.resolve({ id: attempt.id }) });

    expect(response.status).toBe(400);
  });

  it("returns conflict for a stale revision", async () => {
    const attempt = await createManualViaApi();
    const correction = await import("@/app/api/attempts/[id]/route");
    const context = { params: Promise.resolve({ id: attempt.id }) };
    expect((await correction.PATCH(attemptRequest(
      `http://localhost/api/attempts/${attempt.id}`,
      { expectedRevision: 1, reason: "First.", changes: { result: "passed" } },
    ), context)).status).toBe(200);
    expect((await correction.PATCH(attemptRequest(
      `http://localhost/api/attempts/${attempt.id}`,
      { expectedRevision: 1, reason: "Stale.", changes: { result: "stuck" } },
    ), context)).status).toBe(409);
  });

  it("voids idempotently and keeps history queryable", async () => {
    const attempt = await createManualViaApi();
    const voidRoute = await import("@/app/api/attempts/[id]/void/route");
    const url = `http://localhost/api/attempts/${attempt.id}/void`;
    const context = { params: Promise.resolve({ id: attempt.id }) };
    const first = await voidRoute.POST(attemptRequest(url, {
      expectedRevision: 1,
      reason: "Wrong problem association.",
    }), context);
    const replay = await voidRoute.POST(attemptRequest(url, {
      expectedRevision: 1,
      reason: "Do not replace the original reason.",
    }), context);

    expect(first.status).toBe(200);
    expect(await replay.json()).toMatchObject({ ok: true, replayed: true });
    const history = await import("@/app/api/attempts/[id]/corrections/route");
    const historyBody = await (await history.GET(
      new Request(`http://localhost/api/attempts/${attempt.id}/corrections`),
      context,
    )).json();
    expect(historyBody.corrections).toHaveLength(1);
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
  return attemptRequest("http://localhost/api/attempts", body);
}

function attemptRequest(url: string, body: Record<string, unknown>): Request {
  return new Request(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      origin: "http://localhost",
    },
    body: JSON.stringify(body),
  });
}

async function createManualViaApi(): Promise<{
  readonly id: string;
  readonly revision: number;
}> {
  const route = await import("@/app/api/attempts/route");
  const response = await route.POST(manualRequest(manualBody()));
  const body: unknown = await response.json();
  if (
    typeof body !== "object"
    || body === null
    || !("attempt" in body)
    || typeof body.attempt !== "object"
    || body.attempt === null
    || !("id" in body.attempt)
    || typeof body.attempt.id !== "string"
    || !("revision" in body.attempt)
    || typeof body.attempt.revision !== "number"
  ) {
    throw new Error("Manual-attempt response did not contain identity and revision");
  }
  return { id: body.attempt.id, revision: body.attempt.revision };
}
