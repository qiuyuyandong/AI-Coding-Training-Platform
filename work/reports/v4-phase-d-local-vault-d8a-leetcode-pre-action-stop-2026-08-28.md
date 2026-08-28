# V4 Phase D Local Vault Route H D8-A Pre-action Stop Report

Date: 2026-08-28

Branch: `feature/v1-followup`

Candidate: `0c23fcacf18d2fe4113d803504e638c1aab887d3`

Verdict: STOPPED BEFORE ACTION (`ENVIRONMENT_BLOCKED / UNRESOLVED`)

## Authorization and stop boundary

The user authorized only one action observation for LeetCode
`merge-two-sorted-lists` on the exact candidate above, with permission for at
most one real submission. The authorization required an unconditional stop
after this invocation and explicitly prohibited running NowCoder.

The invocation stopped without reaching action authorization. It was not
retried, and NowCoder was not started.

## Frozen inputs

- exact dist: `.tmp/v4-route-h-exact-dist-0c23fca`;
- candidate receipt: `.tmp/v4-route-h-candidate-receipt-0c23fca.json`;
- candidate receipt SHA-256:
  `4EDA9DDD9FFB4311EDEA32B0D60DFEA34D54D07766E1490C02DB4B04582F9AEE`;
- observation-tool SHA-256:
  `309B3772EF23D28699841F66648FEC107E5D62CE8694F083AF5E157157A22C35`;
- acceptance-profile SHA-256:
  `D8C348F13AE302166D0DDF4514FC5108CAAE39CBFA2D056A298A4CE4A6693225`;
- prepared profile ID: `d7-route-h-leetcode-ready-0c23fca`;
- target: `https://leetcode.cn/problems/merge-two-sorted-lists/`;
- disposable database:
  `.tmp/v4-live-observation-db/d7-route-h-leetcode-ready-0c23fca/training-platform.sqlite`;
- bounded connection receipt:
  `.tmp/v4-ready-connection-receipts/d7-route-h-leetcode-ready-0c23fca.json`.

The evidence confirms identical pre-action and final candidate, tool, profile,
candidate-receipt and five exact-dist artifact hashes.

## Observed outcome

The runner exited non-zero after approximately 28.6 seconds. It emitted none of
the action prerequisites:

```text
OBSERVER_ARMED=1      not reached
BROWSE_ONLY=1         not reached
READY=1               not reached
ACTION_AUTHORIZED=1   not reached
```

No user action prompt was presented. No submit-control click and no real
submission occurred. The browser closed automatically.

The bounded schema 3 evidence records:

- `outcome`: `not_delivered`;
- `stageHistory`: empty;
- `finalStage`: `observer_capture_error`;
- `failure.verdict`: `ENVIRONMENT_BLOCKED`;
- `failure.causalGrade`: `UNRESOLVED`;
- `failure.reason`: `observer_unexpected_failure`;
- `privacyBoundary.noRawData`: `true`.

Evidence file:

`output/playwright/v4-observation/0c23fcacf18d-leetcode-d7-route-h-leetcode-ready-0c23fca-real-observation-failed.json`

Evidence SHA-256:

`A57D562042A3F1DFBCCF07F28787AE4BC3E4A3D19FE74B1C9D3FB907914A7F84`

## Database and environment closure

The LeetCode disposable database remained exactly:

```text
capture_events=0
training_sessions=0
training_attempts=0
```

The local service was stopped, `.tmp/server-db-path.txt` was removed and port
3000 was free after the invocation. The default database remained `479232`
bytes with mtime `2026-07-23T15:56:38.8411343Z` and SHA-256
`2485DBEA8E9C9CF2F073BC6C9BA4AA0A5261DC3744DDA7592A2890BC554666C3`.

The NowCoder D7 profile, database and evidence were not invoked by D8-A.

## Diagnostic boundary

The local server log showed the first `/api/capture/status` request compiling
for approximately 24.6 seconds before the runner exited. This makes cold-start
status-probe latency a plausible contributor, but it is only an inference. The
authoritative root-cause classification remains `UNRESOLVED`; this run does not
prove a product, observer or server defect.

## Final gate

D8-A is consumed and stopped. It does not deliver D4 and does not authorize a
retry, NowCoder, RC, release, push or PR. The next admissible work is offline or
read-only diagnosis followed by a reviewed plan amendment. Any new real action
requires a separate explicit authorization.
