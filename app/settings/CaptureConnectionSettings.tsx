"use client";

import React, { useEffect, useState } from "react";

type ConnectionState = "connected" | "connection_required" | "service_unreachable" | "capability_rejected";

type Challenge = Readonly<{
  challengeId: string;
  nonce: string;
  expiresAt: string;
}>;

export function CaptureConnectionSettings({
  extensionId,
  initialState,
}: {
  readonly extensionId: string;
  readonly initialState: ConnectionState;
}) {
  const [connectionState, setConnectionState] = useState<ConnectionState>(initialState);
  const [challenge, setChallenge] = useState<Challenge>();
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (challenge === undefined) return;
    let active = true;
    const poll = async (): Promise<void> => {
      try {
        const response = await fetch("/api/capture/connect/status", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            challengeId: challenge.challengeId,
            nonce: challenge.nonce,
          }),
          cache: "no-store",
        });
        const body: unknown = await response.json();
        if (!active || !isStatusResponse(body)) return;
        if (body.state === "connected") {
          setConnectionState("connected");
          setBusy(false);
          setChallenge(undefined);
        } else if (body.state === "expired" || body.state === "failed") {
          setConnectionState("capability_rejected");
          setBusy(false);
          setChallenge(undefined);
        }
      } catch {
        if (active) {
          setConnectionState("service_unreachable");
          setBusy(false);
        }
      }
    };
    void poll();
    const timer = window.setInterval(() => void poll(), 5_000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [challenge]);

  async function connect(): Promise<void> {
    setBusy(true);
    setConnectionState("connection_required");
    try {
      const response = await fetch("/api/capture/connect/challenges", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{}",
        cache: "no-store",
      });
      const body: unknown = await response.json();
      if (!response.ok || !isChallengeResponse(body)) {
        throw new Error("challenge_failed");
      }
      const nextChallenge = {
        challengeId: body.challengeId,
        nonce: body.nonce,
        expiresAt: body.expiresAt,
      };
      setChallenge(nextChallenge);
      chrome.runtime.sendMessage(extensionId, {
        schemaVersion: 1,
        type: "capture.install.connect",
        challengeId: nextChallenge.challengeId,
        nonce: nextChallenge.nonce,
      }, () => {
        if (chrome.runtime.lastError !== undefined) {
          setConnectionState("capability_rejected");
          setBusy(false);
          setChallenge(undefined);
        }
      });
    } catch {
      setConnectionState("service_unreachable");
      setBusy(false);
    }
  }

  return (
    <section className="mt-6 rounded-xl border border-slate-200 bg-white p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold">浏览器扩展</h2>
          <p className="mt-2 max-w-2xl text-sm text-slate-600">
            首次安装或重装后点击一次即可连接。Vault 切换、浏览器重启和扩展重载
            不需要重新操作；页面不会接收或显示捕获凭证。
          </p>
        </div>
        <button
          className="rounded-md bg-slate-900 px-3 py-2 text-sm text-white disabled:opacity-50"
          disabled={busy}
          onClick={() => void connect()}
          type="button"
        >
          连接扩展
        </button>
      </div>
      <p className="mt-4 text-sm text-slate-600" data-testid="capture-connection-state" role="status">
        {presentConnectionState(connectionState)}
      </p>
    </section>
  );
}

function presentConnectionState(state: ConnectionState): string {
  if (state === "connected") return "扩展已连接";
  if (state === "service_unreachable") return "本地服务不可达";
  if (state === "capability_rejected") return "连接已失效，请重新连接";
  return "需要连接扩展";
}

function isChallengeResponse(value: unknown): value is Challenge & { readonly ok: true } {
  return isRecord(value)
    && value.ok === true
    && typeof value.challengeId === "string"
    && typeof value.nonce === "string"
    && typeof value.expiresAt === "string";
}

function isStatusResponse(value: unknown): value is {
  readonly state: "connected" | "pending" | "expired" | "failed";
} {
  return isRecord(value)
    && (value.state === "connected" || value.state === "pending"
      || value.state === "expired" || value.state === "failed");
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
