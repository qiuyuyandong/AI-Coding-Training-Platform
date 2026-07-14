import { NextResponse } from "next/server";
import { z } from "zod";
import { openDatabase } from "@/lib/db/client";
import {
  CaptureRequestError,
  readBoundedJson,
  requireSameOrigin,
} from "@/lib/http/captureRequest";
import {
  AttemptCorrectionRequestSchema,
  AttemptCorrectionValidationError,
  AttemptNotFoundError,
  AttemptRevisionConflictError,
  correctAttempt,
} from "@/lib/services/attemptCorrections";

type RouteContext = {
  readonly params: Promise<{ readonly id: string }>;
};

export async function PATCH(request: Request, context: RouteContext) {
  try {
    requireSameOrigin(request);
    const parsed = AttemptCorrectionRequestSchema.safeParse(
      await readBoundedJson(request),
    );
    if (!parsed.success) {
      return NextResponse.json(
        { ok: false, error: "Invalid attempt correction", issues: parsed.error.issues },
        { status: 400 },
      );
    }
    const { id } = await context.params;
    const db = openDatabase();
    try {
      const attempt = correctAttempt(db, id, parsed.data);
      return NextResponse.json({ ok: true, attempt });
    } finally {
      db.close();
    }
  } catch (error) {
    if (error instanceof CaptureRequestError) {
      return NextResponse.json({ ok: false, error: error.message }, { status: error.status });
    }
    if (error instanceof AttemptNotFoundError) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 404 });
    }
    if (error instanceof AttemptRevisionConflictError) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 409 });
    }
    if (error instanceof AttemptCorrectionValidationError || error instanceof z.ZodError) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
    }
    return NextResponse.json(
      { ok: false, error: "Failed to correct attempt" },
      { status: 500 },
    );
  }
}
