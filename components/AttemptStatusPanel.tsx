"use client";

import { useEffect, useState } from "react";
import type { TrainingAttempt } from "@/lib/domain/training";

type AttemptsResponse = {
  readonly ok: boolean;
  readonly recentAttempts: readonly TrainingAttempt[];
  readonly error?: string;
};

export function AttemptStatusPanel() {
  const [state, setState] = useState<AttemptsResponse>({ ok: true, recentAttempts: [] });

  useEffect(() => {
    let cancelled = false;

    async function loadAttempts(): Promise<void> {
      try {
        const response = await fetch("/api/attempts/recent", { cache: "no-store" });
        const body: AttemptsResponse = await response.json();
        if (!cancelled) setState(body);
      } catch (error) {
        if (!cancelled) {
          setState({
            ok: false,
            recentAttempts: [],
            error: error instanceof Error ? error.message : "Failed to load attempts",
          });
        }
      }
    }

    void loadAttempts();
    const id = window.setInterval(loadAttempts, 5000);

    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, []);

  const latest = state.recentAttempts[0];

  return (
    <section className="mt-4 rounded-xl border border-slate-200 bg-white p-4 text-sm">
      <h2 className="font-semibold text-slate-950">Training attempt</h2>
      {!state.ok && (
        <p className="mt-2 text-red-700">{state.error ?? "Attempt status unavailable"}</p>
      )}
      {state.ok && !latest && (
        <p className="mt-2 text-slate-600">
          No training attempts yet. Open an original problem with capture enabled.
        </p>
      )}
      {latest && (
        <div className="mt-2 text-slate-600">
          <p>
            Latest: <span className="font-medium text-slate-900">{latest.result}</span>
            {" · "}
            {latest.platform}
            {" · "}
            {latest.problemTitle}
          </p>
          {latest.verdict && <p>Verdict: {latest.verdict}</p>}
          {latest.language && <p>Language: {latest.language}</p>}
          <p className="text-xs text-slate-500">Updated: {latest.updatedAt}</p>
        </div>
      )}
    </section>
  );
}
