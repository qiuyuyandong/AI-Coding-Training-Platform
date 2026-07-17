import type Database from "better-sqlite3";
import { NextResponse } from "next/server";
import { z } from "zod";
import { openDatabase } from "@/lib/db/client";
import { LOCAL_DEFAULT_LEARNER_ID } from "@/lib/domain/learner";
import {
  type EffortBoundaryMinutes,
  type PlanRevisionEventType,
  type SkipReasonCode,
} from "@/lib/domain/plan";
import {
  CaptureRequestError,
  readBoundedJson,
  requireSameOrigin,
} from "@/lib/http/captureRequest";
import {
  appendFeedback,
  createDailySnapshot,
  findActivePlan,
  findLatestDailySnapshot,
  recordRevisionEvent,
} from "@/lib/repositories/plans";

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

type ApplyFeedbackInput = {
  readonly planItemId: string;
  readonly learnerId: string;
  readonly action: "accepted" | "started" | "skipped";
  readonly reasonCode?: SkipReasonCode;
  readonly reasonText: string | null;
  readonly effortBoundaryMinutes?: EffortBoundaryMinutes;
};

export type ApplyFeedbackResponse =
  | {
      readonly ok: true;
      readonly feedbackId: string;
      readonly replayed: boolean;
      readonly snapshotId: string | null;
      readonly revisionEventType: PlanRevisionEventType | null;
    }
  | { readonly ok: false; readonly error: string };

type PlanItemLookupRow = {
  readonly plan_item_id: string;
  readonly daily_plan_id: string;
  readonly learner_id: string;
  readonly learning_plan_id: string;
  readonly local_date: string;
  readonly daily_mode: string;
  readonly effort_boundary_minutes: number;
};

function lookupPlanItem(
  db: Database.Database,
  planItemId: string,
  learnerId: string,
): PlanItemLookupRow | null {
  const row = db
    .prepare<[string], PlanItemLookupRow>(
      `SELECT pi.id           AS plan_item_id,
              pi.daily_plan_id AS daily_plan_id,
              lp.learner_id   AS learner_id,
              lp.id           AS learning_plan_id,
              s.local_date    AS local_date,
              s.daily_mode    AS daily_mode,
              s.effort_boundary_minutes AS effort_boundary_minutes
         FROM plan_items pi
         JOIN daily_plan_snapshots s ON s.id = pi.daily_plan_id
         JOIN learning_plans lp ON lp.id = s.learning_plan_id
        WHERE pi.id = ?
        LIMIT 1`,
    )
    .get(planItemId);
  if (row === undefined) return null;
  if (row.learner_id !== learnerId) return null;
  return row;
}

function findExistingFeedback(
  db: Database.Database,
  planItemId: string,
  action: "accepted" | "started" | "skipped",
): {
  readonly feedbackId: string;
  readonly successorDailyPlanId: string | null;
} | null {
  type Row = {
    readonly id: string;
    readonly successor_daily_plan_id: string | null;
  };
  const row = db
    .prepare<[string, string], Row>(
      `SELECT id, successor_daily_plan_id
         FROM task_feedback
        WHERE plan_item_id = ? AND action = ?
        LIMIT 1`,
    )
    .get(planItemId, action);
  if (row === undefined) return null;
  return {
    feedbackId: row.id,
    successorDailyPlanId: row.successor_daily_plan_id,
  };
}

/**
 * Pure persistence step. The handler is exported for unit-testability
 * without going through the HTTP layer.
 */
export function applyFeedback(
  db: Database.Database,
  input: ApplyFeedbackInput,
): ApplyFeedbackResponse {
  const item = lookupPlanItem(db, input.planItemId, input.learnerId);
  if (item === null) {
    return { ok: false, error: "Plan item not found" };
  }

  const existing = findExistingFeedback(db, input.planItemId, input.action);
  if (existing !== null) {
    return {
      ok: true,
      feedbackId: existing.feedbackId,
      replayed: true,
      snapshotId: existing.successorDailyPlanId,
      revisionEventType: null,
    };
  }

  const activePlan = findActivePlan(db, input.learnerId);
  if (activePlan === null) {
    return { ok: false, error: "Learning plan not found" };
  }
  if (activePlan.id !== item.learning_plan_id) {
    return { ok: false, error: "Plan item belongs to a superseded plan" };
  }

  const currentSnapshot = findLatestDailySnapshot(db, activePlan.id);
  if (currentSnapshot === null) {
    return { ok: false, error: "Learning plan not found" };
  }

  const shouldResnapshot =
    input.action === "skipped"
    || (
      input.effortBoundaryMinutes !== undefined
      && input.effortBoundaryMinutes !== currentSnapshot.effortBoundaryMinutes
    );

  const revisionEventType: PlanRevisionEventType | null = input.action === "skipped"
    ? "item_skipped"
    : input.effortBoundaryMinutes !== undefined
    && input.effortBoundaryMinutes !== currentSnapshot.effortBoundaryMinutes
    ? "effort_changed"
    : null;

  const result = db.transaction((): ApplyFeedbackResponse => {
    // Re-check inside the transaction to handle concurrent requests.
    const concurrent = findExistingFeedback(db, input.planItemId, input.action);
    if (concurrent !== null) {
      return {
        ok: true,
        feedbackId: concurrent.feedbackId,
        replayed: true,
        snapshotId: concurrent.successorDailyPlanId,
        revisionEventType: null,
      };
    }

    let successorSnapshotId: string | null = null;
    if (shouldResnapshot && revisionEventType !== null) {
      const nextEffort: EffortBoundaryMinutes =
        input.effortBoundaryMinutes ?? currentSnapshot.effortBoundaryMinutes;
      const successor = createDailySnapshot(
        db,
        activePlan.id,
        currentSnapshot.localDate,
        nextEffort,
        currentSnapshot.dailyMode,
        currentSnapshot.generatorVersion,
        currentSnapshot.id,
      );
      successorSnapshotId = successor.id;
      recordRevisionEvent(
        db,
        currentSnapshot.id,
        successor.id,
        revisionEventType,
        `feedback:${input.action}:${input.planItemId}`,
      );
    }

    const feedback = appendFeedback(db, input.planItemId, input.action, {
      reasonCode: input.reasonCode ?? null,
      reasonText: input.reasonText,
      successorDailyPlanId: successorSnapshotId,
    });

    return {
      ok: true,
      feedbackId: feedback.id,
      replayed: false,
      snapshotId: successorSnapshotId,
      revisionEventType,
    };
  })();

  return result;
}