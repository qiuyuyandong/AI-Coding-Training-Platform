# Compliance Notes

This file describes the **current Pre-V0 local implementation**. It is not the privacy policy for the planned hosted Public Beta. Cloud accounts, code-snapshot upload, platform-funded AI, retention, deletion, and provider disclosure require the separate Phase 7 contract in `IDEA.md` and `docs/superpowers/plans/2026-07-13-phase-7-public-beta-cloud.md`.

The product uses this rule: use browser session, do not extract browser session.

Allowed in the current implementation:

- store problem IDs, titles, tags, difficulty, source URLs, and user training records;
- open original OJ pages through deep links;
- detect user-visible page and submission events through a user-installed browser extension;
- keep captured training records local by default.

Not allowed in the current implementation:

- bypass login, captcha, paywalls, anti-bot systems, or access controls;
- store platform passwords;
- upload platform session cookies;
- cache LeetCode, NowCoder, or Luogu full statements by default;
- run server-side crawlers against commercial OJ platforms.

## Phase 2.1 Browser Capture

The browser extension is local-first and user-controlled:

- capture can be disabled from the popup;
- queued events stay in Chrome local storage until sent to the local app;
- invalid events and permanent event-ID conflicts are dropped after a 400/409 response to avoid retry loops;
- `installationId` is a logical correlation value, not a user identity, credential, or security boundary;
- no cookies, session tokens, passwords, or hidden platform data are read or uploaded;
- commercial platform full statements remain out of scope unless explicitly licensed or manually entered by the user.

## Phase 2.2 Training Records Loop

Materialized attempts remain local-first:

- capture events are reduced to training metadata such as platform, external problem ID, title, URL, result, and timestamps;
- `source_event_id` links a local attempt to its originating capture event for idempotent replay without storing browser secrets;
- Coach and Growth pages read from the local SQLite database and do not send training records to external services;
- the loop records user-visible page/submission outcomes, not hidden platform data, cookies, or full commercial problem statements.

## Phase 2.3 Coach Intelligence

Coach and Growth analysis remains local-only:

- deterministic rules compute summaries, signals, recommendations, rates, and distributions from local `training_attempts` rows;
- recommendations cite local attempt IDs as evidence and do not infer hidden platform state;
- no external LLM, cloud analytics service, or third-party API receives attempts, verdicts, reflections, code, cookies, or platform session data.

## Capture Protocol V2

Verdict capture keeps using the browser session without extracting the browser session:

- the extension reads visible verdict text only and normalizes it into local verdict labels such as accepted, wrong answer, compile error, runtime error, time limit, memory limit, or partial;
- Chinese verdict labels are treated the same way as English visible verdict tokens and are reduced to local attempt results before storage;
- each full page load has a local capture session and each submission has its own attempt identity;
- `SESSION_ENDED` is optional and sessions may legitimately retain a null `ended_at`;
- raw events and their projections are committed together; exact replay is idempotent and conflicting event-ID reuse is rejected;
- the one-time V1 cutover discards old local capture rows and queued extension events, with the extension recording its discarded queue count;
- no cookies, session tokens, localStorage secrets, hidden platform data, full statements, code submissions, or external services are added to the capture loop.

SPA route capture and authenticated localhost transport are explicitly deferred. The V2 E2E boundary verifies isolation across independent full page loads only.
