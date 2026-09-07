import { NextResponse } from "next/server";
import { readActiveVault } from "@/lib/vault/localVault";
import { diagnoseVault } from "@/lib/vault/operations";

export async function GET(): Promise<Response> {
  try {
    const vault = readActiveVault();
    if (vault === null) return NextResponse.json({ ok: false, error: "No active Local Vault" }, { status: 404 });
    return NextResponse.json({ ok: true, diagnosis: diagnoseVault(vault) });
  } catch {
    return NextResponse.json({ ok: false, error: "Local Vault diagnosis failed" }, { status: 500 });
  }
}
