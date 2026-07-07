import { NextResponse } from "next/server";
import { openDatabase } from "@/lib/db/client";
import { listProblems } from "@/lib/repositories/problems";

export async function GET() {
  const db = openDatabase();
  try {
    return NextResponse.json({ ok: true, problems: listProblems(db) });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Failed to read problems", problems: [] },
      { status: 500 },
    );
  } finally {
    db.close();
  }
}
