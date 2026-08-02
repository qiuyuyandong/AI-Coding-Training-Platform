# Architecture

Last updated: 2026-08-02 (V4 Phase C C0-C5 engineering complete; C1 LeetCode experimental; C2 AtCoder, C3 Codeforces, C4 Luogu blocked; historical AtCoder DOM production unchanged)

## Overview

The app is a local-first unified OJ training memory system. It opens original problem pages through deep links, receives user-visible browser capture events from a user-installed extension, stores local training records in SQLite, and renders deterministic Coach/Growth insights from those records.

This document describes the current implementation. The accepted future product direction is a staged move from this local pilot to a hosted SaaS after validation; see `docs/decisions/0001-local-pilot-to-cloud-saas.md`. Accounts, cloud sync, hosted AI, editor-agnostic project evidence, and multi-tenant storage are not implemented today. The product does not plan editor activity or workspace-footprint monitoring.

## Runtime modules

```text
Chrome MV3 extension
-> one-time pairing -> hashed installation credential
-> authenticated POST /api/capture/attempts
-> one SQLite transaction: capture_events + deterministic projection
-> training_sessions + training_attempts
-> /training, /coach, /growth

Manual Training form
-> same-origin POST /api/attempts
-> training_attempts(record_source = manual)
-> /training, /coach, /growth
```

The V4 Phase 0 extension detects supported problem pages and visible verdict
state without treating a click as a submission fact. A trusted, visible,
enabled exact control may create one bounded E0 hint in
`chrome.storage.session`; the hint cannot create waiting, a bundle, or server
traffic. Passive verdict candidates are also unable to create bundles in this
phase. The V3 four-event bundle remains the durable delivery format for items
already present in `captureOutbox`.

`extension/src/contentRuntime.ts` owns passive verdict observation and minimal
E0 construction. `content.ts` adapts Chrome `popstate`, `hashchange`, DOM
mutations, `pagehide`, `pageshow`, and a 500 ms URL poll fallback. It rejects
untrusted, hidden, disabled, and `aria-disabled` clicks. NowCoder E0 is limited
to visible enabled `button.btn-submit` controls labelled exactly `保存并提交`;
broader historical label matching no longer reaches capture state.

`extension/src/serializedWork.ts` orders initialization, session-hint storage,
outbox mutation, and delivery. The V3-to-V4 migration writes protocol V4,
validated empty `confirmedSubmissions`, and a migration audit before removing
`pendingSubmissionIntents`. `outboxDrain.ts` continues to deliver completed V3
bundles and isolate item-specific failures. The popup reads waiting only from
validated confirmed submissions and separately reports transition, outbox,
quarantine, migration, and recovery state.

### V4 evidence core and data plane (Phase A closeout scope, 2026-07-26)

The V4 Phase A infrastructure (Tasks A0-A12) is a framework, not a real
network matcher. Every real platform's `V4NetworkStatus` remains
`uncharacterized`. The seven canonical capture states (IDLE /
REQUEST_OBSERVED / REJECTED / AMBIGUOUS / EXPIRED / SUBMISSION_CONFIRMED /
FINALIZED) are projections of a 9-kind input stream: 4 V3 event variants
(`v3_session_started`, `v3_submission_observed`, `v3_verdict_observed`,
`v3_session_ended`), V4 Safe Evidence (`e1_recorded` / `e0_recorded` / etc.),
and 4 A3 correlator outcomes (`main_bridge_correlated` /
`main_bridge_ambiguous` / `main_bridge_no_match` / `main_bridge_rejected`).
The closed 4-effect union (bundle / rejected / ambiguous / ignored) is the
only mutation surface; every effect carries `observedAt`. Waiting only
increments on `SUBMISSION_CONFIRMED`. V3 historical `submit_clicked`
remains accepted; V4 E2-driven bundles carry the additive action
`submission_confirmed`.

`extension/src/evidence.ts` defines the Safe Evidence discriminated union
(E0 / E1 / E2 / E3 / Ambiguity / Rejection). `parseSafeEvidence` is
the only trust boundary: structural parse via Zod, recursive
forbidden-key gate (`body` / `code` / `headers` / `token` / `username`
/ `account` etc., any depth, cycle-safe via WeakSet), canonical
UTC ISO `receivedAt` with real Gregorian date validation, and E1's
required Chrome `apiTimeStamp`.

`extension/src/submissionCorrelator.ts` is a pure correlator with frozen
state, closed discriminated-union outcomes, deterministic
`parseMainBridgeSummary` (canonical UTC + numeric + non-negative +
recursive forbidden-key gate). The `e1_window_expired` ambiguity path is
reachable when at least one in-window + one out-of-window candidate exist.
External submission id never appears inside the correlator without
`parseMainBridgeSummary` validation.

`extension/src/captureStateMachine.ts` is the canonical 7-state reducer.
`bundle_${sha256HexBytes(canonical)}` uses a pure-JS SHA-256
(byte-identical to Node's `createHash("sha256")` for the canonical A4
fixture `bundle_91b8a3600f18390ffdee270d325ddd1d92295484e6552dc4b8b5f866782ca7f2`)
and a 4-byte big-endian uint32 length-prefix encoder. The pure-JS path
replaces `node:crypto` / `Buffer` so the module bundles under Chrome MV3
without Node-only APIs.

`extension/src/adapters/{contract,registry}.ts` is the single source of
truth for host ownership, DOM status, V4 network status, version, and
`networkPolicy`. `extension/src/platforms.ts` re-exports the contract
for backward compatibility. `tests/unit/extensionAdapterContract.test.ts`
runs the AST-based dependency graph that blocks direct/transitive
storage / outbox / transport / state-machine imports inside
`extension/src/adapters/**`.

`extension/src/networkObserver.ts` registers five host-scoped
`chrome.webRequest` lifecycle listeners (onBeforeRequest / onBeforeRedirect
/ onResponseStarted / onCompleted / onErrorOccurred) over the four OJ
host families (leetcode/nowcoder/luogu/codeforces), with
`OJ_RESOURCE_TYPES` (xmlhttprequest/main_frame/sub_frame). AtCoder is
explicitly excluded so the synthetic AtCoder spike listener continues
to work. Every detail is validated through `parseSafeEvidence`; raw
fields like `body` / `requestHeaders` produce `ignored corrupt_record`.

`extension/src/mainWorldBridge.ts` is the IIFE MAIN-world bridge (built
as `extension/dist/main-world-bridge.js` via `extension/build.mjs`,
gated to the four OJ hosts through `extension/manifest.json`'s
`web_accessible_resources`). The `mainWorldBridge.ts` parser rejects
synthetic inputs that exceed 18 fields, have nested arrays/objects beyond
the schema, or contain any A1-forbidden key. `mainWorldRelay.ts` is
the ISOLATED-world relay that re-validates each summary, runs a
recursive forbidden-key gate, and emits a frozen `V4_FORWARD_BRIDGE`
envelope to the background.

`extension/src/backgroundOrchestrator.ts` is the pure data plane (no
`chrome.*` calls, every side effect through the injected
`ExtensionInitializationStorageSplit`). It accepts 9 input kinds
including the 4 A3 correlator outcomes and the synthetic `e1_recorded` /
`e0_recorded` / `v3_verdict_observed` / `user_action` / `v3_submission_intent_recorded`
events. `pruneOrchestratorSession` is called on every apply path; the
`expireCaptureUiHints` alarm is re-established even on empty-diff prune
via a `periodInMinutes: 1` fallback so the slot is never lost.

`extension/src/transientEvidenceStorage.ts` (session-only) and
`extension/src/confirmedSubmissionStorage.ts` (local-only) own the
dual-domain storage. The session surface (UI hints 30 s, E1 5 min,
page contexts 30 min, unmatched E3 60 s, ambiguity diagnostics 24 h)
carries V4 transient evidence; nested E1/E3 records are revalidated
through `parseSafeEvidence`. The local surface
(`${platform}:${externalSubmissionId}` storageKey; bounded tombstones
256 by default) carries confirmed submissions and tombstones; the
`applyExtensionInitializationSplit` write plan is a structural diff that
preserves durable outbox / quarantine / pairing / tombstones and only
re-emits keys whose value differs.

### V4 test infrastructure (Phase A closeout)

`tests/extension-e2e/capture-v4-network.spec.ts` is the Fake OJ matrix:
29 Playwright tests covering 18 named scenarios from the Phase A plan
(success / 302 redirect / SPA / business rejection / 4xx / cancellation /
judging-then-final / immediate final / rapid resubmission / two concurrent /
duplicate submission id / forged bridge / one-summary-multiple-E1 /
cross-tab-frame-document / service-worker restart / browser restart /
direct historical result / duplicate verdict) plus 3 cross-platform
smoke tests (LeetCode / Codeforces / Luogu) and 8 supporting seam
tests. After Phase A A11 closeout the lane reports 31 passed and 1
skipped; the service-worker-restart scenario is skipped because its
post-restart `worker.evaluate` returns a stale execution context in
Playwright bundled Chromium (a known test-harness limitation, not a
production defect; the module docblock in
`capture-v4-network.spec.ts` and the `test.skip` annotation
document the skip and reference the Phase A closeout report).
`extension/src/mainWorldRelay.ts` was hardened with a recursive
forbidden-key gate as part of A9 closeout.

Task A10 adds `tests/extension-e2e/capture-v4-full-chain.spec.ts`, a
smoke test that proves the disposable SQLite lifecycle + production
extension artifact + scenario identity helpers + default-DB
preservation. The full E2->E3->real-popup-pair->real-API->SQLite
delivery probe and the worker-restart recovery probe remain out of
Phase A scope. Task A11 integrates `npm run extension:e2e` into the
canonical nine-stage `quality:gate` (after `extension:check` and before
`build`), giving each E2E lane its own temporary storage lifecycle:
`.tmp/playwright/` for the offline lane and `.tmp/playwright-extension/`
for the extension lane. The `scripts/a10-bootstrap.mjs` helper is a
reusable, idempotent bootstrap for future webServer-based integrations
(currently unused by the A11 gate). A12 reconciles the plan and produces
the final closeout report; see `work/reports/phase-a-final-closeout.md`.


The service worker stores the long-lived credential in Chrome local storage;
when the runtime exposes `StorageArea.setAccessLevel`, it restricts that area to
trusted extension contexts. Older or reduced Chromium runtimes that omit the
capability continue initialization instead of crashing. Content scripts receive
only installation ID, capture-enabled state, and provenance. `installationId`
remains a logical correlation value. A separate random bearer credential
authorizes writes and is bound to that ID by the server. Explicit web origins
are rejected, but Origin is defense in depth rather than identity.

Platform adapter readiness is tracked in a formal `PLATFORM_ADAPTERS` registry (`extension/src/platforms.ts`) with three status levels: `production`, `experimental`, `disabled`. Readiness is evidence metadata and does not branch the runtime detector. AtCoder is the sole `production` adapter; LeetCode, NowCoder, Codeforces, and Luogu remain `experimental`. Domestic problem routes stay strict. LeetCode accepts exact `/submissions/detail/<id>` and `/problems/<slug>/submissions/<id>` routes. It also accepts the restored `/problems/<slug>/` URL as exact-result-equivalent only when the unique first-party `#submission-detail_tab` is inside the official tabbar, currently selected, visible, and exposes a recognized final verdict. The current UI's duplicate `console-result` panes are collapsed when identical and rejected when conflicting; transient detail chrome such as `提交详情` is ignored. NowCoder `view-submission?submissionId=<id>` and Luogu `/record/<id>` continue to require one unique, visible, bounded first-party problem anchor. No adapter scans the whole `body`. Authenticated characterization and the real LeetCode TLE recovery improve runtime evidence but do not bypass the public-DOM production certification gate.

## App routes

| Route | Role |
|---|---|
| `/` | Landing navigation for the local app. |
| `/sources` | Source registry overview. |
| `/problems` | Metadata-only problem catalog entry point. |
| `/training` | Opens original OJ problem links and shows capture/attempt status panels. |
| `/coach` | Deterministic local Coach summary, signals, and recommendations. |
| `/growth` | Local attempt counts, rates, distribution, and recent activity. |
| `/compliance` | Product compliance boundaries. |
| `/settings` | Creates one-time pairing/rotation codes and lists or revokes local extension installations. |

## API routes

| API | Role |
|---|---|
| `POST /api/capture/events` | Authenticates the paired installation, validates a bounded V2 event, and atomically saves the raw event plus deterministic projection. |
| `POST /api/capture/attempts` | Authenticates the paired installation, validates one strict completed-attempt bundle, and atomically writes all four raw events plus the final projection. |
| `POST /api/capture/pairing-codes` | Same-origin management endpoint that creates a ten-minute new-installation or targeted rotation code. |
| `POST /api/capture/pair` | Consumes a one-time code and returns a fresh installation credential once. |
| `POST /api/capture/installations/:id/revoke` | Same-origin management endpoint that revokes an installation. |
| `GET /api/capture/status` | Returns recent capture events for `CaptureStatusPanel`. |
| `GET /api/attempts/recent` | Returns explicitly limited materialized attempts, optionally scoped by the paired `platform` and `externalId` query parameters. |
| `POST /api/attempts` | Creates one manual attempt and assigns its source on the server. |
| `PATCH /api/attempts/:id` | Corrects whitelisted business fields with optimistic revision checking and a required reason. |
| `GET /api/attempts/:id/corrections` | Returns lightweight scalar correction history, including void history. |
| `POST /api/attempts/:id/void` | Logically voids an attempt with idempotent replay semantics. |
| `GET /api/problems` | Lists local problem metadata. |
| `POST /api/problems/seed` | Local development helper that seeds the small problem catalog. |
| `GET /api/sources` | Lists local source metadata. |

## Data model

The SQLite schema is defined by migrations under `lib/db/migrations`.

| Table | Purpose |
|---|---|
| `schema_migrations` | Applied migration tracking. |
| `problems` | Metadata-only local problem records. |
| `capture_events` | Raw local capture events with a stable payload fingerprint; V3 writes completed four-event bundles atomically. |
| `training_sessions` | One logical problem-page session; `ended_at` is nullable because `SESSION_ENDED` is best effort. |
| `training_attempts` | One current attempt row. Captured rows retain session/submission identity; manual rows have no synthetic capture identity. Source, revision, and optional void metadata are stored directly. |
| `attempt_corrections` | One scalar old/new row per actually changed field, grouped by correction ID and reason. It is audit metadata, never another attempt. |
| `capture_installations` | Hashed credential, version, state, and audit timestamps for logical extension installations. |
| `capture_pairing_codes` | Hashed, expiring, one-time codes optionally scoped to an installation rotation. |

Raw event insertion and projection run in the same SQLite transaction. Event identity is content-sensitive: the same `eventId` and fingerprint is an idempotent replay, while the same `eventId` with a different payload is a conflict. Verdicts may arrive before submissions, multiple submissions remain distinct within one session, and a missing session-end event is valid.

Migration `0003_capture_sessions_and_submissions.sql` is a deliberate V1 cutover: it drops legacy capture events and attempts while preserving problem metadata. The extension similarly discards its old V1 queue once and stores the discard timestamp and count.

Migration `0004_capture_credentials.sql` preserves all V2 sessions, events, and attempts, adds credential tables, and permits both `extension_unpaired` and `extension_paired` provenance. Authentication, raw insertion, projection, and installation last-seen update share one outer transaction.

Migration `0005_attempt_manual_corrections.sql` rebuilds only `training_attempts` to add server-owned `record_source`, optimistic `revision`, nullable capture identity for manual rows, and paired void metadata. It copies every existing V2 attempt as active `capture` data, then adds `attempt_corrections`. It does not clear sessions or raw events.

## Service boundaries

- `lib/capture/protocol.ts` owns the browser-safe event contract and stable serialization; `lib/capture/attemptBundle.ts` owns the strict V3 bundle and ACK schemas.
- `lib/capture/fingerprint.ts` owns the server-only SHA-256 event fingerprint.
- `extension/src/platforms.ts` owns pure platform page/verdict detection, including supported English and Chinese verdict text patterns.
- `extension/src/contentRuntime.ts` owns capture decisions independently of Chrome globals.
- `extension/src/attemptStorage.ts`, `extension/src/outboxDrain.ts`, and `extension/src/serializedWork.ts` own intent matching, atomic bundle storage, and ordered delivery.
- `extension/src/extensionOperation.ts` terminates fire-and-forget Chrome promises so popup/content operations cannot become unhandled extension errors.
- `lib/repositories/**` owns SQLite row mapping and persistence helpers.
- `lib/services/captureTransition.ts` owns pure deterministic session/attempt transitions.
- `lib/services/captureMaterializer.ts` owns the raw-event-plus-projection transaction.
- `lib/services/captureCredentials.ts` owns pairing, rotation, revocation, authorization, and high-entropy secret hashing.
- `lib/services/canonicalProblemUrl.ts` owns platform-specific problem identity and canonical URL normalization.
- `lib/services/coachAnalysis.ts` turns attempts into deterministic Coach signals and recommendations.
- `lib/services/growthStats.ts` combines full-dataset SQL aggregates with a separately bounded recent-activity list.
- `lib/services/manualAttempts.ts` creates manual attempts without fabricating capture sessions or submissions.
- `lib/services/attemptCorrections.ts` validates the correction whitelist and owns transactional current-value/history writes plus idempotent voiding.
- `tests/helpers/luoguFixtureMetadata.ts` owns the canonical `EvidenceTier` type, Zod fixture-metadata schema, and deterministic directory loading for the Luogu DOM fixture corpus.

Pages should not duplicate Coach/Growth decision logic. They should read attempts, call the service, render the returned model, and close the database.

Attempt repository queries require an explicit limit between 1 and 100 and exclude `voided_at` rows unless a correction/diagnostic path explicitly requests them. Problem scope uses normalized `(platform, externalId)` identity. Time windows are lower-bound inclusive and upper-bound exclusive. Growth counts every active eligible row through SQL aggregation, including drafts in total attempts but excluding drafts from the pass-rate denominator; its activity list is independently limited to five. Coach intentionally analyzes only the latest 50 active attempts and labels that window in the UI.

## QA lifecycle

`playwright.config.ts` starts `npm run dev -- -p 3000` through Playwright `webServer` for e2e tests. `tests/e2e/**` is excluded from Vitest in `vitest.config.ts`, so `npm run test` and `npm run e2e` are separate gates.

Playwright enforces a disposable `TRAINING_DB_PATH`, refuses to reuse an existing port-3000 server, and removes `.tmp/playwright` during teardown. Playwright owns `.tmp/playwright/training-platform.sqlite` exclusively and never writes to the default `training-platform.sqlite`. E2E database cleanup uses an `lstatSync`-based safe walker that handles symlinks, junctions, and broken reparse points without following their targets. A corresponding unit test suite (`tests/unit/e2eDatabase.test.ts`) exercises junction/symlink scenarios; one file-symlink capability test is skipped under EPERM (standard on Windows without Developer Mode), while all mandatory junction tests pass.

`scripts/quality-gate.mjs` owns a separate disposable aggregate gate. It creates its own OS-temporary directory under `os.tmpdir()`, sets `TRAINING_DB_PATH` to that directory for every subcommand, runs the nine stages (lint, disposable migration, curriculum:validate, unit tests, typecheck, E2E, extension parity, extension E2E, production build) in that order, then removes the directory in a `finally` block. The runner never opens, hashes, or migrates the default `training-platform.sqlite`; that database remains the developer's local source of truth. A `git check-ignore` verification of `extension/dist` keeps the gate's generated state out of the working tree.

GitHub Actions mirrors the same gate. `.github/workflows/quality-gate.yml` runs `windows-latest` with Node 22, installs Chromium, and calls only `npm run quality:gate`. CI does not deploy, upload database artifacts, read secrets, or call external product, OJ, AI, or analytics APIs. The CI database lives in a GitHub-managed workspace path and is removed with the runner.

Extension unit tests cover actual SPA runtime decisions. Playwright does not load the unpacked MV3 extension; its SPA-shaped scenario validates the resulting end/start event sequence through the API, SQLite, and problem-specific UI. The extension's `vitest.extension.config.ts` runs only the focused set of extension-owned unit and certification tests; the full unit suite still uses `vitest.config.ts`.

That statement applies to ordinary `npm run e2e`, which remains extension-free.
Phase A Task A0 adds a separate `npm run extension:e2e` spike that loads exact
production `extension/dist` in bundled persistent Chromium. Its temporary exact
synthetic POST seam proves `route.fulfill()` reaches both Playwright and MV3
`webRequest`, and CDP verifies worker `stopped -> running`. At the Phase A A0
boundary this was framework evidence only: it did not yet provide E2, response
interpretation, a real-platform network policy, or an API/SQLite chain. The
NowCoder Phase B section below records the later experimental additions.

The localhost credential protects the HTTP ingestion boundary, not a compromised host. A process able to modify SQLite or the Chrome profile is outside this Pre-V0 boundary.

## NowCoder Phase B Experimental Network Pilot

The authorized 2026-07-27 no-submit route reached the exact contest list then
problem with waiting at zero and exported the strict two-E0 fixture. The
restart-safe lifecycle closeout at `b589776` adds black-box A-D verification:
CDP terminates or wakes the MV3 Worker, exact Fake OJ routes load the
production content script, and the actual popup status/export path observes
recovery. A real extension reload clears the session and disables export.

B4 later characterized the safe exact request chain. B5-B6 added a strict
experimental network policy: exact submit/status paths, one five-second
same-document candidate, decimal stable ID, exact result route, and closed
verdict taxonomy. B7 proves the production dist through eight NowCoder
scenarios, including restart and disposable API/SQLite delivery.

B8 observed trusted E0, real E1/E2, stable ID `84258557`, and the matching
public final verdict, but the real result document did not emit E3 because
the declarative content script did not run. The blocker was therefore
upstream of verdict parsing and E3 correlation, not in the E3 policy
itself. Confirmed state remained fail-closed and SQLite stayed empty.

### Phase B E3 ingress repair (2026-07-29, Tasks 0-6)

The Plan
`docs/superpowers/plans/2026-07-29-v4-nowcoder-e3-ingress-repair-and-retest.md`
adds the missing content-ingress layer:

- `extension/src/contentIngress.ts` (pure coordinator): closed
  7-input / 5-effect reducer with `committed`, `completed`,
  `history_state`, `startup`, `ready`, `injection_result`,
  `cleanup` inputs and `inject`, `ready_record`, `ignored`,
  `diagnostic`, `cleanup` effects. The URL gate accepts only
  `https://ac.nowcoder.com/acm/contest/view-submission?submissionId=[0-9]{1,20}`
  (no trailing slash — synchronized with
  `extension/src/adapters/nowcoder/network.ts:readResultPageSubmissionId`).
  Top-frame only (`frameId === 0`), `tabId >= 0`, document identity
  preferred over synthesized `(tab, frame)` keys, transient registry
  bounded at 100 entries. The `CONTENT_RUNTIME_READY` parser enforces
  exactly three closed fields (`type`, `schemaVersion: 1`,
  `purpose: "capture"`).
- `extension/src/contentBootstrap.ts` (isolated-world guard):
  three-state sentinel `installed | installing | inactive`. The second
  static or programmatic injection reannounces ready but cannot install
  another capture runtime. If `install()` returns `false` (capture
  disabled), the sentinel is cleared and the state remains quiescent
  until a later opt-in.
- `extension/src/background.ts` (self-healing injection): registers
  `chrome.webNavigation.{onCommitted,onCompleted,onHistoryStateUpdated,onErrorOccurred}`
  listeners, calls `chrome.scripting.executeScript` with
  `world: "ISOLATED"`, `files: ["content.js"]`, `injectImmediately: true`,
  and prefers `target: { tabId, documentIds: [docId] }` whenever Chrome
  supplies a document id (otherwise `frameIds: [0]`). The
  `reconcileOpenNowCoderResultTabs` helper runs at worker initialization
  and on `chrome.runtime.onStartup` to recover an already-open eligible
  result tab.
- Closed control-plane persistence (never enters capture state):
  `session.contentIngressReady` (max 20 entries) records ready
  handshakes observed by Task 5 only;
  `session.contentIngressDiagnostics` (max 20 entries) records
  `injection_failed` reason codes only. Both keys use a closed schema
  validated through a dedicated reader.
- `extension/manifest.json` adds `scripting` and `webNavigation`. The
  static `content_scripts` matches and per-host `host_permissions`
  are unchanged. No `<all_urls>`, no `tabs`, no `activeTab`, no
  `allFrames`, no MAIN-world execution.

Task 5 (`tests/extension-e2e/capture-v4-nowcoder-task5-real-observation.spec.ts`)
and Task 6 (`tests/extension-e2e/capture-v4-nowcoder-task6-real-retest.spec.ts`)
are fresh-profile Playwright bundled-Chromium tests against the
production-built `extension/dist`. Task 5 observes one
`contentIngressReady`, one unmatched E3 with the expected
`externalSubmissionId`/`problemExternalId`/`verdict`, empty
`confirmedSubmissions/outbox/quarantine`, and unchanged default
`training-platform.sqlite` metadata. Task 6 observes the full E0 → E1 →
E2 → E3 → bundle → `POST /api/capture/attempts` → SQLite training
attempt chain and proves reload does not duplicate the bundle.

NowCoder remains `experimental` for DOM and V4 network readiness; the
adapter is engineering-ready but promotion requires a separate
reviewed decision with broader real-platform evidence.

## Phase C-D readiness contract and template (2026-07-30, C0 closeout)

Phase C-D re-platforms the remaining OJ adapters through a reviewed
delta plan per platform. Before any platform code changes, every
wave must satisfy the C0 readiness contract:

- `docs/superpowers/plans/templates/v4-platform-network-migration-template.md`
  is the only template that a future C1-C4 delta plan may derive from.
- `docs/superpowers/specs/v4-adapter-readiness.json` is the canonical
  readiness manifest. It is validated through
  `scripts/validate-v4-adapter-readiness.mjs --all` and the unit suite
  `tests/unit/v4AdapterReadinessValidator.test.ts`.
- The manifest must include a non-blank characterization `date`,
  `source` (an existing repo-relative path), `tier` (`public` or
  `authenticated`), the exact `requestMatcher`, `e2Policy`, `e3Policy`,
  a non-empty `privacyFields` array, a non-empty `fakeOjCases` array,
  a non-empty `realObservation` repo-relative path that resolves on
  disk, a `failureDisposition`, and the `productionCertification: true`
  flag if the status is `production`. Authenticated characterization
  cannot produce `production`.
- Registry parsing in the CLI is brace-aware: it strips single-line
  comments before matching `v4NetworkStatus: "<status>"`, so a comment
  quoting the wrong status cannot smuggle a wrong pass.
- `disabled` is a valid terminal readiness state and only requires a
  `disableReason`; evidence paths are not required for `disabled`.
- Tests cover registry/document disagreement, missing and absolute
  evidence paths, comment-masking, authenticated-as-production
  rejection, and the `disabled` ladder.

C0 implementation (executed on 2026-07-30 and included in the Phase C closeout) adds:

- `tests/helpers/v4AdapterReadinessContract.ts` (type/runtime shape) +
  `tests/helpers/v4AdapterReadinessContract.cjs` (plain-Node runtime so
  the CLI does not need a TypeScript loader) +
  `tests/types/v4AdapterReadiness.d.ts` (ambient declarations).
- `scripts/validate-v4-adapter-readiness.mjs` (CLI: `--all` only;
  exit codes `0` PASS, `1` failures, `2` usage).
- `tests/unit/v4AdapterReadinessValidator.test.ts` (20 cases).
- `extension/src/adapters/registry.ts` docblock refresh + `disabled`
  terminal status.
- `docs/superpowers/plans/2026-07-30-v4-leetcode-network-capture-migration.md`
  (C1 plan, terminal `V4_EXPERIMENTAL` after the v6 same-build
  LeetCode.cn observation).

NowCoder's existing `experimental` V4 readiness is preserved through
the manifest and remains governed by Phase B's terminal closeout. The
E3 ingress repair at `c26c578` is the engineering baseline.

C1 adds a closed LeetCode legacy submit/check policy and the current
trusted-E0 + completed GraphQL + exact result-distribution policy. Adapter
`v4-leetcode-network-6` emits a plain problem slug and a `.cn`/`.com`
namespaced submission ID. Confirmation storage preserves the first E2
timestamp, rejects crossed problem identity, and treats final tombstones as
authoritative after the confirmed record is removed. The real v6 observation
delivered `cn/739108591` into 4 capture events, 1 session, and 1 non-voided
SQLite attempt. LeetCode remains network-`experimental`; authenticated
evidence cannot certify production. C2 AtCoder and C3 Codeforces both close
as network-`blocked`: each observed platform uses a main-frame form navigation
for which Chrome omits `webRequest.documentId`, and each approved landing path
omits the stable submission/problem identity required for E2. Neither network
adapter was implemented. C4 Luogu also closes network-`blocked`: its natural
P1001 submit E1 and numeric record landing occurred in different browser
documents without an approved continuity signal, so no adapter was
implemented. C5 removes the reachable V3 click-derived pending-intent event
and verdict fallback. Upgrade initialization still reads and deletes the old
`pendingSubmissionIntents` key, and existing durable outbox bundles remain
deliverable. `tests/unit/extensionV4Isolation.test.ts` pins owner-only request
interpretation, platform-namespaced submission IDs, durable-state isolation,
terminal readiness coverage, and absence of synthetic Fake OJ registry claims.
