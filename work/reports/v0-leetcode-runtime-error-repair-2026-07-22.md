# V0 LeetCode.cn Runtime Error Repair Evidence (2026-07-22)

> Superseded on 2026-07-23 by
> `work/reports/v0-cross-platform-verdict-repair-2026-07-23.md`. The later real
> TLE retest proved that this label-only diagnosis was incomplete.

## Decision

**ENGINEERING PASS / REAL RETEST PENDING.**
The user confirmed that repaired ACK delivery can synchronize real AC attempts,
then recorded in Owner Report 03 that the same LeetCode.cn problem remained in
`等待判题` when its final result was the exact Chinese label `执行出错`.

This report records an uncommitted repair-worktree validation. It does not
freeze a replacement RC, start the formal owner observation window, or claim
post-fix real-browser acceptance.

## Root Cause

The LeetCode adapter already restricted verdict reads to the observed
`[data-e2e-locator="submission-result"]` node, and the attempt-bundle protocol
already accepted canonical `Runtime Error`. The shared text parser recognized
English `Runtime Error`, `RE`, and Chinese `段错误`, but not the exact
user-observed LeetCode.cn label `执行出错`. The detector therefore returned
`null`, emitted no final candidate, and left the active submission intent
waiting.

## Repair

- Map `执行出错` to canonical `Runtime Error` only when the platform is
  `leetcode`.
- Keep detection inside the existing narrow LeetCode result selector; the same
  wording elsewhere in the page remains non-evidence.
- Do not extrapolate the new label to NowCoder or another adapter.
- Preserve the existing attempt semantics: two distinct submit clicks remain
  two attempts, and a newer active intent for the same problem supersedes the
  older active intent.
- Preserve the previously approved result classification: `Runtime Error`,
  `Time Limit Exceeded`, and `Memory Limit Exceeded` materialize as `partial`,
  while wrong-answer/compile verdicts materialize as `failed`. This repair
  fixes the missing record; changing that product taxonomy requires a separate
  decision because it affects Training, Coach, Growth, and ability evidence.

## Regression Evidence

The tests prove:

- the observed LeetCode.cn result node text `执行出错` becomes `Runtime Error`;
- the same text outside the registered result node returns `null`;
- a NowCoder result node containing that unverified wording still returns
  `null`;
- a LeetCode task-document submit intent followed by a new result document
  whose first frame says `执行出错` produces one verdict candidate, consumes
  the waiting intent, and builds one atomic bundle whose verdict is
  `Runtime Error`.

## Verification

Commands run against the current uncommitted worktree:

| Command | Result |
| --- | --- |
| `npx vitest run --config vitest.extension.config.ts tests/unit/extensionPlatforms.test.ts tests/unit/extensionBackgroundMessages.test.ts` | PASS: 2 files / 107 tests |
| `npm run extension:check` | PASS: typecheck, 18 files / 433 extension tests, MV3 build, dist parity and ignore check |
| `npm run quality:gate` | PASS, exit 0 |

The authoritative quality gate completed:

- lint: PASS with zero warnings;
- disposable database migration: PASS;
- curriculum validation: PASS, 12 nodes / 13 edges / 12 resources / 12
  practice mappings / 9 careers;
- unit tests: 67 files / 1006 passed / 1 Windows file-symlink capability skip;
- typecheck: PASS;
- Playwright: 25 passed; the local AtCoder request audit reported
  `external=[]`;
- extension check: 18 files / 433 passed, with MV3 build and dist parity PASS;
- production build: PASS, 20/20 static pages generated.

An earlier attempt stopped before E2E because the user's project development
server owned port 3000. The server was not terminated without coordination;
after the user stopped it, the authoritative rerun above completed cleanly.

## Git And Product Boundary

- Branch: `feature/v1-followup`.
- Baseline HEAD: `894162b264124eed7315a116cae73b8e11d717b8`.
- State: uncommitted dirty worktree; no replacement RC exists.
- Not performed: repaired-build Chrome reload, post-fix real `执行出错`
  submission, commit, push, formal V0 observation, F1-F4, user acceptance, or
  V0.5 work.
