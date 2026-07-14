# Phase 0B2 SPA and Queue Reliability Design

**Date:** 2026-07-14

**Status:** Implemented and verified on 2026-07-14

## Outcome

Make the V2 browser capture loop deterministic when a supported site changes routes without reloading and when multiple queued events need delivery. A route change to another problem closes the old capture session and starts a new one; a route change within the same problem retains the session. The background worker drains queued events in order without overwriting events scheduled while a drain is running.

0B2 does not change the V2 database schema or trust model. Localhost credentials, request hardening, and trusted provenance change the security boundary and remain a separate 0B3 design.

## Scope

0B2 includes:

- a pure page-lifecycle transition model around the existing session event factories;
- SPA problem-to-problem, problem-to-nonproblem, same-problem route, `pagehide`, and BFCache-style `pageshow` behavior;
- a testable content runtime that separates browser watchers from capture decisions;
- URL change detection through `popstate`, `hashchange`, DOM mutation reconciliation, and a 500 ms URL poll fallback;
- stale-verdict suppression on the mutation that first observes a problem identity change;
- a bounded, ordered queue drain with deterministic stop/continue reasons;
- serialized background queue ownership and failure recovery;
- unit coverage plus an API/UI E2E sequence representing a SPA transition;
- current-state documentation and the complete quality gate.

0B2 excludes:

- history monkey-patching in the page's JavaScript world;
- Chrome `webNavigation` permissions;
- localhost credentials, pairing, rotation, revocation, origin trust, or trusted provenance;
- canonical URL normalization, which belongs to Phase 0C;
- production certification of any platform adapter;
- changes to verdict vocabulary, submission detection heuristics, or captured data categories.

## Page Lifecycle Contract

The lifecycle state contains either one active `CaptureSessionState` or no active problem. Reconciliation receives the current detected problem, runtime installation context, timestamp, and ID factory.

- No active session + supported problem: emit `SESSION_STARTED` and activate the session.
- Active session + same `(platform, problemExternalId)`: retain the session and emit nothing, even when pathname/query/hash changes.
- Active session + different supported problem: emit `SESSION_ENDED` with `spa_navigation`, then emit `SESSION_STARTED` for the new problem.
- Active session + unsupported page: emit `SESSION_ENDED` with `spa_navigation` and clear the active session.
- No active session + unsupported page: emit nothing.
- `pagehide`: emit `SESSION_ENDED` with `pagehide` for the active session and clear it. Delivery remains best effort.
- `pageshow` after a hidden page: reconcile the visible URL and start a fresh session. A BFCache restore is treated as a new observable visit because the previous visit was explicitly ended.

Problem identity comparison deliberately ignores title and canonical URL changes. Phase 0C will centralize canonical URL generation; 0B2 must not create a second normalization implementation.

## Content Runtime

`extension/src/contentRuntime.ts` owns capture decisions and accepts injected dependencies for problem detection, verdict detection, time, ID generation, and event delivery. It exposes explicit methods for startup, location observation, DOM mutation, submission observation, page hide, and page show. Tests call these methods without loading Chrome globals.

`extension/src/content.ts` becomes a narrow browser adapter:

- request the logical installation context from the background worker;
- create and start the content runtime;
- install one click listener and one mutation observer;
- listen for `popstate`, `hashchange`, `pagehide`, and `pageshow`;
- poll `window.location.href` every 500 ms while active as a fallback for `pushState`/`replaceState` calls made in the page world;
- stop the observer and poll on `pagehide`, and restart them on `pageshow`.

When a location observation changes problem identity, the runtime marks the next DOM mutation's verdict scan for suppression. If the DOM mutation itself is the first observer of the new identity, that same scan is suppressed. An explicit submission clears the suppression because it is current-page evidence. This prevents stale verdict text from the previous SPA screen being attached immediately to the new problem without dropping the verdict mutation that follows a real submit.

## Queue Drain Contract

The background worker remains the only writer of `eventQueue`. All initialization, enqueue, and drain jobs run through one serialized executor. A failed job is logged but does not poison later jobs.

One drain batch processes at most 25 queue heads. For each head it reads the latest stored queue, sends only that head, applies `planQueueAfterFlush`, and persists the resulting plan.

- HTTP 200 removes the head and continues.
- HTTP 400 or 409 drops the permanent failure and continues.
- HTTP 500 below the retry cap increments attempts and stops the batch.
- HTTP 500 at the retry cap drops the head and continues.
- Network failure increments attempts, retains the head, and stops the batch regardless of count.
- Empty queue returns `empty`.
- Reaching 25 processed items with more queued returns `batch_limit`; the background schedules another serialized drain.

Because enqueue jobs cannot interleave with a queue mutation, a capture event arriving during a network request waits behind the current drain and is appended to the persisted result instead of being overwritten. The following enqueue-triggered drain then delivers it.

## Error Handling

- Invalid runtime context disables capture for that content-script run without emitting malformed events.
- Unsupported routes hold no active session and emit no submission or verdict events.
- Browser watcher callbacks catch no domain errors locally; the top-level startup promise logs unexpected failures with the existing `[capture-v2]` prefix.
- Queue storage or network failures preserve future executor availability.
- No credential, event payload, cookie, token, or page statement is added to logs.

## Verification

Four independently reviewable tasks cover:

1. pure SPA/page lifecycle transitions;
2. injected content runtime and Chrome watcher integration;
3. serialized ordered queue drain and background integration;
4. SPA-shaped E2E, documentation, and complete quality gates.

The final gate remains:

```powershell
npm run db:migrate
npm run test
npm run typecheck
npm run e2e
npm run extension:build
npm run build
```

Playwright continues to use only `.tmp/playwright/training-platform.sqlite`, and the E2E must prove the default database hash is unchanged.
