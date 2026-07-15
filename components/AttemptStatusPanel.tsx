"use client";

import React, { useEffect, useState } from "react";
import type {
  AttemptCorrection,
  AttemptResult,
  TrainingAttempt,
} from "@/lib/domain/training";

type AttemptsResponse = {
  readonly ok: boolean;
  readonly recentAttempts: readonly TrainingAttempt[];
  readonly error?: string;
};

type CorrectionsResponse = {
  readonly ok: boolean;
  readonly corrections: readonly AttemptCorrection[];
  readonly error?: string;
};

type MutationResponse = {
  readonly ok: boolean;
  readonly attempt?: TrainingAttempt;
  readonly replayed?: boolean;
  readonly error?: string;
};

type AttemptStatusPanelProps = {
  readonly platform: string;
  readonly externalId: string;
};

const RESULTS: readonly AttemptResult[] = ["draft", "passed", "failed", "partial", "stuck"];
const inputClass = "mt-1 block w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm normal-case tracking-normal text-slate-800";

export function AttemptStatusPanel({ platform, externalId }: AttemptStatusPanelProps) {
  const [state, setState] = useState<AttemptsResponse>({ ok: true, recentAttempts: [] });
  const [corrections, setCorrections] = useState<CorrectionsResponse>({ ok: true, corrections: [] });
  const [result, setResult] = useState<AttemptResult>("draft");
  const [language, setLanguage] = useState("");
  const [duration, setDuration] = useState("");
  const [reflection, setReflection] = useState("");
  const [startedAt, setStartedAt] = useState("");
  const [endedAt, setEndedAt] = useState("");
  const [correctionReason, setCorrectionReason] = useState("");
  const [voidReason, setVoidReason] = useState("");
  const [actionStatus, setActionStatus] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function refresh(): Promise<void> {
      const next = await requestAttempts(platform, externalId);
      if (!cancelled) setState(next);
    }
    function onAttemptsChanged(): void {
      void refresh();
    }
    void refresh();
    const id = window.setInterval(refresh, 5000);
    window.addEventListener("attempts-changed", onAttemptsChanged);
    return () => {
      cancelled = true;
      window.clearInterval(id);
      window.removeEventListener("attempts-changed", onAttemptsChanged);
    };
  }, [platform, externalId]);

  const latest = state.recentAttempts[0];

  const latestId = latest?.id;
  const latestResult = latest?.result;
  const latestLanguage = latest?.language;
  const latestDurationMinutes = latest?.durationMinutes;
  const latestReflection = latest?.reflection;
  const latestStartedAt = latest?.startedAt;
  const latestEndedAt = latest?.endedAt;
  const latestRevision = latest?.revision;

  useEffect(() => {
    if (latestId === undefined) {
      setCorrections({ ok: true, corrections: [] });
      return;
    }
    setResult(latestResult);
    setLanguage(latestLanguage ?? "");
    setDuration(latestDurationMinutes === undefined ? "" : String(latestDurationMinutes));
    setReflection(latestReflection ?? "");
    setStartedAt(toLocalDateTime(latestStartedAt));
    setEndedAt(latestEndedAt === undefined ? "" : toLocalDateTime(latestEndedAt));
    setCorrectionReason("");
    setVoidReason("");
    void refreshCorrections(latestId, setCorrections);
  }, [latestId, latestResult, latestLanguage, latestDurationMinutes, latestReflection, latestStartedAt, latestEndedAt, latestRevision]);

  async function saveCorrection(): Promise<void> {
    if (latest === undefined) return;
    setSubmitting(true);
    setActionStatus(null);
    try {
      const response = await fetch(`/api/attempts/${encodeURIComponent(latest.id)}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          expectedRevision: latest.revision,
          reason: correctionReason,
          changes: {
            result,
            language: optionalText(language),
            durationMinutes: duration.length === 0 ? null : Number(duration),
            reflection: optionalText(reflection),
            startedAt: new Date(startedAt).toISOString(),
            endedAt: endedAt.length === 0 ? null : new Date(endedAt).toISOString(),
          },
        }),
      });
      const body: MutationResponse = await response.json();
      if (!body.ok || body.attempt === undefined) {
        setActionStatus(body.error ?? "Failed to save correction");
        if (response.status === 409) setState(await requestAttempts(platform, externalId));
        return;
      }
      const updated = body.attempt;
      setState({ ok: true, recentAttempts: [updated] });
      setActionStatus("Correction saved");
      setCorrectionReason("");
      await refreshCorrections(updated.id, setCorrections);
    } catch (error) {
      setActionStatus(error instanceof Error ? error.message : "Failed to save correction");
    } finally {
      setSubmitting(false);
    }
  }

  async function voidCurrentAttempt(): Promise<void> {
    if (latest === undefined) return;
    setSubmitting(true);
    setActionStatus(null);
    try {
      const response = await fetch(`/api/attempts/${encodeURIComponent(latest.id)}/void`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ expectedRevision: latest.revision, reason: voidReason }),
      });
      const body: MutationResponse = await response.json();
      if (!body.ok) {
        setActionStatus(body.error ?? "Failed to void attempt");
        if (response.status === 409) setState(await requestAttempts(platform, externalId));
        return;
      }
      setState(await requestAttempts(platform, externalId));
      setActionStatus(body.replayed === true ? "Attempt was already voided" : "Attempt voided");
    } catch (error) {
      setActionStatus(error instanceof Error ? error.message : "Failed to void attempt");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className="mt-4 rounded-xl border border-slate-200 bg-white p-4 text-sm">
      <h2 className="font-semibold text-slate-950">Training attempt</h2>
      {!state.ok && <p className="mt-2 text-red-700">{state.error ?? "Attempt status unavailable"}</p>}
      {state.ok && !latest && (
        <p className="mt-2 text-slate-600">No active training attempts for this problem yet. Use automatic capture or record one manually.</p>
      )}
      {latest && (
        <div className="mt-3 text-slate-600">
          <div className="flex flex-wrap items-center gap-2">
            <ResultBadge result={latest.result} />
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-700">{sourceLabel(latest.recordSource)}</span>
            <span className="text-xs text-slate-500">Revision {latest.revision}</span>
          </div>
          <p className="mt-2 font-medium text-slate-900">{latest.problemTitle}</p>
          <p className="text-xs text-slate-500">{latest.platform} · {latest.problemExternalId}</p>
          {latest.verdict && <p className="mt-2">Verdict evidence: {latest.verdict}</p>}

          <div className="mt-5 border-t border-slate-100 pt-4">
            <h3 className="font-medium text-slate-900">Correct current values</h3>
            <p className="mt-1 text-xs text-slate-500">Only business fields below can be changed. Identity and capture evidence remain locked.</p>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <Field label="Corrected result" id="corrected-result">
                <select id="corrected-result" className={inputClass} value={result} onChange={(event) => setResult(resultValue(event.target.value))}>
                  {RESULTS.map((value) => <option key={value} value={value}>{value}</option>)}
                </select>
              </Field>
              <Field label="Corrected language" id="corrected-language">
                <input id="corrected-language" className={inputClass} value={language} onChange={(event) => setLanguage(event.target.value)} maxLength={100} />
              </Field>
              <Field label="Corrected duration (minutes)" id="corrected-duration">
                <input id="corrected-duration" className={inputClass} type="number" min="0" max="10080" step="1" value={duration} onChange={(event) => setDuration(event.target.value)} />
              </Field>
              <Field label="Corrected start" id="corrected-started-at">
                <input id="corrected-started-at" className={inputClass} type="datetime-local" value={startedAt} onChange={(event) => setStartedAt(event.target.value)} />
              </Field>
              <Field label="Corrected end (optional)" id="corrected-ended-at">
                <input id="corrected-ended-at" className={inputClass} type="datetime-local" value={endedAt} onChange={(event) => setEndedAt(event.target.value)} />
              </Field>
            </div>
            <label className="mt-3 block text-xs uppercase tracking-wide text-slate-500" htmlFor="corrected-reflection">Corrected reflection</label>
            <textarea id="corrected-reflection" className={`${inputClass} min-h-20`} value={reflection} onChange={(event) => setReflection(event.target.value)} maxLength={2000} />
            <label className="mt-3 block text-xs uppercase tracking-wide text-slate-500" htmlFor="correction-reason">Correction reason</label>
            <input id="correction-reason" className={inputClass} value={correctionReason} onChange={(event) => setCorrectionReason(event.target.value)} maxLength={500} />
            <button className="mt-3 rounded-lg bg-slate-950 px-3 py-2 text-xs font-medium text-white disabled:opacity-50" type="button" disabled={submitting || correctionReason.trim().length === 0 || startedAt.length === 0} onClick={() => void saveCorrection()}>
              Save correction
            </button>
          </div>

          <div className="mt-5 border-t border-slate-100 pt-4">
            <h3 className="font-medium text-slate-900">Correction history</h3>
            {!corrections.ok && <p className="mt-2 text-red-700">{corrections.error ?? "Correction history unavailable"}</p>}
            {corrections.ok && corrections.corrections.length === 0 && <p className="mt-2 text-xs text-slate-500">No corrections recorded.</p>}
            <div className="mt-2 space-y-2">
              {corrections.corrections.map((correction) => (
                <article className="rounded-lg bg-slate-50 p-3" key={correction.id}>
                  <p className="text-xs font-medium text-slate-800">{correction.reason}</p>
                  <p className="mt-1 text-xs text-slate-500">{correction.correctedAt} · revision {correction.resultingRevision}</p>
                  <ul className="mt-2 space-y-1 text-xs text-slate-600">
                    {correction.changes.map((change) => <li key={change.field}>{change.field}: {displayScalar(change.oldValue)} → {displayScalar(change.newValue)}</li>)}
                  </ul>
                </article>
              ))}
            </div>
          </div>

          <div className="mt-5 border-t border-slate-100 pt-4">
            <h3 className="font-medium text-slate-900">Void incorrect record</h3>
            <p className="mt-1 text-xs text-slate-500">Voiding is traceable and removes this attempt from default Training, Growth, and Coach views.</p>
            <label className="mt-3 block text-xs uppercase tracking-wide text-slate-500" htmlFor="void-reason">Void reason</label>
            <input id="void-reason" className={inputClass} value={voidReason} onChange={(event) => setVoidReason(event.target.value)} maxLength={500} />
            <button className="mt-3 rounded-lg border border-red-200 px-3 py-2 text-xs font-medium text-red-700 disabled:opacity-50" type="button" disabled={submitting || voidReason.trim().length === 0} onClick={() => void voidCurrentAttempt()}>
              Void attempt
            </button>
          </div>
          <p className="mt-3 text-xs text-slate-500">Updated: {latest.updatedAt}</p>
        </div>
      )}
      {actionStatus && <p className="mt-3 text-xs text-slate-600" role="status">{actionStatus}</p>}
    </section>
  );
}

async function requestAttempts(platform: string, externalId: string): Promise<AttemptsResponse> {
  try {
    const search = new URLSearchParams({ platform, externalId, limit: "1" });
    const response = await fetch(`/api/attempts/recent?${search.toString()}`, { cache: "no-store" });
    return await response.json();
  } catch (error) {
    return { ok: false, recentAttempts: [], error: error instanceof Error ? error.message : "Failed to load attempts" };
  }
}

async function refreshCorrections(attemptId: string, setCorrections: (value: CorrectionsResponse) => void): Promise<void> {
  try {
    const response = await fetch(`/api/attempts/${encodeURIComponent(attemptId)}/corrections`, { cache: "no-store" });
    setCorrections(await response.json());
  } catch (error) {
    setCorrections({ ok: false, corrections: [], error: error instanceof Error ? error.message : "Failed to load correction history" });
  }
}

function Field({ label, id, children }: { readonly label: string; readonly id: string; readonly children: React.ReactNode }) {
  return <label className="block text-xs uppercase tracking-wide text-slate-500" htmlFor={id}>{label}{children}</label>;
}

function resultValue(value: string): AttemptResult {
  const result = RESULTS.find((candidate) => candidate === value);
  return result ?? "draft";
}

function optionalText(value: string): string | null {
  const trimmed = value.trim();
  return trimmed.length === 0 ? null : trimmed;
}

function toLocalDateTime(value: string): string {
  const date = new Date(value);
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

function sourceLabel(source: "capture" | "manual"): string {
  return source === "capture" ? "Automatic capture" : "Manual entry";
}

function displayScalar(value: string | null): string {
  return value ?? "empty";
}

function ResultBadge({ result }: { readonly result: AttemptResult }) {
  const className = result === "passed"
    ? "rounded-full bg-emerald-100 px-2 py-0.5 text-xs text-emerald-800"
    : result === "failed" || result === "stuck"
      ? "rounded-full bg-red-100 px-2 py-0.5 text-xs text-red-800"
      : "rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-700";
  return <span className={className}>{result}</span>;
}
