# V4 Phase D Local Vault Route H D7 READY-only Report

Date: 2026-08-26

Branch: `feature/v1-followup`

Candidate: `0c23fcacf18d2fe4113d803504e638c1aab887d3`

Verdict: PASS

## Authorization and stop boundary

The user explicitly authorized D7 only. The authorized order was LeetCode
first, stop on its first failure, and run NowCoder only after LeetCode passed.
Neither lane received `--authorize-action`; clicks, submissions, real actions,
D4 delivery adjudication, RC, release, push and PR were outside scope.

## Frozen inputs

- exact dist: `.tmp/v4-route-h-exact-dist-0c23fca`;
- candidate receipt: `.tmp/v4-route-h-candidate-receipt-0c23fca.json`;
- candidate receipt SHA-256:
  `4EDA9DDD9FFB4311EDEA32B0D60DFEA34D54D07766E1490C02DB4B04582F9AEE`;
- observation-tool SHA-256:
  `309B3772EF23D28699841F66648FEC107E5D62CE8694F083AF5E157157A22C35`;
- acceptance-profile SHA-256:
  `D8C348F13AE302166D0DDF4514FC5108CAAE39CBFA2D056A298A4CE4A6693225`;
- extension ID: `oldmkbngfokmhlkjmlichccmbebipmei`.

Candidate, receipt, all five exact-dist hashes, tool/profile hashes, clean
worktree, absent root DB pointer and free localhost:3000 were verified before
the first lane.

## LeetCode lane

- profile ID: `d7-route-h-leetcode-ready-0c23fca`;
- target: `https://leetcode.cn/problems/merge-two-sorted-lists/`;
- database:
  `.tmp/v4-live-observation-db/d7-route-h-leetcode-ready-0c23fca/training-platform.sqlite`;
- connection receipt:
  `.tmp/v4-ready-connection-receipts/d7-route-h-leetcode-ready-0c23fca.json`;
- connection receipt SHA-256:
  `031D87A20E6B54EB22230B79B3112C7CCCDD95ECC32793DCBE56FFA5D7892E55`.

Preparation created one fresh profile, opened localhost settings only, completed
one Route H connection click, validated the exact extension/candidate identities
and closed with database `0/0/0`. The preparation receipt passed the strict
closed-schema validator and contains no raw capability.

The later real-site invocation exited `0` with:

```text
OBSERVER_ARMED=1
BROWSE_ONLY=1
READY=1
ACTION_AUTHORIZED=0
```

READY evidence:

`output/playwright/v4-observation/0c23fcacf18d-leetcode-d7-route-h-leetcode-ready-0c23fca-ready.json`

Evidence SHA-256:

`F1396D21859569EB952F410546D16D4A3D57904431FD84E09D211B1F6C1F0601`

The evidence is schema 3, outcome `ready_only`, final stage `browse_only`, with
baseline and final database `0/0/0`.

## NowCoder lane

NowCoder was prepared only after the LeetCode PASS.

- profile ID: `d7-route-h-nowcoder-ready-0c23fca`;
- target: `https://ac.nowcoder.com/acm/contest/18839/1001`;
- database:
  `.tmp/v4-live-observation-db/d7-route-h-nowcoder-ready-0c23fca/training-platform.sqlite`;
- connection receipt:
  `.tmp/v4-ready-connection-receipts/d7-route-h-nowcoder-ready-0c23fca.json`;
- connection receipt SHA-256:
  `42882E744075B13225CF4A3B9680092A8F53648E3D721E38A6B699D817C75F55`.

Its localhost-only preparation passed the same closed connection contract and
database `0/0/0`. The real-site invocation exited `0` with:

```text
OBSERVER_ARMED=1
BROWSE_ONLY=1
READY=1
ACTION_AUTHORIZED=0
```

READY evidence:

`output/playwright/v4-observation/0c23fcacf18d-nowcoder-d7-route-h-nowcoder-ready-0c23fca-ready.json`

Evidence SHA-256:

`74A626BB5C7F0E7F04A1D782521E2F8BAFD829583664988A9CB7AE79C764A7C0`

The evidence is schema 3, outcome `ready_only`, final stage `browse_only`, with
baseline and final database `0/0/0`.

## Privacy and database result

Both evidence payloads explicitly report:

- `platformDomRead: false`;
- `cookiesRead: false`;
- `sourceCodeRead: false`;
- `problemStatementRead: false`;
- `responseBodyRead: false`;
- `headersRead: false`;
- `queryRetained: false`.

Both lane databases ended at exactly zero capture events, zero training sessions
and zero training attempts. No submit control was clicked and no submission was
made. The temporary root `.tmp/server-db-path.txt` was removed after each lane,
both local servers were stopped, and localhost:3000 is free.

The default `training-platform.sqlite` remains:

- size: `479232` bytes;
- mtime UTC: `2026-07-23T15:56:38.8411343Z`;
- SHA-256:
  `2485DBEA8E9C9CF2F073BC6C9BA4AA0A5261DC3744DDA7592A2890BC554666C3`.

## Stop gate

D7 is complete and stopped. READY-only does not prove real action causality or
exactly-once delivery and therefore does not deliver D4. D8, any real click or
submission, D4 delivery adjudication, RC, release, push and PR require a new,
separately named authorization.
