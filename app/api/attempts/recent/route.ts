import { NextResponse } from "next/server";
import { openDatabase } from "@/lib/db/client";
import { PlatformSchema } from "@/lib/domain/source";
import {
  listAttempts,
  type AttemptProblemScope,
} from "@/lib/repositories/attempts";
import { CanonicalProblemUrlError } from "@/lib/services/canonicalProblemUrl";

export async function GET(request: Request) {
  const parsed = parseQuery(request);
  if (!parsed.ok) {
    return NextResponse.json(
      { ok: false, error: parsed.error, recentAttempts: [] },
      { status: 400 },
    );
  }
  const db = openDatabase();
  try {
    const recentAttempts = listAttempts(db, parsed.query);
    return NextResponse.json({ ok: true, recentAttempts });
  } catch (error) {
    const isInputError = error instanceof CanonicalProblemUrlError
      || error instanceof RangeError;
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Failed to read recent attempts", recentAttempts: [] },
      { status: isInputError ? 400 : 500 },
    );
  } finally {
    db.close();
  }
}

type ParsedQuery =
  | { readonly ok: true; readonly query: { readonly problem?: AttemptProblemScope; readonly limit: number } }
  | { readonly ok: false; readonly error: string };

function parseQuery(request: Request): ParsedQuery {
  const search = new URL(request.url).searchParams;
  const platformValue = search.get("platform");
  const externalId = search.get("externalId");
  if ((platformValue === null) !== (externalId === null)) {
    return { ok: false, error: "platform and externalId must be provided together" };
  }
  const limitValue = search.get("limit") ?? "10";
  if (!/^\d+$/u.test(limitValue)) {
    return { ok: false, error: "limit must be an integer" };
  }
  const limit = Number(limitValue);
  if (limit < 1 || limit > 100) {
    return { ok: false, error: "limit must be from 1 to 100" };
  }
  if (platformValue === null || externalId === null) {
    return { ok: true, query: { limit } };
  }
  const platform = PlatformSchema.safeParse(platformValue);
  if (!platform.success || externalId.trim().length === 0) {
    return { ok: false, error: "problem scope is invalid" };
  }
  return {
    ok: true,
    query: { problem: { platform: platform.data, externalId }, limit },
  };
}
