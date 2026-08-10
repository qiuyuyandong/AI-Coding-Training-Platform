+# V4 Phase D Task 20 result-route repair and candidate re-freeze

Date: 2026-08-10  
Branch: `feature/v1-followup`  
Immutable candidate: `4e7a47bfc22fece4aa60e4bab2f4223668be480b`

## Classification

Tasks 17-20 repair the failed Task 16 automated engineering observation and
re-enter the D3 immutable-candidate boundary. This is engineering evidence. It
is not a natural-user observation, D4 delivery PASS, D5 approval, RC, user
acceptance, or release.

## Failure and causal RED

Task 16 failed twice, including once with a newly loaded exact-dist extension,
fresh extension state, a fresh isolated service/database, and successful local
pairing. Both attempts reached a new Accepted LeetCode submission but produced
zero capture POSTs and zero SQLite rows. The fixed popup diagnostic was
`epoch_target_delivery_failed`.

The causal RED proved three linked defects: the real
`https://leetcode.cn/submissions/<digits>/` route was absent from the content
manifest; strict DOM-owned identity did not recognize that route; and the
content runtime unconditionally cleared an armed submit epoch on every SPA
location observation. The approved RED suite produced 163 passed and exactly
4 causal failures out of 167 tests. Explicit armed-epoch null-identity and
cross-problem invalidation tests remained green.

## Implemented repair

The manifest now installs the existing content runtime on the same authorized
host under `https://leetcode.cn/submissions/*`. The new exact numeric route
accepts only one visible leaf `a.cursor-text[href]` whose URL passes the
existing HTTPS, first-party host, credentials, port, query/hash, slug, title,
and uniqueness guards. Generic recommendation anchors are not scanned.
Existing detail routes and other platforms are unchanged.

The location observer now preserves an armed epoch only when strict
post-navigation detection retains the same platform/problem identity. Null,
ambiguous, unsupported, cross-platform, and cross-problem outcomes still clear
it. While a same-problem epoch marker exists, the armed path remains ahead of
the request-unbound legacy candidate path.

## Reviews

Independent Task 19 code, privacy, and plan/evidence reviews each returned
`APPROVE` with no blocking findings. The privacy reviewer independently reran
179 focused tests and the privacy audit with zero findings. The candidate-path
whitelist repair was separately approved by code and plan reviewers: it adds
only eight exact revision-4 paths, retains generated/secret/database/raw-
transcript precedence, and does not add a directory or glob allowlist.

## Verification

Focused and pre-freeze evidence:

- causal RED-to-green: 167/167;
- combined Task 13/14/revision-4 regression lane: 10 files, 517/517;
- candidate validator unit suite: 16/16;
- `npm run typecheck`: exit 0;
- targeted ESLint: exit 0;
- `npm run extension:build`: exit 0;
- `node scripts/audit-v4-extension-privacy.mjs`: PASS, 0 findings;
- `node scripts/validate-v4-adapter-readiness.mjs --all`: PASS;
- `git diff --check`: exit 0 (CRLF conversion warnings only).

The first attempted implementation head
`22fa470d24724c15b5bdb2874e6817b599505f3c` was not accepted as a candidate:
its validator stopped before the quality gate on the explicit path-ownership
checks. After the reviewed whitelist repair, the exact command

```text
node scripts/validate-v4-candidate.mjs --candidate 4e7a47bfc22fece4aa60e4bab2f4223668be480b
```

exited 0 with `V4 candidate commit PASS`:

- root unit: 2372 passed, 1 skipped (104 files);
- app E2E: 25/25;
- extension unit: 1567/1567 (47 files);
- extension E2E: 53 passed, 1 known harness skip;
- production build: 20/20 static pages;
- privacy audit: 0 findings;
- readiness: PASS;
- candidate identity: same SHA and clean both before and after the gate;
- default database: 479232 bytes and
  `2026-07-23T15:56:38.8411343Z` before/after;
- port 3000: free after the gate.

A separate root-unit evidence readback also passed 2372 with one skip.

## Frozen production-dist receipt

```text
manifest.json         A85C3275D559BD46AAA034FEEA9B14EAFECFC6F56341713B2AFB8B024E2B3E64
background.js         B67A702066262EAAE9F3C24D3FD6BF480B2EC04B60CD0266821EE418E7FD429C
content.js            F5D69DDBAB46D0379AB5ED8A9C8A7AAA2A65B9C9B8A693E6CA7B8C7296A115B3
popup.js              3D164737873BB36A522300FC4B92829C419A3EAEC4CACDC0CF111A91497CF478
main-world-bridge.js   4D89A80F0351295EE1C0CD173BE107080983868D18510D028854695EACEE3943
```

The built manifest contains `https://leetcode.cn/submissions/*`.

## Stop boundary and next action

The earlier `f18eddf4...` candidate and both failed Task 16 waiting states are
historical evidence only. No third LeetCode submission, NowCoder action, or
blocked-platform retry occurred during Tasks 17-20.

Task 21 is the only next action: create a fresh exact-dist extension instance
and fresh isolated service/database state, recheck this candidate SHA and all
five hashes, pair the new instance, then repeat the single authorized
LeetCode automated observation. A PASS must prove the complete same-SHA chain;
it still does not constitute natural-user acceptance, RC, or release.

