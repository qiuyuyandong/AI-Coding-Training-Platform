# V4 AtCoder C2 Terminal Blocker — 2026-08-02

## Verdict

`V4_BLOCKED`

AtCoder's independently certified Phase 0 DOM verdict adapter remains
`production` for its historical public-DOM scope. Its V4 network adapter is
blocked and was not implemented.

## Exact build and real observations

The already-open user Chrome ran extension
`aljppcgkcdbeemppmokcbjgcjdhapakh`, manifest version `0.1.0`. Before the first
window, runtime hashes for `manifest.json`, `background.js`, and `content.js`
matched `work/reports/v4-atcoder-c2-preflight-2026-07-31.md`. Pairing and local
capture were enabled. Project localhost was not required for characterization
and remained stopped.

Three bounded session-only windows were used:

1. The user completed natural submission `78058928` for `abc001_1`, but the
   five-minute session expired before export and cleared its records. This
   exposed an operational TTL/export race but did not establish the protocol.
2. A live watcher observed zero records and no submission before expiry. This
   empty window is not protocol evidence.
3. After an immediate ready handshake, a live watcher ran while the user
   completed natural submission `78059304` for `abc001_1`. The browser moved
   from `/contests/abc001/submit` to `/contests/abc001/submissions/me` while
   characterization was active. The extension remained at exactly zero
   records, and the operator stopped the session before TTL expiry.

Only exact allowlisted paths, request-method/lifecycle presence, active state,
record count, and safe task/submission anchors were queried for evidence. No
cookie, source code, language, form value, query, fragment, request or response
body, header, CSRF value, execution time, memory, IP address, or full problem
statement was read or retained. One early diagnostic screenshot rendered the
normal page header; it was never written to the repository and was deleted
from the system Temp directory during closeout. No account identifier entered
the transcript, report evidence, tests, or repository.

## Root cause

`createCharacterizationObserver` rejects every request without
`details.documentId` as `missing_document_id`. This is required by the approved
same-document correlation and privacy boundary.

AtCoder's observed traditional submission flow is a top-frame form navigation.
Chrome's official `chrome.webRequest` reference declares `documentId` optional
and states that it is not present when the request is a frame navigation. The
real zero-record observation therefore matches the fail-closed unit behavior;
it is not a localhost, pairing, build-parity, user-timing, expiry, or host-match
failure.

The visible landing path `/contests/abc001/submissions/me` contains no stable
numeric submission identity. A numeric identity appears only later as a DOM
row anchor. Using that row, submitted form fields, query values, account
identity, nearest tab, or timing/order would violate the reviewed plan.

Primary reference:
`https://developer.chrome.com/docs/extensions/reference/api/webRequest`.

## Stop condition

The approved plan requires exact tab/frame/document identity, a safely sourced
contest/task identity, and a stable numeric submission identity. The real flow
cannot satisfy those constraints from the approved pathname-only evidence.
The plan therefore requires terminal `V4_BLOCKED` rather than a weakened
adapter.

No further AtCoder natural submission is authorized unless a separately
reviewed scalar bridge or a changed first-party protocol supplies all three
identities without reading forbidden data. C3 may begin only after readiness,
registry, plans, reports, frozen historical hashes, and current handoff agree
on this terminal result.

## Verification

- Focused C2/AtCoder/readiness regression:
  `npx vitest run --no-file-parallelism` over nine named test files — 9 files,
  401 tests passed.
- `node scripts/validate-v4-adapter-readiness.mjs --all` — PASS.
- Frozen historical AtCoder fixture comparison — 9 of 9 SHA-256 values match
  the approved pre-C2 baseline.
- `npm run quality:gate` — all nine stages completed:
  - strict lint PASS;
  - disposable database migration PASS;
  - curriculum validation PASS: 12 nodes, 13 edges, 12 resources, 12 practice
    mappings, and 9 careers;
  - unit tests: 94 files, 2,034 passed, 1 Windows file-symlink capability case
    skipped under `EPERM`;
  - typecheck PASS;
  - application E2E: 25 passed;
  - extension check: 39 files, 1,286 tests passed, production MV3 build and
    dist parity PASS;
  - extension E2E: 48 passed, 1 documented service-worker harness case
    skipped;
  - Next.js production build PASS.

The skips are the existing documented environment/harness limitations. No new
test failure or regression was observed.
