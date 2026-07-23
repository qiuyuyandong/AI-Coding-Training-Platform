import { NextResponse } from "next/server";
import { CaptureEventSchema } from "@/lib/capture/events";
import { openDatabase } from "@/lib/db/client";
import { ingestCaptureEvent } from "@/lib/services/captureMaterializer";
import { normalizeCaptureEvent } from "@/lib/services/normalizeCaptureEvent";
import {
  authorizeCaptureInstallation,
  touchCaptureInstallation,
} from "@/lib/services/captureCredentials";
import {
  readBearerCredential,
  readBoundedJson,
  requireExtensionOrMissingOrigin,
} from "@/lib/http/captureRequest";
import { captureRouteErrorResponse } from "@/lib/http/captureRouteError";

export async function POST(request: Request): Promise<NextResponse> {
  try {
    requireExtensionOrMissingOrigin(request);
    const credential = readBearerCredential(request);
    const parsed = CaptureEventSchema.safeParse(await readBoundedJson(request));
    if (!parsed.success) {
      return NextResponse.json(
        { ok: false, error: "Invalid capture event", issues: parsed.error.issues },
        { status: 400 },
      );
    }

    const event = normalizeCaptureEvent(parsed.data);

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
    return captureRouteErrorResponse(error);
  }
}
