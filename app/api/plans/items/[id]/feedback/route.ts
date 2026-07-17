import { NextResponse } from "next/server";
import { z } from "zod";
import { openDatabase } from "@/lib/db/client";
import { LOCAL_DEFAULT_LEARNER_ID } from "@/lib/domain/learner";
import {
  CaptureRequestError,
  readBoundedJson,
  requireSameOrigin,
} from "@/lib/http/captureRequest";
import { applyFeedback } from "@/lib/api/planFeedback";

/**
 * `POST /api/plans/items/[id]/feedback` — V0 plan-item feedback
 * endpoint (Todo 19).
 *
 * Body:
 *   {
 *     action: 'accepted' | 'started' | 'skipped' | 'completed',
 *     reasonCode?: SkipReasonCode,
 *     reasonText?: string,
 *     effortBoundaryMinutes?: 15 | 30 | 60 | 90,
 *   }
 *
 * Validation:
 *   - `action: 'completed'` is rejected with HTTP 400 because the
 *     dedicated `POST /api/plans/items/[id]/complete` endpoint owns
 *     ability replay and successor snapshots.
 *   - `action: 'skipped'` requires `reasonCode`. `reasonCode: 'other'`
 *     additionally requires a non-blank `reasonText`.
 *   - `effortBoundaryMinutes`, when supplied, must match the four
 *     values allowed by the SQL CHECK constraint.
 *
 * Persistence:
 *   - `accepted`, `started`, `skipped` append one `task_feedback` row.
 *     The SQL UNIQUE constraint on `(plan_item_id, action)` makes the
 *     call idempotent: a second call for the same action returns the
 *     previously-stored successor snapshot id (or `null`).
 *   - When the feedback would alter the active plan — namely
 *     `action: 'skipped'` or an explicit `effortBoundaryMinutes` change
 *     — the handler creates exactly one successor `daily_plan_snapshots`
 *     row, links it via `supersedes_daily_plan_id`, and records one
 *     `plan_revision_events` row (`item_skipped` or `effort_changed`).
 *   - Duplicate feedback actions do not produce new snapshots or
 *     revision events; the existing successor id is returned instead.
 */

const EffortBoundarySchema = z.union([
  z.literal(15),
  z.literal(30),
  z.literal(60),
  z.literal(90),
]);

const SkipReasonCodeSchema = z.enum([
  "too_hard",
  "too_easy",
  "not_relevant",
  "missing_resource",
  "not_now",
  "other",
]);

const FeedbackBodySchema = z
  .object({
    action: z.enum(["accepted", "started", "skipped", "completed"]),
    reasonCode: SkipReasonCodeSchema.optional(),
    reasonText: z.string().trim().min(1).max(2000).optional(),
    effortBoundaryMinutes: EffortBoundarySchema.optional(),
  })
  .strict();

type RouteContext = {
  readonly params: Promise<{ readonly id: string }>;
};

export async function POST(
  request: Request,
  context: RouteContext,
): Promise<Response> {
  try {
    requireSameOrigin(request);
    const parsed = FeedbackBodySchema.safeParse(await readBoundedJson(request));
    if (!parsed.success) {
      return NextResponse.json(
        {
          ok: false,
          error: "Invalid plan-item feedback request",
          issues: parsed.error.issues,
        },
        { status: 400 },
      );
    }
    const body = parsed.data;

    if (body.action === "completed") {
      return NextResponse.json(
        {
          ok: false,
          error:
            "Use POST /api/plans/items/[id]/complete for completed feedback",
        },
        { status: 400 },
      );
    }

    if (body.action === "skipped") {
      if (body.reasonCode === undefined) {
        return NextResponse.json(
          {
            ok: false,
            error: "Skipped feedback requires a non-null reasonCode",
          },
          { status: 400 },
        );
      }
      if (body.reasonCode === "other") {
        const text = body.reasonText ?? "";
        if (text.trim().length === 0) {
          return NextResponse.json(
            {
              ok: false,
              error: "reasonText must be present and non-blank for 'other'",
            },
            { status: 400 },
          );
        }
      }
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
      const response = applyFeedback(db, {
        planItemId: id,
        learnerId: LOCAL_DEFAULT_LEARNER_ID,
        action: body.action,
        reasonCode: body.reasonCode,
        reasonText: body.reasonText ?? null,
        effortBoundaryMinutes: body.effortBoundaryMinutes,
      });
      if (!response.ok) {
        const status =
          response.error === "Plan item not found"
            ? 404
            : response.error === "Learning plan not found"
            ? 404
            : 400;
        return NextResponse.json(
          { ok: false, error: response.error },
          { status },
        );
      }
      return NextResponse.json(response, { status: 200 });
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
        error: "Failed to record plan-item feedback",
        detail: error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    );
  }
}