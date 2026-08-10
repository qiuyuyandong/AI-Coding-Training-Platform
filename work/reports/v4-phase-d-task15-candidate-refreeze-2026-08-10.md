# V4 Phase D Task 15 candidate re-freeze closeout

Date: 2026-08-10

Branch: `feature/v1-followup`

Immutable candidate: `f18eddf4cb4d7dd24c439b2dea5917793839e6a2`

Verdict: **TASK 15 ENGINEERING COMPLETE / CANDIDATE VALIDATOR PASS**

This is candidate engineering evidence only. It is not a D4 real-platform
delivery observation, D5 approval, RC, user acceptance, or release.

## Candidate chronology

- Failed freeze: `0c263ccf2459b2dda7897ad899e0c3fd439876ec`.
  Its exact validator exited `1` because root Vitest recursively discovered
  two ignored historical worktrees and nested third-party tests. This SHA is
  invalid and none of its dist hashes are evidence.
- Repair RED: 13 tests passed / 2 failed, proving the missing root worktree
  exclusion and missing D3 path classification.
- Repair GREEN: 15/15, typecheck, targeted ESLint, and diff-check passed.
- Focused code/privacy/plan re-review: three `APPROVE`, no findings. The two
  historical worktrees and their pre-existing dirty reports were preserved;
  they were not reset, removed, or modified.
- Successful immutable candidate:
  `f18eddf4cb4d7dd24c439b2dea5917793839e6a2`.

## Authoritative validation

```powershell
node scripts/validate-v4-candidate.mjs --candidate f18eddf4cb4d7dd24c439b2dea5917793839e6a2
```

Result: exit `0`, `V4 candidate commit PASS`.

- lint: PASS;
- migrations on the quality-gate disposable database: PASS;
- curriculum validation: PASS, 12 nodes / 13 edges / 12 resources / 12
  practice mappings / 9 careers;
- root unit tests: 104 files, 2353 passed / 1 Windows file-symlink capability
  skip;
- TypeScript typecheck: PASS;
- app E2E: 25/25 passed;
- extension unit: 47 files, 1549/1549 passed;
- extension production build and parity: PASS;
- exact-dist extension E2E: 53 passed / 1 known service-worker harness skip;
- production Next.js build: 20/20 routes generated;
- privacy audit: 0 findings;
- adapter readiness: PASS;
- candidate exact HEAD and clean worktree: preserved before and after gate;
- default database: 479232 bytes, mtime
  `2026-07-23T15:56:38.8411343Z`, unchanged;
- port 3000 listeners after gate: 0.

## Exact production-dist hashes

| Artifact | Bytes | SHA-256 |
| --- | ---: | --- |
| `manifest.json` | 2157 | `22B1FBEAC7FEAC799C159D5A5D295700F7FEF5A395C40F1A39168EA9E0293D08` |
| `background.js` | 505471 | `4575A8BC67F4775D78AC5756DDED77B70FC905E2AE6953B90C3E9896369DCE7B` |
| `content.js` | 244369 | `C68465D60D21F6B74A7A081ED6E053DC1FB968B93871A7EE3D7500ABD997CD3B` |
| `popup.js` | 224556 | `3D164737873BB36A522300FC4B92829C419A3EAEC4CACDC0CF111A91497CF478` |
| `main-world-bridge.js` | 162223 | `4D89A80F0351295EE1C0CD173BE107080983868D18510D028854695EACEE3943` |

## Boundary and next action

The ignored generated `extension/dist` is the exact Task 16 artifact. Before
the first platform action, Task 16 must prove candidate lineage, verify exactly
one active capture extension, and recheck all five hashes. Any runtime,
protocol, manifest, permission, build, migration, or dist change invalidates
the candidate and requires Task 15 re-freeze. Task 16 may execute only the
authorized LeetCode automated engineering observation; it must not read or
export credentials, cookies, tokens, editor code, request/response bodies, or
HAR data.
