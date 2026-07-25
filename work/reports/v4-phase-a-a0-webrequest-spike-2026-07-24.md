# V4 Phase A Task A0 Production-Dist webRequest Spike

Date: 2026-07-24

## Decision

**GO for Task A0.** Playwright `route.fulfill()` and the exact production
`extension/dist` MV3 `webRequest.onBeforeRequest` listener both observed the
same synthetic first-party-shaped POST on repeated fresh-profile runs. This
decision authorizes no later task by itself and does not establish E2, a real OJ
protocol, adapter readiness, RC status, acceptance, or release.

## Environment

- Branch: `feature/v1-followup`
- Base HEAD: `1ce70959fb0d08704c880a15447ecd25c2229fa7`
- Worktree: uncommitted and dirty
- Playwright: 1.53.1
- Bundled Chromium: `138.0.7204.23`
- Loaded artifact: `D:\Cowork\AI刷题训练平台\extension\dist`
- Manifest: production `extension/manifest.json`, with ordinary `webRequest`
  permission; no test-only manifest or modified dist

## RED Evidence

After creating the persistent-context production-dist test but before adding
the listener, the spike failed at the intended assertion:

```text
Expected marker count: 1
Received marker count: 0
Playwright had already fulfilled the exact POST.
```

The failure was not caused by a missing import, browser startup, extension load,
or invalid test setup.

## Final Repeated Evidence

Stable command:

```powershell
npm run extension:e2e -- tests/extension-e2e/webrequest-spike.spec.ts
```

Two consecutive final runs used newly created and link-safe-cleaned persistent
profiles. Both passed 1/1 test and emitted the same evidence:

```json
{
  "browserVersion": "138.0.7204.23",
  "distPath": "D:\\Cowork\\AI刷题训练平台\\extension\\dist",
  "playwrightObservedPostCount": 2,
  "extensionMarkerCount": 2,
  "deniedExternalRequestCount": 0,
  "workerNetworkDenialProbe": true,
  "workerLifecycle": ["stopped", "running"]
}
```

Per run:

- first exact POST: Playwright fulfilled once and extension stored one marker;
- wrong GET on the exact path: zero new markers;
- POST on the wrong path: zero new markers;
- CDP `ServiceWorker.stopWorker` produced `stopped`, then the second exact POST
  produced `running` and one additional marker;
- final exact POST count: 2;
- final extension marker count: 2;
- marker fields were limited to request ID, method, normalized endpoint key,
  tab/frame/document IDs, and background receipt time;
- no request body, response body, headers, cookies, credentials, source code,
  account identity, or page text was requested or stored.

## Network Denial

Two independent controls are active before navigation:

1. `BrowserContext.route("**/*")` fulfills only the synthetic page and exact
   synthetic probe URLs, continues only `chrome-extension://` resources, never
   calls `route.fetch()`, and aborts every other page request.
2. Chromium launches with `--no-proxy-server` and
   `--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE localhost, EXCLUDE 127.0.0.1`.
   A fetch from the real extension worker to an AtCoder denial-probe path must
   reject before any response. The final evidence records
   `workerNetworkDenialProbe: true`.

One pre-fix denial-probe run exposed that the system proxy could bypass the DNS
mapping: a synthetic GET to
`https://atcoder.jp/__capture_v4_network_denial_probe__` received a response.
It carried no body, credentials, user data, source code, problem statement, or
submission action. The run was failed, not accepted as evidence. Adding
`--no-proxy-server` closed the bypass; two subsequent clean-profile runs passed
the worker denial probe. No real OJ submission was made.

## Additional Verification

- `npm run extension:check`: PASS, 20 files / 468 tests, typecheck, MV3 build,
  and dist parity.
- `npm run typecheck`: PASS during spike iteration and through
  `extension:check`.
- `npm run lint`: PASS after the final fixture and teardown integration.
- `node scripts/check-extension-dist.mjs`: PASS before every stable spike run.
- Profile cleanup: the final global teardown removes
  `.tmp/playwright-extension`; no profile remains after each test.
- Main Vitest explicitly excludes `tests/extension-e2e/**`, preserving the
  ordinary unit/Playwright lane boundary.

Not run for A0:

- ordinary `npm run e2e`;
- aggregate `npm run quality:gate`;
- production application `npm run build`;
- database migration;
- real OJ characterization or submission.

These are outside the bounded A0 verification command and must not be inferred
as freshly passing from this report. Phase 0's earlier full gate remains
historical evidence, not an A0 rerun.

## Boundary

- The observer seam matches only POST
  `https://atcoder.jp/__capture_v4_webrequest_spike__/submit` with
  `xmlhttprequest` type and valid tab/frame/document identity.
- It is synthetic infrastructure evidence and cannot claim AtCoder network
  readiness.
- No E2 confirmation, response interpretation, request-body access, MAIN-world
  bridge, popup/API/SQLite chain, adapter promotion, commit, push, or PR was
  performed.

## Next Gate

A1 is not authorized by the user's A0-only instruction. The next action is to
request explicit authorization before implementing Phase A Task A1 safe
Evidence schemas.
