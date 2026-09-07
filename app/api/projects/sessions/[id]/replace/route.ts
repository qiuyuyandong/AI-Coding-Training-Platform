import { NextResponse } from "next/server";
import { z } from "zod";
import { openDatabase } from "@/lib/db/client";
import { CaptureRequestError, readBoundedJson, requireSameOrigin, statusForRangeError } from "@/lib/http/captureRequest";
import { replaceActiveProjectSession } from "@/lib/repositories/projectPractice";

const RequestSchema = z.object({ reason: z.string().trim().min(1).max(500) }).strict();
type RouteContext = { readonly params: Promise<{ readonly id: string }> };
const RouteIdSchema = z.string().min(1).max(200);

export async function POST(request: Request, context: RouteContext): Promise<Response> {
  try {
    requireSameOrigin(request);
    const parsed = RequestSchema.safeParse(await readBoundedJson(request));
    if (!parsed.success) return NextResponse.json({ ok: false, error: "Invalid replacement request", issues: parsed.error.issues }, { status: 400 });
    const id = RouteIdSchema.parse((await context.params).id);
    const db = openDatabase();
    try {
      const replacement = replaceActiveProjectSession(db, { projectSessionId: id, reason: parsed.data.reason, now: new Date().toISOString() });
      return NextResponse.json({ ok: true, ...replacement });
    } finally {
      db.close();
    }
  } catch (error) {
    if (error instanceof CaptureRequestError) return NextResponse.json({ ok: false, error: error.message }, { status: error.status });
    if (error instanceof z.ZodError) return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
    if (error instanceof RangeError) return NextResponse.json({ ok: false, error: error.message }, { status: statusForRangeError(error) });
    return NextResponse.json({ ok: false, error: "Failed to replace project session" }, { status: 500 });
  }
}
