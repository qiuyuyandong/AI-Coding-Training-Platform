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
  applyStartingNodeOverride,
  type OverrideResult,
} from "@/lib/services/diagnosticAssessment";

/**
 * `POST /api/plan/override-start` — V0 learner starting-node override.
 *
 * Body shape:
 *   { nodeId: string }
 *
 * The endpoint delegates to
 * `lib/services/diagnosticAssessment.applyStartingNodeOverride`, which
 * upserts `ready / low / manual_override` baselines for every strict
 * prerequisite of `nodeId` and a single `needs_foundation / medium /
 * manual_override` baseline for the target node. The returned baselines
 * are surfaced so the client can render the resulting node state and
 * explain the override in plain language.
 *
 * Validation errors (empty / unknown / draft `nodeId`) translate to
 * HTTP 400 with no DB write. Same-origin + bounded JSON + 500 fallback
 * mirror the rest of the V0 API surface.
 */

const OverrideRequestSchema = z.object({
  nodeId: z.string().min(1),
});

export async function POST(request: Request) {
  try {
    requireSameOrigin(request);
    const parsed = OverrideRequestSchema.safeParse(
      await readBoundedJson(request),
    );
    if (!parsed.success) {
      return NextResponse.json(
        {
          ok: false,
          error: "Invalid override-start request",
          issues: parsed.error.issues,
        },
        { status: 400 },
      );
    }
    const body = parsed.data;
    const db = openDatabase();
    try {
      const result: OverrideResult = applyStartingNodeOverride(
        db,
        LOCAL_DEFAULT_LEARNER_ID,
        body.nodeId,
      );
      return NextResponse.json(
        { ok: true, baselines: result.baselines },
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
      { ok: false, error: "Failed to apply starting-node override" },
      { status: 500 },
    );
  }
}