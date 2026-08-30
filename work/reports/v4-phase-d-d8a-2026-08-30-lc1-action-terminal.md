# V4 Phase D D8-A-2026-08-30-LC1 Terminal Action Report

Date: 2026-08-30

Branch: `feature/v1-followup`

HEAD: `e6b197bed7e9f40bcb2897fcdfb3e109fa05c701`

Product candidate: `0c23fcacf18d2fe4113d803504e638c1aab887d3`

Verdict: **single action runner consumed; ENVIRONMENT_BLOCKED at
connection_preflight; zero click/submission; no NowCoder; no retry**

## Authorization and terminal boundary

The user explicitly resumed the previously authorized
`D8-A-2026-08-30-LC1`. Its scope remained:

- current remote-debug Chrome `yu` only;
- LeetCode `merge-two-sorted-lists` only;
- immutable candidate `0c23fcacf18d2fe4113d803504e638c1aab887d3`;
- at most one submission;
- unconditional stop after any outcome; and
- no NowCoder, retry, D4 aggregation, RC, release, push or PR.

Per the frozen contract, starting the action runner consumed the opportunity,
even if the runner failed before clicking.

## Q1 evidence

The six active task documents were temporarily stored in exact named stash
`c194b6f2eb7165c13570560c197306c85aad7fd7`, producing a clean worktree. The
stash was restored unchanged and dropped after the stop.

Static Q1 passed:

- candidate commit and HEAD ancestry;
- observation-tool SHA-256
  `CE6D4CFC0FAD5B99A1EAD342FA7EE77D4AB5690E9EFF2FC2261EF702F17363DD`;
- acceptance-profile SHA-256
  `64455AC1DE043D30C44395675D37654EED44F13B0ABF24C9FC01E31D1BEC61A9`;
- candidate receipt SHA-256
  `4EDA9DDD9FFB4311EDEA32B0D60DFEA34D54D07766E1490C02DB4B04582F9AEE`;
- all five frozen exact-dist hashes;
- bounded connection receipt SHA-256
  `54076AA16C16851B0B6C06467C18CF39D856A33B2B586821A773CF15A3F7412E`;
- exact receipt identities and bounded installation config;
- disposable database `0/0/0`;
- unchanged default database and R4 READY evidence; and
- no pre-existing real-observation success or failure evidence.

The exact proxy handed off CDP. An independent read-only Q1 probe returned all
true for official Chrome, protocol 1.3, single context, frozen `yu` profile,
exact extension binding and original Chrome preservation. It created only an
owned `chrome://version` page and no OJ page.

## Single runner result

The existing runner was launched exactly once with:

- authorization
  `leetcode:merge-two-sorted-lists:0c23fcacf18d2fe4113d803504e638c1aab887d3`;
- `--execute-authorized-action=true`; and
- the frozen candidate, profile, tool, receipt, artifact, database and CDP
  inputs.

It exited 1 after about 5.2 seconds. The only terminal marker it emitted was the
failure-evidence path. It did **not** emit:

```text
OBSERVER_ARMED=1
BROWSE_ONLY=1
READY=1
ACTION_AUTHORIZED=1
AUTHORIZED_ACTION_EXECUTED=1
```

The schema 3 evidence records:

```text
outcome=not_delivered
finalStage=observer_capture_error
stageHistory=[]
failure.verdict=ENVIRONMENT_BLOCKED
failure.causalGrade=UNRESOLVED
failure.reason=observer_unexpected_failure
failure.phase=connection_preflight
privacyBoundary.noRawData=true
```

Evidence file:

`output/playwright/v4-observation/0c23fcacf18d-leetcode-r4-ready-yu-leetcode-0c23fca-real-observation-failed.json`

SHA-256:

`344AFC12EF6374E60A4D638A2DF2EE5EE6ADD1FD2C77BE914089B69F2E7539D6`

The failure occurred before observer arm and before the runner creates the
platform page. Localhost logs contain only `/` and `/api/capture/status`
warm-up. Combined with the absent execution marker, absent success evidence
and unchanged `0/0/0` database, this proves no submit click or real submission
occurred. NowCoder was never run.

The bounded evidence does not distinguish which capture-READY subcondition or
receipt comparison caused the preflight failure. The authoritative causal
grade remains `UNRESOLVED`; no post-stop browser diagnostic was run.

## Unconditional closure

- localhost was stopped and port 3000 freed;
- `.tmp/server-db-path.txt` was removed;
- no observation runner process remains;
- Chrome PID `45404` and port 9222 survived;
- the web-access proxy returned to READY;
- disposable database remains exactly `0/0/0`;
- candidate and connection receipts are unchanged;
- R4 READY evidence remains unchanged at SHA-256
  `4ABB251B3656F75C3CFB83BA165BF980D430065F92B78780F092B73A459E84CC`;
- default database remains 479232 bytes, mtime UTC
  `2026-07-23T15:56:38.8411343Z`, SHA-256
  `2485DBEA8E9C9CF2F073BC6C9BA4AA0A5261DC3744DDA7592A2890BC554666C3`;
  and
- no second action or retry was attempted.

`D8-A-2026-08-30-LC1` is terminally consumed. The only safe next decision is a
separately authorized, non-action connection-preflight root-cause diagnostic.
No new real submission should be authorized before that diagnostic is
adjudicated.

## Offline verification

The post-stop gates passed:

- V4 D4 acceptance profiles;
- V4 adapter readiness;
- V4 plan authority;
- `tests/unit/v4PlanAuthorityValidator.test.ts` at `3/3`; and
- `git diff --check`.

No product source, runner, extension artifact, frozen candidate or dependency
was changed.
