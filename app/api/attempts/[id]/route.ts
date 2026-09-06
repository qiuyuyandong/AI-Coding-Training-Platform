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
} from "@/lib/services/attemptCorrections";
import { correctAttemptWithReprojection } from "@/lib/services/abilityReprojection";
import { replayAttemptEvidence } from "@/lib/services/attemptEvidence";
import { LOCAL_DEFAULT_LEARNER_ID } from "@/lib/domain/learner";
import { getOrCreateLocalProfile } from "@/lib/repositories/learnerProfiles";
import { replayEvidenceAbility } from "@/lib/services/evidenceAbilityReplay";

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
      getOrCreateLocalProfile(db);
      const attempt = await correctAttemptWithReprojection(db, id, parsed.data);
      replayAttemptEvidence(db, LOCAL_DEFAULT_LEARNER_ID, id);
      replayEvidenceAbility(db, LOCAL_DEFAULT_LEARNER_ID, new Date().toISOString());
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
