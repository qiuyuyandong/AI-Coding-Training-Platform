import { NextResponse } from "next/server";
import { openDatabase } from "@/lib/db/client";
import { CaptureAttemptBundleSchema } from "@/lib/capture/attemptBundle";
import { ingestCaptureAttemptBundle } from "@/lib/services/captureAttemptBundle";
import { normalizeCaptureEvent } from "@/lib/services/normalizeCaptureEvent";
import {
  CaptureRequestError,
  captureExtensionCorsHeaders,
  readBearerCapability,
  readBoundedJson,
  requireCanonicalLocalCaptureHost,
  requireExactCaptureExtensionOrigin,
} from "@/lib/http/captureRequest";
import {
  captureAttemptAckResponse,
  captureRouteErrorResponse,
} from "@/lib/http/captureRouteError";
import {
  authorizeLocalCaptureCapability,
  CaptureCapabilityAuthenticationError,
  touchLocalCaptureInstallation,
} from "@/lib/vault/captureInstallation";

export async function POST(request: Request): Promise<NextResponse> {
  try {
    requireCanonicalLocalCaptureHost(request);
    requireExactCaptureExtensionOrigin(request);
    const capability = readBearerCapability(request);
    const installation = authorizeLocalCaptureCapability(capability);
    const parsedBody = CaptureAttemptBundleSchema.safeParse(await readBoundedJson(request));
    if (!parsedBody.success) {
      return captureRouteErrorResponse(new CaptureRequestError(
        400,
        "Invalid capture attempt bundle",
      ));
    }
    const normalizedEvents = parsedBody.data.events.map(normalizeCaptureEvent);
    const bundle = CaptureAttemptBundleSchema.parse({
      ...parsedBody.data,
      events: normalizedEvents,
    });
    if (
      bundle.events[0].installationId !== installation.installationId
      || bundle.events[0].provenanceLevel !== "extension_local"
    ) {
      throw new CaptureCapabilityAuthenticationError();
    }

    const receivedAt = new Date().toISOString();
    touchLocalCaptureInstallation(bundle.events[0].installationId, { now: () => receivedAt });
    const db = openDatabase();
    try {
      const ack = ingestCaptureAttemptBundle(db, bundle, { now: () => receivedAt });
      return captureAttemptAckResponse(ack);
    } finally {
      db.close();
    }
  } catch (error) {
    return captureRouteErrorResponse(error);
  }
}

export function OPTIONS(request: Request): NextResponse {
  try {
    requireCanonicalLocalCaptureHost(request);
    requireExactCaptureExtensionOrigin(request);
    return new NextResponse(null, { status: 204, headers: captureExtensionCorsHeaders() });
  } catch (error) {
    return captureRouteErrorResponse(error instanceof Error
      ? error
      : new CaptureRequestError(403, "Request origin is not allowed"));
  }
}
