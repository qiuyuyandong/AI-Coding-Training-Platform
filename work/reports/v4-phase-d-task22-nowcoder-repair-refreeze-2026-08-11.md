# V4 Phase D Task 22 — NowCoder identity repair D3 refreeze

Date: 2026-08-11

Branch: `feature/v1-followup`

Immutable candidate: `a911425a415db2ee374430ced62edcaa7b786866`

Status: `D3 CANDIDATE FREEZE PASS — D4 NOT STARTED`

This receipt records engineering evidence only. It is not D4 acceptance, an
RC, user acceptance, release, or public certification.

## Candidate lineage

* `6aa750c0ad5db6e90d9681bcef08111fc1cb3929` — rejects exact lowercase
  reserved NowCoder `/acm/problem/list` identity while preserving legitimate
  generic identities and the approved pilot policy;
* `d8363035700241dc41217238a7583f3b89697881` — removes the Playwright
  orphan service-worker waiter without retry or timeout changes;
* `a911425a415db2ee374430ced62edcaa7b786866` — owns the reviewed repair paths
  in the exact candidate validator and is the immutable candidate SHA.

The old candidate `4e7a47bfc22fece4aa60e4bab2f4223668be480b`,
its hashes, and its Task21 observations remain historical and cannot support
this candidate.

## RED and review evidence

The NowCoder causal RED and implementation gates are recorded in the Task21
report. The D3 infrastructure repair added five pure lifecycle cases. Before
the helper repair, the focused run failed two assertions: an existing worker
still created a waiter, and a popup rejection left the waiter unattached. After
the repair all five pass, including popup-first and waiter-first dual rejection
orders with zero `unhandledRejection` after simulated teardown.

Independent plan review and final code review both returned `APPROVE`, with no
HIGH or MEDIUM findings. Privacy audit returned `PASS (0 findings)`. No
production extension source changed in the fixture repair.

## Gate evidence

One post-repair standalone extension E2E run exited `0`:

* extension E2E: `53 passed / 1 known harness skip`;
* both modified NowCoder Task 5 and Task 6 flows passed;
* no `context closed` failure recurred.

The pre-candidate `npm run quality:gate` exited `0`:

* root unit: `2392 passed / 1 Windows file-symlink capability skip`;
* app E2E: `25/25`;
* extension unit: `1587/1587`;
* extension E2E: `53 passed / 1 known harness skip`;
* production build: `20/20` static pages generated;
* lint, migration, curriculum validation, typecheck, extension build/parity,
  and privacy checks passed.

The authoritative exact command was:

```powershell
$env:GIT_MASTER='1'; node scripts/validate-v4-candidate.mjs --candidate a911425a415db2ee374430ced62edcaa7b786866
```

It exited `0` with `V4 candidate commit PASS`:

* root unit: `2393 passed / 1 Windows file-symlink capability skip`;
* app E2E: `25/25`;
* extension unit: `1587/1587`;
* extension E2E: `53 passed / 1 known harness skip`;
* production build: `20/20`;
* privacy: `0 findings`;
* readiness: `PASS`;
* candidate HEAD, single parent, clean worktree, explicit path ownership, and
  post-gate identity: `PASS`.

The one skipped unit capability remains the documented Windows file-symlink
EPERM case. The one extension E2E skip remains the known service-worker
restart harness limitation. Neither was converted into a pass.

## Default database preservation

Before and after the standalone extension E2E, full quality gate, exact
candidate validator, and hash copy, the default database metadata remained:

* length: `479232` bytes;
* last write time UTC: `2026-07-23T15:56:38.8411343Z`.

No default-database hash was read and no default-database write was made.

## Exact production dist

The exact validator output was copied without rebuild to:

`.tmp/task22-exact-dist-a911425`

The directory contains 10 generated files. Source and copied SHA-256 values
match for every frozen target:

| File | SHA-256 |
| --- | --- |
| `manifest.json` | `A85C3275D559BD46AAA034FEEA9B14EAFECFC6F56341713B2AFB8B024E2B3E64` |
| `background.js` | `8574AE767AF854448CBE14B1EF569E6BBFE443A23B5DB7E88645F524461A74B2` |
| `content.js` | `9DC010902D97620D8E9FAB45B9B1CA627E53122B4A8BA9CE35000E067B49DB69` |
| `popup.js` | `3D164737873BB36A522300FC4B92829C419A3EAEC4CACDC0CF111A91497CF478` |
| `main-world-bridge.js` | `4D89A80F0351295EE1C0CD173BE107080983868D18510D028854695EACEE3943` |

## Boundary and next gate

D3 is complete for this candidate. D4 has not started. No real platform was
opened or submitted during this refreeze, no extension was loaded from the new
dist, and no isolated observation database was created yet.

The next gate is one fresh exact-dist D4 wave on this same SHA:

1. LeetCode same-problem/same-verdict regression;
2. NowCoder exact approved pilot `acm/contest/18839/1001`;
3. blocked-platform readiness/drift checks without submissions.

Both active platforms must independently prove exactly one E2, E3, bundle,
POST, ACK, four events, one session, one attempt, and zero residual waiting,
outbox, or quarantine. Any source, validator, or generated-dist rebuild
invalidates this receipt and requires another D3 freeze.
