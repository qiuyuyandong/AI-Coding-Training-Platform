# V4 Phase D D4 E3 Confirmed-Race Fix Plan

**Status:** `APPROVED` (user authorized on 2026-08-06)

**Date:** 2026-08-06

**Scope:** Single targeted fix for the LeetCode E3 ingress race observed during
D4 same-SHA real observations on `feature/v1-followup` (worktree
`.worktrees/d4-candidate`). This plan modifies only the background verdict
candidate branch to retry a bounded number of times when the confirmed
submission has not yet been written, and to surface a non-silent diagnostic on
exhaustion. No schema, migration, permission, adapter policy, storage key,
or network behavior change.

## 1. Background and Evidence

During six real LeetCode.cn submissions against the frozen candidate build
`509faf0e60532cf565a6a57aa796b96bc1053f38` (D3), E1 and E2 captured correctly
but E3 never produced an outbox bundle. The decisive observation (submission
`cn/740553045`, merge-two-sorted-lists):

| Event | Timestamp (UTC) |
|---|---|
| Content probe observes verdict DOM, sends `VERDICT_CANDIDATE_OBSERVED` | 11:20:02.700 |
| E2 confirmed record written (`confirmedAt` of `cn/740553045`) | 11:20:03.065 |

The candidate branch (`extension/src/background.ts` L1084-1146) filters
`confirmedSubmissions` by platform + problem and requires exactly one
unfinalized record (`confirmedSubmissionIds.length !== 1` → `verdictEvidence`
returns null → branch drops the candidate). Because E2 confirmation runs
through three serialized executor stages (webRequest `onCompleted` →
`e1_recorded` → `applyLeetCodeCheckConfirmation` → `e2_recorded`), while the
candidate branch needs only one executor stage, the candidate always reads
stale state and is silently dropped. Content scripts emit the candidate only
once per exact-result document, so E3 is permanently lost.

## 2. Fix Design

In `extension/src/background.ts`, the `isVerdictCandidateMessage` branch:

1. Extract the failure reason from the LeetCode candidate path:
   - `confirmedSubmissionIds.length === 0` → **retryable** (E2 not yet written).
   - Any other failure (URL/problem mismatch, ambiguous multi-candidate,
     invalid verdict, sender field missing) → **not retryable** (current
     fail-closed behavior preserved).
2. Retryable path: schedule a delayed retry via
   `setTimeout(() => executor.schedule(retry), RETRY_DELAY_MS)` with
   `RETRY_DELAY_MS = 200`, bounded at `MAX_VERDICT_RETRY_ATTEMPTS = 15`
   (3 s window, ample for the measured 365 ms race). **Never sleep inside an
   executor task** — the serialized executor would block the very E2
   confirmation stage the retry is waiting for.
   - Each retry re-reads `confirmedSubmissions` from trusted local storage and
     re-attempts `verdictEvidence`.
   - Retry loop is local to the branch closure; the candidate message, sender
     fields, and policy are captured once.
   - `blocksCharacterizationProductionIngress` is re-checked on every retry.
3. Exhaustion: write `lastCaptureError` via the existing
   `safeStoredCaptureError` guard with a closed reason string
   (`verdict candidate unconfirmed: leetcode:<problemExternalId>`), so the
   popup surfaces the blocked reason instead of silent loss. No record is
   fabricated.
4. The retry decision is extracted into a small pure function
   `shouldRetryLeetCodeVerdictCandidate` (exported from the leetcode network
   adapter module) so the boundary is unit-testable without chrome.* mocks.

No other file is changed. In particular the D3 frozen candidate identity
(`509faf0`) remains untouched; the fix is a follow-up change on top of it.

## 3. Tasks

### Task 0: Plan record (this file) — PASS gate: written and readable

Executed as part of this plan's creation.

### Task 1: Implement the retry + diagnostic change

- `extension/src/adapters/leetcode/network.ts`: add exported pure helper
  `shouldRetryLeetCodeVerdictCandidate(confirmedIds)` returning
  `confirmedIds.length === 0` (or inline decision in background; single
  implementation site, no duplication).
- `extension/src/background.ts` L1084-1146: refactor the LeetCode candidate
  path so that when `e3?.kind !== "final_verdict_confirmed"` and the cause is
  zero confirmed ids, a bounded delayed retry runs; on exhaustion write
  `lastCaptureError` (guarded by `safeStoredCaptureError`) and return.
- PASS gate: `npm run typecheck`, `npm run lint` exit 0; the new unit suite
  passes.

**Execution:** PASS. Implemented on 2026-08-06:
- `extension/src/adapters/leetcode/network.ts`: added
  `shouldRetryLeetCodeVerdictCandidate(confirmedIds)` returning
  `confirmedIds.length === 0` next to the `LEETCODE_NETWORK_POLICY` definition.
- `extension/src/background.ts`: refactored the `isVerdictCandidateMessage`
  branch (now ~L1091-1200) into a `tryOnce` closure that returns retryable only
  for zero confirmed ids; bounded delayed retry via
  `setTimeout(() => executor.schedule(attempt), 200)` with
  `MAX_VERDICT_CANDIDATE_RETRY_ATTEMPTS = 15` (3 s window); re-checks
  `blocksCharacterizationProductionIngress` on every retry; on exhaustion
  writes `lastCaptureError = safeStoredCaptureError("verdict candidate
  unconfirmed: leetcode:<problemExternalId>")`.
- `extension/src/captureErrorPrivacy.ts`: added the closed allowlist pattern
  `/^verdict candidate unconfirmed: leetcode:[a-z0-9-]{1,128}$/u` so the
  diagnostic reason survives the storage guard.
- Verification: `npm run typecheck` exit 0; `npx eslint
  extension/src/background.ts extension/src/adapters/leetcode/network.ts
  extension/src/captureErrorPrivacy.ts
  tests/unit/extensionLeetCodeVerdictRetry.test.ts --max-warnings=0` exit 0;
  focused suite 6/6 passed.

**Revision (2026-08-06, after 7th observation):** the 3 s window (15 x 200 ms)
was too short. The 7th observation proved the new code runs (popup blocking
reason = the new diagnostic string) and that the E2 confirmation WAS written
(waiting count 5 -> 6) but only after the window expired — the extension was
reloaded immediately before the submission, so the cold-started SW / executor
queue drained slower than 3 s. Constants widened to
`VERDICT_CANDIDATE_RETRY_DELAY_MS = 500` and
`MAX_VERDICT_CANDIDATE_RETRY_ATTEMPTS = 40` (20 s bounded window, still
fail-closed on exhaustion). No behavior change beyond the window; re-verified
`npm run typecheck` exit 0, focused suite 6/6, `npx eslint
extension/src/background.ts --max-warnings=0` exit 0, `npm run
extension:build` exit 0 (rebuilt `extension/dist`).

### Task 2: Unit tests

- New `tests/unit/extensionLeetCodeVerdictRetry.test.ts` covering:
  - zero confirmed ids → retryable (true);
  - exactly one matching id → not retryable (handled by main path);
  - multiple ids / invalid verdict / URL mismatch → not retryable;
  - retry exhaustion path returns the closed diagnostic reason without
    fabricating a bundle.
- PASS gate: the focused suite passes and `npm run test` (or the extension
  unit lane) exits 0.

**Execution:** PASS on 2026-08-06:
- `tests/unit/extensionLeetCodeVerdictRetry.test.ts` (6 tests) covers:
  - zero confirmed ids → `true`;
  - one matching id → `false`;
  - multi-candidate ambiguity → `false`;
  - closed diagnostic reason passes `safeStoredCaptureError` unchanged;
  - slashes/spaces/non-slug identities and near-miss strings fall back to
    `"Retained capture error"` (the guard's defined fallback).
- Verification: `npx vitest run --config vitest.extension.config.ts
  tests/unit/extensionLeetCodeVerdictRetry.test.ts` exit 0 (6/6);
  full extension unit lane `npm run extension:test` exit 0 (44 files,
  1420 tests).

### Task 3: Build and parity

- `npm run extension:check` (chains typecheck, focused extension tests, MV3
  build, dist parity/ignore check) exits 0.
- PASS gate: extension:check exit 0.

**Execution:** PASS on 2026-08-06: `npm run extension:check` exit 0
(typecheck PASS, extension unit 44 files / 1420 tests PASS, MV3 build PASS,
dist parity/ignore PASS). Privacy audit `node
scripts/audit-v4-extension-privacy.mjs` also passes with 0 findings against
the changed sources.

### Task 4: Real observation (user-assisted)

- Reload the rebuilt `extension/dist` in the already-open Chrome.
- One fresh natural LeetCode.cn submission (7th observation).
- Immediately read SW storage: expect `outbox.length === 1`,
  `confirmedCount` +1 with `finalizedAt` set, `transientUnmatchedE3` empty.
- Expect one `POST /api/capture/attempts` and one SQLite attempt on the local
  server.
- PASS gate: outbox bundle present and server SQLite attempt non-voided.

**Execution (first attempt): FAILED on 2026-08-06, 7th observation
(longest-substring-without-repeating-characters).** User reloaded the rebuilt
`extension/dist` in Chrome, then submitted. Evidence:
- Popup after submission: waiting count 6 (was 5), sync-queued 0, quarantined
  0, blocking reason exactly `verdict candidate unconfirmed:
  leetcode:longest-substring-without-repeating-characters` — this is the NEW
  diagnostic string, proving the retry code ran and exhausted its window.
- `waiting 5 -> 6` proves the E2 confirmation WAS written to local storage,
  but only after the retry window expired (cold start after reload; executor
  queue drained slower than the 3 s window).
- Server: `GET /api/capture/status` still shows only the 6th observation's
  4 events (cn/740549003 next-permutation, Wrong Answer / failed,
  2026-08-06T10:53:01Z-10:53:03Z); stdout log tail unchanged after the 7th
  submission (no new `POST /api/capture/attempts`); no new SQLite attempt row.
  => No bundle was generated; E3 was never finalized.
- Root cause of the FAILURE: retry window too short, not the mechanism — the
  diagnostic and fail-closed behavior worked exactly as designed.
- Resolution: Task 1 revision above widens the window to 20 s (40 x 500 ms).
  Rebuilt `extension/dist` verified. 8th observation required to confirm the
  widened window.

**Execution (second attempt): FAILED on 2026-08-06, 8th observation
(reverse-integer).** No extension reload this time (the 7th-observation reload
was still in place), yet the outcome repeated: popup waiting 6 -> 7 (the 8th
E2 confirmation was eventually written), sync-queued 0, quarantined 0, blocking
reason `verdict candidate unconfirmed: leetcode:reverse-integer`. Server and
DB unchanged (no new `POST /api/capture/attempts`, no new attempt row). The
20 s poll window was therefore NOT sufficient: the E2 confirmation write
arrives later than the candidate and later than any bounded poll can wait.
- Second resolution (implemented and verified on 2026-08-06): event-driven
  revival. `chrome.storage.onChanged` now listens for
  `confirmedSubmissions` changes; when a pending verdict candidate exists
  (`pendingVerdictCandidateRecheck`), the storage change re-schedules the
  exact same bounded attempt chain immediately, so a late E2 write can no
  longer be missed. Poll exhaustion no longer clears the pending recheck
  (it stays armed until the candidate resolves or the worker dies), and the
  closed diagnostic is still recorded on exhaustion. Pure helper
  `storageChangeRevivesVerdictCandidate` added next to
  `shouldRetryLeetCodeVerdictCandidate`; 1 new test (7 total) covers the
  closed key-existence check. Verification: `npm run typecheck` exit 0,
  focused suite 7/7, eslint exit 0, `npm run extension:check` exit 0
  (44 files / 1421 tests, MV3 build PASS, dist parity PASS). 9th observation
  required to confirm the event-driven revival.

## 4. Boundaries and Non-Goals

- Not a candidate re-freeze: `509faf0` stays the historical D3 candidate; the
  fix becomes a new follow-up commit, and D4/D5 continue on top of it.
- No new storage keys, no schema/migration, no manifest permission change, no
  adapter policy change, no NowCoder/other-platform behavior change.
- No click-derived pending intent reintroduction (C5 boundary respected).
- No commit/push without explicit user request.

## 5. Verification Commands

```powershell
npm run typecheck
npm run lint
npx vitest run tests/unit/extensionLeetCodeVerdictRetry.test.ts
npm run extension:check
```
