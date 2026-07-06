"use client";

import { useEffect, useState } from "react";
import type { CaptureEvent } from "@/lib/capture/events";

type CaptureStatus = {
  readonly ok: boolean;
  readonly recentEvents: readonly CaptureEvent[];
  readonly error?: string;
};

export function CaptureStatusPanel() {
  const [status, setStatus] = useState<CaptureStatus>({ ok: true, recentEvents: [] });

  useEffect(() => {
    let cancelled = false;

    async function loadStatus(): Promise<void> {
      try {
        const response = await fetch("/api/capture/status", { cache: "no-store" });
        const body: CaptureStatus = await response.json();
        if (!cancelled) setStatus(body);
      } catch (error) {
        if (!cancelled) {
          setStatus({ ok: false, recentEvents: [], error: error instanceof Error ? error.message : "Failed to load capture status" });
        }
      }
    }

    void loadStatus();
    const id = window.setInterval(loadStatus, 5000);

    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, []);

  const latest = status.recentEvents[0];

  return (
    <section className="mt-4 rounded-xl border border-slate-200 bg-white p-4 text-sm">
      <h2 className="font-semibold text-slate-950">Capture status</h2>
      {!status.ok && <p className="mt-2 text-red-700">{status.error ?? "Capture status unavailable"}</p>}
      {status.ok && !latest && <p className="mt-2 text-slate-600">No capture events yet. Open an original problem with the extension enabled.</p>}
      {latest && (
        <div className="mt-2 text-slate-600">
          <p>
            Latest: {latest.type} · {latest.platform} · {latest.problemTitle}
          </p>
          <p className="text-xs text-slate-500">{latest.occurredAt}</p>
        </div>
      )}
    </section>
  );
}
