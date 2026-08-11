# V4 Phase D Task 26 exact-submit candidate re-freeze

## Result

Revision 5 is frozen as immutable candidate
`aa1a572c3913b35dd3f0391f849dab66e79c56a2` on branch
`feature/v1-followup`. This is a D3 engineering candidate only. It is not D4
observation PASS, D5 approval, RC, acceptance, release, push, PR, or deploy.

Commit chronology:

- `f0c41bc` — bounded live-stage observer and safe failure receipt;
- `9e049ea` — exact LeetCode submit request identity and persistence-first
  control delivery;
- `aa1a572` — synthetic GraphQL E2E corrected to exercise exact submit A before
  GraphQL B, plus explicit candidate-path ownership.

The first validator attempt against `9e049ea` failed only the stale synthetic
GraphQL E2E (`52 passed / 1 failed / 1 skipped`) because it emitted GraphQL and
result without an exact submit. That SHA was not frozen. The corrected single
scenario passed `1/1` before the complete validator was rerun from the start.

## Authoritative validation

Command:

```text
node scripts/validate-v4-candidate.mjs --candidate aa1a572c3913b35dd3f0391f849dab66e79c56a2
```

Result: exit `0`, `V4 candidate commit PASS`.

- root unit: `2430 passed / 1 skipped`;
- app E2E: `25/25`;
- extension unit: `1591/1591`;
- extension E2E: `53 passed / 1 skipped`;
- production build: `20/20` static pages generated;
- privacy audit: `0 findings`;
- readiness: `PASS`;
- candidate identity/worktree: clean before and after the gate;
- default database: preserved at `479232` bytes and
  `2026-07-23T15:56:38.8411343Z`.

Independent final candidate reviews both returned `APPROVE` with no HIGH or
MEDIUM findings: one code/D3 review and one privacy/scope review. The reviewers
confirmed that `aa1a572` changes only the synthetic E2E and explicit candidate
ownership relative to `9e049ea`, makes no real platform request, and reads no
request body, cookie, token, account, code, or problem statement.

The only known skip remains the documented extension harness limitation, and
the Windows file-symlink capability case remains blocked by host `EPERM`.

## Exact frozen dist

Directory (ignored local artifact):
`.tmp/task26-exact-dist-aa1a572`.

```text
manifest.json        A85C3275D559BD46AAA034FEEA9B14EAFECFC6F56341713B2AFB8B024E2B3E64
background.js        9222BC90DB397B37499DE119482958BEAF1DD1A6E3136F7546A475676EC46C2D
content.js           8AC66A0B8B23AA2F5273D1687550226926A4D3791CBF1C1C3786B9D20FD785FC
popup.js             F863C9758EBF2FF464634D6FF986D3F296017C8A5A37D45A3692FB3F1B80240D
main-world-bridge.js  4D89A80F0351295EE1C0CD173BE107080983868D18510D028854695EACEE3943
```

The next gate is two fresh observations on this exact candidate/dist:
LeetCode first, then approved-pilot NowCoder. Each real submission still needs
fresh action-time user confirmation after the observer reports READY. No
platform submission was performed during re-freeze.
