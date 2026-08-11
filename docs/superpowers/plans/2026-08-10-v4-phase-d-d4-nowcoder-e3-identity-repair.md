# V4 Phase D D4 NowCoder E3 First-Divergence Investigation and Conditional Repair Plan

**Status:** `REVISION 5 REVIEW REQUIRED — Task 24 LeetCode control-plane identity contradiction reproduced; D4 incomplete; no live retry authorized; D5 stopped`

**Date:** 2026-08-10

**Repository:** `qiuyuyandong/AI-Coding-Training-Platform`

**Branch:** `feature/v1-followup`

**Documentation HEAD at failure:** `a5f7c1107a8b33ae9d1612d5bc3a2fcafb55194b`

**Failed immutable candidate:** `4e7a47bfc22fece4aa60e4bab2f4223668be480b`

**Failure report:** `work/reports/v4-phase-d-task21-same-sha-automated-observations-2026-08-10.md`

## 1. Goal

Identify the first proven NowCoder result-document-to-persistence divergence,
then conditionally repair only that boundary so the already-approved
experimental pilot `acm/contest/18839/1001` can turn one durable E2 plus one
exact final result document into exactly one E3, bundle, local capture POST,
ACK, and SQLite projection.

This plan does not promote NowCoder, expand the pilot to generic
`acm/problem/<id>` routes, complete D4, begin D5, create an RC, or authorize a
release. It replaces only the earlier D4 repair plan's explicit NowCoder
non-goal after the approved NowCoder pilot itself produced a real false
negative.

## 2. Established evidence

### 2.1 Same-SHA LeetCode lane

Candidate `4e7a47b...` completed one fresh same-problem/same-verdict LeetCode
submission exactly once: one capture POST, four events, one session, one
attempt, ACK, and popup waiting/outbox/quarantine `0/0/0`.

This is historical engineering evidence after any runtime repair. It cannot
certify a later candidate.

### 2.2 Approved NowCoder pilot failure

On exact route `https://ac.nowcoder.com/acm/contest/18839/1001`, one authorized
submission produced a durable E2. The popup changed from waiting `0` to waiting
`1`. The new exact result document had:

* stable public submission id `84438785`;
* one observed exact pilot anchor `/acm/contest/18839/1001`;
* one final `.coder-cont-legend .font-green` verdict `答案正确`.

After the exact result document, waiting remained `1`; there was no outbox
item, quarantine item, new sync time, capture POST, event, session, attempt, or
duplicate delivery. No reload, retry, cleanup, timeout extension, polling, or
chronology relaxation was used.

Therefore D4 is `FAIL` for NowCoder and incomplete overall. D5 is blocked.

### 2.3 Excluded route mistake

The earlier submission on `acm/problem/319811` was outside the approved
network policy and is excluded from D4. It must remain fail-closed and must not
be used to justify generic NowCoder network support.

### 2.4 Capture-disabled first divergence

With extension capture visibly disabled, the exact result URL was reopened
without submission, retry, reload loop, cleanup, or browser-storage access.
The privacy-minimized boundary observation found exactly two visible leaf
first-party paths accepted by the current NowCoder anchor parser:

1. `/acm/problem/list` inside the global `ul.acm-nav` navigation;
2. `/acm/contest/18839/1001` inside the result `.crumbs-path` breadcrumb.

The same page had one narrow final verdict `答案正确`. No raw HTML, source code,
problem body, account identity, request/response data, cookies, tokens, headers,
language, runtime, or memory was retained.

The first divergence is now proven. `resolveNowCoderProblemAnchor` accepts any
`[A-Za-z0-9_-]+` segment, so it misclassifies reserved navigation segment
`list` as external id `acm/problem/list`. `resolveDomesticRoute` then sees two
identities and returns `null` before the content runtime can emit E3.

### 2.5 Causal RED

The live sanitized shape was reproduced in pure tests. The focused command:

```powershell
npx vitest run --config vitest.config.ts \
  tests/unit/extensionDomesticOjAuth.test.ts \
  tests/unit/extensionPlatforms.test.ts --no-file-parallelism
```

reports `267 passed, 3 failed` for the intended reasons:

* global `/acm/problem/list` navigation plus the exact pilot breadcrumb returns
  `null` instead of the pilot identity;
* `/acm/problem/list` alone is fabricated as a DOM problem identity;
* URL-only detection also fabricates `/acm/problem/list` as a problem.

The earlier unproven `/acm/problem/319811` alias-precedence hypothesis was
withdrawn after review and is not part of the implementation contract.

## 3. Proven failure model

The defect is lexical route classification, not a legitimate identity
ambiguity. `/acm/problem/list` is the global problem-list route, not a problem
identity. Rejecting that exact reserved route removes a false candidate before
the unchanged exactly-one identity map evaluates the result page.

The repair invariant is:

* exact reserved route `/acm/problem/list` (with the already-normalized optional
  trailing slash form) is never a NowCoder problem identity from URL or DOM;
* no pilot identity receives precedence over a legitimate generic identity;
* zero approved pilot anchors, two distinct approved contest identities,
  malformed/hidden/non-leaf/spoofed anchors, or any unsafe route remain
  fail-closed;
* generic-only authenticated-characterization detection remains available as
  historical DOM evidence, but the network policy continues to reject it.

## 4. Scope

### Allowed production scope

* `extension/src/platforms.ts`
* a new small pure NowCoder result-identity helper under
  `extension/src/adapters/nowcoder/` only if review shows it is clearer and
  safer than a route-owned branch in `platforms.ts`

### Allowed tests and evidence

* `tests/unit/extensionDomesticOjAuth.test.ts`
* `tests/unit/extensionPlatforms.test.ts`
* the smallest relevant content-runtime/flow test only if needed to prove the
  exact E3 message boundary
* existing NowCoder production-dist synthetic E2E fixture/tests, extended only
  with sanitized anchor shapes
* this plan, the Task21 report, a repair closeout report, and
  `work/handoff-current.md`

### Explicit non-goals

* no change to `NOWCODER_PROBLEM_ID` or NowCoder E1/E2/E3 network policy;
* no support for arbitrary `acm/problem/<id>` network capture;
* no LeetCode, AtCoder, Codeforces, or Luogu behavior change;
* no manifest permission, host permission, storage key, protocol, API, schema,
  migration, bundle, timer, polling, retry, or wall-clock change;
* no body, code, statement, request/response body, headers, cookies, tokens,
  account identity, language, runtime, memory, or hidden DOM evidence;
* no relaxation of exact host, HTTPS, credential, port, query, hash, visible
  leaf-title, stable submission id, chronology, or exactly-once gates;
* no reuse of the failed candidate's dist hashes or real observations as proof
  for a repaired candidate.

## 5. Required test contract

Before production code, the RED suite must cover all of the following:

1. exact route + one approved pilot anchor + final verdict resolves the pilot;
2. exact route + global `/acm/problem/list` navigation + one approved pilot
   breadcrumb resolves only the pilot;
3. `/acm/problem/list` alone is rejected by URL-only and DOM detection;
4. exact route + two conflicting generic aliases remains fail-closed;
5. exact route + malformed, hidden, nested, spoofed-host, credentialed, query,
   hash, or non-HTTPS anchors remains fail-closed;
6. generic `acm/problem/319811` authenticated-characterization behavior stays
   unchanged and cannot satisfy the network policy;
7. final verdict extraction remains restricted to `.coder-cont-legend`;
8. the resulting runtime candidate carries the exact pilot identity and public
   submission id without new fields;
9. one matching durable E2 plus that E3 produces exactly one bundle; absent or
   mismatched E2 produces none;
10. restart, duplicate document mutation, and duplicate E3 remain idempotent.
11. a stray pilot anchor plus a legitimate generic current-problem anchor
   remains ambiguous and cannot create a pilot candidate or consume a pilot E2;
12. duplicate approved anchors preserve deterministic title/dedupe semantics,
   while distinct contest identities remain fail-closed;
13. the production-dist flow covers ready → runtime candidate → matching E2 →
   exactly one E3/bundle, plus missing/wrong identity, repeated mutation,
   reload, and worker-restart negatives.
14. `/acm/problem/list/` follows existing trailing-slash normalization and is
    rejected; near-miss `listing`, `list-1`, and `List` retain the current
    case-sensitive generic-id behavior.
15. `www.nowcoder.com/practice/list` remains unchanged because the reserved
    segment rule applies only to `acm/problem` identities.

The production change may begin only after the intended RED fails for the
intended reason and every pre-existing control remains green.

## 6. Implementation design

The smallest approved design candidate is a shared pure NowCoder ACM problem-
segment validator used by URL-only and DOM-anchor resolution:

1. Preserve the existing `[A-Za-z0-9_-]+` problem-id grammar.
2. Reject exact reserved segment `list` before constructing an external id.
3. Keep the existing first-party, visible, leaf-only, safe-title boundary.
4. Keep the existing exactly-one identity rule unchanged.
5. Keep broad-page pilot + legitimate generic combinations fail-closed; never
   prefer a pilot pathname merely because it is accepted by network policy.
6. Retain generic `acm/problem/319811` DOM characterization while its network
   E2/E3 policy remains rejected.
7. Never infer identity from title or widen `NOWCODER_NETWORK_POLICY`.

The implementation must remain pure, deterministic, DOM-read-only, and free of
`chrome.*`, storage, network, timers, and wall clock.

## 7. Execution sequence

### Task 0 — evidence freeze

* Finalize the Task21 failure report with the user-supplied post-E3 popup.
* Record the exact focused RED command and failure.
* Confirm no production file changed and the default database metadata remains
  at its established baseline.

### Task 1 — capture-disabled first-divergence gate

This is a mandatory external-evidence gate before any production edit or
implementation authorization.

1. Keep the failed Task21 report, isolated database, and exact candidate
   evidence unchanged.
2. Disable extension capture before reopening the already-known exact public
   result URL for submission `84438785`. Do not submit, reload repeatedly,
   retry delivery, clear extension state, or inspect browser storage.
3. Observe only the exact result route, the count and pathname category of
   visible leaf first-party problem anchors accepted by the existing parser,
   the minimum non-sensitive ancestor/tag/class context needed to distinguish
   a current-result anchor from navigation/recommendation/footer links, and the
   narrow final verdict container. Do not retain raw HTML, screenshots
   containing account identity, unrelated labels/classes, titles beyond the
   accepted leaf labels, source code, problem text, cookies, tokens, headers,
   or request/response data.
4. Reproduce those sanitized scalars in the pure unit boundary and record the
   actual `detectProblemFromPage` / exact-result result.

Task 1 is complete. The resolver is the first divergent layer and the exact
reserved navigation route is the false identity. Task 2 must re-review this
revised evidence and RED before any production edit.

### Task 2 — independent entry review

Obtain three independent verdicts:

* plan review: causal scope, invalidation, and phase ordering;
* code-boundary review: whether the RED isolates a legitimate route-owned
  identity defect without weakening ambiguity protection;
* privacy review: evidence minimization and absence of identity-bearing
  diagnostics or new data collection.

Any `REJECT` blocks production implementation. Revise the plan/RED and repeat
the rejected lane.

Task 2 result after the capture-disabled evidence and revised RED:

* plan review: `APPROVE`, no HIGH or MEDIUM findings;
* code-boundary review: `APPROVE` subject to the exact/near-miss/flow tests in
  this plan;
* privacy review: `APPROVE`, with the evidence whitelist and no account-path
  retention as continuing conditions.

### Task 3 — test-first implementation

* Extend the RED with the remaining negative and flow cases.
* Run it and retain the intended failure.
* Implement the smallest shared exact-reserved-segment rejection in the
  NowCoder URL and DOM problem-id parsers.
* Do not touch network policy or other platform branches.

Task 3 result:

* expanded RED: 272 passed / 8 intended failures;
* implementation: a shared ACM-problem-only predicate rejects exact lowercase
  `list` in URL and DOM parsing;
* `practice/list`, `listing`, `list-1`, `List`, legitimate generic identities,
  and the NowCoder network policy remain unchanged;
* Task5 and Task6 synthetic result HTML now contains the real global list plus
  pilot breadcrumb shape.

### Task 4 — focused validation and review

Run at minimum:

```powershell
npx vitest run --config vitest.config.ts \
  tests/unit/extensionDomesticOjAuth.test.ts \
  tests/unit/extensionPlatforms.test.ts \
  tests/unit/extensionContentRuntime.test.ts \
  tests/unit/extensionNowCoderNetwork.test.ts \
  tests/unit/extensionVerdictCandidateFlow.test.ts \
  tests/unit/extensionContentIngress.test.ts --no-file-parallelism
npm run typecheck
npx eslint <changed production and test files>
node scripts/audit-v4-extension-privacy.mjs
$env:GIT_MASTER='1'; git diff --check
```

Then obtain independent code and privacy `APPROVE`. No browser action occurs
before these gates pass.

Task 4 command results before independent post-implementation review:

* six focused unit files: `406/406` passed;
* `npm run typecheck`: passed;
* targeted ESLint on six changed production/test files: passed;
* `node scripts/audit-v4-extension-privacy.mjs`: `PASS (0 findings)`;
* `git diff --check`: passed, with only working-copy LF→CRLF warnings.

Production build/dist, extension E2E, full quality gate, candidate validator,
database migration, and fresh real observations have not run yet.

Post-implementation review result:

* code review: `APPROVE`, no HIGH or MEDIUM findings;
* privacy review: `APPROVE`, consistent with audit `0 findings`.

### Task 5 — candidate reset and D3 refreeze

Because `platforms.ts` is runtime code, the repair invalidates candidate
`4e7a47b...`, its dist hashes, and both Task21 real observations.

Before any Git commit, obtain explicit user authorization to commit the
reviewed repair and new candidate lineage. Review approval is not a substitute
for that authorization.

That authorization was received on 2026-08-11. Task 5 may now execute; it does
not authorize a push, D4 retry before the new freeze, or any broader repair.

* Commit the reviewed repair locally.
* Run `npm run quality:gate` using the repository's disposable-database path.
* Freeze a new candidate commit under the existing exact candidate validator.
* Run `node scripts/validate-v4-candidate.mjs --candidate <new-sha>`.
* Record exact manifest/background/content/popup/bridge hashes and default DB
  metadata preservation.
* Load only the new exact dist in a fresh extension instance and fresh isolated
  database state.

#### Task 5 execution stop — 2026-08-11

The reviewed repair was committed locally as
`6aa750c0ad5db6e90d9681bcef08111fc1cb3929`. The first full
`npm run quality:gate` reached extension E2E after root unit `2387/1` and
extension unit `1582/1582`, then failed with `46 passed / 7 failed / 1 skipped`.
All seven failures were the same Playwright fixture error at
`fixtures.ts:87`: `Target page, context or browser has been closed`; no
capture, protocol, NowCoder, or database assertion failed.

An independent failure-contract review authorized one controlled isolated
`npm run extension:e2e` diagnostic and required a stop if the same context
close recurred. The diagnostic passed both modified NowCoder Task 5/6 chains
and finished `52 passed / 1 failed / 1 skipped`; the only failure was the same
fixture error in B3 lifecycle A. Therefore no third retry, candidate ownership
commit, exact candidate validator, or dist freeze is authorized under this
revision. Default database metadata remained exactly `479232` bytes and
`2026-07-23T15:56:38.8411343Z`; port 3000 and repository browser processes were
clean after teardown.

Task 5 now requires a separately reviewed fixture/Chromium lifecycle diagnosis
and plan revision with a RED before any test-infrastructure change. Candidate
`4e7a47b...` remains invalidated by the runtime repair, while `6aa750c...` is a
reviewed repair commit but is not an immutable D3 candidate.

### Task 6 — fresh D4 observations

Run both active policies again on the same new SHA:

1. LeetCode same-problem/same-verdict regression;
2. NowCoder exact approved pilot `acm/contest/18839/1001`.

Each must prove exactly one E2, E3, bundle, POST, ACK, four events, one session,
one attempt, and zero residual waiting/outbox/quarantine. Re-run the blocked-
platform readiness/drift checks without submissions.

On any failure, stop under the same failure protocol; do not retry, reload,
clear state, add polling, extend timeouts, or weaken chronology.

### Task 7 — D5 only after D4 PASS

D5 F1–F4 may start only when both fresh active-policy observations and the
blocked-platform checks pass on the same immutable candidate. D5 remains an
independent authorization/review phase and is not implied by this plan.

## 8. Acceptance

Engineering repair is complete only when:

* all required RED/negative/flow tests pass;
* focused tests, typecheck, targeted lint, privacy audit, extension gates,
  production build, full quality gate, and exact candidate validator exit `0`;
* independent plan, code, and privacy reviews all return `APPROVE`;
* the default database is byte/mtime preserved;
* a new immutable candidate and exact dist hashes are recorded;
* fresh LeetCode and approved-pilot NowCoder observations both pass exactly
  once on that same candidate;
* blocked-platform policies remain unchanged and fail-closed.

Even then, the result is D4 engineering evidence only. It is not user
acceptance, RC, release, or public certification.

## 9. Stop conditions

Stop and return to evidence/plan review if:

* live evidence disproves the dual-anchor hypothesis;
* the repair requires generic NowCoder network support;
* more than the allowed production scope changes;
* any privacy, manifest, protocol, schema, permission, chronology, or polling
  boundary would change;
* a new candidate cannot reproduce both active-policy observations exactly
  once.

## 10. Revision 2 — extension-worker waiter lifecycle repair (review required)

### 10.1 Evidence-backed cause

The repeated D3 failures are consistent with an orphaned Playwright event
waiter, not a production-extension assertion failure. In
`tests/extension-e2e/fixtures.ts`, `extensionWorker` checks
`context.serviceWorkers()[0]` before `wakeExtensionServiceWorker` opens
`chrome://extensions/`. That page can start the unpacked extension worker while
the extension id is being discovered. The helper then creates
`context.waitForEvent("serviceworker")`, opens the popup, and returns through
`context.serviceWorkers()[0] ?? await started`. When the worker already exists,
the nullish branch bypasses `await started`; the pending waiter remains attached
until context teardown, where it rejects with the exact observed
`Target page, context or browser has been closed` error.

This explains all observed boundaries:

* the failure always points to the waiter creation line rather than a capture
  assertion;
* the failing test moves between runs because the orphan rejection is tied to
  worker-start timing;
* later tests and both modified NowCoder chains can still pass;
* Windows Application/WER logs contain no Chromium crash for the two runs;
* Playwright uses one worker and zero configured retries, so no hidden retry
  generated this result.

### 10.2 Narrow repair boundary

This revision may change only the extension E2E worker-start fixture, its pure
unit proof, the candidate ownership list/test, and the current plan/report/
handoff evidence. It must not change production extension code, platform
identity policy, Playwright retry count, timeouts, permissions, storage,
network policy, API, database schema, or any D4 chronology rule.

Refactor worker startup behind a small injected helper that follows one closed
sequence:

1. after extension-id discovery, synchronously re-read the current worker;
2. if it exists, return it without creating an event waiter;
3. otherwise register exactly one waiter before opening the popup;
4. save the waiter first, then use the semantic equivalent of
   `await Promise.all([waiter, openPopup()])` so popup failure cannot leave an
   unhandled pending rejection;
5. return the exact worker delivered by the event.

Do not add an automatic test retry. A business assertion failure must remain a
hard failure, and an infrastructure failure must still be visible. Do not use
`Promise.race`, do not re-read `serviceWorkers()` after popup navigation to
short-circuit the waiter, and do not leave either branch unattached to the
handled composite.

### 10.3 Required RED before implementation

Add a pure test with injected `readExisting`, `waitForStarted`, and `openPopup`
effects. It must initially fail against the current helper and prove:

* a worker that appears during id discovery is returned without calling
  `waitForStarted` or leaving a rejectable waiter;
* when no worker exists, the waiter is registered before `openPopup` and is
  awaited exactly once;
* popup rejection and waiter rejection are both handled by the returned
  composite Promise, with no unhandled rejection after simulated teardown;
* the helper cannot return a different/stale worker and has no timer, retry,
  Chrome storage, DOM, network, or wall-clock dependency.

The RED command and exact failing assertions must be recorded before editing
the fixture.

### 10.4 Validation and stop rule

After independent plan approval and explicit authorization for this new test-
infrastructure scope:

1. implement only the helper/fixture change;
2. run its focused RED-to-GREEN test, typecheck, targeted ESLint,
   `git diff --check`, and the privacy audit;
3. obtain independent code review;
4. run one `npm run extension:e2e`; any context-close or business failure stops
   the revision without another retry;
5. if green, run one full `npm run quality:gate`;
6. add only the reviewed paths to the candidate ownership validator and its
   unit proof, commit the candidate, then run the exact candidate validator;
7. freeze hashes and resume Task 6 only after the validator exits `0` on a
   clean immutable HEAD.

Revision 2 is a proposal until independently reviewed and explicitly
authorized. Its presence does not authorize implementation or convert
`6aa750c...` into a candidate.

Independent plan review on 2026-08-11 returned `APPROVE` with no HIGH or
MEDIUM findings. The review confirmed the orphan-waiter causal chain, RED
boundary, no-retry rule, and D3 stop contract. This approval does not replace
explicit authorization for the new fixture/test-infrastructure scope.

### 10.5 Revision 2 execution and D3 close — 2026-08-11

The standing Commander authorization to enter D3 was applied only to this
approved fixture scope. The pure lifecycle RED failed `2/5` as specified, then
passed `5/5`; typecheck, targeted ESLint, privacy `0 findings`, and diff-check
passed. Independent final code review returned `APPROVE` with no HIGH or
MEDIUM findings.

The one permitted standalone extension E2E run passed `53/1`. The following
full quality gate passed root `2392/1`, app E2E `25/25`, extension unit
`1587/1587`, extension E2E `53/1`, and build `20/20`. The fixture repair is
commit `d8363035700241dc41217238a7583f3b89697881`.

Candidate ownership commit
`a911425a415db2ee374430ced62edcaa7b786866` passed the exact validator with
root `2393/1`, app E2E `25/25`, extension unit `1587/1587`, extension E2E
`53/1`, build `20/20`, privacy `0 findings`, readiness `PASS`, clean pre/post
identity, and preserved default database metadata. Exact dist hashes and the
receipt are in
`work/reports/v4-phase-d-task22-nowcoder-repair-refreeze-2026-08-11.md`.

D3 is complete for this candidate. Task 6 fresh same-SHA D4 observations are
the only next phase; no D4 observation from `4e7a47b...` transfers forward.

### 10.6 Task 6 same-SHA D4 close — 2026-08-11

The exact build from immutable candidate
`a911425a415db2ee374430ced62edcaa7b786866` was loaded once as unpacked
extension `ajomjghlnpajbhbemihagpcehgffkihf` and paired to a fresh isolated
database. Three older extension installations were visibly disabled.

LeetCode fresh submission `cn/741526004` closed the same-problem / same-verdict
regression with one POST, four events, one session, one attempt, and zero
post-ACK queues. The approved NowCoder pilot then closed with fresh accepted
submission `84444687`, one additional POST, four additional events, one
additional session, one additional attempt, and zero post-ACK queues. The
user-visible popup recorded final last sync
`2026-08-11T08:12:10.578Z`, waiting `0`, outbox `0`, quarantine `0`, and no
blocking diagnostic.

An earlier NowCoder submission `84444621` is explicitly excluded because the
problem tab predated extension installation and therefore had no E0 click
listener; its popup remained at waiting `0` and produced no local POST or
SQLite row. No runtime repair, extension reload, or candidate change resulted.
The same page was then freshly loaded under the existing extension before the
valid observation.

Blocked-platform readiness passed and the focused drift suite passed 292/292
without AtCoder, Codeforces, or Luogu submissions. Candidate-to-HEAD runtime
diffs remained empty, all five exact-dist hashes matched the D3 receipt, and
the default database remained 479232 bytes with LastWriteTimeUtc
`2026-07-23T15:56:38.8411343Z`.

The authoritative evidence is
`work/reports/v4-phase-d-task23-same-sha-observations-2026-08-11.md`. D4
engineering observation is complete. D5 F1-F4 independent review is the only
next phase. This is not user acceptance, an RC, or a release.

### 10.7 Revision 3 — contemporaneous D4 stage-evidence completion (review required)

Independent F1 plan review rejected the Task 6 closeout on 2026-08-11. The
final LeetCode and NowCoder deliveries are real and remain useful evidence,
but the observation record does not independently preserve, for each active
policy, the master plan's required browse-only negative state, E1 state with
waiting unchanged, and E2 state with waiting incremented exactly once. The
final popup and SQLite rows cannot be used to reconstruct those missing
contemporaneous observations. Section 10.6 is therefore historical evidence
of final delivery, not an authoritative D4 PASS. D5 is stopped and its F2/F3
approvals are provisional only; all F1-F4 reviews must be rerun after D4
actually closes.

This revision authorizes no production change. The immutable implementation
candidate, exact extension artifact, manifest, adapter/runtime protocol,
storage schemas, API, database schema, platform policy, permissions, and
network behavior remain frozen. In particular, it must not change
`NOWCODER_PROBLEM_ID`, add a blocked-platform submission, or load another
unpacked extension into the user's regular Chrome profile. The existing
extension id `ajomjghlnpajbhbemihagpcehgffkihf` remains the user's regular-
Chrome observation copy.

The proposed repair is an observation-harness-only change to
`scripts/v4-live-observation.mjs`, optional pure helpers under `scripts/**`,
and focused tests under `tests/unit/**`. No helper may live under or be
imported by `extension/**`; the revision may not modify `extension/**`, the
manifest, build scripts, candidate validator, protocol, or generated dist.
After any harness commit, the exact candidate-to-HEAD diff must prove
`extension/**`, `extension/manifest.json`, `extension/build.mjs`, and
`scripts/validate-v4-candidate.mjs` unchanged. The harness may launch a
disposable visible Playwright Chromium profile with
the already-frozen exact dist, but it must not inspect or export cookies,
tokens, code, problem statements, response bodies, headers, raw URLs, or DOM
content. A separate Playwright profile/extension id is test infrastructure,
not a replacement installed in the user's regular Chrome; if a reviewer
considers this distinction insufficient or candidate-invalidating, the
revision stops before implementation.

The harness contract is:

1. accept an explicit exact-dist path and verify all five D3 artifact hashes
   before opening a platform page and again in the final evidence block;
2. support only `leetcode.cn` and the approved NowCoder pilot
   `acm/contest/18839/1001`; generic NowCoder identities and all blocked
   platforms remain fail-closed. Require an explicit `--problem-id` before
   launch; NowCoder accepts only that exact pilot id, while LeetCode binds the
   user-selected slug. Every E2 confirmed record must equal the requested
   platform/problem before the reducer advances;
3. record a browse-only baseline proving no new E1, confirmation, waiting,
   outbox, quarantine, POST, session, attempt, or error;
4. open `chrome-extension://<id>/popup.html` as a normal, continuously alive
   extension page in the disposable context, install its listener before the
   platform page is opened, and emit `observer_armed` only after both local
   and session `chrome.storage.onChanged` subscriptions plus the initial safe
   snapshot are active. The extension page must remain open through ACK;
   service-worker suspension must not own or terminate the observer. Closing,
   navigating, or losing that page is terminal. The listener then serializes
   the first valid E1, E2, E3/outbox, and ACK stages in order so short-lived
   consecutive changes cannot be lost to interval polling;
5. at the callback entrance, first read only `areaName` and changed key names. The
   exact local trigger allowlist is `confirmedSubmissions`,
   `confirmedSubmissionTombstones`, `captureOutbox`, `captureQuarantine`,
   `lastCaptureError`, and `lastSuccessfulCaptureAt`. The exact session trigger allowlist is
   `uiHints`, `transientE1`, `transientPageContexts`,
   `transientUnmatchedE3`, `transientVerdictCandidates`,
   `transientAmbiguityDiagnostics`, `contentIngressReady`,
   `contentIngressDiagnostics`, and `leetcodeEndpointDiagnostics`. A callback
   containing any other key — including `captureCredential`,
   `captureEndpoint`, pairing fields, or an unknown key — records only fixed
   `observer_storage_key_rejected` and terminates the run; it must not inspect
   or serialize that key's old/new value, even when a safe key changed in the
   same callback. Only after every key in the callback passes this gate may
   the observer read that approved key's `newValue` (never `oldValue`) through
   the same key-specific closed projector described below. It updates a cached
   projected snapshot synchronously from each callback and emits that exact
   transition before handling the next callback; this exception exists solely
   to prevent asynchronous `storage.get` calls from coalescing short-lived
   E1/E2 stages;
6. the initial arm snapshot uses exact-key `chrome.storage.local.get` /
   `session.get`; never use `get(null)` or the full popup state. After arm,
   callback `newValue` projections update the cache and no asynchronous full
   snapshot read is used for stage ordering. Projection may inspect only:
   array cardinality
   for outbox, quarantine, session E0/E1/E3/candidate/diagnostic keys; the
   closed confirmed-record fields `schemaVersion`, `status`, `platform`,
   `problemExternalId`, `externalSubmissionId`, `confirmedAt`, `storageKey`,
   `lastE3At`, optional `phase`, optional `finalizedAt`; tombstone fields
   `submissionKey`, `finalizedAt`, `expiresAt`; canonical
   `lastSuccessfulCaptureAt`; and a `lastCaptureError` accepted by the
   existing fixed privacy allowlist. Unknown record fields, malformed values,
   raw endpoint/request data, credential/cookie/body/header/token/code fields,
   and nested unknown fields produce only fixed `observer_value_rejected` and
   terminate. For outbox/quarantine and all session arrays, only `Array.isArray`
   and `.length` may touch `newValue`; entries are never traversed. A deleted
   approved key (`newValue === undefined`) projects to its empty/default state.
   `lastCaptureError` may be projected only through the existing fixed privacy
   allowlist for terminal reporting; initial arm, browse-only, every E1/E2/E3
   callback stage, and ACK all require it to be absent. Any nonempty allowed
   error immediately emits fixed `observer_capture_error` and terminates; no
   later state or database change can convert that run to PASS;
7. retain only closed scalar summaries: platform, approved namespaced problem
   identity from a strictly parsed confirmed record, confirmation/finalization
   timestamps, array counts, fixed diagnostics, exact hashes, and SQLite
   counts. E1 is represented only by a `transientE1` cardinality transition;
   request id, document id, endpoint key, and request fields are not exported.
   No pairing credential value or other secret may enter logs/evidence;
8. prove E1 leaves waiting unchanged and E2 increments waiting exactly once
   only for the explicitly requested platform/problem. E3 may advance only
   when that same confirmed record has gained a canonical `finalizedAt`, its
   matching tombstone is new, and outbox is exactly one; missing/noncanonical
   finalization, different identity, or any ordering inversion is terminal.
   ACK then drains outbox/quarantine,
   advances canonical `lastSuccessfulCaptureAt`, and grows SQLite by exactly
   four events, one session, and one attempt. The observer neither reads nor
   emits `lastDeliveredAttemptId` or `lastDeliveredAttemptStatus`;
9. fail closed on missing, duplicate, out-of-order, or cross-problem stage
   transitions and on any hash drift. The observation harness intentionally
   does not read/export document ids and therefore does not independently
   claim cross-document continuity; that invariant remains enforced by the
   frozen candidate and its exact automated coordinator/runtime tests. Any
   live report must distinguish that automated invariant from the observed
   stage evidence rather than overclaiming a document-level observation;
10. require an explicit `--database-path` equal to the running server's
   `.tmp/server-db-path.txt`, require the resolved path to remain under the
   repository `.tmp` observation root, and require capture events, training
   sessions, and training attempts all equal zero before arming. Use a fresh
   isolated database directory and disposable profile for each platform; an
   existing nonzero database is terminal and cannot be rebased as a baseline.
   Profile authentication is a user-controlled prerequisite; the harness may
   display the browser but may not read credential stores or automate login;
11. require action-time user confirmation immediately before every real
   platform submission. Standing or earlier consent is not substituted for
   that confirmation;
12. preserve default-database length and `LastWriteTimeUtc`, produce no raw
    transcript, and delete no user profile or platform data.

Before implementation, focused RED tests must prove: listener registration
and `observer_armed` precede navigation/submission; a persistent extension
page, not the MV3 worker, owns observation through simulated worker loss;
closing/navigating the page is terminal; ordered short-lived consecutive
submit-E1→status-E1→E2→E3→ACK changes are retained; multiple monotonic E1
cardinality increases before E2 are legal but an E1 decrease, post-E2 E1, or
duplicate E2 is rejected; a deferred initial/read simulation proves callback
`newValue` caching cannot coalesce adjacent stages; browse-only remains zero; duplicate or
out-of-order stages fail closed; callback batches containing credential,
cookie, body, endpoint, unknown nested data, or any other unapproved key emit
only the fixed rejection and do not serialize values (including when a safe
key is simultaneous). The injected page function must use hostile getters for
unknown-key `newValue`, approved-key `oldValue`, and a mixed safe/unknown
batch: unknown/mixed getters are triggered zero times before fixed rejection,
and an approved key may read only its `newValue`. Malformed/extra confirmed
fields fail closed; every initial/intermediate/ACK stage gets a nonempty fixed
`lastCaptureError` negative; E3 gets missing, wrong-identity, noncanonical,
and out-of-order `finalizedAt` negatives;
outbox/quarantine values are counted without entry traversal; the injected
`persistentObserverEntrypoint` itself (not only a pure controller) is exercised
with a fake global `chrome.storage.onChanged`; popup exact-URL navigation,
query/hash navigation rejection, page close, and service-worker loss are
covered; exact-dist hash
drift stops before navigation; and the NowCoder target cannot accept
`acm/problem/319811`. The RED command and exact failures must be recorded
before editing observation tooling.

After independent plan approval, implement only the reviewed harness/helper
paths, then run focused RED-to-GREEN tests, typecheck, targeted ESLint,
privacy audit, and `git diff --check`. Obtain independent code/privacy review
before any live run. A live run stops on the first business or tooling
failure; it must not silently retry a submission. When both active policies
have complete same-SHA stage evidence, update the Task 23 report with the
pre-action and repeated final hashes, correct all current-status documents,
rerun readiness/privacy/full quality gates, and then rerun F1-F4 from scratch.

Independent plan review on 2026-08-11 returned `APPROVE` with no HIGH or
MEDIUM findings after two initial HIGH gaps were corrected: the observer is
owned by a continuously alive extension page rather than the MV3 worker, and
the storage callback/snapshot boundary now has exact key and field allowlists.
The review also confirmed that implementation is isolated to `scripts/**` and
`tests/unit/**`, so it does not invalidate candidate `a911425...` or its exact
dist. This approval authorizes only the reviewed harness/test implementation;
it does not authorize a live submission, D4 PASS, D5 completion, RC,
acceptance, release, push, PR, or deployment.

### 10.8 Revision 3 first implementation review and Revision 3.1 stop

The first implementation passed its seven focused tests, typecheck, targeted
ESLint, privacy audit with zero findings, syntax checks, and candidate-runtime
isolation. Independent code/privacy review nevertheless returned `REJECT` with
two HIGH findings and two MEDIUM findings before any live run:

* the reducer rejected the approved NowCoder pilot's normal second (status)
  E1 after its submit E1;
* asynchronous exact-key `storage.get` after each callback could still observe
  a later merged state and lose the short-lived transition the harness exists
  to preserve;
* popup query/hash navigation was not terminal because the URL check used
  prefix matching;
* tests did not exercise the injected page function, two-E1 protocol,
  coalescing race, exact popup navigation, or worker-loss independence.

No browser or database live observation was attempted. Revision 3.1 narrows
the only new privacy authority to approved-key `newValue` projection after the
entire callback key set passes the no-value key gate. Unknown-key callbacks
remain rejected before any value access; `oldValue` is never read; allowed
array entries remain untraversed except for the already enumerated strict
confirmed/tombstone record projectors. Revision 3.1 requires a fresh
independent plan/privacy review before any implementation correction.

The first Revision 3.1 review returned `REJECT` with one MEDIUM privacy gap:
`lastDeliveredAttemptId` and `lastDeliveredAttemptStatus` were unnecessary and
lacked a closed projection. They are now removed from the trigger, snapshot,
and output contract. ACK proof uses only queue cardinalities, canonical
`lastSuccessfulCaptureAt`, and exact SQLite deltas.

### 10.9 Revision 3.2 second implementation review stop

The second independent code/privacy review again returned `REJECT` before any
live run. It found three HIGH and two MEDIUM gaps: nonempty fixed
`lastCaptureError` did not stop the reducer; the reducer did not bind E2 to an
explicit requested platform/problem and the plan overclaimed independent
cross-document proof despite forbidding document-id collection; an arbitrary
nonzero existing database could be used as baseline; the injected observer
needed direct unsafe-getter tests; and E3 did not require the matching
confirmed record's `finalizedAt`.

Revision 3.2 adds explicit problem binding, zero-only explicit disposable DB
entry, error-free gates at every stage, finalized-record E3 proof, and injected
function getter REDs. It deliberately does not expand evidence to document
ids. Candidate document continuity remains an automated frozen-runtime
invariant, not a new live-observation claim. Revision 3.2 requires independent
plan/privacy approval before implementation correction and does not authorize
a live run.

### 10.10 Revision 3.2 pre-action live failure and Revision 4 review gate

Revision 3.2 implementation reached 23/23 focused tests, typecheck, targeted
ESLint, privacy audit `0 findings`, `git diff --check`, and an independent
code/privacy `APPROVE`. The database validator rejects lexical/canonical
escape, junction/symlink path components, cross-volume containment, and any
nonzero business-table baseline at observer arm. Candidate runtime, manifest,
validator, and exact dist remained unchanged.

The first LeetCode live attempt stopped before any submission. A fresh profile
and fresh zero-row isolated database armed at `transientE1=0`; merely navigating
to the explicit `merge-two-sorted-lists` problem changed the raw
`transientE1` array cardinality to one. The harness correctly rejected the
changed browse-only state, closed the disposable browser, preserved zero API
and SQLite delivery, and wrote
`output/playwright/v4-observation/leetcode-real-observation-failed-1786441821102.json`.
Pre-action and final exact-dist hashes were identical. This run used no submit
action and therefore consumed no action-time submission authorization.

The observed array count cannot identify that request, so the live evidence
does not claim an endpoint. Source inspection provides the bounded causal
hypothesis: the frozen network observer persists every owned normalized E1,
and an ordinary LeetCode `/graphql` request normalizes to the coarse
`graphql` endpoint, while submit-epoch STARTED delivery is restricted to the
exact `leetcode/submit/<scope>/<slug>` prefix. Revision 3.2's cardinality-only
projection cannot distinguish unrelated browse E1 from the explicit target's
submit E1. This is an observation-contract defect; it is not authority to
change the frozen candidate.

Revision 4 is review-required before implementation. Its only proposed
privacy expansion is a target-bound projector for `transientE1` entries:

1. validate top-level lifecycle / UI-hint wrappers and nested evidence key
   sets before reading any values;
2. for E1 read only fixed `schemaVersion`, `tier`, `kind`, `platform`,
   `endpointKey`, `method`, `resourceType`, and `lifecycle`; for E0 read only
   fixed `schemaVersion`, `tier`, `kind`, `platform`, and
   `problemExternalId`. Each value is checked against a closed enum or the
   explicit target. `lifecycle` is validation-only and must never remove or
   recount a retained request when it advances;
3. never read or export `requestId`, `tabId`, `frameId`, `documentId`, raw URL,
   timestamps, adapter version, evidence id, redirect endpoint, or status;
4. output only target-relevant cardinalities, never endpoint strings or raw
   entries. A matching UI hint is the explicit requested platform/problem.
   LeetCode E1 is only exact `leetcode/submit/cn/<explicit-slug>` POST XHR.
   `graphql` is always non-target noise: E0 does not promote it, and the
   observer never outputs it. If the real submission produces no exact target
   endpoint, the observation terminates as a platform/contract failure rather
   than widening causality in the harness. NowCoder E1 is exact
   `nowcoder/submit` POST XHR followed by exact `nowcoder/status` GET XHR, both
   only after the approved-pilot E0 hint;
5. count matching **entries in the current `transientE1` array**; never build a
   tuple set or dedupe by `platform + endpointKey + method + resourceType`.
   The tuple is only the closed matching predicate. Frozen storage updates one
   request's lifecycle in place, so its matching entry count remains one;
   two distinct same-tuple requests remain two entries and are terminal.
   `lifecycle` and status never change membership. Require target E0 and target
   endpoint entry counts zero at browse-only. Target E0 may change only once,
   exactly `0->1`, before E1 and must remain one through ACK; a duplicate,
   decrease, wrong-target hint, or any post-E1 E0 change is terminal. Permit
   one LeetCode target E1 and the NowCoder submit/status pair before E2, and
   reject decreases, duplicate target entries, wrong ordering, post-E2
   increases, malformed records, and all target mismatch;
6. keep unrelated valid E1 records out of the target count without exporting
   their identity. Any unknown key or malformed value remains terminal.

Required REDs must include ordinary LeetCode GraphQL browse noise remaining
browse-only before and after E0, with no raw GraphQL value in evidence; exact
target direct submit advancing once; wrong slug/scope/method/resource type not advancing; NowCoder
matching E0 then submit/status advancing twice while wrong order rejects;
lifecycle updates not decrementing or double-counting; duplicate target
requests and post-E2 changes rejecting; and hostile getters proving
`requestId`, tab/frame/document ids, timestamps, adapter/evidence ids,
stable-submission/outcome fields, URL/query/body/header/token/code, and every
unknown field are never read or emitted. Generic E1 growth after a valid E1
must not fabricate a second submit stage. Existing callback ordering,
newValue-only, error, E2/E3/ACK, database, hash, and candidate-isolation tests
remain mandatory. Two same-tuple target entries must count as two and reject
without reading `requestId`; target E0 duplicate/decrease/post-E1 growth and a
same-request lifecycle update must each have explicit RED coverage.
Revision 4 may modify only the observation helper/harness/tests and this plan;
it must preserve candidate/runtime/dist isolation and receive independent
plan/privacy approval before implementation, then independent code/privacy
approval before another live run.

Two independent Revision 4 plan/privacy reviews returned `APPROVE` on
2026-08-11 after the GraphQL causal shortcut was removed and entry-count/E0
uniqueness invariants were made explicit. This authorizes only the described
RED-to-GREEN observation helper/harness/test implementation. A new independent
code/privacy review remains mandatory before another live browser run or any
action-time submission confirmation.

### 10.11 Revision 4 implementation and live-run gate

Revision 4 is implemented only in the observation helper, runner, and unit
tests. The target projection keeps raw session cardinalities fixed at zero and
the report path emits only closed target, confirmed/tombstone, queue, success,
error, and isolated-database fields. Valid GraphQL activity is always ignored;
submit/status-like near misses are terminal. Required wrapper/evidence keys are
checked for presence without reading forbidden identity or timestamp values.

The final regression covers both the pure reducer and one persistent injected
listener sequence: exact LeetCode E1, unrelated GraphQL growth, unchanged
`e1_observed`, then exact E2. Target `e1`/`submit` remain one, raw
`transientE1` remains zero, and serialized evidence contains no GraphQL value.
Commander-owned gates after the final change recorded:

```text
focused observer suite:       31/31 passed
npm run typecheck:            exit 0
targeted ESLint:              exit 0
privacy audit:                PASS, 0 findings
git diff --check:             exit 0 (CRLF conversion warnings only)
candidate isolation diff:     exit 0
```

Two independent final code/privacy reviews returned `APPROVE` with no HIGH or
MEDIUM findings. This closes only the Revision 4 pre-live implementation gate.
The next authorized action is one fresh, isolated, event-driven LeetCode
observation against candidate `a911425a415db2ee374430ced62edcaa7b786866`,
with separate action-time submission confirmation and immediate stop on the
first failure. It does not establish D4 PASS or authorize D5, RC, acceptance,
release, push, PR, or deployment.

### 10.12 Task 24 live failure and mandatory stop

The fresh Revision 4 LeetCode observation was armed on a new disposable
profile and a new isolated zero-row database against exact candidate
`a911425a415db2ee374430ced62edcaa7b786866`. After explicit action-time user
authorization, the user logged in inside that disposable Chromium and
submitted problem `merge-two-sorted-lists` once. The intentionally empty
solution produced public submission `cn/741573842` with final verdict
`Compile Error`. The verdict is a valid final platform outcome and is not an
excuse to discard the capture failure.

The extension popup then showed waiting `1`, outbox `0`, quarantine `0`, no
successful sync, and fixed diagnostic `epoch_started_missing`. The observer
stopped fail-closed with `observer_stage_rejected`; after the disposable
context closed it wrote
`output/playwright/v4-observation/leetcode-real-observation-failed-1786444988036.json`.
That receipt contains only the safe browse baseline, exact pre/final artifact
hashes, and SQLite `0/0/0`. All five hashes are unchanged. No retry, code edit,
timeout extension, fallback delivery, second submission, platform switch, or
database cleanup occurred.

This run is a real failed engineering observation. It is not E1/E2 stage
success evidence, does not complete D4, and does not authorize D5. Any later
platform submission requires a repaired and independently reviewed candidate,
a new exact dist, and fresh action-time confirmation.

### 10.13 Revision 5 — exact submit identity through GraphQL-result E2 (review required)

Static source inspection proves a production control-plane contradiction that
is sufficient to explain the fixed failure:

1. `sendLeetCodeSubmitEpochStarted` sends STARTED only for an exact
   `leetcode/submit/<scope>/<slug>` `before_request`, keyed by that submit
   request's `requestId`;
2. `selectLeetCodeResultConfirmation` currently returns the qualifying
   GraphQL request's `requestId` as `matchedSubmitRequestId`;
3. background sends CONFIRMED with that GraphQL identity; and
4. content runtime performs an exact epoch lookup and therefore returns
   `epoch_started_missing`, because no STARTED is ever emitted for GraphQL.

Existing adapter and flow tests currently lock the contradictory GraphQL ID.
This is not caused by the Revision 4 observer. The observer also has a bounded
failure-receipt gap: it preserves the last accepted stage rather than the
allowlisted error-triggering target/queue/DB projection. That gap obscures the
live branch but does not create the runtime mismatch.

Revision 5 is not yet authorized for implementation. Test-first work must
first establish these RED contracts:

1. reproduce the full control sequence where submit request `A` receives exact
   STARTED and a later GraphQL-result confirmation currently sends CONFIRMED
   for request `B`, yielding `epoch_started_missing` and no candidate/bundle;
2. require `selectLeetCodeResultConfirmation` to accept the bounded set of
   exact submit E1 candidates and return the unique same-platform/problem/
   tab/frame/document/method/resource/chronology submit request ID. `requestId`
   is the sole epoch identity. Lifecycle is validation-only: the current
   retained exact-submit entry must have a legal lifecycle, but lifecycle is
   never part of identity, membership, recency selection, or fallback. The
   same request may update in place from `before_request` to `completed`
   without losing eligibility or becoming a second entry. GraphQL may remain
   a corroborating result witness but must never become the epoch identity;
3. reject zero or multiple eligible submits, crossed problem/context,
   GraphQL-before-E0, submit/GraphQL/result chronology inversion, duplicate or
   conflicting lifecycle, stale windows, worker/restart ambiguity, and any
   post-E2 identity change. There is no latest-by-time fallback, retry,
   broadcast, request-body inspection, or E2 baseline synthesis;
4. prove exact target STARTED precedes persistence-complete CONFIRMED once,
   both use the same request ID, and Compile Error plus the existing accepted
   verdict path can produce at most one request-bound candidate. A mandatory
   RED must send STARTED for exact submit `A`, update the retained storage
   entry for the same `A` from `before_request` to `completed`, then prove the
   GraphQL-result E2 still returns only `A`; it must not report zero eligible
   submit and must not substitute GraphQL request `B`;
5. add harness-only REDs so a fixed allowlisted error receipt retains the
   triggering target counts, closed queue counts, and DB counts even when E1,
   E2, and error share one storage callback. It must not assert an order that
   the callback cannot prove and must not serialize raw session entries,
   GraphQL, endpoint strings, request/tab/frame/document identities,
   timestamps, URL/query/body/header/token/code, or database paths;
6. keep all unknown-key and hostile-getter gates fail-closed and preserve the
   one-failure/no-silent-retry rule.

The smallest proposed production repair is to make the exact submit E1 the
sole epoch identity for the existing GraphQL-result confirmation branch. It
may add only the minimum pure input/wiring necessary to pass the REDs; it must
not widen hosts, endpoints, permissions, storage schemas, verdict taxonomy,
confirmation windows, or blocked-platform behavior. If a real flow has no
unique exact submit E1, it remains fail-closed rather than treating GraphQL as
submit causality.

Any production edit invalidates `a911425...` and every observation tied to its
dist. After RED-to-GREEN and independent code/privacy/plan approval, the work
must return to D3: create a new immutable implementation candidate, run the
exact candidate validator/full gate, freeze a new exact dist and five hashes,
then restart both LeetCode and approved-pilot NowCoder D4 observations from
fresh profiles/databases. Historical deliveries remain historical only.

Revision 5 requires independent plan/privacy approval before any RED or
production implementation. Until then the only allowed work is documentation,
read-only inspection, and review. No live retry is authorized.

### 10.14 Revision 5 implementation checkpoint (D3 re-freeze pending)

Two independent plan/privacy reviews approved the Revision 5 contract before
implementation. The first production RED run recorded `118 passed / 6 failed`:
the GraphQL request ID was still returned as the epoch identity and zero/two
exact submit candidates were ignored. The failure-receipt RED separately
recorded `31 passed / 1 failed` because no bounded error projection existed.

The implementation now binds both LeetCode result-confirmation paths to one
clean exact submit lifecycle wrapper. Result, GraphQL, check, and submit
wrappers must be `pending` with no rejection reason; an identity-conflicting
same-request lifecycle is excluded before selection. GraphQL remains only a
corroborating witness. A shared persistence-before-delivery seam is called by
both production confirmation paths, and the exact delivery test proves that
CONFIRMED uses the same submit request ID as STARTED. No fallback, retry,
permission, host, storage schema, verdict taxonomy, or timing window changed.

The observer now emits a separate bounded failure receipt containing only the
fixed error, target cardinalities, closed queue cardinalities, and isolated DB
counts. It does not serialize stage/ACK claims or raw session entries and does
not read unknown-key values.

Latest pre-freeze evidence:

```text
focused production + observer regression: 261/261 passed
focused submit/control/flow regression:     137/137 passed
observer regression:                        32/32 passed
npm run typecheck:                          exit 0
targeted ESLint:                            exit 0
privacy audit:                              PASS, 0 findings
node --check observer scripts:              exit 0
git diff --check:                           exit 0 (CRLF warnings only)
code review:                                APPROVE, no HIGH/MEDIUM
privacy/failure-receipt review:             APPROVE, no HIGH/MEDIUM
```

The prior candidate `a911425...` is invalid for any post-repair observation.
No live retry is authorized yet. The next gate is candidate ownership proof, a
local implementation commit, full quality gate, exact candidate validation,
and five new frozen dist hashes.
