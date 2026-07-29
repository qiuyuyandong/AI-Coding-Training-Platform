# AI Coding Training Platform

> **Status (2026-07-29):** **V4 NowCoder E3 ingress engineering PASS** on
> commit `c26c578` (Tasks 0-6 of
> `docs/superpowers/plans/2026-07-29-v4-nowcoder-e3-ingress-repair-and-retest.md`).
> The Phase B B8 missing-E3 layer is fixed through a pure
> `extension/src/contentIngress.ts` coordinator, an idempotent
> `extension/src/contentBootstrap.ts` sentinel, and
> `extension/src/background.ts` self-healing
> `chrome.scripting.executeScript` + `chrome.webNavigation`. Production-built
> `extension/dist` proves the chain end-to-end on a fresh profile with no
> characterization: real-Chrome Task 5 records one closed
> `contentIngressReady` and one unmatched E3 with the exact URL submission id;
> Task 6 records one bundle, one `POST /api/capture/attempts`, and one
> SQLite training attempt. `npm run quality:gate` exited 0 on 2026-07-29
> (lint clean, 92 files / 1919 unit tests / 1 pre-existing Windows skip,
> typecheck, 25/25 E2E, `extension:check` 38 files / 1191 tests,
> `extension:e2e` 47/47 on the second consecutive run, `build` PASS).
> **NowCoder remains `experimental`**; promotion requires a separate
> reviewed decision. The Phase B B8 `BLOCKED` verdict at
> `work/reports/v4-nowcoder-phase-b-terminal-closeout-2026-07-28.md`
> is superseded only for the missing-E3 layer; every other Phase B outcome
> remains authoritative. Closeout report:
> `work/reports/v4-nowcoder-e3-ingress-repair-2026-07-29.md`.
>
> **Earlier V4 evidence (still authoritative for their own scope):**
> V4 infrastructure engineering PASS (scope-reduced) for Phase A Tasks A0-A12;
> Phase B B0-B7 complete and B8 terminally BLOCKED at real-result E3 ingress;
> formal V0 observation blocked. Phase 0 click-ingress stopgap and V3
> repair work remain historical evidence, not a current acceptance anchor.
> Phase A0-A12 (`b3ec8cb` and the 12 follow-on commits through
> `0dc3fbf`) is the authoritative V4 framework engineering pass. Phase B
> B2 added an opt-in NowCoder diagnostic mode with session-backed
> production ingress isolation, worker-restart fail-closed, and exact safe
> transcript export; independent privacy review APPROVED on 2026-07-27.
> B4 safely characterized NowCoder; B5-B6 implemented the strict
> experimental adapter; B7 proves the production-dist synthetic full chain.
>
> **Closeout validator:** `tests/unit/v0ReportValidators.test.ts` exercises 21
> real temporary-repository cases for the strict two-commit release contract.
> `b5166320768355666a5c4ff3f466c29c240ea8cf`,
> `894162b264124eed7315a116cae73b8e11d717b8`, and
> `c587bfbcce2eab108a1c98455b2e6b481f71b290` are superseded repair baselines;
> `2f4f5d895ea8d965fb64d19dc784ca5514480688` is historical V3 repair evidence,
> not a current acceptance anchor.
>
> **Post-candidate stabilization:** The frozen RC repairs the
> plan-completion row-ID regression, stale projection, later-pass L2 promotion,
> optional-AI lookup and Windows link-check harness. A fresh eight-stage quality
> gate passes; see `work/reports/v0-stabilization-2026-07-18.md`. Real
> observations and F1-F4/user acceptance are still pending.

This repository currently contains an implemented **V0 local learning loop that is not accepted**. V4 Phase A is closed; V4 Phase B Tasks 0-6 close the missing-E3 ingress layer through engineering + real-Chrome observation, but NowCoder remains experimental for V4 network capture and adapter promotion. Formal V0 observation and replacement-RC work remain blocked. The product direction is a learning-navigation and code-growth platform.

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
npm run extension:e2e
npm run build
npm run quality:gate
```

`npm run lint` runs the strict ESLint flat config (`eslint . --max-warnings=0`). `npm run extension:check` chains typecheck, focused extension tests, the MV3 build, and the `extension/dist` parity/ignore check. `npm run extension:e2e` runs the new bundled-Chromium Playwright lane that loads the exact production `extension/dist` (Fake OJ matrix + A10 full-chain smoke). `npm run quality:gate` runs lint, a disposable migration, curriculum validation, unit tests, typecheck, E2E, extension parity, extension E2E, and production build in that order using an OS-temporary database and is the safe all-in-one gate. Use it instead of running individual commands when you want one reproducible verification.

`npm run e2e` creates a freshly migrated database at `.tmp/playwright/training-platform.sqlite`, starts and stops its own Next.js server, and removes the disposable database afterward. It never reuses a server on port 3000 and never writes to the default `training-platform.sqlite`. `npm run extension:e2e` writes only to `.tmp/playwright-extension/` (its own disposable SQLite under `.tmp/capture-v4-full-chain-*/`) and is forbidden from opening the default `training-platform.sqlite`.

## Browser Extension

Build the Chrome MV3 extension:

```powershell
npm run extension:build
```

Load `extension/dist` as an unpacked extension in Chrome. Keep the local app running at `http://localhost:3000`. The V4 Phase 0 click-ingress stopgap ensures that an exact submit click creates only a short-lived E0 hint, not waiting state or a local intent; only the existing completed `captureOutbox` items still use the V3 four-event bundle path. V4 Phase A introduces the Safe Evidence boundary, the pure Capture State Machine, the production webRequest observer, the optional MAIN bridge, and the Fake OJ matrix (31 passed / 1 known skip), but does not yet produce an automatic E2 confirmation; only manually entered attempts and the legacy V3 outbox deliver to `/api/capture/attempts` in this scope. Opening, closing, navigating, running, or debugging alone does not create a pending training result.

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

Capture protocol V4 Phase 0 records no page-lifecycle event and creates no
submission from a click. A trusted, visible, enabled exact control may produce
one short-lived E0 hint in `chrome.storage.session`; NowCoder is restricted to
the observed `button.btn-submit` / `保存并提交` contract. Hints and passive verdict
candidates cannot create waiting or a bundle. Opening, closing, navigating,
running samples, debugging, clicking submit, or directly viewing historical
results therefore creates no new automatic training record in this stopgap.
V4 Phase A (A0-A12, framework engineering pass) builds the Safe Evidence
boundary, strict correlator, pure capture state machine, session/local storage
split, production webRequest observer, optional MAIN bridge, background
orchestrator, Fake OJ matrix, and disposable SQLite lifecycle; no real OJ
protocol is implemented yet, so `等待判题` stays zero until Phase B ships.

The background worker drains completed bundles from `captureOutbox` with one
serialized, single-flight executor. Item-specific 400/409/413/415 failures move
only that bundle to `captureQuarantine`; capped 500 failures are quarantined;
network and 401/403 failures preserve the complete outbox. A matching ACK
removes exactly one bundle. The popup counts waiting only from validated V4
confirmed submissions, which have no producer in Phase 0, and separately shows
outbox, quarantine, migration, and transition state. Retry/delete/clear controls
retain pressed-state and live-text feedback.

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

The V4 stopgap migration separately removes every V3
`pendingSubmissionIntents` record, records only the removed active count and
migration reason/time, and never promotes one into a confirmed submission. It
preserves completed delivery and pairing data.

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
