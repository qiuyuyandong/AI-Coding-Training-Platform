import { NextResponse } from "next/server";
import { z } from "zod";
import { openDatabase } from "@/lib/db/client";
import {
  CaptureRequestError,
  readBoundedJson,
  requireSameOrigin,
} from "@/lib/http/captureRequest";
import {
  ManualAttemptInputSchema,
  createManualAttempt,
} from "@/lib/services/manualAttempts";
import { CanonicalProblemUrlError } from "@/lib/services/canonicalProblemUrl";

export async function POST(request: Request) {
  try {
    requireSameOrigin(request);
    const parsed = ManualAttemptInputSchema.safeParse(
      await readBoundedJson(request),
    );
    if (!parsed.success) {
      return NextResponse.json(
        { ok: false, error: "Invalid manual attempt", issues: parsed.error.issues },
        { status: 400 },
      );
    }

    const db = openDatabase();
    try {
      const attempt = createManualAttempt(db, parsed.data);
      return NextResponse.json({ ok: true, attempt }, { status: 201 });
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
    if (error instanceof CanonicalProblemUrlError || error instanceof z.ZodError) {
      return NextResponse.json(
        { ok: false, error: error.message },
        { status: 400 },
      );
    }
    return NextResponse.json(
      { ok: false, error: "Failed to create manual attempt" },
      { status: 500 },
    );
  }
}
