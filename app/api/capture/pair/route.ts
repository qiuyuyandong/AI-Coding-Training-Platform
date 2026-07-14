import { NextResponse } from "next/server";
import { z } from "zod";
import { openDatabase } from "@/lib/db/client";
import {
  CaptureRequestError,
  readBoundedJson,
  requireExtensionOrMissingOrigin,
} from "@/lib/http/captureRequest";
import {
  CaptureCredentialAuthenticationError,
  CaptureCredentialConflictError,
  pairCaptureInstallation,
} from "@/lib/services/captureCredentials";

const PairRequestSchema = z.object({
  code: z.string().min(1),
  installationId: z.string().min(1),
}).strict();

export async function POST(request: Request) {
  try {
    requireExtensionOrMissingOrigin(request);
    const parsed = PairRequestSchema.safeParse(await readBoundedJson(request));
    if (!parsed.success) {
      return NextResponse.json(
        { ok: false, error: "Invalid pairing request", issues: parsed.error.issues },
        { status: 400 },
      );
    }

    const db = openDatabase();
    try {
      const result = pairCaptureInstallation(db, parsed.data);
      return NextResponse.json({
        ok: true,
        credential: result.credential,
        installationId: result.installation.installationId,
        credentialVersion: result.installation.credentialVersion,
      });
    } finally {
      db.close();
    }
  } catch (error) {
    if (
      error instanceof CaptureRequestError
      || error instanceof CaptureCredentialAuthenticationError
    ) {
      const status = error instanceof CaptureRequestError ? error.status : 401;
      return NextResponse.json({ ok: false, error: error.message }, { status });
    }
    if (error instanceof CaptureCredentialConflictError) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 409 });
    }
    return NextResponse.json({ ok: false, error: "Failed to pair extension" }, { status: 500 });
  }
}
