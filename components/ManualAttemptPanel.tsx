"use client";

import { useState } from "react";
import type { AttemptResult, TrainingAttempt } from "@/lib/domain/training";

type ManualAttemptPanelProps = {
  readonly platform: string;
  readonly externalId: string;
  readonly problemTitle: string;
  readonly canonicalUrl?: string;
};

type ManualAttemptResponse = {
  readonly ok: boolean;
  readonly attempt?: TrainingAttempt;
  readonly error?: string;
};

const RESULTS: readonly AttemptResult[] = ["draft", "passed", "failed", "partial", "stuck"];

export function ManualAttemptPanel({ platform, externalId, problemTitle, canonicalUrl }: ManualAttemptPanelProps) {
  const [result, setResult] = useState<AttemptResult>("passed");
  const [language, setLanguage] = useState("");
  const [duration, setDuration] = useState("");
  const [reflection, setReflection] = useState("");
  const [startedAt, setStartedAt] = useState(toLocalDateTime(new Date().toISOString()));
  const [endedAt, setEndedAt] = useState("");
  const [problemUrl, setProblemUrl] = useState(canonicalUrl ?? "");
  const [status, setStatus] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function submit(): Promise<void> {
    setSubmitting(true);
    setStatus(null);
    try {
      const body = {
        platform,
        problemExternalId: externalId,
        problemTitle,
        startedAt: new Date(startedAt).toISOString(),
        result,
        ...(problemUrl.trim().length > 0 ? { canonicalUrl: problemUrl.trim() } : {}),
        ...(endedAt.length > 0 ? { endedAt: new Date(endedAt).toISOString() } : {}),
        ...(language.trim().length > 0 ? { language: language.trim() } : {}),
        ...(duration.length > 0 ? { durationMinutes: Number(duration) } : {}),
        ...(reflection.trim().length > 0 ? { reflection: reflection.trim() } : {}),
      };
      const response = await fetch("/api/attempts", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const responseBody: ManualAttemptResponse = await response.json();
      if (!responseBody.ok || responseBody.attempt === undefined) {
        setStatus(responseBody.error ?? "Failed to record manual attempt");
        return;
      }
      setStatus("Manual attempt recorded");
      window.dispatchEvent(new Event("attempts-changed"));
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Failed to record manual attempt");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className="mt-4 rounded-xl border border-slate-200 bg-white p-4 text-sm">
      <h2 className="font-semibold text-slate-950">Record an attempt manually</h2>
      <p className="mt-1 text-slate-600">Use this fallback when automatic capture is unavailable.</p>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <Field label="Manual result" id="manual-result">
          <select id="manual-result" className={inputClass} value={result} onChange={(event) => setResult(resultValue(event.target.value))}>
            {RESULTS.map((value) => <option key={value} value={value}>{value}</option>)}
          </select>
        </Field>
        <Field label="Language" id="manual-language">
          <input id="manual-language" className={inputClass} value={language} onChange={(event) => setLanguage(event.target.value)} maxLength={100} />
        </Field>
        <Field label="Duration (minutes)" id="manual-duration">
          <input id="manual-duration" className={inputClass} type="number" min="0" max="10080" step="1" value={duration} onChange={(event) => setDuration(event.target.value)} />
        </Field>
        <Field label="Started at" id="manual-started-at">
          <input id="manual-started-at" className={inputClass} type="datetime-local" value={startedAt} onChange={(event) => setStartedAt(event.target.value)} />
        </Field>
        <Field label="Ended at (optional)" id="manual-ended-at">
          <input id="manual-ended-at" className={inputClass} type="datetime-local" value={endedAt} onChange={(event) => setEndedAt(event.target.value)} />
        </Field>
        {canonicalUrl === undefined && (
          <Field label="Problem URL" id="manual-problem-url">
            <input id="manual-problem-url" className={inputClass} type="url" value={problemUrl} onChange={(event) => setProblemUrl(event.target.value)} required />
          </Field>
        )}
      </div>
      <label className="mt-3 block text-xs uppercase tracking-wide text-slate-500" htmlFor="manual-reflection">Reflection</label>
      <textarea id="manual-reflection" className={`${inputClass} min-h-20`} value={reflection} onChange={(event) => setReflection(event.target.value)} maxLength={2000} />
      <button className="mt-3 rounded-lg bg-slate-950 px-3 py-2 text-xs font-medium text-white disabled:opacity-50" type="button" disabled={submitting || startedAt.length === 0} onClick={() => void submit()}>
        {submitting ? "Recording…" : "Record manual attempt"}
      </button>
      {status && <p className="mt-2 text-xs text-slate-600" role="status">{status}</p>}
    </section>
  );
}

function Field({ label, id, children }: { readonly label: string; readonly id: string; readonly children: React.ReactNode }) {
  return (
    <label className="block text-xs uppercase tracking-wide text-slate-500" htmlFor={id}>
      {label}
      {children}
    </label>
  );
}

function toLocalDateTime(value: string): string {
  const date = new Date(value);
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

function resultValue(value: string): AttemptResult {
  const result = RESULTS.find((candidate) => candidate === value);
  return result ?? "draft";
}

const inputClass = "mt-1 block w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm normal-case tracking-normal text-slate-800";
