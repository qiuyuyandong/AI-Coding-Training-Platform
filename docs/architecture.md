# Architecture

Last updated: 2026-07-14

## Overview

The app is a local-first unified OJ training memory system. It opens original problem pages through deep links, receives user-visible browser capture events from a user-installed extension, stores local training records in SQLite, and renders deterministic Coach/Growth insights from those records.

This document describes the current implementation. The accepted future product direction is a staged move from this local pilot to a hosted SaaS after validation; see `docs/decisions/0001-local-pilot-to-cloud-saas.md`. Accounts, cloud sync, hosted AI, VS Code capture, and multi-tenant storage are not implemented today.

## Runtime modules

```text
Chrome MV3 extension
-> POST /api/capture/events
-> one SQLite transaction: capture_events + deterministic projection
-> training_sessions + training_attempts
-> /training, /coach, /growth
```

The browser extension detects supported problem pages and visible verdict state. A problem visit creates a capture session; same-problem SPA routes retain it, while navigation to another problem ends the old session before starting the next. Each submit observation creates a submission. The extension normalizes English verdict tokens and Chinese verdict labels into local verdict events and stores V2 events in Chrome local storage.

`extension/src/contentRuntime.ts` owns testable SPA/page lifecycle decisions. `content.ts` adapts Chrome `popstate`, `hashchange`, DOM mutations, `pagehide`, `pageshow`, and a 500 ms URL poll fallback. The mutation following a changed problem identity skips verdict scanning unless an explicit submit establishes current-page evidence, reducing stale-verdict cross-linking.

`extension/src/serializedWork.ts` keeps initialization, enqueue, and drain jobs ordered. `extension/src/queueDrain.ts` reads the latest queue before every head and drains FIFO in batches of at most 25. Permanent failures are removed; network and retryable server failures keep the head and stop the batch.

`installationId` is a persistent logical correlation value only. It does not authenticate the extension or authorize requests. Localhost credential authentication and trusted provenance remain deferred to Phase 0B3. No platform adapter is yet certified production-ready.

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

## API routes

| API | Role |
|---|---|
| `POST /api/capture/events` | Validates a V2 event and atomically saves the raw event plus deterministic session/attempt projection. Exact replay succeeds; a reused ID with different content returns 409. |
| `GET /api/capture/status` | Returns recent capture events for `CaptureStatusPanel`. |
| `GET /api/attempts/recent` | Returns recent materialized attempts for `AttemptStatusPanel`. |
| `GET /api/problems` | Lists local problem metadata. |
| `GET /api/sources` | Lists local source metadata. |

## Data model

The SQLite schema is defined by migrations under `lib/db/migrations`.

| Table | Purpose |
|---|---|
| `schema_migrations` | Applied migration tracking. |
| `problems` | Metadata-only local problem records. |
| `capture_events` | Raw local V2 browser events with a stable payload fingerprint. |
| `training_sessions` | One logical problem-page session; `ended_at` is nullable because `SESSION_ENDED` is best effort. |
| `training_attempts` | One row per `submission_id`, used by Training, Coach, and Growth. |

Raw event insertion and projection run in the same SQLite transaction. Event identity is content-sensitive: the same `eventId` and fingerprint is an idempotent replay, while the same `eventId` with a different payload is a conflict. Verdicts may arrive before submissions, multiple submissions remain distinct within one session, and a missing session-end event is valid.

Migration `0003_capture_sessions_and_submissions.sql` is a deliberate V1 cutover: it drops legacy capture events and attempts while preserving problem metadata. The extension similarly discards its old V1 queue once and stores the discard timestamp and count.

## Service boundaries

- `lib/capture/protocol.ts` owns the browser-safe V2 event contract and stable serialization.
- `lib/capture/fingerprint.ts` owns the server-only SHA-256 event fingerprint.
- `extension/src/platforms.ts` owns pure platform page/verdict detection, including supported English and Chinese verdict text patterns.
- `extension/src/pageLifecycle.ts` owns pure problem-session lifecycle transitions.
- `extension/src/contentRuntime.ts` owns capture decisions independently of Chrome globals.
- `extension/src/queueDrain.ts` and `extension/src/serializedWork.ts` own ordered queue delivery.
- `lib/repositories/**` owns SQLite row mapping and persistence helpers.
- `lib/services/captureTransition.ts` owns pure deterministic session/attempt transitions.
- `lib/services/captureMaterializer.ts` owns the raw-event-plus-projection transaction.
- `lib/services/coachAnalysis.ts` turns attempts into deterministic Coach signals and recommendations.
- `lib/services/growthStats.ts` turns attempts into Growth metrics and recent activity.

Pages should not duplicate Coach/Growth decision logic. They should read attempts, call the service, render the returned model, and close the database.

## QA lifecycle

`playwright.config.ts` starts `npm run dev -- -p 3000` through Playwright `webServer` for e2e tests. `tests/e2e/**` is excluded from Vitest in `vitest.config.ts`, so `npm run test` and `npm run e2e` are separate gates.

Playwright enforces a disposable `TRAINING_DB_PATH`, refuses to reuse an existing port-3000 server, and removes `.tmp/playwright` during teardown. Extension unit tests cover actual SPA runtime decisions. Playwright does not load the unpacked MV3 extension; its SPA-shaped scenario validates the resulting end/start event sequence through the API, SQLite, and problem-specific UI.
