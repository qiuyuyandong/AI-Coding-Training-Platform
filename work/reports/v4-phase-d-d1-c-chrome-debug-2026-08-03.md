# V4 Phase D D1-C Chrome Debug Attempt - 2026-08-03

## Verdict

`D1-C NOT PASSED; DEBUG BLOCKED BEFORE PRODUCT OBSERVATION`

**Later disposition:** This remains the record for the failed branded-Chrome
real-profile debug only. Its residual development extension was subsequently
removed from the user's real profile. D1-C was later completed in an isolated
headed Chromium process; see
`work/reports/v4-phase-d-d1-c-disposable-observation-2026-08-03.md`.

The separately authorized D1-C attempt did not complete a lifecycle
observation. No D1-C product PASS is claimed. The current Chrome debug attempt
is explicitly excluded from D1-C evidence because it touched the user's real
Chrome profile after the user separately authorized that debugging exception.

## Authorization And Boundary

- D1-U provenance exception was already approved.
- D1-C disposable exact-dist observation was separately authorized.
- The user then authorized a one-time real-profile debug because the current
  Chrome process was requested explicitly. This permission did not convert the
  real-profile run into D1-C evidence.
- No real OJ submission, cookie, account token, password, or user page data was
  read.

## Browser And Artifact

- Browser: Google Chrome `150.0.7871.187`.
- Existing process: Chrome DevToolsActivePort on `127.0.0.1:9222`.
- Profile: the user's existing default Chrome profile, not disposable.
- Extension path: current workspace `extension/dist`.
- Extension ID: `aljppcgkcdbeemppmokcbjgcjdhapakh`.
- Extension version: `0.1.0`.
- Extension install type observed in Chrome: `development`.

## Attempt Results

### Branded Chrome launch

Command:

```text
D1_BROWSER_CHANNEL=chrome D1_BROWSER_HEADED=1 npx playwright test --config playwright.extension.config.ts tests/extension-e2e/capture-v4-upgrade.spec.ts
```

The five-test lane failed before product assertions. The first failure was
`Unified OJ Capture is not loaded`; the remaining failures could not acquire a
live exact-dist service worker. Chrome 150 ignored the command-line unpacked
extension load path. This matches the official Chrome behavior change that
removed `--load-extension` from branded Chrome builds starting in Chrome 137:

- <https://developer.chrome.com/blog/extension-news-june-2025>
- <https://groups.google.com/a/chromium.org/g/chromium-extensions/c/1-g8EFx2BBY>

### CDP installation debug

A temporary uncommitted harness tried the official `Extensions.loadUnpacked`
CDP method. Because a branded Chrome process was already running, the Chrome
singleton reused the user's default profile instead of the requested temporary
profile. CDP then confirmed that the current `extension/dist` was installed,
but the test lane still did not complete the D1-C lifecycle. The temporary
harness and Chrome-specific test-fixture edits were removed after diagnosis.

The official CDP method is documented at:

- <https://chromedevtools.github.io/devtools-protocol/tot/Extensions/#method-loadUnpacked>

## Observed State And Cleanup

Immediately after the failed Chrome test, the extension-only safe snapshot was:

- `captureEnabled=true`;
- `confirmedSubmissions=0`;
- `confirmedSubmissionTombstones=1`;
- `captureOutbox=0`;
- `captureQuarantine=0`;
- `transientE1=0`;
- `transientUnmatchedE3=0`;
- `lastDeliveredAttemptStatus=failed`.

The debug cleanup then cleared the extension's local/session storage and
disabled the extension. Final management inspection reported the same extension
as `enabled=false`. Temporary extension and extensions-manager tabs were closed.
Chrome initially returned `uninstall canceled by user` for the automated
management uninstall request. A later explicit foreground confirmation removed
the development extension; final target and extensions-list checks found no
project extension residual.

The default database metadata remained:

- `training-platform.sqlite` length: `479232` bytes;
- `LastWriteTimeUtc`: `2026-07-23 15:56:38`.

## Consequence

This attempt remains a browser/tooling boundary result, not a product RED and
not a D1-C PASS. Its recommended isolated disposable retry was subsequently
performed and passed; the later report controls current D1-C status.
