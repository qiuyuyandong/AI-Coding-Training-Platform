"use client";

import { useEffect, useState } from "react";
import type { AttemptResult, TrainingAttempt } from "@/lib/domain/training";

type AttemptsResponse = {
  readonly ok: boolean;
  readonly recentAttempts: readonly TrainingAttempt[];
  readonly error?: string;
};

export function AttemptStatusPanel() {
  const [state, setState] = useState<AttemptsResponse>({ ok: true, recentAttempts: [] });
  const [reflection, setReflection] = useState("");
  const [saveStatus, setSaveStatus] = useState<string | null>(null);

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

  useEffect(() => {
    setReflection(latest?.reflection ?? "");
    setSaveStatus(null);
  }, [latest?.id]);

  async function saveReflection(): Promise<void> {
    if (latest === undefined) return;
    const response = await fetch(`/api/attempts/${encodeURIComponent(latest.id)}/reflection`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ reflection }),
    });
    const body: { readonly ok: boolean; readonly attempt?: TrainingAttempt; readonly error?: string } = await response.json();
    if (!body.ok || body.attempt === undefined) {
      setSaveStatus(body.error ?? "Failed to save reflection");
      return;
    }
    setState((current) => ({
      ...current,
      recentAttempts: current.recentAttempts.map((attempt) => attempt.id === body.attempt?.id ? body.attempt : attempt),
    }));
    setSaveStatus("Reflection saved");
  }

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
            Latest: <ResultBadge result={latest.result} />
            {" · "}
            {latest.platform}
            {" · "}
            {latest.problemTitle}
          </p>
          {latest.verdict && <p>Verdict: {latest.verdict}</p>}
          {latest.language && <p>Language: {latest.language}</p>}
          <label className="mt-3 block text-xs uppercase tracking-wide text-slate-500" htmlFor="attempt-reflection">
            Reflection
          </label>
          <textarea
            id="attempt-reflection"
            className="mt-2 w-full rounded-lg border border-slate-200 p-3 text-sm text-slate-700"
            rows={3}
            value={reflection}
            onChange={(event) => setReflection(event.target.value)}
          />
          <button className="mt-2 rounded-lg bg-slate-950 px-3 py-1.5 text-xs text-white" type="button" onClick={() => void saveReflection()}>
            Save reflection
          </button>
          {saveStatus && <p className="mt-2 text-xs text-slate-500">{saveStatus}</p>}
          {latest.reflection && <p className="mt-2 text-slate-700">{latest.reflection}</p>}
          <p className="text-xs text-slate-500">Updated: {latest.updatedAt}</p>
        </div>
      )}
    </section>
  );
}

function ResultBadge({ result }: { readonly result: AttemptResult }) {
  const className = result === "passed"
    ? "rounded-full bg-emerald-100 px-2 py-0.5 text-xs text-emerald-800"
    : result === "failed" || result === "stuck"
      ? "rounded-full bg-red-100 px-2 py-0.5 text-xs text-red-800"
      : "rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-700";

  return <span className={className}>{result}</span>;
}
