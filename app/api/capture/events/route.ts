import { NextResponse } from "next/server";
import { CaptureEventSchema } from "@/lib/capture/events";
import { openDatabase } from "@/lib/db/client";
import { saveCaptureEvent } from "@/lib/repositories/captureEvents";

export async function POST(request: Request) {
  const body = await readJsonBody(request);
  const parsed = CaptureEventSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "Invalid capture event", issues: parsed.error.issues }, { status: 400 });
  }

  const db = openDatabase();
  try {
    saveCaptureEvent(db, parsed.data);
    return NextResponse.json({ ok: true, eventId: parsed.data.id });
  } catch (error) {
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
