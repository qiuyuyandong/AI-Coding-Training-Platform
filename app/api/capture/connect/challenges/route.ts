import { NextResponse } from "next/server";
import { z } from "zod";

import { createCaptureConnectionChallenge } from "@/lib/services/captureConnectionChallenge";
import {
  CaptureRequestError,
  readBoundedJson,
  requireCanonicalLocalCaptureHost,
  requireSameOrigin,
} from "@/lib/http/captureRequest";

const EmptyRequestSchema = z.object({}).strict();

export async function POST(request: Request): Promise<NextResponse> {
  try {
    requireCanonicalLocalCaptureHost(request);
    requireSameOrigin(request);
    const parsed = EmptyRequestSchema.safeParse(await readBoundedJson(request, 1024));
    if (!parsed.success) {
      return NextResponse.json({ ok: false, error: "Invalid challenge request" }, { status: 400 });
    }
    return NextResponse.json({ ok: true, ...createCaptureConnectionChallenge() });
  } catch (error) {
    const status = error instanceof CaptureRequestError ? error.status : 500;
    return NextResponse.json({ ok: false, error: "Could not create capture challenge" }, { status });
  }
}
