# Phase 0C2 Manual Attempts and Traceable Corrections Design

## Outcome and scope

Phase 0C2 completes the manual fallback promised by Phase 0C. A learner can add one local training attempt when browser capture is unavailable, correct a small allowlist of business fields with optimistic concurrency, inspect the changes, and logically void a bad attempt. Training, Growth, and Coach continue to use one `training_attempts` model and exclude voided rows by default.

This slice does not add snapshots, event sourcing, generic audit infrastructure, bulk import, AI correction, user code storage, capture-event cleanup, or a page redesign. It does not change the 0B3 credential or capture trust boundary.

## Current constraints found in the repository

- `training_attempts.capture_session_id` and `submission_id` are currently mandatory, so a manual row cannot be represented without inventing capture identity.
- Existing V2 attempts are projected by `captureMaterializer` and must survive the next migration unchanged.
- `listAttempts`, `findLatestAttempt`, and `aggregateAttempts` are the shared Training/Growth/Coach query boundary.
- The current reflection route mutates an attempt without revision checking or a correction record; it cannot remain an unaudited write path.
- Pages read SQLite through repositories, while narrow client panels call JSON routes and poll every five seconds.
- Playwright already owns a disposable SQLite database. The repository's default `training-platform.sqlite` must not be opened by tests.

## Approaches considered

### Recommended: one attempt table, nullable capture identity for manual rows

Add a server-owned `record_source` discriminator to `training_attempts`. Existing rows become `capture`; manual rows use `manual` and have null capture-session/submission/event IDs. A database check constraint enforces those combinations. This keeps all analytics and pages on the existing attempt contract without fabricating an installation or capture session.

### Rejected: synthetic manual capture sessions

Creating `manual_local` installations, sessions, and submissions would avoid nullable columns, but those values would look like capture evidence and weaken the meaning of the 0B session/provenance model. It also risks clients and later analytics treating fake capture identity as real.

### Rejected: a separate manual-attempt table

A parallel table would keep the capture schema untouched but force every Training, Growth, Coach, correction, and future evidence query to union two models. That duplication is disproportionate for a lightweight fallback and makes total/count semantics easier to regress.

## Data model

Migration `0005_attempt_manual_corrections.sql` rebuilds only `training_attempts`, copies every existing V2 row, recreates its indexes, and creates one narrow correction table. It does not delete capture events, sessions, attempts, credentials, or problem metadata.

`training_attempts` gains:

- `record_source TEXT NOT NULL` with values `capture` or `manual`;
- nullable `capture_session_id` and `submission_id`, with a check that capture rows have both and manual rows have neither;
- `revision INTEGER NOT NULL DEFAULT 1`, incremented by each correction or void action;
- `voided_at TEXT` and `void_reason TEXT`, both null for active rows and both present for voided rows.

Existing V2 rows are copied as `record_source = 'capture'`, `revision = 1`, and active. Manual rows have no `submission_event_id`, `verdict_event_id`, or verdict. `TrainingAttemptSchema` enforces the same source/identity and void-pair invariants in TypeScript.

`attempt_corrections` stores one row per field that actually changed:

- `correction_id` groups fields changed by one request;
- `attempt_id` references `training_attempts`;
- `field_name` is constrained to `result`, `language`, `durationMinutes`, `reflection`, `startedAt`, `endedAt`, or `voidedAt`;
- `old_value` and `new_value` are nullable scalar text, not JSON snapshots;
- `reason`, `corrected_at`, and `resulting_revision` describe the operation;
- primary key `(correction_id, field_name)` prevents duplicate entries for one field in one operation.

Repeated metadata across a few field rows is an intentional trade-off: it avoids a second generic audit-header table and keeps the model inspectable. Correction rows never live in `training_attempts` and therefore never count as attempts.

## Server-owned source and manual creation

`POST /api/attempts` accepts a strict manual-attempt body containing only task identity and allowed training facts:

- `platform`, `problemExternalId`, `problemTitle`, and optional `canonicalUrl`;
- `startedAt`, optional `endedAt`, `result`, optional `language`, optional `durationMinutes`, and optional `reflection`.

The body cannot contain `recordSource`, attempt/session/submission IDs, event IDs, revision, verdict, or void fields. The server normalizes problem identity and URL, generates the attempt ID, and always writes `recordSource: "manual"`. Known platforms derive their canonical URL; platform `manual` requires an HTTP(S) URL. The route uses the existing bounded JSON and same-origin protections.

Capture events still enter only through authenticated `POST /api/capture/events`. `captureTransition` assigns `recordSource: "capture"`; the capture-event schema has no source override. Manual APIs do not accept a capture credential and cannot create trusted capture provenance.

## Correction semantics

`PATCH /api/attempts/:id` accepts:

```ts
{
  expectedRevision: number;
  reason: string;
  changes: {
    result?: AttemptResult;
    language?: string | null;
    durationMinutes?: number | null;
    reflection?: string | null;
    startedAt?: string;
    endedAt?: string | null;
  };
}
```

The schema is strict. Task identity, `recordSource`, capture session, submission, event links, revision, verdict, and void fields are not editable. Clearing optional values uses explicit `null`; omitted fields are unchanged. Empty requests and requests whose supplied values equal current values return HTTP 400 without a correction row.

The service first loads the attempt including voided rows, rejects a voided attempt, and compares `expectedRevision`. It validates the complete prospective attempt, including time ordering. It then performs a conditional update (`WHERE revision = expectedRevision AND voided_at IS NULL`) and inserts one correction row for each actual change inside one SQLite transaction. A zero-row conditional update returns HTTP 409 rather than overwriting concurrent work. Database failure while inserting correction rows rolls back the current-value update.

The old reflection-only mutation route is removed so it cannot bypass this transaction. The Training panel sends reflection through the allowlisted correction route with the same revision/reason contract.

## Logical voiding

`POST /api/attempts/:id/void` accepts `expectedRevision` and a bounded non-empty reason. For an active row it atomically sets `voided_at`, preserves the reason, increments revision, and records a `voidedAt` correction. Repeating the operation on an already voided attempt returns HTTP 200 with `replayed: true`, does not change the original reason/time, and does not append another correction.

Default repository list, latest, and aggregate queries add `voided_at IS NULL`. Thus Training, Growth, and Coach exclude voided rows without page-specific filtering. ID/submission lookups used by capture and correction services can explicitly include voided rows, so late capture replay does not create a replacement attempt.

## History queries

`GET /api/attempts/:id/corrections` returns grouped correction operations ordered by `corrected_at DESC, correction_id DESC`, with a hard limit of 100 operations. It can return history for a voided attempt. It exposes only scalar field changes, reason, time, and resulting revision.

## UI behavior

`/training` gains one compact `ManualAttemptPanel` for the current normalized task. It collects result, language, duration, start/end time, and optional reflection; task identity comes from the current Training route. Successful creation refreshes the existing attempt panel.

`AttemptStatusPanel` displays `Automatic capture` or `Manual entry`, the current revision, and an editor for the correction allowlist plus a required reason. It also displays grouped correction history and provides a separate reasoned void action. After voiding, the default scoped query returns no attempt and the panel returns to its empty state. The design reuses the existing slate/white cards, native inputs, and plain `fetch`; no state or form library is added.

Growth activity displays the same source label so manual and automatic rows are distinguishable. Coach consumes both active sources through the repository and requires no algorithm fork.

## Error mapping

- malformed, oversized, cross-origin, unknown-field, invalid-time, or no-change requests: HTTP 400;
- missing attempt: HTTP 404;
- stale revision or correction of an already voided row: HTTP 409;
- repeated void of an already voided row: HTTP 200 with `replayed: true`;
- unexpected persistence failure: HTTP 500, with the enclosing transaction rolled back.

## Verification

Unit and integration tests use in-memory or temporary SQLite databases and cover:

- fresh migration and upgrade from migration 0004 with V2 rows preserved;
- capture/manual source invariants and server-owned source assignment;
- active-only list/latest/aggregate queries;
- manual creation and strict rejection of capture identity/source fields;
- actual-change-only history, total-count stability, stale revision conflicts, and rollback on audit insert failure;
- idempotent logical voiding and history access after void;
- capture replay behavior after a row is voided.

Playwright uses only `.tmp/playwright/training-platform.sqlite` and proves one manual create → correct → history → void flow. It checks Growth and Coach include the active manual attempt, correction does not increase the attempt total, and both exclude it after voiding.

The full gate remains:

```powershell
npm run db:migrate
npm run test
npm run typecheck
npm run e2e
npm run extension:build
npm run build
```

`db:migrate` is run with an explicit disposable `TRAINING_DB_PATH`. Verification records only default-database file metadata before and after; it does not open or hash the default database.

## Failure conditions

Phase 0C2 fails if any of the following is true:

- migration deletes or changes an existing V2 attempt's business/capture values;
- a client can choose `record_source` or supply capture identity through the manual endpoint;
- correction can edit task/capture identity, event links, source, verdict, or revision;
- current values change without matching correction rows in the same transaction;
- a stale revision silently overwrites a newer row;
- correction or history rows increase attempt totals;
- a voided row appears in default Training, Growth, or Coach queries;
- repeated void changes the first void reason/time or adds duplicate history;
- tests open or modify the default database.
