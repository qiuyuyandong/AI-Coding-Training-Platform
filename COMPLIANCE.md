# Compliance Notes

This file describes the **current local V0 implementation under validation**. It is not the privacy policy for the planned hosted Public Beta. Cloud accounts, code-snapshot upload, platform-funded AI, retention, deletion, and provider disclosure require the separate Phase 7 contract in `IDEA.md` and `docs/superpowers/plans/2026-07-13-phase-7-public-beta-cloud.md`.

The product uses this rule: use browser session, do not extract browser session.

The Phase D D4 same-SHA observations on candidate `a911425...` preserved this
boundary: evidence retained only platform/problem/submission/verdict/timestamp
scalars, exact dist hashes, queue counts, and local projection counts. No raw
source code, problem body, request/response body, headers, cookies, tokens, or
browser storage was copied into project evidence. LeetCode and NowCoder remain
network-`experimental`; the observation does not authorize broader platform
coverage or cloud transmission.

The V3 click-created waiting model is blocked from V0 acceptance because a UI
action does not prove server acceptance. The completed V4 Phase 0 stopgap retains
only a bounded, session-only UI hint; it cannot turn that hint into waiting,
an attempt bundle, or local API traffic. The V4 Phase A closeout (A0-A12,
2026-07-26) builds the evidence core, strict correlator, pure capture state
machine, session/local storage split, production webRequest observer, optional
MAIN bridge, background orchestrator, Fake OJ matrix, disposable SQLite
lifecycle, and the canonical nine-stage quality gate. The framework engineering
pass is complete. Later Phase B/C work adds strict experimental LeetCode and
NowCoder network policies; `等待判题` still requires adapter-owned E2 evidence and
can never arise from a click. The V4 evidence boundary rejects forbidden raw fields
recursively at every parse: `body`, `rawBody`, `responseBody`, `code`, `headers`,
`requestHeaders`, `responseHeaders`, `extraHeaders`, `cookie`, `authorization`,
`csrf`, `token`, `username`, `account` (any depth, cycle-safe via WeakSet).
Later network work remains separately gated and may not retain request bodies,
code, credentials, or complete headers.

Phase B B3 diagnostics may retain a session-only E0 navigation witness only
after explicit popup opt-in. A witness contains a fixed page class plus tab,
frame, and Chrome document identity; it never retains a URL, path, query,
fragment, page text, source code, or account data. Successful export clears the
diagnostic session and is a user-triggered local download of the strict
sanitized transcript.

V4 Phase A adds only ordinary `webRequest` observation permission and the
optional `web_accessible_resources` entry for the MAIN bridge. The webRequest
observer stores only request ID, method, normalized endpoint key, tab/frame/
document IDs, lifecycle phase, status code, and receipt time in session
storage. It requests no body/header data and makes no real-platform readiness
claim. The MAIN bridge is gated to the four OJ host families
(leetcode/nowcoder/luogu/codeforces) and its messages are revalidated in the
ISOLATED-world relay against the recursive forbidden-key gate before any state
mutation. The extension E2E harness denies page traffic by default and denies
worker DNS with proxy disabled; localhost remains the only network exclusion
for later local API tests. `npm run extension:e2e` writes only to
`.tmp/playwright-extension/` (its own disposable SQLite under
`.tmp/capture-v4-full-chain-*/`) and is forbidden from opening the default
`training-platform.sqlite`.

Allowed in the current implementation:

- store problem IDs, titles, tags, difficulty, source URLs, and user training records;
- open original OJ pages through deep links;
- detect user-visible page and submission events through a user-installed browser extension;
- keep captured training records local by default.
- create and correct metadata-only manual training records locally.

Future project practice remains editor-agnostic and explicit. The product does
not plan an editor plugin, background workspace/file watcher, save/run/debug
footprint collection, terminal-history collection, keystroke tracking, or
arbitrary repository scanning. A future code snapshot or Git diff must be
task-scoped, selected and previewed by the learner, screened for secrets, and
optional; structured build/test results and manual fallback remain available
without raw code.

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
- invalid events and permanent event-ID conflicts are dropped after a 400/409/413/415 response to avoid retry loops;
- authentication failures retain queued events so the owner can re-pair without losing evidence;
- `installationId` is a logical correlation value, not a user identity or credential; a separate random credential authorizes local writes;
- the long-lived credential is stored only in trusted extension contexts, while the app stores its hash;
- no cookies, session tokens, passwords, or hidden platform data are read or uploaded;
- commercial platform full statements remain out of scope unless explicitly licensed or manually entered by the user.
- content-script host access is limited to declared OJ hosts and route logic accepts only supported problem paths; authenticated pages are used only through the learner's visible browser session;
- any sanitized authenticated DOM fixture is characterization evidence only, must omit account identity, submitted source code and full statements, and cannot satisfy the public-DOM production certification gate.

## Phase 2.2 Training Records Loop

Materialized attempts remain local-first:

- capture events are reduced to training metadata such as platform, external problem ID, title, URL, result, and timestamps;
- `submission_event_id` and `verdict_event_id` link an attempt to its visible capture evidence without storing browser secrets;
- Coach and Growth pages read from the local SQLite database and do not send training records to external services;
- the loop records user-visible page/submission outcomes, not hidden platform data, cookies, or full commercial problem statements.

## Phase 2.3 Coach Intelligence

Coach and Growth analysis remains local-only:

- deterministic rules compute summaries, signals, recommendations, rates, and distributions from local `training_attempts` rows;
- recommendations cite local attempt IDs as evidence and do not infer hidden platform state;
- no external LLM, cloud analytics service, or third-party API receives attempts, verdicts, reflections, code, cookies, or platform session data.

## Phase 0C2 Manual Records and Corrections

- the server assigns `capture` or `manual` from the write entry point; the label is provenance metadata, not security identity;
- manual records do not fabricate capture sessions, submissions, event IDs, verdict evidence, or extension credentials;
- corrections store only changed field names, scalar old/new values, a reason, revision, and timestamp;
- correction history is not an attempt and never contributes to Training, Coach, or Growth counts;
- voiding preserves the local row and lightweight history while removing it from default product queries;
- no snapshots, generic JSON diffs, full statements, page HTML, user code, cookies, or session tokens are added.

## Capture Protocol V2

Verdict capture keeps using the browser session without extracting the browser session:

- the extension reads visible verdict text only and normalizes it into local verdict labels such as accepted, wrong answer, compile error, runtime error, time limit, memory limit, or partial;
- Chinese verdict labels are treated the same way as English visible verdict tokens and are reduced to local attempt results before storage;
- each observed problem visit has a local capture session, same-problem SPA routes retain it, and each submission has its own attempt identity;
- `SESSION_ENDED` is optional and sessions may legitimately retain a null `ended_at`;
- raw events and their projections are committed together; exact replay is idempotent and conflicting event-ID reuse is rejected;
- the one-time V1 cutover discards old local capture rows and queued extension events, with the extension recording its discarded queue count;
- no cookies, session tokens, localStorage secrets, hidden platform data, full statements, code submissions, or external services are added to the capture loop.

SPA observation uses URL/browser lifecycle signals and visible DOM mutations only; it does not patch page code, read hidden routing state, or add Chrome navigation permissions. Extension unit tests cover SPA decisions, while Playwright validates the downstream event sequence without claiming to load the unpacked MV3 extension.

Authenticated localhost transport uses a deliberate one-time pairing code, a hashed install-scoped bearer credential, and owner-controlled rotation/revocation. Explicit web origins, non-JSON media types, and bodies over 64 KiB are rejected. `Origin` is only defense in depth, and host filesystem/browser-profile compromise remains outside this local boundary. `installationId` is still correlation metadata rather than security identity.

## Phase 0D CI and Quality Gate Databases

Disposable test and migration databases are owned by the verification stack, not by users:

- `npm run e2e` writes only to `.tmp/playwright/training-platform.sqlite` and removes it during teardown; `npm run extension:e2e` writes only to `.tmp/playwright-extension/` (its own disposable SQLite under `.tmp/capture-v4-full-chain-*/`) and removes it during teardown; `npm run quality:gate` writes only to an OS-temporary `ai-training-quality-gate-*` directory and removes it in a `finally` block.
- These databases contain only synthetic test fixtures and migration rows; they never hold production capture data, training records, attempts, manual reflections, credentials, or any user-derived content.
- The default `training-platform.sqlite` at the repository root is the developer's local source of truth. The aggregate gate never opens, hashes, or migrates it; `npm run e2e`, `npm run extension:e2e`, and `npm run quality:gate` are the only commands that own disposable databases; neither E2E lane ever opens the default SQLite file.
- GitHub Actions (`windows-latest`, Node 22) installs dependencies and Chromium, then runs only `npm run quality:gate`. CI does not deploy, expose secrets, upload database artifacts, or call external LLM, analytics, sync, OJ, or third-party APIs. The CI database lives in a GitHub-managed workspace path and is removed with the runner. The Phase A A11 workflow (`workflows/quality-gate.yml`) carries `permissions: contents: read`, `timeout-minutes: 20`, and the `**` branch triggers; it is local-only and never uploads artifacts.

## V4 Phase C isolation boundary

- Network request interpretation is owned by one platform adapter; endpoint,
  response-field, and confirmation assumptions are never shared generically.
- Stable submission identity is namespaced as
  `<platform>:<externalSubmissionId>`, so identical raw IDs cannot collide.
- A click can create only bounded E0; no runtime event writes or consumes the
  legacy `pendingSubmissionIntents` key. Upgrade initialization may count and
  delete that old key solely to finish the V3-to-V4 migration.
- Unsupported DOM verdict candidates are dropped unless an adapter-owned V4
  policy turns them into safe E3 evidence. Historical completed bundles remain
  readable and deliverable.
- Production modules contain no Fake OJ adapter or readiness claim; Fake OJ
  protocol simulation remains test-only.
