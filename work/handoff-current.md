# Current Handoff

## Status (2026-08-11 V4 Phase D D4 engineering observation PASS; D5 F1-F4 next)

The new immutable candidate is
`a911425a415db2ee374430ced62edcaa7b786866`. Its exact validator exited `0`:
root unit `2393/1`, app E2E `25/25`, extension unit `1587/1587`, extension E2E
`53/1`, production build `20/20`, privacy `0 findings`, readiness `PASS`, clean
pre/post identity, and preserved default-database metadata. The exact dist and
five hashes are frozen in
`work/reports/v4-phase-d-task22-nowcoder-repair-refreeze-2026-08-11.md`.

The candidate contains the reviewed exact `/acm/problem/list` reserved-route
repair and the test-only composite service-worker waiter repair. The latter
adds no retry or timeout and passed independent code review with no HIGH or
MEDIUM findings. D3 is complete. Fresh same-SHA D4 then passed on this exact
candidate/dist: LeetCode `cn/741526004` and approved-pilot NowCoder
`84444687` each produced exactly one POST, four events, one session, one
attempt, ACK, and zero final waiting/outbox/quarantine. The blocked-platform
readiness/drift lane passed 292/292 without submissions. Evidence:
`work/reports/v4-phase-d-task23-same-sha-observations-2026-08-11.md`. D5
F1-F4 is the only next phase. Nothing here is RC, acceptance, release, push,
PR, or deployment.

### Superseded Task21 failure context

The immutable repaired candidate is
`4e7a47bfc22fece4aa60e4bab2f4223668be480b`. It adds strict content-runtime
coverage for the real LeetCode.cn `/submissions/<digits>/` route, derives
identity only from one visible leaf `a.cursor-text[href]`, and preserves an
armed epoch across SPA navigation only when post-navigation detection proves
the exact same platform/problem identity. Null, ambiguous, unsupported, and
cross-problem navigation remain fail-closed.

Its exact candidate validator exited `0`: root unit `2372/1`, app E2E `25/25`,
extension unit `1567/1567`, extension E2E `53/1`, production build `20/20`,
privacy `0 findings`, readiness `PASS`, stable pre/post-gate identity, and
preserved default-database metadata. Frozen dist hashes and the full receipt
are recorded in
`work/reports/v4-phase-d-task20-result-route-repair-refreeze-2026-08-10.md`.
Task 21 ran against the exact candidate/dist in one fresh paired extension and
isolated database. LeetCode passed exactly once: one POST, four events, one
session, one attempt, ACK, and zero waiting/outbox/quarantine. The blocked-
platform readiness/drift lane passed 284/284 without submissions. The approved
NowCoder pilot `acm/contest/18839/1001` failed after durable E2: the exact final
result document showed stable submission `84438785` and `答案正确`, but waiting
remained 1 with no E3 bundle, POST, ACK, or SQLite increment. The transient
E1-only popup state was not separately observed. D4 is incomplete and D5 has
not started. Evidence:
`work/reports/v4-phase-d-task21-same-sha-automated-observations-2026-08-10.md`.

The first unproven alias hypothesis was rejected by plan/code review and kept
only as a fail-closed lesson. The user then disabled capture and reopened the
exact result. Sanitized live evidence proves the real first divergence: global
navigation `/acm/problem/list` is incorrectly parsed as problem identity
`acm/problem/list`; together with the real pilot breadcrumb it makes the
unchanged exactly-one resolver return `null` before candidate emission.

The revised causal RED fails exactly 3 of 270 focused tests: navigation
`problem/list` conflicts with the pilot breadcrumb, DOM-only `problem/list` is
fabricated as a problem, and URL-only `problem/list` is fabricated as a
problem. Revised plan, code-boundary, and privacy reviews all returned
`APPROVE`; test-first implementation of exact reserved-route rejection is
complete. Focused tests pass 406/406 with typecheck, targeted lint, and privacy
audit `0 findings`. Post-implementation code and privacy reviews are both
`APPROVE`, with no HIGH or MEDIUM findings. This failure context does not
certify the new candidate.
Plan:
`docs/superpowers/plans/2026-08-10-v4-phase-d-d4-nowcoder-e3-identity-repair.md`.

Task 16 failed twice, including once with a fresh exact-dist extension and
fresh isolated database. Both new Accepted submissions produced zero capture
POSTs/rows and the fixed `epoch_target_delivery_failed` diagnostic. The
failure and causal RED are retained in
`work/reports/v4-phase-d-task16-leetcode-automated-observation-2026-08-10.md`.
The prior `f18eddf4...` candidate and both waiting states are historical only.

## Previous Status (2026-08-10 V4 Phase D Task 15 COMPLETE; Task 16 next)

Task 15 is engineering-complete on immutable candidate
`f18eddf4cb4d7dd24c439b2dea5917793839e6a2`. Its exact candidate validator
exited `0` with unit `2353/1`, app E2E `25/25`, extension unit `1549/1549`,
extension E2E `53/1`, production build `20/20`, privacy `0 findings`, readiness
`PASS`, stable candidate identity, and preserved default-database metadata.
The generated exact dist hashes are recorded in the Phase D master plan and
`work/reports/v4-phase-d-task15-candidate-refreeze-2026-08-10.md`. Port 3000
has no listener.

Task 16 is now the only next action. Before any platform action it must verify
HEAD lineage, confirm no runtime/dist drift, and recheck all five hashes. The
observation is a real-platform automated engineering observation, not a
natural user submission, D5 approval, RC, acceptance, or release.

The first Task 15 freeze commit
`0c263ccf2459b2dda7897ad899e0c3fd439876ec` is **invalid**: its exact
candidate validator exited `1` because root `npm test` recursively discovered
two ignored historical Git worktrees and their nested third-party tests. Those
worktrees have pre-existing dirty reports and were not reset, removed, or
modified. The causal RED passed 13 tests and failed 2; adding `.worktrees/**`
to root Vitest isolation plus classifying `vitest.config.ts` as a D3-owned path
now passes 15/15, typecheck, targeted ESLint, and diff-check. This is a test-
gate repair only; runtime, protocol, manifest, permissions, build artifacts,
migrations, and the default database are unchanged.

Focused code/privacy/plan re-review returned `APPROVE` with no findings and
confirmed the effective root test list contains no `.worktrees` entry without
excluding real root tests. A new candidate commit/SHA and fresh exact validator
run are now required. No dist hash from the failed candidate is valid evidence,
and Task 16 browser work has not started.

Tasks 13 and 14 are engineering-complete at `fe36f6b4770d3d929479464c03e8bea6dbb97ba9`
and `0f695ddfad6989e407424feff457d28d081d657b`. Task 15 pre-freeze gates now
pass on their clean documentation-reconciled lineage: the combined focused
suite is 507/507; privacy audit is `0 findings`; adapter readiness is `PASS`;
`extension:check` passes 47 files / 1549 tests plus production build/parity;
and exact-dist extension E2E passes 53 with 1 known harness skip. The default
database remains at the recorded 479232-byte / 2026-07-23T15:56:38.8411343Z
metadata baseline.

Independent code and privacy review returned `APPROVE` with no findings. Plan
review first returned `REJECT (HIGH)` for stale non-archived Task 14 status in
this handoff; those sections and the current E2E count were reconciled without
a runtime change, and plan re-review returned `APPROVE`. All three pre-candidate
verdicts are now `APPROVE`. The next commit freezes the new candidate tree
using only the D3-classified master plan and handoff paths. The candidate
validator must then rerun the complete quality gate and prove exact HEAD, clean
worktree, privacy/readiness, and database preservation before exact dist hashes
are recorded. Task 16 browser work has not started. This is not D4 delivery
evidence, D5 approval, RC, acceptance, or release.

## Previous Status (2026-08-10 V4 Phase D D4 Tasks 13-14 engineering COMPLETE; Task 15 next)

Task 14 is implemented at
`0f695ddfad6989e407424feff457d28d081d657b` and independently `APPROVE`
with no findings. New LeetCode verdict candidates carry an additive strict
`submitRequestId`; the coordinator binds only that exact lifecycle and
revalidates the complete identity, status, stable-submission, and chronology
tuple without a latest-by-time fallback. Legacy candidates remain readable
without a fabricated request ID, but a matching later E1 terminalizes a stale
pre-E1 candidate immediately without consuming confirmed state or suppressing
an armed candidate. Restart recovery re-reads authoritative storage after E3
recovery and replays only an exact unfinalized `CONFIRMED` to the original
tab/frame/document; it never fabricates `STARTED` or a baseline.

The Task 14 focused lane passed 228/228 tests, typecheck, targeted ESLint, and
diff-check. Identity-bearing historical verdict diagnostic patterns were
removed from the privacy allowlist; the reviewed fixed diagnostic enums are the
only accepted submit-epoch/coordinator values. Full extension gates, privacy
audit, build/dist, D3 candidate validation, and browser observation remain
deliberately unrun until Task 15. Task 15 must now run the complete gates and
independent code/privacy/plan reviews, then freeze and validate a new immutable
candidate SHA and exact dist hashes before Task 16. This is engineering
evidence only, not D4 delivery, D5 approval, RC, acceptance, or release.

Evidence: `work/reports/v4-phase-d-task14-exact-candidate-binding-2026-08-10.md`.

## Previous Status (2026-08-10 V4 Phase D D4 Task 13 engineering COMPLETE; Task 14 next)

Task 13 is implemented at
`fe36f6b4770d3d929479464c03e8bea6dbb97ba9` and independently `APPROVE` after
two review rounds. The former intentional RED is now a green regression. The
LeetCode runtime receives exact E1 `STARTED` and persisted-E2 `CONFIRMED`
controls, evaluates stable narrow DOM-node proof before legacy text dedupe, and
emits one request-bound candidate only after legal chronology is established.
Same-problem epochs are exclusive; bounded superseded markers also prevent
A/B, duplicate, out-of-order, and full-registry legacy escapes.

The approved Task 13-16 contract is in
`docs/superpowers/plans/2026-08-06-v4-phase-d-d4-e3-candidate-coordinator-repair.md`.
Task 12 evidence is recorded in
`work/reports/v4-phase-d-task12-plan-review-2026-08-10.md`; Task 13 evidence is
`work/reports/v4-phase-d-task13-submit-epoch-control-2026-08-10.md`.
It freezes exact tab/frame/document delivery, exact `submitRequestId`, stable
DOM node identity, a 32-entry/5-minute in-memory epoch bound, fixed no-identity
diagnostics through existing `lastCaptureError`, strict chronology, legacy
fail-closed compatibility, and no new permission/storage/API/SQLite/polling
surface. Task 15 must create and validate a new immutable candidate SHA and
exact dist hashes before Task 16.

The Phase D master plan now classifies the authorized LeetCode/NowCoder browser
actions as **real-platform automated engineering observations**. Their PASS is
not a natural user submission, user acceptance, RC, or release. D4 engineering
evidence must pass on one new candidate SHA before D5 F1-F4; after four
independent APPROVE verdicts, the process stops at the user's final acceptance
gate. Task 13's Commander-owned focused lane passed 338/338 tests, typecheck,
targeted ESLint, and diff-check. Full gates and dist remain deliberately
deferred to Task 15. Task 14 is the next sequential action.

## Status (2026-08-09 V4 Phase D D4 coordinator repair Tasks 0-10 complete; 9th observation FAILED)

The D4 E3 candidate/E2 coordinator repair (Tasks 0-10) is implemented,
committed, and gate-verified: implementation `a9515a8` (`fix(v4): surface
expired diagnostics and pin graphql coordination`), doc reconciliation
`a1aeda0`, base `3246713`. Gates: focused 4 files 105/105; full extension
unit suite 45 files / 1514 tests; `extension:check` exit 0; `extension:e2e`
53 passed / 1 known skip; privacy audit `0 findings`. Plan:
`docs/superpowers/plans/2026-08-06-v4-phase-d-d4-e3-candidate-coordinator-repair.md`.
This is not RC, acceptance, or release.

**The 9th real natural observation FAILED on 2026-08-09** (merge-two-sorted-
lists, `cn/741081653`, Accepted). The event-driven revival from the 8th
observation worked as designed — E2 WAS written (confirmedAt
08:43:52.814Z, record present without `finalizedAt`), E3 WAS recorded
(lastE3At 08:43:53.728Z, `transientUnmatchedE3` empty), and the new JSON-
array `candidateId` identity encoding held in the wild — but no bundle was
produced: popup waiting stayed 1, `captureOutbox` empty, no
`POST /api/capture/attempts` in the server log, SQLite
`capture_events=0 / training_sessions=0 / training_attempts=0`.

First divergent layer (per failure protocol): candidate creation in
`extension/src/contentRuntime.ts`. The LeetCode.cn SPA restored a historical
"Accepted" result panel for this previously-practiced problem; after a null
phase the runtime misread it as a genuine transition and emitted the
candidate at 08:43:49.309 — 2.3 s BEFORE the real submit E1 (08:43:51.614).
The real submission's result was also "Accepted", so the same-text dedupe
(`contentRuntime.ts` lines 206-211) suppressed the correct candidate
forever. The coordinator then failed closed by design
(`selectEligibleSubmitLifecycles` requires `received <= observed`; the only
candidate predates every submit lifecycle), leaving the candidate `pending`
until 5-minute TTL expiry, the confirmed record unfinalized, and delivery
never occurring.

Failure protocol was followed: no timeout increase, no polling, no chronology
weakening, no immediate patch, evidence exported. Required next step (not
yet authorized): a new RED test covering "repeat submission of the same
problem with a previous result panel on the page" must fail before any
production change; then this plan file must be revised and reviewed. One
failed observation does not authorize an architectural change.

## Previous Status (2026-08-06 V4 Phase D D4 E3-confirmed race fix implemented; delivery unverified)

The D4 E3-confirmed race fix is implemented and verified through automated
gates, but end-to-end delivery is NOT yet confirmed: real natural observations
7 and 8 on LeetCode.cn both failed closed. Plan:
`docs/superpowers/plans/2026-08-06-v4-phase-d-d4-e3-confirmed-race-fix.md`.

Evidence chain (same candidate `509faf0` build lineage, rebuilt
`extension/dist`):
- Observation 6 (next-permutation, `cn/740549003`, Wrong Answer/failed,
  `2026-08-06T10:53:01Z-10:53:03Z`) delivered one bundle to the local server
  (one `POST /api/capture/attempts` 200, one SQLite training attempt) — the
  baseline where E2 happened to be written before the verdict candidate.
- Observation 7 (longest-substring-without-repeating-characters, after
  reloading the rebuilt dist): popup waiting 5→6, sync-queued 0, quarantined 0,
  blocking reason exactly `verdict candidate unconfirmed:
  leetcode:longest-substring-without-repeating-characters` (the NEW
  diagnostic). The E2 confirmation WAS eventually written (waiting +1) but
  after the original 3 s poll window expired. No server request; no bundle.
- Observation 8 (reverse-integer, no extension reload, 20 s poll window):
  identical failure mode — waiting 6→7, blocking reason `verdict candidate
  unconfirmed: leetcode:reverse-integer`; E2 written after the 20 s window.
  No server request; no bundle. This proved window enlargement alone is not
  sufficient.

Final repair (implemented 2026-08-06, verified by gates only):
- Event-driven revival: `chrome.storage.onChanged` now reacts to
  `confirmedSubmissions` changes and re-schedules the pending verdict-candidate
  attempt immediately (pure helper `storageChangeRevivesVerdictCandidate`
  next to `shouldRetryLeetCodeVerdictCandidate`).
- Poll exhaustion no longer un-arms the pending recheck; the closed diagnostic
  (`lastCaptureError`) is still recorded on exhaustion. No new storage keys,
  no schema/migration/manifest change, no adapter policy change.
- Gates: `npm run typecheck` exit 0; focused
  `tests/unit/extensionLeetCodeVerdictRetry.test.ts` 7/7; eslint exit 0;
  `npm run extension:check` exit 0 (44 files / 1421 tests, MV3 build PASS,
  dist parity PASS); privacy audit 0 findings.
- A 9th real natural observation is still required to confirm end-to-end
  delivery (bundle → outbox → POST /api/capture/attempts → SQLite row).

This is not RC, acceptance, or release. D4 same-SHA observations and D5 F1-F4
still require separate user authorization.

## Previous Status (2026-08-04 V4 Phase D D3 candidate engineering complete)

V4 Phase D D1 engineering gates pass on the uncommitted working tree after the
user approved a one-time, non-precedential D1-U RED-provenance exception. The
focused D1-U matrix is `27/27` GREEN, exact production-dist D1-E is `5/5`,
D1-R passes, D1-X is `42 files / 1406 tests`, and the canonical quality gate
exited 0. This is an engineering-gate result, not D1 phase completion, RC,
acceptance, or release. Evidence:
`work/reports/v4-phase-d-d1-upgrade-reliability-2026-08-03.md`.

D1-C is complete after a user-authorized headed isolated Chromium observation
passed `5/5` and direct evidence inspection confirmed all lifecycle, hash,
API/ACK, SQLite, and preservation requirements. Evidence:
`work/reports/v4-phase-d-d1-c-disposable-observation-2026-08-03.md`. The earlier
Chrome `150.0.7871.187` real-profile debug remains excluded from D1-C evidence;
its residual development extension was subsequently removed and temporary tabs
were closed. No real OJ submission or default database edit/write occurred;
default DB metadata was read-only compared and unchanged. The independent final
D1 review returned `APPROVE` with no blocking or important findings. D1 phase is
complete. D2's first independent review returned `CHANGES REQUIRED`; the
remote-endpoint, current/legacy raw-error, AST/wrapper, manifest/dist link, and
fixture findings are now repaired after two review rounds with 35/35 audit
tests, 68/68 focused product privacy tests, 43 files / 1412 extension tests, and
`0 findings`. The final independent privacy review returned `APPROVE`, and the
canonical quality gate passed. D2 is complete. D3 candidate preflight then
completed under explicit user authorization. The implementation candidate is
commit `509faf0e60532cf565a6a57aa796b96bc1053f38`
(`feat(v4): harden Phase D capture reliability`); its final documentation
reconciliation is the current candidate HEAD. The final candidate gate is
bound to the full current HEAD SHA and is engineering evidence only, not RC,
acceptance, or release. No push or PR has occurred.

## Previous Status (2026-08-02 V4 Phase C C0-C5 engineering complete)

Phase C C5 is complete on `feature/v1-followup`. The new isolation suite proves
owner-only LeetCode/NowCoder request interpretation, platform-namespaced same
raw submission IDs, durable confirmed/outbox preservation, explicit terminal
readiness for every platform, and no production Fake OJ registry claim. The
orchestrator no longer accepts V3 submission-intent or V3 verdict-fallback
events; unsupported DOM candidates are dropped unless an adapter-owned V4 policy
emits E3. Initialization retains only legacy-key read/count/delete cleanup, and
completed historical bundles remain deliverable. Evidence:
`work/reports/v4-phase-c-c5-closeout-2026-08-02.md`.

## Previous Status (2026-08-02 Phase C C4 Luogu `V4_BLOCKED`)

Phase C C4 is terminally `V4_BLOCKED` on the uncommitted working tree of
`feature/v1-followup` at base HEAD
`a24e158448c3ccf3e1cde6e380e0c441eff87342`. Revision 3 was explicitly
approved. Its closed pre-storage Luogu pathname grammar passed before the
exact production extension observed one natural P1001 submission.

The sanitized transcript contains three lifecycle records for XHR
`POST /fe/api/problem/submit/P1001`, including HTTP 200, all in document
`0B0F2A7605D410D910DF94BF4E01ADAE`. The browser landed on numeric record path
`/record/290292547` in document `4BA4F019442B690633DAF065F40513C7`.
Navigation witnesses remained zero, and no redirect, lastRecordId request,
record request, or approved bridge bound the two documents. Tab/time/latest/
highest/account inference is forbidden, so no legal E2 exists and no Luogu
network adapter was implemented. Evidence:
`work/reports/v4-luogu-c4-blocker-2026-08-02.md`.

C5 cross-platform isolation and migration-scaffolding audit is the next
sequential task after terminal C4 gates agree. No commit or push has occurred.

## Previous Status (2026-08-02 Phase C C3 Codeforces `V4_BLOCKED`)

Phase C C3 is terminally `V4_BLOCKED` on the uncommitted working tree of
`feature/v1-followup` at base HEAD
`a24e158448c3ccf3e1cde6e380e0c441eff87342`. The user prepared their own
Codeforces submission on `/problemset/submit/`; after an immediate ready
handshake, the exact preflight production extension armed an authenticated
five-minute session with zero records. The user clicked the final Submit once,
the browser moved to `/problemset/status`, and the user confirmed the
submission entered the status page. The extension retained zero records and
zero navigation witnesses before explicit stop.

The blocker is structural: Codeforces uses a traditional main-frame form
navigation, Chrome's official `webRequest` contract omits `documentId` for
frame navigation, and the approved observer rejects missing document identity.
The landing path exposes neither stable numeric submission identity nor exact
contest/problem identity. Status-row/account/latest/highest/nearest-time/query
inference is forbidden. No Codeforces network adapter or fixture was created.
Authoritative evidence:
`work/reports/v4-codeforces-c3-blocker-2026-08-02.md`.

Terminal gates pass: focused 433/433, readiness 21/21 plus CLI PASS, frozen
AtCoder hashes 9/9, `extension:check` 39 files / 1,326 tests, and the full
nine-stage quality gate with 2,075 unit tests, 25 app E2E, 48 runnable
extension E2E, and production build. One Windows capability case and one known
extension harness case remain skipped.

C4 Luogu is now the next sequential wave. Its delta plan Revision 3 is at
`docs/superpowers/plans/2026-08-02-v4-luogu-network-capture-migration.md` and
is pending an independent `APPROVE` or `REJECT` verdict. The plan preserves
the historical public-DOM blocker, treats authenticated evidence as
non-certifying, and requires stable numeric record ID, exact problem identity,
and reviewed document continuity. No authenticated C4 characterization,
natural submission, privacy implementation, adapter implementation, fixture,
commit, or push has occurred. Revision 2's reviewer closed the original seven
findings but reported three remaining LOW observations while issuing
`APPROVED`; revision 3 closes those observations so the plan's explicit
zero-unresolved-finding approval contract remains enforceable.

## Previous Status (2026-08-02 Phase C C2 AtCoder `V4_BLOCKED`)

Phase C C2 is terminally `V4_BLOCKED` on the uncommitted working tree of
`feature/v1-followup` at base HEAD
`a24e158448c3ccf3e1cde6e380e0c441eff87342`. The already-open user Chrome ran
the exact preflight extension build. Two natural `abc001_1` submissions were
safely corroborated (`78058928` and `78059304`). During the ready-gated final
window, a live watcher remained active through the second submission, the page
navigated from `/contests/abc001/submit` to
`/contests/abc001/submissions/me`, and the extension retained exactly zero
records before the operator stopped the session.

The blocker is structural: Chrome's official `webRequest` contract omits
`documentId` for frame navigation, AtCoder uses a traditional `main_frame`
form submission, and the approved observer must reject missing document
identity. The landing path supplies no stable numeric submission identity.
Weakening correlation through body/query/DOM-row/tab/time inference is
forbidden. No AtCoder network adapter was implemented. Historical Phase 0 DOM
certification remains production-authoritative for its own scope and all nine
fixtures remain frozen. Terminal gates pass: focused 401/401, readiness CLI,
fixture hashes 9/9, full quality gate with 2,034 unit tests, 25 app E2E, 1,286
extension tests, 48 runnable extension E2E, and production build. One Windows
capability case and one known extension harness case remain skipped.
Authoritative blocker:
`work/reports/v4-atcoder-c2-blocker-2026-08-02.md`.

C2 remains terminally closed; C3 subsequently completed as documented above.

## Previous Status (2026-07-30 Phase C C1 LeetCode `V4_EXPERIMENTAL`)

Phase C C1 is terminally closed as `V4_EXPERIMENTAL` on the
uncommitted working tree of `feature/v1-followup` at base HEAD
`a24e158448c3ccf3e1cde6e380e0c441eff87342`. The user completed the
v6 retest in the already-open Qiu yu Chrome profile with the installed
production extension id `aljppcgkcdbeemppmokcbjgcjdhapakh`; no
replacement Chrome profile was opened.

The real v6 observation proves the full local chain for LeetCode:

- production digest
  `8e0df3af3be1a60da88e6362cadbe2f6883a9ecec6f0063c522ff85a3e8521bb`;
- adapter `v4-leetcode-network-6`;
- submission `cn/739108591`, problem `roman-to-integer`, verdict
  `Wrong Answer`;
- terminal extension state: zero confirmed submissions, one durable
  tombstone (`leetcode:cn/739108591`), and zero outbox, quarantine,
  unmatched-E3, ambiguity, endpoint-diagnostic, or capture-error
  residue;
- the disposable SQLite database contains exactly four capture events,
  one training session, and one non-voided automatic training attempt
  with `record_source=capture`, `provenance=extension_paired`, and
  `result=failed`.

The localhost hypothesis is disproved for this failure: the existing
profile retained `http://localhost:3000/*` permission, pairing and
capture were enabled, and v6 delivered through the local API into
SQLite. The actual defects were:

1. the original adapter was overfit to the legacy LeetCode
   `/problems/<slug>/submit/` plus
   `/submissions/detail/<id>/v2/check/` sequence, while the current UI
   uses trusted E0 plus completed `POST /graphql/` and exact
   `/submissions/api/{runtime|memory}_distribution/<id>/` requests;
2. v5 scoped `problemExternalId` as `cn/<slug>`, but the local API
   contract requires the plain problem slug;
3. repeated result evidence could refresh `confirmedAt` and recreate a
   finalized record, so v6 preserves first confirmation identity and
   time and suppresses tombstoned replay.

The final authoritative `npm run quality:gate` completed all nine
stages successfully: 94 unit-test files with 2,009 passing tests and
one Windows symlink-capability skip; 25 application E2E tests; 39
extension unit-test files with 1,261 passing tests; 48 extension E2E
tests with one documented Phase A service-worker harness skip; strict
lint, migrations, curriculum validation, typecheck, production
extension build/parity, and Next.js production build all passed.

Authoritative C1 closeout:
`work/reports/v4-leetcode-c1-closeout-2026-07-30.md`.

This is not a production-adapter promotion, RC, user acceptance of the
whole product, public release, or authorization to skip C2-C5.
LeetCode remains `experimental`. Phase C subsequently entered C2 AtCoder.
The user authorized characterization on 2026-07-31 and the derived
delta plan now lives at
`docs/superpowers/plans/2026-07-31-v4-atcoder-network-capture-migration.md`.
All nine historical AtCoder fixture hashes are frozen in that plan; the four
historical certification suites pass 171/171 and the readiness CLI passes.
C2 plan revision 2 is independently `APPROVED`; the pre-storage pathname
privacy prerequisite passes 331 focused tests and `extension:check` passes 39
files / 1,285 tests. Production-dist version/hashes are frozen in
`work/reports/v4-atcoder-c2-preflight-2026-07-31.md`. The same extension id was
reloaded in the already-open Chrome. These entry conditions are historical;
the C2 blocker above supersedes the former login-pending state. No C1/C2
commit or push has been made.

## Previous Status (2026-07-29 V4 NowCoder E3 ingress engineering PASS)

The Phase B B8 missing-E3 layer is repaired. The engineering block is
closed on a single uncommitted SHA through Tasks 0-6 of
`docs/superpowers/plans/2026-07-29-v4-nowcoder-e3-ingress-repair-and-retest.md`
with the closeout report at
`work/reports/v4-nowcoder-e3-ingress-repair-2026-07-29.md`.

- **Pure ingress coordinator** (`extension/src/contentIngress.ts`):
  pure URL gate synchronized with the existing E3 policy
  (no trailing slash), closed 7-input/5-effect reducer, bounded
  transient registry (max 100), closed `CONTENT_RUNTIME_READY`
  schema guard.
- **Idempotent content bootstrap** (`extension/src/contentBootstrap.ts`):
  three-state sentinel `installed | installing | inactive` so a
  second injection can reannounce but not double-install, and a
  capture-disabled install clears the sentinel.
- **Self-healing background injection**
  (`extension/src/background.ts`): registers
  `chrome.webNavigation.{onCommitted,onCompleted,onHistoryStateUpdated,onErrorOccurred}`,
  calls `chrome.scripting.executeScript` with `world: "ISOLATED"` and
  `target: { tabId, documentIds: [docId] }` whenever Chrome
  supplies a document id; `onStartup` and worker initialization
  invoke `reconcileOpenNowCoderResultTabs` to recover an already-open
  eligible result tab.
- **Closed control-plane persistence** (never enters capture state):
  `session.contentIngressReady` (max 20) records ready handshakes
  observed by Task 5 only; `session.contentIngressDiagnostics`
  (max 20) records `injection_failed` reason codes only.
- **Manifest deltas**: `scripting` and `webNavigation` permissions
  added; existing `content_scripts` matches and per-host
  `host_permissions` unchanged. No `<all_urls>`, no `tabs`, no
  `activeTab`, no `allFrames`.
- **Real-Chrome observation (Task 5)**: fresh extension profile,
  no characterization, no submit, direct navigation to
  `https://ac.nowcoder.com/acm/contest/view-submission?submissionId=84258557`
  observes exactly one `ready_record` and one unmatched E3 with the
  expected `externalSubmissionId`/`problemExternalId`/`verdict`.
  `confirmedSubmissions/outbox/quarantine` stay empty; default
  `training-platform.sqlite` metadata unchanged.
- **Real-Chrome full chain (Task 6)**: same SHA, paired with the
  disposable local app: E0 → submit → status → E2 confirmation
  (stable id `84258557`) → result page → ready handshake → E3 →
  bundle → one `POST /api/capture/attempts` delivery → one SQLite
  training attempt (+4 `capture_events`, +1 `training_session`,
  +1 `training_attempt`). A subsequent reload of the delivered
  result page does not duplicate the bundle or attempt.
- **Authoritative `npm run quality:gate`**: exited 0 on 2026-07-29
  (lint clean, disposable `db:migrate`, `curriculum:validate`
  12 nodes / 13 edges / 12 resources / 12 practice mappings /
  9 careers, `test` 92 files / 1919 passed / 1 pre-existing Windows
  `EPERM` skip, `typecheck`, `e2e` 25/25, `extension:check` clean
  with 38 files / 1191 tests, `extension:e2e` 47/47 on the second
  consecutive run, `build` PASS).
- **NowCoder remains `experimental`** for DOM and V4 network
  readiness. Adapter promotion is **not** authorized by this
  report and requires a separate reviewed decision.

The Phase B B8 `BLOCKED` verdict in
`work/reports/v4-nowcoder-phase-b-terminal-closeout-2026-07-28.md`
is superseded only for the missing-E3 layer; every other Phase B
outcome recorded there remains authoritative.

The current implementation commit on `feature/v1-followup` for the
missing-E3 ingress layer fix is
`c26c57859b9e330c42d2586c4fb1f0366d2186ea`. The Phase B terminal
state commit `7bac19413992e7a987a3891190223628fb5b0803` is preserved
as the historical BLOCKED closeout point. The missing-E3 layer
supersede is documented in
`work/reports/v4-nowcoder-phase-b-terminal-closeout-2026-07-29-supersede.md`.

## Status (2026-07-28 V4 Phase B terminal BLOCKED)

**V4 INFRASTRUCTURE ENGINEERING PASS (SCOPE-REDUCED) / FORMAL V0
OBSERVATION BLOCKED / PHASE B B0-B7 COMPLETE, B8 BLOCKED AT REAL E3 INGRESS.**

B3 is limited to the restart-safe NowCoder browse-only navigation witness.
Implementation commits `c208bc2` and `fdecf91`, observation evidence commit
`b2c6aec`, and the B3 lifecycle closeout recorded in
`work/reports/v4-nowcoder-b3-lifecycle-closeout-2026-07-28.md` produced and
verified the strict authenticated two-E0 fixture at
`tests/fixtures/nowcoder/network/nowcoder-browse-only-2026-07-27.json`.
The transcript validator, fixture test, real content-script/background/popup
lifecycle A-D tests, and final quality gate pass. A-D use CDP only to control
the Worker; the exact manifest routes run the production content script and
the popup performs the public status/export checks. The test-only Chromium
feature flag needed to keep a command-line-loaded unpacked extension reloadable
does not alter production extension behavior or user Chrome.

This does not certify NowCoder production, a release candidate, user
acceptance, public release, or authorize Phase C.

Phase B authorization B0, schema B1, and diagnostic-mode B2 are complete
and frozen at `6862f462978352fda7ab1e90639a5c1fbd960810`. B2 passed independent privacy
review after four iterative rounds. The diagnostic mode provides
NowCoder-only opt-in session-backed safe network characterization with
worker-restart fail-closed, exact B1-compatible export, and hard
production-path isolation. Authorization is recorded at
`work/reports/v4-nowcoder-characterization-authorization.md`.
The authorized B3 no-submit observation used that exact SHA and reached
localhost resources (connection refused), contest list, then the authorized
problem in one background tab. Waiting/outbox/quarantine remained zero and no
code or submit control was touched. It exported the strict two-E0 fixture and
cleared the diagnostic session. The later lifecycle closeout verifies A-D in
synthetic, production-path extension E2E without re-operating user Chrome; see
`work/reports/v4-nowcoder-b3-lifecycle-closeout-2026-07-28.md`.

- **B0 (authorization contract):** Authorization report validated by
  `scripts/validate-v4-characterization-authorization.mjs` and 7 tests.
  Exact NowCoder hostname required; non-NowCoder domains and templates
  rejected.
- **B1 (safe transcript schema):** Strict B1 `network_request_observed`,
  `submission_confirmed`, and `final_verdict_confirmed` contract with CLI
  validator; 129 tests. Rejects raw data, free-text metadata, unsafe
  source URLs, unknown evidence kinds, and characterization-derived
  production claims. Shared runtime-TS parser extracted to
  `extension/src/networkTranscriptContract.ts`.
- **B2 (diagnostic mode):** Files: `extension/src/characterization.ts`,
  `characterizationStorage.ts`, `characterizationIngress.ts`,
  `networkTranscriptContract.ts`; modified `background.ts`,
  `networkObserver.ts`, `popup.ts`, `popup.html`, `manifest.json`,
  `package.json`, `vitest.config.ts`. Tests: 64 characterization + 10
  background-integration tests. Key properties:
  - Disabled by default and after worker restart (`initialization` and
    `onStartup` call `stop()`).
  - Explicit opt-in via popup with hostname and authenticated state.
  - 5-minute TTL with alarm-driven proactive cleanup.
  - Synchronous `characterizationProductionGuard` prevents production
    observer from even scheduling NowCoder work.
  - Session-backed `blocksNowCoderProductionIngress` guards all
    production ingress including E0 hints, E1 webRequest, MAIN bridge,
    E3, and V3 verdicts; survives worker restart.
  - Recursive forbidden-key checks (full B1 alias set) in both
    production and characterization observers.
  - Export produces validated B1 `{ meta, evidence }` document
    downloadable via popup.
  - No response body, code, headers, cookies, tokens, or account
    data are ever retained.
  - Independent code-reviewer APPROVED with no blockers.
  - `npm run extension:check`: 32 files / 1055 tests PASS.

Phase A A0-A12 closeout is authoritative (see below). Phase B is terminally
`BLOCKED` after B0-B7 completed. B8 observed trusted E0, real E1/E2 with stable
ID `84258557`, and the matching public final verdict, but the real result
document emitted no E3; no bundle or SQLite attempt was created. Do not start
Phase C without fresh explicit authorization and a reviewed plan. The closeout
report is `work/reports/v4-nowcoder-phase-b-terminal-closeout-2026-07-28.md`.

---

## Previous Status (2026-07-24 V4 Phase A closeout A0-A12 complete)

**V4 INFRASTRUCTURE ENGINEERING PASS (SCOPE-REDUCED) / FORMAL V0
OBSERVATION BLOCKED.**

The user explicitly authorized re-opening A10-A12 on 2026-07-24 after
the A0-A9 interim closeout. Phase A is now the authoritative V4
infrastructure scope spanning Tasks A0-A12: the framework engineering
pass (evidence core, correlator, state machine, storage split,
observer, bridge, orchestrator, Fake OJ matrix, disposable DB
lifecycle, gate integration, plan reconciliation) is complete and
every authoritative gate command exits 0. The full E2->E3->real-popup-
pair->real-API->SQLite delivery probe and the worker-restart recovery
probe remain out of Phase A scope (scope-reduced A10 smoke test +
`test.skip` for the worker-restart harness limitation). Real platforms
remain `V4 uncharacterized`. Final closeout report:
`work/reports/phase-a-final-closeout.md`.

- **A0-A9 (interim closeout, 19 atomic commits):**
  - Phase 0 click-ingress stopgap: T0.1 docs + validator
    (`8321a07`); T0.2 RED tests (`fb2cc15`); T0.3 bounded E0 UI
    hints (`4b9cb2e`); T0.4 V3-to-V4 stopgap migration
    (`d683a7a`); T0.5 popup confirmed-only semantics (`6d8fe63`).
  - Phase A infrastructure: A0 webRequest spike GO (`7d6bf9e`);
    A1 safe evidence schemas (`8bdfe5d`); A2 adapter contracts
    (`9449c61`); A3 strict correlator (`03b56d0`); A4 capture
    state machine (`2ca2ffd`); A5 storage split (`2a27997`); A6
    webRequest observer (`64890b4`); A7 MAIN bridge (`68f0d4e`);
    A8 background orchestrator (`12ceb6d`); A9 Fake OJ matrix
    (`b3ec8cb`).

- **A10 (disposable SQLite lifecycle, `c8680e8` + review fixes
  `9b81784`):**
  - `tests/extension-e2e/database.ts` provides disposable directory,
    DB creation, migrations via `npm.cmd`, count readers, and
    default-DB snapshot / verify utilities with relative-path-based
    safe deletion under `.tmp/`.
  - `tests/extension-e2e/capture-v4-full-chain.spec.ts` proves the
    disposable DB + production extension artifact + scenario
    identity helpers + default-DB preservation.
  - `scripts/a10-bootstrap.mjs` is a reusable bootstrap helper for
    future webServer-based A11+ integrations (currently unused).
  - Independent review found 4 HIGH issues (path check prefix
    collision, stale path file teardown, missing `.tmp` mkdir,
    profile cleanup replacement); all fixed in `9b81784`.

- **A11 (gate integration, `9556890` + review fixes `6401e17`):**
  - `scripts/quality-gate.mjs` adds `extension:e2e` as stage 7; the
    frozen `QUALITY_GATE_STAGES` array is now 9 stages.
  - `tests/extension-e2e/capture-v4-network.spec.ts` marks the
    service-worker-restart scenario as `test.skip` with a docblock
    referencing the closeout report.
  - `.github/workflows/quality-gate.yml` is created as a local-only
    CI workflow with `permissions: contents: read`,
    `timeout-minutes: 20`, and the canonical `npm run quality:gate`.
  - `docs/runbook.md`, `docs/architecture.md`, `COMPLIANCE.md`
    document the new lane and its boundaries.
  - Independent review found 6 issues (HIGH workflow npm ci /
    permissions, MEDIUM triggers / timeout, LOW docs accuracy /
    incorrect comment); all fixed in `6401e17`.

- **A12 (closeout, `77e6f30` + review fixes `30f3d73`):**
  - This plan file is reconciled: every A0-A12 task has an
    execution result block with commit SHA, verification command,
    test counts, and review findings + fixes.
  - `work/reports/phase-a-final-closeout.md` is the dated Phase A
    closeout report. It supersedes
    `work/reports/v4-phase-a-closeout-2026-07-24.md` for the A0-A12
    scope but preserves the A0-A9 verdict unchanged.
  - Independent review found 4 issues (HIGH scope honesty in
    verdict, MEDIUM missing SHAs / commands + dev-server claim, LOW
    module list); all fixed in `30f3d73`. Phase A verdict adjusted
    from `PASS` to `PASS (scope-reduced)` to honor the A10 smoke
    test and the worker-restart `test.skip`.

- **Phase A quality gate (final, after A12 review fixes):**
  - `npm run lint` PASS
  - `npm run typecheck` PASS
  - `npm run db:migrate` (disposable) PASS
  - `npm run curriculum:validate` PASS
  - `npm run test` 80 files / 1528 passed / 1 skipped
  - `npm run e2e` 25 passed
  - `npm run extension:check` 30 files / 950 passed; MV3 build
    OK; dist parity OK
  - `npm run extension:e2e` 31 passed (1 known skip)
  - `npm run build` 20/20-page production build
  - `npm run quality:gate` EXIT 0

- **Phase A commit chronology (Phase 0 + Phase A closeout):**

  | Phase | Task | SHA | Subject |
  |-------|------|-----|---------|
  | P0 | T0.1 | `8321a07` | docs: V4 plans + reconcile authority |
  | P0 | T0.2 | `fb2cc15` | test: RED tests for click-only waiting |
  | P0 | T0.3 | `4b9cb2e` | feat: bounded E0 UI hints |
  | P0 | T0.4 | `d683a7a` | feat: V3-to-V4 stopgap migration |
  | P0 | T0.5 | `6d8fe63` | feat: popup confirmed-only |
  | PA | A0 | `7d6bf9e` | test: webRequest test path GO |
  | PA | A1 | `8bdfe5d` | feat: Safe Evidence schemas |
  | PA | A2 | `9449c61` | feat: adapter contract split |
  | PA | A3 | `03b56d0` | feat: strict Evidence Correlator |
  | PA | A4 | `2ca2ffd` | feat: pure Capture State Machine |
  | PA | A5 | `2a27997` | feat: storage split |
  | PA | A6 | `64890b4` | feat: webRequest observer |
  | PA | A7 | `68f0d4e` | feat: MAIN bridge |
  | PA | A8 | `12ceb6d` | feat: background orchestrator |
  | PA | A9 | `b3ec8cb` | test: Fake OJ matrix |
  | PA | A10 | `c8680e8` | test: A10 smoke + disposable DB |
  | PA | A10 fix | `9b81784` | fix: A10 path safety + profile cleanup |
  | PA | A11 | `9556890` | build: gate integration |
  | PA | A11 fix | `6401e17` | fix: A11 workflow + docs accuracy |
  | PA | A12 | `77e6f30` | docs: A12 plan + closeout report |
  | PA | A12 fix | `30f3d73` | docs: A12 verdict honesty + SHAs |

  21 commits total (5 Phase 0 + 10 Phase A task + 4 review fix +
  2 A12 docs).

## Previous Status (2026-07-24 A0-A9 interim closeout)

- Phase A Task A9 (Fake OJ matrix) is complete as the closeout seam.
  `tests/extension-e2e/{fakeOj,fakeOjScenarios,capture-v4-network.spec}.ts`
  cover 18 named scenarios + 3 cross-platform smoke tests; 28 of 29
  Playwright tests pass. The single remaining failure is a test-harness
  worker-restart seam (a known infrastructure limitation, not a production
  defect; the module docblock in `capture-v4-network.spec.ts` honestly
  documents this). The production-side `extension/src/mainWorldRelay.ts`
  was hardened with a recursive forbidden-key gate so the relay now
  refuses any forbidden raw field at any depth.
- Phase A Task A8 (background orchestrator) is complete.
  `extension/src/backgroundOrchestrator.ts` is a pure data plane: zero
  `chrome.*` calls, every side effect through the injected
  `ExtensionInitializationStorageSplit`. 9 input kinds (4 V3 event
  variants, V4 Safe Evidence, 4 A3 correlator outcomes plus
  `e0_recorded` / `e3_recorded` / `v3_submission_intent_recorded` /
  `user_action`); closed 4-effect union with `observedAt`; waiting only
  increments on `SUBMISSION_CONFIRMED`; E3-before-E2 retention parked by
  stable submission key with most-recent-wins; browser-restart recovery
  produces a bundle from confirmed submission + new E3 without requiring
  transientE1. `extension/src/captureStateMachine.ts` was made Chrome-
  bundleable in parallel: `node:crypto` / `Buffer` replaced with pure-JS
  SHA-256 (byte-identical to Node `createHash("sha256")` for the canonical
  A4 fixture `bundle_91b8a3600f18390ffdee270d325ddd1d92295484e6552dc4b8b5f866782ca7f2`)
  and a 4-byte big-endian uint32 length-prefix encoder.
- Phase A Task A7 (MAIN bridge) is complete. `mainWorldBridge.ts` provides
  the IIFE MAIN-world bridge (built as `extension/dist/main-world-bridge.js`
  via `extension/build.mjs`, gated to the four OJ hosts through
  `extension/manifest.json`'s `web_accessible_resources`).
  `mainWorldRelay.ts` is the ISOLATED-world relay that re-validates the
  summary through `parseMainBridgeSummary` and adds the recursive
  forbidden-key gate before emitting the `V4_FORWARD_BRIDGE` envelope.
  MAIN evidence alone can never confirm a submission; it must match one
  unique webRequest E1.
- Phase A Task A6 (webRequest observer) is complete. Five host-scoped
  Chrome webRequest lifecycle listeners cover leetcode/nowcoder/luogu/
  codeforces; AtCoder is explicitly excluded. Each detail is validated
  synchronously through `parseSafeEvidence`; forbidden raw fields produce
  `ignored corrupt_record`; missing documentId / invalid tab/frame produce
  `missing_document_id`; non-adapted hosts and unsafe URLs produce
  `non_adapted_host` / `normalize_endpoint_failed`. Lifecycle merging
  keeps the earliest `receivedAt` and the latest `apiTimeStamp`;
  `error_occurred` never carries a `statusCode`. `registerNetworkObserverListeners`
  is a pure dependency-injected helper that `extension/src/background.ts`
  routes through the existing serialized executor.
- A0-A5 are recorded historically in the Phase A plan file and the
  earlier handoff snapshots; A0 webRequest spike GO, A1 Safe Evidence, A2
  adapter contract split, A3 strict correlator, A4 capture state machine,
  A5 session/local storage split.
- Phase A closeout verification: `npm run typecheck` and `npm run lint`
  pass; `npm run extension:check` passes with 30 files / 950 tests
  across 26 unit + 4 dedicated E2E files; full Playwright suite reports
  28 of 29 tests passing. Independent final reviews for A4 (40 tests),
  A5 (39 tests), A6 (19 tests), A7 (57 tests), A8 (35 tests), A9 (29 tests)
  are all APPROVED with no blocker or important issue.
- Every real platform's `V4NetworkStatus` remains `uncharacterized`. No
  real OJ network capture path has been exercised; the Phase A closeout
  is a framework engineering pass, not a real-platform certification.
- Formal V0 observation, replacement-RC work, and V0.5 remain blocked
  until Phase B (or a separately authorized characterization) succeeds.
  requires explicit authorization.
  started and requires explicit authorization.
- Phase A Task A2 is complete. `extension/src/adapters/registry.ts` is the
  single registry source for platform identity, exact host ownership, existing
  DOM status, independent V4 network status, and adapter version. AtCoder alone
  remains DOM `production`; all five V4 network statuses remain
  `uncharacterized`, with no real network policy or matcher attached.
- The branded network-policy factory reparses every candidate return through the
  A1 Safe Evidence boundary and fails closed on invalid data or exceptions. A
  TypeScript-AST dependency graph rejects direct and transitive adapter imports
  into storage, outbox, transport, state, correlator, and background boundaries.
  Registry host ownership now gates existing page/result detectors while route-
  specific constraints remain narrow.
- A2 verification passes: focused 4 files / 327 tests, lint, typecheck, and final
  `extension:check` with 22 files / 692 tests, MV3 build, and dist parity.
  Independent final review is APPROVE with no blocker or important issue.
- Phase A Task A1 is complete. Strict Safe Evidence schemas now cover E0, E1
  lifecycle, E2, E3, ambiguity, and rejection records. The only exported
  raw-to-safe boundary returns a Zod-normalized plain object; request bodies,
  source code, headers, credentials, user identity, unsafe URLs, unknown fields,
  and malformed timestamps are rejected before state or persistence can use
  them.
- Every browser-document record requires tab/frame/document identity and
  background `receivedAt`. webRequest E1 evidence additionally requires Chrome
  `apiTimeStamp`; page timestamps remain non-authoritative. Final verdicts reuse
  the existing 12-value product taxonomy.
- A1 verification passes: focused 177/177 tests, lint, typecheck, and final
  `extension:check` with 21 files / 645 tests, MV3 build, and dist parity.
  Independent final review is APPROVE with no blocker or important issue.
- Phase A Task A0 is GO: bundled Chromium `138.0.7204.23` loaded exact
  production `extension/dist`; repeated fresh-profile runs recorded two
  Playwright-fulfilled exact POSTs and two MV3 markers across
  `stopped -> running`, with wrong method/path rejected.
- Final A0 network controls combine page-level default abort with worker-level
  no-proxy/DNS denial. One pre-fix synthetic GET reached an AtCoder denial-probe
  path because the system proxy bypassed DNS; no submission, body, credential,
  user data, or source code was involved. The failed run was not accepted, and
  two post-fix runs passed. Evidence:
  `work/reports/v4-phase-a-a0-webrequest-spike-2026-07-24.md`.

- A NowCoder browse-only false positive exposed the V3 architectural defect:
  a qualifying click can create active waiting state before any server-confirmed
  submission exists.
- The completed execution entry is
  `2026-07-24-v4-network-confirmed-capture-refactor-phase-0-click-ingress-stopgap.md`.
  Formal V0 observation is blocked until V4 reaches its required replacement
  candidate gates. V0.5 remains out of scope.
- Commit `2f4f5d895ea8d965fb64d19dc784ca5514480688` remains historical evidence for
  the repaired V3 LeetCode flow, not a current acceptance anchor.
- Clicks now create at most a bounded, alarm-expired E0 session hint. Waiting
  reads only validated confirmed submissions; Phase 0 has no E2 producer.
  Existing completed outbox/quarantine/pairing state remains preserved.
- Final gates: 70 unit files / 1046 passed / 1 Windows capability skip, 25 E2E,
  20 extension files / 468 passed, and 20/20-page production build. Independent
  review has no blocking or important runtime finding. Evidence:
  `work/reports/v4-phase-0-click-ingress-stopgap-2026-07-24.md`.

## Previous Status (2026-07-24 LeetCode natural submission validation)

- The previous exact-route repair was still incomplete. Current LeetCode.cn
  renders duplicate `console-result` verdict nodes, then may restore the
  problem URL while retaining the selected `submission-detail` result tab.
  Neither shape was covered by the legacy single-locator assumption.
- The LeetCode extractor now collapses identical visible panes, rejects
  conflicts, and accepts the restored problem URL only with a unique visible
  selected first-party detail tab containing a recognized final verdict.
  Transient chrome such as `提交详情`, unknown labels, and inactive tabs do not
  consume a pending intent.
- Authorized real-Chrome recovery against the user's existing
  `/problems/two-sum/submissions/737659968/` result produced
  `Time Limit Exceeded` / `partial`, received a matching ACK, and left active,
  outbox, quarantine, and unmatched counts at zero. No external OJ submission
  was made by the agent.
- On 2026-07-24 the user reloaded the final build from implementation commit
  `2f4f5d895ea8d965fb64d19dc784ca5514480688` and confirmed the same LeetCode
  case passes through a fresh natural submission. This closes the repair
  validation gate without fabricating formal observation sessions.
- A diagnostic build briefly classified the transient detail label as
  `Other Failure`. That locally created diagnostic attempt was immediately
  voided through the official API with an audit reason and is excluded from
  default Training, Coach, and Growth views.
- Adapter readiness is certification metadata, not a runtime switch.
  LeetCode remains `experimental`; changing it to `production` would not fix
  capture and would bypass the evidence gate. AtCoder remains the sole
  certified production adapter.
- `npm run quality:gate` exits 0: 68 unit files / 1039 passed / 1 Windows
  capability skip, 25 Playwright E2E, 19 extension files / 464 passed, lint,
  disposable migration, curriculum validation, typecheck, MV3 build/dist
  parity, and 20/20-page production build.
- Evidence:
  `work/reports/v0-leetcode-tle-semantic-result-repair-2026-07-23.md`.
  V0.5 was not merged or started.

## Status (2026-07-23 real Chrome extension-error closure)

**ENGINEERING PASS / REAL CHROME ERROR RETEST PASS: the result-route, verdict,
ACK, popup-feedback, and content-script lifecycle repairs are frozen by the
local implementation commit containing this handoff. The user observed the
repaired TLE flow clear pending state and all popup queues return to zero.
Authorized Chrome inspection then identified and closed the remaining red
extension-error indicator.**

- The final missing lifecycle fact was the URL. The user's real page was
  `/problems/two-sum/submissions/737484505/`, but exact-result routing only
  recognized `/submissions/detail/<id>/`. A new result document therefore saw
  the first-frame TLE as historical and left the background intent active.
- Strict LeetCode `.cn`/`.com` problem-scoped result routes are now exact. Tests
  reject missing or nonnumeric IDs, extra path/query/hash data, credentials,
  ports, and spoofed hosts.
- The earlier same-document SPA causality and platform-neutral verdict taxonomy
  remain intact. Trusted final states retain distinctions such as time, memory,
  output, runtime, compile, wrong-answer, judge/system, and other failure;
  pending text remains non-final and page-body scanning remains forbidden.
- An isolated unpacked-extension run exposed a second compatibility failure:
  `chrome.storage.local.setAccessLevel` is absent in some Chromium runtimes.
  Initialization now capability-checks it, while supported browsers still
  receive trusted-only storage access.
- Content and popup fire-and-forget Chrome promises now terminate at one error
  boundary. All content-script DOM, mutation, timer, and navigation callbacks
  share a lifecycle guard: an invalidated unpacked-extension context retires
  silently, while unrelated failures stay visible. Popup buttons show a short
  lighter pressed state and live `已触发：<操作>` feedback without claiming the
  server sync already succeeded.
- Authorized inspection found two real content-script errors, both `Uncaught
  Error: Extension context invalidated.` at `content.js:5390`, on LeetCode
  result IDs `737406436` and `737482394`. This explains why the service-worker
  console was empty. After rebuilding, the extension was reloaded, the two old
  entries cleared, and the existing LeetCode result page refreshed; the
  extension manager showed no new `Errors` button or entry.
- Synthetic unpacked-extension smoke PASS: initialization completed; submit
  changed active/outbox `0/0 → 1/0`; the exact TLE result changed it to `0/1`
  with verdict `Time Limit Exceeded`; popup pressed feedback was visible; no
  page, popup, or service-worker error was captured.
- `npm run extension:check` PASS after the lifecycle repair: 19 files / 456
  tests, typecheck, MV3 build, and dist parity. The final authoritative
  `npm run quality:gate` exits 0: 68 unit files / 1031 passed / 1 capability
  skip, 25 Playwright E2E, 19 extension files / 456 passed, lint,
  disposable migration, curriculum validation, typecheck, MV3 build/dist
  parity, and 20/20-page production build. Evidence:
  `work/reports/v0-leetcode-result-route-extension-error-repair-2026-07-23.md`.
- Owner Report 03 remains real repair QA, not formal same-SHA observation. The
  local implementation commit containing this handoff is the replacement-RC
  freeze point; it has not been pushed. V0 acceptance and V0.5 work have not
  occurred.

## Previous Status (2026-07-22 capture ACK P1 repair)

**BLOCKED: the V3 migration was observed to clear all 32 legacy events, but a
real submission exposed an ACK persistence bug and a high-frequency retry
storm. The client fix is implemented in the uncommitted worktree; repaired
Chrome verification remains mandatory before any RC or observation.**

- Branch/HEAD remain `feature/v1-followup` at
  `894162b264124eed7315a116cae73b8e11d717b8`; no replacement RC exists until
  the implementation is explicitly committed.
- New extension runtime creates only a local submission intent on an exact
  submit click. A new evidence-backed final verdict creates one atomic attempt
  bundle for `POST /api/capture/attempts`; page lifecycle activity is not a
  user-level queue item.
- Protocol V3 initialization was reloaded in the user's real Chrome and the
  popup/storage observation confirmed all 32 legacy `eventQueue` entries were
  removed. That migration result is complete and must not be repeated or
  confused with capture delivery validation.
- The same real run exposed one completed bundle stuck in `captureOutbox` while
  `/api/capture/attempts` returned HTTP 200. About 11,972 identical requests in
  about 260 seconds proved an infinite drain loop. Root cause: the success plan
  wrote unused `outbox`/`quarantine` storage keys instead of
  `captureOutbox`/`captureQuarantine`.
- The uncommitted fix maps success state to the real storage keys, validates the
  ACK bundle identity, adds bounded ACK-error backoff, and prevents concurrent
  drain re-entry. Quarantine retry now also persists only `captureOutbox` and
  `captureQuarantine`, resets all retry-blocking fields, and enters one
  single-flight drain. The authoritative `npm run quality:gate` exits 0: 67
  unit files / 1002 passed / 1 Windows capability skip, 25 Playwright E2E, and
  18 extension files / 429 passed after adding both required regression tests.
  The pre-test Commander baseline was 18 files / 427 tests; quarantine retry
  raised it to 428 and the stale-key upgrade fixture raised it to 429. The file
  count was never 20.
  Evidence: `work/reports/v0-capture-ack-repair-2026-07-22.md`. Real repaired
  Chrome closure has not yet been observed.
- V3 initialization now writes and preserves authoritative `captureOutbox` and
  `captureQuarantine` before deleting historical plain `outbox` and
  `quarantine` keys. It never reads or merges stale-key contents. A real-bundle
  upgrade fixture proves the retained bundle receives one matching ACK, clears
  the authoritative outbox, and produces zero requests on the next drain.
- No Worker is in flight. No commit or push was performed. Full bilingual UI
  implementation remains deferred.
- No Chrome action is authorized in this repair round. The remaining controlled
  gate is a separately authorized reload of the gate-passing `extension/dist`
  to verify that the existing outbox item receives one matching ACK and is
  removed without further timer requests.

## Last Frozen RC Status (2026-07-20)

**V0 domestic-OJ engineering and passive characterization frozen at replacement RC;
observation, final verification, and acceptance pending.**

- Last frozen implementationSha: `894162b264124eed7315a116cae73b8e11d717b8`. It has a confirmed ACK persistence defect and cannot proceed to observation or acceptance, but it remains the last frozen RC until an authorized repair commit creates a replacement. Superseded SHA `b5166320768355666a5c4ff3f466c29c240ea8cf` also must not anchor acceptance.
- Observation templates at `work/reports/v0-observation-owner.md` and `work/reports/v0-observation-participants.md` contain no sessions or participant windows.
- `work/reports/v0-exit-report.md` recorded `ACCEPT_CANDIDATE` before those required observations; treat it as a superseded premature record, not a valid candidate decision.
- Active plan: `docs/superpowers/plans/2026-07-21-v0-verdict-gated-capture-repair.md`. The closeout plan remains paused until this repair has a frozen replacement RC.
- V0 is **not** complete or accepted. After validated observations exist, F1–F4 must all approve the same implementation SHA and the user must explicitly accept it.
- Frozen stabilization RC: full quality gate PASS on 2026-07-18 after
  repairing the plan-completion row-ID regression and related known issues.
  Evidence: `work/reports/v0-engineering-gates.md` and
  `work/reports/v0-stabilization-2026-07-18.md`.
- Release-validator coverage: `tests/unit/v0ReportValidators.test.ts` contains
  21 real temporary-repository cases for the strict two-commit contract. The focused
  suite, lint, and typecheck pass.

## Workspace

- Branch: `feature/v1-followup`; immutable repaired candidate is
  `4e7a47bfc22fece4aa60e4bab2f4223668be480b`. Tasks 17-20 are complete and
  reviewed; Task 21 records LeetCode PASS, blocked-platform drift PASS, and
  NowCoder FAIL. D4 is incomplete. The worktree contains only the uncommitted
  Task21 report, blocked investigation plan, fail-closed test guard, and this
  handoff update; no production file changed.
  Candidate `f18eddf4cb4d7dd24c439b2dea5917793839e6a2` is historical after the
  runtime/manifest repair, and `22fa470d24724c15b5bdb2874e6817b599505f3c`
  never became a candidate because its explicit path-ownership preflight
  failed before the quality gate.
- Phase C closeout: the commit containing this handoff is the engineering
  freeze point; it is not a replacement RC and has not been pushed.
- Default database: preserved by the Phase C and D automated gates; the D1-C
  real-profile debug performed only a read-only metadata comparison and no
  default-database edit/write. The development extension residual was removed;
  the real-profile debug remains excluded from D1-C evidence.
- Observation-9 environment (2026-08-09): disposable SQLite
  `.tmp/observation-9/training-platform.sqlite` (migrated, 462848 bytes,
  all three capture tables empty). The verified observation service tree rooted
  at PID 48076 was stopped on 2026-08-10 and port 3000 is no longer listening;
  stdout remains `.tmp/observation-9/server.out.log`. No
  `POST /api/capture/attempts` ever reached it. Observation evidence retained
  for the failure record; no evidence file was deleted.
- Operator-only browser profiles and temporary test state remain excluded from
  the commit.

## Current Phase

- Phase 0: **complete and reconciled green on 2026-07-17.** AtCoder remains
  the sole certified production DOM adapter.
- V4 Phase C: **C0-C5 engineering-complete.** LeetCode and NowCoder are
  network-`experimental`; AtCoder, Codeforces, and Luogu are network-`blocked`.
- V4 Phase D: **D1 and D2 complete; historical D3 candidate engineering
  complete; D4 coordinator repair Tasks 0-10 complete; 9th observation FAILED;
  Task 12 plan gate APPROVED; Tasks 13 and 14 engineering COMPLETE and
  independently APPROVED; Task 15 initial re-freeze complete; Task 16 failed
  twice; Tasks 17-20 repair/review/re-freeze COMPLETE (2026-08-10); Task 21
  LeetCode and blocked-platform lanes PASS but approved-pilot NowCoder FAIL.** The 9th
  real observation (merge-two-sorted-lists,
  `cn/741081653`) confirmed E2 and E3 but produced no bundle: a stale
  historical "Accepted" result panel misclassified as a transition created a
  candidate predating the submit, and the real result's identical verdict text
  was deduped away. Coordinator failed closed by design. RED test + written
  plan revision and causal RED are now approved. Task 13 adds an exact
  LeetCode submit-epoch control plane and closes same-verdict repeat causality,
  including A/B exclusivity and the 32-entry capacity edge. Task 14 binds each
  new candidate to its exact persisted request identity and closes restart and
  legacy pre-E1 cleanup. Tasks 17-20 add the strict top-level result route and
  same-identity-only SPA epoch preservation on immutable candidate `4e7a47b`.
  The NowCoder false negative leaves waiting 1 after the exact final result
  document. Capture-disabled sanitized evidence proves `/acm/problem/list` is
  misclassified as a problem and causes resolver ambiguity before E3.
  D4 end-to-end engineering delivery remains unproven. D5 F1-F4 and final user
  acceptance remain blocked.
- V0 manual learning loop vertical slice: **implemented but not accepted.**
  Formal observation and replacement-RC work remain gated.

## Commit Chronology

### V4 Phase D Tasks 12-14 (2026-08-10)

- Task 12 reviewed RED and frozen repair contract:
  `1d6e9571c36fc3feb1ad0c99dd4f3ddd8393cfdb`.
- Task 13 submit-epoch control implementation:
  `fe36f6b4770d3d929479464c03e8bea6dbb97ba9`.
- Task 13 documentation closeout: `515a3ff`.
- Task 14 exact candidate binding implementation:
  `0f695ddfad6989e407424feff457d28d081d657b`.
- Task 14 documentation closeout:
  `23c81fa67f85c6e9396d39eadc446371b2f55e73`.

### V4 Phase D Tasks 15-20 (2026-08-10)

- Task 15 initial repaired candidate: `f18eddf4cb4d7dd24c439b2dea5917793839e6a2`;
  documentation closeout: `e4b863a98c43e95047e65d6ea339bf7b16cd8007`.
- Task 16 failure evidence and Task 17 approved causal RED: `42d45bb`.
- Task 18 top-level LeetCode result repair: `22fa470`.
- Task 20 exact candidate-path ownership repair and immutable candidate:
  `4e7a47bfc22fece4aa60e4bab2f4223668be480b`.

### Phase 0D (2026-07-15)

- Task 1 — strict lint gate and polling corrections: `b3c1993`, `d3a201f`, `e7c14b5`.
- Task 2 — migration upgrade matrix: `dca2236`.
- Task 3 — extension test/build/dist parity: `59a6ecc`.
- Task 4 — aggregate quality gate, Windows CI, and link-safe cleanup correction: `970a9bf`, `7cb6169`.
- Task 5 — operational docs/status reconciliation and unit-count correction: `cd66285`, `7394e22`.
- Task 6 — independent final verification evidence: `1e3c950`.
- Post-review evidence corrections: `71c6287`, `45b19a6`, `0ce73fb`. These corrections preserve that Task 4 and Task 6 used metadata-only `Get-Item`, while the later final review-work QA lane mistakenly used `Get-FileHash` once and then reverted to metadata-only comparison.

### Phase 0 AtCoder certification (2026-07-16 to 2026-07-17)

- Plan: `3c1cc61` (`docs: add AtCoder production certification plan`)
- T1 — public AtCoder DOM fixture corpus: `eda36a7` (`test: add AtCoder DOM fixture corpus for Phase 0 production certification`)
- T2 — platform-scoped fixture metadata core + AtCoder fixture corpus + plan record: `f6f77a6` (`test: extract platform-scoped fixture metadata core with Luogu compatibility wrapper`), `227a4ce` (`test: add AtCoder fixture metadata wrapper and extension fixture corpus`), `2902cec` (`docs: mark T2 complete in AtCoder production certification plan`)
- T3 — submission identity bridge + page-aware detection wiring + plan record: `41524c2` (`fix: resolve AtCoder submission identity`), `f78af2d` (`fix: wire page-aware problem detection`), `38ac1a8` (`docs: mark T3 complete in AtCoder certification plan`)
- T4 — scoped verdict isolation + plan record: `4357ffa` (`fix: scope AtCoder verdict detection`), `49545ea` (`docs: mark T4 complete in AtCoder certification plan`)
- T5 — capture lifecycle continuity + plan record: `fca0943` (`test: lock AtCoder capture continuity`), `63327f3` (`docs: mark T5 complete in AtCoder certification plan`)
- T6 — shared evaluator + AtCoder certification gate + plan record: `efe0716` (`refactor: share platform certification evaluator`), `8ccde10` (`test: certify public AtCoder adapter evidence`), `0b5074c` (`docs: mark T6 complete in AtCoder certification plan`)
- T7 — promotion to production + promotion guard artifact + pipeline E2E + plan record: `06fc306` (`feat: promote certified AtCoder adapter`), `e72cfc1` (`test: guard AtCoder certification artifact`), `41009d1` (`test: verify AtCoder capture pipeline`), `29f6075` (`docs: mark T7 complete in AtCoder certification plan`)
- T8 — authoritative gate run + documentation reconciliation: `7eddee1` (`docs: record Phase 0 AtCoder certification`), `3aaa7c5` (`docs: update adapter status guidance`), `62c3e83` (`docs: close Phase 0 product roadmap`), `a46896b` (`docs: mark T8 complete in AtCoder certification plan`)
- T8 agent/handoff reconciliation: `d7bebcc` (`docs: reconcile Phase 0 agent handoff`)
- F1–F4 final verification evidence and plan record: `ad6839ad443e99dd39a3b073ca38b1d2afd19944` (`docs: record Phase 0 final verification`)

## Accepted

- Phase 0D engineering gates (2026-07-15): lint, migration matrix, extension parity, aggregate quality gate, Windows CI, documentation, independent verification
- Phase 0 AtCoder production certification (2026-07-17): T1–T7 implemented and verified
- T8 authoritative Phase 0 gate (2026-07-17): `extension:check` and `quality:gate` both PASS with fresh counts above; default DB metadata unchanged; AtCoder sole production; Luogu experimental with SHA-identical BLOCKED evidence
- T8 documentation reconciliation (2026-07-17): 11 files updated, stale-claim audit passed, all docs consistently state Phase 0 green/completed
- F1–F4 final verification (2026-07-17): all four lanes (plan compliance, code quality/security, hands-on QA, scope/docs fidelity) independently **APPROVE** against commit `45cdd92a161f27622dbe5706a805eab523220910`. No blockers; no required fixes. Evidence recorded in `work/reports/phase-0-atcoder-certification.md#final-verification-f1` through `#final-verification-f4`.
- User acceptance (2026-07-17): the user explicitly accepted the Phase 0 verification result. Phase 0 is technically verified, documented, and accepted.

## In Flight

- D3 candidate `a911425a415db2ee374430ced62edcaa7b786866` and exact dist are
  frozen, and D4 same-SHA engineering observations are complete. Root retains
  D5 F1-F4, evidence/status reconciliation, and the final explicit user gate.

## Next Commander Action

1. Run D5 F1-F4 independently against candidate `a911425...` and the Task 23
   evidence set.
2. Run final readiness, privacy, and full quality commands; reconcile required
   status documents without changing runtime or dist.
3. Require all four lanes to return `APPROVE`, commit evidence-only status, and
   stop at the explicit final user acceptance gate.
4. Do not push, create a PR, deploy, label the work RC/accepted/released, resume
   formal V0 observation, or enter V0.5.

## Known Risks

- LeetCode and NowCoder are network-`experimental`; authenticated evidence
  does not certify either for production. AtCoder, Codeforces, and Luogu are
  network-`blocked` under their platform-specific identity constraints.
  AtCoder is still the sole production DOM adapter; LeetCode, Codeforces,
  NowCoder, and Luogu remain DOM-experimental.
- NowCoder remains experimental even though the exact approved pilot now has
  one same-SHA D4 PASS. Generic `acm/problem/<id>` network support remains out
  of scope; global pilot-link precedence remains explicitly unsafe.
- Luogu production-adapter certification remains BLOCKED on missing public
  verdict DOM (historical record preserved in
  `work/reports/luogu-adapter-blocker.json`).
- The Windows file-symlink capability test may remain skipped under EPERM;
  mandatory junction safety tests must pass.
- The current extension E2E lane has 53 runnable passing tests and one known skipped
  service-worker-restart harness case; the skip is not production evidence.
- Phase 1– and 5 capability portfolios contain implemented V0 thin
  slices but are not complete; Phase 4 and 6 are future. None is an
  active line-by-line implementation plan.
- Final review-work QA hash deviation (Phase 0D): a later final
  review-work QA lane once mistakenly invoked `Get-FileHash` on the
  default `training-platform.sqlite` during its initial state capture;
  the hash was discarded immediately, no write occurred, and default
  DB `Length` 73728 / `LastWriteTimeUtc` 2026-07-13T17:49:36.9126118Z
  remained unchanged.
