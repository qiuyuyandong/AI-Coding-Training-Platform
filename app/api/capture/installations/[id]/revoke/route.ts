import { NextResponse } from "next/server";
import { openDatabase } from "@/lib/db/client";
import {
  CaptureRequestError,
  readBoundedJson,
  requireSameOrigin,
} from "@/lib/http/captureRequest";
import {
  CaptureCredentialConflictError,
  revokeCaptureInstallation,
} from "@/lib/services/captureCredentials";

export async function POST(
  request: Request,
  context: { readonly params: Promise<{ readonly id: string }> },
) {
  try {
    requireSameOrigin(request);
    const body = await readBoundedJson(request);
    if (typeof body !== "object" || body === null || Object.keys(body).length !== 0) {
      return NextResponse.json(
        { ok: false, error: "Revocation request body must be empty JSON" },
        { status: 400 },
      );
    }
    const { id } = await context.params;
    const db = openDatabase();
    try {
      const installation = revokeCaptureInstallation(db, id);
      return NextResponse.json({
        ok: true,
        installationId: installation.installationId,
        status: installation.status,
        revokedAt: installation.revokedAt,
      });
    } finally {
      db.close();
    }
  } catch (error) {
    if (error instanceof CaptureRequestError) {
      return NextResponse.json({ ok: false, error: error.message }, { status: error.status });
    }
    if (error instanceof CaptureCredentialConflictError) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 404 });
    }
    return NextResponse.json({ ok: false, error: "Failed to revoke installation" }, { status: 500 });
  }
}
