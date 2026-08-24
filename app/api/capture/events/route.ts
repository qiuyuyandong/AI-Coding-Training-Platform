import { NextResponse } from "next/server";
import { CaptureEventSchema } from "@/lib/capture/events";
import { openDatabase } from "@/lib/db/client";
import { ingestCaptureEvent } from "@/lib/services/captureMaterializer";
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
  captureRouteErrorResponse,
  withCaptureExtensionCors,
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
    const parsed = CaptureEventSchema.safeParse(await readBoundedJson(request));
    if (!parsed.success) {
      return captureRouteErrorResponse(new CaptureRequestError(400, "Invalid capture event"));
    }

    const event = normalizeCaptureEvent(parsed.data);
    if (
      event.installationId !== installation.installationId
      || event.provenanceLevel !== "extension_local"
    ) {
      throw new CaptureCapabilityAuthenticationError();
    }

    const receivedAt = new Date().toISOString();
    touchLocalCaptureInstallation(event.installationId, { now: () => receivedAt });
    const db = openDatabase();
    try {
      const result = ingestCaptureEvent(db, event, { now: () => receivedAt });
      return withCaptureExtensionCors(NextResponse.json({ ok: true, ...result }));
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
