# Runbook

Last updated: 2026-07-15

## Setup

```powershell
npm install
npm run db:migrate
```

The default development database is `training-platform.sqlite`. Set `TRAINING_DB_PATH` for any manual isolated run. Playwright does this automatically and exclusively uses `.tmp/playwright/training-platform.sqlite`.

Problem identities are normalized before persistence and lookup. Use the platform's external ID rather than a full URL: for example `two-sum`, `1915A`, `abc350_a`, or `P1000`. Training lookup is problem-scoped even when many newer attempts exist. Growth totals are all-time SQL aggregates, while its visible activity list is the latest five and Coach is the latest 50.

Training, Growth, and Coach use active attempts by default. A voided row remains in SQLite with its reason and correction history but is excluded from those views.

## Development

```powershell
npm run dev
```

Open `http://localhost:3000`. The default local capture target is also `http://localhost:3000/api/capture/events`.

Open a scoped `/training` URL to use the manual fallback. The form creates one `Manual entry`; its source cannot be supplied by the browser. The Training attempt panel can correct the six whitelisted business fields when a reason is provided. If another write has advanced the revision, refresh the current values and reapply the intended correction rather than overwriting it. Use `Void attempt` for a bad record; repeating the same void request is safe and does not append another correction.

## Browser extension

Build the Chrome MV3 extension:

```powershell
npm run extension:build
```

Load `extension/dist` as an unpacked Chrome extension. Open `http://localhost:3000/settings`, create a pairing code, and paste it into the popup. The code expires after ten minutes and is consumed once. The popup can then enable/disable capture and shows pairing, queue, success, and error status.

Use `/settings` to rotate or revoke credentials. Rotation creates a code scoped to that installation; paste it into the same extension to atomically replace the old credential. Revocation causes capture requests to return 401 until an explicit targeted rotation code pairs it again.

Verdict capture is expected to detect visible accepted, wrong-answer, compile-error, runtime-error, time-limit, memory-limit, and partial verdict text. English verdict tokens and Chinese verdict labels are normalized before being sent to the local app.

Capture protocol V2 creates one logical session per observed problem visit and one attempt per observed submission. Same-problem SPA routes retain the current session; navigation to a different problem emits `SESSION_ENDED(spa_navigation)` before the new `SESSION_STARTED`. Location observation combines `popstate`, `hashchange`, DOM reconciliation, and a 500 ms URL poll fallback.

`pagehide` delivery remains best effort, so an open session with no `ended_at` is expected after browser shutdown or extension interruption. If a hidden/BFCache page is shown again, the extension starts a fresh observed session.

Queue delivery is FIFO and serialized. One drain batch handles at most 25 events. Network errors and retryable 500 responses preserve the queue head and stop; permanent 400/409/413/415 responses and 500 responses at the retry cap drop that head and continue. A 401/403 keeps the queue head without incrementing its retry count so pairing or configuration can recover it.

On the first V2 extension startup, any queued V1 events are discarded once. Chrome local storage records `discardedLegacyEventCount` and `legacyQueueDiscardedAt`, and the service worker logs the discarded count. `installationId` is only a correlation identifier; the separately stored credential authorizes requests. V2 events queued before pairing retain unpaired provenance after delivery.

## Verification

Use the full local gate before handoff:

```powershell
npm run lint
npm run db:migrate
npm run test
npm run typecheck
npm run e2e
npm run extension:check
npm run build
```

`npm run quality:gate` runs all seven commands above in this exact order using an OS-temporary database, so it is the recommended single verification:

```powershell
npm run quality:gate
```

The gate owns its temporary database under `os.tmpdir()` and removes it in a `finally` block; it never opens the default `training-platform.sqlite` and never reuses a server on port 3000. Subcommands run sequentially and stop on the first non-zero exit code. `extension:check` chains `typecheck → extension:test → extension:build → scripts/check-extension-dist.mjs`, so calling it after `quality:gate` already covered it would re-run the full extension sequence.

`npm run test` currently runs 367 tests (pass) plus 1 capability skip (368 total). The skip is a file-symlink escape test that reports EPERM on Windows without Developer Mode; all mandatory junction tests pass. Named test files of interest:

| File | Tests | Role |
|---|---|---|
| `tests/unit/extensionPlatforms.test.ts` | 58 | Adapter registry (AtCoder production, four platforms experimental) |
| `tests/unit/extensionAtcoderCertificationBlocked.test.ts` | 34 | Certification gate BLOCKED path coverage |
| `tests/unit/extensionAtcoderFixtures.test.ts` | 28 | AtCoder fixture loading and characterization |
| `tests/unit/extensionAtcoderPromotion.test.ts` | 16 | Production promotion guard (forged/malformed artifact rejection) |
| `tests/unit/luoguFixtureLoader.test.ts` | 17 | Luogu fixture characterization (historical BLOCKED evidence) |
| `tests/unit/platformCertification.test.ts` | 14 | Read-only certification gate (on-disk BLOCKED + synthetic CERTIFIED) |
| `tests/unit/e2eDatabase.test.ts` | 7 + 1 skip | lstat-safe teardown (6 mandatory junction tests pass; 1 symlink skip expected) |

To run fixture loader or certification gate in isolation:

```powershell
npm run test -- tests/unit/luoguFixtureLoader.test.ts
npm run test -- tests/unit/platformCertification.test.ts
```

`npm run e2e` owns the Next.js server and an isolated SQLite lifecycle. It deletes and recreates `.tmp/playwright`, applies every repository migration, runs 16 tests serially against that database, then removes it during global teardown. E2E cleanup uses an `lstatSync`-based safe walker (`tests/e2e/database.ts`) that handles symlinks, junctions, and broken reparse points. A process already listening on port 3000 is treated as an error; stop it rather than reusing an unknown server or database.

The Coach/Growth E2E fixture writes more rows than either display window and asserts three separate contracts: Training still finds an older scoped problem, Growth totals match the complete database count while showing five activity rows, and Coach reports its 50-attempt analysis window.

The manual fallback E2E creates one isolated manual attempt, verifies source display and Coach/Growth inclusion, corrects it without increasing the attempt count, reads its visible correction history, then voids it and verifies default-query exclusion.

### Recovery

- **Lint step failed inside `npm run quality:gate`.** Inspect the `eslint . --max-warnings=0` output, fix the named files without adding disable comments or downgrading rules, then rerun `npm run lint` directly before re-running the full gate. Do not skip a finding by reducing the severity.
- **E2E cleanup was interrupted.** Confirm no Playwright-owned Next.js process is running (`Get-NetTCPConnection -LocalPort 3000 -State Listen`), then remove only the resolved `<workspace>/.tmp/playwright` directory. The Playwright teardown walker (`tests/e2e/database.ts`) handles symlinks and junctions as leaves; never delete or replace the default `training-platform.sqlite`.
- **Quality-gate temporary directory was interrupted.** The runner creates an `ai-training-quality-gate-*` directory under `os.tmpdir()` and removes it in a `finally` block. If an interrupted run leaves one behind, remove only that matching directory under your OS temp path. The default `training-platform.sqlite` lives at the repository root and is never touched by the gate; an interrupted gate must not be cleaned up by deleting the default database.

## Troubleshooting

### Vitest collects Playwright tests

Expected state: `vitest.config.ts` excludes `tests/e2e/**`. If `npm run test` reports `Playwright Test did not expect test.describe() to be called here`, restore that exclusion.

### One unit test is skipped ("file-symlink escape test BLOCKED: EPERM")

This is expected on Windows without Developer Mode. The test `tests/unit/e2eDatabase.test.ts` probes whether the system can create file symlinks without elevation. The `lstatSync`-based cleanup walker's junction and broken-junction tests all pass regardless. This skip does not indicate a problem.

### E2E database cleanup did not finish

Expected state after `npm run e2e`: `.tmp/playwright` does not exist. If an interrupted run leaves it behind, first confirm no Playwright-owned Next.js process is running, then remove only the resolved `<workspace>/.tmp/playwright` directory. The E2E teardown walker uses `lstatSync`-based deletion that removes symlinks and junctions as leaves without following their targets, then the parent directory. Never delete or replace `training-platform.sqlite` while cleaning test data.

### Playwright browser is missing

If `npm run e2e` reports a missing Chromium executable, run:

```powershell
npx playwright install chromium
```

### Port 3000 is occupied

Check for a listener:

```powershell
Get-NetTCPConnection -LocalPort 3000 -State Listen -ErrorAction SilentlyContinue
```

Stop the stale process before rerunning e2e. Avoid starting manual long-running servers for routine smoke QA.

### Extension events queue but do not arrive

1. Confirm the local app is reachable at `http://localhost:3000`.
2. Confirm the popup says paired and capture is enabled. If it says pairing needs attention, create a new or targeted rotation code in `/settings` and pair again.
3. Open `/training?platform=leetcode&externalId=two-sum` and a supported original problem page.
4. Check `CaptureStatusPanel` for recent events and `AttemptStatusPanel` for materialized attempts.
5. If the page is visible but the attempt stays in `draft`, inspect whether the platform's visible verdict text is covered by `extension/src/platforms.ts` and `tests/unit/extensionPlatforms.test.ts`.

Network errors are retryable. Invalid 400/413/415 responses and permanent 409 event-ID conflicts are dropped to avoid retry loops. A 401 is retained for pairing recovery. If a 409 occurs, inspect whether one producer reused an `eventId` for different event content.

The pairing boundary assumes the local OS account and files remain trustworthy. A process that can edit the SQLite database or Chrome profile can bypass this local HTTP control; that host-compromise case is not solved by localhost bearer credentials.

If SPA capture appears stale, confirm the URL changes in the address bar and inspect the content-script console for `[capture-v2]` errors. Unit tests cover both route-event-first and DOM-mutation-first transitions. AtCoder is the sole production adapter with certified public-DOM fixtures.
