# V4 Codeforces C3 Terminal Blocker — 2026-08-02

## Verdict

`V4_BLOCKED`

Codeforces remains DOM-`experimental`. Its V4 network adapter is blocked and
was not implemented.

## Real observation

The already-open user Chrome ran the exact production build frozen by
`work/reports/v4-codeforces-c3-preflight-2026-08-02.md`. After an immediate
ready handshake, the extension armed a five-minute authenticated,
session-only window for `codeforces.com` with zero prior records. The user had
prepared their own submission on `/problemset/submit/`, then clicked the final
Submit control exactly once while the watcher was active. The browser moved to
`/problemset/status`. The user explicitly confirmed that the submission
entered the status page.

Throughout this natural submission, the extension retained exactly zero
network records and zero navigation witnesses. The operator stopped the
session before its `2026-08-02T08:19:42.110Z` expiry. No exportable network
transcript existed, so no Codeforces network fixture was created or
reconstructed.

Only active state, record/witness counts, approved pathname classes, and the
presence of an enabled final submit control were queried. The agent did not
read source, form values, language, bodies, headers, cookies, credentials,
CSRF values, account identity, query values, fragments, status rows, verdict,
runtime, memory, test number, or full problem text.

## Root cause

The observed Codeforces flow is a traditional top-frame form navigation.
Chrome's official `chrome.webRequest` contract declares `documentId` optional
and explicitly omits it when a request is a frame navigation. The approved
characterization observer rejects any request without `documentId` as
`missing_document_id`; the focused Codeforces regression pins that behavior.

The landing path `/problemset/status` carries no stable numeric submission ID
and no exact contest/problem identity. A numeric ID may be visible only in a
status-row link. Choosing a row by account, first/latest position, highest ID,
nearest timestamp, or query value would violate the reviewed plan. A direct
submission page cannot repair the missing durable E2 chronology after the
fact.

Primary browser contract:
`https://developer.chrome.com/docs/extensions/reference/api/webRequest`.

## Stop condition

C3 requires browser-document continuity, one stable numeric submission ID,
and safely sourced exact contest/problem identity before E2. The real flow
cannot provide those values inside the approved pathname-only boundary.
Therefore C3 must end `V4_BLOCKED`; weakening the shared correlator or copying
AtCoder's historical DOM approach is not authorized.

No further Codeforces natural submission is authorized unless a separately
reviewed scalar bridge or first-party protocol change supplies all required
identities without forbidden inference. C4 Luogu may begin only after the C3
registry, readiness manifest, plans, reports, current handoff, and terminal
gates agree.

## Verification

- Test-first terminal contract RED: 154 discovered tests across the two
  executed files, 153 passed and 1 failed because the registry still reported
  Codeforces `uncharacterized`; the new main-frame fail-closed case passed.
- Focused terminal extension regression: 9 files, 433/433 passed. The four
  historical AtCoder suites remained 171/171.
- Readiness validator unit suite: 21/21 passed.
- `node scripts/validate-v4-adapter-readiness.mjs --all`: PASS.
- Frozen AtCoder fixture SHA-256 comparison: 9/9 matched, zero mismatch.
- Standalone `npm run extension:check`: typecheck PASS; 39 files and
  1,326/1,326 extension tests passed; production MV3 build and dist parity
  PASS.
- `npm run quality:gate`: all nine stages completed successfully:
  - strict lint PASS;
  - disposable database migration PASS;
  - curriculum validation PASS: 12 nodes, 13 edges, 12 resources, 12 practice
    mappings, and 9 careers;
  - unit tests: 94 files, 2,075 passed, 1 Windows file-symlink capability case
    skipped under `EPERM`;
  - typecheck PASS;
  - application E2E: 25 passed;
  - extension check: 39 files, 1,326 tests passed, production MV3 build and
    dist parity PASS;
  - extension E2E: 48 passed, 1 documented service-worker harness case
    skipped;
  - Next.js production build PASS.

The two skips are existing environment/harness limitations. No new test
failure or regression remained after the test-first registry update.
