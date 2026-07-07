import { NextResponse } from "next/server";
import { z } from "zod";
import { openDatabase } from "@/lib/db/client";
import { updateAttemptReflection } from "@/lib/repositories/attempts";

const ReflectionBodySchema = z.object({
  reflection: z.string().trim().min(1).max(2000),
});

type RouteContext = {
  readonly params: Promise<{ readonly id: string }>;
};

export async function PATCH(request: Request, context: RouteContext) {
  const body = ReflectionBodySchema.safeParse(await readJsonBody(request));
  if (!body.success) {
    return NextResponse.json({ ok: false, error: "Reflection is required" }, { status: 400 });
  }

  const { id } = await context.params;
  const db = openDatabase();
  try {
    const attempt = updateAttemptReflection(db, {
      attemptId: id,
      reflection: body.data.reflection,
      now: new Date().toISOString(),
    });
    if (attempt === null) return NextResponse.json({ ok: false, error: "Attempt not found" }, { status: 404 });
    return NextResponse.json({ ok: true, attempt });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Failed to save reflection" },
      { status: 500 },
    );
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
