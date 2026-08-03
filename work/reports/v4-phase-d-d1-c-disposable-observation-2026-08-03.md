# V4 Phase D D1-C Disposable Observation - 2026-08-03

## Verdict

`D1-C PASS; FINAL D1 REVIEW APPROVE; D1 PHASE COMPLETE`

The user-authorized D1-C observation completed in a headed, isolated Chromium
process with disposable profiles, the exact production `extension/dist`, Fake
OJ/localhost traffic, and disposable SQLite. All five D1 scenarios passed. The
verdict is based on the browser operation plus direct inspection of the
resulting evidence JSON, artifact hashes, storage transitions, API/ACK counts,
SQLite deltas, real-profile cleanup, and default-database metadata. It is not
inferred from the Playwright exit code alone.

This is not an RC, product acceptance, release, or authorization for D2/D3.

## Authorization And Isolation

- The user separately authorized D1-C after approving the narrow D1-U
  provenance exception.
- Browser: headed Playwright Chromium `138.0.7204.23` in newly created
  disposable persistent profiles under `.tmp/playwright-extension/`.
- Artifact: current normal production build at `extension/dist`.
- Traffic: Fake OJ routes and localhost only; no real OJ submission.
- Database: extension-E2E disposable SQLite only.
- The earlier branded Chrome 150 real-profile debug remains excluded from D1-C
  evidence and is retained in
  `work/reports/v4-phase-d-d1-c-chrome-debug-2026-08-03.md`.
- Its residual `Unified OJ Capture` development extension was subsequently
  removed from the user's real `chrome://extensions` list; no project extension
  target or temporary extensions-manager tab remained.

## Command And Result

Final observation command:

```powershell
npx playwright test --config playwright.extension.config.ts tests/extension-e2e/capture-v4-upgrade.spec.ts --headed
```

Result: `5 passed` in `58.8s`.

The final run followed one focused harness correction: after an unpacked reload,
`recordWorkerAction` now re-acquires the live service worker through the existing
bounded `summarizeStorageEventually(context, workerUrl)` path before reading the
after-state. This corrected a destroyed-handle observation race without changing
production code or weakening any lifecycle assertion. The focused scenario then
passed, followed by the full `5/5` run.

Evidence file: `.tmp/phase-d-d1-e2e-evidence.json`.

## Artifact Identity

- Source HEAD: `e09f795eeb8168b79c7f18ad3418fa78320fdefa` plus the recorded
  uncommitted D1 working tree.
- Manifest version: `0.1.0`.
- Disposable extension ID: `aljppcgkcdbeemppmokcbjgcjdhapakh`.

| Artifact | Normal SHA-256 | `d1-replacement` SHA-256 |
|---|---|---|
| `manifest.json` | `22b1fbeac7feac799c159d5a5d295700f7fef5a395c40f1a39168ea9e0293d08` | `22b1fbeac7feac799c159d5a5d295700f7fef5a395c40f1a39168ea9e0293d08` |
| `background.js` | `6c3cc7f65732550952446913d02e9164c86234dfd871e54e6985070613b80f66` | `595a42c836d5e6a34746456ef56b87f03352fb7f0502d9d81f119be2109c420c` |
| `content.js` | `0c0f87f75e23070e29d06db6d2dc3ccadaa62a1e64d61d327b3785594b010b88` | `0c0f87f75e23070e29d06db6d2dc3ccadaa62a1e64d61d327b3785594b010b88` |
| `popup.js` | `afd0522b15fc45780e2688e7e418e8a19174f206428f8340c5fd905ef34f41ac` | `afd0522b15fc45780e2688e7e418e8a19174f206428f8340c5fd905ef34f41ac` |
| `main-world-bridge.js` | `4d89a80f0351295ee1c0cd173be107080983868d18510d028854695eacee3943` | `4d89a80f0351295ee1c0cd173be107080983868d18510d028854695eacee3943` |

The replacement observation proves only a same-source build-identifier variant;
it is not a distinct-version compatibility claim or D3 immutable candidate.

## Lifecycle Evidence

The inspected count tuple is
`confirmed/tombstones/outbox/quarantine/e0/e1/unmatchedE3/ingressReady/ingressDiagnostics`.

| Action | Before | After | Result |
|---|---|---|---|
| Browse-only before submit | `0/0/0/0/0/0/0/0/0` | `0/0/0/0/0/0/0/0/0` | No capture state created |
| Worker restart after E1 | `0/0/0/0/1/1/0/0/0` | `0/0/0/0/1/1/0/0/0` | E1 retained, no confirmation |
| Worker restart after E2 | `1/0/0/0/1/2/0/0/0` | `1/0/0/0/1/2/0/0/0` | `nowcoder:84259001` retained |
| Worker restart before E3 | `1/0/0/0/1/2/0/0/0` | `1/0/0/0/1/2/0/3/0` | Only ingress readiness grew |
| Worker restart with retained outbox | `0/1/1/0/1/1/0/4/0` | `0/1/1/0/1/1/0/5/0` | Tombstone and outbox identity retained |
| `chrome.runtime.reload` | `1/1/1/1/1/1/0/1/1` | `1/1/1/1/0/0/0/0/0` | Durable state retained; transient state cleared |
| Disable/enable | `1/1/1/1/0/0/0/1/1` | `1/1/1/1/0/0/0/0/0` | Durable identity retained |
| Same-path reload | `1/1/1/1/0/0/0/1/1` | `1/1/1/1/0/0/0/0/0` | Durable identity retained |
| Same-source replacement reload | `1/1/1/1/0/0/0/1/1` | `1/1/1/1/0/0/0/0/0` | Durable identity retained |
| Browser full restart | `1/1/1/1/0/0/0/1/1` | `1/1/1/1/0/0/0/0/0` | Durable identity retained |
| Global capture pause | `1/1/1/1/0/0/0/0/0` | `1/1/2/0/0/0/0/1/0` | No new capture evidence; manual retry transition only |
| Browser restart after E1 | `0/0/0/0/1/1/0/0/0` | `0/0/0/0/0/0/0/0/0` | Transient E1 cleared without promotion |
| Browser restart after E2 | `1/0/0/0/1/2/0/0/0` | `1/0/0/0/0/0/0/0/0` | Confirmed submission retained |

Complete local/session key arrays and UTC action timestamps remain in the
evidence JSON. Unknown local sentinels and durable capture identities were
preserved across the applicable lifecycle actions.

## API And SQLite Evidence

- Extension capture requests/ACKs: `1/1`.
- Direct replay requests/ACKs: `1/1`.
- Disposable SQLite `capture_events`: `0 -> 4`.
- Disposable SQLite `training_sessions`: `0 -> 1`.
- Disposable SQLite `training_attempts`: `0 -> 1`.
- Replayed bundle produced no duplicate rows.

## Final Gates And Preservation

After the harness correction, `npm run quality:gate` exited `0`:

- lint: PASS;
- disposable migration: PASS;
- curriculum: `12 nodes / 13 edges / 12 resources / 12 practice mappings / 9 careers`;
- unit: `97 files / 2156 passed / 1 skipped`;
- typecheck: PASS;
- app E2E: `25 passed`;
- extension check: `42 files / 1406 passed`;
- extension E2E: `53 passed / 1 documented existing skip`;
- production build: PASS, `20/20` static pages.

The default database remained `479232` bytes with
`LastWriteTimeUtc=2026-07-23 15:56:38`. No server remained on port 3000 after
the observation. The user's real Chrome profile had zero target pages for the
project extension and zero temporary `chrome://extensions` tabs after cleanup.

## Final Review

D1-C is complete. The independent final D1 reviewer inspected the actual diff,
approved provenance exception, headed observation, preservation evidence, and
report consistency and returned `APPROVE` with no blocking or important
findings. D1 phase is complete. D2 has not started; this result is not an RC,
product acceptance, or release.
