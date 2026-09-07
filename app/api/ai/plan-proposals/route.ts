import { NextResponse } from "next/server";
import { z } from "zod";
import { openDatabase } from "@/lib/db/client";
import { getOrCreateLocalProfile } from "@/lib/repositories/learnerProfiles";
import { CaptureRequestError, readBoundedJson, requireSameOrigin } from "@/lib/http/captureRequest";
import { generatePlanChangeProposal } from "@/lib/services/aiCoachService";

const GenerateSchema = z.object({
  evidenceIds: z.array(z.string().min(1).max(200)).min(1).max(20),
  requestedContext: z.array(z.enum(["evidence_summary", "code_snapshot"])).max(2),
  requestKey: z.string().min(1).max(200),
}).strict();

export async function POST(request: Request): Promise<Response> {
  try {
    requireSameOrigin(request);
    const parsed = GenerateSchema.safeParse(await readBoundedJson(request));
    if (!parsed.success) return NextResponse.json({ ok: false, error: "Invalid AI proposal request", issues: parsed.error.issues }, { status: 400 });
    const db = openDatabase();
    try {
      getOrCreateLocalProfile(db);
      const result = await generatePlanChangeProposal(db, { ...parsed.data, now: new Date().toISOString() });
      return NextResponse.json({ ok: true, ...result });
    } finally {
      db.close();
    }
  } catch (error) {
    if (error instanceof CaptureRequestError) return NextResponse.json({ ok: false, error: error.message }, { status: error.status });
    if (error instanceof RangeError) return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
    return NextResponse.json({ ok: false, error: "Failed to generate AI proposal" }, { status: 500 });
  }
}
