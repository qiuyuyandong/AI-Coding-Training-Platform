import { NextResponse } from "next/server";
import { openDatabase } from "@/lib/db/client";
import { listAttemptCorrections } from "@/lib/repositories/attemptCorrections";
import { findAttemptByIdIncludingVoided } from "@/lib/repositories/attempts";

type RouteContext = {
  readonly params: Promise<{ readonly id: string }>;
};

export async function GET(_request: Request, context: RouteContext) {
  const { id } = await context.params;
  const db = openDatabase();
  try {
    if (findAttemptByIdIncludingVoided(db, id) === null) {
      return NextResponse.json(
        { ok: false, error: "Attempt not found", corrections: [] },
        { status: 404 },
      );
    }
    return NextResponse.json({
      ok: true,
      corrections: listAttemptCorrections(db, id),
    });
  } catch {
    return NextResponse.json(
      { ok: false, error: "Failed to read attempt corrections", corrections: [] },
      { status: 500 },
    );
  } finally {
    db.close();
  }
}
