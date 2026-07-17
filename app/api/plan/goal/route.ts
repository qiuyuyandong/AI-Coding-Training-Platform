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
  getOrCreateLocalProfile,
  setInterestTracks,
  setPrimaryTrack,
} from "@/lib/repositories/learnerProfiles";

/**
 * `POST /api/plan/goal` — V0 learner goal update route.
 *
 * Body shape:
 *   { primaryTrackId?: string | null, interestTrackIds: string[] }
 *
 * Validation rules:
 *   - `primaryTrackId` is optional; when provided it must be a non-empty
 *     string or the explicit `null` value (the latter clears the primary).
 *   - `interestTrackIds` is required and must contain between 0 and 2
 *     distinct non-empty track slugs.
 *
 * The route persists the change via the V0 repositories
 * (`setPrimaryTrack`, `setInterestTracks`). Each field is independently
 * optional, so a caller may update only the primary track or only the
 * interest set. Errors from the repository (e.g. duplicate interests,
 * oversize list, malformed JSON) are translated to HTTP 400; any other
 * unexpected failure becomes HTTP 500 without leaking internals.
 */

const PrimaryTrackIdSchema = z
  .union([z.string().min(1), z.null()])
  .optional();

const GoalRequestSchema = z.object({
  primaryTrackId: PrimaryTrackIdSchema,
  interestTrackIds: z.array(z.string().min(1)).max(2),
});

export async function POST(request: Request) {
  try {
    requireSameOrigin(request);
    const parsed = GoalRequestSchema.safeParse(await readBoundedJson(request));
    if (!parsed.success) {
      return NextResponse.json(
        {
          ok: false,
          error: "Invalid goal request",
          issues: parsed.error.issues,
        },
        { status: 400 },
      );
    }
    const body = parsed.data;
    const db = openDatabase();
    try {
      getOrCreateLocalProfile(db);
      if (body.primaryTrackId !== undefined) {
        setPrimaryTrack(db, LOCAL_DEFAULT_LEARNER_ID, body.primaryTrackId);
      }
      const activeGoal = setInterestTracks(
        db,
        LOCAL_DEFAULT_LEARNER_ID,
        body.interestTrackIds,
      );
      return NextResponse.json(
        {
          ok: true,
          goal: {
            id: activeGoal.id,
            primaryTrackId: activeGoal.primaryTrackId,
            interestTrackIds: activeGoal.interestTrackIds,
            status: activeGoal.status,
            createdAt: activeGoal.createdAt,
          },
        },
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
      { ok: false, error: "Failed to persist goal update" },
      { status: 500 },
    );
  }
}