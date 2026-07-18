# V0 Stabilization: Known-Issue Repair Plan

**Status:** Completed and verified on 2026-07-18 in the current worktree.
Commit-based SHA reconciliation, F1-F4 re-verification, observations and user
acceptance remain pending.

## Goal

Restore the current V0 manual learning loop to a verifiable local-use
candidate by fixing the row-ID contract regression, ability projection gaps,
and the Windows curriculum-link test harness. This is a stabilization package;
it does not expand V0 scope or declare user acceptance.

## Work

- [x] Align plan completion and optional AI reflection joins with the
  foreign-key-backed `plan_items` row-ID contract, and remove FK-disabled test
  fixtures that masked the mismatch.
- [x] Persist projector-computed stale state and cover the 30-day boundary.
- [x] Allow a later qualifying pass to promote L1 to L2 even when the first two
  passes occurred inside the short re-verification window.
- [x] Make the curriculum-link CLI tests non-blocking on Windows and correct
  the deterministic/duplicate fixtures.
- [x] Run focused tests, the offline-core Playwright gate, and the full
  `npm run quality:gate` against a disposable database.
- [x] Reconcile current-state reports and plan status with the verified worktree;
  keep observation, final acceptance, cloud, accounts, and V0.5 out of scope.

## Acceptance

- Plan completion succeeds with SQLite foreign keys enabled.
- Opted-in AI reflection can reach the provider with an FK-valid plan item;
  disabled/error paths still return the deterministic fallback.
- Reprojection persists `stale=true` at 30 days without lowering the visible
  level.
- Any deterministic qualifying pair of primary passes can reach L2; L3-L5
  remain unreachable.
- The focused V0 browser loop and all eight quality-gate stages pass.

## Verification result

- Focused regeneration/completion/today-page/validator tests: 56 passed.
- Curriculum-link checker tests: 8 passed.
- Focused offline-core Playwright: 3 passed.
- Authoritative post-validator full quality gate: PASS — 764 unit tests passed
  with one host-capability symlink test skipped under EPERM, including 21 real
  release-validator cases; 21 Playwright tests passed, 242 extension tests
  passed, extension parity passed, and the Next.js production build completed.
- Default `training-platform.sqlite` remained 462848 bytes with
  `LastWriteTimeUtc` 2026-07-17 22:06:33 UTC.
