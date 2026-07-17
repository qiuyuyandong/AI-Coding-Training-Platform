import { NextResponse } from "next/server";
import { z } from "zod";
import { openDatabase } from "@/lib/db/client";
import {
  CaptureRequestError,
  readBoundedJson,
  requireSameOrigin,
} from "@/lib/http/captureRequest";
import { LOCAL_DEFAULT_LEARNER_ID } from "@/lib/domain/learner";
import {
  DIAGNOSIS_PROMPTS,
  applyStartingNodeOverride,
  completeSession,
  recordResponse,
  resumeSession,
  type PromptSpec,
} from "@/lib/services/diagnosticAssessment";

/**
 * `POST /api/diagnosis` — V0 resumable diagnostic baseline flow.
 *
 * Body is a single discriminated union with the shape
 * `{ action: 'start' | 'response' | 'complete' | 'override', ... }`.
 *
 *   - `start`    → returns `{ sessionId, nextPrompt }`
 *   - `response` → `{ sessionId, promptId, response }` → `{ nextPrompt }`
 *   - `complete` → `{ sessionId }` → `{ baselines }`
 *   - `override` → `{ nodeId }` → `{ baselines }`
 *
 * Error mapping mirrors `app/api/attempts/route.ts`: invalid bodies
 * return HTTP 400 with a Zod-friendly payload, validation failures
 * inside the service translate to HTTP 400, and any unexpected
 * failure returns HTTP 500 without leaking internals.
 */

const StartActionSchema = z.object({
  action: z.literal("start"),
});

const ResponseActionSchema = z.object({
  action: z.literal("response"),
  sessionId: z.string().min(1),
  promptId: z.string().min(1),
  response: z.enum(["unknown", "needs_foundation", "can_with_help", "ready"]),
});

const CompleteActionSchema = z.object({
  action: z.literal("complete"),
  sessionId: z.string().min(1),
});

const OverrideActionSchema = z.object({
  action: z.literal("override"),
  nodeId: z.string().min(1),
});

const DiagnosisRequestSchema = z.discriminatedUnion("action", [
  StartActionSchema,
  ResponseActionSchema,
  CompleteActionSchema,
  OverrideActionSchema,
]);

export async function POST(request: Request) {
  try {
    requireSameOrigin(request);
    const parsed = DiagnosisRequestSchema.safeParse(
      await readBoundedJson(request),
    );
    if (!parsed.success) {
      return NextResponse.json(
        {
          ok: false,
          error: "Invalid diagnosis request",
          issues: parsed.error.issues,
        },
        { status: 400 },
      );
    }
    const body = parsed.data;
    const db = openDatabase();
    try {
      switch (body.action) {
        case "start": {
          const result = resumeSession(db, LOCAL_DEFAULT_LEARNER_ID);
          return NextResponse.json(
            {
              ok: true,
              sessionId: result.sessionId,
              nextPrompt: result.nextPrompt,
            },
            { status: 200 },
          );
        }
        case "response": {
          recordResponse(db, body.sessionId, body.promptId, body.response);
          // Reload the session and compute the next prompt so the
          // client can render progress immediately without a separate
          // follow-up round-trip.
          const next = computeNextPromptAfter(
            db,
            body.sessionId,
            body.promptId,
          );
          return NextResponse.json(
            { ok: true, nextPrompt: next },
            { status: 200 },
          );
        }
        case "complete": {
          const result = completeSession(db, body.sessionId);
          return NextResponse.json(
            { ok: true, baselines: result.baselines },
            { status: 200 },
          );
        }
        case "override": {
          const result = applyStartingNodeOverride(
            db,
            LOCAL_DEFAULT_LEARNER_ID,
            body.nodeId,
          );
          return NextResponse.json(
            { ok: true, baselines: result.baselines },
            { status: 200 },
          );
        }
      }
    } finally {
      db.close();
    }
  } catch (error) {
    if (error instanceof CaptureRequestError) {
      return NextResponse.json(
        { ok: false, error: error.message },
        { status: error.status },
      );
    }
    if (error instanceof z.ZodError || error instanceof RangeError) {
      return NextResponse.json(
        { ok: false, error: error.message },
        { status: 400 },
      );
    }
    return NextResponse.json(
      { ok: false, error: "Failed to process diagnosis request" },
      { status: 500 },
    );
  }
}

function computeNextPromptAfter(
  db: import("better-sqlite3").Database,
  sessionId: string,
  justAnsweredPromptId: string,
): PromptSpec | null {
  type Row = { readonly prompt_id: string };
  const rows = db
    .prepare<[string], Row>(
      `SELECT prompt_id
         FROM diagnostic_responses
        WHERE session_id = ?`,
    )
    .all(sessionId);
  const answered = new Set<string>(rows.map((row) => row.prompt_id));
  for (const spec of DIAGNOSIS_PROMPTS) {
    if (spec.promptId === justAnsweredPromptId) continue;
    if (!answered.has(spec.promptId)) {
      return spec;
    }
  }
  // If the caller just answered the last unanswered prompt, return
  // `null` so the client knows it is safe to call `complete`.
  return answered.has(justAnsweredPromptId)
    ? null
    : (DIAGNOSIS_PROMPTS[0] ?? null);
}