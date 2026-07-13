import { NextResponse } from "next/server";
import { CaptureEventSchema } from "@/lib/capture/events";
import { openDatabase } from "@/lib/db/client";
import { ingestCaptureEvent } from "@/lib/services/captureMaterializer";
import { CaptureConflictError } from "@/lib/services/captureTransition";

export async function POST(request: Request) {
  const body = await readJsonBody(request);
  const parsed = CaptureEventSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "Invalid capture event", issues: parsed.error.issues }, { status: 400 });
  }

  const db = openDatabase();
  try {
    const result = ingestCaptureEvent(db, parsed.data);
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    if (error instanceof CaptureConflictError) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 409 });
    }
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Failed to save capture event" }, { status: 500 });
  } finally {
    db.close();
  }
}

async function readJsonBody(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch (error) {
    if (error instanceof SyntaxError || error instanceof TypeError) return undefined;
    throw error;
  }
}
