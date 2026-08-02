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

### Task C2 entry result

- **Status:** terminal `V4_BLOCKED` on 2026-08-02; no network adapter was
  implemented.
- **Delta plan:**
  `docs/superpowers/plans/2026-07-31-v4-atcoder-network-capture-migration.md`.
- **Preservation baseline:** all nine files under
  `tests/fixtures/atcoder/` have recorded SHA-256 values in the delta plan.
  The four historical certification suites pass 171/171, and the readiness
  CLI passes before C2 characterization.
- **Plan review:** revision 2 independently `APPROVED` on 2026-07-31 after two
  reject-and-correct rounds; no remaining findings.
- **Preflight:** the pre-storage AtCoder contest-path privacy gate passes 331
  focused tests; `extension:check` passes 39 files / 1,285 tests; the exact
  production-dist hashes are frozen in
  `work/reports/v4-atcoder-c2-preflight-2026-07-31.md`.
- **Real observation:** two natural `abc001_1` submissions were safely
  corroborated (`78058928` and `78059304`). The ready-gated third window kept a
  live watcher active through the second submission, but the extension retained
  exactly zero records while the browser navigated from `/submit` to
  `/submissions/me`.
- **Root cause:** AtCoder uses a traditional `main_frame` form navigation.
  Chrome's official `webRequest` contract omits `documentId` for frame
  navigation, and the reviewed observer correctly rejects such requests as
  `missing_document_id`. The landing path has no stable numeric submission ID;
  body/query/DOM-row/tab/time inference remains forbidden.
- **Evidence:**
  `work/reports/v4-atcoder-c2-blocker-2026-08-02.md`.
- **Boundary:** AtCoder's existing production DOM certification remains
  authoritative for its historical scope; it does not establish V4 network
  readiness.
- **Next gate:** C3 may begin after terminal blocker documentation, registry,
  readiness manifest, historical hashes, and current handoff all verify. An
  AtCoder retry requires a separately reviewed scalar bridge or an observable
  platform protocol change.

---

### Task C3: Codeforces V4 migration wave

**Execution result (2026-08-02):** terminal `V4_BLOCKED`.

- Revision 2 of
  `2026-08-02-v4-codeforces-network-capture-migration.md` was independently
  `APPROVED`; its privacy prerequisite and exact-build preflight passed.
- One ready-gated natural submission moved from `/problemset/submit/` to
  `/problemset/status`. The user confirmed the submission entered the status
  page, while the extension retained zero records and zero navigation
  witnesses before explicit stop.
- Chrome omits `webRequest.documentId` for frame navigation. The approved
  observer therefore rejects the main-frame POST, and the landing path exposes
  no stable numeric submission ID or exact contest/problem identity.
- No Codeforces network adapter or fixture was created. Status-row/account/
  latest/highest/nearest-time inference remains forbidden.
- Evidence:
  `work/reports/v4-codeforces-c3-blocker-2026-08-02.md`.
- Next gate: C4 Luogu may begin only after readiness, registry, plans, reports,
  current handoff, and terminal gates agree. A Codeforces retry requires a
  separately reviewed scalar bridge or platform protocol change.

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

**Terminal status (2026-08-02):** Revision 3 of
`2026-08-02-v4-luogu-network-capture-migration.md` was explicitly approved and
executed to `V4_BLOCKED`. One natural P1001 submission produced three safe E1
lifecycle records for the exact problem-submit XHR and a later numeric record
landing, but browser-owned document IDs prove a cross-document transition and
no approved witness binds the two identities. A sanitized fixture and terminal
reports were created; no Luogu network adapter was implemented. C5 is the next
sequential task after terminal gates agree.

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

**Execution status (2026-08-02):** Complete on the uncommitted working tree.
The isolation suite was written RED first, then the orchestrator's V3
submission-intent and verdict-fallback events were removed. Initialization
retains only the read/count/delete migration boundary for the legacy key;
completed historical outbox bundles remain compatible. Compatibility exports
in `platforms.ts` remain because active call sites still use them, matching the
implementation boundary against premature wrapper removal.

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

**Completion evidence:**

- `tests/unit/extensionV4Isolation.test.ts` covers owner-only request parsing,
  cross-platform raw-ID namespacing, durable-state preservation, explicit
  terminal readiness, stale runtime symbols, and Fake OJ registry exclusion.
- Production source and built-dist searches contain zero
  `v3_submission_intent_recorded` and zero `SUBMISSION_INTENT_OBSERVED`.
  Remaining `pendingSubmissionIntents` references are migration-only
  read/count/delete operations; no property write remains.
- Readiness CLI, extension gates, E2E, quality gate, and final exact counts are
  recorded in `work/reports/v4-phase-c-c5-closeout-2026-08-02.md`.

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

## Task C0 execution result (closeout seam)

- **Status:** PASS for the validator and template scaffold only. No platform
  implementation, no real-observation evidence, no replacement candidate.
- **Files created (uncommitted working tree on `feature/v1-followup`):**
  - `tests/helpers/v4AdapterReadinessContract.ts` (type + runtime shape)
  - `tests/helpers/v4AdapterReadinessContract.cjs` (plain-Node runtime so the
    CLI does not need a TypeScript loader)
  - `tests/types/v4AdapterReadiness.d.ts` (ambient declarations for the `.mjs`
    and `.cjs` entry points)
  - `scripts/validate-v4-adapter-readiness.mjs` (CLI; `--all` is the only
    accepted argument; exit codes `0` PASS / `1` failures / `2` usage)
  - `docs/superpowers/specs/v4-adapter-readiness.json` (the canonical
    readiness manifest)
  - `tests/unit/v4AdapterReadinessValidator.test.ts` (20 cases covering
    registry/document disagreement, characterization source and real
    observation existence, repo-relative path safety, status ladder
    including `disabled`, comment-masking, and authenticated-as-production
    rejection)
  - `docs/superpowers/plans/templates/v4-platform-network-migration-template.md`
    (every future C1-C4 delta plan must be derived from this template)
- **Files modified:**
  - `extension/src/adapters/registry.ts` (docblock refresh only; no behavior
    change)
- **Evidence:**
  - `npx vitest run tests/unit/v4AdapterReadinessValidator.test.ts`
    → 17/17 PASS on 2026-07-30.
  - `node scripts/validate-v4-adapter-readiness.mjs --all`
    → `V4 adapter readiness PASS` on 2026-07-30.
  - `npm run typecheck` → PASS.
  - `npm run quality:gate` → EXIT 0 on 2026-07-30 (lint, disposable
    `db:migrate`, `curriculum:validate`, `test` 93 files / 1936 passed /
    1 Windows capability skip, typecheck, `e2e` 25/25, `extension:check`
    38 files / 1191 tests, `extension:e2e` 46/46 on this run, `build`
    PASS). The Phase A 1 service-worker-restart skip remains authoritative
    test-harness seam, not a C0 regression.
- **Linter and security review of C0:** independent reviewer previously
  flagged 5 issues (HIGH fabricated evidence paths, HIGH missing `disabled`
  terminal state, MEDIUM regex-based registry parsing, MEDIUM bare `node`
  invocation against a TS helper, MEDIUM template missing implementation
  boundary). All five were corrected in this implementation:
  - Evidence paths are now checked against the repo root; tests cover
    missing, absolute, and `..` escape paths.
  - `disabled` is added to `V4NetworkStatus`, accepted by the manifest
    with `disableReason`, and tested for both required and missing
    variants.
  - The CLI uses a brace-aware line parser that strips single-line
    comments before matching `v4NetworkStatus`; a regression test feeds
    a comment that quotes the wrong status and verifies PASS.
  - The CLI requires `tests/helpers/v4AdapterReadinessContract.cjs` via
    `createRequire(repoRoot)`, so `node scripts/validate-v4-adapter-
    readiness.mjs --all` works without any TypeScript loader, matching
    the canonical command in this plan.
  - The template adds an `Implementation Boundary` section listing which
    shared modules may be modified and which cross-platform inferences
    are forbidden.
- **Honest verdict:** `C0 engineering PASS`. C1 (LeetCode), C2 (AtCoder),
  C3 (Codeforces), C4 (Luogu), C5 (scaffolding cleanup), D1-D5 are not
  authorized by this seam and remain pending fresh user authorization
  and real-platform evidence. NowCoder's existing `experimental` V4
  status continues to be governed by Phase B's terminal closeout and the
  2026-07-29 E3 ingress repair (`c26c578`); it is not promoted by C0.
- **No commit was performed.** Working tree dirty; no push; no PR.

### Post-C0 contract correction discovered during C1

C1 candidate observations exposed an intermediate state that the original C0
ladder could not represent: an adapter can have a characterized, attached,
automatically verified policy while its required same-build real observation
is still failing. Labelling that state `experimental` overstated readiness;
labelling it `uncharacterized` hid the implemented policy. The contract now
adds non-terminal `candidate`, requires every non-disabled record to declare an
`endpointDriftDisposition`, and recorded LeetCode as `candidate` at that
observation seam. The later v6 real-chain closure supersedes only that
intermediate LeetCode status with terminal C1 `V4_EXPERIMENTAL`; this remains a
readiness-model correction and is not authorization to skip the C2 entry gate.

### Task C1 execution result

- **Status:** `V4_EXPERIMENTAL` for LeetCode.cn on the uncommitted
  `feature/v1-followup` working tree.
- **Real observation:** production adapter `v4-leetcode-network-6` captured
  fresh submission `cn/739108591`, finalized it once with `Wrong Answer`,
  delivered one bundle, and projected exactly 4 capture events, 1 session, and
  1 non-voided training attempt in the disposable SQLite database.
- **Root cause:** localhost was healthy. The current LeetCode UI used a
  trusted submit click plus GraphQL POST and exact
  `/submissions/api/{runtime|memory}_distribution/<id>/` result paths, while
  the original candidate recognized only a legacy submit/check pair.
  Subsequent real evidence also exposed a scoped problem-slug API mismatch and
  tombstone/confirmation replay defects; all are covered by v6 regressions.
- **Privacy:** no request/response body, code, headers, cookies, credentials,
  account identifier, or full problem statement was read or retained.
- **Evidence:**
  `work/reports/v4-leetcode-c1-closeout-2026-07-30.md`.
- **Final gates:** readiness CLI PASS; readiness tests 20/20; full unit tests
  2009 passed with 1 Windows capability skip; application E2E 25/25;
  extension unit tests 1261/1261; extension E2E 48 passed with 1 known
  harness skip; production build PASS.
- **Boundary:** authenticated evidence caps LeetCode at `experimental`.
  `.com` remains without its own real observation, and C1 is not production
  certification, RC, acceptance, release, or permission to skip C2's
  independent characterization.
- **No commit was performed.** Working tree dirty; no push; no PR.

## Phase C-D Completion Gate

This plan completes only when each platform has a truthful terminal V4 status,
all target adapters pass their required real extension and human evidence, the
upgrade/rollback/privacy gates pass, one immutable candidate receives same-SHA
F1-F4 approval, and the user explicitly accepts it. Until then there is no
replacement accepted V0 and V0.5 must not start.
