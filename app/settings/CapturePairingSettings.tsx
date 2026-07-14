"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export type CaptureInstallationSummary = {
  readonly installationId: string;
  readonly credentialVersion: number;
  readonly status: "active" | "revoked";
  readonly createdAt: string;
  readonly rotatedAt?: string;
  readonly revokedAt?: string;
  readonly lastSeenAt?: string;
};

type PairingCodeView = {
  readonly code: string;
  readonly expiresAt: string;
  readonly targetInstallationId?: string;
};

export function CapturePairingSettings({
  installations,
}: {
  readonly installations: readonly CaptureInstallationSummary[];
}) {
  const router = useRouter();
  const [pairingCode, setPairingCode] = useState<PairingCodeView>();
  const [status, setStatus] = useState("Ready");
  const [busy, setBusy] = useState(false);

  async function issueCode(targetInstallationId?: string): Promise<void> {
    setBusy(true);
    setStatus("Creating one-time code…");
    try {
      const response = await fetch("/api/capture/pairing-codes", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(
          targetInstallationId === undefined ? {} : { targetInstallationId },
        ),
      });
      const body: unknown = await response.json();
      if (!response.ok) throw new Error(readApiError(body));
      if (!isPairingCodeResponse(body)) {
        throw new Error("Pairing-code response was invalid");
      }
      setPairingCode({
        code: body.code,
        expiresAt: body.expiresAt,
        targetInstallationId,
      });
      setStatus(targetInstallationId === undefined
        ? "New-installation code created"
        : `Rotation code created for ${targetInstallationId}`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Failed to create code");
    } finally {
      setBusy(false);
    }
  }

  async function revoke(installationId: string): Promise<void> {
    setBusy(true);
    setStatus(`Revoking ${installationId}…`);
    try {
      const response = await fetch(
        `/api/capture/installations/${encodeURIComponent(installationId)}/revoke`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: "{}",
        },
      );
      const body: unknown = await response.json();
      if (!response.ok) throw new Error(readApiError(body));
      setStatus(`${installationId} revoked`);
      router.refresh();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Failed to revoke installation");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-8 space-y-6">
      <section className="rounded-xl border border-slate-200 bg-white p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold">Pair a new installation</h2>
            <p className="mt-1 max-w-2xl text-sm text-slate-600">
              Create a ten-minute, one-time code, then paste it into the extension popup.
            </p>
          </div>
          <button
            className="rounded-md bg-slate-900 px-3 py-2 text-sm text-white disabled:opacity-50"
            disabled={busy}
            onClick={() => void issueCode()}
            type="button"
          >
            Create pairing code
          </button>
        </div>
        {pairingCode !== undefined ? (
          <div className="mt-4 rounded-lg bg-slate-100 p-4" data-testid="pairing-code-panel">
            <p className="text-xs uppercase tracking-wide text-slate-500">
              {pairingCode.targetInstallationId === undefined
                ? "New installation"
                : `Rotate ${pairingCode.targetInstallationId}`}
            </p>
            <code className="mt-2 block break-all text-sm font-semibold" data-testid="pairing-code">
              {pairingCode.code}
            </code>
            <p className="mt-2 text-xs text-slate-500">Expires {pairingCode.expiresAt}</p>
          </div>
        ) : null}
        <p className="mt-3 text-sm text-slate-600" role="status">{status}</p>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-5">
        <h2 className="text-lg font-semibold">Paired installations</h2>
        {installations.length === 0 ? (
          <p className="mt-3 text-sm text-slate-600">No extension is paired yet.</p>
        ) : (
          <ul className="mt-4 space-y-3">
            {installations.map((installation) => (
              <li
                className="rounded-lg border border-slate-200 p-4"
                key={installation.installationId}
              >
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <p className="font-mono text-sm">{installation.installationId}</p>
                    <p className="mt-1 text-xs text-slate-500">
                      {installation.status} · credential v{installation.credentialVersion}
                      {installation.lastSeenAt === undefined
                        ? " · never seen"
                        : ` · last seen ${installation.lastSeenAt}`}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <button
                      className="rounded-md border border-slate-300 px-3 py-2 text-sm disabled:opacity-50"
                      disabled={busy}
                      onClick={() => void issueCode(installation.installationId)}
                      type="button"
                    >
                      Rotate {installation.installationId}
                    </button>
                    <button
                      className="rounded-md border border-red-300 px-3 py-2 text-sm text-red-700 disabled:opacity-50"
                      disabled={busy || installation.status === "revoked"}
                      onClick={() => void revoke(installation.installationId)}
                      type="button"
                    >
                      Revoke {installation.installationId}
                    </button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function isPairingCodeResponse(
  value: unknown,
): value is { readonly code: string; readonly expiresAt: string } {
  return typeof value === "object"
    && value !== null
    && "code" in value
    && typeof value.code === "string"
    && "expiresAt" in value
    && typeof value.expiresAt === "string";
}

function readApiError(value: unknown): string {
  if (
    typeof value === "object"
    && value !== null
    && "error" in value
    && typeof value.error === "string"
  ) {
    return value.error;
  }
  return "Local capture request failed";
}
