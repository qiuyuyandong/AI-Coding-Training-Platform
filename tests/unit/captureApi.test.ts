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
import {
  issueCapturePairingCode,
  pairCaptureInstallation,
  revokeCaptureInstallation,
} from "@/lib/services/captureCredentials";

let tempDir = "";
let captureCredential = "";

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
    const pairing = issueCapturePairingCode(db);
    captureCredential = pairCaptureInstallation(db, {
      code: pairing.code,
      installationId: baseEvent.installationId,
    }).credential;
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

function requestWithBody(
  body: unknown,
  options: {
    readonly credential?: string | null;
    readonly contentType?: string;
    readonly origin?: string;
  } = {},
): Request {
  const credential = options.credential === undefined
    ? captureCredential
    : options.credential;
  const headers = new Headers({
    "content-type": options.contentType ?? "application/json",
  });
  if (credential !== null) {
    headers.set("authorization", `Bearer ${credential}`);
  }
  if (options.origin !== undefined) headers.set("origin", options.origin);
  return new Request("http://localhost/api/capture/events", {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
}

async function postEvent(event: CaptureEvent) {
  const { POST } = await import("@/app/api/capture/events/route");
  return POST(requestWithBody(event));
}

describe("capture API V2", () => {
  it("rejects missing, mismatched, and revoked credentials without writing", async () => {
    const { POST } = await import("@/app/api/capture/events/route");
    const missing = await POST(requestWithBody(sessionStarted(), { credential: null }));
    const mismatch = await POST(requestWithBody(
      sessionStarted({ installationId: "installation_other" }),
    ));

    const db = openDatabase();
    try {
      revokeCaptureInstallation(db, baseEvent.installationId);
    } finally {
      db.close();
    }
    const revoked = await POST(requestWithBody(sessionStarted()));

    expect(missing.status).toBe(401);
    expect(mismatch.status).toBe(401);
    expect(revoked.status).toBe(401);
    const verificationDb = openDatabase();
    try {
      expect(rowCount(verificationDb, "capture_events")).toBe(0);
      expect(rowCount(verificationDb, "training_sessions")).toBe(0);
    } finally {
      verificationDb.close();
    }
  });

  it("rejects media type, body size, and explicit web origins", async () => {
    const { POST } = await import("@/app/api/capture/events/route");
    expect((await POST(requestWithBody(sessionStarted(), {
      contentType: "text/plain",
    }))).status).toBe(415);
    expect((await POST(requestWithBody({ value: "x".repeat(70_000) }))).status)
      .toBe(413);
    expect((await POST(requestWithBody(sessionStarted(), {
      origin: "https://leetcode.com",
    }))).status).toBe(403);
  });

  it("creates a pairing code, pairs, rotates, and revokes through the API", async () => {
    const pairingCodes = await import("@/app/api/capture/pairing-codes/route");
    const pair = await import("@/app/api/capture/pair/route");
    const revoke = await import("@/app/api/capture/installations/[id]/revoke/route");
    const firstCodeResponse = await pairingCodes.POST(new Request(
      "http://localhost/api/capture/pairing-codes",
      {
        method: "POST",
        headers: { "content-type": "application/json", origin: "http://localhost" },
        body: "{}",
      },
    ));
    const firstCode: unknown = await firstCodeResponse.json();
    expect(firstCodeResponse.status).toBe(200);
    expect(firstCode).toMatchObject({ ok: true });
    if (
      typeof firstCode !== "object"
      || firstCode === null
      || !("code" in firstCode)
      || typeof firstCode.code !== "string"
    ) {
      throw new Error("Pairing-code response did not contain a code");
    }
    const installationId = "installation_api_new";
    const pairResponse = await pair.POST(new Request(
      "http://localhost/api/capture/pair",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ code: firstCode.code, installationId }),
      },
    ));
    expect(pairResponse.status).toBe(200);

    const rotationResponse = await pairingCodes.POST(new Request(
      "http://localhost/api/capture/pairing-codes",
      {
        method: "POST",
        headers: { "content-type": "application/json", origin: "http://localhost" },
        body: JSON.stringify({ targetInstallationId: installationId }),
      },
    ));
    expect(rotationResponse.status).toBe(200);
    const revokeResponse = await revoke.POST(
      new Request(`http://localhost/api/capture/installations/${installationId}/revoke`, {
        method: "POST",
        headers: { "content-type": "application/json", origin: "http://localhost" },
        body: "{}",
      }),
      { params: Promise.resolve({ id: installationId }) },
    );
    expect(revokeResponse.status).toBe(200);
    expect(await revokeResponse.json()).toMatchObject({ status: "revoked" });
  });

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

  it("rejects an invalid automatic problem identity without writing", async () => {
    const response = await postEvent(sessionStarted({
      platform: "codeforces",
      problemExternalId: "invalid",
      canonicalUrl: "https://codeforces.com/problemset/problem/invalid",
    }));

    expect(response.status).toBe(400);
    const db = openDatabase();
    try {
      expect(rowCount(db, "capture_events")).toBe(0);
      expect(rowCount(db, "training_sessions")).toBe(0);
    } finally {
      db.close();
    }
  });

  it("normalizes capture identity before storage", async () => {
    const response = await postEvent(sessionStarted({
      problemExternalId: "TWO-SUM",
      canonicalUrl: "https://leetcode.com/problems/two-sum/description/?env=daily",
    }));

    expect(response.status).toBe(200);
    const db = openDatabase();
    try {
      expect(db.prepare<[], {
        readonly problem_external_id: string;
        readonly canonical_url: string;
      }>("SELECT problem_external_id, canonical_url FROM capture_events").get())
        .toEqual({
          problem_external_id: "two-sum",
          canonical_url: "https://leetcode.cn/problems/two-sum/",
        });
    } finally {
      db.close();
    }
  });

  it("records a reasoned reflection correction and returns it in recent attempts", async () => {
    await postEvent(sessionStarted());
    await postEvent(submissionObserved());
    await postEvent(verdictObserved());
    const correction = await import("@/app/api/attempts/[id]/route");

    const response = await correction.PATCH(
      new Request(
        "http://localhost/api/attempts/attempt_submission_api_1",
        {
          method: "PATCH",
          headers: {
            "content-type": "application/json",
            origin: "http://localhost",
          },
          body: JSON.stringify({
            expectedRevision: 1,
            reason: "Added the missing reflection.",
            changes: {
              reflection: "Missed the hash-map invariant on the first pass.",
            },
          }),
        },
      ),
      { params: Promise.resolve({ id: "attempt_submission_api_1" }) },
    );

    expect(response.status).toBe(200);
    expect((await response.json()).attempt.reflection).toContain("hash-map");
    const recent = await import("@/app/api/attempts/recent/route");
    const recentBody = await (await recent.GET(new Request(
      "http://localhost/api/attempts/recent?platform=leetcode&externalId=two-sum&limit=1",
    ))).json();
    expect(recentBody.recentAttempts[0].reflection).toContain("hash-map");
  });

  it("returns the latest attempt inside the requested problem scope", async () => {
    await postEvent(sessionStarted());
    await postEvent(submissionObserved());
    await postEvent(verdictObserved());

    for (let index = 0; index < 11; index += 1) {
      const captureSessionId = `session_other_${index}`;
      const externalId = `other-${index}`;
      const canonicalUrl = `https://leetcode.com/problems/${externalId}/`;
      await postEvent(sessionStarted({
        id: `evt_session_other_${index}`,
        captureSessionId,
        problemExternalId: externalId,
        problemTitle: `Other ${index}`,
        canonicalUrl,
        occurredAt: `2026-07-14T01:${index.toString().padStart(2, "0")}:00.000Z`,
      }));
      await postEvent(submissionObserved(`submission_other_${index}`, {
        captureSessionId,
        problemExternalId: externalId,
        problemTitle: `Other ${index}`,
        canonicalUrl,
        occurredAt: `2026-07-14T01:${index.toString().padStart(2, "0")}:30.000Z`,
      }));
    }

    const recent = await import("@/app/api/attempts/recent/route");
    const response = await recent.GET(new Request(
      "http://localhost/api/attempts/recent?platform=leetcode&externalId=TWO-SUM&limit=1",
    ));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.recentAttempts).toHaveLength(1);
    expect(body.recentAttempts[0].problemExternalId).toBe("two-sum");
  });

  it("rejects an incomplete recent-attempt problem scope", async () => {
    const recent = await import("@/app/api/attempts/recent/route");
    const response = await recent.GET(new Request(
      "http://localhost/api/attempts/recent?platform=leetcode",
    ));

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ ok: false, recentAttempts: [] });
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
