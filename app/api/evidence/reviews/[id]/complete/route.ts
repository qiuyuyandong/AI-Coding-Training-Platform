import { NextResponse } from "next/server";
import { openDatabase } from "@/lib/db/client";
import { LOCAL_DEFAULT_LEARNER_ID } from "@/lib/domain/learner";
import { CaptureRequestError, requireSameOrigin, statusForRangeError } from "@/lib/http/captureRequest";
import { completeReview } from "@/lib/repositories/reviews";
import { z } from "zod";

type RouteContext = { readonly params: Promise<{ readonly id: string }> };
const RouteIdSchema = z.string().min(1).max(200);

export async function POST(request: Request, context: RouteContext): Promise<Response> {
  try {
    requireSameOrigin(request);
    const id = RouteIdSchema.parse((await context.params).id);
    const db = openDatabase();
    try {
      const completed = completeReview(db, LOCAL_DEFAULT_LEARNER_ID, id, new Date().toISOString());
      return NextResponse.json(
        completed === null ? { ok: false, error: "Review not found" } : { ok: true, ...completed },
        { status: completed === null ? 404 : 200 },
      );
    } finally {
      db.close();
    }
  } catch (error) {
    if (error instanceof CaptureRequestError) {
      return NextResponse.json({ ok: false, error: error.message }, { status: error.status });
    }
    if (error instanceof z.ZodError) return NextResponse.json({ ok: false, error: "Invalid review id" }, { status: 400 });
    if (error instanceof RangeError) {
      return NextResponse.json({ ok: false, error: error.message }, { status: statusForRangeError(error) });
    }
    return NextResponse.json({ ok: false, error: "Failed to complete review" }, { status: 500 });
  }
}
