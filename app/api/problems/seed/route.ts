import { NextResponse } from "next/server";
import { openDatabase } from "@/lib/db/client";
import { seedDatabase } from "@/lib/db/seed";
import { listProblems } from "@/lib/repositories/problems";

export async function POST() {
  const db = openDatabase();
  try {
    seedDatabase(db);
    return NextResponse.json({ ok: true, count: listProblems(db).length });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Failed to seed problems", count: 0 },
      { status: 500 },
    );
  } finally {
    db.close();
  }
}
