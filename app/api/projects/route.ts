import { NextResponse } from "next/server";
import { z } from "zod";
import { openDatabase } from "@/lib/db/client";
import { LOCAL_DEFAULT_LEARNER_ID } from "@/lib/domain/learner";
import {
  CaptureRequestError,
  readBoundedJson,
  requireSameOrigin,
  statusForRangeError,
} from "@/lib/http/captureRequest";
import { getOrCreateLocalProfile } from "@/lib/repositories/learnerProfiles";
import { listLearnerProjects } from "@/lib/repositories/projectPractice";
import { startDefaultProject } from "@/lib/services/projectEvidence";

const StartProjectSchema = z.object({
  action: z.literal("start"),
  captureMode: z.enum(["full", "basic", "minimal"]),
  toolchainLabel: z.string().trim().min(1).max(100).optional(),
}).strict();

export function GET(): Response {
  const db = openDatabase();
  try {
    getOrCreateLocalProfile(db);
    return NextResponse.json({
      ok: true,
      projects: listLearnerProjects(db, LOCAL_DEFAULT_LEARNER_ID),
    });
  } finally {
    db.close();
  }
}

export async function POST(request: Request): Promise<Response> {
  try {
    requireSameOrigin(request);
    const body = StartProjectSchema.safeParse(await readBoundedJson(request));
    if (!body.success) return NextResponse.json({ ok: false, error: "Invalid project request", issues: body.error.issues }, { status: 400 });
    const db = openDatabase();
    try {
      getOrCreateLocalProfile(db);
      const started = startDefaultProject(db, {
        captureMode: body.data.captureMode,
        toolchainLabel: body.data.toolchainLabel,
        now: new Date().toISOString(),
      });
      return NextResponse.json({ ok: true, ...started }, { status: started.replayed ? 200 : 201 });
    } finally {
      db.close();
    }
  } catch (error) {
    return projectErrorResponse(error, "Failed to start project");
  }
}

function projectErrorResponse(error: unknown, fallback: string): Response {
  if (error instanceof CaptureRequestError) return NextResponse.json({ ok: false, error: error.message }, { status: error.status });
  if (error instanceof z.ZodError) return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
  if (error instanceof RangeError) return NextResponse.json({ ok: false, error: error.message }, { status: statusForRangeError(error) });
  return NextResponse.json({ ok: false, error: fallback }, { status: 500 });
}
