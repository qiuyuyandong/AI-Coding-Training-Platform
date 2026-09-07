import { NextResponse } from "next/server";
import { z } from "zod";
import { openDatabase } from "@/lib/db/client";
import { CaptureRequestError, readBoundedJson, requireSameOrigin } from "@/lib/http/captureRequest";
import { getOrCreateLocalProfile } from "@/lib/repositories/learnerProfiles";
import { saveMetricsEnabled } from "@/lib/services/pilotSupport";

const PreferenceSchema = z.object({ metricsEnabled: z.boolean() }).strict();

export async function POST(request: Request): Promise<Response> {
  try {
    requireSameOrigin(request);
    const parsed = PreferenceSchema.safeParse(await readBoundedJson(request));
    if (!parsed.success) return NextResponse.json({ ok: false, error: "Invalid support preference", issues: parsed.error.issues }, { status: 400 });
    const db = openDatabase();
    try {
      getOrCreateLocalProfile(db);
      const metricsEnabled = saveMetricsEnabled(db, parsed.data.metricsEnabled, new Date().toISOString());
      return NextResponse.json({ ok: true, metricsEnabled });
    } finally {
      db.close();
    }
  } catch (error) {
    if (error instanceof CaptureRequestError) return NextResponse.json({ ok: false, error: error.message }, { status: error.status });
    return NextResponse.json({ ok: false, error: "Failed to save support preference" }, { status: 500 });
  }
}
