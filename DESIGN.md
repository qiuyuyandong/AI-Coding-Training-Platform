# App Design System

The V1 training platform is a **local-first, quiet training command center**. The interface favors restrained surfaces, slate neutrals, and short labels so that captured training data — not chrome — carries attention. The style below is extracted directly from the current `app/**` and `components/**` code; it exists to keep new UI consistent with what is already shipped.

## Aesthetic direction

- **Quiet command center.** White cards sit on a soft slate canvas. Layout reads as a status board, not a marketing page.
- **No decorative imagery.** No hero gradients, no illustrations, no icons, no emojis. Information is the design.
- **Editorial typography rhythm.** System font stack via Tailwind. Large page titles, small uppercase eyebrows, generous whitespace between sections.
- **Practical accents.** Status colors are used sparingly to convey state (draft / passed / failed / stuck), never as decoration.

## Surface model

| Layer | Class | Notes |
|---|---|---|
| Body | `bg: #f8fafc` (slate-50) · `color: #0f172a` (slate-950) | Set in `app/globals.css` |
| Page wrapper | `mx-auto max-w-4xl px-6 py-10` | Used on `/coach`, `/growth`, `/training`, `/sources`, `/compliance` |
| Home wrapper | `mx-auto max-w-5xl px-6 py-12` | Slightly wider for the landing index |
| Card | `rounded-xl border border-slate-200 bg-white p-4` | Default panel; use `p-6` for the primary feature card |
| Compact list item | `rounded-lg border border-slate-200 bg-white p-4` | One-line rule lists (see `/compliance`) |
| Pill | `rounded-full bg-slate-100 px-3 py-1 text-xs text-slate-700` | Metadata badges, mode labels |
| Primary button | `rounded-lg bg-slate-950 px-4 py-2 text-white` | Use for the single primary action per surface |
| Secondary button | `rounded-xl border border-slate-200 p-4 text-slate-900 hover:bg-slate-50` | Home page navigation tiles |

## Type scale

| Role | Class | Example |
|---|---|---|
| Page title (default) | `text-3xl font-semibold` | `<h1>` on `/coach`, `/growth`, `/compliance` |
| Page title (landing) | `text-4xl font-semibold text-slate-950` | Home hero |
| Card title | `text-lg font-semibold text-slate-950` | Problem card, source card |
| Section eyebrow | `text-sm uppercase tracking-wide text-slate-500` (or `text-xs`) | Platform label, metadata prefix |
| Body | `text-slate-600` | Quiet paragraph copy |
| Panel header (status) | `font-semibold text-slate-950` | Inside `CaptureStatusPanel`, `AttemptStatusPanel` |
| Panel body | `text-slate-600` | Status detail lines |
| Panel meta | `text-xs text-slate-500` | Timestamps, secondary detail |
| Big metric | `text-2xl font-semibold` | Growth counters |
| Empty state | `mt-3 text-slate-600` | Copy under a heading explaining how to populate |

## Spacing

- **4 px base scale** via Tailwind defaults (`1 = 4px`, `2 = 8px`, `3 = 12px`, `4 = 16px`, `6 = 24px`, `8 = 32px`, `10 = 40px`).
- Page vertical rhythm: `py-10` page wrapper, `mt-3` for body intro, `mt-4` for the first card grid, `mt-6` / `mt-8` before list collections, `mt-2` inside a panel for stacked lines.
- Card stacks: `space-y-3` for vertical lists; `grid gap-3 sm:grid-cols-3` for metric grids.
- Status panels stack below the primary card with `mt-4` between siblings (see `TrainingWorkspace`).

## Color & state semantics

Status is communicated with restrained colors. Keep the palette closed.

| Intent | Tailwind class | Used for |
|---|---|---|
| Default text | `text-slate-950` / `text-slate-900` | Titles and strong copy |
| Secondary text | `text-slate-600` | Body, explanations, empty states |
| Tertiary meta | `text-slate-500` / `text-slate-400` | Timestamps, badges, disabled labels |
| Success / enabled | `text-emerald-700` | Source registry `enabled` flag |
| Error / failure | `text-red-700` | Panel error messages |
| Surface borders | `border-slate-200` | Every card and divider |
| Surface fills | `bg-white` | Inside cards on the slate-50 canvas |
| Accent fills | `bg-slate-100`, `bg-slate-50` | Pills, hover states, button rest states |
| Inverse action | `bg-slate-950` + `text-white` | Primary button |

Do not introduce gradients, brand colors, or color tokens beyond the slate scale plus emerald / red status accents. A new state must reuse one of the rows above.

## Status mapping for training attempts

When rendering `training_attempts` results, color the badge so the eye reads the state instantly.

| `TrainingAttempt.result` | Badge class | Label |
|---|---|---|
| `draft` | `rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-700` | `draft` |
| `passed` | `rounded-full bg-emerald-100 px-2 py-0.5 text-xs text-emerald-800` | `passed` |
| `failed` | `rounded-full bg-red-100 px-2 py-0.5 text-xs text-red-800` | `failed` |
| `partial` | `rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-700` | `partial` |
| `stuck` | `rounded-full bg-red-100 px-2 py-0.5 text-xs text-red-800` | `stuck` |

Status badges are only the colored dot — never pair them with icons or emoji.

## Empty, error, and loading states

Every list surface explicitly handles three states. Do not omit any.

| State | Pattern | Example |
|---|---|---|
| Empty | A `text-slate-600` sentence explaining how to populate the list | `CaptureStatusPanel`, `AttemptStatusPanel`, `/coach`, `/growth` |
| Error | A `text-red-700` sentence carrying the failure message | `CaptureStatusPanel`, `AttemptStatusPanel` |
| Loading | Initial render shows the empty state until the first fetch returns; we do not block the first paint with a spinner |

This is intentional — the system is a status board, so the lack of data IS the first message.

## Component composition

- **Card → section → main.** A page is `main` (page wrapper) > optional `<section>` (primary card) > `Component` instances (status panels, lists).
- **`TrainingWorkspace` is a fragment, not a `<section>`.** Its parent page already supplies the `main` wrapper, so the workspace just stacks a card then status panels.
- **Status panels render below their owner card with `mt-4`** to keep a clear vertical rhythm.
- **Lists of `Recent*` or `TrainingAttempt*` data live inside a single card**, not in a separate card per item. Avoid card-of-cards nesting.

## Server vs. client components

- Pages under `app/**` stay as **server components**. They read directly from `openDatabase()` + a repository, close the handle in a `try` / `finally`, and render plain JSX.
- Only panels that **poll a JSON API** are client components. Currently: `CaptureStatusPanel`, `AttemptStatusPanel`. They use the `"use client";` directive, a local `useState` + `useEffect`, and `fetch(..., { cache: "no-store" })` against the matching route under `app/api/**`.

## Polling convention

Client panels follow the same shape (see `CaptureStatusPanel`):

1. `useState` initializes with an empty / non-error shape so the panel renders something meaningful before the first fetch returns.
2. The effect `void loadStatus()` immediately, then registers a 5-second `window.setInterval`.
3. Cleanup cancels in-flight updates with a `cancelled` flag and clears the interval.
4. The latest item is read from `recent[0]`; older rows are not duplicated in the same panel.
5. Errors fall back to `{ ok: false, recentX: [], error: ... }` so the rest of the surface still renders.

Reuse this contract verbatim; do not introduce new polling libraries.

## What does NOT belong in V1

- Icons, emoji, decorative illustrations, hero gradients, glassmorphism, animated backgrounds.
- Color tokens beyond slate + emerald/red status accents.
- New fonts beyond the Tailwind v3 system stack.
- Client-only state libraries or polling libraries (SWR, React Query, etc.); plain `useEffect` + `fetch` is enough.
- Two competing component "kits" — every panel reuses the same card / panel / pill recipes above.

If a future design needs a new color, type role, or spacing token, it must be added here first and consumed in code — never inlined as a one-off.
