import { NextResponse } from "next/server";
import { openDatabase } from "@/lib/db/client";
import { CaptureAttemptBundleSchema } from "@/lib/capture/attemptBundle";
import { ingestCaptureAttemptBundle } from "@/lib/services/captureAttemptBundle";
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
import {
  captureAttemptAckResponse,
  captureRouteErrorResponse,
} from "@/lib/http/captureRouteError";

export async function POST(request: Request): Promise<NextResponse> {
  try {
    requireExtensionOrMissingOrigin(request);
    const credential = readBearerCredential(request);
    const parsedBody = CaptureAttemptBundleSchema.safeParse(await readBoundedJson(request));
    if (!parsedBody.success) {
      return NextResponse.json(
        {
          ok: false,
          error: "Invalid capture attempt bundle",
          issues: parsedBody.error.issues,
        },
        { status: 400 },
      );
    }
    const normalizedEvents = parsedBody.data.events.map(normalizeCaptureEvent);
    const bundle = CaptureAttemptBundleSchema.parse({
      ...parsedBody.data,
      events: normalizedEvents,
    });

    const db = openDatabase();
    try {
      const receivedAt = new Date().toISOString();
      const ack = db.transaction(() => {
        authorizeCaptureInstallation(
          db,
          credential,
          bundle.events[0].installationId,
        );
        const ingested = ingestCaptureAttemptBundle(db, bundle, {
          now: () => receivedAt,
        });
        touchCaptureInstallation(db, bundle.events[0].installationId, receivedAt);
        return ingested;
      })();
      return captureAttemptAckResponse(ack);
    } finally {
      db.close();
    }
  } catch (error) {
    return captureRouteErrorResponse(error);
  }
}
