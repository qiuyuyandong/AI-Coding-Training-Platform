import { NextResponse } from "next/server";
import { z } from "zod";
import { openDatabase } from "@/lib/db/client";
import { LOCAL_DEFAULT_LEARNER_ID } from "@/lib/domain/learner";
import {
  CaptureRequestError,
  readBoundedJson,
  requireSameOrigin,
  statusForRangeError,
} from "@/lib/http/captureRequest";
import { appendLearnerAssessment } from "@/lib/repositories/learnerAssessments";
import { getOrCreateLocalProfile } from "@/lib/repositories/learnerProfiles";

const RequestSchema = z.object({
  nodeId: z.string().min(1).max(200),
  kind: z.enum(["self_rating", "dispute"]),
  rating: z.enum(["unassessed", "L1", "L2", "L3", "L4", "L5"]).nullable(),
  reason: z.string().trim().min(1).max(500).nullable(),
  abilityInputFingerprint: z.string().min(1).max(200).nullable(),
  idempotencyKey: z.string().min(1).max(200),
}).strict().superRefine((value, context) => {
  if (value.kind === "self_rating" && value.rating === null) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "Self-rating requires a level", path: ["rating"] });
  }
  if (value.kind === "dispute" && value.reason === null) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "A dispute requires a reason", path: ["reason"] });
  }
});

export async function POST(request: Request): Promise<Response> {
  try {
    requireSameOrigin(request);
    const parsed = RequestSchema.safeParse(await readBoundedJson(request));
    if (!parsed.success) {
      return NextResponse.json({ ok: false, error: "Invalid assessment", issues: parsed.error.issues }, { status: 400 });
    }
    const db = openDatabase();
    try {
      getOrCreateLocalProfile(db);
      const saved = appendLearnerAssessment(db, {
        learnerId: LOCAL_DEFAULT_LEARNER_ID,
        ...parsed.data,
        createdAt: new Date().toISOString(),
      });
      return NextResponse.json({ ok: true, ...saved });
    } finally {
      db.close();
    }
  } catch (error) {
    if (error instanceof CaptureRequestError) {
      return NextResponse.json({ ok: false, error: error.message }, { status: error.status });
    }
    if (error instanceof z.ZodError) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
    }
    if (error instanceof RangeError) {
      return NextResponse.json({ ok: false, error: error.message }, { status: statusForRangeError(error) });
    }
    return NextResponse.json({ ok: false, error: "Failed to save assessment" }, { status: 500 });
  }
}
