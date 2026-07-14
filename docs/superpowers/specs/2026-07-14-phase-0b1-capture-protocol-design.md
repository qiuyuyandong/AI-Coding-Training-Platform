# Phase 0B1 Capture Protocol V2 Design

**Date:** 2026-07-14

**Status:** Implemented and verified on 2026-07-14

## Outcome

Replace the prototype capture contract with a clean V2 session/submission protocol. A logical problem visit owns zero or more submissions, each real submission can produce one attempt, two submissions with the same verdict remain distinct, and replay cannot duplicate either raw events or projections.

The current default database contains only five `evt_e2e_*` attempts and seven E2E/QA capture events. The owner approved a destructive protocol cutover: V1 queued events and the synthetic capture rows are discarded rather than migrated.

## Scope

0B1 includes:

- the V2 event envelope and typed event payloads;
- a destructive `0003_capture_sessions_and_submissions.sql` migration;
- nullable session completion (`ended_at` and `end_reason` are both optional until an end event arrives);
- deterministic session/attempt transition rules;
- same-transaction raw event persistence and projection;
- event replay versus conflicting-event detection;
- minimal extension V2 identity lifecycle;
- one-time V1 queue clearing with a log message and persisted discarded count;
- a two-problem, multiple-submission E2E path using full page loads.

0B1 explicitly excludes SPA history interception, queue mutation serialization, localhost credentials, trusted authentication, request origin/body hardening, and production-adapter fixture certification. `installationId` is correlation metadata only and must never be described as authentication.

## Protocol

Every V2 event contains:

- `schemaVersion: 2`;
- globally unique `id`;
- `captureSessionId` for one logical problem visit;
- `installationId` as an untrusted logical installation identifier;
- `adapterVersion` and `parserVersion`;
- `pageOrigin`;
- `provenanceLevel: "extension_unpaired"`;
- platform and problem identity;
- canonical URL and ISO `occurredAt`;
- a discriminated event-specific payload.

The event types are:

| Type | `submissionId` | Payload |
|---|---|---|
| `SESSION_STARTED` | forbidden | `{ source: "content_script" }` |
| `SUBMISSION_OBSERVED` | required | `{ action: "submit_clicked" }` |
| `VERDICT_OBSERVED` | required | `{ verdict, language?, result? }` |
| `SESSION_ENDED` | forbidden | `{ endReason: "pagehide" | "spa_navigation" | "capture_disabled" }` |

The API rejects V1 events and malformed V2 events with HTTP 400.

## Persistence Model

`training_sessions` owns the stable session ID, installation ID, problem identity, canonical URL, provenance, start time, nullable end time, nullable end reason, and audit timestamps. A database check requires `ended_at` and `end_reason` to be either both null or both present.

`capture_events` stores the complete normalized V2 envelope, payload JSON, an event fingerprint, and receive time. The fingerprint is SHA-256 over a stable recursive key ordering of the normalized event. Event ID is the idempotency key:

- missing ID: insert the raw event;
- existing ID with the same fingerprint: replay;
- existing ID with a different fingerprint: domain conflict.

`training_attempts` is the submission projection. It contains a non-null session ID and submission ID, with a unique constraint on submission ID. Its semantic start/end times come from event timestamps. Submission and verdict source event IDs remain separately inspectable.

Migration 0003 drops and recreates `capture_events` and `training_attempts`, creates `training_sessions`, and preserves unrelated problem/catalog tables.

## Deterministic Transitions

All new-event handling runs inside one SQLite transaction: inspect event ID, validate session identity, write the raw event, apply the projection, and return the resulting session/attempt state. Any projection error rolls back the raw insert.

- `SESSION_STARTED` creates the session. A repeated logical start updates `started_at` only when the event timestamp is earlier.
- `SUBMISSION_OBSERVED` creates a draft attempt keyed by `submissionId`. If a verdict already created it, the earlier submission time can move `started_at` earlier but cannot revert the result to draft.
- `VERDICT_OBSERVED` creates or updates the submission attempt. A verdict with a newer event timestamp replaces an older verdict; an older verdict is ignored.
- `SESSION_ENDED` records the earliest observed end timestamp and its reason. It never changes an attempt result.
- Events whose session ID is already associated with another problem are conflicts.
- A delayed event whose `occurredAt` is not later than session end remains valid. A new submission whose event time is later than session end is a conflict.

Semantic transitions use `occurredAt`; injected `now()` values are used only for persistence audit columns.

## API Semantics

- HTTP 200: inserted event or exact replay;
- HTTP 400: invalid JSON, V1 event, or invalid V2 fields;
- HTTP 409: event ID/payload conflict, session identity conflict, or invalid post-end transition;
- HTTP 500: unexpected storage failure.

The response identifies whether the event was inserted or replayed and includes the affected session and optional attempt status.

## Extension Cutover

The background worker owns extension initialization. It preserves an existing installation ID or generates one when absent. When stored protocol version is not 2, it:

1. counts the existing queue entries;
2. logs one message containing the discarded count;
3. clears the queue;
4. stores `discardedLegacyEventCount`, `legacyQueueDiscardedAt`, and `captureProtocolVersion: 2`.

The content script obtains the logical installation context from the background worker, creates a session ID on a full problem-page load, creates a fresh submission ID for every observed submit action, and associates the next visible verdict with that submission. If a verdict is observed before a submit action, it creates a submission ID for that verdict. A new submission resets verdict deduplication so the same verdict can be emitted again.

`pagehide` attempts to enqueue `SESSION_ENDED`; delivery is best effort. The data model never assumes an end event exists.

## Verification

Four independently reviewable tasks cover:

1. V2 protocol, destructive schema migration, and persistence types;
2. pure transition rules, repositories, transactional materialization, and API status codes;
3. extension initialization, IDs, V1 queue cleanup telemetry, and V2 event emission;
4. full-load two-problem E2E, current-state documentation, and complete quality gates.

Focused tests run after each task. The final gate is:

```powershell
npm run db:migrate
npm run test
npm run typecheck
npm run e2e
npm run extension:build
npm run build
```

E2E continues to use only `.tmp/playwright/training-platform.sqlite`.
