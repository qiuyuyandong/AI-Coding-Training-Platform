import { NextResponse } from "next/server";
import { z } from "zod";

import {
  CaptureRequestError,
  readBoundedJson,
  requireCanonicalLocalCaptureHost,
  requireSameOrigin,
} from "@/lib/http/captureRequest";
import { readCaptureConnectionState } from "@/lib/services/captureConnectionChallenge";

const StatusRequestSchema = z.object({
  challengeId: z.string().regex(/^challenge_[0-9a-f-]{36}$/u),
  nonce: z.string().regex(/^[A-Za-z0-9_-]{43}$/u),
}).strict();

export async function POST(request: Request): Promise<NextResponse> {
  try {
    requireCanonicalLocalCaptureHost(request);
    requireSameOrigin(request);
    const parsed = StatusRequestSchema.safeParse(await readBoundedJson(request, 2048));
    if (!parsed.success) {
      return NextResponse.json({ state: "failed" }, { status: 400 });
    }
    return NextResponse.json({ state: readCaptureConnectionState(parsed.data) });
  } catch (error) {
    const status = error instanceof CaptureRequestError ? error.status : 500;
    return NextResponse.json({ state: "failed" }, { status });
  }
}
