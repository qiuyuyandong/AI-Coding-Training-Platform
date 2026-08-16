# V4 Phase D D4 Platform-Specific Acceptance Rescue Plan

**Status:** `REVISION 4 P4 COMPLETE — P0A-P4 PASS; P5 CANDIDATE FREEZE, LIVE, AND D5 NOT AUTHORIZED`

**Date:** 2026-08-16

## 1. Goal and authority

On 2026-08-16 the user explicitly accepted `ISOLATED` as the replacement D4
minimum and authorized P0A C0 readiness alignment. This changes the future D4
acceptance contract without relabelling historical Route A evidence. The
historical `NO_SAFE_DIRECT_WITNESS`, `WINDOW_CORRELATED_FACTS_AUXILIARY_ONLY`,
`TASK26_LIVE_PROTOCOL_ASSUMPTION_UNPROVEN`, receipts, and observations remain
authoritative for their own runs; they do not satisfy the new contract. The
replacement supersedes only the future D4 acceptance and next-action semantics
in section 10 and sections 14.33-14.34 of the standalone Phase D plan. It does
not authorize candidate freeze, live observation, D5, RC, release, push, or PR.

The authorized replacement D4 contract is:

```text
D4 Core Invariants
  + LeetCode Acceptance Profile
  + NowCoder Acceptance Profile
```

The authorized rescue scope contains only LeetCode and the approved NowCoder
pilot `acm/contest/18839/1001`. AtCoder, Codeforces, and Luogu retain their
existing network-`blocked` conclusions and receive no live action in this
plan. Their future migration requires separate platform delta plans after
Phase D.

## 2. Causality and status contract

Every platform lane receives one causal grade:

- `DIRECT`: a non-temporal identity joins the exact action to the exact
  submission lifecycle. No current browser-native profile can claim it.
- `ISOLATED`: one controlled action, a zero/fresh baseline, no competing
  submission, one new stable submission lifecycle, and the complete durable
  product chain jointly establish intervention-bounded evidence.
- `UNRESOLVED`: one or more isolation premises are absent, ambiguous, reused,
  crossed, or contradicted.

The authorized D4 minimum for future evidence is `ISOLATED`. Historical
window-correlated facts remain `AUXILIARY_ONLY` and cannot be promoted by this
decision. `DIRECT` remains a higher diagnostic capability and is recorded as
`CAPABILITY_BLOCKED` under the current Chrome and D2 privacy boundary.
`ISOLATED` must never be described as direct causality.
Its explicit residual risk is an unrelated same-platform lifecycle appearing
inside the isolated action epoch despite the zero baseline and no competing
user action.

Under the authorized contract, platform verdicts are closed:

```text
PASS
PROFILE_UNRESOLVED
PRODUCT_FAIL
OBSERVER_INVALID
ENVIRONMENT_BLOCKED
PLATFORM_BLOCKED
```

`PRODUCT_FAIL` requires a contradiction after a stable submission identity is
locked, a deterministic offline invariant failure, duplicate durable effects,
missing delivery from a proven E2/E3 chain, or non-empty terminal recovery
state. Failure to bind ActionEpoch to one stable SubmissionEpoch is
`PROFILE_UNRESOLVED`, not a fabricated product diagnosis.

The aggregate D4 status is `NOT_STARTED`, `PARTIAL`, or `COMPLETE`. One platform
PASS produces `PARTIAL`; both platforms must PASS on the same product candidate
SHA and exact dist hashes to produce `COMPLETE`.

## 3. Non-overridable D4 Core Invariants

Every platform profile must prove all of the following and may not weaken
them:

1. exact candidate SHA, exact five dist hashes, exact acceptance-profile hash,
   and exact observation-tool hash before and after the lane;
2. one named platform/problem, one fixed disposable profile, one adjacent
   disposable database, business counts `0/0/0`, and browse-only queue/database
   delta zero;
3. one intervention-bounded ActionEpoch with at most one authorized action,
   no competing action or submission, and exactly one new eligible stable
   submission identity that was absent from the pre-action baseline;
4. exact platform/problem/submission binding through E2 and one final E3;
5. exactly one four-event bundle, one `POST /api/capture/attempts` with HTTP
   200, one ACK, and SQLite delta `+4 capture_events / +1 session / +1 attempt`;
6. event kinds exactly `SESSION_STARTED`, `SUBMISSION_OBSERVED`,
   `VERDICT_OBSERVED`, `SESSION_ENDED`, action `submission_confirmed`, one
   non-voided attempt, and nondecreasing timestamps;
7. terminal waiting/outbox/quarantine `0/0/0`, no blocking diagnostic, no
   post-ACK mutation, and no duplicate effect;
8. owner-only platform interpretation, namespaced identities, hostile-input
   fail-closed behavior, D2 privacy compliance, and no blocked-platform live
   submission.

Forbidden acceptance shortcuts remain: latest/highest row, time-only or
window-only inference, popup-only success, database counts without event
identity, V3 `submit_clicked`, click-derived waiting, raw transcript evidence,
or one platform satisfying another platform's profile.

## 4. LeetCode acceptance profile

The real D4 lane certifies one exact host and one exact problem slug; it does
not certify every LeetCode host from one observation.

1. One trusted visible exact `提交` control on the exact problem document
   creates a bounded `ActionEpoch`. It may capture the pre-action result-surface
   baseline but may not create waiting, E2, outbox, or an attempt.
2. A result/check lifecycle may create `SubmissionEpoch` only when it is
   same-scope, same-tab/frame/document, post-action, unique, absent from the
   baseline, carries one stable numeric submission ID, and binds the exact
   problem slug.
3. The exact REST submit request and GraphQL request are optional
   corroboration. Their absence cannot fail an otherwise complete stable-ID
   chain; their identity conflict or multiple eligible stable IDs is terminal.
   When both are absent, an `ISOLATED` claim still depends on the pre-action
   browse-only baseline, one intervention-bounded action epoch, one unique new
   stable ID, and the exact changed final result surface. It does not become a
   click-to-request witness or qualify as `DIRECT`.
4. E2 locks the namespaced `cn/<id>` or `com/<id>` identity. E3 must use that
   exact identity and a changed final result surface. Same-problem,
   same-verdict repeats must remain capturable.
5. Historical result pages, baseline IDs, stale panels, result-before-action,
   wrong problem/host/scope/document, multiple new IDs, and ambiguous
   lifecycles must fail closed.

The implementation may add a bounded ActionEpoch/SubmissionEpoch control seam
and adjust LeetCode result confirmation. It must preserve the legacy exact
REST/check path. It must not add permissions, request mutation, debugger or
tracing, body/header/cookie/token/code access, broader DOM fallbacks, database
schema, API schema, or third-party calls.

## 5. NowCoder acceptance profile

The only target is `acm/contest/18839/1001`.

1. One trusted exact `保存并提交` E0 precedes the exact
   `POST /nccommon/submit_cd` and `GET /nccommon/status` lifecycle.
2. One completed submit/status pair in the same browser document yields one
   new numeric submission ID and locks E2.
3. E3 must come from the exact `view-submission` identity for that numeric ID,
   retain the approved pilot problem identity, and normalize one final verdict.
4. Wrong pilot, global list, reserved navigation paths, missing E0, crossed
   document/problem, duplicate submit/status/ID, historical result, and
   unrelated page content fail closed.

NowCoder host, path, pilot, permission, and adapter scope do not broaden in
this rescue. Production code changes are permitted only if an offline RED
proves the existing exact pilot cannot satisfy this profile.

## 6. Machine-readable profiles and observation tooling

The machine-readable D4 target acceptance contract is
`authorized_for_offline_work_only`; both profiles are `authorized_offline`.
The validator rejects an unknown platform/status/causal grade, duplicate
profile, non-`ISOLATED` profile causal grade, missing core invariant,
incomplete forbidden-fallback list, missing authorization/characterization
source, readiness misalignment, or removal of the separately gated candidate
freeze, live observation, and D5 states. It verifies status equality with
`v4-adapter-readiness.json`; it does not claim to infer semantic policy
equivalence from prose.

P0A aligned the LeetCode P1 target `requestMatcher` and `e2Policy` through the C0 contract
path using
`docs/superpowers/plans/2026-08-16-v4-leetcode-d4-readiness-contract-alignment.md`,
which derives from the platform migration template. The profile and validator
now record the authorized offline state, closed `ISOLATED` causal grade, and
`aligned` readiness disposition; both readiness and D4 profile validators
pass. This is target-contract alignment, not proof that the current runtime
already enforces the complete baseline/new-ID/no-competing-action invariant.
NowCoder remains aligned and must not broaden.

The observation reducer must report only cumulative bounded facts and the
closed verdict/causal grade. It may use opaque request identity in memory but
must not export raw request/tab/frame/document identity, URL, timestamp,
verdict DOM text, source code, problem text, body, headers, credentials,
account data, browser storage, or database path.

The existing `extension:observe` command remains a fail-fast tombstone and
must not regain build-and-run behavior. If P0A is authorized, P3 separately
reviews the replacement `extension:observe:d4` command,
`scripts/v4-live-observation*.mjs`, and their tests as observation tooling,
not as product-candidate files. That tool must never build an extension. It
requires explicit candidate SHA, exact dist path and hashes, profile/tool
hashes, fixed profile/database identity, and a READY-only default. One
platform-specific action-time authorization permits at most one action and
expires on any identity/hash/READY drift or first failure. No silent retry is
allowed. The current working-tree tombstone and tool deltas remain feasibility
evidence only until P3 receives separate review; this draft does not authorize
their commit, execution, restoration, or deletion.

## 7. RED/GREEN and candidate invalidation

P0A changed no production code. P1 subsequently executed under the accepted
offline authority. RED preceded the additional production changes. Required
cases include zero/one/multiple
actions, zero/one/multiple new IDs, baseline-ID replay, result-before-action,
wrong platform/problem/document, identity replacement, duplicate/out-of-order
storage, coalesced callbacks, service-worker restart, same-problem/same-verdict
repeat, stale result panel, E3 before E2, duplicate bundle/POST/ACK, non-empty
queues, hostile getters, unknown keys, and privacy-forbidden fields.

The LeetCode RED must prove that the frozen exact-REST requirement rejects the
approved result-bearing root. GREEN must accept the unique new result/check
identity without REST while preserving all conflict and historical negatives.
The NowCoder focused suite must remain green without scope broadening.

Any production runtime, adapter, control-plane, manifest, permission, schema,
build, or artifact change invalidates `aa1a572...` and all earlier D4 evidence.
After offline gates pass, freeze one new candidate and rerun the complete D3
validator. Harness/documentation-only changes retain separate hashes and do
not invalidate product identity when the candidate-isolation diff is empty.

## 8. D4 closeout boundary and D5 stop

D5 remains stopped and unstarted. This plan neither creates `D5-P`, designs a
replacement D5 sequence, nor authorizes F1-F4. If both platform lanes later
PASS on one separately authorized candidate/dist, produce only a D4 integrated
closeout package covering cross-platform isolation, blocked-platform drift,
privacy, the final candidate contract, and unresolved evidence limits. Then
request a separate user decision on whether planning for D5 may begin.
Automated PASS, reviewer APPROVE, D4 COMPLETE, user authorization to plan D5,
RC, Accepted, and Released remain distinct states.

## 9. Verification and stop gates

Offline verification must include focused profile/adapter/control/runtime/
observer tests, typecheck, targeted ESLint, syntax checks, privacy audit,
`extension:check`, `extension:e2e`, `quality:gate`, readiness validation, and
the exact new-candidate validator. Reports record real commands, exit codes,
counts, skips, hashes, and default-database preservation; an unrun check is
reported as unrun.

This implementation stops before any real platform action. Live observation
requires reviewed tooling, a new immutable D3 candidate, a fresh READY receipt,
and a separate action-time user authorization naming the exact platform and
target. It does not authorize push, PR, deployment, publication, V0.5, or any
blocked-platform action.

## 10. Executable work packages and ownership

The work resumes in this order. A later package may not reinterpret an earlier
package's missing evidence as success. P0A completion makes P1 eligible; it
does not complete P1-P8 or remove their own gates.

| Package | Scope | Exit evidence | Current state |
| --- | --- | --- | --- |
| P0 Contract proposal | Freeze proposed core invariants, causal grades, platform verdicts, draft/deferred profiles, forbidden shortcuts, and explicit residual risk | revision 3, machine-readable draft-profile validator, and retained plan-consultant re-audit | complete and accepted by the user on 2026-08-16 |
| P0A Authority and readiness decision | Record explicit acceptance of `ISOLATED`, align the LeetCode C0 readiness matcher/E2 policy, and transition profile/validator to authorized offline state | recorded user decision plus aligned readiness/profile/validator PASS | complete; `34/34` focused tests, both CLIs, typecheck, and lint PASS |
| P1 LeetCode offline RED/GREEN | Prove REST-required RED, result-root GREEN, conflicts, replay, repeat verdict, and exact E2/E3 binding | focused adapter/control/runtime/coordinator/orchestrator tests | complete on the uncommitted working tree; RED `3 failed / 120 passed`, GREEN focused `248/248`, extension `1615/1615`, extension E2E `53/1`, privacy `0 findings`; not a frozen candidate |
| P2 NowCoder non-regression | Prove the exact pilot profile remains unchanged | focused NowCoder suite and extension E2E | complete; zero NowCoder production diff, focused `504/504`, extension `1615/1615`, extension E2E `53/1`, privacy `0 findings`; no new live claim |
| P3 Observer contract | Keep `extension:observe` fail-fast; separately review the build-free `extension:observe:d4` tool for READY default, exact hashes/identities, one-action authorization, bounded output, and hostile-input rejection | separate observation-tool diff/hash, observer tests, privacy audit, syntax, targeted lint; no product-candidate ownership | complete; focused `43/43`, privacy `0 findings`, both contract CLIs, both syntax checks, typecheck, targeted lint, diff-check PASS; independent tool review `APPROVE` with no HIGH/MEDIUM |
| P4 Independent plan/tool review | External cross-review of the revised authority, readiness, observer, privacy, and stop contracts | retained reviewer verdict with required changes resolved or explicitly blocked | complete; independent read-only review covered all five contracts and returned conditional PASS; Build ran the four offline verifications (4/4 hashes match, focused `77/77`, both CLIs + privacy PASS, extension diff = exactly six P1 LeetCode files); retained verdict `APPROVE` with no HIGH/MEDIUM and one deferred non-blocking advisory |
| P5 Candidate freeze | After P0A-P4, isolate product-owned diff, commit one immutable candidate, build exact dist, record five hashes, and rerun D3 | `node scripts/validate-v4-candidate.mjs --candidate <sha>` PASS plus default-database length and `LastWriteTimeUtc` preservation receipt | not authorized or started |
| P6 READY-only preflight | Run one fresh fixed profile/database lane without action | profile/tool/dist hashes unchanged, database `0/0/0`, browse-only delta zero, `READY=1`, `ACTION_AUTHORIZED=0` | not started |
| P7 Platform observations | One separately authorized action for one named target per lane; no retry | closed platform verdict and bounded evidence | not authorized |
| P8 D4 integrated closeout | If both lanes PASS on one candidate, reconcile D4 evidence and request a separate decision on whether D5 planning may begin; do not run F1-F4 | reviewed D4 closeout and explicit D5-planning request that grants no authority by itself | not authorized or started; D5 remains stopped until a separate future plan is reviewed and authorized |

Product-candidate files and observation/plan files must remain separable. A
harness or documentation adjustment after the candidate freeze is permitted
only when the candidate-isolation diff is empty and its profile/tool hashes are
refrozen. A production change invalidates every prior platform PASS and D4
closeout review for that candidate.

## 11. Review findings and revision 2 disposition (2026-08-16)

The initial internal `PLAN_APPROVE` is superseded. Independent plan review
returned `REVISE`; it did not authorize implementation. Revision 2 resolves
the directly actionable findings as follows:

1. the plan no longer supersedes Route A without an explicit recorded user
   decision, and the machine profiles remain draft;
2. `D5-P` is removed; D5 remains stopped and requires a separate future
   planning authorization after D4 closeout;
3. LeetCode readiness policy drift is explicit and blocks profile activation
   and candidate freeze until the C0 contract is updated and reviewed;
4. the validator's claim is narrowed to structural, status, disposition, and
   closed-list checks rather than semantic inference over readiness prose;
5. the validator type declaration matches the implementation's optional
   `repoRoot?: string` parameter, whose implementation default is
   `root = process.cwd()`, and forbidden fallbacks are closed per platform;
6. `intervention_bounded_action_epoch` is a machine-locked core invariant,
   and the P0A-to-C0 transition is a sequential fail-closed gate.

The review's proposed `submitEpochReplay.ts` candidate-whitelist blocker was
rejected after direct Git verification: that production file is tracked in
commit `0f695ddfad6989e407424feff457d28d081d657b` and is not part of the current
working-tree candidate diff at base
`355d58c03ea735e97028bb593d6448ea84f53e4f`; the command
`git status --short -- extension/src/submitEpochReplay.ts` returns no entry.
Any future candidate still must pass the exact path-ownership validator against
its real committed diff.

The following implementation stop gates remain:

1. `G1_CANDIDATE_NOT_FROZEN`: the current changes are an uncommitted working
   tree on `feature/v1-followup` at base
   `355d58c03ea735e97028bb593d6448ea84f53e4f`. They invalidate
   `aa1a572...` but do not yet constitute a new candidate.
2. `G2_FINAL_GATES_UNRUN`: focused tests, extension checks, extension E2E,
   syntax, targeted lint, and privacy audit are useful feasibility evidence;
   they do not replace the complete root quality gate, readiness validation,
   exact candidate validator, default-database receipt, or exact dist hashes.
3. `G3_LIVE_TOOL_UNADJUDICATED`: the READY/action harness has automated tests
   but no independent review or real READY-only run. It therefore remains
   forbidden for a platform action.
4. `G4_AUTHORITY_NOT_GRANTED` is resolved for offline work: the user accepted
   `ISOLATED` on 2026-08-16. Candidate freeze, live observation, and D5 retain
   separate authorization gates.
5. `G5_READINESS_POLICY_DRIFT` is resolved: the C0 matcher/E2 policy, D4
   profile, validator, architecture, and adapter design amendment now align.

The first plan-consultant re-audit returned `READY_FOR_USER_DECISION` while
recommending the intervention-bound invariant and sequential C0 closure now
recorded above. Its follow-up review confirmed both closures and returned
`READY_FOR_USER_DECISION` with no remaining HIGH/MEDIUM blocker. Review
approval establishes plan quality only and cannot substitute for the P0A user
decision.

## 12. Evidence at the user-requested implementation pause

The following commands completed before the user narrowed the scope to plan
writing and review. They are feasibility evidence only:

- Historical D4 profile/LeetCode/control/coordinator/observer focused run:
  `189/189`; its exact combined command is not retained in this plan, was not
  reproduced in this audit, and is not an approval basis.
- Revision 3 draft-profile validation:
  `node scripts/validate-v4-d4-acceptance-profiles.mjs --all`: PASS.
- Revision 3 validator unit command:
  `npm exec vitest run -- --no-file-parallelism tests/unit/v4D4AcceptanceProfileValidator.test.ts`:
  `9/9` PASS.
- `npm run typecheck`: PASS.
- targeted ESLint: PASS with zero warnings.
- `node scripts/audit-v4-extension-privacy.mjs`: PASS, `0 findings`.
- `npm run extension:check`: `48` files, `1604/1604` tests, production
  extension build and dist parity PASS.
- `npm run extension:e2e`: `53` passed, `1` known harness skip.

Not run: root `npm run quality:gate`, root unit total, app E2E, app production
build as an isolated final gate, readiness CLI, exact new-candidate validator,
candidate commit, exact dist hash receipt, READY-only real run, any platform
action, D4 integrated closeout, D5 planning or execution, user acceptance,
push, PR, deployment, or release.

The current stop is deliberate. Existing working-tree changes are preserved as
requested and must not be called accepted, candidate-frozen, D4 PASS, RC, or
released. P0A, P1, P2, P3, and P4 are complete. Candidate isolation cannot
begin until its separate authorization gate is removed; P6/P7
remain gated by the full offline commands and receipts listed above.

## 13. P0A authorization and C0 alignment (2026-08-16)

The user replied `接受` after being shown the exact authorization statement:
accept `ISOLATED` as the replacement D4 minimum and authorize P0A C0 readiness
alignment, while candidate freeze, real observation, D5, release, and push
remain unauthorized. This is the authorization source for
`authorized_for_offline_work_only`; it is not retroactive evidence and does not
promote historical Route A observations.

P0A changed no `extension/src/**` file. It aligned the canonical LeetCode
readiness matcher/E2 prose, the D4 profile state, the validator, architecture,
the dated adapter-design amendment, and focused tests. Exact evidence:

```text
node scripts/validate-v4-adapter-readiness.mjs --all
  V4 adapter readiness PASS
node scripts/validate-v4-d4-acceptance-profiles.mjs --all
  V4 D4 acceptance profiles PASS
npm exec vitest run -- --no-file-parallelism tests/unit/v4AdapterReadinessValidator.test.ts tests/unit/v4D4AcceptanceProfileValidator.test.ts
  2 files / 34 tests PASS
npm run typecheck
  PASS
npm exec eslint -- scripts/validate-v4-d4-acceptance-profiles.mjs tests/unit/v4AdapterReadinessValidator.test.ts tests/unit/v4D4AcceptanceProfileValidator.test.ts --max-warnings=0
  PASS, zero warnings
```

This evidence closes P0A only. P1, candidate freeze, live observation, D5,
F1-F4, RC, release, push, and PR were not run or authorized by this step.

## 14. P1 LeetCode offline RED/GREEN completion (2026-08-16)

P1 implemented the authorized result-root branch while preserving the legacy
exact REST submit/check path. One trusted same-document ActionEpoch now owns the
pre-action verdict surface; one unique new result-distribution stable ID may
promote it after durable E2 persistence. Baseline-ID replay, multiple actions,
multiple new stable IDs, crossed REST/GraphQL/document identity, stale result
surfaces, and historical results fail closed. Coalesced lifecycle callbacks for
one stable ID remain idempotent, and same-problem/same-verdict repeats use a
narrow result-node replacement rather than verdict-text change alone.

The added RED cases first produced `3 failed / 120 passed`: multiple
ActionEpochs were accepted, baseline/multiple result identities were not
checked, and cross-document GraphQL was ignored. The minimal GREEN changes
closed those failures. Exact completed evidence:

```text
npm exec vitest run -- --no-file-parallelism tests/unit/extensionSubmitEpochReplay.test.ts tests/unit/extensionSubmitEpochControl.test.ts tests/unit/extensionContentRuntime.test.ts tests/unit/extensionLeetCodeNetworkAdapter.test.ts tests/unit/extensionVerdictCandidateCoordinator.test.ts tests/unit/extensionVerdictCandidateFlow.test.ts tests/unit/extensionBackgroundOrchestrator.test.ts
  7 files / 248 tests PASS
npm run typecheck
  PASS
npm exec eslint -- extension/src/adapters/leetcode/network.ts extension/src/background.ts extension/src/contentRuntime.ts extension/src/submitEpochControl.ts extension/src/verdictCandidateCoordinator.ts tests/unit/extensionSubmitEpochControl.test.ts tests/unit/extensionContentRuntime.test.ts tests/unit/extensionLeetCodeNetworkAdapter.test.ts tests/unit/extensionVerdictCandidateCoordinator.test.ts tests/unit/extensionVerdictCandidateFlow.test.ts tests/unit/extensionBackgroundOrchestrator.test.ts --max-warnings=0
  PASS, zero warnings
node scripts/validate-v4-adapter-readiness.mjs --all
  PASS
node scripts/validate-v4-d4-acceptance-profiles.mjs --all
  PASS
node scripts/audit-v4-extension-privacy.mjs
  PASS, 0 findings
npm run extension:check
  48 files / 1615 tests PASS; production build and dist parity PASS
npm run extension:e2e
  53 passed / 1 known harness skip
```

The first two `extension:e2e` invocations were terminated by tool timeouts at
120 seconds and 300 seconds; the unchanged command completed under a 600-second
limit with the result above. Root `quality:gate`, root unit/app E2E/build,
candidate commit, exact candidate validator, dist hash receipt, READY-only run,
and every real platform action remain unrun. P1 completion does not authorize
P5 candidate freeze, P6/P7 observation work, D5, push, PR, deployment, or
release.

Independent review initially found one HIGH baseline-completeness gap and one
MEDIUM wiring-test gap. The user selected strict rejection for a pre-action
historical result surface whose stable-ID baseline cannot be proven. The final
control message therefore carries the bounded pre-action stable-ID set; a
historical surface with an empty/unavailable identity baseline fails closed and
requires a refresh while the extension is active. The focused flow test now
uses the same result-candidate collection as `background.ts`. The follow-up
review is retained in the execution record below.

Four follow-up review rounds closed result-root restart proof, baseline replay,
legacy check replay, exact-one ActionEpoch, same-millisecond action identity,
action-only expiry, historical/other-document submit isolation, and baseline
capacity findings. The final review found no remaining HIGH or MEDIUM issue in
the P1 runtime scope. It reported one MEDIUM in the separately owned P3 live
observer: its current E2 stage does not yet require and compare one exact
result/check stable ID. That finding remains open for P3 and is not relabelled
as P1 work or silently treated as observation-tool approval.

## 15. P2 NowCoder non-regression completion (2026-08-16)

P2 verified that the approved pilot remains exactly
`acm/contest/18839/1001`. No file under the NowCoder adapter, host/path policy,
manifest scope, ingress coordinator, or bootstrap changed for P2. The shared
`background.ts` and `contentRuntime.ts` product deltas are guarded by the
LeetCode platform branch and do not broaden NowCoder behavior.

The focused matrix covers the exact `保存并提交` E0, submit/status E2 pair,
numeric stable ID, exact `view-submission` E3, reserved/global-list negatives,
wrong pilot/document/problem rejection, duplicate identity behavior, content
ingress/restart, orchestration, and manifest route. Exact completed evidence:

```text
npm exec vitest run -- --no-file-parallelism tests/unit/extensionDomesticOjAuth.test.ts tests/unit/extensionPlatforms.test.ts tests/unit/extensionContentRuntime.test.ts tests/unit/extensionNowCoderNetwork.test.ts tests/unit/extensionVerdictCandidateFlow.test.ts tests/unit/extensionContentIngress.test.ts tests/unit/extensionNowCoderNetworkFixtures.test.ts tests/unit/extensionSubmissionControl.test.ts tests/unit/extensionBackgroundOrchestrator.test.ts tests/unit/extensionBackgroundMessages.test.ts
  10 files / 504 tests PASS
npm run typecheck
  PASS
npm exec eslint -- extension/src/adapters/nowcoder/network.ts extension/src/background.ts extension/src/contentRuntime.ts extension/src/contentIngress.ts extension/src/contentBootstrap.ts tests/unit/extensionDomesticOjAuth.test.ts tests/unit/extensionPlatforms.test.ts tests/unit/extensionContentRuntime.test.ts tests/unit/extensionNowCoderNetwork.test.ts tests/unit/extensionVerdictCandidateFlow.test.ts tests/unit/extensionContentIngress.test.ts tests/unit/extensionNowCoderNetworkFixtures.test.ts tests/unit/extensionSubmissionControl.test.ts tests/unit/extensionBackgroundOrchestrator.test.ts tests/unit/extensionBackgroundMessages.test.ts --max-warnings=0
  PASS, zero warnings
node scripts/audit-v4-extension-privacy.mjs
  PASS, 0 findings
node scripts/validate-v4-adapter-readiness.mjs --all
  PASS
node scripts/validate-v4-d4-acceptance-profiles.mjs --all
  PASS
npm run extension:check
  48 files / 1615 tests PASS; production build and dist parity PASS
npm run extension:e2e
  53 passed / 1 known harness skip; all 12 NowCoder production-dist cases PASS
```

No P2 RED occurred, so the plan's production-change stop gate held and no
NowCoder production code was modified. Root `quality:gate`, root unit/app
E2E/build, candidate commit, exact candidate validator, dist hash receipt,
READY-only run, and every real platform action remain unrun. P2 completion is
offline non-regression evidence only; it is not a NowCoder promotion, D4 PASS,
candidate freeze, live authorization, RC, or release.

Independent P2 review returned `APPROVED` with no HIGH, MEDIUM, or LOW
findings. It confirmed that all current shared production changes are guarded
by LeetCode ownership and that NowCoder host, path, pilot, permissions, E0/E2/E3
identity, and failure semantics remain unchanged. The separate P3 observer
finding remains outside P2 and open for P3.

## 16. P3 observer contract completion (2026-08-16)

P3 closed the MEDIUM that the P1 review had left open for the live observer:
LeetCode E2 now advances only when exactly one result/check stable ID was
observed and that ID equals the confirmed `externalSubmissionId`. A
submit-only action, an ID mismatch, duplicate result/check lifecycles, and any
confirmed-identity replacement after E2 fail closed through E3 and ACK. The
stable ID stays in observer memory only; final D4 evidence remains bounded
counts plus the closed verdict/causal grade.

The initial P3 RED produced `2 failed / 36 passed`: submit-only E2 and
result-ID/E2-ID mismatch were both accepted; duplicate result/check was
already rejected by the existing status cardinality guard. The minimal GREEN
changes closed those failures.

The independent tool review initially returned `REVISE` with 2 HIGH and 2
MEDIUM. All four were fixed:

1. the reducer freezes `e2Identity` at E2 and re-verifies confirmed identity
   (plus LeetCode `statusConfirmedMatch`) before E3 and ACK;
2. a one-shot terminal controller closes the observation context on the first
   terminal failure so no second action can continue;
3. a required candidate receipt binds the candidate SHA, exact dist path, and
   all five artifact hashes and is revalidated and hash-compared at final
   evidence;
4. the persistent entrypoint uses the same LeetCode/NowCoder platform closure
   as the pure projection, and the injected/negative stable-ID and
   coalesced-callback paths are covered.

A final review round found one remaining HIGH: the inner catch could serialize
raw Playwright/SQLite exception text into evidence. All unclassified errors
now map to the fixed `observer_unexpected_failure`; evidence-write failures
emit only the fixed `observer_evidence_write_failed` marker; cleanup errors
are swallowed; the final rethrow carries only the closed terminal reason. The
final independent review returned `APPROVE` with no HIGH or MEDIUM findings.

Exact completed evidence:

```text
npm exec vitest run -- --no-file-parallelism tests/unit/v4LiveObservationObserver.test.ts
  43/43 PASS
npm run typecheck
  PASS
npm exec eslint -- scripts/v4-live-observation-observer.mjs scripts/v4-live-observation.mjs tests/unit/v4LiveObservationObserver.test.ts
  PASS, zero warnings
node --check scripts/v4-live-observation-observer.mjs
  PASS
node --check scripts/v4-live-observation.mjs
  PASS
node scripts/audit-v4-extension-privacy.mjs
  PASS, 0 findings
node scripts/validate-v4-adapter-readiness.mjs --all
  PASS
node scripts/validate-v4-d4-acceptance-profiles.mjs --all
  PASS
git diff --check (observer/tool files)
  PASS (CRLF conversion warnings only)
```

Current observer/tool file SHA-256 values:

```text
scripts/v4-live-observation-observer.mjs  0462386B446B57D35D8E25D57322F8FF8543325D6F7ADDDE71F72A4F4970DBDD
scripts/v4-live-observation.mjs           7672FCF40F4CF1F59033F6D5E5D0F7D30263572C2C7C853F00D437507E4E4EA9
tests/unit/v4LiveObservationObserver.test.ts 1A2CF18CDF6110FA3CC8FE851FAC6FDAA1C377410DA42DE1230CB58EB9F0D615
tests/unit/v4LiveObservationObserver.d.ts   C29A0317ACD1536E1911453D4E945C5ED9B9D57494EB94771AED3CC777B0FD84
```

The legacy `extension:observe` command remains a fail-fast tombstone and the
build-free `extension:observe:d4` remains observation tooling only; no product
candidate was owned or frozen. Root `quality:gate`, root unit/app E2E/build,
`extension:check`, `extension:e2e`, candidate commit, exact candidate
validator, dist hash receipt, READY-only run, and every real platform action
remain unrun. P3 completion does not authorize P5 candidate freeze, P6/P7
observation work, D5, push, PR, deployment, or release. P4 is the next
package.

## 17. P4 independent plan/tool review completion (2026-08-16)

The independent read-only review covered all five contracts: authority,
readiness, observer, privacy, and stop. It confirmed that the authority
profile (`authorized_for_offline_work_only`, `ISOLATED`, `CAPABILITY_BLOCKED`)
claims no live/D5/RC/release authority; LeetCode readiness is aligned to the
ActionEpoch/result-root policy while NowCoder and the three blocked platforms
are unchanged; the P3 observer contract (exact-one stable ID match, frozen
`e2Identity` through E3/ACK, one-shot terminal close, candidate receipt with
five hashes, persistent/pure parity, no raw exception text, bounded final
evidence) is implemented as recorded; the privacy closure rejects unknown
fields before any getter read; and every stop gate remains separately gated
with no silent retry and no relabelling of Route A facts.

The reviewer exhausted its own step limit before executing commands and
returned a conditional verdict requiring four offline verifications. Build ran
all four and each passed, so the retained verdict is `APPROVE` with no HIGH
and no MEDIUM findings:

```text
Get-FileHash -Algorithm SHA256 (four observer/tool files)
  4/4 match the plan section 16 values exactly
npm exec vitest run -- --no-file-parallelism tests/unit/v4LiveObservationObserver.test.ts tests/unit/v4D4AcceptanceProfileValidator.test.ts tests/unit/v4AdapterReadinessValidator.test.ts
  3 files / 77 tests PASS (observer 43, D4 profile validator 11, readiness validator 23;
  this also confirms the section 13 P0A count of 34 = 23 + 11)
git diff --stat -- extension/src
  exactly the six P1-recorded LeetCode files; no NowCoder production file changed
node scripts/validate-v4-adapter-readiness.mjs --all
  PASS
node scripts/validate-v4-d4-acceptance-profiles.mjs --all
  PASS
node scripts/audit-v4-extension-privacy.mjs
  PASS, 0 findings
```

One non-blocking advisory is deferred deliberately: the top-level
`main().catch` still prints `error.stack`, which can include local script
paths (never platform data). It does not violate the privacy contract and is
left unchanged so the frozen P3 observer/tool hashes stay valid; it may be
revisited in a future tool revision.

P4 completion does not authorize P5 candidate freeze, P6/P7 observation work,
D5, push, PR, deployment, or release. Candidate isolation and every later
package still require their own explicit authorization.
