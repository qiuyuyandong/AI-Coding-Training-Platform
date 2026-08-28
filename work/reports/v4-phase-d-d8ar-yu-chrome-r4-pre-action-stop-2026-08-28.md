# V4 Phase D D8-A-R yu Chrome R4 Pre-action Stop Report

Date: 2026-08-28

Branch: `feature/v1-followup`

Product candidate: `0c23fcacf18d2fe4113d803504e638c1aab887d3`

Verdict: **R4 FAIL CLOSED; R5 was not run; no real action occurred**

## Authorized boundary

The user authorized the D8-A-R root-cause revision and, only after every R4
gate passed, one LeetCode `merge-two-sorted-lists` action on the currently
remote-debugged Chrome profile identified by the user as `yu`. NowCoder,
retries and any second action were prohibited.

The approved plan requires an unconditional pre-action stop when the Chrome,
profile, exact extension, connection receipt, zero-database, READY or proxy
handoff lifecycle does not match the frozen contract.

## Frozen inputs

- product candidate:
  `0c23fcacf18d2fe4113d803504e638c1aab887d3`;
- exact dist: `.tmp/v4-route-h-exact-dist-0c23fca`;
- candidate receipt SHA-256:
  `4EDA9DDD9FFB4311EDEA32B0D60DFEA34D54D07766E1490C02DB4B04582F9AEE`;
- observation-tool SHA-256:
  `7C64947398D8C91D92D68BD95CC703750633AD3F908BA26365BD1891F6ECA80E`;
- acceptance-profile SHA-256:
  `64455AC1DE043D30C44395675D37654EED44F13B0ABF24C9FC01E31D1BEC61A9`;
- `yu` profile-path SHA-256:
  `C1CF71DEEA82DD059F08A27CEA2190CF26D040108C757527AB55870B46135242`;
- exact extension ID: `oldmkbngfokmhlkjmlichccmbebipmei`.

All frozen identities, the clean worktree, an absent root DB pointer, free port
3000 and the unchanged default database were checked before R4.

## R4 observation

A new disposable identity was created:

- profile ID: `d8ar-yu-leetcode-0c23fca`;
- database:
  `.tmp/v4-live-observation-db/d8ar-yu-leetcode-0c23fca/training-platform.sqlite`;
- bounded connection receipt:
  `.tmp/v4-ready-connection-receipts/d8ar-yu-leetcode-0c23fca.json`;
- connection receipt SHA-256:
  `7E3DFABFBA4DBC43FF020DAE79F455EED358C2B3CD4007FED073DA5C7FB0C410`.

The database migrated at `0/0/0`. The local app became ready, and the first
unauthenticated `/api/capture/status` warm-up returned the expected `401`.
The exact web-access proxy process handed off port 9222 while the official
Chrome process remained alive.

Preparation then successfully:

- attached to the frozen `yu` profile;
- loaded the exact candidate extension under the fixed ID;
- completed the one-time localhost Route H connection;
- validated the popup READY state and zero queues;
- wrote and self-validated the bounded receipt; and
- printed `CONNECTION_PREPARED=1`.

However, the preparation command remained live for more than 90 seconds after
that terminal marker and produced no further output. It therefore failed the
R4 requirement to release the exclusive debugging channel and return control
cleanly. The process was interrupted before any READY invocation or OJ
navigation. The proxy was then restored.

There is no R4 OJ evidence file because the READY-only invocation was not
started. None of the following markers was reached:

```text
OBSERVER_ARMED=1
BROWSE_ONLY=1
READY=1
ACTION_AUTHORIZED=1
AUTHORIZED_ACTION_EXECUTED=1
```

No LeetCode submit control was clicked, no submission occurred, and NowCoder
was not opened.

## Root-cause disposition

This failure has a code-level cause in the revised observation tool. Its CDP
cleanup detaches the browser session and calls Playwright's private
`browser._connection.close()`. The pinned local Playwright implementation of
`Connection.close()` only marks the client connection closed, rejects pending
callbacks and emits its local close event; it does not close the underlying
CDP WebSocket transport. That transport kept the Node event loop alive.

The same pinned Playwright source shows that the public `browser.close()` path
for `connectOverCDP` delegates to the CDP browser-process wrapper, whose close
operation is `chromeTransport.closeAndWait()`. A follow-up revision should use
that public path and prove both outcomes in one regression: the runner exits
and the original Chrome PID/CDP endpoint remains alive. This is a proposed
offline repair, not evidence that the repair has already passed.

Ponytail scope remains narrow: replace the incorrect private lifecycle call,
add one bounded lifecycle regression, and do not add a browser manager,
generic CDP layer, dependency or retry framework.

## Environment closure

- disposable database remained exactly `capture_events=0`,
  `training_sessions=0`, `training_attempts=0`;
- root `.tmp/server-db-path.txt` was removed;
- localhost service was stopped and port 3000 is free;
- the official Chrome process and CDP endpoint remain alive;
- the web-access proxy is restored;
- the exact extension remains installed in the authorized `yu` profile;
- default database remains 479232 bytes, mtime UTC
  `2026-07-23T15:56:38.8411343Z`, SHA-256
  `2485DBEA8E9C9CF2F073BC6C9BA4AA0A5261DC3744DDA7592A2890BC554666C3`.

Sentry remained `SENTRY_UNAVAILABLE_NO_LOCAL_AUTH`; no token was created, no
event was sent, and Sentry was not counted as a passing gate.

## Stop gate and next decision

R4 did not pass, so the newly granted D8-A action opportunity is consumed under
the approved fail-closed plan. R5 is unstarted and prohibited. D4 is not
delivered; RC, release, push and PR remain stopped.

The only reasonable next action is a separately approved offline R4 lifecycle
repair and new tool/profile hash freeze. Any subsequent R4/real-action attempt
requires a new explicit authorization; it must still use only `yu`, target only
LeetCode `merge-two-sorted-lists`, and prohibit NowCoder unless the user changes
that scope.
