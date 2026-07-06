# Runbook

Last updated: 2026-07-06

## Setup

```powershell
npm install
npm run db:migrate
```

The default SQLite database is `training-platform.sqlite`. For isolated runs, set `TRAINING_DB_PATH` before running migrations or tests that open the database.

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

`npm run e2e` owns the Next.js server lifecycle through Playwright `webServer`. Prefer this for browser smoke QA instead of opening a separate long-running `npm run dev` or `npm run start` shell.

## Troubleshooting

### Vitest collects Playwright tests

Expected state: `vitest.config.ts` excludes `tests/e2e/**`. If `npm run test` reports `Playwright Test did not expect test.describe() to be called here`, restore that exclusion.

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

Network errors are retryable. Invalid 400 responses are dropped to avoid retry loops.
