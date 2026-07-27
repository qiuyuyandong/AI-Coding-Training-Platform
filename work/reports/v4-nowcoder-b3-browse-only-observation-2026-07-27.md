# NowCoder V4 B3 Browse-Only Observation

**Date:** 2026-07-27

**Result:** `BLOCKED`

## Authorized Scope

- Platform and page: `https://ac.nowcoder.com/acm/contest/18839/1001`
- Action: one browse-only observation; no submit control was clicked and no code
  was entered, changed, read, or submitted.
- Retention boundary: no request/response body, header, cookie, token, account
  identity, source code, or problem statement was retained.

## Build Identity

- Git HEAD: `f286fdb336000e796a7d2dd5c3716e05a7aec220`
- Source state: dirty; the B0-B2 implementation was not committed, so this is
  not a same-Git-SHA observation candidate.
- Reloaded extension artifact hashes:
  - `extension/dist/background.js` SHA-256:
    `B52D1BE9DDA1EE8271EB298A50A9F7E41D221873F3EEF23367AF12327E961168`
  - `extension/dist/popup.js` SHA-256:
    `AC7678CBE090B27FEAF70F11DAF4E67077D1D37D1688104C3E42F61A72023226`

## Observation

1. The development extension was reloaded from the locally built artifact.
2. Diagnostic mode was explicitly started for `ac.nowcoder.com` and marked as
   authenticated characterization. It isolated NowCoder production ingress.
3. The browser attempted the local resources entry, but the local server
   returned `net::ERR_CONNECTION_REFUSED`; this did not create waiting state.
4. The browser then navigated to the contest list and the authorized problem
   page without a submission action.
5. The popup displayed `等待判题 0` before and after navigation, with zero outbox
   and quarantine entries.
6. The active diagnostic session reported `0/100` retained records. It was
   explicitly stopped afterwards, which cleared the session state; both tabs
   created for the observation were closed.

## Blocking Evidence

The B3 flow is a valid negative result for waiting state, but it cannot produce
the required retained fixture:

- `extension/src/networkTranscriptContract.ts` requires at least one signal and
  at least one evidence item in every transcript document.
- The real browse-only flow yielded zero diagnostic E1 records.
- `extension/src/characterization.ts` therefore rejects export with `no records
  to export`.

Creating a non-empty E1 fixture would falsely claim observed request evidence.
No fixture, test, or adapter policy was fabricated. B4-B8 must not proceed
until a reviewed contract change can represent a schema-valid zero-signal
negative observation and the B0-B2 implementation has an immutable build
identity.
