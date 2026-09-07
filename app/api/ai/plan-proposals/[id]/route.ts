import { NextResponse } from "next/server";
import { z } from "zod";
import { openDatabase } from "@/lib/db/client";
import { CaptureRequestError, readBoundedJson, requireSameOrigin } from "@/lib/http/captureRequest";
import { decidePlanChangeProposal } from "@/lib/services/aiCoachService";

const DecisionSchema = z.object({ decision: z.enum(["accept", "reject"]) }).strict();
type RouteContext = { readonly params: Promise<{ readonly id: string }> };

export async function POST(request: Request, context: RouteContext): Promise<Response> {
  try {
    requireSameOrigin(request);
    const parsed = DecisionSchema.safeParse(await readBoundedJson(request));
    if (!parsed.success) return NextResponse.json({ ok: false, error: "Invalid AI proposal decision", issues: parsed.error.issues }, { status: 400 });
    const { id } = await context.params;
    const db = openDatabase();
    try {
      const result = decidePlanChangeProposal(db, { proposalId: id, decision: parsed.data.decision, now: new Date().toISOString() });
      return NextResponse.json({ ok: true, ...result });
    } finally {
      db.close();
    }
  } catch (error) {
    if (error instanceof CaptureRequestError) return NextResponse.json({ ok: false, error: error.message }, { status: error.status });
    if (error instanceof RangeError) return NextResponse.json({ ok: false, error: error.message }, { status: error.message.includes("not found") ? 404 : 409 });
    return NextResponse.json({ ok: false, error: "Failed to decide AI proposal" }, { status: 500 });
  }
}
