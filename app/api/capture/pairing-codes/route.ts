import { NextResponse } from "next/server";
import { z } from "zod";
import { openDatabase } from "@/lib/db/client";
import {
  CaptureRequestError,
  readBoundedJson,
  requireSameOrigin,
} from "@/lib/http/captureRequest";
import {
  CaptureCredentialConflictError,
  issueCapturePairingCode,
} from "@/lib/services/captureCredentials";

const PairingCodeRequestSchema = z.object({
  targetInstallationId: z.string().min(1).optional(),
}).strict();

export async function POST(request: Request) {
  try {
    requireSameOrigin(request);
    const parsed = PairingCodeRequestSchema.safeParse(await readBoundedJson(request));
    if (!parsed.success) {
      return NextResponse.json(
        { ok: false, error: "Invalid pairing-code request", issues: parsed.error.issues },
        { status: 400 },
      );
    }

    const db = openDatabase();
    try {
      const result = issueCapturePairingCode(
        db,
        parsed.data.targetInstallationId,
      );
      return NextResponse.json({ ok: true, ...result });
    } finally {
      db.close();
    }
  } catch (error) {
    if (error instanceof CaptureRequestError) {
      return NextResponse.json({ ok: false, error: error.message }, { status: error.status });
    }
    if (error instanceof CaptureCredentialConflictError) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 409 });
    }
    return NextResponse.json({ ok: false, error: "Failed to create pairing code" }, { status: 500 });
  }
}
