# Phase 0 Trustworthy Capture and Analytics Delivery Plan

**Status:** In progress / BLOCKED on 2026-07-15. Phase 0A, 0B1-0B3, 0B4 (BLOCKED), 0C1-0C2, and 0D are complete. Phase 0 itself remains BLOCKED on production-adapter certification; Phase 0D only closed the engineering-gates package. Production-adapter certification was attempted in Phase 0B4 and BLOCKED (no public Luogu verdict DOM); re-certification requires a new design decision or publicly accessible verdict page.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:writing-plans to expand each subphase, superpowers:test-driven-development during implementation, and superpowers:verification-before-completion before closing Phase 0.

**Goal:** Make the current capture, attempt, and analytics loop safe enough that later planning and AI features never reason over contaminated or incorrectly merged training data.

**Non-goals:** No curriculum graph, ability level, AI provider, cloud account, sync, code-snapshot analysis, or major visual redesign is added in this phase.

**Entry state:** Next.js pages, SQLite persistence, OJ metadata, MV3 capture, attempt materialization, deterministic Coach/Growth summaries, and browser smoke tests already exist.

## Subphase Order

### 0A — E2E data safety and migration reuse

Detailed implementation plan: [Phase 0A](./2026-07-11-phase-0a-e2e-data-safety.md).

Deliverables:

- reusable migration runner;
- disposable `.tmp/playwright/training-platform.sqlite`;
- Playwright server and worker environment isolation;
- clean Growth-state regression;
- proof that E2E leaves the default database unchanged.

### 0B — Capture session and submission protocol

At 0B kickoff, assign the next available four-digit migration prefix to the semantic suffix `capture_sessions_and_submissions.sql` after inspecting merged migration history.

Core contracts:

- `captureSessionId`: identifies one problem-page visit across SPA URL changes;
- `submissionId`: identifies one user submission and permits the same verdict on later submissions;
- `training_sessions`: stores problem identity, canonical URL, start/end times, and an explicit end reason;
- `capture_events`: adds a schema version, capture session ID, and optional submission ID;
- every event records installation ID, adapter/parser version, page origin and a provenance level;
- `training_attempts`: links to session/submission identity and uniquely constrains a real platform submission;
- event sequence: page detected → submission observed → verdict observed → session closed;
- idempotency key: event ID, not verdict text;
- `pagehide` is lifecycle information, not automatic proof of a completed attempt.

Work packages:

- [ ] Add failing schema and transition tests in `tests/unit/captureEvents.test.ts` and `tests/unit/captureMaterializer.test.ts`, including one-release-cycle V1 queued-event compatibility.
- [ ] Extend `lib/capture/events.ts`, `lib/domain/training.ts`, the capture repositories, and migration with session/submission identity.
- [ ] Refactor `lib/services/captureMaterializer.ts` into a deterministic transition service covering replay, out-of-order verdicts, and repeated identical verdicts.
- [ ] Add SPA navigation, same-verdict resubmission, and `pagehide` tests for `extension/src/content.ts` and `extension/src/platforms.ts`.
- [ ] Serialize `extension/src/transport.ts` queue mutation and make batch drain retry-safe; cover concurrent enqueue/drain in `tests/unit/extensionTransport.test.ts`.
- [ ] Add an explicit localhost pairing flow: an installation-scoped credential is created by the local app, stored by the extension, required by capture APIs, rotated/revoked from settings, and never logged.
- [ ] Add origin/content-type/body-size validation and prove an unpaired webpage or local process cannot create a trusted browser-capture event.
- [ ] Replace broad “five supported platforms” claims with per-adapter states (`production`, `experimental`, `disabled`); build a real-page/DOM fixture set for the first production candidate, Luogu, before freezing it.
- [ ] Add a Playwright scenario with two problems and multiple submissions proving attempts are neither lost nor cross-linked.

The approved 0B1 V2 cutover superseded the earlier compatibility proposal: known V1 capture rows and queued V1 events were discarded once, with the extension recording the cleanup time and discarded count. Existing V2 data is preserved by later migrations.

### 0C — Query and analytics correctness

Core contracts:

- problem identity is `(platform, externalId)`;
- canonical URLs are produced by one pure normalizer;
- “total” means a database aggregate over the full eligible dataset;
- “recent” always states its time or row window;
- attempt queries accept explicit scope instead of reading the globally latest row.
- every automatic path has a manual record/correction fallback using the same normalized attempt contract.

Work packages:

- [ ] Add failing repository tests for problem-scoped attempts, full aggregates, date windows, and empty data.
- [ ] Add `lib/services/canonicalProblemUrl.ts` and use it at capture, catalog, and link-rendering boundaries.
- [ ] Extend `lib/repositories/attempts.ts` with scoped query objects and aggregate queries; keep SQL out of pages.
- [ ] Refactor `lib/services/growthStats.ts` so labels and denominators match the actual query window.
- [ ] Update `/training`, `/growth`, and `/coach` to consume the corrected services.
- [ ] Add a manual record and correction path for task identity, result, language, time and optional reflection; manual origin is visible and never impersonates browser provenance.
- [ ] Add E2E coverage that seeds more than the recent-row limit and proves totals remain correct.

### 0D — Engineering quality gates

Work packages:

- [x] Add ESLint with strict project scripts and fix existing findings without suppressions.
- [x] Add migration tests for a fresh database, upgrade from each supported schema version, rollback on failure, and idempotent replay.
- [x] Add CI commands mirroring the documented local gate; do not add deployment or external data calls.
- [x] Add extension build/test parity and verify generated `extension/dist` stays ignored.
- [x] Update `README.md`, `docs/architecture.md`, `docs/runbook.md`, and `COMPLIANCE.md` with the final data flow and failure recovery.

## Required Tests

- Unit: event validation, transition table, queue serialization, URL normalization, repository scoping, aggregate denominators, migration replay.
- Integration: temporary SQLite databases only; never the default database.
- E2E: clean start, paired/unpaired capture, two problem tabs, SPA navigation, identical verdict on separate submissions, interrupted page lifecycle, manual fallback/correction, reflection, totals beyond recent-window size.

## Verification Commands

After 0D adds lint, run the complete Phase 0 gate:

```powershell
npm run lint
npm run db:migrate
npm run test
npm run typecheck
npm run e2e
npm run extension:check
npm run build
npm run quality:gate
```

`npm run quality:gate` runs the seven commands above in that exact order under an OS-temporary database and is the safe single verification.

## Exit Gate

Phase 0 is complete only when all are true:

- [x] E2E does not create, migrate, seed, hash-change, or delete the default database.
- [x] Replayed events are idempotent, while two real submissions with the same verdict remain two submissions.
- [x] Queued V1 events are discarded once under the approved cutover, with cleanup time and discarded count recorded.
- [x] Events from two pages or sessions never materialize into the wrong attempt.
- [x] Unpaired requests cannot create trusted browser events; credential rotation invalidates the previous credential.
- [x] Closing or hiding a page does not invent a verdict.
- [x] The extension drains queued events in order without losing events added during drain.
- [x] `/training` shows the current problem’s attempt, not a globally recent attempt.
- [x] Growth totals use full aggregates and recent metrics declare their window.
- [x] One canonical URL implementation is used everywhere.
- [ ] One adapter is explicitly production-ready against its fixture/manual matrix; every other adapter is visibly experimental or disabled. (Phase 0B4 attempted Luogu certification but BLOCKED on missing public verdict DOM.)
- [x] A learner can record or correct a session when automatic capture fails, without erasing the original provenance.
- [x] Fresh and upgrade migrations pass in temporary databases.
- [x] Lint, unit, type, E2E, extension, and production build gates all pass.

## Risks and Controls

- **Schema churn:** finish the session/submission contract before adding curriculum tables.
- **False capture confidence:** keep platform DOM fixtures and manual smoke checks; do not infer hidden submission state.
- **Extension races:** use a single queue owner and deterministic state transitions, not longer timeouts.
- **Dirty working tree:** inspect every diff and never overwrite or commit unrelated user changes.
