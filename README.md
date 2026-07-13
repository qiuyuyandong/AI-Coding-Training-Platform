# AI Coding Training Platform

This repository currently contains a **Pre-V0 local OJ capture prototype**. The product direction is a learning-navigation and code-growth platform; the implemented app has not yet reached that scope.

It provides:

- a small problem-metadata catalog;
- deep links to original OJ problem pages;
- a Chrome extension that detects user-visible training events;
- local capture APIs;
- local attempts, Coach, and Growth pages.

The project does not mirror LeetCode, NowCoder, Luogu, or similar full problem statements by default.

## Project Docs

- `IDEA.md` is the canonical product definition, V0/V0.5/V1 scope, and current decision record.
- `docs/superpowers/plans/2026-07-11-product-development-roadmap.md` maps vertical releases to engineering Phases and exit gates.
- `docs/superpowers/README.md` distinguishes active plans from historical Phase-numbered prototype documents.
- `docs/architecture.md` explains the current app, extension, API, SQLite, and Coach/Growth flow.
- `docs/runbook.md` contains setup, verification, and troubleshooting steps.
- `DESIGN.md` defines the quiet slate/white UI system used by app pages and panels.
- `COMPLIANCE.md` documents local-first privacy and platform-boundary rules.

`README.md`, `docs/architecture.md`, `docs/runbook.md`, and `COMPLIANCE.md` describe the current local implementation. `IDEA.md` and the roadmap describe the approved target direction, including the later hosted Public Beta; do not treat target features as already implemented.

## Commands

```powershell
npm install
npm run dev
npm run typecheck
npm run test
npm run e2e
npm run extension:build
npm run build
```

`npm run e2e` creates a freshly migrated database at `.tmp/playwright/training-platform.sqlite`, starts and stops its own Next.js server, and removes the disposable database afterward. It never reuses a server on port 3000 and never writes to the default `training-platform.sqlite`.

## Browser Extension

Build the Chrome MV3 extension:

```powershell
npm run extension:build
```

Load `extension/dist` as an unpacked extension in Chrome. Keep the local app running at `http://localhost:3000` so the extension can post capture events to `/api/capture/events`.

## Training Records Loop

The training loop turns captured browser events into local training attempts:

- `/training?platform=leetcode&externalId=two-sum&title=Two%20Sum` opens the original problem and shows capture plus problem-specific attempt status;
- `/api/capture/events` stores extension events and materializes the matching local attempt;
- `/api/attempts/recent` returns recent attempts for the training workspace;
- `/coach` and `/growth` read the same local attempts to show empty-state or rule-based feedback.

Phase 3.0 hardens verdict capture: the extension maps visible Accepted/Wrong Answer/Compile Error/runtime/time/memory/partial verdict text into local results, including Chinese verdict labels, and repeated verdict events do not duplicate completed attempts.

Run migrations before exercising the loop:

```powershell
npm run db:migrate
npm run db:seed
npm run dev
```

## Coach and Growth Insights

Phase 2.3 keeps coaching local and deterministic:

- `/coach` reads recent local attempts and renders summary, evidence-backed signals, and next-step recommendations;
- `/growth` renders local result distribution, completion/pass rates, and recent activity;
- insights are computed from SQLite attempts only, with no external model or network call.
