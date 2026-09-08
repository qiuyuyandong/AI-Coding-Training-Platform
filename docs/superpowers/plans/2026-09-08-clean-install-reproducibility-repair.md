# Clean Install Reproducibility Repair Plan

Status: complete
Date: 2026-09-08
Branch: `codex/offline-theoretical-v1`

## Objective

Repair the single confirmed offline blocker at checkpoint
`30962ecc434d8f0eb999cf66807562fbff392595`: a fresh Node 22 / npm 10
checkout cannot run `npm ci` because its committed lockfile omits required
`@emnapi` dependency records. Keep the product, frozen extension, default
database, dependency policy, and all real-environment lanes unchanged.

## Pre-repair reproduction

A detached clean worktree with no `node_modules`, Node `22.23.0`, and npm
`10.9.8` reproduced `npm ci` exit code 1. npm reported that
`@emnapi/runtime@1.11.3` and `@emnapi/core@1.11.3` were missing from the
lockfile. This matches the failed Windows GitHub Actions installation step.

## Implementation

1. Trace the declared dependency graph and compare the committed lockfile with
   a Node 22 / npm 10 `npm install --package-lock-only` result.
2. Apply only the smallest lockfile correction that restores a complete,
   deterministic graph. Do not change `package.json`, upgrade packages, run
   `npm audit fix`, or edit production code unless the evidence proves a
   lockfile-only repair is insufficient.
3. From clean dependency state, run `npm ci` twice, removing `node_modules`
   between runs. Add an exact committed-state clean worktree/clone check.
4. Run the canonical ten-stage `npm run quality:gate` using the clean install.
5. Recheck the default database fingerprint and zero product diff for the
   frozen extension candidate `ee0e1f5a2332fdeaf743e6fcfcadb0d799f869f0`.
6. Commit the implementation boundary as
   `fix(ci): restore reproducible clean install`, push only the target branch,
   and wait for the matching GitHub Actions Quality Gate to complete.
7. Only after remote success, update the handoff and independent repair report,
   commit those records separately, push them, and verify the resulting branch
   HEAD remotely as well.

## Acceptance gates

- Fresh Node 22 / npm 10 `npm ci` succeeds twice from no `node_modules`.
- An exact committed-state clean checkout installs successfully.
- All ten canonical local quality-gate stages exit successfully.
- GitHub Actions passes Checkout, Setup Node, Install dependencies, Install
  Chromium, and Run quality gate for the pushed checkpoint.
- `training-platform.sqlite` remains size `479232`, UTC mtime
  `2026-07-23T15:56:38.8411343Z`, and SHA-256
  `2485DBEA8E9C9CF2F073BC6C9BA4AA0A5261DC3744DDA7592A2890BC554666C3`.
- `extension/src`, `extension/manifest.json`, and `extension/identity.json`
  have zero diff from the frozen product candidate.
- No real browser, OJ, AI provider, compiler workspace, stopped-process Windows
  restore, pilot, PR, merge, release, or deployment is used.

The strongest permitted outcome is `theoretical-ready candidate`; otherwise
the result remains `NOT READY` with the exact failed gate recorded.

## Fresh-gate findings

The first clean gate exposed three pre-existing test-harness assumptions after
the lockfile repair allowed it to start:

- Vitest cannot fresh-transform five directly imported `.mjs` modules while
  they retain CLI hashbangs. All documented invocations already use
  `node scripts/...`; removing those five hashbangs changes no validator logic.
- The exact-dist privacy test assumed an ignored `extension/dist` from an older
  local build. The test must build the artifact it audits before asserting it.
- The isolated Chromium relay test killed its controlled browser but removed
  its profile before Windows reported process exit. Teardown must await exit
  and tolerate the short final file-unlock window.

These are clean-runner test reproducibility repairs only. They do not change
the relay implementation, extension product files, or any application feature.

The first pushed checkpoint then passed Checkout, Node setup, dependency
installation, and Chromium installation in GitHub Actions, proving the original
lockfile blocker closed. Its root Vitest stage exposed two additional
Windows-runner assumptions before the rest of the gate could execute:

- Local Vault safety compared the spelling returned by `resolve` with the
  spelling returned by `realpath`. A real directory expressed through the
  Windows `\\?\` namespace was therefore mistaken for a junction. The repair
  inspects every path ancestor with `lstat` instead: equivalent real paths are
  accepted, while actual symlinks and junctions at the target or any ancestor
  remain rejected.
- Hosted Windows filesystem work made ordinary tests exceed Vitest's five-second
  default and full migration-prefix tests exceed their explicit 15-second
  limits. The root default is raised to 30 seconds, the three exhaustive prefix
  cases to five minutes, and the enclosing Windows workflow to 75 minutes.
  Assertions, application behavior, and the canonical ten stages are unchanged.

The next exact remote run passed clean install and executed all 129 root test
files. Its only failure was an older test asserting that a returned config path
must preserve the runner's `RUNNER~1` short-name spelling. Local Vault has always
returned canonical paths. The assertion now compares against `realpath`, and the
namespace regression also covers canonical config-pointer output; no product
logic changed for this final runner-only correction.

## Completion evidence

- Final implementation/test checkpoint:
  `990862e4f08a3c9af3b2adc2305a57a7a44cc657`.
- Independent local clean checkout: no `node_modules`, Node `22.23.0`, npm
  `10.9.8`, `npm ci` exit `0`, canonical ten-stage gate exit `0`.
- Local gate: root `2709/1`, App E2E `25/25`, fresh acceptance `1/1`, extension
  unit `1671/1671`, extension E2E `55/1`, production build `28/28`.
- GitHub Actions Quality Gate run
  [`34220508035`](https://github.com/qiuyuyandong/AI-Coding-Training-Platform/actions/runs/34220508035)
  on exact checkpoint `990862e4f08a3c9af3b2adc2305a57a7a44cc657`:
  Checkout, Node `22.23.2`/npm `10.9.8`, `npm ci`, Chromium installation, and
  the complete canonical gate all concluded `success`; root was `2710/2710`.
- Default database fingerprint and frozen extension product diff remained
  unchanged. No real-environment lane ran.

The resulting state is a `theoretical-ready candidate` for independent review,
not `runtime-validated` or `release-ready`.
