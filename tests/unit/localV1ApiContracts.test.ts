import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { z } from "zod";
import { POST as saveAssessment } from "@/app/api/evidence/assessments/route";
import { POST as completeReview } from "@/app/api/evidence/reviews/[id]/complete/route";
import { POST as startProject } from "@/app/api/projects/route";
import { POST as completeProjectSession } from "@/app/api/projects/sessions/[id]/complete/route";
import { POST as saveProjectEvidence } from "@/app/api/projects/sessions/[id]/evidence/route";
import { POST as exportProjectSession } from "@/app/api/projects/sessions/[id]/export/route";
import { POST as replaceProjectSession } from "@/app/api/projects/sessions/[id]/replace/route";
import { importPackage } from "@/lib/curriculum/importPackage";
import { openDatabase } from "@/lib/db/client";
import { applyMigrations } from "@/lib/db/migrations";
import { getOrCreateLocalProfile } from "@/lib/repositories/learnerProfiles";

let root = "";
const BASE_URL = "http://localhost";
const PASSING_COMPLETION = {
  usedAssistance: false,
  reflection: "The API contract is explicit.",
  rubricScores: {
    function: 2, design: 1, testing: 2, integration: 2,
    maintainability: 1, robustness: 1, explanation: 2, transfer: 0,
  },
} as const;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "local-v1-api-"));
  process.env.TRAINING_DB_PATH = join(root, "test.sqlite");
  const db = openDatabase();
  try {
    applyMigrations(db);
    const imported = importPackage(db, join(process.cwd(), "content", "tracks", "software-development-foundations-v1"));
    if (!imported.ok) throw new Error("Curriculum import failed");
    getOrCreateLocalProfile(db);
  } finally {
    db.close();
  }
});

afterEach(() => {
  delete process.env.TRAINING_DB_PATH;
  rmSync(root, { recursive: true, force: true });
});

describe("local V1 mutation API contracts", () => {
  it("rejects cross-origin project, evidence, assessment, review, export, and replacement requests", async () => {
    const request = evilRequest();
    const context = routeContext("missing");
    const responses = await Promise.all([
      startProject(request),
      saveProjectEvidence(evilRequest(), context),
      completeProjectSession(evilRequest(), context),
      saveAssessment(evilRequest()),
      completeReview(evilRequest(), context),
      exportProjectSession(evilRequest(), context),
      replaceProjectSession(evilRequest(), context),
    ]);
    expect(responses.map((response) => response.status)).toEqual([403, 403, 403, 403, 403, 403, 403]);
  });

  it("enforces body schemas, byte limits, and bounded route ids before mutation", async () => {
    const sessionId = await createProjectSession();
    const invalidStart = await startProject(jsonRequest("/api/projects", {
      action: "start", captureMode: "basic", unexpected: true,
    }));
    const oversizedEvidence = await saveProjectEvidence(jsonRequest(`/api/projects/sessions/${sessionId}/evidence`, {
      action: "artifact", kind: "snapshot", purpose: "too large", captureMode: "basic",
      relativePath: "src/main.cpp", content: "x".repeat(70_000), idempotencyKey: "too-large",
    }), routeContext(sessionId));
    const invalidCompletion = await completeProjectSession(jsonRequest(`/api/projects/sessions/${sessionId}/complete`, {
      ...PASSING_COMPLETION,
      rubricScores: { ...PASSING_COMPLETION.rubricScores, function: 4 },
    }), routeContext(sessionId));
    const invalidAssessment = await saveAssessment(jsonRequest("/api/evidence/assessments", {
      nodeId: firstNodeId(), kind: "self_rating", rating: null, reason: null,
      abilityInputFingerprint: null, idempotencyKey: "x".repeat(201),
    }));
    const invalidReplacement = await replaceProjectSession(
      jsonRequest(`/api/projects/sessions/${sessionId}/replace`, { reason: "x".repeat(501) }), routeContext(sessionId),
    );
    const longId = "x".repeat(201);
    const invalidReview = await completeReview(new Request(`${BASE_URL}/api/evidence/reviews/${longId}/complete`, {
      method: "POST", headers: { origin: BASE_URL },
    }), routeContext(longId));

    expect(invalidStart.status).toBe(400);
    expect(oversizedEvidence.status).toBe(413);
    expect(invalidCompletion.status).toBe(400);
    expect(invalidAssessment.status).toBe(400);
    expect(invalidReplacement.status).toBe(400);
    expect(invalidReview.status).toBe(400);
    expect(tableCount("explicit_run_results")).toBe(0);
    expect(tableCount("learner_assessments")).toBe(0);
  });

  it("starts idempotently and rejects a changed capture mode for the active project", async () => {
    const first = await startProject(jsonRequest("/api/projects", {
      action: "start", captureMode: "basic", toolchainLabel: "test toolchain",
    }));
    const replay = await startProject(jsonRequest("/api/projects", {
      action: "start", captureMode: "basic", toolchainLabel: "test toolchain",
    }));
    const conflict = await startProject(jsonRequest("/api/projects", {
      action: "start", captureMode: "full", toolchainLabel: "test toolchain",
    }));
    const firstBody = await jsonBody(first);
    const replayBody = await jsonBody(replay);

    expect(first.status).toBe(201);
    expect(firstBody["replayed"]).toBe(false);
    expect(replay.status).toBe(200);
    expect(replayBody).toMatchObject({ projectId: firstBody["projectId"], sessionId: firstBody["sessionId"], replayed: true });
    expect(conflict.status).toBe(409);
    expect(tableCount("learner_projects")).toBe(1);
  });

  it("makes evidence and project completion retries deterministic", async () => {
    const sessionId = await createProjectSession();
    const evidenceBody = {
      action: "run", kind: "test", result: "passed", provenance: "user_entered",
      idempotencyKey: "api-run-once",
    } as const;
    const firstEvidence = await saveProjectEvidence(jsonRequest(`/api/projects/sessions/${sessionId}/evidence`, evidenceBody), routeContext(sessionId));
    const replayEvidence = await saveProjectEvidence(jsonRequest(`/api/projects/sessions/${sessionId}/evidence`, evidenceBody), routeContext(sessionId));
    const changedEvidence = await saveProjectEvidence(jsonRequest(`/api/projects/sessions/${sessionId}/evidence`, {
      ...evidenceBody, result: "failed",
    }), routeContext(sessionId));

    expect(firstEvidence.status).toBe(200);
    expect(await jsonBody(replayEvidence)).toMatchObject({ ok: true, replayed: true });
    expect(changedEvidence.status).toBe(409);
    expect((await saveProjectEvidence(jsonRequest("/api/projects/sessions/missing/evidence", evidenceBody), routeContext("missing"))).status).toBe(404);

    const firstCompletion = await completeProjectSession(
      jsonRequest(`/api/projects/sessions/${sessionId}/complete`, PASSING_COMPLETION), routeContext(sessionId),
    );
    const replayCompletion = await completeProjectSession(
      jsonRequest(`/api/projects/sessions/${sessionId}/complete`, PASSING_COMPLETION), routeContext(sessionId),
    );
    const changedCompletion = await completeProjectSession(jsonRequest(`/api/projects/sessions/${sessionId}/complete`, {
      ...PASSING_COMPLETION,
      rubricScores: { ...PASSING_COMPLETION.rubricScores, design: 2 },
    }), routeContext(sessionId));
    expect(firstCompletion.status).toBe(200);
    expect((await jsonBody(firstCompletion))["replayed"]).toBe(false);
    expect(await jsonBody(replayCompletion)).toMatchObject({ ok: true, replayed: true });
    expect(changedCompletion.status).toBe(409);
    expect((await completeProjectSession(jsonRequest("/api/projects/sessions/missing/complete", PASSING_COMPLETION), routeContext("missing"))).status).toBe(404);
  });

  it("validates and deduplicates self-assessments and review completion", async () => {
    const nodeId = firstNodeId();
    const assessment = {
      nodeId, kind: "self_rating", rating: "L1", reason: null,
      abilityInputFingerprint: null, idempotencyKey: "assessment-once",
    } as const;
    const first = await saveAssessment(jsonRequest("/api/evidence/assessments", assessment));
    const replay = await saveAssessment(jsonRequest("/api/evidence/assessments", assessment));
    const changed = await saveAssessment(jsonRequest("/api/evidence/assessments", { ...assessment, rating: "L2" }));
    const unknown = await saveAssessment(jsonRequest("/api/evidence/assessments", { ...assessment, nodeId: "missing", idempotencyKey: "missing-node" }));
    expect(first.status).toBe(200);
    expect(await jsonBody(replay)).toMatchObject({ ok: true, replayed: true });
    expect(changed.status).toBe(409);
    expect(unknown.status).toBe(404);
    expect(tableCount("learner_assessments")).toBe(1);

    const sessionId = await createProjectSession();
    await saveProjectEvidence(jsonRequest(`/api/projects/sessions/${sessionId}/evidence`, {
      action: "run", kind: "test", result: "passed", provenance: "user_entered", idempotencyKey: "review-run",
    }), routeContext(sessionId));
    const completed = await completeProjectSession(
      jsonRequest(`/api/projects/sessions/${sessionId}/complete`, PASSING_COMPLETION), routeContext(sessionId),
    );
    const reviewId = z.string().parse((await jsonBody(completed))["reviewId"]);
    const reviewRequest = () => new Request(`${BASE_URL}/api/evidence/reviews/${reviewId}/complete`, {
      method: "POST", headers: { origin: BASE_URL },
    });
    const firstReview = await completeReview(reviewRequest(), routeContext(reviewId));
    const replayReview = await completeReview(reviewRequest(), routeContext(reviewId));
    expect(firstReview.status).toBe(200);
    expect(await jsonBody(replayReview)).toEqual({ ok: true, replayed: true });
    expect((await completeReview(reviewRequest(), routeContext("missing"))).status).toBe(404);
  });

  it("replays replacement, bounds route ids, and exports without local paths", async () => {
    const sessionId = await createProjectSession();
    const replaceBody = { reason: "Restart with a smaller boundary" };
    const first = await replaceProjectSession(
      jsonRequest(`/api/projects/sessions/${sessionId}/replace`, replaceBody), routeContext(sessionId),
    );
    const replay = await replaceProjectSession(
      jsonRequest(`/api/projects/sessions/${sessionId}/replace`, replaceBody), routeContext(sessionId),
    );
    const changed = await replaceProjectSession(
      jsonRequest(`/api/projects/sessions/${sessionId}/replace`, { reason: "Different reason" }), routeContext(sessionId),
    );
    expect(first.status).toBe(200);
    expect((await jsonBody(first))["replayed"]).toBe(false);
    const replayBody = await jsonBody(replay);
    expect(replayBody).toMatchObject({ ok: true, replayed: true });
    expect(changed.status).toBe(409);
    expect((await replaceProjectSession(jsonRequest("/api/projects/sessions/missing/replace", replaceBody), routeContext("missing"))).status).toBe(404);

    const replacementId = z.string().parse(z.record(z.string(), z.unknown()).parse(replayBody["session"])["id"]);
    const exportRequest = () => new Request(`${BASE_URL}/api/projects/sessions/${replacementId}/export`, {
      method: "POST", headers: { origin: BASE_URL },
    });
    const exported = await exportProjectSession(exportRequest(), routeContext(replacementId));
    const exportedAgain = await exportProjectSession(exportRequest(), routeContext(replacementId));
    expect(exported.status).toBe(200);
    expect(exportedAgain.status).toBe(200);
    expect(await exported.text()).not.toContain(root);
    expect((await exportProjectSession(exportRequest(), routeContext("missing"))).status).toBe(404);
    expect((await exportProjectSession(exportRequest(), routeContext("x".repeat(201)))).status).toBe(400);
  });
});

function jsonRequest(path: string, body: unknown): Request {
  return new Request(`${BASE_URL}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", origin: BASE_URL },
    body: JSON.stringify(body),
  });
}

function evilRequest(): Request {
  return new Request(`${BASE_URL}/api/test`, {
    method: "POST",
    headers: { "content-type": "application/json", origin: "https://evil.test" },
    body: "{}",
  });
}

function routeContext(id: string) {
  return { params: Promise.resolve({ id }) };
}

async function jsonBody(response: Response): Promise<Readonly<Record<string, unknown>>> {
  return z.record(z.string(), z.unknown()).parse(await response.json());
}

async function createProjectSession(): Promise<string> {
  const response = await startProject(jsonRequest("/api/projects", { action: "start", captureMode: "basic" }));
  return z.string().parse((await jsonBody(response))["sessionId"]);
}

function firstNodeId(): string {
  const db = openDatabase();
  try {
    return z.string().parse(db.prepare<[], { readonly id: string }>("SELECT id FROM knowledge_nodes ORDER BY id LIMIT 1").get()?.id);
  } finally {
    db.close();
  }
}

function tableCount(table: string): number {
  const db = openDatabase();
  try {
    return db.prepare<[], { readonly count: number }>(`SELECT COUNT(*) AS count FROM ${table}`).get()?.count ?? 0;
  } finally {
    db.close();
  }
}
