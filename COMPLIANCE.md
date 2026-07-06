# Compliance Notes

The product uses this rule: use browser session, do not extract browser session.

Allowed in V1:

- store problem IDs, titles, tags, difficulty, source URLs, and user training records;
- open original OJ pages through deep links;
- detect user-visible page and submission events through a user-installed browser extension;
- keep captured training records local by default.

Not allowed in V1:

- bypass login, captcha, paywalls, anti-bot systems, or access controls;
- store platform passwords;
- upload platform session cookies;
- cache LeetCode, NowCoder, or Luogu full statements by default;
- run server-side crawlers against commercial OJ platforms.

## Phase 2.1 Browser Capture

The browser extension is local-first and user-controlled:

- capture can be disabled from the popup;
- queued events stay in Chrome local storage until sent to the local app;
- invalid events are dropped after a 400 response to avoid retry loops;
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
