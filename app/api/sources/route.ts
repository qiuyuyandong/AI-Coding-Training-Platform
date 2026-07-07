import { NextResponse } from "next/server";
import { listSources } from "@/lib/sources/registry";

export async function GET() {
  return NextResponse.json({ ok: true, sources: listSources() });
}
