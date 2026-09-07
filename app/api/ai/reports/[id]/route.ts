import { NextResponse } from "next/server";
import { z } from "zod";
import { openDatabase } from "@/lib/db/client";
import { CaptureRequestError, requireSameOrigin } from "@/lib/http/captureRequest";
import { deleteCoachReport } from "@/lib/services/aiCoachService";

type RouteContext = { readonly params: Promise<{ readonly id: string }> };
const RouteIdSchema = z.string().min(1).max(200);

export async function DELETE(request: Request, context: RouteContext): Promise<Response> {
  try {
    requireSameOrigin(request);
    const id = RouteIdSchema.parse((await context.params).id);
    const db = openDatabase();
    try {
      const deleted = deleteCoachReport(db, { reportId: id, now: new Date().toISOString() });
      return deleted
        ? NextResponse.json({ ok: true })
        : NextResponse.json({ ok: false, error: "Report not found" }, { status: 404 });
    } finally {
      db.close();
    }
  } catch (error) {
    if (error instanceof CaptureRequestError) return NextResponse.json({ ok: false, error: error.message }, { status: error.status });
    if (error instanceof z.ZodError) return NextResponse.json({ ok: false, error: "Invalid report id" }, { status: 400 });
    return NextResponse.json({ ok: false, error: "Failed to delete AI report" }, { status: 500 });
  }
}
