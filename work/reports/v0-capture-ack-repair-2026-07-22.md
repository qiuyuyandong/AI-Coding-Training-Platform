# V0 Capture ACK Repair Evidence (2026-07-22)

> Subsequent user observation confirmed the repaired ACK path can synchronize
> and clear its outbox. This report preserves the pre-reload engineering gate;
> current capture status is maintained in `work/handoff-current.md`.

## Decision

**ENGINEERING PASS / PRODUCT BLOCKED.** The uncommitted ACK persistence repair
passes automated verification. The repaired build has not been reloaded or
observed in real Chrome, so this evidence does not freeze an RC, start V0
observation, or establish acceptance.

## Scope

- Correct matching-ACK persistence to update `captureOutbox` and
  `captureQuarantine`, never plain `outbox` or `quarantine` storage keys.
- Validate ACK identity before deleting a bundle.
- Bound invalid-ACK retries and prevent concurrent drain re-entry.
- Correct `RETRY_QUARANTINED_CAPTURE` so one selected item moves to
  `captureOutbox`, leaves `captureQuarantine`, resets `attempts`,
  `nextAttemptAt`, and `automaticRetryBlocked`, and then enters the existing
  single-flight drain once.
- Make every V3 initialization persist the authoritative `captureOutbox` and
  `captureQuarantine` first, then delete the historical plain `outbox` and
  `quarantine` keys without reading or merging their contents.

## Regression Evidence

`tests/unit/extensionOutboxDrain.test.ts` uses stateful fake storage to prove:

- one quarantined item is selected for retry;
- the reset item is persisted under `captureOutbox`;
- `captureQuarantine` becomes empty;
- plain `outbox` and `quarantine` keys are never created;
- one matching ACK sends exactly one request and removes the retried item.

`tests/unit/extensionInstallation.test.ts` adds a stateful upgrade fixture with
one real pending attempt bundle in `captureOutbox` plus conflicting stale data
in plain `outbox` and `quarantine`. It proves:

- the complete authoritative V3 state is persisted before either stale key is
  removed;
- the authoritative bundle survives initialization unchanged;
- both stale keys are absent after initialization;
- one matching ACK sends one request and clears `captureOutbox`;
- a following timer-equivalent drain sends no request.

Focused command:

```powershell
npx vitest run tests/unit/extensionInstallation.test.ts tests/unit/extensionOutboxDrain.test.ts tests/unit/extensionTransport.test.ts
```

Result: **PASS, 3 files / 17 tests**.

## Storage Audit

All direct `chrome.storage.local.set(...)` call sites under `extension/src`
were reviewed. The only plain-key defect was the former direct call
`set(retryQuarantined(...))` in the `RETRY_QUARANTINED_CAPTURE` branch. It now
uses `retryQuarantinedCaptureStorageUpdate(...)`, which returns only
`captureOutbox` and `captureQuarantine`.

The post-fix search for either a direct `set(retryQuarantined(...))` call or an
object passed to `chrome.storage.local.set` beginning with plain `outbox` or
`quarantine` returned no matches. The shared drain persistence path remains
covered by `captureOutboxStorageUpdate(...)` and its fake-storage assertions.
The only remaining plain-key operations are the intentional
`storage.remove("outbox")` and `storage.remove("quarantine")` calls after the
authoritative initialization write; production initialization never requests
or consumes either stale key.

## Verification

Commands run against the current uncommitted worktree:

| Command | Result |
| --- | --- |
| `npm run typecheck` | PASS |
| `npm run extension:check` | PASS: 18 files / 429 tests; typecheck, MV3 build, dist parity and ignore check PASS |
| `npm run quality:gate` | PASS, exit 0 |
| `git diff --check` | PASS; only informational LF-to-CRLF warnings |

The Commander review referred to the pre-regression-test extension result as
**18 files / 427 tests**. The quarantine retry regression raised that to 428;
the V3 stale-key upgrade fixture raises the current verified result to **18
files / 429 tests**. The file count was never 20.

Authoritative `quality:gate` detail:

- lint: PASS with zero warnings;
- disposable migration: PASS;
- curriculum validation: PASS, 12 nodes / 13 edges / 12 resources / 12
  practice mappings / 9 careers;
- unit tests: 67 files / 1002 passed / 1 skipped (1003 total);
- typecheck: PASS;
- Playwright: 25 passed; local AtCoder request audit reported `external=[]`;
- extension check: 18 files / 429 passed, build/parity PASS;
- production build: PASS, 20/20 static pages generated.

The one skip is the explicit Windows file-symlink capability probe blocked by
`EPERM`; mandatory junction coverage still ran. During Playwright, the dev
server printed transient `__webpack_require__.C is not a function` diagnostics
for the corrections route, but all 25 E2E tests passed and the subsequent
optimized production build compiled and generated all pages. The optional
link-access report was absent, so the quality script explicitly skipped that
soft check.

## Git And Product Boundary

- Branch: `feature/v1-followup`.
- Baseline HEAD: `894162b264124eed7315a116cae73b8e11d717b8`.
- State: uncommitted dirty worktree; no replacement RC SHA exists.
- Not performed: Chrome reload, repaired-build real ACK observation, commit,
  push, V0 observation, F1-F4, user acceptance, or V0.5 work.

The remaining product gate is a separately authorized real Chrome observation:
the existing outbox item must receive one matching ACK, disappear, and produce
no later timer request.
