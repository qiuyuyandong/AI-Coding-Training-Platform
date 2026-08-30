import { NextResponse } from "next/server";
import {
  CaptureRequestError,
  captureExtensionCorsHeaders,
  readBearerCapability,
  requireCanonicalLocalCaptureHost,
  requireExactCaptureExtensionOrigin,
} from "@/lib/http/captureRequest";
import {
  captureRouteErrorResponse,
  withCaptureExtensionCors,
} from "@/lib/http/captureRouteError";
import { authorizeLocalCaptureCapability } from "@/lib/vault/captureInstallation";

export async function GET(request: Request): Promise<NextResponse> {
  try {
    requireCanonicalLocalCaptureHost(request);
    if (request.headers.has("origin")) requireExactCaptureExtensionOrigin(request);
    authorizeLocalCaptureCapability(readBearerCapability(request));
    return withCaptureExtensionCors(NextResponse.json({
      schemaVersion: 1,
      connection: "connected",
      service: "ready",
    }));
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
