# V4 Phase D R4 CDP Lifecycle Repair Report

Date: 2026-08-29

Branch: `feature/v1-followup`

Implementation commit: `f3c710c`

Product candidate: `0c23fcacf18d2fe4113d803504e638c1aab887d3`

Verdict: **PASS for the authorized localhost-only lifecycle repair; no R4
READY or real action was authorized or run**

## Authorization and boundary

The user authorized only the minimum R4 lifecycle revision:

- replace Playwright's private CDP client close with its public close path;
- add a regression preventing the private path from returning;
- prove the runner exits while the original `yu` Chrome remains alive;
- perform offline validation and necessary local commits.

No OJ READY invocation, submit click, real submission, NowCoder run, push or PR
was authorized.

## RED and implementation

The focused RED changed only the lifecycle contract test. It produced exactly:

```text
1 failed / 54 passed
```

The sole failure required `await browser.close()` and rejected
`browser._connection.close()` in the CDP cleanup branch.

The implementation changed only that cleanup branch. It still closes only
runner-owned pages, detaches the browser-level CDP session, then awaits
Playwright's public `browser.close()` path. It does not call
`context.close()`, terminate a Chrome process, add a dependency or introduce a
browser manager/retry abstraction.

The source regression slices the exact cleanup branch after
`chromium.connectOverCDP` and requires:

- `await browser.close()`;
- no private `_connection.close()`;
- no `context.close()`.

Focused GREEN passed `55/55`.

## Offline gates

All authorized gates passed:

- runner syntax: PASS;
- targeted ESLint: PASS;
- TypeScript: PASS;
- focused observation suite: `55/55`;
- extension privacy audit: `0 findings`;
- D4 acceptance profile validator: PASS;
- adapter readiness validator: PASS;
- diff check: PASS.

## Live localhost-only lifecycle regression

A fresh local-only identity was used:

- profile ID: `r4-lifecycle-yu-0c23fca`;
- disposable database:
  `.tmp/v4-live-observation-db/r4-lifecycle-yu-0c23fca/training-platform.sqlite`;
- connection receipt:
  `.tmp/v4-ready-connection-receipts/r4-lifecycle-yu-0c23fca.json`;
- connection receipt SHA-256:
  `FCF972CFE6CDBCAD6705477D066488A6A6E56DBA623ACC37B9B874E4892B1364`.

The exact web-access proxy handed off the debugging channel. The observation
runner was invoked only with `--prepare-connection=true`; it opened only the
local app, extension popup and runner-owned `chrome://version` page. It never
navigated to an OJ page.

The command printed:

```text
CONNECTION_PREPARED=1
```

and exited normally after approximately 41 seconds. Immediately after exit:

- Chrome PID before, at handoff and after was exactly `37492`;
- port 9222 still listened under PID `37492`;
- no observation-runner Node process remained;
- the disposable database remained exactly `0/0/0`;
- no OJ evidence file existed;
- the web-access proxy was restored;
- the local service was stopped, port 3000 freed and the root DB pointer
  removed.

The default database remained 479232 bytes, mtime UTC
`2026-07-23T15:56:38.8411343Z`, SHA-256
`2485DBEA8E9C9CF2F073BC6C9BA4AA0A5261DC3744DDA7592A2890BC554666C3`.

## Frozen identities

- new observation-tool SHA-256:
  `CE6D4CFC0FAD5B99A1EAD342FA7EE77D4AB5690E9EFF2FC2261EF702F17363DD`;
- unchanged acceptance-profile SHA-256:
  `64455AC1DE043D30C44395675D37654EED44F13B0ABF24C9FC01E31D1BEC61A9`;
- unchanged candidate receipt SHA-256:
  `4EDA9DDD9FFB4311EDEA32B0D60DFEA34D54D07766E1490C02DB4B04582F9AEE`;
- unchanged `yu` profile-path SHA-256:
  `C1CF71DEEA82DD059F08A27CEA2190CF26D040108C757527AB55870B46135242`.

The immutable product candidate and all five exact-dist artifacts are
unchanged.

## Stop gate and next decision

The authorized lifecycle repair is complete and stopped. It does not revive or
extend either consumed D8-A authorization, does not make R4 READY pass, and does
not deliver D4.

The next separately gated action is one `yu` Chrome R4 READY-only observation
for LeetCode `merge-two-sorted-lists`, with no action authorization, click or
submission. A real D8-A action must remain a later, separate user decision after
that READY-only result.

## Later READY-only result

The user later authorized exactly that `yu` Chrome LeetCode READY-only run. It
passed with `ACTION_AUTHORIZED=0`, DB `0/0/0` and no click/submission. This
report remains authoritative for the lifecycle repair; the READY evidence is
recorded in
`work/reports/v4-phase-d-r4-yu-leetcode-ready-only-2026-08-29.md`.
