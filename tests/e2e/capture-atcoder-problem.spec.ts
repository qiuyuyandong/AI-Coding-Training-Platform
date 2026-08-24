import { expect, test } from "@playwright/test";
import Database from "better-sqlite3";
import {
  captureEvent,
  postCaptureEvents,
  type CaptureProblemFixture,
} from "./captureFixtures";
import { E2E_DB_PATH } from "./database";

// This E2E proves the local capture/API/SQLite/UI pipeline only. AtCoder DOM
// parsing is proven by retained static unit fixtures; this test never navigates
// to AtCoder or makes an external request.

const atcoderProblem: CaptureProblemFixture = {
  captureSessionId: "session_e2e_atcoder_pipeline",
  platform: "atcoder",
  problemExternalId: "agc040_d",
  problemTitle: "D - Balance Beam",
  canonicalUrl: "https://atcoder.jp/contests/agc040/tasks/agc040_d",
};

const submissionId = "submission_e2e_atcoder_agc040_d";

type AtcoderAttemptRow = {
  readonly capture_session_id: string;
  readonly submission_id: string;
  readonly record_source: string;
  readonly platform: string;
  readonly problem_external_id: string;
  readonly problem_title: string;
  readonly canonical_url: string;
  readonly result: string;
  readonly verdict: string | null;
  readonly submission_event_id: string | null;
  readonly verdict_event_id: string | null;
  readonly voided_at: string | null;
};

type AtcoderSessionRow = {
  readonly id: string;
  readonly installation_id: string;
  readonly platform: string;
  readonly problem_external_id: string;
  readonly problem_title: string;
  readonly canonical_url: string;
  readonly ended_at: string | null;
};

test("AtCoder capture events project into the local training attempt with exact identity", async ({
  page,
  request,
}, testInfo) => {
  const pageRequests: string[] = [];
  page.on("request", (pageRequest) => {
    pageRequests.push(pageRequest.url());
  });

  await postCaptureEvents(request, [
    captureEvent(atcoderProblem, {
      type: "SESSION_STARTED",
      eventId: "evt_e2e_atcoder_session",
      occurredAt: "2026-07-16T03:00:00.000Z",
    }),
    captureEvent(atcoderProblem, {
      type: "SUBMISSION_OBSERVED",
      eventId: "evt_e2e_atcoder_submission",
      submissionId,
      occurredAt: "2026-07-16T03:01:00.000Z",
    }),
    captureEvent(atcoderProblem, {
      type: "VERDICT_OBSERVED",
      eventId: "evt_e2e_atcoder_verdict",
      submissionId,
      verdict: "Accepted",
      occurredAt: "2026-07-16T03:02:00.000Z",
    }),
  ]);

  const db = new Database(E2E_DB_PATH, { readonly: true });
  try {
    const attempts = db.prepare<[string], AtcoderAttemptRow>(`
      SELECT capture_session_id, submission_id, record_source, platform,
        problem_external_id, problem_title, canonical_url, result, verdict,
        submission_event_id, verdict_event_id, voided_at
      FROM training_attempts
      WHERE submission_id = ?
    `).all(submissionId);
    expect(attempts).toHaveLength(1);
    const attempt = attempts[0];
    if (attempt === undefined) throw new Error("AtCoder attempt row was not returned");

    expect(attempt.capture_session_id).toBe(atcoderProblem.captureSessionId);
    expect(attempt.submission_id).toBe(submissionId);
    expect(attempt.record_source).toBe("capture");
    expect(attempt.platform).toBe("atcoder");
    expect(attempt.problem_external_id).toBe("agc040_d");
    expect(attempt.problem_title).toBe("D - Balance Beam");
    expect(attempt.canonical_url).toBe(atcoderProblem.canonicalUrl);
    expect(attempt.result).toBe("passed");
    expect(attempt.verdict).toBe("Accepted");
    expect(attempt.submission_event_id).toBe("evt_e2e_atcoder_submission");
    expect(attempt.verdict_event_id).toBe("evt_e2e_atcoder_verdict");
    expect(attempt.voided_at).toBeNull();

    const sessions = db.prepare<[string], AtcoderSessionRow>(`
      SELECT id, installation_id, platform, problem_external_id, problem_title,
        canonical_url, ended_at
      FROM training_sessions
      WHERE id = ?
    `).all(atcoderProblem.captureSessionId);
    expect(sessions).toHaveLength(1);
    const session = sessions[0];
    if (session === undefined) throw new Error("AtCoder session row was not returned");

    expect(session.id).toBe(atcoderProblem.captureSessionId);
    expect(session.installation_id).toBe("installation_44444444-4444-4444-8444-444444444444");
    expect(session.platform).toBe("atcoder");
    expect(session.problem_external_id).toBe("agc040_d");
    expect(session.problem_title).toBe("D - Balance Beam");
    expect(session.canonical_url).toBe(atcoderProblem.canonicalUrl);
    expect(session.ended_at).toBeNull();
  } finally {
    db.close();
  }

  await page.goto(
    "/training?platform=atcoder&externalId=agc040_d&title=D%20-%20Balance%20Beam",
  );

  const headerSection = page.locator("section").filter({
    has: page.getByRole("heading", { name: "D - Balance Beam" }),
  });
  await expect(headerSection).toContainText("D - Balance Beam");
  await expect(headerSection).toContainText("atcoder");
  await expect(headerSection).toContainText("Problem ID: agc040_d");

  const attemptPanel = page.locator("section").filter({
    has: page.getByRole("heading", { name: "Training attempt" }),
  });
  await expect(attemptPanel).toContainText("D - Balance Beam");
  await expect(attemptPanel).toContainText("atcoder");
  await expect(attemptPanel).toContainText("agc040_d");
  await expect(attemptPanel).toContainText("Accepted");

  for (const contaminatedText of ["LeetCode", "Luogu", "two-sum", "P1001"] as const) {
    await expect(page.locator("main")).not.toContainText(contaminatedText);
  }

  const configuredOrigin = new URL(
    testInfo.project.use.baseURL ?? "http://localhost:3000",
  ).origin;
  const allowedOrigins = new Set([
    configuredOrigin,
    "http://localhost:3000",
    "http://127.0.0.1:3000",
  ]);
  const externalRequests = pageRequests.filter(
    (url) => !allowedOrigins.has(new URL(url).origin),
  );
  console.log(
    `ATCODER_LOCAL_REQUESTS count=${pageRequests.length} urls=${JSON.stringify(pageRequests)} external=${JSON.stringify(externalRequests)}`,
  );
  expect(externalRequests).toEqual([]);
});
