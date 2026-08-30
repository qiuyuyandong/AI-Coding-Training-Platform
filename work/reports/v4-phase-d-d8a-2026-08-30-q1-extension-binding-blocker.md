# V4 Phase D D8-A-2026-08-30-LC1 Q1 Exact-extension Binding Blocker

Date: 2026-08-30

Branch: `feature/v1-followup`

HEAD at preflight: `e6b197bed7e9f40bcb2897fcdfb3e109fa05c701`

Product candidate: `0c23fcacf18d2fe4113d803504e638c1aab887d3`

Verdict: **Q1 exact-extension binding failed before action runner; action
authorization not consumed; no LeetCode action and no NowCoder**

## Authorization and recovery context

The user re-enabled remote debugging and continued the same separately named
`D8-A-2026-08-30-LC1`. The allowed action remained one current-`yu`-Chrome
LeetCode `merge-two-sorted-lists` submit at most, followed by an unconditional
stop, with NowCoder prohibited.

The prior Q1 CDP-authorization blocker was not treated as product evidence and
did not consume the action. This recovery still required every static and CDP
binding to pass before the action runner could start.

## Static Q1 PASS

The web-access check reached Chrome port 9222 and a ready proxy after the user
accepted the new debugging connection. Node.js and `npx` were available.

Static Q1 re-proved:

- candidate ancestry;
- observation-tool SHA-256
  `CE6D4CFC0FAD5B99A1EAD342FA7EE77D4AB5690E9EFF2FC2261EF702F17363DD`;
- acceptance-profile SHA-256
  `64455AC1DE043D30C44395675D37654EED44F13B0ABF24C9FC01E31D1BEC61A9`;
- candidate-receipt SHA-256
  `4EDA9DDD9FFB4311EDEA32B0D60DFEA34D54D07766E1490C02DB4B04582F9AEE`;
- R4 connection-receipt SHA-256
  `C95CD887EC0DA69B86584C002C2A57BFF8C4895465C9C7D777F91D423644CBDA`;
- all five exact-dist artifact hashes;
- R4 disposable database `0/0/0`;
- default database preservation, absent root pointer and free port 3000.

The three active task documents were temporarily stored in named stash
`1d3024fbb05c97a9247f5a4f5247b9114d9c0cc6` solely to obtain the required
clean worktree. They were restored unchanged and the stash was dropped after
the stop.

## Direct CDP result

The exact web-access proxy PID was identified and stopped before the direct
probe. The read-only Playwright connection then succeeded and closed only its
owned `chrome://version` page.

Closed results:

- official Chrome: PASS;
- protocol `1.3`: PASS;
- exactly one browser context: PASS;
- frozen `yu` profile-path hash: PASS;
- original Chrome PID `45404` preserved: PASS;
- exact extension binding: **FAIL**.

`validateCdpExtensionBinding` accepts only one fixed-ID extension that is
enabled and whose path exactly equals
`.tmp/v4-route-h-exact-dist-0c23fca`. Therefore at least one of those three
closed properties differed.

The successful probe did not retain the individual subconditions. A second
browser-level read-only diagnostic required another Chrome authorization and
timed out before connection. After the proxy was restored, a proxy-owned
`chrome://extensions` page did not expose its extension manager or item list;
no additional extension data was obtained. No actual extension path or other
installed-extension metadata was output.

## Stop and environment closure

- no `Extensions.loadUnpacked` call ran;
- no extension was enabled, disabled, removed or replaced;
- the R4 connection receipt was not rewritten;
- no localhost server or root DB pointer was created;
- no action runner or action flag ran;
- no LeetCode page, click or submission occurred;
- no NowCoder page or lane ran;
- no new action evidence was written;
- the disposable database remained `0/0/0`;
- the default database remained unchanged;
- web-access proxy returned to READY;
- Chrome PID `45404` and port 9222 remained alive.

The action opportunity remains authorized and unconsumed.

## Required decision

The next possible scope is a separately authorized localhost-only
exact-extension binding diagnostic/repair round. Its contract must decide:

1. whether the three closed subconditions may be read and retained as bounded
   booleans; and
2. for each possible mismatch, whether loading, enabling or replacing the
   extension with the frozen exact dist is permitted.

Q1 and the action runner must not resume before that decision. D4 aggregation,
additional actions, RC, release, V0.5, push and PR remain unauthorized.
