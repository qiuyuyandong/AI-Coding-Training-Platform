# V4 Phase D Local Vault Route H D1 Spike Evidence

Date: 2026-08-25

Scope: Route H installation-level capability viability only

Verdict: **PASS — D2 may start**

## Browser and isolation

- Browser: Chrome for Testing `151.0.7922.138` for Windows x64.
- Official source:
  `https://storage.googleapis.com/chrome-for-testing-public/151.0.7922.138/win64/chrome-win64.zip`
- Download lookup source:
  `https://googlechromelabs.github.io/chrome-for-testing/latest-versions-per-milestone-with-downloads.json`
- Local archive SHA-256:
  `864A03252382FCFAF0475A1D7CAD30B99CB54883060DCB5526249F4CA08AA03A`.
- Chromium 138 was not used as evidence.
- The run used two fresh persistent profiles, generated target and attacker
  extension copies, two disposable migrated SQLite databases, and a temporary
  installation config under the repository `.tmp` boundary.
- Host resolver rules rejected every non-local hostname. No OJ was opened and
  no real capture action ran.

## Frozen probe inputs

- `playwright.route-h-spike.config.ts`:
  `FC8053DEF28B44FFD0D04D7A39A1355E2905EBCAFB8F328EE2F85E6300FDB9AC`
- `tests/extension-e2e/capture-local-route-h-spike.spec.ts`:
  `659C74D4A86190D89511E5C41DCE14B558B57257BF02B718CA95D1C733567F98`
- `tests/extension-e2e/database.ts`:
  `9F9CFC7E52ECF2576953740A22D62F2D2B8049BDD5058402F429081B546115D3`

The target probe injects the repository's fixed manifest key and verifies
extension ID `oldmkbngfokmhlkjmlichccmbebipmei`. Its
`externally_connectable.matches` contains only `http://localhost/*` and declares
no extension IDs. The attacker probe is a separately keyed extension.

## Gate results

The final authoritative command was:

```powershell
$env:ROUTE_H_CHROME_EXECUTABLE = '<project>/.tmp/chrome-for-testing-151.0.7922.138-win64/chrome-win64/chrome.exe'
npx playwright test --config playwright.route-h-spike.config.ts --reporter=line
```

Result: `1 passed (12.1s)`.

The passing scenario proves all D1 requirements:

- the canonical `http://localhost:3000/settings` page reaches the fixed-ID
  extension, while the separately installed extension's direct external call
  is rejected by Chrome;
- the target accepts only the exact settings sender URL and a closed message
  schema;
- a 60-second challenge is single-use; expired, replayed and concurrent-loser
  completions fail closed;
- the extension generates a 256-bit `capture_` capability; the page's DOM,
  local storage and session storage never contain it; the app config contains
  only its SHA-256 hash and non-secret installation metadata;
- missing and wrong Bearer requests are rejected before JSON parsing and leave
  the first disposable database at `0 capture events / 0 sessions / 0 attempts`;
- the correct sanitized fake four-event Bundle writes `4/1/1`, and exact replay
  is idempotent;
- restart and extension reload preserve the extension-local capability;
- switching the active disposable Vault keeps the installation config byte-for-
  byte unchanged and the same capability writes to the new database;
- a second fresh profile begins disconnected, requires one settings-page
  connection, rotates the installation record, and then writes successfully.

Static validation also passed:

```text
npx eslint playwright.route-h-spike.config.ts tests/extension-e2e/database.ts tests/extension-e2e/capture-local-route-h-spike.spec.ts
npx tsc --noEmit --pretty false
```

## Invalid first run and harness correction

The first execution reached the scenario's final cleanup after all functional
assertions, then exited non-zero because the shared disposable-directory helper
used `rmSync(directory, { recursive: false })`, which returns Windows `EISDIR`.
That run is not treated as evidence. The helper now removes an already-emptied
directory with `rmdirSync`; the stranded exact temporary directory was verified
inside `.tmp` and deleted. The complete scenario was then rerun from fresh
profiles and passed. No Route H assertion or security contract was weakened.

## Preservation and scope

- Default database before and after:
  - bytes: `479232`
  - mtime UTC: `2026-07-23T15:56:38.8411343Z`
  - SHA-256: `2485DBEA8E9C9CF2F073BC6C9BA4AA0A5261DC3744DDA7592A2890BC554666C3`
- Port 3000 was released and no Chrome for Testing 151 process remained.
- D1 changes only test/probe assets and the Windows-safe test teardown helper;
  production manifest, application routes, capture runtime, database schema and
  extension storage implementation remain unchanged.
- D7, real OJ access/actions, RC, release, push and PR remain unauthorized.
