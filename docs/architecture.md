# Architecture

Last updated: 2026-07-23

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

The browser extension detects supported problem pages and visible verdict state.
Browsing does not create a session or queue item. An exact submit creates one
pending intent; a matching final verdict creates one stable V3 four-event
bundle in Chrome local storage. The server still stores the bundle's ordered
session/submission/verdict/end events for backward-compatible projection, but
the extension treats the completed bundle—not page activity—as the delivery
unit.

`extension/src/contentRuntime.ts` owns the verdict-gated state machine. `content.ts` adapts Chrome `popstate`, `hashchange`, DOM mutations, `pagehide`, `pageshow`, and a 500 ms URL poll fallback. Submit clicks must resolve to an exact platform label on a real button/input/role-button while an exact problem route is active; the sole anchor exception is Luogu's observed `a.title[href="javascript:void 0"]` with an exact inner `提交` label. Arbitrary text containing “submit/提交” is ignored. Browsing emits no user-level queue item. A submit creates a local intent; only a later final verdict with transition evidence can consume that intent.

`extension/src/serializedWork.ts` orders initialization, intent matching, outbox mutation, and delivery. `attemptStorage.ts` creates stable four-event bundles and enforces the storage reserve. `outboxDrain.ts` isolates item-specific failures in quarantine and continues with later bundles; network, 401, and 403 failures preserve the complete outbox and pause only the current drain. The popup separately reports waiting intents, pending bundles, quarantined bundles, migration count, and recovery controls.

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

`scripts/quality-gate.mjs` owns a separate disposable aggregate gate. It creates its own OS-temporary directory under `os.tmpdir()`, sets `TRAINING_DB_PATH` to that directory for every subcommand, runs lint, disposable migration, unit tests, typecheck, E2E, extension parity, and production build in that order, then removes the directory in a `finally` block. The runner never opens, hashes, or migrates the default `training-platform.sqlite`; that database remains the developer's local source of truth. A `git diff --check` clean check plus the `git check-ignore` verification of `extension/dist` keep the gate's generated state out of the working tree.

GitHub Actions mirrors the same gate. `.github/workflows/quality-gate.yml` runs `windows-latest` with Node 22, installs Chromium, and calls only `npm run quality:gate`. CI does not deploy, upload database artifacts, read secrets, or call external product, OJ, AI, or analytics APIs. The CI database lives in a GitHub-managed workspace path and is removed with the runner.

Extension unit tests cover actual SPA runtime decisions. Playwright does not load the unpacked MV3 extension; its SPA-shaped scenario validates the resulting end/start event sequence through the API, SQLite, and problem-specific UI. The extension's `vitest.extension.config.ts` runs only the focused set of extension-owned unit and certification tests; the full unit suite still uses `vitest.config.ts`.

The localhost credential protects the HTTP ingestion boundary, not a compromised host. A process able to modify SQLite or the Chrome profile is outside this Pre-V0 boundary.
