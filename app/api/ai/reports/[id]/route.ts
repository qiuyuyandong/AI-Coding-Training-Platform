import { NextResponse } from "next/server";
import { openDatabase } from "@/lib/db/client";
import { CaptureRequestError, requireSameOrigin } from "@/lib/http/captureRequest";
import { deleteCoachReport } from "@/lib/services/aiCoachService";

type RouteContext = { readonly params: Promise<{ readonly id: string }> };

export async function DELETE(request: Request, context: RouteContext): Promise<Response> {
  try {
    requireSameOrigin(request);
    const { id } = await context.params;
    if (id.length === 0) return NextResponse.json({ ok: false, error: "Report id is required" }, { status: 400 });
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
    return NextResponse.json({ ok: false, error: "Failed to delete AI report" }, { status: 500 });
  }
}
