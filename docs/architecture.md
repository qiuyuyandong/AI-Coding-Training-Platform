# Architecture

Last updated: 2026-07-07

## Overview

The app is a local-first unified OJ training memory system. It opens original problem pages through deep links, receives user-visible browser capture events from a user-installed extension, stores local training records in SQLite, and renders deterministic Coach/Growth insights from those records.

## Runtime modules

```text
Chrome MV3 extension
→ POST /api/capture/events
→ capture_events SQLite table
→ capture materializer
→ training_attempts SQLite table
→ /training, /coach, /growth
```

The browser extension detects supported problem pages and visible verdict state. It normalizes English verdict tokens and Chinese verdict labels into local verdict events, queues events in Chrome local storage, and retries localhost delivery according to the transport rules in `extension/src/transport.ts`.

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
| `POST /api/capture/events` | Validates `CaptureEvent`, saves it, materializes the matching attempt, and returns attempt status. |
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
| `capture_events` | Raw local browser capture events. |
| `training_attempts` | Materialized local training facts used by Coach/Growth. |

`training_attempts.source_event_id` links a local attempt to its originating page/training capture event. Replayed page events reuse the same attempt, and replayed verdict events are matched by problem, verdict, and end timestamp so they do not create duplicate completed attempts.

## Service boundaries

- `lib/capture/events.ts` owns capture event validation and conversion helpers.
- `extension/src/platforms.ts` owns pure platform page/verdict detection, including supported English and Chinese verdict text patterns.
- `lib/repositories/**` owns SQLite row mapping and persistence helpers.
- `lib/services/captureMaterializer.ts` converts capture events into attempt state transitions.
- `lib/services/coachAnalysis.ts` turns attempts into deterministic Coach signals and recommendations.
- `lib/services/growthStats.ts` turns attempts into Growth metrics and recent activity.

Pages should not duplicate Coach/Growth decision logic. They should read attempts, call the service, render the returned model, and close the database.

## QA lifecycle

`playwright.config.ts` starts `npm run dev -- -p 3000` through Playwright `webServer` for e2e tests. `tests/e2e/**` is excluded from Vitest in `vitest.config.ts`, so `npm run test` and `npm run e2e` are separate gates.
