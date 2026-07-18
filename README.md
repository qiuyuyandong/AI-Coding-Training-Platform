# AI Coding Training Platform

> **Status (2026-07-18):** **V0 exit candidate; F1-F4 final verification and user acceptance pending.** Engineering gates PASS at implementationSha `d6c0f14aafb663c8746ad5e30d968508d539ec07`; observationRecordSha `5a0e0a0f12a0fcf24683564fb5146087a9c59c9f`. See `work/reports/v0-exit-report.md` for the full SHA chain, decision and limitations. V0 is not declared complete or accepted until F1-F4 all APPROVE and the user explicitly accepts the V0 verification.

This repository currently contains a **V0 exit candidate build of a local learning loop** with the V0 engineering gates passing and observation windows pending. The product direction is a learning-navigation and code-growth platform; the implemented app has not yet been accepted as a complete V0 release.

It provides:

- a small problem-metadata catalog;
- deep links to original OJ problem pages;
- a Chrome extension that detects user-visible training events;
- a paired, session- and submission-aware local capture API;
- captured and manually entered local attempts, with traceable corrections and logical voiding;
- Coach and Growth pages that use active attempts by default;
- a V0 **manual learning loop** (exit candidate, pending F1–F4 final verification and user acceptance): a 12-node foundation curriculum with 12 reviewed resources, 12 mapped practice tasks, 13 prerequisite edges and 9 career summaries; a 6-prompt resumable diagnosis with starting-node override; deterministic candidate selection with semantic alternatives; an atomic completion loop that records attempt, attempt→node mapping, ability projection and successor plan; optional opt-in per-completion AI reflection (default disabled, network-denial guard, deterministic fallback). V0 introduces the `/map`, `/plan`, and `/today` pages and the underlying services, repositories, migrations 0006/0007/0008, and validators described under `work/reports/v0-exit-report.md`.

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

The documented verification commands are:

```powershell
npm install
npm run dev
npm run lint
npm run typecheck
npm run test
npm run e2e
npm run extension:check
npm run build
npm run quality:gate
```

`npm run lint` runs the strict ESLint flat config (`eslint . --max-warnings=0`). `npm run extension:check` chains typecheck, focused extension tests, the MV3 build, and the `extension/dist` parity/ignore check. `npm run quality:gate` runs lint, a disposable migration, unit tests, typecheck, E2E, extension parity, and production build in that order using an OS-temporary database and is the safe all-in-one gate. Use it instead of running individual commands when you want one reproducible verification.

`npm run e2e` creates a freshly migrated database at `.tmp/playwright/training-platform.sqlite`, starts and stops its own Next.js server, and removes the disposable database afterward. It never reuses a server on port 3000 and never writes to the default `training-platform.sqlite`.

## Browser Extension

Build the Chrome MV3 extension:

```powershell
npm run extension:build
```

Load `extension/dist` as an unpacked extension in Chrome. Keep the local app running at `http://localhost:3000` so the extension can post capture events to `/api/capture/events`.

Before the first capture, open `/settings`, create a ten-minute pairing code, and paste it into the extension popup. The app stores only a hash of the long-lived credential. `/settings` can issue a targeted rotation code or revoke an installation; `installationId` remains correlation metadata and is not itself authorization.

## Training Records Loop

The training loop turns captured browser events into local training attempts:

- `/training?platform=leetcode&externalId=two-sum&title=Two%20Sum` opens the original problem and shows capture plus problem-specific attempt status;
- `/api/capture/events` stores each V2 raw event and its deterministic session/attempt projection in one SQLite transaction;
- `/api/attempts/recent` accepts an explicit bounded limit and optional `platform` + `externalId` scope; the training workspace requests only its current problem;
- `POST /api/attempts` creates a server-labelled manual attempt; correction and void endpoints require an expected revision and a reason;
- `/coach` and `/growth` read the same local attempts to show empty-state or rule-based feedback.

The Training workspace labels each attempt as `Automatic capture` or `Manual entry`. Corrections can change only result, language, duration, reflection, start time, or end time. They update the current row and append scalar old/new values in one transaction; they never create another attempt. Voiding is idempotent and traceable. Active Training, Coach, and Growth queries exclude voided rows by default.

Capture protocol V2 assigns a logical `installationId`, a `captureSessionId` per observed problem visit, and a `submissionId` per observed submission. Same-problem SPA routes retain the active session; navigation to another problem emits the old-session end before the new-session start. Sessions may remain open when the optional `SESSION_ENDED` signal is not delivered. Exact event replay is idempotent; reusing an `eventId` with different content returns HTTP 409.

The extension owns its queue through one serialized executor and drains events FIFO in batches of at most 25. Permanent 400/409/413/415 failures are dropped, while network and retryable server failures preserve the head. A 401 preserves the queue and retry budget until the extension is paired again.

Extension unit tests cover SPA observation and queue concurrency directly. Playwright does not load the unpacked MV3 extension, so its SPA-shaped test validates the resulting end/start sequence through the API, SQLite projections, and problem-specific training UI.

Platform adapter readiness is tracked in a formal `PLATFORM_ADAPTERS` registry (`extension/src/platforms.ts`) with status levels `production`, `experimental`, or `disabled`. AtCoder is the sole `production` adapter, certified with real public verdict DOM fixtures on 2026-07-17 (`work/reports/phase-0-atcoder-certification.md`). LeetCode, NowCoder, Codeforces, and Luogu remain `experimental`. A Luogu DOM fixture corpus (`tests/fixtures/luogu/`) with an evidence-tier metadata system and a certification gate (`tests/unit/platformCertification.test.ts`) enforce that promotion to `production` requires publicly verified verdict DOM. Luogu adapter certification was attempted in Phase 0B4 (2026-07-14) and remains historically BLOCKED because its record pages require authentication; the blocker is preserved in `work/reports/luogu-adapter-blocker.json`.

The V2 cutover intentionally discarded legacy V1 capture rows and queued extension events. The extension records the one-time queue discard count and logs it locally. Existing V2 events remain intact when credential migration 0004 is applied; events observed before pairing keep `extension_unpaired` provenance even if delivered after pairing.

Run migrations before exercising the loop:

```powershell
npm run db:migrate
npm run db:seed
npm run dev
```

## Coach and Growth Insights

Phase 0C keeps query semantics explicit while coaching remains local and deterministic:

- `/coach` analyzes and labels its latest-50-attempt window;
- `/growth` computes all-time counts, distribution, and rates in SQLite, then renders only the latest five activity rows;
- canonical problem identity is normalized at capture, catalog, query, and link boundaries so platform case/URL variants do not split one problem;
- insights are computed from SQLite attempts only, with no external model or network call;
- manually entered attempts participate in the same active Growth and Coach query ranges as captured attempts; recent Growth activity shows the source label.
