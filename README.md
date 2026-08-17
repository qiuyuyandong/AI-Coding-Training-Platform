# AI Coding Training Platform

> **Status (2026-08-16):** The user accepted `ISOLATED` as the replacement V4
> Phase D D4 minimum; P0A C0 alignment and P1 LeetCode offline RED/GREEN are complete on
> `feature/v1-followup`. LeetCode readiness now documents the bounded
> ActionEpoch/result-root policy; REST and GraphQL are optional corroboration,
> while conflicts, baseline replay, multiple actions, and multiple eligible IDs
> fail closed. Focused `248/248`, extension `1615/1615`, extension E2E `53/1`,
> both contract CLIs, typecheck, targeted lint, and privacy audit pass. P2
> NowCoder non-regression also passes focused `504/504` with zero NowCoder
> production diff. P3 observer-contract repair passes `43/43` with privacy
> `0 findings`, binds LeetCode E2 to one exact result/check stable ID, closes
> the observation context on the first terminal failure, and received an
> `APPROVE` independent tool review. P4 independent plan/tool review returned
> `APPROVE` with no HIGH/MEDIUM after Build ran the four offline
> verifications. P5 froze the immutable candidate
> `62e57096c29babe8370c3ad98f6bfe57a1a997f9` with an exact D3 validator PASS
> and exact dist `.tmp/p5-exact-dist-62e5709`. P6 then completed both
> READY-only lanes: LeetCode passed on the frozen tool; NowCoder first failed
> closed on the approved session key `b3WitnessState`, the bounded diagnostic
> pinned it, the user authorized the full closed ignore-list, and the fresh
> NowCoder READY lane passed (`READY=1`, DB `0/0/0`) with the refrozen tool
> hash `F0183DC7...D40911`. P7 then ran exactly one action per lane: both
> lanes failed closed (LeetCode `verdict_candidate_chronology_mismatch`
> `PROFILE_UNRESOLVED`; NowCoder `observer_stage_rejected`
> `OBSERVER_INVALID`), DBs `0/0/0`, no retry. D4 is not delivered; P8
> closeout is unmet. Live
> observation, D5/F1-F4, RC, release, push, and PR remain unauthorized.
> Historical Route A observations remain evidence for their own runs and are
> not reclassified under the new contract. LeetCode and NowCoder remain
> network-`experimental`; AtCoder, Codeforces, and Luogu remain
> network-`blocked`; historical AtCoder DOM production certification is
> unchanged.
>
> **Earlier V4 evidence (still authoritative for their own scope):**
> V4 infrastructure engineering PASS (scope-reduced) for Phase A Tasks A0-A12.
> Phase B B0-B7 completed and the B8 missing-E3 layer is closed at
> `c26c578` (Tasks 0-6 of the 2026-07-29 E3 ingress repair plan). The
> Phase B B8 terminal BLOCKED verdict from
> `work/reports/v4-nowcoder-phase-b-terminal-closeout-2026-07-28.md`
> is superseded only for the missing-E3 ingress layer; every other
> Phase B outcome remains authoritative. NowCoder remains `experimental`;
> promotion requires a separate reviewed decision. Phase A0-A12
> (`b3ec8cb` and the 12 follow-on commits through `0dc3fbf`) is the
> authoritative V4 framework engineering pass. Phase B B2 added an
> opt-in NowCoder diagnostic mode with session-backed production
> ingress isolation, worker-restart fail-closed, and exact safe
> transcript export; independent privacy review APPROVED on
> 2026-07-27. B4 safely characterized NowCoder; B5-B6 implemented the
> strict experimental adapter; B7 proves the production-dist synthetic
> full chain.
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

This repository currently contains an implemented **V0 local learning loop that is not accepted**. V4 Phase A and Phase C C0-C5 are engineering-complete; V4 Phase D D1-D3 are complete, while D4 still requires contemporaneous active-policy stage evidence and D5 has not started. Phase B Tasks 0-6 close the missing-E3 ingress layer, while NowCoder remains experimental. C1 LeetCode is `V4_EXPERIMENTAL`; C2 AtCoder, C3 Codeforces, and C4 Luogu are network-`V4_BLOCKED` under their evidence-specific identity constraints. C5 closes cross-platform isolation and the reachable V3 click/pending fallback. The historical AtCoder DOM certification remains production. Formal V0 observation and replacement-RC work remain blocked. The product direction is a learning-navigation and code-growth platform.

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

`README.md`, `docs/architecture.md`, `docs/runbook.md`, and `COMPLIANCE.md` describe the current local implementation. `IDEA.md` and the roadmap describe the approved target direction, including the later hosted Public Beta; do not treat target features as already implemented. Phase C-D's readiness contract lives in `docs/architecture.md`; the terminal C1 LeetCode plan and evidence are at `docs/superpowers/plans/2026-07-30-v4-leetcode-network-capture-migration.md` and `work/reports/v4-leetcode-c1-closeout-2026-07-30.md`. The terminal C2 AtCoder blocker is documented in `work/reports/v4-atcoder-c2-blocker-2026-08-02.md`; the terminal C3 Codeforces blocker is documented in `work/reports/v4-codeforces-c3-blocker-2026-08-02.md`; the terminal C4 Luogu blocker is documented in `work/reports/v4-luogu-c4-blocker-2026-08-02.md`; and the Phase C closeout is `work/reports/v4-phase-c-c5-closeout-2026-08-02.md`. The Phase D D1 reliability report is `work/reports/v4-phase-d-d1-upgrade-reliability-2026-08-03.md`, the D1-C disposable observation is `work/reports/v4-phase-d-d1-c-disposable-observation-2026-08-03.md`, and the D2 privacy/permission audit is `work/reports/v4-phase-d-d2-privacy-permission-audit-2026-08-03.md`; the standalone Phase D plan is `docs/superpowers/plans/2026-08-03-v4-phase-d-upgrade-restart-update-rollback-reliability.md`.

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

Load `extension/dist` as an unpacked extension in Chrome. Keep the local app running at `http://localhost:3000`. The V4 Phase 0 click-ingress stopgap ensures that an exact submit click creates only a short-lived E0 hint, not waiting state or a local intent. V4 Phase A supplies the Safe Evidence boundary, pure Capture State Machine, production webRequest observer, optional MAIN bridge, and Fake OJ matrix. Later Phase B/C work adds strict experimental LeetCode and NowCoder network policies that can produce E2/E3-backed bundles; existing completed historical bundles remain deliverable through the same V3 four-event API contract. Opening, closing, navigating, running, or debugging alone does not create a pending training result.

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
orchestrator, Fake OJ matrix, and disposable SQLite lifecycle. Later Phase B/C
work adds strict experimental LeetCode and NowCoder network policies; waiting
still arises only from an adapter-owned E2 confirmation, never from a click.

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
