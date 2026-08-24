import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { openDatabase } from "@/lib/db/client";
import { applyMigrations } from "@/lib/db/migrations";
import type {
  SessionStartedEvent,
  SubmissionObservedEvent,
  VerdictObservedEvent,
  SessionEndedEvent,
} from "@/lib/capture/protocol";
import type { CaptureAttemptBundle } from "@/lib/capture/attemptBundle";
import { CaptureConflictError } from "@/lib/services/captureTransition";
import {
  ingestCaptureAttemptBundle,
} from "@/lib/services/captureAttemptBundle";
import {
  createCaptureCapability,
} from "@/lib/services/captureCapability";
import { CAPTURE_EXTENSION_ORIGIN } from "@/lib/extension/identity";
import { rotateLocalCaptureInstallation } from "@/lib/vault/captureInstallation";

let tempDir = "";
let captureCapability = "";

const baseEvent = {
  schemaVersion: 2 as const,
  captureSessionId: "session_bundle_api_1",
  installationId: "installation_33333333-3333-4333-8333-333333333333",
  adapterVersion: "atomic-bundle@0.1.0",
  parserVersion: "atomic-bundle@0.1.0",
  pageOrigin: "https://leetcode.com",
  provenanceLevel: "extension_local" as const,
  platform: "leetcode" as const,
  problemExternalId: "two-sum",
  problemTitle: "Two Sum",
  canonicalUrl: "https://leetcode.cn/problems/two-sum/",
};

beforeEach(() => {
  tempDir = mkdtempSync(join(tmpdir(), "capture-bundle-api-"));
  process.env.TRAINING_DB_PATH = join(tempDir, "test.sqlite");
  process.env.TRAINING_VAULT_CONFIG_DIR = join(tempDir, "config");
  const db = openDatabase();
  try {
    applyMigrations(db, { now: () => "2026-07-14T00:00:00.000Z" });
    captureCapability = createCaptureCapability();
    rotateLocalCaptureInstallation({
      capability: captureCapability,
      installationId: baseEvent.installationId,
    });
  } finally {
    db.close();
  }
});

afterEach(() => {
  delete process.env.TRAINING_DB_PATH;
  delete process.env.TRAINING_VAULT_CONFIG_DIR;
  rmSync(tempDir, { recursive: true, force: true });
});

function sessionStarted(): SessionStartedEvent {
  return {
    ...baseEvent,
    id: "evt_started",
    type: "SESSION_STARTED",
    occurredAt: "2026-07-14T00:00:00.000Z",
    payload: { source: "content_script" },
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
  verdict: string,
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

function sessionEnded(): SessionEndedEvent {
  return {
    ...baseEvent,
    id: "evt_end",
    type: "SESSION_ENDED",
    occurredAt: "2026-07-14T00:03:00.000Z",
    payload: { endReason: "spa_navigation" },
  };
}

function attemptBundle(overrides: Partial<{
  readonly submissionId: string;
  readonly verdict: string;
}> = {}): CaptureAttemptBundle {
  const submissionId = overrides.submissionId ?? "submission_bundle_api_1";
  const verdict = overrides.verdict ?? "Accepted";
  return {
    schemaVersion: 1,
    bundleId: `bundle_${submissionId}`,
    events: [
      sessionStarted(),
      submissionObserved(submissionId),
      verdictObserved(submissionId, verdict),
      sessionEnded(),
    ],
  };
}

function openTestDatabase(): Database.Database {
  return openDatabase();
}

describe("ingestCaptureAttemptBundle", () => {
  it("writes four events and one training attempt atomically", () => {
    const db = openTestDatabase();
    try {
      const ack = ingestCaptureAttemptBundle(db, attemptBundle());
      expect(ack).toMatchObject({
        bundleId: "bundle_submission_bundle_api_1",
        captureSessionId: "session_bundle_api_1",
        attemptId: "attempt_submission_bundle_api_1",
        attemptStatus: "passed",
        replayed: false,
      });
      expect(rowCount(db, "capture_events")).toBe(4);
      expect(rowCount(db, "training_sessions")).toBe(1);
      expect(rowCount(db, "training_attempts")).toBe(1);
    } finally {
      db.close();
    }
  });

  it("replaying the same bundle is idempotent", () => {
    const db = openTestDatabase();
    try {
      const first = ingestCaptureAttemptBundle(db, attemptBundle());
      const replay = ingestCaptureAttemptBundle(db, attemptBundle());
      expect(first.attemptId).toBe(replay.attemptId);
      expect(replay.replayed).toBe(true);
      expect(rowCount(db, "capture_events")).toBe(4);
      expect(rowCount(db, "training_attempts")).toBe(1);
    } finally {
      db.close();
    }
  });

  it("rolls back an attempted conflict under reused event id", () => {
    const db = openTestDatabase();
    try {
      ingestCaptureAttemptBundle(db, attemptBundle());
      const conflicting = attemptBundle();
      conflicting.events = conflicting.events.map((event) => ({
        ...event,
        problemTitle: "Wrong title",
      })) as typeof conflicting.events;
      expect(() => ingestCaptureAttemptBundle(db, conflicting)).toThrow(CaptureConflictError);
      expect(rowCount(db, "capture_events")).toBe(4);
      expect(rowCount(db, "training_attempts")).toBe(1);
    } finally {
      db.close();
    }
  });

  it("rolls back when the verdict is dropped", () => {
    const db = openTestDatabase();
    try {
      const truncated = attemptBundle();
      truncated.events = [
        truncated.events[0],
        truncated.events[1],
        truncated.events[2],
        truncated.events[3],
      ];
      // simulate the verdict event arriving with a payload that the
      // materializer refuses — issue a veto by reusing the start id with
      // a different body so the materializer rolls back.
      const conflictInput = attemptBundle();
      conflictInput.events[2] = {
        ...conflictInput.events[2],
        id: conflictInput.events[1].id,
      };
      expect(() => ingestCaptureAttemptBundle(db, conflictInput)).toThrow();
      expect(rowCount(db, "capture_events")).toBe(0);
    } finally {
      db.close();
    }
  });
});

function requestWithBody(
  body: unknown,
  options: {
    readonly capability?: string | null;
    readonly contentType?: string;
    readonly origin?: string | null;
  } = {},
): Request {
  const capability = options.capability === undefined ? captureCapability : options.capability;
  const headers = new Headers({
    "content-type": options.contentType ?? "application/json",
  });
  if (capability !== null) {
    headers.set("authorization", `Bearer ${capability}`);
  }
  const origin = options.origin === undefined ? CAPTURE_EXTENSION_ORIGIN : options.origin;
  if (origin !== null) headers.set("origin", origin);
  return new Request("http://localhost:3000/api/capture/attempts", {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
}

describe("POST /api/capture/attempts", () => {
  it("rejects missing, mismatched, and rotated capabilities without writing", async () => {
    const { POST } = await import("@/app/api/capture/attempts/route");
    const bundle = attemptBundle({ submissionId: "submission_attempts_1" });
    const missing = await POST(requestWithBody(bundle, { capability: null }));
    const mismatch = await POST(requestWithBody(bundle, {
      capability: `capture_${"B".repeat(43)}`,
    }));

    const oldCapability = captureCapability;
    captureCapability = createCaptureCapability();
    rotateLocalCaptureInstallation({
      capability: captureCapability,
      installationId: baseEvent.installationId,
    });
    const rotated = await POST(requestWithBody(bundle, { capability: oldCapability }));

    expect(missing.status).toBe(401);
    expect(mismatch.status).toBe(401);
    expect(rotated.status).toBe(401);
    const verification = openDatabase();
    try {
      expect(rowCount(verification, "capture_events")).toBe(0);
      expect(rowCount(verification, "training_sessions")).toBe(0);
    } finally {
      verification.close();
    }
  });

  it("rejects a non-chrome origin with HTTP 403", async () => {
    const { POST } = await import("@/app/api/capture/attempts/route");
    const bundle = attemptBundle({ submissionId: "submission_attempts_2" });
    const response = await POST(requestWithBody(bundle, {
      origin: "https://leetcode.com",
    }));
    expect(response.status).toBe(403);
  });

  it("rejects invalid media type, oversize body, and malformed body", async () => {
    const { POST } = await import("@/app/api/capture/attempts/route");
    expect((await POST(requestWithBody(attemptBundle(), {
      contentType: "text/plain",
    }))).status).toBe(415);
    expect((await POST(requestWithBody({ value: "x".repeat(70_000) }))).status).toBe(413);
    expect((await POST(requestWithBody({ schemaVersion: "bad" }))).status).toBe(400);
  });

  it("returns 200 with one final attempt on first success", async () => {
    const { POST } = await import("@/app/api/capture/attempts/route");
    const bundle = attemptBundle({ submissionId: "submission_attempts_3" });
    const response = await POST(requestWithBody(bundle));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toMatchObject({
      ok: true,
      bundleId: "bundle_submission_attempts_3",
      captureSessionId: "session_bundle_api_1",
      attemptId: "attempt_submission_attempts_3",
      attemptStatus: "passed",
      replayed: false,
    });

    const db = openDatabase();
    try {
      expect(rowCount(db, "capture_events")).toBe(4);
      expect(rowCount(db, "training_attempts")).toBe(1);
    } finally {
      db.close();
    }
  });

  it("returns replayed=true on the second identical bundle and never writes new rows", async () => {
    const { POST } = await import("@/app/api/capture/attempts/route");
    const bundle = attemptBundle({ submissionId: "submission_attempts_4" });
    const first = await POST(requestWithBody(bundle));
    const second = await POST(requestWithBody(bundle));
    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    const body = await second.json();
    expect(body.replayed).toBe(true);

    const db = openDatabase();
    try {
      expect(rowCount(db, "capture_events")).toBe(4);
      expect(rowCount(db, "training_attempts")).toBe(1);
    } finally {
      db.close();
    }
  });

  it("returns HTTP 409 when reused events disagree on body and rolls back", async () => {
    const { POST } = await import("@/app/api/capture/attempts/route");
    const bundle = attemptBundle({ submissionId: "submission_attempts_5" });
    const first = await POST(requestWithBody(bundle));
    expect(first.status).toBe(200);

    const conflicting = {
      ...bundle,
      events: bundle.events.map((event) => ({
        ...event,
        problemTitle: "Different title",
      })),
    };
    const response = await POST(requestWithBody(conflicting));
    expect(response.status).toBe(409);
    const db = openDatabase();
    try {
      expect(rowCount(db, "capture_events")).toBe(4);
      expect(rowCount(db, "training_attempts")).toBe(1);
    } finally {
      db.close();
    }
  });
});

function rowCount(db: Database.Database, table: string): number {
  return db
    .prepare<[], { readonly count: number }>(`SELECT COUNT(*) AS count FROM ${table}`)
    .get()?.count ?? 0;
}
