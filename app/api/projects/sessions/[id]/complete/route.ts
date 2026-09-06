import { NextResponse } from "next/server";
import { z } from "zod";
import { openDatabase } from "@/lib/db/client";
import {
  CaptureRequestError,
  readBoundedJson,
  requireSameOrigin,
} from "@/lib/http/captureRequest";
import { completeProjectSessionEvidence } from "@/lib/services/projectEvidence";

const CompleteSchema = z.object({
  usedAssistance: z.boolean().nullable(),
  reflection: z.string().trim().min(1).max(2000).optional(),
  rubricScores: z.object({
    function: z.number().int().min(0).max(3),
    design: z.number().int().min(0).max(3),
    testing: z.number().int().min(0).max(3),
    integration: z.number().int().min(0).max(3),
    maintainability: z.number().int().min(0).max(3),
    robustness: z.number().int().min(0).max(3),
    explanation: z.number().int().min(0).max(3),
    transfer: z.number().int().min(0).max(3),
  }).strict(),
}).strict();
type RouteContext = { readonly params: Promise<{ readonly id: string }> };

export async function POST(request: Request, context: RouteContext): Promise<Response> {
  try {
    requireSameOrigin(request);
    const parsed = CompleteSchema.safeParse(await readBoundedJson(request));
    if (!parsed.success) return NextResponse.json({ ok: false, error: "Invalid project completion request", issues: parsed.error.issues }, { status: 400 });
    const { id } = await context.params;
    const db = openDatabase();
    try {
      const result = completeProjectSessionEvidence(db, {
        sessionId: id,
        usedAssistance: parsed.data.usedAssistance,
        rubricScores: parsed.data.rubricScores,
        reflection: parsed.data.reflection,
        now: new Date().toISOString(),
      });
      return NextResponse.json({ ok: true, ...result });
    } finally {
      db.close();
    }
  } catch (error) {
    if (error instanceof CaptureRequestError) return NextResponse.json({ ok: false, error: error.message }, { status: error.status });
    if (error instanceof z.ZodError || error instanceof RangeError) return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
    return NextResponse.json({ ok: false, error: "Failed to complete project session" }, { status: 500 });
  }
}
