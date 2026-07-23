# AI Coding Training Platform

> **Status (2026-07-23):** **V0 capture repair and validation.** Phase 0 is
> complete. The verdict-gated V3 repair now handles the current LeetCode
> duplicate verdict locators and the selected submission-detail surface that
> remains after LeetCode restores the problem URL. An authorized real-Chrome
> recovery converted the user's stuck TLE into `Time Limit Exceeded`, delivered
> it once, and returned waiting/outbox/quarantine to zero. A fresh natural
> submit-to-verdict observation on the final commit is still required before
> formal V0 closeout.

> **Closeout validator:** `tests/unit/v0ReportValidators.test.ts` exercises 21
> real temporary-repository cases for the strict two-commit release contract.
> `b5166320768355666a5c4ff3f466c29c240ea8cf` is now the superseded RC; no
> replacement implementation SHA exists until this repair is reviewed and
> explicitly committed.

> **Post-candidate stabilization:** The frozen RC repairs the
> plan-completion row-ID regression, stale projection, later-pass L2 promotion,
> optional-AI lookup and Windows link-check harness. A fresh eight-stage quality
> gate passes; see `work/reports/v0-stabilization-2026-07-18.md`. Real
> observations and F1-F4/user acceptance are still pending.

This repository currently contains an implemented **V0 local learning loop under repair and validation**. The product direction is a learning-navigation and code-growth platform; the implemented app has not yet been accepted as a complete V0 release. The active repair plan is `docs/superpowers/plans/2026-07-21-v0-verdict-gated-capture-repair.md`; closeout resumes only after real-Chrome validation and a replacement RC freeze.

It provides:

- a small problem-metadata catalog;
- deep links to original OJ problem pages;
- a Chrome extension that detects user-visible training events;
- a paired, session- and submission-aware local capture API;
- captured and manually entered local attempts, with traceable corrections and logical voiding;
- Coach and Growth pages that use active attempts by default;
- a V0 **manual learning loop** (implemented; observation and acceptance pending): curriculum package 1.0.1 has 12 nodes, 12 reviewed resources, 12 mapped practice tasks (11 domestic OJ links across LeetCode.cn, Luogu and NowCoder plus one manual Git exercise), 13 prerequisite edges and 9 career summaries; a 6-prompt resumable diagnosis with starting-node override; deterministic candidate selection with semantic alternatives; an atomic completion loop that records attempt, attempt→node mapping, ability projection and successor plan; optional opt-in per-completion AI reflection (default disabled, network-denial guard, deterministic fallback). V0 introduces the `/map`, `/plan`, and `/today` pages and the underlying services, repositories, migrations 0006/0007/0008, and validators.

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

Load `extension/dist` as an unpacked extension in Chrome. Keep the local app running at `http://localhost:3000`. An exact submit click creates only a local waiting intent; a new evidence-backed final verdict creates one atomic attempt bundle and sends it to `/api/capture/attempts`. Opening, closing, navigating, running, or debugging alone does not create a pending training result.

Before the first capture, open `/settings`, create a ten-minute pairing code, and paste it into the extension popup. The app stores only a hash of the long-lived credential. `/settings` can issue a targeted rotation code or revoke an installation; `installationId` remains correlation metadata and is not itself authorization.

## Training Records Loop

The training loop turns captured browser events into local training attempts:

- `/training?platform=leetcode&externalId=two-sum&title=Two%20Sum` opens the domestic canonical `leetcode.cn` problem link and shows capture plus problem-specific attempt status;
- `/api/capture/attempts` validates and stores each completed four-event attempt bundle in one SQLite transaction; exact replay is idempotent and any failure rolls back the whole bundle;
- `/api/capture/events` remains available for older clients, but the V3 extension does not use it for new capture;
- `/api/attempts/recent` accepts an explicit bounded limit and optional `platform` + `externalId` scope; the training workspace requests only its current problem;
- `POST /api/attempts` creates a server-labelled manual attempt; correction and void endpoints require an expected revision and a reason;
- `/coach` and `/growth` read the same local attempts to show empty-state or rule-based feedback.

The Training workspace labels each attempt as `Automatic capture` or `Manual entry`. Corrections can change only result, language, duration, reflection, start time, or end time. They update the current row and append scalar old/new values in one transaction; they never create another attempt. Voiding is idempotent and traceable. Active Training, Coach, and Growth queries exclude voided rows by default.

Capture protocol V3 records no page-lifecycle event. An exact submit click
creates one pending intent. A later final verdict, observed either through a
same-document transition or an exact result document, consumes that intent and
creates one stable four-event attempt bundle. Opening, closing, navigating,
running samples, debugging, or directly viewing historical results does not
create a training record.

The background worker drains completed bundles from `captureOutbox` with one
serialized, single-flight executor. Item-specific 400/409/413/415 failures move
only that bundle to `captureQuarantine`; capped 500 failures are quarantined;
network and 401/403 failures preserve the complete outbox. A matching ACK
removes exactly one bundle. The popup separates waiting, outbox, and quarantine
counts and provides retry/delete/clear controls with pressed-state and live-text
feedback.

Extension unit tests cover SPA and cross-document result observation, storage,
ACK matching, outbox concurrency, and popup behavior. The full Playwright E2E
gate validates the API and SQLite projection; a separate local extension smoke
run loads the unpacked MV3 build and validates the synthetic task-to-result
lifecycle without performing an external OJ submission.

Platform adapter readiness is tracked in a formal `PLATFORM_ADAPTERS` registry (`extension/src/platforms.ts`) with status levels `production`, `experimental`, or `disabled`. The status is certification metadata, not a runtime feature switch. AtCoder remains the sole `production` adapter, certified with public verdict DOM fixtures on 2026-07-17 (`work/reports/phase-0-atcoder-certification.md`); LeetCode, NowCoder, Codeforces, and Luogu remain `experimental` until their own production evidence gates pass. User-authorized evidence now includes a real LeetCode.cn TLE recovery in addition to the sanitized authenticated-characterization fixtures. LeetCode extraction collapses identical visible verdict panes, rejects conflicting panes, and accepts the selected submission-detail surface only after it contains a recognized final verdict; transient labels such as `提交详情` are not failures. The extension never scans the whole `body`. This evidence improves LeetCode runtime confidence but does not by itself certify the adapter or the other experimental platforms.

The V3 extension migration intentionally discarded the legacy pre-bundle
`eventQueue` once because those entries could not prove submit-to-verdict
causality. It records the actual removed count locally. The user's real reload
already confirmed 32 entries were removed; the migration never deletes server
attempts or edits Chrome LevelDB directly.

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
