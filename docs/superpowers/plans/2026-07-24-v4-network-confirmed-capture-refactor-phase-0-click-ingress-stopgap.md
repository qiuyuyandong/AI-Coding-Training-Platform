# Capture Protocol V4 Phase 0 Click-Ingress Stopgap Plan

> **Parent plan:**
> [V4 network-confirmed capture master](./2026-07-24-v4-network-confirmed-capture-refactor-master.md)

**Status:** Completed and engineering-verified on 2026-07-24. Phase A remains
separately gated and is not authorized by this result. This phase intentionally
disables click-created waiting and temporarily reduces automatic capture
availability.

**Goal:** Stop the known false-positive class immediately: a UI click may create
only a short-lived E0 diagnostic hint and must never create an active waiting
submission, a bundle, or server traffic.

**Non-claim:** Passing this plan does not mean V4 network confirmation exists,
does not certify NowCoder, and does not create a replacement RC.

## Global Constraints

- Modify no server-side historical attempt, session, or capture event.
- Preserve `captureOutbox`, `captureQuarantine`, installation ID, pairing
  credential, capture endpoint, and delivery metadata.
- Do not add `webRequest`, `webNavigation`, MAIN-world injection, request-body
  access, or platform network assumptions in this phase.
- Do not retain the unsafe V3 path behind a feature flag or fallback.
- Do not describe an E0 UI hint as submitted, accepted, queued, or judging.
- Keep TypeScript strict and follow the repository ban on unsafe casts and
  suppression comments.
- Do not commit, push, or create a PR without explicit authorization.

## Product Behavior At Phase Exit

| Action | Expected V4 Phase 0 behavior |
|---|---|
| Browse a source list or problem page | No waiting state |
| Synthetic/untrusted click | No hint, no waiting |
| Hidden or disabled submit-like control | No hint, no waiting |
| Trusted exact submit-control click | Optional short-lived E0 hint only |
| Keyboard/page-script submission | No capture yet; Phase A/B will provide network evidence |
| Existing completed outbox item | Preserved and delivered by the current pipeline |
| Existing V3 active click intent | Removed by one idempotent migration |
| Popup waiting count | Reads only V4 confirmed submissions; therefore zero in Phase 0 |

---

### Task 0.1: Reconcile the active-plan and release baseline

**Objective:** Make repository authority reflect that the reported NowCoder
false-positive blocks V0 acceptance and that V4 Phase 0 is the next runtime
work. Preserve historical V3 evidence without calling it accepted or released.

**Files:**

- Create: `scripts/validate-v4-plan-authority.mjs`
- Create: `tests/unit/v4PlanAuthorityValidator.test.ts`
- Modify: `docs/superpowers/README.md`
- Modify: `docs/superpowers/plans/2026-07-18-v0-closeout-observation-final-verification.md`
- Modify: `work/handoff-current.md`
- Modify: `AGENTS.md`
- Modify: `docs/architecture.md`
- Modify: `COMPLIANCE.md`

**Dependencies:** Master plan approved for execution. No runtime changes yet.

**Write failing checks first:**

- Add a focused validator test that fails while the index says the closeout plan
  is active and the plan says paused.
- Assert no current authority document says formal observation may continue on
  `2f4f5d8` after the reported click-only defect.

**Implementation boundary:**

- Record the V3 SHA as historical implementation evidence, not a current
  acceptance anchor.
- Mark formal observation and replacement-RC work blocked until V4 reaches the
  required gates.
- Do not edit observation reports or fabricate sessions.

**Verification:**

```powershell
npx vitest run tests/unit/v4PlanAuthorityValidator.test.ts
node scripts/validate-v4-plan-authority.mjs
```

**Completion standard:** The authority hierarchy names this plan as the next
execution entry and contains no active/paused contradiction.

**Explicit non-goals:** No code, migration, fixture, observation, or RC change.

---

### Task 0.2: Lock the click-only regression with failing tests

**Objective:** Prove the current click-to-active-intent behavior is unacceptable
before changing runtime code.

**Files:**

- Create: `tests/unit/extensionUiHint.test.ts`
- Modify: `tests/unit/extensionSubmissionControl.test.ts`
- Modify: `tests/unit/extensionDomesticOjAuth.test.ts`
- Modify: `tests/unit/extensionContentRuntime.test.ts`
- Modify: `tests/unit/extensionBackgroundMessages.test.ts`

**Dependencies:** Task 0.1.

**Write failing tests first:**

- A submit-control click does not emit `SUBMISSION_INTENT_OBSERVED`.
- A synthetic `MouseEvent` with `isTrusted === false` produces no hint.
- A hidden, `disabled`, or `aria-disabled="true"` control produces no hint.
- A NowCoder `[role=button]`, generic button, and exact `提交` label produce no
  hint.
- Only a trusted, visible, enabled `button.btn-submit` with exact visible label
  `保存并提交` is eligible for a NowCoder E0 hint.
- Navigating source list -> NowCoder -> problem page without a qualifying click
  leaves the waiting count at zero.
- E0 cannot be consumed by `consumeVerdictCandidate` or added to the outbox.

**Implementation boundary:** Tests may use minimized synthetic DOM for pure
behavior. They must not be labelled as real NowCoder protocol fixtures or
production characterization.

**Verification:**

```powershell
npx vitest run --config vitest.extension.config.ts tests/unit/extensionUiHint.test.ts tests/unit/extensionSubmissionControl.test.ts tests/unit/extensionContentRuntime.test.ts
```

**Completion standard:** New tests are discovered and fail for the expected
click-created-intent behavior, not because of missing imports or invalid setup.

**Explicit non-goals:** Do not alter implementation before the RED result is
recorded.

---

### Task 0.3: Introduce bounded E0 UI hints and remove click-created intents

**Objective:** Convert the content-script click path into an optional, bounded
diagnostic signal that cannot reach waiting state.

**Files:**

- Create: `extension/src/uiHint.ts`
- Modify: `extension/src/submissionControl.ts`
- Modify: `extension/src/content.ts`
- Modify: `extension/src/contentRuntime.ts`
- Modify: `extension/src/attemptCapture.ts`
- Modify: `extension/src/background.ts`
- Modify: tests from Task 0.2

**Dependencies:** Task 0.2 RED.

**Write failing tests first:** Already established by Task 0.2. Add focused
tests for hint TTL, bounded count, and forbidden promotion if implementation
reveals additional branches.

**Implementation boundary:**

- Add an `isEligibleUiHint` pure decision that receives trusted-event state,
  platform, and target.
- Reject untrusted events before reading target semantics.
- Require visibility and enabled state for every platform hint.
- For NowCoder require `button.btn-submit`, exact `保存并提交`, visible, enabled,
  and not `aria-disabled`.
- If the live NowCoder control no longer satisfies this observed DOM contract,
  zero E0 hints is the required Phase 0 fail-closed result; do not broaden the
  selector before Phase B characterization.
- Replace `runtime.submissionObserved()` in the click path with an E0 hint
  message or no message.
- Store only a minimal bounded hint in `chrome.storage.session`; it may include
  platform, problem identity, trusted document identity supplied by Chrome, and
  timestamp. It may not include page text, code, or account data.
- Expire hints after a short constant defined and tested in one module.
- Remove the content runtime API that creates submission intents from clicks.
- Do not create a compatibility alias that still writes
  `pendingSubmissionIntents`.

**Verification:**

```powershell
npx vitest run --config vitest.extension.config.ts tests/unit/extensionUiHint.test.ts tests/unit/extensionSubmissionControl.test.ts tests/unit/extensionDomesticOjAuth.test.ts tests/unit/extensionContentRuntime.test.ts tests/unit/extensionBackgroundMessages.test.ts
```

**Completion standard:** All click paths are incapable of creating active
pending state; E0 is bounded and session-only; the focused suite is green.

**Explicit non-goals:** No E1 request observation, E2 confirmation, E3 state
machine, MAIN bridge, or network adapter.

---

### Task 0.4: Add the idempotent V3-to-V4 stopgap migration

**Objective:** Remove currently visible click-only waiting records without
touching completed delivery or user data.

**Files:**

- Modify: `extension/src/installation.ts`
- Modify: `extension/src/background.ts`
- Modify: `tests/unit/extensionInstallation.test.ts`
- Modify: `tests/unit/extensionAttemptStorage.test.ts`

**Dependencies:** Task 0.3.

**Write failing tests first:**

- V3 storage containing active, superseded, and expired
  `pendingSubmissionIntents` migrates to protocol V4 with no confirmed
  submissions.
- The migration records the number of removed active click-only intents,
  migration time, source version, target version, and reason.
- Existing `captureOutbox`, quarantine, credential, endpoint, installation ID,
  and V2/V3 migration counters remain byte-equivalent.
- Applying the migration twice does not recount, re-delete, duplicate, or
  rewrite the migration timestamp.
- A simulated worker stop between authoritative V4 write and legacy-key removal
  resumes safely.

**Implementation boundary:**

- Set the extension capture protocol to V4.
- Initialize `confirmedSubmissions` as an empty validated collection.
- Write V4 state first, then remove the V3 pending-intent key.
- Preserve `captureOutbox` even when an item was built under V3.
- Do not inspect or modify the default SQLite database.

**Verification:**

```powershell
npx vitest run --config vitest.extension.config.ts tests/unit/extensionInstallation.test.ts tests/unit/extensionAttemptStorage.test.ts
```

**Completion standard:** Every migration and interruption test passes; a second
initialization is a no-op apart from ordinary maintenance.

**Explicit non-goals:** Do not synthesize E2 from a V3 intent, rebuild old
bundles, or delete server history.

---

### Task 0.5: Make popup waiting semantics confirmed-only

**Objective:** Ensure user-visible waiting can only represent V4 E2 confirmed
submissions, even though Phase 0 has no E2 producer yet.

**Files:**

- Modify: `extension/src/popup.ts`
- Modify: `extension/src/popup.html`
- Modify: `tests/unit/extensionPopup.test.ts`

**Dependencies:** Task 0.4 storage shape.

**Write failing tests first:**

- V3 active intents do not affect waiting count.
- `confirmedSubmissions` controls `等待判题 N`.
- E0 hints are shown only as optional diagnostics and never included in N.
- Migration presentation reports the click-only clear count and reason without
  claiming a successful capture.
- Outbox/quarantine/pairing controls retain their current behavior.

**Implementation boundary:**

- Read waiting only from validated V4 confirmed submissions.
- Add a concise disabled/transition message if needed, such as network
  confirmation not yet enabled, without claiming an error or completed V4.
- Popup remains read-only for capture decisions.

**Verification:**

```powershell
npx vitest run --config vitest.extension.config.ts tests/unit/extensionPopup.test.ts
```

**Completion standard:** Popup tests prove exact separation among hint,
confirmed waiting, outbox, quarantine, and migration state.

**Explicit non-goals:** No manual confirmation button and no user override that
turns a hint into a submission.

---

### Task 0.6: Verify and freeze the stopgap result

**Objective:** Prove Phase 0 removes the unsafe entry without damaging durable
V3 delivery.

**Files:**

- Modify: this plan with actual evidence only after commands run
- Create when executing: a dated Phase 0 evidence report under `work/reports/`
- Modify current-state docs only where actual behavior changed

**Dependencies:** Tasks 0.1-0.5 complete.

**Write failing tests first:** No new production behavior. Add a regression only
if the full gate exposes an uncovered failure.

**Implementation boundary:** Do not proceed to Phase A merely because Phase 0
passes. Present the result and preserve the phase boundary.

**Verification:**

```powershell
npm run lint
npm run typecheck
npm run extension:check
npm run e2e
npm run build
npm run quality:gate
$env:GIT_MASTER='1'; git diff --check
```

Record exact test file/test counts, skips, build page counts, migration result,
and default-database preservation evidence. Commands not run must be marked not
run.

**Completion standard:**

- No click-only pending path exists.
- Existing outbox/quarantine/credential behavior remains verified.
- Popup waiting stays zero without E2.
- Full quality gate passes.
- Independent review has no blocking or important finding.
- The result is labelled `Phase 0 stopgap`, not V4 complete, RC, accepted, or
  released.

**Explicit non-goals:** No real OJ submission, network characterization,
platform promotion, commit, push, PR, formal observation, or V0.5.

## Phase 0 Rollback

- Before deployment, revert the stopgap commit only if explicitly authorized.
- After migration, never restore deleted V3 click intents.
- If the new hint code fails, disable UI hints entirely; do not restore
  click-created waiting.
- Preserve and continue draining completed V3 outbox items.

## Phase 0 Completion Gate

Phase 0 is complete when a qualifying click can produce at most a bounded E0
hint, every old click-only active intent has been removed exactly once, waiting
reads only E2-confirmed state, durable delivery remains green, and all required
checks pass. The only next action is then Phase A Task A0, not a real-platform
adapter implementation.

## Execution Evidence (2026-07-24)

- Tasks 0.1-0.5 implemented with RED-to-GREEN focused tests.
- Independent review found one E0 idle-expiry defect; alarm-driven session
  cleanup and a no-follow-up-click regression test resolved it. Re-review found
  no remaining blocking or important runtime issue.
- `npm run extension:check`: PASS, 20 files / 468 tests, build and dist parity.
- `npm run quality:gate`: PASS, 70 unit files / 1046 passed / 1 Windows
  capability skip, 25 Playwright E2E, 20 extension files / 468 passed, lint,
  disposable migration, curriculum validation, typecheck, and 20/20-page build.
- Full evidence:
  `work/reports/v4-phase-0-click-ingress-stopgap-2026-07-24.md`.
- No real OJ action, Phase A implementation, RC, acceptance, release, commit,
  push, PR, or V0.5 work occurred.
