# V0 LeetCode Result Route And Extension Error Repair (2026-07-23)

## Decision

**ENGINEERING PASS / REAL CHROME EXTENSION-ERROR RETEST PASS.**

The repaired V3 build now recognizes the real LeetCode.cn problem-scoped
submission result route, survives Chromium runtimes without
`StorageArea.setAccessLevel`, contains rejected content/popup Chrome promises,
and gives popup actions visible pressed-state and text feedback. Automated,
synthetic unpacked-extension, and bounded real-Chrome extension-error checks
pass. The user separately observed the repaired TLE flow clear the pending
intent and return all popup queues to zero. This does not freeze a replacement
RC or accept V0.

## First-Principles Diagnosis

The visible TLE text was not the primary missing fact: `超出时间限制` already
normalized to `Time Limit Exceeded`. Capture requires all of these facts:

1. an active submit intent;
2. an exact supported result route;
3. a final verdict inside a trusted result region;
4. background identity/time/document matching;
5. successful local persistence and delivery.

The screenshot URL was
`/problems/two-sum/submissions/737484505/`, but exact-result routing recognized
only `/submissions/detail/<id>/`. A fresh content document therefore treated
the already-visible verdict as historical, emitted no usable candidate, and
left the active intent waiting.

A separate unpacked-extension reproduction found that some Chromium runtimes
do not expose `chrome.storage.local.setAccessLevel`. The previous unconditional
call aborted background initialization before `installationId` was written.
That was an independently proven compatibility fault, but it was not the red
error shown in the user's Chrome.

Authorized Windows UI Automation inspection of `chrome://extensions` found two
real errors, both `Uncaught Error: Extension context invalidated.` in
`content.js:5390`. Their contexts were the LeetCode result pages
`/problems/two-sum/submissions/737406436/` and
`/problems/two-sum/submissions/737482394/`. The service-worker console was empty
because these were content-script errors. Reloading an unpacked extension
invalidates already-injected content-script worlds, while a queued timer,
mutation observer, or browser event callback can still be dispatched briefly.
Only `runtime.sendMessage` had a rejection boundary; synchronous detector
callbacks were not lifecycle-guarded.

## Repair

- Recognize exact HTTPS LeetCode `.cn` and `.com` result routes shaped as
  `/problems/<slug>/submissions/<numeric-id>/`, while rejecting missing or
  nonnumeric IDs, extra segments, query/hash noise, credentials, ports, and
  spoofed hosts. The legacy domestic detail route remains supported.
- Add a full lifecycle regression using the screenshot's route shape:
  task-document intent → new result document with first-frame TLE → exact
  candidate → consumed intent → `Time Limit Exceeded` bundle.
- Capability-check trusted-only storage access. Supported browsers retain the
  restriction; unsupported runtimes continue initialization with a warning.
- Route fire-and-forget Chrome promises through one settling boundary so
  rejection is reported instead of becoming an unhandled extension error.
- Put all content-script timer, mutation, DOM, and navigation callbacks behind
  one context guard. The first callback failure retires that stale runtime.
  `Extension context invalidated` is treated as expected reload cancellation;
  an unrelated detector failure remains visible as a real extension error.
- Suppress the same expected invalidation at initialization and asynchronous
  message boundaries, without weakening reporting for unknown failures.
- Add a short pressed/disabled button state, lighter background transition,
  and `已触发：<操作>` live text for retry, clear, quarantine, and pairing
  actions. A click acknowledges dispatch, not server sync success; outbox zero
  plus a matching ACK remains the success condition.

## Verification

| Command | Result |
| --- | --- |
| `npx vitest run --config vitest.extension.config.ts tests/unit/extensionDomesticOjAuth.test.ts` before route repair | Expected failure: 1 failed / 139 passed; real result route was not exact |
| Focused five-file extension run plus `npm run typecheck` | PASS: 5 files / 164 tests; typecheck PASS |
| Content-operation focused run | PASS: 2 files / 18 tests |
| `npm run extension:check` after lifecycle repair | PASS: 19 files / 456 tests; typecheck, MV3 build, and dist parity PASS |
| Unpacked-extension Chromium smoke | PASS: initialization; submit `active=1/outbox=0`; exact TLE result `active=0/outbox=1`; verdict `Time Limit Exceeded`; button pressed state and live text observed; captured errors `[]` |
| Authorized real Chrome check | PASS: inspect two content-script errors; reload rebuilt `extension/dist`; clear old errors; refresh existing LeetCode result page; return to extension manager; no `Errors` button or new entry present |
| `npm run quality:gate` | PASS: exit 0 after lifecycle repair |

The authoritative gate evidence is:

- lint: PASS, zero warnings;
- disposable database migration: PASS;
- curriculum validation: PASS, 12 nodes / 13 edges / 12 resources / 12
  practice mappings / 9 careers;
- unit tests: 68 files / 1031 passed / 1 Windows file-symlink capability skip;
- typecheck: PASS;
- Playwright E2E: 25 passed; AtCoder request audit `external=[]`;
- extension: 19 files / 456 passed; MV3 build and dist parity PASS;
- Next.js production build: PASS, 20/20 static pages generated;
- optional link-access report: absent and explicitly soft-skipped.

The unpacked-extension smoke used intercepted synthetic LeetCode-shaped HTML
and did not read cookies, account data, source code, hidden DOM, or perform an
external OJ submission. It proves runtime integration, not user acceptance.
The real-Chrome check was limited to the extension manager/error detail,
extension reload, and refresh of the already-open result page. It did not read
cookies, source code, account data, or perform a new OJ submission.

## Git And Product Boundary

- Branch: `feature/v1-followup`.
- Baseline HEAD: `894162b264124eed7315a116cae73b8e11d717b8`.
- State: the repair is frozen by the local implementation commit containing
  this report. Pre-existing user-owned document edits are intentionally
  excluded and may leave the worktree dirty.
- Commit/push: local repair commit created; not pushed.
- Replacement RC: the implementation commit containing this report is the new
  candidate freeze point; resolve its exact SHA with `git rev-parse HEAD`.
- Current phase: V0 capture repair validation.
- Current real-browser evidence: the user observed pending/outbox/quarantine
  return to zero after the repaired TLE flow; the authorized post-repair reload
  and result-page refresh created no new extension error.
- Next gate: restart formal observation against only that exact implementation
  SHA, then perform same-SHA F1-F4 and explicit user acceptance. Do not use the
  remaining dirty user-document state as part of the RC.
- V0.5 and public release remain out of scope.
