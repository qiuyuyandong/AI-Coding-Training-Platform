# Runbook

Last updated: 2026-07-14

## Setup

```powershell
npm install
npm run db:migrate
```

The default development database is `training-platform.sqlite`. Set `TRAINING_DB_PATH` for any manual isolated run. Playwright does this automatically and exclusively uses `.tmp/playwright/training-platform.sqlite`.

## Development

```powershell
npm run dev
```

Open `http://localhost:3000`. The default local capture target is also `http://localhost:3000/api/capture/events`.

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
npm run db:migrate
npm run test
npm run typecheck
npm run e2e
npm run extension:build
npm run build
```

`npm run e2e` owns the Next.js server and an isolated SQLite lifecycle. It deletes and recreates `.tmp/playwright`, applies every repository migration, runs tests serially against that database, then removes it during global teardown. A process already listening on port 3000 is treated as an error; stop it rather than reusing an unknown server or database.

## Troubleshooting

### Vitest collects Playwright tests

Expected state: `vitest.config.ts` excludes `tests/e2e/**`. If `npm run test` reports `Playwright Test did not expect test.describe() to be called here`, restore that exclusion.

### E2E database cleanup did not finish

Expected state after `npm run e2e`: `.tmp/playwright` does not exist. If an interrupted run leaves it behind, first confirm no Playwright-owned Next.js process is running, then remove only the resolved `<workspace>/.tmp/playwright` directory. Never delete or replace `training-platform.sqlite` while cleaning test data.

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

If SPA capture appears stale, confirm the URL changes in the address bar and inspect the content-script console for `[capture-v2]` errors. Unit tests cover both route-event-first and DOM-mutation-first transitions, but platform-specific DOM readiness remains experimental until one adapter receives fixture certification.
