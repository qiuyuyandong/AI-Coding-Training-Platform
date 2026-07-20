"use client";

import { useRouter } from "next/navigation";
import React, { useState } from "react";

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
  const [status, setStatus] = useState("准备就绪");
  const [busy, setBusy] = useState(false);

  async function issueCode(targetInstallationId?: string): Promise<void> {
    setBusy(true);
    setStatus("正在创建一次性配对码…");
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
        throw new Error("配对码响应格式无效");
      }
      setPairingCode({
        code: body.code,
        expiresAt: body.expiresAt,
        targetInstallationId,
      });
      setStatus(targetInstallationId === undefined
        ? "新扩展配对码已创建"
        : `已为 ${targetInstallationId} 创建凭证轮换码`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "创建配对码失败");
    } finally {
      setBusy(false);
    }
  }

  async function revoke(installationId: string): Promise<void> {
    setBusy(true);
    setStatus(`正在撤销 ${installationId}…`);
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
      setStatus(`已撤销 ${installationId}`);
      router.refresh();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "撤销扩展失败");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-8 space-y-6">
      <section className="rounded-xl border border-slate-200 bg-white p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold">配对新扩展</h2>
            <p className="mt-1 max-w-2xl text-sm text-slate-600">
              创建一个十分钟内有效的一次性配对码，再将它粘贴到扩展弹窗中。
            </p>
          </div>
          <button
            className="rounded-md bg-slate-900 px-3 py-2 text-sm text-white disabled:opacity-50"
            disabled={busy}
            onClick={() => void issueCode()}
            type="button"
          >
            创建配对码
          </button>
        </div>
        {pairingCode !== undefined ? (
          <div className="mt-4 rounded-lg bg-slate-100 p-4" data-testid="pairing-code-panel">
            <p className="text-xs uppercase tracking-wide text-slate-500">
              {pairingCode.targetInstallationId === undefined
                ? "新扩展"
                : `轮换 ${pairingCode.targetInstallationId} 的凭证`}
            </p>
            <code className="mt-2 block break-all text-sm font-semibold" data-testid="pairing-code">
              {pairingCode.code}
            </code>
            <p className="mt-2 text-xs text-slate-500">有效期至 {pairingCode.expiresAt}</p>
          </div>
        ) : null}
        <p className="mt-3 text-sm text-slate-600" role="status">{status}</p>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-5">
        <h2 className="text-lg font-semibold">已配对的扩展</h2>
        {installations.length === 0 ? (
          <p className="mt-3 text-sm text-slate-600">尚未配对任何扩展。</p>
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
                      {installation.status === "active" ? "已配对" : "已撤销"}
                      {installation.credentialVersion > 1 ? " · 凭证已轮换" : ""}
                      {installation.lastSeenAt === undefined
                        ? " · 尚未收到事件"
                        : ` · 最近收到事件 ${installation.lastSeenAt}`}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <button
                      className="rounded-md border border-slate-300 px-3 py-2 text-sm disabled:opacity-50"
                      disabled={busy}
                      onClick={() => void issueCode(installation.installationId)}
                      type="button"
                    >
                      轮换凭证 {installation.installationId}
                    </button>
                    <button
                      className="rounded-md border border-red-300 px-3 py-2 text-sm text-red-700 disabled:opacity-50"
                      disabled={busy || installation.status === "revoked"}
                      onClick={() => void revoke(installation.installationId)}
                      type="button"
                    >
                      撤销 {installation.installationId}
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
  return "本地采集请求失败";
}
