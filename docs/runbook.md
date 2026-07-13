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

Load `extension/dist` as an unpacked Chrome extension. The popup can enable/disable capture and shows queue/success/error status.

Verdict capture is expected to detect visible accepted, wrong-answer, compile-error, runtime-error, time-limit, memory-limit, and partial verdict text. English verdict tokens and Chinese verdict labels are normalized before being sent to the local app.

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
2. Confirm capture is enabled in the extension popup.
3. Open `/training?platform=leetcode&externalId=two-sum` and a supported original problem page.
4. Check `CaptureStatusPanel` for recent events and `AttemptStatusPanel` for materialized attempts.
5. If the page is visible but the attempt stays in `draft`, inspect whether the platform's visible verdict text is covered by `extension/src/platforms.ts` and `tests/unit/extensionPlatforms.test.ts`.

Network errors are retryable. Invalid 400 responses are dropped to avoid retry loops.
