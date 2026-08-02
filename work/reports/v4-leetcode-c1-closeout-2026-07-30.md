# V4 LeetCode C1 Closeout — 2026-07-30

## Verdict

Task C1 reaches the terminal adapter state `V4_EXPERIMENTAL` on the
uncommitted `feature/v1-followup` working tree. Candidate v6 completed one
same-build natural LeetCode.cn capture from network evidence through the paired
local API and disposable SQLite projection. This is not production
certification, an immutable candidate commit, RC, acceptance, or release.

## Authorization and privacy boundary

The user performed the v6 submission in the already-open Qiu yu Chrome
profile. The extension ID remained
`aljppcgkcdbeemppmokcbjgcjdhapakh`; no replacement Chrome was launched.
Before the submission, the exact localhost origin permission, pairing
credential, capture-enabled state, content-runtime sentinel, production
adapter version, and disposable database were checked. No source code,
request/response body, headers, cookies, tokens, credentials, account
identifier, or full problem statement was read or retained.

## Same-build observation

- Production artifact digest:
  `8e0df3af3be1a60da88e6362cadbe2f6883a9ecec6f0063c522ff85a3e8521bb`.
- Adapter version: `v4-leetcode-network-6`.
- Submission identity: `cn/739108591`.
- Problem identity: `roman-to-integer`.
- Network chain: recent trusted exact submit-control E0, completed HTTP 200
  `POST /graphql/`, then completed HTTP 200 exact
  `/submissions/api/runtime_distribution/739108591/` result requests in the
  same Chrome document.
- Final verdict: `Wrong Answer`.
- Extension terminal state:
  - confirmed submissions: 0;
  - tombstones: 1 (`leetcode:cn/739108591`);
  - outbox: 0;
  - quarantine: 0;
  - unmatched E3: 0;
  - ambiguity diagnostics: 0;
  - endpoint diagnostics: 0;
  - last capture error: none;
  - successful delivery recorded at `2026-07-30T14:04:21.608Z`.

## SQLite projection

The paired API wrote only to
`.tmp/c1-qiu-profile-20260730-v1/training-platform.sqlite`.
Read-only verification found:

- `capture_events`: 4;
- `training_sessions`: 1;
- `training_attempts`: 1.

The four event types are `SESSION_STARTED`, `SUBMISSION_OBSERVED`,
`VERDICT_OBSERVED`, and `SESSION_ENDED`, all with adapter
`v4-leetcode-network-6` and provenance `extension_paired`. The non-voided
attempt has `record_source=capture`, problem `roman-to-integer`, submission
`cn/739108591`, result `failed`, and verdict `Wrong Answer`.

## Root cause and corrections

Localhost was not the cause. The current extension had the exact
`http://localhost:3000/*` permission, was paired and capture-enabled, reached
the API, consumed a pairing code, and ultimately delivered v6 into SQLite.

The failed candidate sequence isolated three defects:

1. v1-v3 overfit one legacy
   `/problems/<slug>/submit/` +
   `/submissions/detail/<id>/v2/check/` sample while the current UI used a
   generic GraphQL POST plus result-distribution GETs.
2. v5 produced a valid E2/E3 but scoped `problemExternalId` as
   `cn/<slug>`; the local API correctly rejected it because the LeetCode
   problem contract requires the plain slug. v6 keeps scope only in
   `externalSubmissionId`.
3. Repeated result requests could rewrite confirmation chronology or recreate
   a confirmed record after finalization. v6 preserves the first confirmation
   timestamp, rejects crossed problem identity, and treats an unexpired
   tombstone as authoritative even after the confirmed record is removed.

The current GraphQL policy remains fail-closed: GraphQL is not inspected and
cannot confirm by itself; it must be bracketed by a recent trusted exact E0 and
an exact same-document result path carrying the stable numeric ID. Opening a
historical result page cannot satisfy that chain.

## Automated evidence available at closeout

- Focused unit suites: 3 files, 109 tests passed.
- Readiness validator suite: 1 file, 20 tests passed.
- `node scripts/validate-v4-adapter-readiness.mjs --all`:
  `V4 adapter readiness PASS`.
- Focused production-dist Playwright:
  `GraphQL/result-distribution` — 1 passed.
- Redirect lifecycle race regression: 5 consecutive focused Playwright runs
  passed after waiting for the asserted `onBeforeRedirect` field and a live
  extension Worker.
- NowCoder restart harness regression: 5 consecutive focused Playwright runs
  passed after moving the protocol observation behind the CDP `running`
  boundary. No production NowCoder protocol changed.
- `npm run typecheck` — PASS.
- `npm run extension:check` — PASS; 39 files, 1261 tests passed, production
  build and dist parity passed.
- `npm run extension:e2e` — 48 passed, 1 known service-worker harness skip;
  production dist and webRequest stop/restart probe passed.
- `npm run quality:gate` — all nine stages completed successfully after the
  two discovered harness races were corrected:
  - lint PASS;
  - disposable database migration PASS;
  - curriculum validation PASS (12 nodes, 13 edges, 12 resources,
    12 practice mappings, 9 careers);
  - unit tests: 94 files, 2009 passed, 1 Windows file-symlink capability skip;
  - typecheck PASS;
  - application E2E: 25 passed;
  - extension check: 39 files, 1261 passed, production build/dist parity PASS;
  - extension E2E: 48 passed, 1 known service-worker harness skip;
  - Next.js production build PASS.

The skipped Windows symlink capability case and the known Phase A
service-worker restart case are pre-existing, explicitly reported environment/
harness seams. Neither is a C1 failure.
