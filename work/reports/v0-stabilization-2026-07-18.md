# V0 Stabilization Verification

Date: 2026-07-18
Status: PASS in the current uncommitted worktree
Implementation SHA: pending an explicitly authorized commit

## Result

The post-candidate row-ID regression and the related known issues are fixed.
The `/today` completion path again records the manual attempt, node mapping,
ability projection and successor snapshot with SQLite foreign keys enabled.
Optional AI reflection resolves the same FK-valid plan item instead of silently
falling back because of an obsolete stable-ID join.

Ability replay now persists the computed 30-day stale state without lowering
the visible level, and it can promote L1 to L2 from any deterministic
qualifying pair of primary passes rather than considering only the first two.
The Windows curriculum-link test harness no longer blocks its own in-process
HTTP server.

## Verification

- Focused regeneration, completion, today-page, and validator tests: 56/56 PASS.
- Curriculum-link checker tests: 8/8 PASS.
- Focused offline-core Playwright: 3/3 PASS.
- Authoritative post-validator `npm run quality:gate`: PASS across all eight stages.
  - Unit: 59 files, 764 passed, 1 skipped, including 21 real
    temporary-repository release-validator cases.
  - Browser E2E: 21 passed.
  - Extension: 15 files, 242 passed; build/dist parity PASS.
  - Typecheck, strict lint, migrations, curriculum validation and production
    Next.js build PASS.
- Default database metadata stayed unchanged at 462848 bytes and
  `LastWriteTimeUtc` 2026-07-17 22:06:33 UTC.

## Non-blocking environment notes

- The file-symlink escape capability test remains skipped because this Windows
  host returns EPERM without Developer Mode or elevation; mandatory junction
  coverage passes.
- The optional `work/reports/v0-link-access-check.json` soft-check artifact is
  absent, so the quality runner reports that it skipped that soft check.
- Node emits the repository's existing DEP0190 warning for a child process
  launched with `shell: true`; it does not fail the gate.

## Release boundary

This verification does not create a new implementation SHA and does not
declare V0 complete. The observation windows, F1-F4 final verification against
one committed RC implementation SHA, and explicit user acceptance remain
pending.
