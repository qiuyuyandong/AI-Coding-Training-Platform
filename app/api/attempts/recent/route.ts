import { NextResponse } from "next/server";
import { openDatabase } from "@/lib/db/client";
import { listRecentAttempts } from "@/lib/repositories/attempts";

export async function GET() {
  const db = openDatabase();
  try {
    const recentAttempts = listRecentAttempts(db, 10);
    return NextResponse.json({ ok: true, recentAttempts });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Failed to read recent attempts", recentAttempts: [] },
      { status: 500 },
    );
  } finally {
    db.close();
  }
}
