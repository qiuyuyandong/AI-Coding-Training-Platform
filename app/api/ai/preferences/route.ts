import { NextResponse } from "next/server";
import { z } from "zod";
import { openDatabase } from "@/lib/db/client";
import { LOCAL_DEFAULT_LEARNER_ID } from "@/lib/domain/learner";
import { getOrCreateLocalProfile } from "@/lib/repositories/learnerProfiles";
import { CaptureRequestError, readBoundedJson, requireSameOrigin } from "@/lib/http/captureRequest";
import { readAiPreference, saveAiPreference } from "@/lib/services/aiCoachService";

const PreferenceSchema = z.object({
  mode: z.enum(["disabled", "on_demand"]),
  allowedContext: z.array(z.enum(["evidence_summary", "code_snapshot"])).max(2),
}).strict();

export async function GET(): Promise<Response> {
  const db = openDatabase();
  try {
    getOrCreateLocalProfile(db);
    return NextResponse.json({ ok: true, preference: readAiPreference(db) });
  } finally {
    db.close();
  }
}

export async function POST(request: Request): Promise<Response> {
  try {
    requireSameOrigin(request);
    const parsed = PreferenceSchema.safeParse(await readBoundedJson(request));
    if (!parsed.success) return NextResponse.json({ ok: false, error: "Invalid AI preference", issues: parsed.error.issues }, { status: 400 });
    const db = openDatabase();
    try {
      getOrCreateLocalProfile(db);
      const preference = saveAiPreference(db, { learnerId: LOCAL_DEFAULT_LEARNER_ID, ...parsed.data, now: new Date().toISOString() });
      return NextResponse.json({ ok: true, preference });
    } finally {
      db.close();
    }
  } catch (error) {
    if (error instanceof CaptureRequestError) return NextResponse.json({ ok: false, error: error.message }, { status: error.status });
    return NextResponse.json({ ok: false, error: "Failed to save AI preference" }, { status: 500 });
  }
}
