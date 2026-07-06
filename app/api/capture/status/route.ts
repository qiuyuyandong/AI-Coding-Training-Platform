import { NextResponse } from "next/server";
import { openDatabase } from "@/lib/db/client";
import { listRecentCaptureEvents } from "@/lib/repositories/captureEvents";

export async function GET() {
  const db = openDatabase();
  try {
    const recentEvents = listRecentCaptureEvents(db, 10);
    return NextResponse.json({ ok: true, recentEvents });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Failed to read capture status", recentEvents: [] },
      { status: 500 },
    );
  } finally {
    db.close();
  }
}
