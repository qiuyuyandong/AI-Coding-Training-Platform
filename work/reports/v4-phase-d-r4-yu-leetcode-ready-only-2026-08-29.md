# V4 Phase D R4 yu Chrome LeetCode READY-only Report

Date: 2026-08-29

Branch: `feature/v1-followup`

Product candidate: `0c23fcacf18d2fe4113d803504e638c1aab887d3`

Verdict: **R4 READY-only PASS; ACTION_AUTHORIZED=0; no click or submission**

## Authorization and stop boundary

The user authorized exactly one READY-only observation in the current
remote-debugged Chrome profile identified as `yu`, for LeetCode
`merge-two-sorted-lists` on candidate `0c23fca`.

The authorization explicitly required:

- `ACTION_AUTHORIZED=0`;
- no click or submission;
- no NowCoder run; and
- an immediate stop after the READY-only result.

No action authorization or execution flag was supplied to the runner.

## Frozen inputs

- observation-tool SHA-256:
  `CE6D4CFC0FAD5B99A1EAD342FA7EE77D4AB5690E9EFF2FC2261EF702F17363DD`;
- acceptance-profile SHA-256:
  `64455AC1DE043D30C44395675D37654EED44F13B0ABF24C9FC01E31D1BEC61A9`;
- candidate receipt SHA-256:
  `4EDA9DDD9FFB4311EDEA32B0D60DFEA34D54D07766E1490C02DB4B04582F9AEE`;
- `yu` profile-path SHA-256:
  `C1CF71DEEA82DD059F08A27CEA2190CF26D040108C757527AB55870B46135242`;
- exact extension ID: `oldmkbngfokmhlkjmlichccmbebipmei`.

The immutable product candidate and all five exact-dist artifact hashes matched
their frozen values before execution. The worktree was clean, port 3000 was
free, the root DB pointer was absent and the default database matched its
frozen metadata and hash.

## Fresh observation identity

- profile ID: `r4-ready-yu-leetcode-0c23fca`;
- disposable database:
  `.tmp/v4-live-observation-db/r4-ready-yu-leetcode-0c23fca/training-platform.sqlite`;
- connection receipt:
  `.tmp/v4-ready-connection-receipts/r4-ready-yu-leetcode-0c23fca.json`;
- connection receipt SHA-256:
  `C95CD887EC0DA69B86584C002C2A57BFF8C4895465C9C7D777F91D423644CBDA`.

The database migrated at exactly `0/0/0`. The exact proxy process handed off
the CDP channel while official Chrome PID `37492` remained alive. The
localhost-only preparation completed and its runner exited normally after
printing `CONNECTION_PREPARED=1`.

## READY-only result

The single authorized invocation printed exactly the required terminal
markers:

```text
OBSERVER_ARMED=1
BROWSE_ONLY=1
READY=1
ACTION_AUTHORIZED=0
```

It did not print `ACTION_AUTHORIZED=1` or `AUTHORIZED_ACTION_EXECUTED=1`.
The runner exited normally and closed only its owned page.

Evidence file:

`output/playwright/v4-observation/0c23fcacf18d-leetcode-r4-ready-yu-leetcode-0c23fca-ready.json`

Evidence SHA-256:

`4ABB251B3656F75C3CFB83BA165BF980D430065F92B78780F092B73A459E84CC`

The bounded schema 3 evidence records:

- `outcome=ready_only`;
- `finalStage=browse_only`;
- baseline database `0/0/0`;
- final database `0/0/0`;
- no confirmed submission, stable result lifecycle, E2, E3, ACK, waiting,
  outbox or quarantine;
- no DOM, cookie, source-code, problem-statement, response-body, header or URL
  query retention.

The second browse-only projection contains `facts.authorizedActions=1`. In this
schema that field is exactly `target.e0`: the approved visibility-seeded E0
readiness hint for the exact control. It is not the runner action-authorization
flag and did not cause a click. The authoritative execution marker remained
`ACTION_AUTHORIZED=0`; submit/status corroboration and every database delta
remained zero.

## Environment closure

- Chrome PID after READY remained `37492` and port 9222 stayed live;
- no observation-runner process remained;
- web-access proxy was restored;
- disposable database remained exactly `0/0/0`;
- localhost service was stopped and port 3000 freed;
- root `.tmp/server-db-path.txt` was removed;
- NowCoder was not opened;
- no submit click or real submission occurred.

The default database remained 479232 bytes, mtime UTC
`2026-07-23T15:56:38.8411343Z`, SHA-256
`2485DBEA8E9C9CF2F073BC6C9BA4AA0A5261DC3744DDA7592A2890BC554666C3`.

## Stop gate and next decision

R4 READY-only is complete and stopped. This result proves only that the frozen
candidate, exact extension, `yu` profile, local Route H connection and observer
can reach the pre-action READY boundary. It does not prove real-action
causality, delivery or D4.

Any real LeetCode action requires a new, separately named D8-A authorization.
It must still permit at most one submission, stop regardless of outcome and
explicitly prohibit NowCoder unless the user changes that scope.
