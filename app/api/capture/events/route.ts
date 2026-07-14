import { NextResponse } from "next/server";
import { CaptureEventSchema } from "@/lib/capture/events";
import { openDatabase } from "@/lib/db/client";
import { ingestCaptureEvent } from "@/lib/services/captureMaterializer";
import { CaptureConflictError } from "@/lib/services/captureTransition";
import {
  CaptureRequestError,
  readBearerCredential,
  readBoundedJson,
  requireExtensionOrMissingOrigin,
} from "@/lib/http/captureRequest";
import {
  CaptureCredentialAuthenticationError,
  authorizeCaptureInstallation,
  touchCaptureInstallation,
} from "@/lib/services/captureCredentials";
import {
  CanonicalProblemUrlError,
  canonicalProblemUrl,
  normalizeProblemIdentity,
} from "@/lib/services/canonicalProblemUrl";

export async function POST(request: Request) {
  try {
    requireExtensionOrMissingOrigin(request);
    const credential = readBearerCredential(request);
    const parsed = CaptureEventSchema.safeParse(await readBoundedJson(request));

    if (!parsed.success) {
      return NextResponse.json({ ok: false, error: "Invalid capture event", issues: parsed.error.issues }, { status: 400 });
    }

    const identity = normalizeProblemIdentity({
      platform: parsed.data.platform,
      externalId: parsed.data.problemExternalId,
    });
    const event = CaptureEventSchema.parse({
      ...parsed.data,
      problemExternalId: identity.externalId,
      canonicalUrl: canonicalProblemUrl(identity, parsed.data.canonicalUrl),
    });

    const db = openDatabase();
    try {
      const receivedAt = new Date().toISOString();
      const result = db.transaction(() => {
        authorizeCaptureInstallation(db, credential, event.installationId);
        const ingested = ingestCaptureEvent(db, event, {
          now: () => receivedAt,
        });
        touchCaptureInstallation(db, event.installationId, receivedAt);
        return ingested;
      })();
      return NextResponse.json({ ok: true, ...result });
    } finally {
      db.close();
    }
  } catch (error) {
    if (error instanceof CaptureRequestError) {
      return NextResponse.json({ ok: false, error: error.message }, { status: error.status });
    }
    if (error instanceof CaptureCredentialAuthenticationError) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 401 });
    }
    if (error instanceof CanonicalProblemUrlError) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
    }
    if (error instanceof CaptureConflictError) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 409 });
    }
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Failed to save capture event" }, { status: 500 });
  }
}
