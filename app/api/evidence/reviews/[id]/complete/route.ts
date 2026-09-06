import { NextResponse } from "next/server";
import { openDatabase } from "@/lib/db/client";
import { CaptureRequestError, requireSameOrigin } from "@/lib/http/captureRequest";
import { completeReview } from "@/lib/repositories/reviews";

type RouteContext = { readonly params: Promise<{ readonly id: string }> };

export async function POST(request: Request, context: RouteContext): Promise<Response> {
  try {
    requireSameOrigin(request);
    const { id } = await context.params;
    const db = openDatabase();
    try {
      const completed = completeReview(db, id, new Date().toISOString());
      return NextResponse.json(
        completed ? { ok: true } : { ok: false, error: "Open review not found" },
        { status: completed ? 200 : 404 },
      );
    } finally {
      db.close();
    }
  } catch (error) {
    if (error instanceof CaptureRequestError) {
      return NextResponse.json({ ok: false, error: error.message }, { status: error.status });
    }
    return NextResponse.json({ ok: false, error: "Failed to complete review" }, { status: 500 });
  }
}
