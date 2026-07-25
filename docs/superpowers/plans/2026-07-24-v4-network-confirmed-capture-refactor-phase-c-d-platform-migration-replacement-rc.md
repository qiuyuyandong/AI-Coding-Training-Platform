# Capture Protocol V4 Phase C-D Platform Migration and Replacement RC Plan

> **Parent plan:**
> [V4 network-confirmed capture master](./2026-07-24-v4-network-confirmed-capture-refactor-master.md)
>
> **Required predecessor:**
> [Phase B NowCoder network pilot](./2026-07-24-v4-network-confirmed-capture-refactor-phase-b-nowcoder-network-pilot.md)

**Status:** Proposed orchestration plan. It is not a substitute for one new
characterization-backed delta plan per platform.

**Goal:** Migrate remaining OJs independently, remove every residual V3 capture
assumption, validate migration/rollback, and freeze a replacement RC only after
real extension and human evidence agree on one implementation SHA.

**Platform order:**

```text
LeetCode -> AtCoder -> Codeforces -> Luogu
```

Order may change only through an explicit product-priority decision recorded in
this plan. Evidence availability may produce a truthful `BLOCKED` result without
blocking unrelated platform waves.

## Global Constraints

- Write a new atomic delta plan before implementing each platform.
- Never copy endpoint, response, field, timeout, or confirmation semantics from
  another platform.
- Every E2 must reference a recent legal E1.
- Every E3 must match the confirmed platform/problem/submission identity.
- Existing DOM verdict status and V4 network readiness remain separate.
- Do not promote authenticated characterization to public-DOM production
  certification.
- Do not run simultaneous writers against shared adapter contracts, registry,
  manifest, background orchestrator, or E2E infrastructure.
- Preserve fail-closed behavior for unavailable platforms.
- Never restore click-only waiting as rollback.
- Do not commit, push, or create a PR without explicit authorization.

## Per-Platform Terminal States

Each wave ends in exactly one state:

- `V4_PRODUCTION`: all repository production evidence gates, real extension
  E2E, real observation, and platform-specific certification pass.
- `V4_EXPERIMENTAL`: characterization and real observation pass but production
  certification evidence is insufficient.
- `V4_BLOCKED`: a required safe E1/E2/E3 signal is missing or contradictory.
- `V4_DISABLED`: product intentionally excludes the adapter.

`PASS`, `APPROVE`, `RC`, `Accepted`, and `Released` remain distinct from these
adapter readiness labels.

---

### Task C0: Create the platform-delta plan template and readiness validator

**Objective:** Ensure every wave contains the same mandatory safety and evidence
sections without forcing the same protocol.

**Files:**

- Create: `docs/superpowers/plans/templates/v4-platform-network-migration-template.md`
- Create: `tests/helpers/v4AdapterReadinessContract.ts`
- Create: `scripts/validate-v4-adapter-readiness.mjs`
- Create: `tests/unit/v4AdapterReadinessValidator.test.ts`
- Modify: `extension/src/adapters/registry.ts`

**Dependencies:** Phase B has a terminal PASS or BLOCKED result and its lessons
are recorded.

**Write failing tests first:**

- Reject a platform record without characterization date/source/tier.
- Reject missing exact request matcher, E2 policy, E3 policy, privacy list,
  Fake OJ cases, real observation, or failure disposition.
- Reject `production` when the platform has only authenticated
  characterization.
- Reject docs/registry disagreement.
- Accept independent experimental and blocked examples.

**Implementation boundary:**

- Registry declares both existing DOM status and V4 network status.
- Validator checks evidence artifacts; it does not infer status from code
  presence or test names.
- Template requires task-level objective, files, dependencies, RED tests,
  implementation boundary, commands, completion, and non-goals.

**Verification:**

```powershell
npx vitest run tests/unit/v4AdapterReadinessValidator.test.ts
node scripts/validate-v4-adapter-readiness.mjs --all
```

**Completion standard:** Valid experimental/blocked fixtures pass and every
premature production fixture fails.

**Explicit non-goals:** No platform implementation.

---

### Task C1: LeetCode V4 migration wave

**Objective:** Migrate LeetCode using exact submission IDs, result navigation,
and response/request evidence characterized from current LeetCode behavior.

**Files:**

- Create before implementation:
  `docs/superpowers/plans/YYYY-MM-DD-v4-leetcode-network-capture-migration.md`
- Create safe fixtures under `tests/fixtures/leetcode/network/`
- Modify only LeetCode adapter files plus shared modules when a reviewed generic
  defect is proven
- Create focused LeetCode unit and extension E2E tests

**Dependencies:** Task C0. Fresh user authorization for real submission
characterization.

**Write failing tests first:**

- Exact current request/confirmation chain.
- `/problems/<slug>/submissions/<id>/` and any characterized SPA navigation.
- Problem URL restored with semantic result tab, without treating a historical
  result as E2.
- `.com`/`.cn` ownership and identity normalization.
- Concurrent same-problem submissions and ID mismatch.
- HTTP/business failure and forged bridge summary.
- Existing duplicate/conflicting verdict panes.

**Implementation boundary:**

- Reuse current page/verdict extractors only after stable submission identity is
  confirmed.
- Do not make active result-tab DOM alone create E2.
- Keep `.com` and `.cn` protocol differences explicit if characterization
  differs.
- Authenticated fixtures can establish at most experimental V4 readiness unless
  the production certification contract is independently met.

**Verification:** Defined in the delta plan; minimum:

```powershell
npm run extension:check
npm run extension:e2e
npm run quality:gate
```

**Completion standard:** Delta plan reaches an independently reviewed
experimental/production/blocked result with same-build real observation.

**Explicit non-goals:** Do not modify AtCoder, Codeforces, Luogu, or NowCoder
protocols.

---

### Task C2: AtCoder V4 migration wave

**Objective:** Add server-confirmed capture to the only currently certified DOM
verdict adapter without confusing its historical certification with V4 network
readiness.

**Files:**

- Create before implementation:
  `docs/superpowers/plans/YYYY-MM-DD-v4-atcoder-network-capture-migration.md`
- Create safe fixtures under `tests/fixtures/atcoder/network/`
- Modify only AtCoder adapter files and approved shared boundaries
- Create focused AtCoder network/E2E tests

**Dependencies:** Task C1 terminal result and fresh characterization.

**Write failing tests first:**

- Exact task/contest submission request and confirmation behavior.
- Redirect/result page stable ID extraction if observed.
- Existing `#judge-status` final taxonomy after E2 only.
- Public historical submission page never creates E2.
- Contest/task identity mismatch and cross-contest anchor spoofing.
- Queue/judging/direct-final variants represented by evidence.

**Implementation boundary:**

- Preserve the existing public-DOM certification corpus byte-for-byte unless a
  separately documented fixture correction is required.
- Do not call AtCoder V4 production merely because existing DOM status is
  production.
- Do not infer form/redirect behavior from public HTML alone if server acceptance
  semantics remain unobserved.

**Verification:** Defined in delta plan; minimum `extension:check`, extension
E2E, aggregate quality gate, public fixture certification, and real observation.

**Completion standard:** Explicit V4 readiness result with no impact on the
truth of historical Phase 0 certification.

**Explicit non-goals:** No other platform changes.

---

### Task C3: Codeforces V4 migration wave

**Objective:** Characterize and implement Codeforces independently rather than
retaining its current generic visible-verdict selectors as a submission proof.

**Files:**

- Create before implementation:
  `docs/superpowers/plans/YYYY-MM-DD-v4-codeforces-network-capture-migration.md`
- Create safe fixtures under `tests/fixtures/codeforces/network/`
- Modify only Codeforces adapter files and approved shared boundaries
- Create focused tests

**Dependencies:** Task C2 terminal result and required user/public evidence.

**Write failing tests first:**

- Exact request/confirmation protocol after characterization.
- Contest/problem identity and stable submission ID.
- Result-list rows for another user/submission cannot create E2/E3.
- Polling/list updates cannot consume the wrong concurrent submission.
- Non-final queue/testing states remain optional phases.
- Rejected login/CSRF/rate-limit behavior remains non-confirmed.

**Implementation boundary:**

- Never scan an entire status table/body for an arbitrary final token.
- Require stable submission identity or mark the adapter blocked.
- Do not use account identity as a correlator or retain it in fixtures.

**Verification:** Defined in delta plan with focused unit, Fake OJ, real
extension E2E, real observation, and quality gate.

**Completion standard:** Explicit V4 readiness result with no nearest-row or
latest-result guess.

**Explicit non-goals:** No Luogu implementation.

---

### Task C4: Luogu V4 migration wave

**Objective:** Reassess Luogu only with new network/server-confirmation evidence,
while preserving its historical public-DOM BLOCKED artifact.

**Files:**

- Create before implementation:
  `docs/superpowers/plans/YYYY-MM-DD-v4-luogu-network-capture-migration.md`
- Create safe fixtures under `tests/fixtures/luogu/network/`
- Modify only Luogu adapter files and approved shared boundaries
- Create focused tests

**Dependencies:** Task C3 terminal result and newly available evidence.

**Write failing tests first:**

- Exact request/confirmation protocol if characterized.
- `/record/<id>` identity must match the confirmed submission.
- Historical records and public problem pages cannot create E2.
- Existing semantic `评测状态` row is accepted as E3 only after identity match.
- Multiple/conflicting problem anchors or verdict rows fail closed.
- Platform-specific submit anchor remains E0 only.

**Implementation boundary:**

- Do not rewrite or delete the Phase 0B4 blocker artifact.
- Authenticated characterization cannot satisfy the public-DOM production gate.
- If stable server confirmation cannot be safely observed, end `V4_BLOCKED`.

**Verification:** Defined in delta plan, including historical artifact identity
checks and current quality gate.

**Completion standard:** Honest V4 readiness result; BLOCKED is acceptable.

**Explicit non-goals:** Do not create a new design decision accepting private
characterization as production evidence.

---

### Task C5: Remove migration scaffolding and audit cross-platform isolation

**Objective:** Ensure migrated adapters share infrastructure but not protocol
assumptions, and no V3 click/pending code remains reachable.

**Files:**

- Modify: `extension/src/platforms.ts` compatibility exports as appropriate
- Modify: `extension/src/contentRuntime.ts`
- Modify: `extension/src/attemptCapture.ts`
- Modify: `extension/src/attemptStorage.ts`
- Modify: adapter registry and shared modules
- Create: `tests/unit/extensionV4Isolation.test.ts`
- Modify: architecture/compliance/runbook docs

**Dependencies:** Tasks C1-C4 terminal results.

**Write failing tests first:**

- A platform request is interpreted only by its owner adapter.
- Same raw submission ID on two platforms produces distinct stable keys and
  capture identities.
- One platform's response/status field is rejected by every other adapter.
- Disabling one adapter leaves other confirmed/outbox records intact.
- No code path writes `pendingSubmissionIntents` or emits
  `SUBMISSION_INTENT_OBSERVED` from a click.
- No production module contains a synthetic Fake OJ adapter/status claim.

**Implementation boundary:**

- Remove compatibility wrappers only after all call sites/tests migrate.
- Keep historical bundle parsing and server compatibility.
- Do not collapse platform policies into one permissive generic parser.

**Verification:**

```powershell
npx vitest run --config vitest.extension.config.ts tests/unit/extensionV4Isolation.test.ts
npm run extension:check
npm run extension:e2e
npm run quality:gate
```

**Completion standard:** Isolation suite passes, stale-symbol search is clean,
and every adapter retains an explicit readiness result.

**Explicit non-goals:** No RC freeze yet.

---

### Task D1: Validate migration, restart, update, and rollback behavior

**Objective:** Prove V4 can be deployed and disabled without data loss, duplicate
attempts, or reactivation of unsafe click state.

**Files:**

- Create: `tests/unit/extensionV4UpgradeMatrix.test.ts`
- Create: `tests/extension-e2e/capture-v4-upgrade.spec.ts`
- Modify: installation/storage/orchestrator modules only for proven defects
- Create: dated migration/rollback report under `work/reports/`

**Dependencies:** Task C5.

**Write failing tests first:**

- Fresh install.
- V2 queue -> V4.
- V3 click intents -> V4.
- V3 outbox/quarantine/credential -> V4.
- V4 E1 session evidence lost on browser restart.
- V4 E2 preserved on browser restart/update.
- Extension reload during E1/E2/E3/outbox stages.
- Adapter kill switch with confirmed submissions.
- Downgrade attempt cannot resurrect V3 click waiting.
- Repeated E3/API replay remains one SQLite attempt.

**Implementation boundary:**

- Rollback means disable adapter/capture and retain durable state.
- No direct Chrome profile, LevelDB, or default SQLite editing.
- Cleanup is link/reparse-point safe.

**Verification:**

```powershell
npx vitest run --config vitest.extension.config.ts tests/unit/extensionV4UpgradeMatrix.test.ts
npm run extension:e2e -- tests/extension-e2e/capture-v4-upgrade.spec.ts
npm run quality:gate
```

**Completion standard:** All upgrade/interruption/disable/replay cases pass and
the report records actual counts and storage keys.

**Explicit non-goals:** No destructive downgrade or user-data deletion.

---

### Task D2: Perform the V4 privacy and permission audit

**Objective:** Establish that the final target artifact collects no more than the
approved safe evidence contract.

**Files:**

- Create: `scripts/audit-v4-extension-privacy.mjs`
- Create: `tests/unit/v4ExtensionPrivacyAudit.test.ts`
- Create: dated privacy report under `work/reports/`
- Modify code/fixtures only for proven audit findings

**Dependencies:** Task D1.

**Write failing tests first:**

- Reject forbidden storage/log/fixture/error keys.
- Reject requestBody use outside explicitly approved adapter filters.
- Reject broad host permissions, `webRequestBlocking`, `debugger`, DevTools,
  remote code, or test-only manifest paths.
- Verify local/session access restrictions when supported.
- Verify Fake OJ fixtures are synthetic and real fixtures carry provenance.

**Implementation boundary:** Static audit supplements, not replaces, code review
and real extension tests.

**Verification:**

```powershell
npx vitest run tests/unit/v4ExtensionPrivacyAudit.test.ts
node scripts/audit-v4-extension-privacy.mjs
npm run extension:check
```

**Completion standard:** Audit passes with zero forbidden finding and every
permission has a documented product reason.

**Explicit non-goals:** No hosted privacy policy or Phase 7 behavior.

---

### Task D3: Freeze one replacement implementation candidate

**Objective:** Create an immutable implementation SHA only after all engineering
and real-platform prerequisites are complete.

**Files:** All classified task-owned V4 source, tests, fixtures, scripts, and
current-state documents; exclude reports that would create SHA self-reference
unless the release contract explicitly allows them in the later evidence commit.

**Dependencies:** Tasks C0-C5 and D1-D2; all target adapter results recorded;
explicit user authorization to commit.

**Write failing checks first:**

- Dirty-path classifier rejects database files, generated dist, temporary
  profiles, Playwright artifacts, raw transcripts, environment files, and
  unrelated user changes.
- RC validator rejects click-only symbols, missing adapter states, failed
  extension E2E, failed privacy report, or docs disagreement.

**Implementation boundary:**

- Inspect status, full diff, staged diff, and recent log.
- Stage explicit task-owned paths only.
- Run all gates before commit.
- Never amend, push, or create a PR without separate authorization.

**Verification:**

```powershell
npm run lint
npm run db:migrate
npm run test
npm run typecheck
npm run e2e
npm run extension:check
npm run extension:e2e
npm run build
npm run quality:gate
node scripts/audit-v4-extension-privacy.mjs
node scripts/validate-v4-adapter-readiness.mjs --all
$env:GIT_MASTER='1'; git diff --check
```

**Completion standard:** All commands pass with exact counts recorded, default
database metadata is preserved, independent code review approves, and an
authorized commit creates one immutable candidate SHA.

**Explicit non-goals:** A committed candidate is not yet RC-accepted, V0
accepted, or released.

---

### Task D4: Execute same-SHA real observations

**Objective:** Observe every target adapter on the exact candidate build without
runtime changes.

**Files:**

- Create/update dated per-platform reports under `work/reports/`
- Update observation validator inputs
- Do not modify runtime source

**Dependencies:** Task D3 immutable candidate and explicit user authorization
for each real platform action.

**Required evidence:**

- Browse-only negative flow.
- Fresh natural submission by the user.
- E1 observed with waiting unchanged.
- E2 confirmed with waiting incremented once.
- E3 matching and finalizing once.
- ACK/outbox/quarantine outcome.
- Local Training result.
- Any unmatched, ambiguous, false-positive, false-negative, or platform failure.

**Implementation boundary:** A blocking runtime fix invalidates every observation
on the candidate and returns to Task D3 with a new SHA. Never edit reports to
bridge different builds.

**Verification:** Run observation validators and compare the exact candidate SHA
in every report.

**Completion standard:** All required target-platform observations pass or the
candidate is rejected. User/calendar-dependent evidence remains pending until it
actually occurs.

**Explicit non-goals:** No synthetic observation dates or participants.

---

### Task D5: Run same-SHA F1-F4 and request explicit acceptance

**Objective:** Separate engineering quality from product acceptance and close the
replacement candidate honestly.

**Files:**

- Create/update final verification and exit reports under `work/reports/`
- Reconcile `AGENTS.md`, README, architecture, compliance, docs index, runbook,
  and handoff only after evidence exists
- Modify no runtime source

**Dependencies:** Task D4 complete.

**Verification lanes:**

- F1: plan compliance and task/evidence completeness.
- F2: code quality, privacy, security, concurrency, migration, rollback.
- F3: hands-on real extension QA on the candidate SHA.
- F4: scope, documentation, fixtures, statuses, and release-contract fidelity.

All four must APPROVE the same candidate. Then present evidence to the user and
obtain explicit acceptance.

**Implementation boundary:** Do not call an engineering PASS an RC, do not call
an RC accepted, and do not call acceptance public release.

**Verification:**

```powershell
node scripts/validate-v4-adapter-readiness.mjs --all
node scripts/audit-v4-extension-privacy.mjs
npm run quality:gate
```

Run the repository's final V0/release validator only after its contract has been
updated and tested for the new implementation SHA without weakening historical
two-commit guarantees.

**Completion standard:** F1-F4 all approve, the user explicitly accepts, final
status documents agree, and any authorized final evidence commit passes the
release validator.

**Explicit non-goals:** No automatic push, PR, deployment, Chrome Web Store
publication, Public Beta, or V0.5 implementation.

## Suggested Commit Sequence

Future commits should remain platform- and gate-scoped:

1. readiness validator/template;
2. LeetCode characterization and adapter;
3. LeetCode extension E2E/observation evidence;
4. AtCoder characterization and adapter;
5. AtCoder extension E2E/observation evidence;
6. Codeforces characterization and adapter;
7. Codeforces extension E2E/observation evidence;
8. Luogu characterization/adapter or BLOCKED evidence;
9. cross-platform isolation and stale-scaffolding removal;
10. upgrade/rollback and privacy gates;
11. authorized implementation candidate;
12. authorized final evidence/status commit after acceptance.

No commit is authorized by this list.

## Phase C-D Completion Gate

This plan completes only when each platform has a truthful terminal V4 status,
all target adapters pass their required real extension and human evidence, the
upgrade/rollback/privacy gates pass, one immutable candidate receives same-SHA
F1-F4 approval, and the user explicitly accepts it. Until then there is no
replacement accepted V0 and V0.5 must not start.
