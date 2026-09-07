import { NextResponse } from "next/server";
import { z } from "zod";
import { openDatabase } from "@/lib/db/client";
import { CaptureRequestError, readBoundedJson, requireSameOrigin } from "@/lib/http/captureRequest";
import { getOrCreateLocalProfile } from "@/lib/repositories/learnerProfiles";
import { buildFeedbackBundle } from "@/lib/services/pilotSupport";
import { readActiveVault } from "@/lib/vault/localVault";
import { diagnoseVault } from "@/lib/vault/operations";

const FeedbackSchema = z.object({
  categories: z.array(z.enum(["vault_health", "feature_counts", "schema"])).min(1).max(3),
}).strict();

export async function POST(request: Request): Promise<Response> {
  try {
    requireSameOrigin(request);
    const parsed = FeedbackSchema.safeParse(await readBoundedJson(request));
    if (!parsed.success) return NextResponse.json({ ok: false, error: "Invalid feedback selection", issues: parsed.error.issues }, { status: 400 });
    const vault = readActiveVault();
    if (vault === null) return NextResponse.json({ ok: false, error: "No active Local Vault" }, { status: 404 });
    const db = openDatabase();
    try {
      getOrCreateLocalProfile(db);
      const bundle = buildFeedbackBundle(db, { categories: parsed.data.categories, diagnosis: diagnoseVault(vault), now: new Date().toISOString() });
      return NextResponse.json({ ok: true, bundle });
    } finally {
      db.close();
    }
  } catch (error) {
    if (error instanceof CaptureRequestError) return NextResponse.json({ ok: false, error: error.message }, { status: error.status });
    if (error instanceof RangeError) return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
    return NextResponse.json({ ok: false, error: "Failed to create feedback preview" }, { status: 500 });
  }
}
