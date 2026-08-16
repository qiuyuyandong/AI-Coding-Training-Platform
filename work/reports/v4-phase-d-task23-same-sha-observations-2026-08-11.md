# V4 Phase D Task 23 — same-SHA real-platform engineering observations

Date: 2026-08-11  
Branch: `feature/v1-followup`  
Immutable implementation candidate: `a911425a415db2ee374430ced62edcaa7b786866`  
Documentation HEAD at entry: `c17e9eb2db737f08bc7fd14905be6fb29e9ee1a3`  
Status: `FINAL DELIVERY OBSERVED; D4 INCOMPLETE — contemporaneous browse/E1/E2 stage evidence missing`

This report records automated engineering observations against one immutable
candidate and its exact production build. It is not user acceptance, an RC,
or a release. Independent F1 review later rejected D4 completeness; it does
not permit D5 to proceed.

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

The API, SQLite, platform, and popup evidence proves exact final one-delivery
behavior for both active platforms on immutable candidate `a911425...`; the
blocked-platform drift gate also passes. However, this run did not preserve
the master plan's required contemporaneous browse-only negative state, E1
state with waiting unchanged, or E2 state with waiting incremented exactly
once for each platform. Final state cannot reconstruct those observations.
Independent F1 review therefore returned `REJECT`; D4 remains incomplete and
D5 is stopped. Revision 3 in the active repair plan is the only authorized
remediation. This result is not final user acceptance, an RC, or a release.

## Task 24 Revision 3.2 pre-action observation failure

The reviewed event-driven observer implementation passed 23/23 focused tests,
typecheck, targeted ESLint, privacy audit with `0 findings`, candidate-runtime
isolation, and independent code/privacy review. Its first fresh LeetCode run
used a fresh disposable profile and a fresh isolated database with zero
capture events, sessions, and attempts.

No submission occurred. Navigation alone changed raw session
`transientE1` cardinality from zero to one, so the browse-only gate failed
closed before action-time confirmation. The browser closed, the isolated
database remained `0/0/0`, and the exact five artifact hashes were identical
before and after the attempt. Safe evidence:
`output/playwright/v4-observation/leetcode-real-observation-failed-1786441821102.json`.

This does not invalidate candidate `a911425...`: source inspection shows the
frozen observer intentionally retains coarse owned E1 records, while the
Task 24 harness observed only total array cardinality. Revision 4 in the
active plan must distinguish an explicit target submit E1 from valid unrelated
browse E1 without reading or exporting request, document, URL, or account
identity. D4 remains incomplete and D5 remains stopped.

## Task 24 Revision 4 pre-live closeout

Revision 4 now implements the reviewed target-only E0/E1 projection without
changing extension runtime, manifest, validator, candidate, or exact dist.
GraphQL browse activity is ignored and never serialized; submit/status-like
near misses fail closed. Required E0/E1 record keys are presence-checked without
reading forbidden identity/timestamp fields. The report projection contains no
raw session cardinalities.

Final local evidence is: observer unit `31/31`, typecheck exit `0`, targeted
ESLint exit `0`, privacy audit `PASS` with `0 findings`, `git diff --check` exit
`0` (CRLF warnings only), and candidate isolation diff exit `0`. Two independent
code/privacy reviewers returned `APPROVE` with no HIGH or MEDIUM findings.

No new live run or submission occurred during this implementation/review
closeout. D4 remains incomplete and D5 remains stopped. The next action is a
fresh isolated LeetCode observation with an action-time submission confirmation;
the first failure terminates the observation without silent retry.

## Task 24 Revision 4 live LeetCode failure

After the reviewed harness armed on a fresh disposable profile/database and
the user gave action-time authorization, the user logged in and submitted
`merge-two-sorted-lists` once. Public submission `cn/741573842` returned
`Compile Error` because the intentionally empty solution was submitted. This
is still a valid final verdict and the capture failure is not excluded.

The popup showed waiting `1`, outbox/quarantine `0/0`, no successful sync, and
`epoch_started_missing`. The observer stopped with
`observer_stage_rejected`; the isolated database remained capture events /
sessions / attempts `0/0/0`. Safe failure receipt:
`output/playwright/v4-observation/leetcode-real-observation-failed-1786444988036.json`.
All five exact-dist hashes matched before and after. The context was closed and
there was no retry or second submission.

Source inspection proves a sufficient production contradiction: STARTED is
keyed only by an exact submit request ID, while the GraphQL-result E2 branch
uses a GraphQL request ID for CONFIRMED. Content performs an exact lookup and
therefore cannot find a STARTED epoch for that GraphQL identity. Existing unit
tests currently encode the contradictory identity. A separate observer
failure-receipt gap prevented the live receipt from retaining the triggering
closed error/target projection, but did not cause the runtime failure.

D4 remains incomplete and D5 remains stopped. Revision 5 in the active plan is
review-required before test or production work. Any production repair will
invalidate candidate `a911425...` and require D3 re-freeze plus fresh same-SHA
LeetCode and approved-pilot NowCoder observations.

## Revision 5 local repair checkpoint

Revision 5 has now completed RED-to-GREEN and independent code/privacy review,
without another live run. The exact submit request ID is the sole epoch
identity in both LeetCode confirmation paths; GraphQL is corroboration only.
Terminal or identity-conflicting lifecycle wrappers are excluded before check,
result, GraphQL, or submit selection, and persistence must complete before the
single exact CONFIRMED delivery. The observer failure receipt is separately
bounded to fixed error, target/queue cardinalities, and isolated DB counts.

Evidence: initial production RED `118 passed / 6 failed`; observer RED `31/32`;
latest focused regression `261/261`; observer `32/32`; typecheck and targeted
ESLint exit `0`; privacy audit `0 findings`; independent code and privacy
reviews `APPROVE` with no HIGH/MEDIUM findings. The old candidate remains
invalid. D3 candidate ownership, full validation, new exact dist, and five new
hashes are still pending; no live retry is authorized yet.

## Task 27 `aa1a572` LeetCode live observation — FAIL (observer stage)

Revision 5 was re-frozen as immutable candidate
`aa1a572c3913b35dd3f0391f849dab66e79c56a2`, and its complete candidate
validator passed before this run. A fresh disposable profile and isolated
zero-row SQLite database reached `OBSERVER_ARMED=1`, `BROWSE_ONLY=1`, and
`READY=1` against the exact frozen Task 26 dist. After explicit action-time
authorization, the user manually submitted `merge-two-sorted-lists` once.
The disposable Chromium was accidentally closed after the platform displayed
the result.

The observer failed closed with `observer_stage_rejected`. Safe evidence
`output/playwright/v4-observation/leetcode-real-observation-failed-1786450433237.json`
contains only the last accepted `browse_only` stage: target E0/E1/submit/status
`0/0/0/0`, confirmed/tombstones/outbox/quarantine all zero, and database
capture events / sessions / attempts `0/0/0`. All five exact-dist hashes match
the Task 26 freeze before and after. The dedicated server was stopped; port
3000 has no listener. No retry or second submission occurred.

This receipt does not observe or classify the verdict and therefore cannot
support a claim that `Compile Error` caused the delay or should be excluded.
`Compile Error` remains a legitimate final verdict and useful training signal.
The observed failure boundary is the harness transition from `browse_only`,
before accepted E1/E2/E3/ACK evidence. D4 remains incomplete and D5 remains
stopped. The next action is a reviewed RED for the observer transition
contract and bounded rejection receipt, especially storage callbacks that may
coalesce E0 and exact-submit E1. Production runtime and verdict taxonomy remain
frozen until causality is proved.

## D4 Acceptance Contract Revision 2 — 2026-08-12

The sole Phase D plan now separates product acceptance invariants from
observer callback timing. Candidate `aa1a572...` and its frozen dist remain
unchanged. Individual E1/E2 snapshots, callback count/order, and manual popup
screenshots are diagnostic rather than hard gates; legal E0/E1/E2 coalescence
must be accumulated without invented timestamps. Exact SHA/hashes, isolated
browse-only baseline, unambiguous causal binding, one final verdict, one
bundle/POST/ACK, SQLite `+4/+1/+1`, and final queues `0/0/0` remain mandatory.
Compile Error remains a valid final verdict.

The observation tool receives its own reviewed SHA/hash identity and may be
corrected without invalidating the immutable product candidate, provided the
candidate-isolation guard passes. Harness RED/GREEN now passes observer
`52/52`, focused causal regression `207/207`, typecheck/lint/syntax/diff
checks, privacy audit `0 findings`, candidate isolation, and the five frozen
hash rechecks. It covers the production consume-style E3/ACK state after a
locked E2 identity. No platform submission occurred. Independent
code/privacy/scope review then
returned `APPROVE` with no HIGH/MEDIUM findings for the causal observer. A
later sequential READY runner amendment received follow-up independent
`APPROVE`; this historical appendix still does not authorize submission. The
current Revision 2 report supersedes this appendix. Detailed rationale and sources:
`work/reports/v4-phase-d-d4-acceptance-contract-revision-2026-08-12.md`.
