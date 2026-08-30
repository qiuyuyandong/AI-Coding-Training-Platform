# V4 Phase D D8-A-2026-08-30-LC1 Q1 CDP Authorization Blocker

Date: 2026-08-30

Branch: `feature/v1-followup`

HEAD at preflight: `e6b197bed7e9f40bcb2897fcdfb3e109fa05c701`

Product candidate: `0c23fcacf18d2fe4113d803504e638c1aab887d3`

Verdict: **Q1 environment blocked before action runner; action authorization
not consumed; no LeetCode action and no NowCoder**

## Authorization boundary

The user continued the separately named action round
`D8-A-2026-08-30-LC1`: current `yu` Chrome, LeetCode
`merge-two-sorted-lists`, at most one real submission, unconditional stop after
any outcome and no NowCoder.

The action runner was allowed only after the static and exclusive-CDP Q1 gates
both passed. Starting the action runner would consume the opportunity; Q1
failure before runner start would not.

## Context and plugin checks

- The referenced Codex task was read and matched the repository's R4 READY-only
  history and current action gate.
- Sentry had no callable tool and the local environment exposed no read-only
  token, org or project. The result is
  `SENTRY_UNAVAILABLE_NO_LOCAL_AUTH`; no event was sent and Sentry was not used
  as a false gate.
- Ponytail selected the existing observation runner and existing connection
  contract. No code, dependency, browser manager, retry framework or alternate
  submission path was added.
- `npx` and Node.js were available. The web-access check initially reached
  Chrome 9222 and a ready proxy.

## Static Q1 PASS

The following frozen inputs matched before CDP handoff:

- observation-tool SHA-256:
  `CE6D4CFC0FAD5B99A1EAD342FA7EE77D4AB5690E9EFF2FC2261EF702F17363DD`;
- acceptance-profile SHA-256:
  `64455AC1DE043D30C44395675D37654EED44F13B0ABF24C9FC01E31D1BEC61A9`;
- candidate-receipt SHA-256:
  `4EDA9DDD9FFB4311EDEA32B0D60DFEA34D54D07766E1490C02DB4B04582F9AEE`;
- R4 connection-receipt SHA-256:
  `C95CD887EC0DA69B86584C002C2A57BFF8C4895465C9C7D777F91D423644CBDA`;
- all five exact-dist artifact hashes;
- candidate ancestry and fixed extension identity;
- R4 disposable database `0/0/0`;
- default database size, mtime and SHA-256;
- absent root DB pointer and free port 3000.

The only worktree changes were the active plan and handoff records. They were
placed in named stash
`4603a2c219ce7b4293fc378be23cf2bdc42a1a05` solely to prove a clean worktree,
then restored unchanged and the stash was dropped after the stop.

## Exclusive CDP blocker

Chrome PID `45404` retained the unique 9222 listener. The exact web-access
proxy process was identified and stopped before the exclusive probe.

One initial probe command used the wrong Node stdin argv index and failed
before reading `DevToolsActivePort`; it did not connect to Chrome or create a
page. The corrected probes then failed at `chromium.connectOverCDP`:

- first handshake timeout: 30 seconds;
- bounded confirmation wait: 120 seconds.

After the timeout there were no established 9222 clients and no residual probe
processes. Chrome's `/json/version` endpoint was unavailable even though its
listener and original PID remained alive. Restarting the web-access proxy also
waited for Chrome authorization and timed out. The unconnected proxy process
was then identified and stopped.

This is an external remote-debugging authorization blocker, not a product or
observer verdict. The exact profile hash and extension path could not be
re-proved, so Q1 correctly prohibited entry into the action runner.

## No-action proof

- `scripts/v4-live-observation.mjs` action mode was never started;
- localhost was never started;
- no `--authorize-action` or `--execute-authorized-action` flag was supplied;
- no LeetCode page, submit-control click or submission occurred;
- NowCoder was not opened;
- no new action evidence was written;
- the existing R4 READY file remained the sole matching evidence file;
- the R4 disposable database remained `0/0/0`;
- the default database remained unchanged.

Therefore `D8-A-2026-08-30-LC1` remains authorized and unconsumed.

## Required recovery

In the existing `yu` Chrome, toggle off then on **Allow remote debugging for
this browser instance** at `chrome://inspect/#remote-debugging`, and accept the
new connection prompt. Resume only the exclusive Q1 CDP binding. The action
runner must not start unless that gate passes.

D4 aggregation, additional actions, RC, release, V0.5, push and PR remain
unauthorized.
