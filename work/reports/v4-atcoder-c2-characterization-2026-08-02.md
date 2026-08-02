# V4 AtCoder C2 Characterization Interim Report — 2026-08-02

## Verdict

`INCOMPLETE — NO EXPORTABLE NETWORK TRANSCRIPT`

This report records an operational evidence-loss failure. It is not the C2
characterization fixture, protocol design, adapter authorization, readiness
promotion, product acceptance, or C2 closeout.

## Build and boundary

- Existing Chrome profile and installed extension id:
  `aljppcgkcdbeemppmokcbjgcjdhapakh`.
- Manifest version: `0.1.0`.
- Runtime manifest, background, and content hashes matched
  `work/reports/v4-atcoder-c2-preflight-2026-07-31.md` before the first window.
- Pairing and local capture were enabled.
- Characterization was authenticated, limited to `atcoder.jp`, session-only,
  and bounded by the existing five-minute TTL.
- No cookie, source code, language, request or response body, form field,
  header, CSRF value, query, fragment, execution time, or memory value was
  retained. One temporary diagnostic screenshot rendered the normal page
  header; it was deleted during terminal closeout, and no account identifier
  entered repository evidence.

## Attempt 1

- Started: `2026-08-01T16:30:36.049Z`.
- Expired: `2026-08-01T16:35:36.049Z`.
- User reported the natural submission complete after expiry.
- At `2026-08-01T16:39:21.657Z`, the extension reported inactive state and
  zero records because expiry had cleared `characterizationSession`.
- The visible submissions list safely corroborated:
  - submission path `/contests/abc001/submissions/78058928`;
  - task path `/contests/abc001/tasks/abc001_1`.
- No verdict token was read, no network transcript was exported, and the DOM
  anchors cannot establish the request protocol.

## Attempt 2

- Started: `2026-08-01T16:40:50.563Z`.
- A live watcher polled only active state, record count, POST presence, and
  terminal lifecycle presence.
- It observed zero records throughout its 4.5-minute interval. The browser did
  not leave the task page until the operator opened the submit form, and no
  manual submission followed before expiry.
- The empty session expired with zero records. This is not a failed protocol
  capture and does not justify another blind retry.

## Root cause and operational correction

The current control plane uses the same timestamp for the collection deadline
and evidence lifetime. Expiry stops collection by clearing the entire
session, so a manual submission followed by a delayed operator response can
destroy valid session-only records before export.

Changing that shared control plane or retaining expired evidence is outside
the approved C2 pre-characterization scope. The in-scope correction is an
operator gate:

1. require an immediate user `ready` handshake;
2. arm the five-minute session only after that handshake;
3. keep a live watcher running during the manual submission;
4. export immediately after an observed POST reaches response, redirect, or
   completed lifecycle;
5. stop if the transcript lacks stable numeric submission identity or safe
   task identity.

Until one transcript is exported and audited, the AtCoder network adapter
remains unimplemented and C2 remains at characterization step 4.

## Superseded by terminal blocker

The later ready-gated window completed natural submission `78059304` while a
live watcher was active. The browser navigated from `/submit` to
`/submissions/me`, but the session remained at zero records before explicit
stop. Chrome's official `webRequest` contract confirms that frame navigation
does not supply `documentId`, so the strict observer's
`missing_document_id` rejection is structural. The authoritative result is
`work/reports/v4-atcoder-c2-blocker-2026-08-02.md` and C2 is terminally
`V4_BLOCKED`.
