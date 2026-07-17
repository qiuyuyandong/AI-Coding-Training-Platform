"use client";

import { useState } from "react";

/**
 * V0 `/plan` goal-setup client component.
 *
 * Renders a small, accessible form for choosing one primary direction
 * plus up to two interest directions. The component is intentionally
 * minimal: it owns no global state, calls `POST /api/plan/goal` on
 * submit, and either reports the server error or triggers a soft
 * reload so the surrounding server page can re-read the persisted
 * active goal row.
 *
 * The component never reads cookies, tokens or platform credentials;
 * it only uses stable track slugs surfaced by the parent server page.
 */

export type GoalTrackOption = {
  readonly slug: string;
  readonly name: string;
};

export type GoalSetupPanelProps = {
  readonly availableTracks: readonly GoalTrackOption[];
  readonly initialPrimaryTrackId: string | null;
  readonly initialInterestTrackIds: readonly string[];
};

const NONE_VALUE = "__none__";

type GoalApiResponse =
  | { readonly ok: true; readonly goal: GoalApiGoal }
  | { readonly ok: false; readonly error?: string };

type GoalApiGoal = {
  readonly id: string;
  readonly primaryTrackId: string | null;
  readonly interestTrackIds: readonly string[];
};

export function GoalSetupPanel({
  availableTracks,
  initialPrimaryTrackId,
  initialInterestTrackIds,
}: GoalSetupPanelProps) {
  const [primaryTrackId, setPrimaryTrackId] = useState<string | null>(
    initialPrimaryTrackId,
  );
  const [interestTrackIds, setInterestTrackIds] = useState<readonly string[]>(
    initialInterestTrackIds,
  );
  const [status, setStatus] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function toggleInterest(slug: string): void {
    setStatus(null);
    setInterestTrackIds((current) => {
      if (current.includes(slug)) {
        return current.filter((entry) => entry !== slug);
      }
      if (current.length >= 2) {
        setStatus("最多只能选择 2 个兴趣方向");
        return current;
      }
      return [...current, slug];
    });
  }

  function onPrimaryChange(event: React.ChangeEvent<HTMLSelectElement>): void {
    setStatus(null);
    const value = event.target.value;
    setPrimaryTrackId(value === NONE_VALUE ? null : value);
  }

  async function submit(): Promise<void> {
    setSubmitting(true);
    setStatus(null);
    try {
      const response = await fetch("/api/plan/goal", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          primaryTrackId,
          interestTrackIds: [...interestTrackIds],
        }),
      });
      const body: GoalApiResponse = await response.json();
      if (!body.ok) {
        setStatus(body.error ?? "保存失败");
        return;
      }
      setStatus("已保存");
      window.location.reload();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "保存失败");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className="mt-4 rounded-xl border border-slate-200 bg-white p-4">
      <h2 className="text-lg font-semibold text-slate-950">选择方向</h2>
      <p className="mt-1 text-sm text-slate-600">
        主要方向用于决定今天的主题；兴趣方向（最多 2 个）用于规划辅助推荐。
      </p>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <Field label="主要方向（可留空）" id="goal-primary">
          <select
            id="goal-primary"
            className={selectClass}
            value={primaryTrackId ?? NONE_VALUE}
            onChange={onPrimaryChange}
          >
            <option value={NONE_VALUE}>暂不选择</option>
            {availableTracks.map((track) => (
              <option key={track.slug} value={track.slug}>
                {track.name}
              </option>
            ))}
          </select>
        </Field>
        <fieldset className="rounded-lg border border-slate-200 bg-slate-50 p-3">
          <legend className="px-1 text-xs uppercase tracking-wide text-slate-500">
            兴趣方向（最多 2 个）
          </legend>
          <ul className="mt-2 grid gap-1">
            {availableTracks.map((track) => {
              const checked = interestTrackIds.includes(track.slug);
              return (
                <li key={track.slug}>
                  <label
                    className="flex items-center gap-2 text-sm text-slate-800"
                    htmlFor={`goal-interest-${track.slug}`}
                  >
                    <input
                      id={`goal-interest-${track.slug}`}
                      type="checkbox"
                      className="h-4 w-4 rounded border-slate-300 text-slate-950 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-950"
                      checked={checked}
                      onChange={() => toggleInterest(track.slug)}
                    />
                    {track.name}
                  </label>
                </li>
              );
            })}
          </ul>
        </fieldset>
      </div>
      <button
        type="button"
        disabled={submitting}
        onClick={() => void submit()}
        className="mt-4 rounded-lg bg-slate-950 px-4 py-2 text-sm font-medium text-white disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-950"
      >
        {submitting ? "保存中…" : "保存方向选择"}
      </button>
      {status !== null ? (
        <p
          className={
            status === "已保存"
              ? "mt-2 text-sm text-emerald-700"
              : "mt-2 text-sm text-red-700"
          }
          role="status"
          aria-live="polite"
        >
          {status}
        </p>
      ) : null}
    </section>
  );
}

function Field({
  label,
  id,
  children,
}: {
  readonly label: string;
  readonly id: string;
  readonly children: React.ReactNode;
}) {
  return (
    <label
      htmlFor={id}
      className="block text-xs uppercase tracking-wide text-slate-500"
    >
      {label}
      {children}
    </label>
  );
}

const selectClass =
  "mt-1 block w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm normal-case tracking-normal text-slate-800";