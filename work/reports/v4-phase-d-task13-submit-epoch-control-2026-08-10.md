# V4 Phase D Task 13 submit-epoch control closeout

Date: 2026-08-10

Branch: `feature/v1-followup`

Implementation commit: `fe36f6b4770d3d929479464c03e8bea6dbb97ba9`

Verdict: **ENGINEERING COMPLETE / INDEPENDENT REVIEW APPROVE**

This is Task 13 implementation evidence only. It is not a D4 real-platform
delivery observation, D5 approval, RC, user acceptance, or release.

## Product behavior closed

- A LeetCode submit E1 arms one exact request-scoped in-document epoch; its
  matching persisted E2 may confirm only that epoch.
- The content runtime accepts proof only from a post-E1 normalized verdict
  change, meaningful null transition, or replacement of the actual narrow
  first-party result `Element`.
- Same-verdict repeated submissions can emit one request-bound candidate after
  E2 without being suppressed by the historical text-only dedupe path.
- Same-problem epochs are exclusive. A later E1 permanently supersedes the
  earlier unexpired marker, including duplicate and out-of-order controls.
- A full 32-entry registry fails closed: the new epoch is rejected without
  eviction, old same-problem state is terminalized first, and legacy evaluation
  remains blocked until the five-minute TTL or page lifecycle cleanup.
- Background delivery makes one exact `tabs.sendMessage` attempt with tab,
  frame, and document routing; errors never broaden the target or retry.
- Diagnostics use only the reviewed fixed allowlist and contain no request,
  tab, frame, document, problem, verdict, URL, payload, code, credential, token,
  or account identity.

## Review history

The first independent implementation review returned `REJECT` for shared A/B
DOM proof, missing behavior-level exact-delivery tests, and missing production
Element/DTO boundary tests. Those findings were repaired. Commander review then
found and repaired the full-registry legacy escape. The final independent
exact-diff review returned `APPROVE`.

## Verification evidence

Authoritative Commander commands after the final implementation repair:

```powershell
.\node_modules\.bin\vitest.cmd run --config vitest.extension.config.ts tests/unit/extensionContentRuntime.test.ts tests/unit/extensionSubmitEpochControl.test.ts tests/unit/extensionPlatforms.test.ts tests/unit/extensionDomesticOjAuth.test.ts tests/unit/extensionBackgroundOrchestrator.test.ts tests/unit/extensionStoragePrivacy.test.ts tests/unit/extensionBackgroundMessages.test.ts --reporter=verbose
npm run typecheck
.\node_modules\.bin\eslint.cmd extension/src/adapters/contract.ts extension/src/adapters/leetcode/verdict.ts extension/src/attemptCapture.ts extension/src/background.ts extension/src/backgroundOrchestrator.ts extension/src/captureErrorPrivacy.ts extension/src/content.ts extension/src/contentRuntime.ts extension/src/platforms.ts extension/src/submitEpochControl.ts tests/unit/extensionSubmitEpochControl.test.ts
$env:GIT_MASTER='1'; git diff --check
```

Results:

- focused/adjacent unit suite: 7 files, 338 tests passed;
- TypeScript typecheck: exit 0;
- targeted ESLint: exit 0;
- diff whitespace check: exit 0, with Windows CRLF conversion warnings only;
- post-title cleanup regression: 1 file, 7 tests passed and ESLint exit 0.

Not run in Task 13: full unit suite, `extension:check`, extension E2E,
production build/dist, privacy audit, D3 candidate validator, browser
observation, migration, or any database command.

## Boundary and next action

Task 14 remains required for strict session persistence/parser compatibility,
exact coordinator `submitRequestId` binding, stale pre-E1 terminal cleanup, and
restart flow coverage. Task 15 must subsequently run all gates, independent
reviews, and create a new immutable D3 candidate before any Task 16 browser
observation.
