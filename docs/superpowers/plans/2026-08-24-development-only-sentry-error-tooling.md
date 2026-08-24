# Development-only Sentry Error Tooling Plan

**Status:** `implemented_uncommitted`

**Authority:** On 2026-08-24 the user confirmed that Sentry is a developer tool
for local Next.js browser/server runtime exceptions only. Compile, lint, test,
OJ capture, request, user, and database data are excluded. Production/service
monitoring remains deferred until the cloud phase.

## Goal

Add an opt-in development error channel that lets a developer reproduce an
unhandled local runtime exception, inspect the resulting development issue
through read-only Sentry tooling, repair the code, and verify the repair with
the repository quality gates. The feature must remain inert in test and
production builds.

## Product and privacy boundary

- Activation requires `NODE_ENV=development`, a literal `1` enable flag, a
  valid Sentry ingest DSN, and a full 40-character Git SHA release.
- Browser activation uses only `NEXT_PUBLIC_SENTRY_DEV_*`; server activation
  uses only `SENTRY_DEV_*`. Either side may remain independently disabled.
- Every accepted event is forced to `environment=development` and the
  validated Git SHA release.
- Retain only exception type and bounded, sanitized stack coordinates. Replace
  exception messages with a fixed value. Drop request, URL, query, header,
  cookie, user, breadcrumb, tag, context, extra, fingerprint, module, local
  variable, source-context, database, GraphQL, and AI input/output data.
- Disable tracing, logs, sessions, client reports, Replay, HTTP bodies,
  headers, cookies, query parameters, database query data, stack variables,
  and frame context lines.
- Do not add `withSentryConfig`, source-map upload, a tunnel route, automatic
  Vercel monitors, public error-trigger pages/APIs, or production alerts.
- Do not read or transmit OJ pages, extension storage, capture events,
  attempts, verdicts, code, reflections, SQLite rows, credentials, or tokens.
- The Sentry auth token remains local and ignored. MCP/API inspection is
  read-only and requires a separate `org:read` / `project:read` / `event:read`
  credential; the source-map build token is not reused.

## Implementation

1. Add a pure `lib/observability/sentryDev.ts` boundary that validates the
   closed environment contract and projects a minimal event envelope.
2. Add `instrumentation-client.ts` for browser unhandled exceptions and
   `instrumentation.ts` plus `sentry.server.config.ts` for local Node.js
   runtime/request exceptions. All SDK imports that can initialize transport
   remain behind the development gate.
3. Add `@sentry/nextjs` at an exact version. Keep `next.config.ts` unchanged so
   no source-map plugin, tunnel, or production wrapper is introduced.
4. Add unit tests for every enable-gate boundary, DSN/release validation,
   event stripping, stack sanitization, and forbidden generated-wizard
   surfaces.
5. Update the ADR, README, architecture, compliance notes, and runbook with
   activation, privacy, troubleshooting, and the read-only repair workflow.

## Verification and stop gates

- Focused unit tests must prove disabled-by-default behavior and exact event
  projection without sending a network event.
- `npm run lint`, `npm run typecheck`, `npm test`, `npm run build`, and
  `npm run quality:gate` must exit 0; skipped counts must be reported.
- Repository search must find no Replay integration, log enablement,
  non-zero trace sampling, Sentry tunnel, example error route, hard-coded DSN,
  or Sentry auth token.
- The default SQLite file must retain byte length and mtime.
- No Sentry test event, issue mutation, deployment, push, or PR is authorized.
- If enabling the SDK requires relaxing the closed event projection or
  touching the Phase D extension candidate, stop and return to the user.

## Later cloud phase

Production service monitoring requires a separate ADR covering production
projects/environments, retention, alert ownership, sampling, source maps,
release/deploy identity, PII, consent, deletion, incident response, and cost.
This plan cannot be treated as that approval.

## Execution record

Implemented on 2026-08-24 in the isolated worktree
`D:\Cowork\AI刷题训练平台-dev-sentry-tooling-lf` from base
`34916705712cac1ef2e5d8816cd8e40fa4e29ca7`. No Sentry event was sent.

- Focused boundary tests: `13/13` passed.
- Full quality gate: root unit `2563/1`, App E2E `25/25`, extension unit
  `1660/1660`, extension E2E `54/1`, and production build `20/20`; exit `0`.
- Production build: browser static Sentry matches `0`, shared first-load JS
  `102 kB`, and production `instrumentation.js` contains inert `register` and
  `onRequestError` functions.
- Forbidden-surface scan found no Replay integration, enabled logs, non-zero
  tracing, tunnel, wizard example route, hard-coded DSN, or auth token.
- Default SQLite remained `479232` bytes with UTC mtime
  `2026-07-23T15:56:38.8411343Z` before and after the gate.
- No commit, push, PR, deployment, issue mutation, or test event was created.
