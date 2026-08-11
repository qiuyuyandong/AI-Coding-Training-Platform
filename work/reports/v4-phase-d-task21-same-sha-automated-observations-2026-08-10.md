# V4 Phase D Task 21 same-SHA automated engineering observations

Date: 2026-08-10
Branch: feature/v1-followup
Immutable implementation candidate: 4e7a47bfc22fece4aa60e4bab2f4223668be480b
Documentation HEAD at entry: a5f7c1107a8b33ae9d1612d5bc3a2fcafb55194b

## Classification

This report records real-platform automated engineering observations. It is
not a natural-user submission, user acceptance, an RC, or a release. LeetCode
and the blocked-platform drift check pass below; the exact approved NowCoder
pilot fails after durable E2 because the visible exact result document does
not produce a persisted capture. D4 is therefore incomplete and D5 has not
started.

## Exact artifact and environment

The only enabled capture extension was the fresh unpacked instance
hmbjlfaignpkhjjhmokjpmcpndbfmejb, loaded from
.tmp/task21-leetcode-exact-dist-4e7a47b. The two previous extension instances
were visibly disabled. Immediately before the action, candidate-to-HEAD diffs
under extension/** and the candidate validator were empty, the Git worktree
was clean, and all five loaded hashes matched the Task 20 freeze:

    manifest.json         A85C3275D559BD46AAA034FEEA9B14EAFECFC6F56341713B2AFB8B024E2B3E64
    background.js         B67A702066262EAAE9F3C24D3FD6BF480B2EC04B60CD0266821EE418E7FD429C
    content.js            F5D69DDBAB46D0379AB5ED8A9C8A7AAA2A65B9C9B8A693E6CA7B8C7296A115B3
    popup.js              3D164737873BB36A522300FC4B92829C419A3EAEC4CACDC0CF111A91497CF478
    main-world-bridge.js   4D89A80F0351295EE1C0CD173BE107080983868D18510D028854695EACEE3943

The isolated service used
.tmp/task21-leetcode-clean/training-platform.sqlite. It contained one new
active installation installation_9125fe41-584c-47f3-bb5b-a16029bbc7e3; its
single pairing code was consumed. Before the platform action, capture_events,
training_sessions, and training_attempts were all zero. A full page refresh
after extension load produced no rows, providing the browse-only negative
flow. The popup baseline was paired/enabled, waiting/outbox/quarantine all
zero, no last sync, and no blocking diagnostic.

The repository default database was not used for the observation. A metadata-
only final check preserved its established baseline: 479232 bytes and
`2026-07-23T15:56:38.8411343Z` LastWriteTimeUtc.

## LeetCode residual Accepted to new Accepted — PASS

Automation remained within narrow first-party UI evidence. On residual
741318477 it observed exactly one visible leaf current-problem anchor
a.cursor-text[href] pointing to /problems/merge-two-sorted-lists/, exactly one
[data-e2e-locator="submission-result"] with verdict 通过, and exactly one
visible enabled button[data-e2e-locator="console-submit-button"] labelled 提交.
It did not inspect or export editor text, problem text, cookies, browser
storage, request/response bodies, headers, account identity, language,
execution time, or memory.

Automation clicked that exact submit button once. The URL changed to fresh
submission cn/741329618; the same unique problem identity remained and the
narrow verdict became 通过 / Accepted.

The local chain completed exactly once:

    POST /api/capture/attempts: 1 (HTTP 200)
    capture_events:             4
    training_sessions:          1
    training_attempts:          1
    attempt id:                 attempt_cn/741329618
    result / verdict:           passed / Accepted
    platform / problem:         leetcode / merge-two-sorted-lists

The four persisted event kinds were SESSION_STARTED, SUBMISSION_OBSERVED,
SESSION_ENDED, and VERDICT_OBSERVED; both submission-bearing events used
cn/741329618. The user-provided post-ACK popup screenshot then proved waiting
0, outbox 0, quarantine 0, last sync 2026-08-10T10:29:48.380Z, paired/enabled,
and blocking reason 无. No retry or cleanup button was used.

This closes the required LeetCode same-problem, same-verdict regression as an
automated engineering observation. It does not certify LeetCode for production
and does not complete D4 by itself.

## Incorrect NowCoder route attempt — excluded from D4 evidence

Before the approved NowCoder pilot identity was rechecked, automation opened
the authenticated-characterization fixture route `acm/problem/319811` and
clicked its unique visible enabled `button.btn-submit` labelled
`保存并提交` once after the user confirmed that retained code was present.
The user reported that the platform submission completed with `答案正确`; the
fresh stable result id was `84438694` and the exact result page exposed one
`/acm/problem/319811` anchor plus one `.coder-cont-legend .font-green` verdict
of `答案正确`. No editor text, problem body, request/response body, cookies,
tokens, headers, account identity, language, runtime, memory, or source code
was read, copied, exported, or recorded.

This action was outside the existing active NowCoder V4 network policy. The
approved experimental pilot recognizes only `acm/contest/18839/1001`; both
E2 confirmation and E3 evidence reject any other problem identity. Therefore
the observed fail-closed result was expected and is not a NowCoder regression
PASS or FAIL for D4:

    additional POST /api/capture/attempts: 0
    capture_events:                       4 (unchanged)
    training_sessions:                    1 (unchanged)
    training_attempts:                    1 (unchanged)
    waiting / outbox / quarantine:        0 / 0 / 0
    last sync:                             2026-08-10T10:29:48.380Z (unchanged)

The popup showed fixed diagnostic `epoch_started_missing`. Code-path review
proved that this diagnostic is emitted only by the LeetCode submit-epoch or
LeetCode verdict-candidate expiry paths; the NowCoder adapter drops unsupported
problem identities without writing that diagnostic. It is recorded as an
independent residual diagnostic, not attributed to the 319811 fail-closed
decision. No retry or cleanup control was used.

This mistaken route choice is retained explicitly as process evidence. It
does not expand the NowCoder policy, authorize a generic problem adapter, or
invalidate candidate `4e7a47bfc22fece4aa60e4bab2f4223668be480b`.

## Blocked-platform drift check — PASS

No AtCoder, Codeforces, or Luogu submission was made. The authoritative
readiness command and focused fail-closed suite were run against the same
documentation HEAD and candidate lineage:

    node scripts/validate-v4-adapter-readiness.mjs --all
      V4 adapter readiness PASS

    npx vitest run --config vitest.config.ts \
      tests/unit/v4AdapterReadinessValidator.test.ts \
      tests/unit/extensionNetworkObserver.test.ts \
      tests/unit/extensionPlatforms.test.ts --no-file-parallelism
      3 files passed; 284 tests passed

The readiness registry continues to classify all three network policies as
`blocked` and retains their exact terminal evidence references:

* AtCoder: `work/reports/v4-atcoder-c2-blocker-2026-08-02.md`; main-frame
  form navigation without `documentId` fails before storage and the landing
  route supplies no stable numeric submission identity.
* Codeforces: `work/reports/v4-codeforces-c3-blocker-2026-08-02.md`; main-frame
  form navigation without `documentId` fails before storage and the status
  landing supplies neither stable submission nor exact problem identity.
* Luogu: `work/reports/v4-luogu-c4-blocker-2026-08-02.md`; the submit E1 and
  numeric record landing remain cross-document with no approved continuity
  signal.

The focused tests prove the current pre-storage rejection, narrow route and
DOM detection boundaries, and readiness-record contract. Historical AtCoder
DOM production certification remains unchanged and was not re-certified.

## NowCoder approved pilot observation — FAIL

Automation then opened the exact active-policy route
`https://ac.nowcoder.com/acm/contest/18839/1001`. The user visually confirmed
that an already retained solution was present and explicitly authorized one
additional submission after the excluded 319811 route mistake. Immediately
before that action, the candidate-to-HEAD runtime/build diff was empty, all
five exact-dist hashes still matched the frozen values above, localhost:3000
was listening, and SQLite remained at 4 capture events, 1 training session,
and 1 training attempt.

The route contained exactly one visible enabled `button.btn-submit` labelled
`保存并提交`. Automation clicked it once and did not read, copy, export, or
record editor code. The user reported that the platform submission completed
with a correct answer. The immediate popup screenshot proved the required E2
transition:

    waiting:       1 (baseline was 0)
    outbox:        0
    quarantine:    0
    last sync:     2026-08-10T10:29:48.380Z (unchanged from LeetCode)

The transient E1-only popup state was not separately observed: the platform
advanced to the status-confirmed state before the first post-click popup
snapshot. Therefore this report does not claim an independently witnessed E1
or waiting-unchanged E1 checkpoint. It proves durable E2 from waiting `1` and
records the missing E1 checkpoint as an additional reason this run cannot
satisfy D4, independently of the later E3 false negative.

The pre-existing fixed `epoch_started_missing` diagnostic remained visible;
it is not attributed to the NowCoder E2 because the NowCoder adapter cannot
write that diagnostic.

Automation used the visible `我的提交` navigation and selected the new stable
submission `84438785` from the problem-filtered contest submission list. It
then opened the privacy-minimized exact URL containing only `submissionId`.
The result page exposed exactly one matching
`/acm/contest/18839/1001` problem anchor and exactly one
`.coder-cont-legend .font-green` verdict `答案正确`. No account identifier from
the list URL was retained in evidence.

Four seconds after the exact E3 page opened, localhost still had only the
earlier LeetCode POST and SQLite remained 4/1/1. The user-provided post-E3
popup screenshot then proved the terminal observation state:

    waiting:       1 (unchanged after E3)
    outbox:        0
    quarantine:    0
    last sync:     2026-08-10T10:29:48.380Z (unchanged)
    last error:    epoch_started_missing (unchanged residual diagnostic)

The final user-supplied popup screenshot independently repeats that same
post-result state: paired/enabled, waiting `1`, outbox `0`, quarantine `0`,
last sync still `2026-08-10T10:29:48.380Z`, and the unchanged residual fixed
diagnostic. It is retained as visual corroboration of the unconsumed E2, not
as evidence about the diagnostic's NowCoder cause.

Therefore the exact visible result document did not consume the durable
NowCoder E2. There was no ACK, no new `POST /api/capture/attempts`, no new
capture event/session/attempt row, and no duplicate delivery. This is a real
false negative on the exact approved policy and makes the NowCoder D4 lane
`FAIL`; D4 is incomplete and D5 cannot begin.

The first observation bounded the divergence between the exact result document
and persisted capture but did not yet distinguish DOM identity, content
ingress, candidate-message delivery, or background rejection. No timeout,
polling, reload, retry, cleanup, or chronology relaxation was used.

## Capture-disabled first divergence and causal RED

A test-only causal hypothesis was initially added to
`tests/unit/extensionDomesticOjAuth.test.ts`. It proves that one exact pilot
contest anchor plus the final verdict resolves correctly, while the same
document with one additional safe public-problem alias returns `null` instead
of retaining the approved pilot identity.

The command:

    npx vitest run --config vitest.config.ts tests/unit/extensionDomesticOjAuth.test.ts --no-file-parallelism

reported one file with 159 tests: 158 passed and the hypothesis RED failed
because `detectProblemFromPage` returned `null`. Independent plan and code-
boundary reviews rejected treating that constructed input as the real causal
layer: the live observation did not record every safe generic alias, and
global pilot precedence could mis-bind a stray pilot link to a generic current
problem. The test was therefore converted to a fail-closed guard. Its rerun
passed 159/159; the single-anchor approved-pilot control also remains green.
No production file changed.

The user then visibly disabled extension capture and reopened the exact result
URL without submitting or using retry/cleanup controls. A privacy-minimized
visible-DOM query retained only resolver-accepted first-party pathname
categories, leaf/visibility flags, minimal tag/class context, and the narrow
verdict. It found:

* visible leaf global navigation `/acm/problem/list` inside `ul.acm-nav`;
* visible leaf pilot breadcrumb `/acm/contest/18839/1001` inside
  `.crumbs-path`;
* one narrow final verdict `答案正确`.

This proves the first divergent layer. `resolveNowCoderProblemAnchor` accepts
reserved segment `list` under its generic `[A-Za-z0-9_-]+` grammar and creates
false identity `acm/problem/list`. `resolveDomesticRoute` then sees that false
identity plus the real pilot identity and returns `null`, so no content-runtime
candidate can reach background E3.

The initial browser query used an over-broad contest-path classifier and
incidentally surfaced an account-profile path in transient tool output. Its
value was immediately discarded and is not copied into this report, the plan,
tests, source, or final status. The second query was narrowed to the exact paths
accepted by the production resolver. No source code, problem body, raw HTML,
cookies, tokens, headers, request/response data, browser storage, language,
runtime, or memory was retained.

The live sanitized shape replaced the rejected alias-precedence hypothesis in
the RED. The command:

    npx vitest run --config vitest.config.ts tests/unit/extensionDomesticOjAuth.test.ts tests/unit/extensionPlatforms.test.ts --no-file-parallelism

reported 270 tests: 267 passed and exactly 3 causal tests failed:

1. navigation `problem/list` plus pilot breadcrumb returns `null`;
2. DOM-only `problem/list` is fabricated as a problem identity;
3. URL-only `problem/list` is fabricated as a problem identity.

No production file changed. The safe repair candidate is exact reserved-route
rejection shared by the NowCoder URL and DOM parsers; it does not prefer pilot
links, weaken legitimate ambiguity, or broaden the network policy. Revised
plan, code-boundary, and privacy reviews all returned `APPROVE`; the code lane
requires exact/near-miss/trailing-slash and synthetic flow coverage. This
authorizes test-first implementation under
`docs/superpowers/plans/2026-08-10-v4-phase-d-d4-nowcoder-e3-identity-repair.md`,
but not a Git commit, candidate freeze, D4 retry, D5, RC, or release.

## Narrow repair implementation and focused gates

The test-first repair added one shared ACM-problem-only reserved-segment
predicate. Exact lowercase `list` is rejected by both URL and DOM identity
parsing; `practice/list`, `listing`, `list-1`, `List`, legitimate generic
identities including `319811`, the exactly-one ambiguity rule, and the
NowCoder network policy remain unchanged. Task5/Task6 synthetic result HTML
now includes the real `problem/list` navigation plus pilot breadcrumb shape.

Evidence:

    expanded RED: 272 passed / 8 intended failures
    focused GREEN: 6 files / 406 tests passed
    npm run typecheck: PASS
    targeted ESLint: PASS
    node scripts/audit-v4-extension-privacy.mjs: PASS (0 findings)
    git diff --check: PASS (working-copy line-ending warnings only)

No build/dist, extension E2E, full quality gate, candidate validator,
migration, database mutation, or fresh real submission ran during
implementation. The result page remains open with capture paused. Independent
post-implementation code and privacy reviews both returned `APPROVE`, with no
HIGH or MEDIUM findings. The user authorized the reviewed local commit and D3
refreeze on 2026-08-11; that authorization does not extend to push or D4 retry
before the new immutable candidate is frozen.

## D3 refreeze attempt — stopped on repeated browser infrastructure failure

The reviewed repair is locally committed as
`6aa750c0ad5db6e90d9681bcef08111fc1cb3929`. It is not a D3 candidate.

The first post-commit `npm run quality:gate` failed in extension E2E after its
earlier root and extension unit stages passed:

* root unit: `2387 passed / 1 skipped`;
* extension unit: `1582/1582`;
* extension E2E: `46 passed / 7 failed / 1 skipped`;
* all seven failures: `fixtures.ts:87`, `Target page, context or browser has
  been closed`, before any business assertion;
* production build and the final full-gate PASS were not reached.

An independent failure-contract review classified this as browser/Playwright
infrastructure and allowed exactly one controlled isolated diagnostic. That
`npm run extension:e2e` run passed the modified NowCoder Task 5 and Task 6
tests but finished `52 passed / 1 failed / 1 skipped`; the sole failure was the
same `fixtures.ts:87` context-close error, now in B3 lifecycle A. The review's
stop condition therefore fired. No further retry, test masking, candidate
ownership commit, exact candidate validator, or dist hash freeze occurred.

Default database metadata stayed `479232` bytes and
`2026-07-23T15:56:38.8411343Z`. Port 3000 and repository Playwright/browser
processes were absent after teardown. The existing candidate `4e7a47b...` is
invalidated by the runtime change, and no replacement immutable candidate
exists.

Read-only follow-up isolated the fixture race: worker discovery can start the
service worker before `waitForEvent("serviceworker")` is installed; the later
`serviceWorkers()[0] ?? await started` then short-circuits and leaves `started`
pending until context teardown. Windows Application/WER logs contained no
Chromium crash entry for the two runs. Plan Revision 2 specifies a pure RED and
a no-retry composite-wait repair. Independent plan review returned `APPROVE`
with no HIGH or MEDIUM findings. Fixture implementation remains separately
user-gated and has not started.

Remaining D4 work:

1. Produce a reviewed fixture/Chromium lifecycle diagnosis and plan revision
   with a RED; do not blindly rerun the same gate.
2. Only after that repair passes the full D3 validator may a replacement
   immutable SHA and exact dist be frozen.
3. Re-run fresh LeetCode and approved-pilot NowCoder observations on that one
   new immutable SHA; D5 remains blocked until both pass.
