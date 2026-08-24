import { NextResponse } from "next/server";
import { z } from "zod";

import {
  CaptureConnectionChallengeError,
  completeCaptureConnectionChallenge,
} from "@/lib/services/captureConnectionChallenge";
import { CAPTURE_CAPABILITY_PATTERN } from "@/lib/services/captureCapability";
import {
  CaptureRequestError,
  captureExtensionCorsHeaders,
  readBoundedJson,
  requireCanonicalLocalCaptureHost,
  requireExactCaptureExtensionOrigin,
} from "@/lib/http/captureRequest";
import { rotateLocalCaptureInstallation } from "@/lib/vault/captureInstallation";

const CompletionSchema = z.object({
  schemaVersion: z.literal(1),
  challengeId: z.string().regex(/^challenge_[0-9a-f-]{36}$/u),
  nonce: z.string().regex(/^[A-Za-z0-9_-]{43}$/u),
  installationId: z.string().regex(
    /^installation_[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/u,
  ),
  capability: z.string().regex(CAPTURE_CAPABILITY_PATTERN),
}).strict();

export async function POST(request: Request): Promise<NextResponse> {
  try {
    requireCanonicalLocalCaptureHost(request);
    requireExactCaptureExtensionOrigin(request);
    const parsed = CompletionSchema.safeParse(await readBoundedJson(request, 4096));
    if (!parsed.success) {
      return withCors(NextResponse.json({ ok: false, error: "Invalid completion request" }, { status: 400 }));
    }
    const installation = completeCaptureConnectionChallenge(parsed.data, () => (
      rotateLocalCaptureInstallation({
        installationId: parsed.data.installationId,
        capability: parsed.data.capability,
      })
    ));
    return withCors(NextResponse.json({
      ok: true,
      credentialVersion: installation.credentialVersion,
    }, { status: 201 }));
  } catch (error) {
    const status = error instanceof CaptureRequestError
      ? error.status
      : error instanceof CaptureConnectionChallengeError
        ? error.reason === "expired" ? 410 : 409
        : 500;
    return withCors(NextResponse.json({ ok: false, error: "Capture connection failed" }, { status }));
  }
}

export function OPTIONS(request: Request): NextResponse {
  try {
    requireCanonicalLocalCaptureHost(request);
    requireExactCaptureExtensionOrigin(request);
    return new NextResponse(null, { status: 204, headers: captureExtensionCorsHeaders() });
  } catch {
    return new NextResponse(null, { status: 403 });
  }
}

function withCors(response: NextResponse): NextResponse {
  for (const [name, value] of Object.entries(captureExtensionCorsHeaders())) {
    response.headers.set(name, value);
  }
  return response;
}
