import { CapturePairingSettings } from "./CapturePairingSettings";
import { openDatabase } from "@/lib/db/client";
import { listCaptureInstallations } from "@/lib/repositories/captureInstallations";

export const dynamic = "force-dynamic";

export default function SettingsPage() {
  const db = openDatabase();
  try {
    const installations = listCaptureInstallations(db).map((installation) => ({
      installationId: installation.installationId,
      credentialVersion: installation.credentialVersion,
      status: installation.status,
      createdAt: installation.createdAt,
      rotatedAt: installation.rotatedAt,
      revokedAt: installation.revokedAt,
      lastSeenAt: installation.lastSeenAt,
    }));
    return (
      <main className="mx-auto max-w-4xl px-6 py-10">
        <p className="text-xs uppercase tracking-wide text-slate-500">Local security</p>
        <h1 className="mt-2 text-3xl font-semibold">Capture pairing</h1>
        <p className="mt-3 max-w-2xl text-slate-600">
          Pair, rotate, or revoke Chrome extension installations that can write local capture events.
          Installation IDs identify a logical extension only; the separate credential authorizes writes.
        </p>
        <CapturePairingSettings installations={installations} />
      </main>
    );
  } finally {
    db.close();
  }
}
