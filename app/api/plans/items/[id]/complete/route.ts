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

/**
 * `POST /api/plans/items/[id]/complete` — V0 atomic plan-item completion
 * endpoint (Todo 15).
 *
 * Body:
 *
 *   `{ result: 'passed'|'failed'|'partial'|'stuck',
 *      language?, durationMinutes?, reflection?, learnerId? }`
 *
 *   - `learnerId` defaults to `LOCAL_DEFAULT_LEARNER_ID`.
 *   - `result` rejects `'draft'` with HTTP 400.
 *
 * Status codes:
 *
 *   - 200 — success (replayed or not)
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
}).strict();

type RouteContext = {
  readonly params: Promise<{ readonly id: string }>;
};

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

      return NextResponse.json(result, { status: 200 });
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
