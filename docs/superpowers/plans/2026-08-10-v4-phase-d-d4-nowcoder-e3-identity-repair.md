# V4 Phase D D4 NowCoder E3 First-Divergence Investigation and Conditional Repair Plan

**Status:** `REPAIR COMMITTED — D3 REFREEZE BLOCKED by repeated Chromium context-close infrastructure failure; no new candidate`

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
