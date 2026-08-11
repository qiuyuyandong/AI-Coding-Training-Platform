# V4 Phase D Task 23 — same-SHA real-platform engineering observations

Date: 2026-08-11  
Branch: `feature/v1-followup`  
Immutable implementation candidate: `a911425a415db2ee374430ced62edcaa7b786866`  
Documentation HEAD at entry: `c17e9eb2db737f08bc7fd14905be6fb29e9ee1a3`  
Status: `D4 ENGINEERING OBSERVATION PASS`

This report records automated engineering observations against one immutable
candidate and its exact production build. It is not user acceptance, an RC,
or a release. It permits D5 independent review to begin.

## Exact artifact and isolated environment

The only enabled capture extension was unpacked extension
`ajomjghlnpajbhbemihagpcehgffkihf`, loaded from
`.tmp/task22-exact-dist-a911425`. Three older Unified OJ Capture installations
were visibly disabled. The frozen files retained the Task 22 hashes:

| File | SHA-256 |
| --- | --- |
| `manifest.json` | `A85C3275D559BD46AAA034FEEA9B14EAFECFC6F56341713B2AFB8B024E2B3E64` |
| `background.js` | `8574AE767AF854448CBE14B1EF569E6BBFE443A23B5DB7E88645F524461A74B2` |
| `content.js` | `9DC010902D97620D8E9FAB45B9B1CA627E53122B4A8BA9CE35000E067B49DB69` |
| `popup.js` | `3D164737873BB36A522300FC4B92829C419A3EAEC4CACDC0CF111A91497CF478` |
| `main-world-bridge.js` | `4D89A80F0351295EE1C0CD173BE107080983868D18510D028854695EACEE3943` |

The isolated service used
`.tmp/task23-d4-a911425/training-platform.sqlite`. The extension paired once
as installation `installation_7f70cc9b-8b88-4099-abc1-1aae9c15b6de`; the
single pairing code was consumed at `2026-08-11T07:56:49.113Z`. Before either
valid platform observation, the isolated database had zero capture events,
zero training sessions, and zero training attempts.

Candidate-to-documentation-HEAD diffs under `extension/**` and the candidate
validator were empty. The worktree was clean. The default database remained
untouched at 479232 bytes and LastWriteTimeUtc
`2026-07-23T15:56:38.8411343Z`.

## LeetCode same-problem / same-verdict regression — PASS

The authenticated LeetCode.cn page was the exact problem
`merge-two-sorted-lists`. A residual Accepted result existed from the prior
observation. After action-time user confirmation, automation replaced the
incomplete restored editor content with a minimal correct Python solution and
clicked the unique visible `提交` button once. No source code is copied into
this report or any other evidence artifact.

The platform created fresh submission `cn/741526004`, navigated to the exact
numeric submission route, and displayed `通过` / `Accepted` with 208 of 208
tests passed. The local chain completed exactly once:

| Evidence | Result |
| --- | --- |
| `POST /api/capture/attempts` | exactly 1 at this checkpoint, HTTP 200 |
| `capture_events` | 4 |
| `training_sessions` | 1 |
| `training_attempts` | 1 |
| platform / problem | `leetcode` / `merge-two-sorted-lists` |
| submission / verdict | `cn/741526004` / `Accepted` |

The event kinds were exactly `SESSION_STARTED`, `SUBMISSION_OBSERVED`,
`VERDICT_OBSERVED`, and `SESSION_ENDED`. Both submission-bearing events used
`cn/741526004`. This proves the same-problem / same-verdict regression on the
new candidate; it does not promote LeetCode beyond its existing experimental
policy.

## First NowCoder action — excluded orchestration error

Automation initially reused a NowCoder problem tab that had been open before
the new unpacked extension was loaded. The exact approved route and retained
correct C++ solution were present, and action-time user confirmation authorized
one submission. The platform created accepted submission `84444621`.

The post-action popup proved:

* waiting `0`;
* outbox `0`;
* quarantine `0`;
* last sync remained the LeetCode ACK at `2026-08-11T08:01:21.665Z`;
* no blocking diagnostic.

No local POST or SQLite row was created. Source-contract review then proved
why: NowCoder confirmation requires a trusted E0 click hint carrying the
source document id. Loading an unpacked extension does not retroactively
install its content script into an already-open problem document. Therefore
the click had no E0 listener and could not legally create E2. This is an
observation-orchestration error, not evidence against the result-identity
repair. Submission `84444621` is retained as excluded process evidence and is
not counted toward D4.

No extension was reloaded or recreated. Automation navigated the same tab to
the exact problem URL after extension installation, which caused the frozen
content script to load normally. Safe visible checks confirmed the unique
`保存并提交` control and retained complete C++ solution before the valid action.

## NowCoder approved pilot — PASS

After a second action-time user confirmation, automation clicked the exact
`保存并提交` button once on the freshly loaded approved pilot
`acm/contest/18839/1001`. The problem page displayed `答案正确` and the contest
submission list exposed fresh stable submission `84444687`.

Automation opened the exact result route containing only that submission id.
The document exposed the approved pilot breadcrumb and the narrow final
verdict `运行状态：答案正确`. The reserved global navigation route
`/acm/problem/list` no longer polluted problem identity. No raw HTML, source
code, request or response body, headers, cookies, tokens, or browser storage
was exported or retained.

The local chain then completed exactly once:

| Evidence | Result |
| --- | --- |
| cumulative `POST /api/capture/attempts` | exactly 2, one per valid platform, both HTTP 200 |
| cumulative `capture_events` | 8, exactly 4 per platform |
| cumulative `training_sessions` | 2, exactly 1 per platform |
| cumulative `training_attempts` | 2, exactly 1 per platform |
| platform / problem | `nowcoder` / `acm/contest/18839/1001` |
| submission / verdict | `84444687` / `Accepted` |

The NowCoder event kinds were exactly `SESSION_STARTED`,
`SUBMISSION_OBSERVED`, `VERDICT_OBSERVED`, and `SESSION_ENDED`. Both
submission-bearing events used `84444687`. The active installation's
`last_seen_at` advanced to `2026-08-11T08:12:10.551Z`, the same receive time
as all four atomic bundle events.

This closes the repaired exact-pilot delivery chain through E0, E1, E2, E3,
bundle, POST, ACK, and SQLite projection. The user-provided post-ACK popup
image `codex-clipboard-70fa21ff-b22d-49c8-9c51-72e375ac1eeb.png` independently
proved:

* waiting `0`;
* outbox `0`;
* quarantine `0`;
* last sync `2026-08-11T08:12:10.578Z`;
* no blocking diagnostic;
* capture enabled and locally paired.

## Blocked-platform readiness / drift — PASS

No AtCoder, Codeforces, or Luogu submission was made. The exact commands were:

```text
node scripts/validate-v4-adapter-readiness.mjs --all
  V4 adapter readiness PASS

npx vitest run --config vitest.config.ts \
  tests/unit/v4AdapterReadinessValidator.test.ts \
  tests/unit/extensionNetworkObserver.test.ts \
  tests/unit/extensionPlatforms.test.ts --no-file-parallelism
  3 files passed; 292 tests passed
```

AtCoder, Codeforces, and Luogu remain network-`blocked` with their existing
terminal evidence. Historical AtCoder DOM production certification remains
unchanged. No blocked-platform retry or submission occurred.

## Gate conclusion

The API, SQLite, platform, and popup evidence proves exact one-delivery
behavior for both active platforms on immutable candidate `a911425...`; the
blocked-platform drift gate also passes. D4 engineering observation is
complete and D5 F1-F4 independent review may begin. This result remains
engineering evidence only: it is not final user acceptance, an RC, or a
release.
