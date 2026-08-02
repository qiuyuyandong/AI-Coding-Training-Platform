# Runbook

Last updated: 2026-08-02 (V4 Phase C C0-C5 engineering complete; C1 LeetCode experimental; C2-C4 blocked)

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

Run the bounded production-dist MV3 spike:

```powershell
npm run extension:e2e -- tests/extension-e2e/webrequest-spike.spec.ts
```

This A0 command launches bundled Chromium with a fresh persistent profile,
loads exact `extension/dist`, denies external page and worker networking, and
proves a synthetic fulfilled POST is observed before and after worker
stop/reawaken. It does not test a real OJ protocol or automatic capture.

Load `extension/dist` as an unpacked Chrome extension. Open `http://localhost:3000/settings`, create a pairing code, and paste it into the popup. The code expires after ten minutes and is consumed once. The V4 Phase 0 popup reports confirmed-only `等待判题`, `待同步结果`, and `已隔离结果` separately, together with transition, migration, and blocking diagnostics. `等待判题` remains zero because Phase 0 has no network-confirmed submission producer.

Use `/settings` to rotate or revoke credentials. Rotation creates a code scoped to that installation; paste it into the same extension to atomically replace the old credential. Revocation causes capture requests to return 401 until an explicit targeted rotation code pairs it again.

Visible accepted, wrong-answer, compile-error, runtime-error, time-limit, memory-limit, and partial verdict text remains passively detectable. In Phase 0 those candidates cannot create a new bundle or training record.

Capture protocol V4 Phase 0 creates no result for page lifecycle activity or a click. A trusted, visible, enabled exact submit control may create only a bounded E0 hint in `chrome.storage.session`; NowCoder additionally requires `button.btn-submit` labelled exactly `保存并提交`. An MV3 alarm removes hints after 30 seconds even when no later click occurs. E0 never contributes to waiting, outbox, or API traffic.

`pagehide`, ordinary navigation, running samples, debugging, and direct result-page opens do not create training records or outbox entries. Exact result documents may emit an internal passive candidate, but the Phase 0 background cannot turn it into a bundle.

Outbox delivery is serialized by bundle. Network errors and 401/403 preserve every bundle and stop the current drain. A 400/409/413/415 isolates only that bundle and continues; repeated 500 responses move that bundle to quarantine at the retry cap. The popup can retry or delete an isolated item and clears outbox and quarantine only through separate confirmed actions. Capacity failures are visible and never evict older results.

The supported domestic problem routes are `leetcode.cn/problems/<slug>`, `www.nowcoder.com/practice/<id>`, `ac.nowcoder.com/acm/problem/<id>`, and `www.luogu.com.cn/problem/<id>`. Exact result routes are also injected for passive detection: LeetCode `/problems/<slug>/submissions/<digits>/` and `/submissions/detail/<digits>/`, NowCoder `/acm/contest/view-submission?submissionId=<digits>`, and Luogu `/record/<digits>`. The NowCoder E3 ingress gate additionally requires the exact pathname without a trailing slash, an `https://` origin, no credentials, no non-default port, no hash, exactly one `submissionId` query key with `[0-9]{1,20}` decimal digits, and the top frame; the gate lives in `extension/src/contentIngress.ts:isExactNowCoderResultUrl` and the producer in `extension/src/background.ts:applyContentIngress`. LeetCode may restore `/problems/<slug>/` while retaining the selected submission-detail tab; that surface is accepted only when it is the unique visible selected tab in the first-party tabbar and contains a recognized final verdict. Duplicate identical verdict panes are collapsed, conflicts are rejected, and transient labels such as `提交详情` remain pending. Runtime checks reject malformed IDs, extra query/hash data, spoofed hosts, ambiguous anchors, and hidden or overlong title text. Sanitized `authenticated-characterization` fixtures cover LeetCode AC, NowCoder AC, and Luogu AC/Compile Error; they never certify production.

On V4 initialization, authoritative V4 state and the click-intent migration audit are written before `pendingSubmissionIntents` is removed. No V3 intent becomes a confirmed submission. Existing completed outbox, quarantine, pairing, endpoint, installation, and earlier migration state is preserved. The earlier V3 migration of the pre-bundle `eventQueue` remains historical and is not rerun or reinterpreted. Neither migration modifies server records.

## Verification

Use the full local gate before handoff:

```powershell
npm run lint
npm run db:migrate
npm run curriculum:validate
npm run test
npm run typecheck
npm run e2e
npm run extension:check
npm run extension:e2e
npm run build
```

`npm run quality:gate` runs all nine commands above in this exact order using an OS-temporary database, so it is the recommended single verification:

```powershell
npm run quality:gate
```

The gate owns its temporary database under `os.tmpdir()` and removes it in a `finally` block; it never opens the default `training-platform.sqlite` and never reuses a server on port 3000. Subcommands run sequentially and stop on the first non-zero exit code. `extension:check` chains `typecheck → extension:test → extension:build → scripts/check-extension-dist.mjs`, so calling it after `quality:gate` already covered it would re-run the full extension sequence.

The latest 2026-07-26 V4 Phase A closeout gate ran 950 passing extension unit tests across 30 files (the new Phase A scope). `npm run extension:check` (typecheck → extension:test → extension:build → check-extension-dist) covers the V4 modules end-to-end: `extension/src/evidence.ts` (Safe Evidence), `extension/src/submissionCorrelator.ts` (closed-tag-union correlator with frozen state), `extension/src/captureStateMachine.ts` (pure reducer; pure-JS SHA-256 with byte-identical output to Node `createHash("sha256")` for the canonical A4 fixture `bundle_91b8a3600f18390ffdee270d325ddd1d92295484e6552dc4b8b5f866782ca7f2`), `extension/src/adapters/contract.ts` + `extension/src/adapters/registry.ts` (single registry with host-ownership / DOM status / V4 network status), `extension/src/networkObserver.ts` (host-scoped webRequest lifecycle), `extension/src/mainWorldBridge.ts` (MAIN-world IIFE bridge), `extension/src/mainWorldRelay.ts` (ISOLATED-world relay with recursive forbidden-key gate), `extension/src/backgroundOrchestrator.ts` (pure 9-event reducer), `extension/src/transientEvidenceStorage.ts` (session-only storage) and `extension/src/confirmedSubmissionStorage.ts` (local-only durable storage) with deterministic `${platform}:${externalSubmissionId}` storageKey and bounded tombstones. The Fake OJ matrix `tests/extension-e2e/capture-v4-network.spec.ts` reports 31 passed and 1 skipped; the skipped scenario is the service-worker-restart seam (a known test-harness infrastructure limitation, not a production defect; the `test.skip` annotation documents this). The earlier Phase 0 1046-test V0 gate remains historical.

Named Phase A test files of interest:

| File | Tests | Role |
|---|---|---|
| `tests/unit/extensionEvidence.test.ts` | 177 | Safe Evidence schema, recursive forbidden-key gate, real Gregorian date, all 12 final verdicts |
| `tests/unit/extensionAdapterContract.test.ts` | 47 | Branded policy factory, AST dependency gate, host ownership, registry identity |
| `tests/unit/extensionCaptureStateMachine.test.ts` | 40 | 9-input reducer, 7-state model, SHA-256 bundle id, chronologic invariants |
| `tests/unit/extensionSubmissionCorrelator.test.ts` | 79 | Pure correlator, E3-before-E2 retention, disambiguation, time-window guard |
| `tests/unit/extensionBackgroundOrchestrator.test.ts` | 35 | Pure orchestrator, E1→E2→E3 seam, prune lifecycle, dual-domain persistence |
| `tests/unit/extensionMainWorldBridge.test.ts` | 57 | MAIN bridge validation, forbidden-key defense, relay revalidation |
| `tests/unit/extensionNetworkObserver.test.ts` | 12 | Pure observer lifecycle + rejection reasons |
| `tests/unit/extensionNetworkObserverIntegration.test.ts` | 7 | Background listener registration + filters + outcome routing |
| `tests/unit/extensionTransientEvidenceStorage.test.ts` | 10 | Session-only parse/plan/write/prune + parseSafeEvidence revalidation |
| `tests/unit/extensionConfirmedSubmissionStorage.test.ts` | 9 | Local-only durable state, idempotent finalize, bounded tombstones |
| `tests/unit/extensionInstallation.test.ts` | 20 | V4 split init, tombstone preservation, no-overwrite of stable fields |
| `tests/unit/extensionPlatforms.test.ts` | 110 | Backward-compat adapter registry export |
| `tests/unit/extensionUiHint.test.ts` | 11 | V4 E0 hint routing |
| `tests/unit/extensionPopup.test.ts` | 7 | Read-only popup presentation |

To run fixture loader or certification gate in isolation:

```powershell
npm run test -- tests/unit/luoguFixtureLoader.test.ts
npm run test -- tests/unit/platformCertification.test.ts
```

`npm run e2e` owns the Next.js server and an isolated SQLite lifecycle. It deletes and recreates `.tmp/playwright`, applies every repository migration, runs 25 tests serially against that database, then removes it during global teardown. E2E cleanup uses an `lstatSync`-based safe walker (`tests/e2e/database.ts`) that handles symlinks, junctions, and broken reparse points. A process already listening on port 3000 is treated as an error; stop it rather than reusing an unknown server or database.

The Coach/Growth E2E fixture writes more rows than either display window and asserts three separate contracts: Training still finds an older scoped problem, Growth totals match the complete database count while showing five activity rows, and Coach reports its 50-attempt analysis window.

The manual fallback E2E creates one isolated manual attempt, verifies source display and Coach/Growth inclusion, corrects it without increasing the attempt count, reads its visible correction history, then voids it and verifies default-query exclusion.

### Extension E2E lane

The `npm run extension:e2e` command runs the Fake OJ Playwright matrix in a
bundled persistent Chromium profile with exact `extension/dist` loaded. It owns
its own temporary storage under `.tmp/playwright-extension/` and never touches
the default `training-platform.sqlite`.

```powershell
# Full extension E2E matrix (43 passing tests and 1 documented historical skip)
npm run extension:e2e

# Single spec filter
npm run extension:e2e -- tests/extension-e2e/capture-v4-network.spec.ts
npm run extension:e2e -- tests/extension-e2e/capture-v4-full-chain.spec.ts
```

The B3 lifecycle cases in `capture-v4-network.spec.ts` are black-box checks:
CDP controls Worker termination/wake, exact `ac.nowcoder.com` Fake OJ routes
load the production content script, and popup status/export proves recovery.
They do not use Worker storage inspection or create session state directly.
The reload case uses the actual `chrome://extensions` Reload control and must
leave the new popup stopped with export disabled. These tests prove only the
NowCoder browse-only navigation witness; they do not characterize submission
traffic or enable automatic network-confirmed capture.

The B7 NowCoder lane is `tests/extension-e2e/capture-v4-nowcoder.spec.ts`.
It contains eight production-dist scenarios and owns a disposable Next server
and SQLite database. Passing this lane proves automated experimental behavior,
not a real-platform release.

The Phase B E3 ingress repair lives in
`tests/extension-e2e/capture-v4-nowcoder-task5-real-observation.spec.ts`
(Task 5: fresh-profile real history-open ingress) and
`tests/extension-e2e/capture-v4-nowcoder-task6-real-retest.spec.ts`
(Task 6: same-build fresh full-chain real retest). Both run with the
production-built `extension/dist`, a brand-new Chromium user-data
directory per test, the disposable Next server paired through
`/api/capture/pairing-codes`, and the global-setup-managed
disposable SQLite at `.tmp/capture-v4-full-chain-*/`. They prove
engineering evidence for the missing-E3 layer; NowCoder remains
`experimental`. Run them with:

```powershell
npm run extension:e2e -- tests/extension-e2e/capture-v4-nowcoder-task5-real-observation.spec.ts
npm run extension:e2e -- tests/extension-e2e/capture-v4-nowcoder-task6-real-retest.spec.ts
```

The `scripts/a10-bootstrap.mjs` helper is a reusable, idempotent
bootstrap that pre-creates the disposable SQLite, runs migrations, and
exports the path via `.tmp/server-db-path.txt` so forked worker
processes can read it. It is intended for future webServer-based A11+
integrations; the current A11 gate does not start the Next.js dev
server (Playwright `webServer` starts before `globalSetup`, so a
disposable DB path would not reach the server subprocess). The
extension lane is therefore intentionally driven through the Fake OJ
matrix + the production artifact load, not through a real API round-trip.

`extension:e2e` is integrated into `npm run quality:gate` after
`extension:check` (which already validates the dist) and before `build`.
The offline `npm run e2e` lane remains extension-free and asserts no
extension worker or frame appears in the browser context.

Phase A Task A10 review fixes are at commit `9b81784`. A11 review
fixes are at `6401e17`. A12 review fixes are at `30f3d73`. After the
A11 gate integration the Fake OJ matrix reports 31 passed and 1
skipped; the service-worker-restart scenario is `test.skip` because
of the test-harness worker-restart seam (a known infrastructure
limitation, not a production defect).

#### Phase C-D readiness contract

The platform-delta validator and template are the entry gate for every
Phase C / D implementation. Run both commands before opening a C1-C5
or D1-D5 implementation PR:

```powershell
npx vitest run tests/unit/v4AdapterReadinessValidator.test.ts
node scripts/validate-v4-adapter-readiness.mjs --all
```

The manifest (`docs/superpowers/specs/v4-adapter-readiness.json`) must
list every platform whose `v4NetworkStatus` is not `uncharacterized`,
with non-blank `requestMatcher`, `e2Policy`, `e3Policy`,
`failureDisposition`, `endpointDriftDisposition`, a non-empty
`privacyFields` array, a non-empty
`fakeOjCases` array, a `characterization.source` and `realObservation`
that resolve on disk, and `productionCertification: true` when the
status is `production`. Authenticated characterization cannot satisfy
a production gate. `disabled` is a terminal state that only requires a
`disableReason`. `candidate` is explicitly non-terminal: it means the
adapter is implemented and automatically testable but still lacks a
successful same-build real observation. The CLI rejects docs/registry status disagreement,
fabricated evidence paths, and comment-mismatched registries.

A future platform delta plan must be derived from
`docs/superpowers/plans/templates/v4-platform-network-migration-template.md`,
include the `Implementation Boundary` section, and remain blocked on
fresh user-authorized real-submission characterization before any
adapter code change.

C3 Codeforces ended `V4_BLOCKED` after a ready-gated natural submission moved
from `/problemset/submit/` to `/problemset/status` with zero retained records
and zero navigation witnesses. Do not diagnose this by reading status rows or
queries: Chrome omits `documentId` for frame navigation, and the landing path
does not carry the stable submission plus contest/problem identity required by
the reviewed E2 contract. A retry requires a separately reviewed scalar bridge
or first-party protocol change.

## Recovery

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

### Existing completed bundles do not arrive

1. Confirm the local app is reachable at `http://localhost:3000`.
2. Confirm the popup says paired and capture is enabled. If it says pairing needs attention, create a new or targeted rotation code in `/settings` and pair again.
3. Check the popup's `待同步结果` and `已隔离结果`; Phase 0 does not create new automatic bundles.
4. Check `CaptureStatusPanel` only for delivery of bundles that already existed before the V4 migration.
5. Use the manual attempt form when a platform has no proven V4 network chain. LeetCode and NowCoder are network-`experimental`; AtCoder, Codeforces, and Luogu are network-`blocked`.

Network errors are retryable. Invalid 400/413/415 responses and permanent 409 event-ID conflicts are dropped to avoid retry loops. A 401 is retained for pairing recovery. If a 409 occurs, inspect whether one producer reused an `eventId` for different event content.

The pairing boundary assumes the local OS account and files remain trustworthy. A process that can edit the SQLite database or Chrome profile can bypass this local HTTP control; that host-compromise case is not solved by localhost bearer credentials.

If passive verdict detection appears stale, inspect both the current URL and the selected result tab before changing verdict aliases. For LeetCode, `/problems/<slug>/submissions/<id>/` and `/submissions/detail/<id>/` are exact result forms, while a restored `/problems/<slug>/` is valid only with the selected semantic submission-detail surface. A generic `提交详情` label is non-final, not `Other Failure`. Inspect the content-script and service-worker consoles for `[capture-v4]` messages. The popup's action status distinguishes a received control action from a completed sync; `待同步结果` reaches zero only after a matching ACK for an existing completed bundle. If `chrome://extensions` reports a startup error, reload the current `extension/dist`; the service worker capability-checks optional `StorageArea.setAccessLevel`, and every popup/content fire-and-forget operation handles rejected Promises. Adapter DOM status does not enable V4 network capture: AtCoder remains the sole production DOM adapter, while its independent V4 network status is `blocked`; LeetCode and NowCoder are network-`experimental`, and Codeforces/Luogu are network-`blocked`.

Phase C C5 removed the runtime V3 click-derived pending-intent event and
unsupported-verdict fallback. Initialization may only count and delete the
legacy `pendingSubmissionIntents` key; it must never write or consume that key.
Existing completed outbox bundles remain compatible and deliverable.
