# Architecture

Last updated: 2026-09-07 (offline V1 hardening, AI contract, Vault operations, and observer relay; theoretical evidence only)

## Overview

The app is a local-first unified OJ training memory system. It opens original problem pages through deep links, receives user-visible browser capture events from a user-installed extension, stores local training records in SQLite, and renders deterministic Coach/Growth insights from those records.

This document describes the current implementation. The accepted future product direction is a staged move from this local pilot to a hosted SaaS after validation; see `docs/decisions/0001-local-pilot-to-cloud-saas.md`. Accounts, cloud sync, platform-funded AI, and multi-tenant storage are not implemented. Editor-agnostic explicit project evidence and an optional local BYOK-compatible AI contract are implemented; neither monitors editor activity or workspace footprint.

Development state is tracked independently as `theoretical-ready` (offline and
synthetic proof), `runtime-validated` (real browser/provider/Windows proof),
and `release-ready` (pilot, acceptance, and release gates). One state never
implies either later state.

Phase D now uses the user-authorized `ISOLATED` contract for future offline
work. Historical same-SHA deliveries and the Route A closeout remain factual
evidence for their own runs but cannot be relabelled or used to satisfy the new
profile. P1 implements the offline LeetCode ActionEpoch/result-root branch; it
does not produce a D4 PASS or live claim. LeetCode and
NowCoder remain network-`experimental`; AtCoder, Codeforces, and Luogu remain
network-`blocked`.

## Runtime modules

```text
Chrome MV3 extension
-> one-click installation connection -> extension-only capability / app-side hash
-> authenticated POST /api/capture/attempts
-> one SQLite transaction: capture_events + deterministic projection
-> training_sessions + training_attempts
-> /training, /coach, /growth

Manual Training form
-> same-origin POST /api/attempts
-> training_attempts(record_source = manual)
-> /training, /coach, /growth

Explicit local developer activation
-> browser/server unhandled runtime exception
-> closed development-only event projection
-> Sentry environment=development + validated Git SHA
-> read-only issue inspection -> local repair -> quality gate

Explicit learner AI request
-> saved local consent + selected evidence IDs
-> shared OpenAI-compatible adapter (optional, quota bounded)
-> validated structured report or plan proposal
-> report saved locally / proposal waits for explicit accept
-> existing deterministic plan constraints before any plan revision

Stopped Local Vault process
-> versioned backup manifest + SQLite online backup + selected snapshots
-> preflight hash/SQLite/migration/reference validation
-> automatic pre-restore safety backup
-> atomic database/evidence replacement with rollback
```

`scripts/cdp-native-relay.mjs` is an observer-only compatibility transport. It
binds a random-path single-client WebSocket on `127.0.0.1`, forwards bounded
CDP text frames to the existing Chrome browser endpoint, logs no payload, and
never terminates the browser process. It is opt-in through
`--cdp-transport=native-relay`; the existing Playwright transport remains the
default. It is not part of the application or extension production bundle.

`lib/observability/sentryDev.ts` is the sole Sentry data boundary. It requires
development mode, a literal enable flag, an approved ingest DSN and a full Git
SHA. It projects only exception type plus bounded repository-relative stack
coordinates and replaces the original message with fixed text. Client and
Node.js initialization live in `instrumentation-client.ts`,
`instrumentation.ts` and `sentry.server.config.ts`; production and test
execution leave them inert. `next.config.ts` has no Sentry wrapper, source-map
upload, tunnel or automatic monitor. This developer channel never consumes
SQLite, extension or capture state and is not service observability.

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
preserves durable outbox / quarantine / connection / tombstones and only
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
preservation. The full E2->E3->Route-H-connect->real-API->SQLite
delivery probe and the worker-restart recovery probe remain out of
Phase A scope. Task A11 integrates `npm run extension:e2e` into the
canonical nine-stage `quality:gate` (after `extension:check` and before
`build`), giving each E2E lane its own temporary storage lifecycle:
`.tmp/playwright/` for the offline lane and `.tmp/playwright-extension/`
for the extension lane. The `scripts/a10-bootstrap.mjs` helper is a
reusable, idempotent bootstrap for future webServer-based integrations
(currently unused by the A11 gate). A12 reconciles the plan and produces
the final closeout report; see `work/reports/phase-a-final-closeout.md`.


The service worker stores the installation capability in Chrome local storage;
when the runtime exposes `StorageArea.setAccessLevel`, it restricts that area to
trusted extension contexts. Older or reduced Chromium runtimes that omit that
storage API continue initialization instead of crashing. Content scripts receive
only installation ID, capture-enabled state, and provenance. `installationId`
remains a logical correlation value. A separate random bearer capability
authorizes writes and is bound to that ID by the app-side hash record outside
the Vault. Explicit web origins are rejected. For the authenticated `GET
/api/capture/status` probe, a missing `Origin` is accepted only after canonical
localhost and bearer-capability checks; when present, it must equal the fixed
extension Origin. `POST` capture routes and `OPTIONS` retain the exact-origin
requirement. Origin is defense in depth rather than identity.

Platform adapter readiness is tracked in a formal `PLATFORM_ADAPTERS` registry (`extension/src/platforms.ts`) with three status levels: `production`, `experimental`, `disabled`. Readiness is evidence metadata and does not branch the runtime detector. AtCoder is the sole `production` adapter; LeetCode, NowCoder, Codeforces, and Luogu remain `experimental`. Domestic problem routes stay strict. LeetCode accepts exact `/submissions/detail/<id>` and `/problems/<slug>/submissions/<id>` routes. It also accepts the restored `/problems/<slug>/` URL as exact-result-equivalent only when the unique first-party `#submission-detail_tab` is inside the official tabbar, currently selected, visible, and exposes a recognized final verdict. The current UI's duplicate `console-result` panes are collapsed when identical and rejected when conflicting; transient detail chrome such as `提交详情` is ignored. NowCoder `view-submission?submissionId=<id>` and Luogu `/record/<id>` continue to require one unique, visible, bounded first-party problem anchor. No adapter scans the whole `body`. Authenticated characterization and the real LeetCode TLE recovery improve runtime evidence but do not bypass the public-DOM production certification gate.

## App routes

| Route | Role |
|---|---|
| `/` | Landing navigation for the local app. |
| `/sources` | Source registry overview. |
| `/resources` | Reviewed learning-resource catalog with access, license and stopping guidance. |
| `/problems` | Metadata-only problem catalog entry point. |
| `/training` | Opens original OJ problem links and shows capture/attempt status panels. |
| `/evidence` | E1-E4 conclusions, L1-L5 projections, timeline, snapshots, due reviews and assessments. |
| `/projects` | Explicit editor-agnostic project sessions, run/test facts, artifacts, rubric and milestones. |
| `/coach` | Deterministic local Coach summary, signals, and recommendations. |
| `/growth` | Local attempt counts, rates, distribution, and recent activity. |
| `/compliance` | Product compliance boundaries. |
| `/settings` | Shows the active Local Vault and performs one-click Route H extension connection. |

## API routes

| API | Role |
|---|---|
| `POST /api/capture/connect/challenges` | Issues a same-origin, 60-second single-use connection challenge. |
| `POST /api/capture/connect/complete` | Accepts one fixed-extension completion and stores only the capability hash outside the Vault. |
| `POST /api/capture/connect/status` | Polls only the bounded challenge state; never returns a capability. |
| `POST /api/capture/events` | Authenticates the Route H installation, validates a bounded V2 event, and atomically saves the raw event plus deterministic projection. |
| `POST /api/capture/attempts` | Authenticates the Route H installation, validates one strict completed-attempt bundle, and atomically writes all four raw events plus the final projection. |
| `GET /api/capture/status` | Returns the fixed authenticated connection/service health shape; requires canonical localhost + bearer capability, and checks exact extension Origin only when an Origin header is present. |
| `GET /api/attempts/recent` | Returns explicitly limited materialized attempts, optionally scoped by `platform` and `externalId` query parameters. |
| `POST /api/attempts` | Creates one manual attempt and assigns its source on the server. |
| `PATCH /api/attempts/:id` | Corrects whitelisted business fields with optimistic revision checking and a required reason. |
| `GET /api/attempts/:id/corrections` | Returns lightweight scalar correction history, including void history. |
| `POST /api/attempts/:id/void` | Logically voids an attempt with idempotent replay semantics. |
| `POST /api/evidence/assessments` | Records self-rating/dispute context without directly editing ability. |
| `POST /api/evidence/reviews/:id/complete` | Completes one open review item. |
| `POST /api/projects` | Installs and starts the versioned local project template. |
| `POST /api/projects/sessions/:id/evidence` | Records or corrects explicit run/test facts and selected artifacts. |
| `POST /api/projects/sessions/:id/complete` | Applies the rubric, closes a milestone and advances the project. |
| `POST /api/projects/sessions/:id/replace` | Cancels and replaces the current session at the same milestone. |
| `POST /api/projects/sessions/:id/export` | Exports bounded evidence metadata without raw snapshot bytes or absolute paths. |
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
| `learning_evidence_events`, `training_session_summaries` | Append-only facts plus deterministic outcome, E1-E4 coverage, reasons and unresolved facts. |
| `code_snapshot_refs`, `review_items`, `learner_assessments` | Dedicated snapshot retention, bounded next-evidence work and learner context. |
| `ability_snapshots`, `evidence_ability_transitions` | Current L1-L5 view and replay-safe evidence-cited transitions. |
| `project_templates`, `learner_projects`, `project_practice_sessions` | Versioned project definition and explicit learner/session lifecycle. |
| `explicit_run_results`, `artifact_evidence`, `project_milestones`, `rubric_assessments` | Correctable run facts, selected artifacts, milestone history and evidence-cited rubric. |

Raw event insertion and projection run in the same SQLite transaction. Event identity is content-sensitive: the same `eventId` and fingerprint is an idempotent replay, while the same `eventId` with a different payload is a conflict. Verdicts may arrive before submissions, multiple submissions remain distinct within one session, and a missing session-end event is valid.

Migration `0003_capture_sessions_and_submissions.sql` is a deliberate V1 cutover: it drops legacy capture events and attempts while preserving problem metadata. The extension similarly discards its old V1 queue once and stores the discard timestamp and count.

Migration `0004_capture_credentials.sql` preserves all V2 sessions, events, and attempts, adds credential tables, and permits both `extension_unpaired` and `extension_paired` provenance. Authentication, raw insertion, projection, and installation last-seen update share one outer transaction.

Migration `0009_local_vault_extension_origin.sql` adds `extension_local`, preserves historical provenance rows unchanged, and removes the two obsolete Vault-resident credential tables. Route H authorization metadata now lives in an OS user configuration file outside every Vault and contains only a capability hash.

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
- `lib/services/captureCapability.ts`, `lib/services/captureConnectionChallenge.ts`, and `lib/vault/captureInstallation.ts` own capability validation, single-use connection challenges, and Vault-external hash authorization.
- `lib/services/canonicalProblemUrl.ts` owns platform-specific problem identity and canonical URL normalization.
- `lib/services/coachAnalysis.ts` turns attempts into deterministic Coach signals and recommendations.
- `lib/services/growthStats.ts` combines full-dataset SQL aggregates with a separately bounded recent-activity list.
- `lib/services/manualAttempts.ts` creates manual attempts without fabricating capture sessions or submissions.
- `lib/services/attemptCorrections.ts` validates the correction whitelist and owns transactional current-value/history writes plus idempotent voiding.
- `lib/services/trainingOutcomeClassifier.ts`, `evidenceAbilityProjector.ts`, and
  `evidenceAbilityReplay.ts` separate session outcomes from capability and move
  levels one step per new evidence set.
- `lib/services/projectEvidence.ts`, `artifactIntake.ts`, and `snapshotStore.ts`
  own project progression, explicit artifact validation and dedicated local
  snapshot bytes.
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

C1 adds a closed LeetCode legacy submit/check policy. The implemented D4 P1
contract requires one trusted same-document ActionEpoch, a pre-action
result baseline, no competing action/submission, and one unique new exact
result-distribution ID; REST and GraphQL are optional corroboration and any
identity conflict fails closed. Baseline-ID replay, multiple actions or new
IDs, crossed corroboration, and historical surfaces reject; duplicate callbacks
for one stable ID coalesce. Adapter
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

## Phase D reliability, privacy, and candidate freeze (2026-08-04 historical baseline; D1/D2/D3 engineering complete)

Phase D D1, D2, and D3 candidate engineering are complete on
`feature/v1-followup` under the standalone plan
[`plans/2026-08-03-v4-phase-d-upgrade-restart-update-rollback-reliability.md`](superpowers/plans/2026-08-03-v4-phase-d-upgrade-restart-update-rollback-reliability.md).
The implementation candidate is
`509faf0e60532cf565a6a57aa796b96bc1053f38`
(`feat(v4): harden Phase D capture reliability`); the documentation-reconciled
HEAD is `78ac9c73fbfe3359dab0044d82e52cc36abd7b12`. This is engineering
evidence only, not RC, acceptance, or release.

- **D1 reliability** — the upgrade/restart/pause/recovery boundary is
  hardened in `extension/src/background.ts`,
  `extension/src/backgroundOrchestrator.ts`,
  `extension/src/installation.ts`,
  `extension/src/outboxDrain.ts`,
  `extension/src/popup.ts`,
  `extension/src/transport.ts` (via `captureTransport.ts`), and
  `extension/src/attemptStorage.ts`. A closed `lastCaptureError`
  lifecycle (`initializing → before → after → retried → idempotent`) is
  surfaced and consumed by the popup without leaking into capture state.
  The 27/27 `tests/unit/extensionV4UpgradeMatrix.test.ts` matrix covers
  every initialization mutation boundary; the five-case exact-production-dist
  D1-E and the four-case D1-R prove the closed full chain across worker
  restarts, paused retries, and disabled installs.
  `tests/extension-e2e/capture-v4-upgrade.spec.ts` exercises the
  same-build chain end-to-end. Evidence:
  [`../work/reports/v4-phase-d-d1-upgrade-reliability-2026-08-03.md`](../work/reports/v4-phase-d-d1-upgrade-reliability-2026-08-03.md)
  and the user-authorized disposable Chromium observation
  [`../work/reports/v4-phase-d-d1-c-disposable-observation-2026-08-03.md`](../work/reports/v4-phase-d-d1-c-disposable-observation-2026-08-03.md).
- **D2 privacy/permission** — `scripts/audit-v4-extension-privacy.mjs`
  is a 35-case AST/wrapper audit that rejects every forbidden-key path
  (raw fields, body, code, headers, token, account, any depth, alias and
  reflective handles). It discovers 0 findings on the candidate sources.
  The 68-case focused product privacy suite
  (`tests/unit/v4ExtensionPrivacyAudit.test.ts`) and the manifest/dist
  link check pass with `0 findings`. Independent privacy review returned
  `APPROVE`. Evidence:
  [`../work/reports/v4-phase-d-d2-privacy-permission-audit-2026-08-03.md`](../work/reports/v4-phase-d-d2-privacy-permission-audit-2026-08-03.md).
- **D3 candidate freeze** — `scripts/validate-v4-candidate.mjs` and the
  22-case `tests/unit/v4CandidateValidator.test.ts` form the immutable
  candidate gate. `CANDIDATE_ALLOWED_PATHS` is the explicit cumulative
  task-owned whitelist (the current candidate owns 133 paths);
  `GENERATED_OR_SECRET_PATH` and
  `RAW_TRANSCRIPT_PATH` reject generated dist, secret/env files, and raw
  transcripts; the runtime check rejects `lastCaptureError` drift and
  stale click-runtime symbols; `database.metadata-preserved` and
  `database.baseline-matches-before` enforce default-SQLite byte and
  mtime equality. `--candidate <sha>` reruns the real
  `npm run quality:gate`, parses the final Extension E2E summary from
  its output, and replays the candidate identity post-gate. The final
  gate exits 0 with unit `2217/1`, app E2E `25/25`, extension unit
  `1414/1414`, extension E2E `53/1`, production build `20/20`, privacy
  `0 findings`, readiness `PASS`, and default-database preservation
  confirmed. Independent D3 review returned `APPROVE` with no HIGH or
  MEDIUM findings.

### Active status-GET repair and candidate refreeze (2026-08-30)

The minimum cross-layer repair for `connection_preflight` is now implemented in
the authenticated status probe. `GET /api/capture/status` still requires the
canonical localhost host and the installation bearer capability; it permits a
missing `Origin` because the browser-controlled extension fetch may omit that
header, while an explicit Origin must match the fixed extension ID. `OPTIONS`
and capture-write routes remain exact-origin guarded. The change is limited to
the status GET handler and focused regressions.

The product fix and D8-A evidence were committed at `fd49a8f`. An initial exact
candidate attempt failed closed before the quality gate because six cumulative
D7-R4 reports were absent from the explicit ownership list. Those six paths
were added individually, without a wildcard, in validator-only commit
`ee0e1f5a2332fdeaf743e6fcfcadb0d799f869f0`, which is the current immutable
product candidate. Exact validation passed with root `2607/1`, App E2E `24/24`,
extension unit `1671/1671`, extension E2E `55/1`, build PASS, privacy `0
findings`, adapter readiness PASS and preserved default-database metadata.
The exact dist is `.tmp/v4-route-h-exact-dist-ee0e1f5`; its strict receipt is
`.tmp/v4-route-h-candidate-receipt-ee0e1f5.json` with SHA-256
`A46B79F64F4A9373D134EA918D67959BBECDD89172B7EB37B4DC7E4706188E7C`.

The previously authorized `D8-A-2026-08-30-LC1` action opportunity was
consumed before observer arm and produced no OJ page, click, submission or
NowCoder run. No current-`yu` preparation or action ran after the refreeze;
D4, RC, release, push and PR remain separately stopped. Evidence is recorded in
`work/reports/v4-phase-d-d8a-2026-08-30-status-get-candidate-refreeze.md`.

### Historical cross-project capture-chain repair (2026-08-24; superseded 2026-08-30)

The superseded immutable product candidate was
`34916705712cac1ef2e5d8816cd8e40fa4e29ca7`. It adds persistence-bound ingress
ACKs, a bounded in-memory FIFO retry queue, re-entrant single-flight
initialization, documentId-only recovery, canonical endpoint enforcement,
closed recovery status/errors, Chrome 106 minimum capability and
`unlimitedStorage` without weakening storage rejection handling. The exact
candidate validator passes with root `2550/1`, App E2E `25/25`, extension unit
`1660/1660`, extension E2E `54/1`, build `20/20`, privacy `0 findings`,
readiness PASS and preserved default SQLite metadata. Exact dist is
`.tmp/p7f6-exact-dist-3491670`; receipt is
`.tmp/p7f6-candidate-receipt-3491670.json`.

Observer compatibility remains a separate commit (`9cf7926`) and tool hash
(`EB564C52...F44DF19`). Old-candidate LeetCode and NowCoder READY-only lanes
passed without action and with databases `0/0/0`; the new candidate has not
run either READY-only lane. D4 remains incomplete until a newly authorized,
sequential LeetCode-then-NowCoder READY-only gate passes. Development-only
Sentry tooling in later commit `6c0e1d7` is outside the extension candidate
and governed by ADR 0003.

The following P1-F1 paragraph is retained as historical evidence for the
superseded `62e5709` and `915a98d` candidates. P1 offline RED/GREEN, P2 NowCoder non-regression, P3 observer-contract
repair, P4 independent plan/tool review, P5 candidate freeze, P6
READY-only preflight (both lanes), P7 platform observations (both lanes
executed once and failed closed), and the F1 diagnostic revision are
complete.
P3 binds
LeetCode E2 to one exact result/check stable ID, closes the observation
context on the first terminal failure, and binds the candidate receipt to the
SHA, dist path, and five artifact hashes; the final tool review returned
`APPROVE`. P4 re-reviewed all five contracts and its conditional PASS resolved
to `APPROVE` after Build ran the four offline verifications. P5 froze the
immutable candidate `62e57096c29babe8370c3ad98f6bfe57a1a997f9` (product-only
diff on parent `6e3fb6f`); the exact D3 validator passed with the full
quality gate and the exact dist is `.tmp/p5-exact-dist-62e5709`. P6 completed
both READY-only lanes: LeetCode passed on the frozen tool, and NowCoder
passed after the closed ignore-list fix (trigger ∪ approved non-trigger
keys, values never read) and tool-hash refreeze. P7 then ran one action per
lane on the frozen candidate; both lanes failed closed (LeetCode
`verdict_candidate_chronology_mismatch`, NowCoder `observer_stage_rejected`).
The user authorized the F1 diagnostic revision and product fix
(visibility-seeded E0 + dedup); the new immutable candidate
`915a98d0317148d063a3fad0e1888cb7aa74e2da` passed exact D3 with exact dist
`.tmp/p7-f1-exact-dist-915a98d`, and both fresh READY lanes passed. New
single-action authorizations are not granted. P2 made no
NowCoder production change. D4 live observations and D5 F1-F4 still require
their own gates. The candidate is not pushed, not a PR, and is not RC,
acceptance, or release.

## D4 E3-confirmed race fix (2026-08-06, superseded 2026-08-08 by the candidate coordinator repair)

The 7th and 8th real natural observations on LeetCode.cn (longest-substring
and reverse-integer) proved the D3 candidate's verdict-candidate path still
loses E3: the content runtime observes the verdict DOM and emits a
VERDICT_CANDIDATE, but the E2 confirmation (`confirmedSubmissions` local
record) is written by a later serialized executor stage. Both observations
failed closed with the new diagnostic `verdict candidate unconfirmed:
leetcode:<slug>` (waiting 5→6→7), meaning E2 WAS eventually written but later
than the bounded poll window (3 s, then widened to 20 s — still insufficient).

The repair is event-driven rather than poll-driven: `chrome.storage.onChanged`
reacts to `confirmedSubmissions` changes and immediately re-schedules the
pending verdict-candidate attempt (pure helper
`storageChangeRevivesVerdictCandidate` in
`extension/src/adapters/leetcode/network.ts`); poll exhaustion no longer
un-arms the pending recheck, and the closed `lastCaptureError` diagnostic is
still recorded on exhaustion. No new storage keys, no schema/migration or
manifest change, no adapter policy change.

## D4 E3 candidate/E2 coordinator repair (2026-08-06 to 2026-08-08; 9th observation FAILED 2026-08-09)

The event-driven revival was superseded by an exact, restart-safe candidate
coordinator (implementation `a9515a8`; plan
[`plans/2026-08-06-v4-phase-d-d4-e3-candidate-coordinator-repair.md`](superpowers/plans/2026-08-06-v4-phase-d-d4-e3-candidate-coordinator-repair.md)):
a bounded `TransientVerdictCandidate` slice in session storage, candidate
registration and E2 confirmation serialized through the existing background
orchestrator, and a pure coordinator
(`extension/src/verdictCandidateCoordinator.ts`) that joins a candidate to the
exact latest LeetCode submit lifecycle (platform, problem, tab, frame,
document, submit ordering, `stableSubmissionId`) with no polling or
storage-key wake-up. A resolution effect becomes adapter-owned E3 evidence;
the candidate identity is a JSON-array encoded id and candidates expire after
`VERDICT_CANDIDATE_TTL_MS` (5 minutes).

The 9th real observation (2026-08-09, merge-two-sorted-lists, `cn/741081653`)
confirmed E2 (08:43:52.814Z) and E3 (lastE3At 08:43:53.728Z) but produced no
bundle. Root cause, first divergent layer = candidate creation in
`extension/src/contentRuntime.ts`: the LeetCode.cn SPA restored a historical
"Accepted" result panel for a previously-practiced problem, which after a null
phase was misread as a genuine transition (candidate observedAt 08:43:49.309,
predating the submit E1 at 08:43:51.614); the real submission's identical
"Accepted" result was then suppressed by the same-text dedupe
(`contentRuntime.ts` lines 206-211), so no correct candidate was ever emitted.
The coordinator failed closed by design (`selectEligibleSubmitLifecycles`
requires `received <= observed`), leaving the confirmed record unfinalized,
waiting=1, no bundle, no `POST /api/capture/attempts`, empty SQLite. Required
before further code changes: a new RED test for same-problem repeat
submissions with a residual result panel, then a written plan revision.
A 10th real observation is required to confirm end-to-end delivery. Plan:
[`plans/2026-08-06-v4-phase-d-d4-e3-candidate-coordinator-repair.md`](superpowers/plans/2026-08-06-v4-phase-d-d4-e3-candidate-coordinator-repair.md).
