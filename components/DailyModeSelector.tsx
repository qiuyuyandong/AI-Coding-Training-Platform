"use client";

import { useState } from "react";
import type { DailyMode } from "@/lib/domain/plan";

const MODES: ReadonlyArray<{ readonly value: DailyMode; readonly label: string }> = [
  { value: "learn", label: "学习" },
  { value: "review", label: "复习" },
  { value: "practice", label: "练习" },
  { value: "build", label: "项目" },
  { value: "recover", label: "恢复" },
];

export function DailyModeSelector({ planItemId, current }: {
  readonly planItemId: string;
  readonly current: DailyMode;
}) {
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");

  async function select(dailyMode: DailyMode): Promise<void> {
    if (busy || dailyMode === current) return;
    setBusy(true);
    try {
      const response = await fetch(`/api/plans/items/${planItemId}/feedback`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "accepted", dailyMode }),
      });
      const result: { readonly ok: boolean; readonly error?: string } = await response.json();
      if (result.ok) window.location.reload();
      else setStatus(result.error ?? "模式更新失败");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="今日模式">
        {MODES.map((mode) => <button key={mode.value} type="button" role="radio" aria-checked={mode.value === current} disabled={busy} onClick={() => void select(mode.value)} className={`rounded-lg border px-3 py-2 text-sm ${mode.value === current ? "border-slate-950 bg-slate-950 text-white" : "border-slate-200 bg-white text-slate-800"}`}>{mode.label}</button>)}
      </div>
      {status.length > 0 ? <p role="status" className="mt-2 text-sm text-red-700">{status}</p> : null}
    </div>
  );
}
