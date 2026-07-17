import { NextResponse } from "next/server";
import { z } from "zod";
import { openDatabase } from "@/lib/db/client";
import { LOCAL_DEFAULT_LEARNER_ID } from "@/lib/domain/learner";
import {
  CaptureRequestError,
  readBoundedJson,
  requireSameOrigin,
} from "@/lib/http/captureRequest";
import {
  completePlanItem,
  type CompleteResponse,
} from "@/lib/services/learningCompletion";
import {
  type ReflectionInput,
  type ReflectionResult,
  type ReflectionResultKind,
  requestReflectionQuestion,
} from "@/lib/services/reflectionExperiment";

/**
 * `POST /api/plans/items/[id]/complete` — V0 atomic plan-item completion
 * endpoint (Todo 15, extended by Todo 22).
 *
 * Body:
 *
 *   `{ result: 'passed'|'failed'|'partial'|'stuck',
 *      language?, durationMinutes?, reflection?, learnerId?,
 *      requestAiReflection? }`
 *
 *   - `learnerId` defaults to `LOCAL_DEFAULT_LEARNER_ID`.
 *   - `result` rejects `'draft'` with HTTP 400.
 *   - `requestAiReflection` is an explicit unchecked opt-in. When
 *     `true`, after the core transaction commits the route calls the
 *     non-persistent optional AI reflection service outside the SQLite
 *     transaction. The AI call cannot alter ability or plan and cannot
 *     convert a committed core success into HTTP failure; a failed AI
 *     call returns HTTP 200 with a deterministic fallback question.
 *
 * Status codes:
 *
 *   - 200 — success (replayed or not, with optional `aiReflection`)
 *   - 400 — body failed validation or `result === 'draft'`
 *   - 403 — origin check failed (handled upstream by the same-origin guard)
 *   - 404 — plan item not found
 *   - 409 — plan item belongs to a superseded snapshot
 *   - 413 / 415 — oversize / non-JSON body (handled upstream)
 *   - 500 — unexpected failure
 */

const CompletionBodySchema = z.object({
  learnerId: z.string().min(1).optional(),
  result: z.enum(["passed", "failed", "partial", "stuck"]),
  language: z.string().trim().min(1).max(100).optional(),
  durationMinutes: z.number().int().nonnegative().max(10_080).optional(),
  reflection: z.string().trim().min(1).max(2000).optional(),
  requestAiReflection: z.boolean().optional(),
}).strict();

type RouteContext = {
  readonly params: Promise<{ readonly id: string }>;
};

type AiFallbackQuestion = {
  readonly source: "fallback";
  readonly question: string;
};

const FALLBACK_QUESTIONS: Readonly<Record<ReflectionResultKind, string>> = {
  passed:
    "What part of your approach would you reuse on a harder variant?",
  partial:
    "What evidence shows progress, and what remains unresolved?",
  failed:
    "What is the smallest failing assumption you can test next?",
  stuck:
    "What is the smallest failing assumption you can test next?",
};

function deterministicFallback(result: ReflectionResultKind): AiFallbackQuestion {
  return { source: "fallback", question: FALLBACK_QUESTIONS[result] };
}

type AiScalarLookupRow = {
  readonly node_stable_id: string;
  readonly node_title: string;
  readonly task_stable_id: string;
  readonly task_title: string;
  readonly reason_codes_json: string;
  readonly effort_boundary_minutes: number;
};

type ReflectionScalarsWithoutResult = {
  readonly nodeStableId: string;
  readonly nodeTitle: string;
  readonly practiceTaskStableId: string;
  readonly practiceTaskTitle: string;
  readonly planReasonCode: string;
  readonly effortBoundaryMinutes: number;
};

function loadReflectionScalars(
  db: import("better-sqlite3").Database,
  planItemId: string,
): ReflectionScalarsWithoutResult | null {
  const row = db
    .prepare<[string], AiScalarLookupRow>(
      `SELECT kn.stable_id      AS node_stable_id,
              kn.title          AS node_title,
              pt.stable_id      AS task_stable_id,
              pt.title          AS task_title,
              pi.reason_codes_json AS reason_codes_json,
              ds.effort_boundary_minutes AS effort_boundary_minutes
         FROM plan_items pi
         JOIN knowledge_nodes kn ON kn.id = pi.node_id
         JOIN practice_tasks pt ON pt.stable_id = pi.practice_task_id
         JOIN daily_plan_snapshots ds ON ds.id = pi.daily_plan_id
        WHERE pi.id = ?
        LIMIT 1`,
    )
    .get(planItemId);
  if (row === undefined) return null;

  let reasonArray: unknown;
  try {
    reasonArray = JSON.parse(row.reason_codes_json);
  } catch {
    return null;
  }
  if (!Array.isArray(reasonArray)) return null;
  const firstReason: unknown = reasonArray[0];
  if (typeof firstReason !== "string" || firstReason.length === 0) {
    return null;
  }
  const effort = row.effort_boundary_minutes;
  if (!Number.isInteger(effort)) return null;

  return {
    nodeStableId: row.node_stable_id,
    nodeTitle: row.node_title,
    practiceTaskStableId: row.task_stable_id,
    practiceTaskTitle: row.task_title,
    planReasonCode: firstReason,
    effortBoundaryMinutes: effort,
  };
}

async function requestOptionalAiReflection(
  scalars: ReflectionScalarsWithoutResult,
  result: ReflectionResultKind,
): Promise<ReflectionResult | AiFallbackQuestion> {
  try {
    const input: ReflectionInput = { ...scalars, result };
    return await requestReflectionQuestion(input);
  } catch {
    return deterministicFallback(result);
  }
}

export async function POST(
  request: Request,
  context: RouteContext,
): Promise<Response> {
  try {
    requireSameOrigin(request);
    const parsed = CompletionBodySchema.safeParse(
      await readBoundedJson(request),
    );
    if (!parsed.success) {
      return NextResponse.json(
        {
          ok: false,
          error: "Invalid plan completion request",
          issues: parsed.error.issues,
        },
        { status: 400 },
      );
    }

    const { id } = await context.params;
    if (id.length === 0) {
      return NextResponse.json(
        { ok: false, error: "Plan item id is required" },
        { status: 400 },
      );
    }

    const db = openDatabase();
    try {
      const result: CompleteResponse = completePlanItem(db, {
        learnerId: parsed.data.learnerId ?? LOCAL_DEFAULT_LEARNER_ID,
        dailyPlanItemId: id,
        result: parsed.data.result,
        language: parsed.data.language,
        durationMinutes: parsed.data.durationMinutes,
        reflection: parsed.data.reflection,
      });

      if (result.ok === false) {
        if (result.error === "Plan item not found") {
          return NextResponse.json(
            { ok: false, error: result.error },
            { status: 404 },
          );
        }
        if (result.error.startsWith("Plan item no longer belongs")) {
          return NextResponse.json(
            { ok: false, error: result.error },
            { status: 409 },
          );
        }
        if (result.error.startsWith("Draft attempts")) {
          return NextResponse.json(
            { ok: false, error: result.error },
            { status: 400 },
          );
        }
        return NextResponse.json(
          { ok: false, error: result.error },
          { status: 400 },
        );
      }

      if (parsed.data.requestAiReflection !== true) {
        return NextResponse.json(result, { status: 200 });
      }

      const scalars = loadReflectionScalars(db, id);
      if (scalars === null) {
        return NextResponse.json(
          { ...result, aiReflection: deterministicFallback(parsed.data.result) },
          { status: 200 },
        );
      }

      const aiReflection = await requestOptionalAiReflection(
        scalars,
        parsed.data.result,
      );
      return NextResponse.json(
        { ...result, aiReflection },
        { status: 200 },
      );
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
      {
        ok: false,
        error: "Failed to complete plan item",
        detail: error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    );
  }
}
