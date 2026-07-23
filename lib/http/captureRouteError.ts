import { NextResponse } from "next/server";
import {
  CaptureConflictError,
} from "@/lib/services/captureTransition";
import {
  CaptureCredentialAuthenticationError,
} from "@/lib/services/captureCredentials";
import { CanonicalProblemUrlError } from "@/lib/services/canonicalProblemUrl";
import {
  CaptureAttemptAck,
  CaptureAttemptAckSchema,
} from "@/lib/capture/attemptBundle";
import {
  CaptureRequestError,
} from "@/lib/http/captureRequest";

/**
 * Shared error mapping for the legacy `/api/capture/events` route and the
 * new atomic `/api/capture/attempts` route. The classification is identical
 * across both routes and is intentionally exhaustive so an unknown error
 * type never accidentally returns 200.
 */
export function captureRouteErrorResponse(error: unknown): NextResponse {
  if (error instanceof CaptureRequestError) {
    return NextResponse.json(
      { ok: false, error: error.message },
      { status: error.status },
    );
  }
  if (error instanceof CaptureCredentialAuthenticationError) {
    return NextResponse.json(
      { ok: false, error: error.message },
      { status: 401 },
    );
  }
  if (error instanceof CanonicalProblemUrlError) {
    return NextResponse.json(
      { ok: false, error: error.message },
      { status: 400 },
    );
  }
  if (error instanceof CaptureConflictError) {
    return NextResponse.json(
      { ok: false, error: error.message },
      { status: 409 },
    );
  }
  return NextResponse.json(
    {
      ok: false,
      error: error instanceof Error ? error.message : "Failed to save capture event",
    },
    { status: 500 },
  );
}

export function captureAttemptAckResponse(ack: CaptureAttemptAck): NextResponse {
  return NextResponse.json(CaptureAttemptAckSchema.parse(ack));
}
