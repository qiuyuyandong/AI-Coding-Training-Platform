# ADR 0003: Development-only Sentry Error Tooling

- Status: Accepted for isolated development tooling
- Date: 2026-08-24

## Context

The local pilot needs a way for a developer and Codex to correlate an
unhandled browser or Next.js server runtime exception with a source location
and repair. Sentry's generated Next.js defaults also enable tracing, logs,
Replay, request context and public sample-error routes; those defaults exceed
the local-first boundary and are not acceptable here. Compile, lint, test and
build failures already have deterministic local commands and do not need an
external error service.

The frozen V4 Phase D product candidate is independent of this developer
tooling. Production service monitoring, alerts and incident operations remain
cloud-phase decisions.

## Decision

Allow Sentry only as an explicitly enabled local development exception tool:

- both browser and Node.js server initialization require
  `NODE_ENV=development`, a literal `1` flag, an approved Sentry ingest DSN,
  and a full Git SHA;
- each side has its own server-only or `NEXT_PUBLIC_` environment variables;
- the event projection retains only an exception type, a fixed non-sensitive
  message, and at most 40 repository-relative stack coordinates from `app/`,
  `components/`, `lib/`, or the three instrumentation files;
- request, URL, query, headers, cookies, user, breadcrumbs, tags, contexts,
  extras, database data, source context, local variables, OJ/capture data and
  arbitrary messages are removed before transport;
- tracing, logs, Replay, sessions, client reports, HTTP bodies, GraphQL/AI
  inputs and database query data are disabled;
- no Sentry build wrapper, source-map upload, tunnel, automatic monitor or
  public error-trigger route is part of this decision;
- MCP/API inspection is read-only and uses a separate read credential. A
  build-plugin/source-map token is not a read credential and is never reused.

## Consequences

The feature is inert in tests and production and requires deliberate local
activation. Issue grouping has exception type and stack location but not the
original exception message or request context, so some diagnoses will require
local reproduction. This trade-off is intentional: developer convenience
does not authorize product or learner data to leave the machine.

No automated test sends a Sentry event. A developer may reproduce a natural
local runtime failure after explicit activation, then use read-only Sentry
inspection and the local quality gates to close the issue.

## Deferred production decision

Cloud service monitoring requires another ADR covering provider/project
separation, environments, sampling, source maps, releases, retention,
deletion, PII, consent, alert ownership, incident response and cost. This ADR
does not authorize any of those capabilities.
