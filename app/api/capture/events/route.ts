import { NextResponse } from "next/server";
import { CaptureEventSchema } from "@/lib/capture/events";
import { openDatabase } from "@/lib/db/client";
import { saveCaptureEvent } from "@/lib/repositories/captureEvents";

export async function POST(request: Request) {
  const body: unknown = await request.json();
  const event = CaptureEventSchema.parse(body);
  const db = openDatabase();
  try {
    saveCaptureEvent(db, event);
  } finally {
    db.close();
  }
  return NextResponse.json({ ok: true, eventId: event.id });
}
