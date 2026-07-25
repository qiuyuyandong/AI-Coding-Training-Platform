# V4 Phase 0 Click-Ingress Stopgap Evidence

Date: 2026-07-24

## Result

V4 Phase 0 stopgap is engineering-complete in the uncommitted worktree on
`feature/v1-followup` at base HEAD `1ce70959fb0d08704c880a15447ecd25c2229fa7`.
This is not V4 completion, a replacement RC, V0 acceptance, or a release.

The stopgap removes the unsafe click-to-waiting boundary:

- trusted, visible, enabled exact controls may create only an E0 UI hint;
- NowCoder E0 requires `button.btn-submit` labelled exactly `保存并提交`;
- E0 is bounded to eight records, stored only in `chrome.storage.session`, and
  removed by an MV3 alarm after the tested 30-second TTL even without another
  click;
- clicks no longer emit `SUBMISSION_INTENT_OBSERVED`;
- passive verdict candidates cannot create a new bundle in Phase 0;
- popup waiting reads only strictly validated `confirmedSubmissions`, for which
  Phase 0 intentionally has no producer;
- V3 pending intents are removed by an idempotent write-V4-first migration and
  are never promoted to confirmed submissions;
- completed `captureOutbox`, `captureQuarantine`, endpoint, installation ID,
  credential, legacy migration counters, and the existing API/SQLite delivery
  contract remain preserved.

## TDD Evidence

- Authority validator RED: the first focused run failed all 3 tests because
  `scripts/validate-v4-plan-authority.mjs` did not yet exist.
- UI-hint RED: the focused extension run failed because `uiHint.ts` did not yet
  exist.
- Migration RED: the focused run failed on protocol V3 and missing confirmed /
  migration state.
- Popup RED: the focused run failed because waiting still read V3 intents and
  migration text still described the old queue.
- Final focused Phase 0 matrix: 8 files, 215 tests passed before the alarm
  follow-up; the final TTL-focused matrix then passed 3 files / 26 tests.

## Authoritative Verification

All final commands below ran after the TTL correction unless explicitly noted.

| Command | Result |
|---|---|
| `npx vitest run tests/unit/v4PlanAuthorityValidator.test.ts` | PASS, 1 file / 3 tests |
| `node scripts/validate-v4-plan-authority.mjs` | PASS |
| `npm run lint` | PASS, zero warnings (also rerun by final quality gate) |
| `npm run typecheck` | PASS (also rerun by extension and quality gates) |
| `npm run extension:check` | PASS, 20 files / 468 tests; MV3 build and dist parity PASS |
| `npm run e2e` | First attempt safely refused because port 3000 had a stale repository Next.js listener; after identifying and stopping PID 4812, PASS, 25/25 tests |
| `npm run build` | PASS, 20/20 generated pages |
| `npm run quality:gate` | PASS, complete ordered aggregate gate |
| `$env:GIT_MASTER='1'; git diff --check` | PASS; line-ending warnings only |

Final `npm run quality:gate` details:

- lint: PASS;
- disposable `db:migrate`: PASS;
- curriculum validation: PASS, 12 nodes, 13 edges, 12 resources, 12 practice
  mappings, and 9 careers;
- unit tests: 70 files, 1046 passed, 1 skipped;
- skipped test: Windows file-symlink capability probe blocked by `EPERM`;
  mandatory junction/link-safe tests passed;
- typecheck: PASS;
- Playwright: 25/25 passed;
- extension check: 20 files, 468 passed, typecheck/build/dist parity passed;
- production build: PASS, 20/20 pages.

## Migration And Data Safety

`tests/unit/extensionInstallation.test.ts` passes 11 cases, including V3 active,
superseded, and expired intent removal; removed-active count; durable delivery
and pairing preservation; repeat initialization; and interruption after the V4
authoritative write but before legacy-key removal.

The authoritative quality gate used an OS-temporary database. Standalone E2E
used `.tmp/playwright/training-platform.sqlite` and cleaned it through the
repository's link-safe teardown. No standalone migration was run against the
default database. Metadata-only `Get-Item` after verification reported:

- `training-platform.sqlite` length: 479232 bytes;
- `LastWriteTimeUtc`: `2026-07-23T15:56:38.8411343Z`.

That timestamp predates this 2026-07-24 execution. No hash was computed and no
default-database content was read or modified.

## Independent Review

The first independent review found one material issue: a lone E0 was pruned only
when another hint arrived. The implementation added alarm-driven expiry,
startup compensation, and a fake-session-storage test proving the record is
written back as an empty collection at TTL without another click.

The second independent review confirmed the TTL finding resolved; after this
dated report and status reconciliation were added, the final review returned
`APPROVE` with no remaining blocking or important issue.

## Explicit Non-Claims And Unexecuted Work

- No real OJ submission or browser observation was performed.
- No network endpoint characterization, `webRequest`, `webNavigation`, MAIN
  world bridge, request-body access, or platform V4 adapter was added.
- No server schema, historical attempt, session, or capture event was modified.
- No formal V0 observation, replacement RC, F1-F4, V0 acceptance, V0.5 work,
  commit, push, or PR was performed.
- `npm run extension:e2e` was not run because that command and exact-production
  artifact lane belong to Phase A and do not exist in Phase 0.

## Next Gate

The only next implementation action is Phase A Task A0, and it requires explicit
user authorization. Until then automatic network-confirmed OJ capture is not
reliably available; manual attempts and delivery of already-completed outbox
items remain available.
