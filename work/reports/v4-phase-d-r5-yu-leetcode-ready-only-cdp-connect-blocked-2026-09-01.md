# V4 Phase D R5 yu Chrome LeetCode READY-only CDP Connect Blocker

Date: 2026-09-01

Branch: `feature/v1-followup`

Documentation HEAD: `90aec3c85e053c39ab58e058b763f86dce036a81`

Immutable product candidate: `ee0e1f5a2332fdeaf743e6fcfcadb0d799f869f0`

Verdict: **OBSERVER_COMPATIBILITY_BLOCKED after two authorized CDP-connect
attempts; no OJ page, observer arm, click or submission**

## Authorization boundary

The user authorized one new-candidate LeetCode READY-only check reusing
`r5-ready-yu-leetcode-ee0e1f5`, its existing zero database and its bounded
connection receipt. The authorization did not include action authorization,
action execution, a click, a submission, NowCoder, D4 aggregation, RC,
release, push or PR.

The single runner invocation therefore omitted both `--authorize-action` and
`--execute-authorized-action`.

After the first invocation failed and cleanup paused on Chrome's visible
remote-debugging prompt, the user accepted the prompt and said `继续`. That
authorized one continuation under the identical READY-only boundary. It did
not expand the scope to a real action or NowCoder.

## Frozen preflight

All read-only gates passed before the invocation:

- candidate `ee0e1f5a2332fdeaf743e6fcfcadb0d799f869f0` exists and is an ancestor
  of documentation HEAD;
- observation-tool SHA-256 remained
  `CE6D4CFC0FAD5B99A1EAD342FA7EE77D4AB5690E9EFF2FC2261EF702F17363DD`;
- acceptance-profile SHA-256 remained
  `64455AC1DE043D30C44395675D37654EED44F13B0ABF24C9FC01E31D1BEC61A9`;
- candidate receipt SHA-256 remained
  `A46B79F64F4A9373D134EA918D67959BBECDD89172B7EB37B4DC7E4706188E7C`;
- R5 connection receipt SHA-256 remained
  `F6EA6D1899D1D3D2E551EADB79DA1950FE1A777E14600076944ABF075A9A3A5F`;
- all five exact-dist artifact hashes matched the candidate receipt;
- the R5 database was exactly `0/0/0`;
- no prior R5 READY/action evidence existed;
- port 3000 was free, the root database pointer was absent, Chrome PID
  `45404` was listening on 9222 and the web-access proxy was initially READY;
  and
- the default database remained 479232 bytes at
  `2026-07-23T15:56:38.8411343Z`, SHA-256
  `2485DBEA8E9C9CF2F073BC6C9BA4AA0A5261DC3744DDA7592A2890BC554666C3`.

Existing uncommitted documentation from the immediately preceding preparation
task was preserved. The frozen observer-contract files had no worktree drift.

## First READY-only invocation

The exact proxy process handed off its 3456 listener, the Chrome 9222 listener
survived, and localhost started against only the prepared R5 database. Its
warm-up reached only local root and capture-status routes.

The runner then attempted its CDP connection once and exited 1 after the
30-second `browserType.connectOverCDP` timeout. It emitted only:

```text
OBSERVER_ERROR=browserType.connectOverCDP: Timeout 30000ms exceeded.
```

The timeout happened before a browser context was obtained. Consequently the
runner did not enter profile or extension binding, open its popup or LeetCode
page, arm the observer, emit `OBSERVER_ARMED`, `BROWSE_ONLY`, `READY` or either
action marker, or write bounded READY/failure evidence. The OJ branch was not
reached. No automatic retry was attempted.

This is an environment-level `CDP_CONNECT_BLOCKED` outcome, not evidence that
the product failed its READY contract.

## Authorized continuation

After the user accepted Chrome's prompt, the web-access proxy reached a real
READY state. The full frozen preflight was repeated: candidate/tool/profile/
receipt/artifact hashes still matched, the R5 database remained `0/0/0`, no
prior evidence existed, port 3000 was free and the root pointer was absent.

The proxy handed off CDP again, localhost started against the same R5 database,
and one second runner invocation ran without either action flag. It failed at
the same point with the same 30-second `browserType.connectOverCDP` timeout,
again before a browser context or OJ page existed. No third invocation ran.

## Root-cause diagnosis

The installed Chrome is `151.0.7922.175`. Its process has no traditional
`--remote-debugging-port` argument; port 9222 and `DevToolsActivePort` came from
Chrome's on-demand `chrome://inspect/#remote-debugging` mode. The repository is
frozen on Playwright `1.53.1`.

Playwright's primary issue
[`#40027`](https://github.com/microsoft/playwright/issues/40027) documents that
`connectOverCDP()` cannot attach to Chrome M144+ when remote debugging is
enabled through this on-demand mode, and records the same 30-second protocol
initialization timeout. The current Playwright connection documentation also
distinguishes the new `--cdp-endpoint=chrome` channel path from the traditional
CDP endpoint used with `--remote-debugging-port`.

Local evidence matches that documented boundary: the Node-native raw-CDP
web-access proxy connects successfully to the same Chrome endpoint and its
`/targets` request returns 200, while both Playwright `connectOverCDP()` calls
time out. The blocker is therefore the frozen observation transport's
compatibility with Chrome's new on-demand protocol, not a missing user approval,
network reachability, product READY behavior or LeetCode.

## Closure and retained blocker

Localhost was stopped, port 3000 was freed, the root database pointer was
removed and no observation-runner process remained. Chrome PID `45404` and
port 9222 survived. The R5 database remained `0/0/0`; candidate and connection
receipts remained byte-identical; the default database metadata and hash were
unchanged; and no R5 observation evidence was created.

After the second invocation, the web-access proxy was restored to `connected`
on port 3456 and `/targets` returned HTTP 200. Cleanup is fully closed.

Both authorized invocations are terminal. Another READY-only run is not useful
until the observation transport is made compatible or the current `yu` Chrome
is deliberately restarted under a traditional debugging mode. Either route is
a new user decision. Real submission remains separately unauthorized.

## Offline closeout verification

The documentation-only closeout passed:

- V4 D4 acceptance profiles PASS;
- V4 adapter readiness PASS;
- V4 plan authority PASS;
- plan-authority unit tests `3/3`; and
- `git diff --check` PASS.

No product source, extension source, observer tooling, candidate artifact,
receipt, database, dependency, commit, push or PR was changed by these READY
attempts. The plan, handoff and evidence report remain in the existing
uncommitted documentation worktree.
